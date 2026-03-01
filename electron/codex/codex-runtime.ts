import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio
} from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const KNOWN_CLI_PATH_SEGMENTS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];
export const CODEX_RUNTIME_CHECK_TIMEOUT_MS = 12000;

const buildCliEnv = (extraPathSegments: string[] = []) => {
  const delimiter = path.delimiter;
  const currentSegments = (process.env.PATH || "")
    .split(delimiter)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const mergedSegments = Array.from(
    new Set([...currentSegments, ...KNOWN_CLI_PATH_SEGMENTS, ...extraPathSegments])
  );

  return {
    ...process.env,
    PATH: mergedSegments.join(delimiter)
  };
};

const resolveCodexExecutable = () => {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const resolveNvmCandidates = () => {
    if (!homeDir) {
      return [] as string[];
    }

    const versionsRoot = path.join(homeDir, ".nvm", "versions", "node");
    const candidates: string[] = [];
    const defaultAliasPath = path.join(homeDir, ".nvm", "alias", "default");

    if (existsSync(defaultAliasPath)) {
      try {
        const defaultAlias = readFileSync(defaultAliasPath, "utf-8").trim();
        if (defaultAlias) {
          candidates.push(path.join(versionsRoot, defaultAlias, "bin", "codex"));
        }
      } catch {
        // Ignore alias read errors and continue with directory scan.
      }
    }

    if (!existsSync(versionsRoot)) {
      return candidates;
    }

    try {
      const versions = readdirSync(versionsRoot).sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" })
      );
      for (const version of versions) {
        candidates.push(path.join(versionsRoot, version, "bin", "codex"));
      }
    } catch {
      // Ignore directory read errors and fall back to static candidates.
    }

    return candidates;
  };

  const candidatePaths = [
    process.env.ECHO_CODEX_PATH,
    process.env.CODEX_PATH,
    process.env.NVM_BIN ? path.join(process.env.NVM_BIN, "codex") : "",
    homeDir ? path.join(homeDir, ".local", "bin", "codex") : "",
    homeDir ? path.join(homeDir, ".bun", "bin", "codex") : "",
    ...resolveNvmCandidates(),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    "/usr/bin/codex"
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return "codex";
};

export const spawnCodex = (
  args: string[],
  options: Omit<SpawnOptionsWithoutStdio, "stdio"> = {}
): ChildProcessWithoutNullStreams => {
  const executable = resolveCodexExecutable();
  const executableDir = path.isAbsolute(executable) ? path.dirname(executable) : "";
  const baseEnv = buildCliEnv(executableDir ? [executableDir] : []);
  const mergedEnv = options.env
    ? {
        ...baseEnv,
        ...options.env
      }
    : baseEnv;

  return spawn(executable, args, {
    ...options,
    stdio: "pipe",
    env: mergedEnv
  });
};

export const runCodexCommand = async (
  args: string[],
  timeoutMs = CODEX_RUNTIME_CHECK_TIMEOUT_MS
): Promise<{ ok: boolean; message: string }> =>
  new Promise((resolve) => {
    let settled = false;
    const child = spawnCodex(args);
    let stdout = "";
    let stderr = "";

    const settle = (ok: boolean, message: string) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ ok, message });
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      settle(false, "Codex runtime check timed out.");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = `${stdout}${chunk.toString("utf-8")}`.slice(-2000);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf-8")}`.slice(-2000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      settle(false, `Failed to launch codex: ${error.message}`);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        settle(true, (stdout.trim() || "Codex runtime is available.").slice(0, 200));
        return;
      }
      const detail = (stderr.trim() || stdout.trim() || `Exit ${code ?? "unknown"}`).slice(0, 200);
      settle(false, `Codex runtime check failed: ${detail}`);
    });
  });

export type CodexMcpAuthStatus =
  | "unsupported"
  | "notLoggedIn"
  | "bearerToken"
  | "oAuth"
  | "unknown";

export type CodexMcpServerConfig = {
  name: string;
  enabled: boolean;
  disabledReason: string | null;
  authStatus: CodexMcpAuthStatus;
  transportType: "stdio" | "streamable_http" | "unknown";
  endpoint: string;
  startupTimeoutSec: number | null;
  toolTimeoutSec: number | null;
};

export type CodexMcpServerStatus = {
  name: string;
  authStatus: CodexMcpAuthStatus;
  toolCount: number;
  resourceCount: number;
  resourceTemplateCount: number;
};

const toMcpAuthStatus = (value: unknown): CodexMcpAuthStatus =>
  value === "unsupported" || value === "notLoggedIn" || value === "bearerToken" || value === "oAuth"
    ? value
    : "unknown";

const toNullableNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const parseCodexMcpConfigEntry = (entry: unknown): CodexMcpServerConfig | null => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const source = entry as {
    name?: unknown;
    enabled?: unknown;
    disabled_reason?: unknown;
    auth_status?: unknown;
    startup_timeout_sec?: unknown;
    tool_timeout_sec?: unknown;
    transport?: {
      type?: unknown;
      url?: unknown;
      command?: unknown;
      args?: unknown;
    };
  };

  const name = typeof source.name === "string" ? source.name.trim() : "";
  if (!name) {
    return null;
  }

  const transportTypeRaw =
    source.transport && typeof source.transport === "object" ? source.transport.type : null;
  const transportType =
    transportTypeRaw === "stdio" || transportTypeRaw === "streamable_http" ? transportTypeRaw : "unknown";

  let endpoint = "";
  if (transportType === "streamable_http") {
    endpoint = typeof source.transport?.url === "string" ? source.transport.url : "";
  } else if (transportType === "stdio") {
    const command = typeof source.transport?.command === "string" ? source.transport.command : "";
    const args = Array.isArray(source.transport?.args)
      ? source.transport?.args
          .map((arg) => (typeof arg === "string" ? arg.trim() : ""))
          .filter(Boolean)
      : [];
    endpoint = [command, ...args].filter(Boolean).join(" ");
  }

  return {
    name,
    enabled: source.enabled !== false,
    disabledReason: typeof source.disabled_reason === "string" ? source.disabled_reason : null,
    authStatus: toMcpAuthStatus(source.auth_status),
    transportType,
    endpoint,
    startupTimeoutSec: toNullableNumber(source.startup_timeout_sec),
    toolTimeoutSec: toNullableNumber(source.tool_timeout_sec)
  };
};

export const listCodexMcpServers = async (
  timeoutMs = CODEX_RUNTIME_CHECK_TIMEOUT_MS
): Promise<CodexMcpServerConfig[]> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const child = spawnCodex(["mcp", "list", "--json"]);
    let stdout = "";
    let stderr = "";

    const settleResolve = (servers: CodexMcpServerConfig[]) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(servers);
    };

    const settleReject = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };

    const timer = setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      settleReject(new Error("Codex MCP list timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = `${stdout}${chunk.toString("utf-8")}`;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf-8")}`.slice(-4000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      settleReject(new Error(`Failed to launch codex mcp list: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const detail = (stderr.trim() || stdout.trim() || `Exit ${code ?? "unknown"}`).slice(0, 240);
        settleReject(new Error(`codex mcp list failed: ${detail}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as unknown;
        const items = Array.isArray(parsed) ? parsed : [];
        const servers = items
          .map((item) => parseCodexMcpConfigEntry(item))
          .filter((item): item is CodexMcpServerConfig => Boolean(item))
          .sort((a, b) => a.name.localeCompare(b.name));
        settleResolve(servers);
      } catch (error) {
        settleReject(
          new Error(
            `Failed to parse codex mcp list JSON: ${
              error instanceof Error ? error.message : "Unknown parse error."
            }`
          )
        );
      }
    });
  });

const collectMcpStatusesFromResult = (
  result: Record<string, unknown>,
  sink: Map<string, CodexMcpServerStatus>
) => {
  const data = Array.isArray(result.data) ? result.data : [];
  for (const entry of data) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const source = entry as {
      name?: unknown;
      authStatus?: unknown;
      tools?: unknown;
      resources?: unknown;
      resourceTemplates?: unknown;
    };
    const name = typeof source.name === "string" ? source.name.trim() : "";
    if (!name) {
      continue;
    }
    const tools =
      source.tools && typeof source.tools === "object" ? Object.keys(source.tools).length : 0;
    const resources = Array.isArray(source.resources) ? source.resources.length : 0;
    const resourceTemplates = Array.isArray(source.resourceTemplates)
      ? source.resourceTemplates.length
      : 0;
    sink.set(name, {
      name,
      authStatus: toMcpAuthStatus(source.authStatus),
      toolCount: tools,
      resourceCount: resources,
      resourceTemplateCount: resourceTemplates
    });
  }
};

const requestCodexMcpStatuses = async (options: {
  appVersion: string;
  timeoutMs?: number;
  createId?: () => string;
  reloadBeforeList?: boolean;
}): Promise<CodexMcpServerStatus[]> =>
  new Promise((resolve, reject) => {
    const child = spawnCodex(["app-server", "--listen", "stdio://"]);
    const timeoutMs = options.timeoutMs ?? CODEX_RUNTIME_CHECK_TIMEOUT_MS;
    const createId = options.createId ?? (() => crypto.randomUUID());
    let settled = false;
    let stderr = "";
    let stdoutBuffer = "";
    const initializeId = createId();
    const reloadId = options.reloadBeforeList ? createId() : "";
    const listRequestIds = new Set<string>();
    const mcpStatuses = new Map<string, CodexMcpServerStatus>();

    const settleResolve = () => {
      if (settled) {
        return;
      }
      settled = true;
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      resolve(Array.from(mcpStatuses.values()).sort((a, b) => a.name.localeCompare(b.name)));
    };

    const settleReject = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      reject(error);
    };

    const writeRpc = (envelope: unknown) => {
      if (!child.stdin.writable) {
        return;
      }
      try {
        child.stdin.write(`${JSON.stringify(envelope)}\n`);
      } catch {
        // Child lifecycle handlers surface the final error.
      }
    };

    const requestNextPage = (cursor: string | null) => {
      const requestId = createId();
      listRequestIds.add(requestId);
      writeRpc({
        method: "mcpServerStatus/list",
        id: requestId,
        params: {
          cursor,
          limit: 200
        }
      });
    };

    const timer = setTimeout(() => {
      settleReject(new Error("Codex mcpServerStatus/list timed out."));
    }, timeoutMs);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf-8")}`.slice(-4000);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      settleReject(new Error(`Failed to start codex app-server: ${error.message}`));
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      clearTimeout(timer);
      const detail = stderr.trim().slice(0, 240);
      const suffix = detail ? `: ${detail}` : "";
      settleReject(new Error(`Codex app-server exited (${code ?? "unknown"})${suffix}`));
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
          result?: Record<string, unknown>;
          error?: { message?: string };
        };

        try {
          parsed = JSON.parse(trimmed) as typeof parsed;
        } catch {
          continue;
        }

        if (parsed.error?.message) {
          clearTimeout(timer);
          settleReject(new Error(parsed.error.message));
          return;
        }

        if (parsed.id === initializeId) {
          writeRpc({ method: "initialized" });
          if (options.reloadBeforeList) {
            writeRpc({ method: "config/mcpServer/reload", id: reloadId });
          } else {
            requestNextPage(null);
          }
          continue;
        }

        if (parsed.id === reloadId) {
          requestNextPage(null);
          continue;
        }

        if (parsed.id && listRequestIds.has(parsed.id)) {
          listRequestIds.delete(parsed.id);
          collectMcpStatusesFromResult(parsed.result ?? {}, mcpStatuses);
          const nextCursor =
            typeof parsed.result?.nextCursor === "string" && parsed.result.nextCursor.trim()
              ? parsed.result.nextCursor
              : null;
          if (nextCursor) {
            requestNextPage(nextCursor);
            continue;
          }
          if (!listRequestIds.size) {
            clearTimeout(timer);
            settleResolve();
            return;
          }
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
          version: options.appVersion
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: null
        }
      }
    });
  });

