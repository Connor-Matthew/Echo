import { app, type IpcMainInvokeEvent } from "electron";
import { spawnCodex } from "../../codex/codex-runtime";
import type {
  AppSettings,
  ChatStreamEvent,
  ChatStreamRequest,
  ToolCall
} from "../../../src/shared/contracts";
import {
  extractGenericUsage,
  logProviderUsage,
  logProviderUsageMissing
} from "../stream-parser-utils";

type StreamSender = IpcMainInvokeEvent["sender"];

type RunnerDeps = {
  sendStreamEvent: (sender: StreamSender, streamId: string, event: ChatStreamEvent) => void;
  logChatRequestPayload: (
    streamId: string,
    providerType: AppSettings["providerType"],
    source: string,
    requestPayload: unknown
  ) => void;
  formatMessagesForAcpTurn: (payload: ChatStreamRequest) => string;
  buildAcpMcpConfigOverrides: (
    settings: AppSettings,
    enabledMcpServerIds?: string[]
  ) => { mcp_servers: Record<string, { enabled: boolean }> } | null;
  createId: () => string;
};

export const createStreamCodexAcp = (deps: RunnerDeps) => {
  return async (
    sender: StreamSender,
    streamId: string,
    payload: ChatStreamRequest,
    _apiKey: string,
    signal: AbortSignal,
    onDelta?: () => void
  ) => {
    const turnInput = deps.formatMessagesForAcpTurn(payload);
    if (!turnInput) {
      throw new Error("No message content to send.");
    }
    const acpConfigOverrides = deps.buildAcpMcpConfigOverrides(
      payload.settings,
      payload.enabledMcpServerIds
    );

    const child = spawnCodex(["app-server", "--listen", "stdio://"]);

    let stderr = "";
    let stdoutBuffer = "";
    let doneSent = false;
    let settled = false;
    let emittedAnyDelta = false;
    let sawUsage = false;
    let usageMissingLogged = false;

    const reportUsageMissing = (reason: string, providerPayload: unknown, rawData: string) => {
      if (sawUsage || usageMissingLogged) {
        return;
      }
      usageMissingLogged = true;
      logProviderUsageMissing(
        streamId,
        payload.settings.providerType,
        "acp-rpc",
        reason,
        providerPayload,
        rawData
      );
    };

    const emitDone = () => {
      if (!doneSent) {
        doneSent = true;
        deps.sendStreamEvent(sender, streamId, { type: "done" });
      }
    };

    const emitError = (message: string) => {
      deps.sendStreamEvent(sender, streamId, { type: "error", message });
    };
    const emitToolCall = (toolCall: ToolCall) => {
      deps.sendStreamEvent(sender, streamId, { type: "status", source: "mcp", toolCall });
    };

    const initializeId = deps.createId();
    const chatStartId = deps.createId();
    const turnStartId = deps.createId();

    const writeRpc = (envelope: unknown) => {
      if (!child.stdin.writable) {
        return;
      }
      try {
        child.stdin.write(`${JSON.stringify(envelope)}\n`);
      } catch {
        // Ignore write errors; process close/error handlers surface the final status.
      }
    };

    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    };

    const settleResolve = (resolve: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };

    const settleReject = (reject: (error: Error) => void, error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const onAbort = () => {
      if (child.killed) {
        return;
      }
      child.kill("SIGTERM");
    };

    if (signal.aborted) {
      child.kill("SIGTERM");
      throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    }
    signal.addEventListener("abort", onAbort, { once: true });

    await new Promise<void>((resolve, reject) => {
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString("utf-8")}`.slice(-4000);
      });

      child.on("error", (error) => {
        settleReject(reject, new Error(`Failed to start codex ACP runtime: ${error.message}`));
      });

      child.on("close", (code) => {
        if (settled) {
          return;
        }
        if (signal.aborted) {
          settleReject(reject, Object.assign(new Error("Aborted"), { name: "AbortError" }));
          return;
        }
        const detail = stderr.trim().slice(0, 240);
        const suffix = detail ? `: ${detail}` : "";
        settleReject(reject, new Error(`Codex ACP process exited (${code ?? "unknown"})${suffix}`));
      });

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf-8");
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          let parsed: {
            id?: string;
            method?: string;
            params?: Record<string, unknown>;
            result?: Record<string, unknown>;
            error?: { message?: string };
          };

          try {
            parsed = JSON.parse(trimmed) as typeof parsed;
          } catch {
            continue;
          }

          if (parsed.error?.message) {
            settleReject(reject, new Error(parsed.error.message));
            return;
          }

          if (parsed.id === initializeId) {
            writeRpc({ method: "initialized" });
            writeRpc({
              method: "thread/start",
              id: chatStartId,
              params: {
                model: payload.settings.model.trim() || null,
                modelProvider: null,
                cwd: process.cwd(),
                approvalPolicy: null,
                sandbox: null,
                config: acpConfigOverrides,
                baseInstructions: null,
                developerInstructions: null,
                personality: null,
                ephemeral: true,
                experimentalRawEvents: false,
                persistExtendedHistory: false
              }
            });
            continue;
          }

          if (parsed.id === chatStartId) {
            const chatId =
              parsed.result?.thread && typeof parsed.result.thread === "object"
                ? (parsed.result.thread as { id?: string }).id
                : null;
            if (!chatId) {
              settleReject(reject, new Error("ACP start did not return a chat id."));
              return;
            }
            const turnStartParams = {
              threadId: chatId,
              input: [{ type: "text", text: turnInput, text_elements: [] }],
              cwd: process.cwd(),
              approvalPolicy: null,
              sandboxPolicy: null,
              model: payload.settings.model.trim() || null,
              effort: null,
              summary: null,
              personality: null,
              outputSchema: null,
              collaborationMode: null
            };
            deps.logChatRequestPayload(
              streamId,
              payload.settings.providerType,
              "acp:turn/start",
              turnStartParams
            );
            writeRpc({
              method: "turn/start",
              id: turnStartId,
              params: turnStartParams
            });
            continue;
          }

          if (parsed.id === turnStartId) {
            continue;
          }

          if (parsed.method === "sessionConfigured") {
            const initialMessages = Array.isArray(parsed.params?.initial_messages)
              ? parsed.params?.initial_messages
              : [];
            for (const event of initialMessages) {
              if (!event || typeof event !== "object") {
                continue;
              }
              const source = event as Record<string, unknown>;
              const type = typeof source.type === "string" ? source.type : "";
              if (!type.startsWith("mcp_")) {
                continue;
              }

              if (type === "mcp_startup_update") {
                const server = typeof source.server === "string" ? source.server : "unknown";
                const status =
                  source.status && typeof source.status === "object"
                    ? (source.status as { state?: unknown; error?: unknown })
                    : undefined;
                const state = typeof status?.state === "string" ? status.state : "unknown";
                const error = typeof status?.error === "string" ? status.error : "";
                emitToolCall({
                  id: `${streamId}-startup-${server}`,
                  serverName: server,
                  toolName: "startup",
                  status: error ? "error" : "success",
                  message: error ? `${state} (${error})` : state
                });
                continue;
              }

              if (type === "mcp_startup_complete") {
                const ready = Array.isArray(source.ready) ? source.ready.length : 0;
                const failed = Array.isArray(source.failed) ? source.failed.length : 0;
                const cancelled = Array.isArray(source.cancelled) ? source.cancelled.length : 0;
                emitToolCall({
                  id: `${streamId}-startup-complete`,
                  serverName: "mcp",
                  toolName: "startup",
                  status: failed > 0 ? "error" : "success",
                  message: `ready ${ready}, failed ${failed}, cancelled ${cancelled}`
                });
                continue;
              }

              if (type === "mcp_tool_call_begin") {
                const invocation =
                  source.invocation && typeof source.invocation === "object"
                    ? (source.invocation as { server?: unknown; tool?: unknown })
                    : undefined;
                const server = typeof invocation?.server === "string" ? invocation.server : "unknown";
                const tool = typeof invocation?.tool === "string" ? invocation.tool : "tool";
                emitToolCall({
                  id: `${streamId}-begin-${server}-${tool}`,
                  serverName: server,
                  toolName: tool,
                  status: "pending",
                  message: ""
                });
                continue;
              }

              if (type === "mcp_tool_call_end") {
                const invocation =
                  source.invocation && typeof source.invocation === "object"
                    ? (source.invocation as { server?: unknown; tool?: unknown })
                    : undefined;
                const server = typeof invocation?.server === "string" ? invocation.server : "unknown";
                const tool = typeof invocation?.tool === "string" ? invocation.tool : "tool";
                emitToolCall({
                  id: `${streamId}-end-${server}-${tool}`,
                  serverName: server,
                  toolName: tool,
                  status: "success",
                  message: ""
                });
                continue;
              }

              if (type === "mcp_list_tools_response") {
                const tools =
                  source.tools && typeof source.tools === "object"
                    ? Object.keys(source.tools).length
                    : 0;
                emitToolCall({
                  id: `${streamId}-list-tools`,
                  serverName: "mcp",
                  toolName: "list_tools",
                  status: "success",
                  message: `${tools} tools available`
                });
              }
            }
            continue;
          }

          if (parsed.method === "item/agentMessage/delta") {
            const delta = parsed.params?.delta;
            if (typeof delta === "string" && delta) {
              emittedAnyDelta = true;
              onDelta?.();
              deps.sendStreamEvent(sender, streamId, { type: "delta", delta });
            }
            continue;
          }

          if (
            typeof parsed.method === "string" &&
            parsed.method.endsWith("/delta") &&
            (parsed.method.includes("reason") || parsed.method.includes("thinking"))
          ) {
            const delta = parsed.params?.delta;
            if (typeof delta === "string" && delta) {
              emittedAnyDelta = true;
              onDelta?.();
              deps.sendStreamEvent(sender, streamId, { type: "reasoning", delta });
            }
            continue;
          }

          if (parsed.method === "item/mcpToolCall/progress") {
            const message = parsed.params?.message;
            if (typeof message === "string" && message.trim()) {
              emitToolCall({
                id: `${streamId}-progress-${Date.now()}`,
                serverName: "mcp",
                toolName: "progress",
                status: "pending",
                message: message.trim()
              });
            }
            continue;
          }

          if (parsed.method === "mcpServer/oauthLogin/completed") {
            const name = typeof parsed.params?.name === "string" ? parsed.params.name : "unknown";
            const success = parsed.params?.success === true;
            const error = typeof parsed.params?.error === "string" ? parsed.params.error : "";
            emitToolCall({
              id: `${streamId}-oauth-${name}`,
              serverName: name,
              toolName: "oauth_login",
              status: success ? "success" : "error",
              message: error || ""
            });
            continue;
          }

          if (parsed.method === "item/started") {
            const item = parsed.params?.item as
              | { type?: string; server?: string; tool?: string }
              | undefined;
            if (item?.type === "mcpToolCall") {
              const server = item.server || "unknown";
              const tool = item.tool || "tool";
              emitToolCall({
                id: `${streamId}-started-${server}-${tool}`,
                serverName: server,
                toolName: tool,
                status: "pending",
                message: ""
              });
            }
            continue;
          }

          if (parsed.method === "item/completed") {
            const item = parsed.params?.item as
              | {
                  type?: string;
                  content?: Array<{ type?: string; text?: string }>;
                  server?: string;
                  tool?: string;
                  status?: string;
                  durationMs?: number | null;
                  error?: { message?: string } | null;
                }
              | undefined;
            if (item?.type === "mcpToolCall") {
              const server = item.server || "unknown";
              const tool = item.tool || "tool";
              const durationLabel =
                typeof item.durationMs === "number" && Number.isFinite(item.durationMs)
                  ? `${Math.max(0, Math.round(item.durationMs))}ms`
                  : "";
              const errorMsg = item.error?.message || "";
              emitToolCall({
                id: `${streamId}-completed-${server}-${tool}`,
                serverName: server,
                toolName: tool,
                status: errorMsg ? "error" : "success",
                message: errorMsg || durationLabel
              });
              continue;
            }
            if (!emittedAnyDelta && item?.type === "agentMessage" && Array.isArray(item.content)) {
              const text = item.content
                .filter((part) => part?.type === "text" && typeof part.text === "string")
                .map((part) => part.text ?? "")
                .join("");
              if (text) {
                emittedAnyDelta = true;
                onDelta?.();
                deps.sendStreamEvent(sender, streamId, { type: "delta", delta: text });
              }
            }
            continue;
          }

          if (parsed.method && parsed.method.toLowerCase().includes("usage")) {
            const usage = extractGenericUsage(parsed.params ?? parsed.result);
            if (usage) {
              sawUsage = true;
              logProviderUsage(
                streamId,
                payload.settings.providerType,
                `acp:${parsed.method}`,
                usage,
                parsed,
                trimmed
              );
              deps.sendStreamEvent(sender, streamId, { type: "usage", usage });
            }
            continue;
          }

          if (parsed.method === "error") {
            const errorPayload = parsed.params?.error as { message?: string } | undefined;
            const retrying = parsed.params?.willRetry === true;
            if (!retrying) {
              emitError(errorPayload?.message || "ACP streaming failed.");
              emitDone();
              settleResolve(resolve);
              return;
            }
            continue;
          }

          if (parsed.method === "turn/completed") {
            const turn = parsed.params?.turn as
              | { status?: string; error?: { message?: string } | null; usage?: Record<string, unknown> }
              | undefined;
            const usage = extractGenericUsage(turn ?? parsed.params);
            if (usage) {
              sawUsage = true;
              logProviderUsage(
                streamId,
                payload.settings.providerType,
                "acp:turn/completed",
                usage,
                parsed,
                trimmed
              );
              deps.sendStreamEvent(sender, streamId, { type: "usage", usage });
            } else {
              reportUsageMissing("turn-completed-without-usage", parsed, trimmed);
            }
            const status = turn?.status;
            if (status && status !== "completed") {
              emitError(turn?.error?.message || "ACP turn failed.");
            }
            emitDone();
            settleResolve(resolve);
            return;
          }
        }
      });

      writeRpc({
        method: "initialize",
        id: initializeId,
        params: {
          clientInfo: {
            name: "echo-desktop",
            title: "Echo Desktop",
            version: app.getVersion()
          },
          capabilities: {
            experimentalApi: true,
            optOutNotificationMethods: null
          }
        }
      });
    });
  };
};
