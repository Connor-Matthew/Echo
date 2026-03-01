import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { McpServerConfig, McpServerStatus } from "../../src/shared/contracts";

export type McpClientStatus = "connecting" | "ready" | "error" | "disabled";

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type McpClientState = {
  status: McpClientStatus;
  tools: McpTool[];
  toolCount: number;
  resourceCount: number;
  resourceTemplateCount: number;
  error?: string;
  connectedAt?: string;
};

type RpcResponse = {
  id?: string;
  result?: unknown;
  error?: { message?: string; code?: number };
};

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const RPC_TIMEOUT_MS = 15000;
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 3;

export class McpClient {
  private config: McpServerConfig;
  private state: McpClientState;
  private child: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = "";
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private onStateChange: (state: McpClientState) => void;

  constructor(config: McpServerConfig, onStateChange: (state: McpClientState) => void) {
    this.config = config;
    this.onStateChange = onStateChange;
    this.state = {
      status: config.enabled ? "connecting" : "disabled",
      tools: [],
      toolCount: 0,
      resourceCount: 0,
      resourceTemplateCount: 0
    };
  }

  getState(): McpClientState {
    return this.state;
  }

  toServerStatus(): McpServerStatus {
    return {
      name: this.config.name,
      authStatus: this.config.authStatus,
      toolCount: this.state.toolCount,
      resourceCount: this.state.resourceCount,
      resourceTemplateCount: this.state.resourceTemplateCount
    };
  }