export const listCodexMcpServerStatuses = async (options: {
  appVersion: string;
  timeoutMs?: number;
  createId?: () => string;
}): Promise<CodexMcpServerStatus[]> =>
  requestCodexMcpStatuses({ ...options, reloadBeforeList: false });

export const reloadCodexMcpServers = async (options: {
  appVersion: string;
  timeoutMs?: number;
  createId?: () => string;
}): Promise<CodexMcpServerStatus[]> =>
  requestCodexMcpStatuses({ ...options, reloadBeforeList: true });

export const listCodexAcpModels = async (options: {
  appVersion: string;
  timeoutMs?: number;
  createId?: () => string;
}): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const child = spawnCodex(["app-server", "--listen", "stdio://"]);
    const timeoutMs = options.timeoutMs ?? CODEX_RUNTIME_CHECK_TIMEOUT_MS;
    const createId = options.createId ?? (() => crypto.randomUUID());
    let settled = false;
    let stderr = "";
    let stdoutBuffer = "";
    const initializeId = createId();
    const modelListId = createId();

    const settleResolve = (models: string[]) => {
      if (settled) {
        return;
      }
      settled = true;
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      resolve(models);
    };

    const settleReject = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      reject(error);
    };

    const writeRpc = (envelope: unknown) => {
      if (!child.stdin.writable) {
        return;
      }
      try {
        child.stdin.write(`${JSON.stringify(envelope)}\n`);
      } catch {
        // Child lifecycle handlers surface the final error.
      }
    };

    const timer = setTimeout(() => {
      settleReject(new Error("Codex model/list timed out."));
    }, timeoutMs);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf-8")}`.slice(-4000);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      settleReject(new Error(`Failed to start codex app-server: ${error.message}`));
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      clearTimeout(timer);
      const detail = stderr.trim().slice(0, 240);
      const suffix = detail ? `: ${detail}` : "";
      settleReject(new Error(`Codex app-server exited (${code ?? "unknown"})${suffix}`));
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
          result?: Record<string, unknown>;
          error?: { message?: string };
        };

        try {
          parsed = JSON.parse(trimmed) as typeof parsed;
        } catch {
          continue;
        }

        if (parsed.error?.message) {
          clearTimeout(timer);
          settleReject(new Error(parsed.error.message));
          return;
        }

        if (parsed.id === initializeId) {
          writeRpc({ method: "initialized" });
          writeRpc({
            method: "model/list",
            id: modelListId,
            params: { includeHidden: false, limit: 1000, cursor: null }
          });
          continue;
        }

        if (parsed.id === modelListId) {
          clearTimeout(timer);
          const data = Array.isArray(parsed.result?.data) ? parsed.result?.data : [];
          const models = data
            .map((item) => {
              if (!item || typeof item !== "object") {
                return "";
              }
              const candidate = item as { model?: string; id?: string; displayName?: string };
              return (candidate.model || candidate.id || candidate.displayName || "").trim();
            })
            .filter((item): item is string => Boolean(item));
          settleResolve(Array.from(new Set(models)).sort((a, b) => a.localeCompare(b)));
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
          version: options.appVersion
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: null
        }
      }
    });
  });
