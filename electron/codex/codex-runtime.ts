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