  async connect(): Promise<void> {
    if (!this.config.enabled || this.destroyed) {
      return;
    }
    if (this.config.transportType === "streamable_http") {
      await this.connectHttp();
    } else if (this.config.transportType === "stdio") {
      this.connectStdio();
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.rejectAllPending(new Error("MCP client destroyed."));
    if (this.child && !this.child.killed) {
      this.child.kill("SIGTERM");
      this.child = null;
    }
  }

  private setState(next: Partial<McpClientState>): void {
    this.state = { ...this.state, ...next };
    this.onStateChange(this.state);
  }

  private nextId(): string {
    this.requestCounter += 1;
    return `echo-mcp-${this.requestCounter}`;
  }

  private rejectAllPending(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  // --- stdio transport ---

  private connectStdio(): void {
    if (this.destroyed) return;

    const parts = this.config.endpoint.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    if (!command) {
      this.setState({ status: "error", error: "stdio endpoint is empty." });
      return;
    }

    this.setState({ status: "connecting" });

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(command, args, { stdio: "pipe" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to spawn process.";
      this.setState({ status: "error", error: msg });
      this.scheduleReconnect();
      return;
    }

    this.child = child;
    this.stdoutBuffer = "";

    child.stdout.on("data", (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString("utf-8");
      this.drainStdoutBuffer();
    });

    child.stderr.on("data", () => {
      // stderr is informational; don't treat as fatal
    });

    child.on("error", (err) => {
      this.setState({ status: "error", error: err.message });
      this.rejectAllPending(err);
      this.scheduleReconnect();
    });

    child.on("close", () => {
      if (this.destroyed) return;
      this.rejectAllPending(new Error("MCP stdio process exited."));
      this.setState({ status: "error", error: "Process exited unexpectedly." });
      this.scheduleReconnect();
    });

    void this.initializeStdio();
  }

  private writeStdio(envelope: unknown): void {
    if (!this.child?.stdin.writable) return;
    try {
      this.child.stdin.write(`${JSON.stringify(envelope)}\n`);
    } catch {
      // handled by close/error events
    }
  }

  private drainStdoutBuffer(): void {
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as RpcResponse;
        this.handleRpcResponse(parsed);
      } catch {
        // ignore non-JSON lines
      }
    }
  }

  private handleRpcResponse(parsed: RpcResponse): void {
    if (!parsed.id) return;
    const pending = this.pendingRequests.get(parsed.id);
    if (!pending) return;
    this.pendingRequests.delete(parsed.id);
    clearTimeout(pending.timer);
    if (parsed.error?.message) {
      pending.reject(new Error(parsed.error.message));
    } else {
      pending.resolve(parsed.result);
    }
  }

  private rpcCall(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId();
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, RPC_TIMEOUT_MS);
      this.pendingRequests.set(id, { resolve, reject, timer });
      this.writeStdio({ jsonrpc: "2.0", id, method, params });
    });
  }

  private async initializeStdio(): Promise<void> {
    try {
      await this.rpcCall("initialize", {
        protocolVersion: "2024-11-05",
        clientInfo: { name: "echo-desktop", version: "1.0.0" },
        capabilities: {}
      });
      this.writeStdio({ jsonrpc: "2.0", method: "notifications/initialized" });
      await this.fetchTools();
      this.reconnectAttempts = 0;
      this.setState({ status: "ready", connectedAt: new Date().toISOString() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Initialization failed.";
      this.setState({ status: "error", error: msg });
      this.scheduleReconnect();
    }
  }

  private async fetchTools(): Promise<void> {
    try {
      const result = (await this.rpcCall("tools/list", {})) as {
        tools?: Array<{ name?: string; description?: string; inputSchema?: unknown }>;
      } | null;
      const tools: McpTool[] = (result?.tools ?? [])
        .filter((t) => typeof t.name === "string" && t.name)
        .map((t) => ({ name: t.name as string, description: t.description, inputSchema: t.inputSchema }));
      this.setState({ tools, toolCount: tools.length });
    } catch {
      // tools/list is optional; don't fail the connection
    }
  }

  // --- HTTP transport ---

  private async connectHttp(): Promise<void> {
    if (this.destroyed) return;
    this.setState({ status: "connecting" });

    const url = this.config.endpoint.trim();
    if (!url) {
      this.setState({ status: "error", error: "HTTP endpoint is empty." });
      return;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: this.nextId(),
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            clientInfo: { name: "echo-desktop", version: "1.0.0" },
            capabilities: {}
          }
        }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      await this.fetchToolsHttp(url);
      this.reconnectAttempts = 0;
      this.setState({ status: "ready", connectedAt: new Date().toISOString() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "HTTP connection failed.";
      this.setState({ status: "error", error: msg });
      this.scheduleReconnect();
    }
  }

  private async fetchToolsHttp(url: string): Promise<void> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId(), method: "tools/list", params: {} }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS)
      });
      if (!response.ok) return;
      const parsed = (await response.json()) as { result?: { tools?: unknown[] } };
      const rawTools = parsed.result?.tools ?? [];
      const tools: McpTool[] = rawTools
        .filter((t): t is { name: string } => Boolean(t && typeof (t as { name?: unknown }).name === "string"))
        .map((t) => ({ name: t.name, description: (t as { description?: string }).description }));
      this.setState({ tools, toolCount: tools.length });
    } catch {
      // optional
    }
  }

  // --- tool call ---

  async callTool(toolName: string, toolInput: unknown): Promise<unknown> {
    if (this.state.status !== "ready") {
      throw new Error(`MCP client "${this.config.name}" is not ready.`);
    }
    if (this.config.transportType === "stdio") {
      return this.rpcCall("tools/call", { name: toolName, arguments: toolInput });
    }
    if (this.config.transportType === "streamable_http") {
      return this.callToolHttp(toolName, toolInput);
    }
    throw new Error(`Unsupported transport: ${this.config.transportType}`);
  }

  private async callToolHttp(toolName: string, toolInput: unknown): Promise<unknown> {
    const url = this.config.endpoint.trim();
    const timeoutSec = this.config.toolTimeoutSec ?? 30;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.nextId(),
        method: "tools/call",
        params: { name: toolName, arguments: toolInput }
      }),
      signal: AbortSignal.timeout(timeoutSec * 1000)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const parsed = (await response.json()) as { result?: unknown; error?: { message?: string } };
    if (parsed.error?.message) {
      throw new Error(parsed.error.message);
    }
    return parsed.result;
  }

  // --- reconnect ---

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) {
        void this.connect();
      }
    }, RECONNECT_DELAY_MS * this.reconnectAttempts);
  }
}
