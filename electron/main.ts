import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
  type ChatSession,
  type ChatStreamEvent,
  type ChatStreamRequest,
  type ConnectionTestResult,
  type ModelListResult,
  type StreamEnvelope
} from "../src/shared/contracts";

const STORE_DIR_NAME = "store";
const SETTINGS_FILE = "settings.json";
const SESSIONS_FILE = "sessions.json";
const STREAM_EVENT_CHANNEL = "chat:stream:event";
const MIN_REQUEST_TIMEOUT_MS = 5000;
const MAX_REQUEST_TIMEOUT_MS = 180000;
const MIN_RETRY_COUNT = 0;
const MAX_RETRY_COUNT = 3;
const CODEX_RUNTIME_CHECK_TIMEOUT_MS = 12000;

const streamControllers = new Map<string, AbortController>();

const createId = () => crypto.randomUUID();

const ensureStoreDir = async () => {
  const storeDir = path.join(app.getPath("userData"), STORE_DIR_NAME);
  await mkdir(storeDir, { recursive: true });
  return storeDir;
};

const readJson = async <T>(filename: string, fallback: T): Promise<T> => {
  try {
    const storeDir = await ensureStoreDir();
    const filePath = path.join(storeDir, filename);
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
};

const writeJson = async (filename: string, value: unknown): Promise<void> => {
  const storeDir = await ensureStoreDir();
  const filePath = path.join(storeDir, filename);
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");
const normalizeApiKeyToken = (value: string) => value.trim().replace(/^['"]|['"]$/g, "");
const parseApiKeys = (raw: string) =>
  Array.from(
    new Set(
      raw
        .split(/[,\n]/)
        .map((entry) => normalizeApiKeyToken(entry))
        .filter(Boolean)
    )
  );
const resolveAnthropicEndpoint = (baseUrl: string, resource: "models" | "messages") => {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized.endsWith("/v1")
    ? `${normalized}/${resource}`
    : `${normalized}/v1/${resource}`;
};

const extractModelIds = (payload: unknown): string[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const source = payload as {
    data?: Array<{ id?: string; name?: string }>;
    models?: Array<string | { id?: string; name?: string }>;
    model_ids?: string[];
  };

  const fromData = Array.isArray(source.data)
    ? source.data
        .map((item) => item.id || item.name || "")
        .filter((value): value is string => Boolean(value))
    : [];

  const fromModels = Array.isArray(source.models)
    ? source.models
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          return item?.id || item?.name || "";
        })
        .filter((value): value is string => Boolean(value))
    : [];

  const fromModelIds = Array.isArray(source.model_ids)
    ? source.model_ids.filter((value): value is string => typeof value === "string")
    : [];

  return Array.from(new Set([...fromData, ...fromModels, ...fromModelIds])).sort((a, b) =>
    a.localeCompare(b)
  );
};

const isSettingsConfigured = (settings: AppSettings) => {
  if (settings.providerType === "acp") {
    return true;
  }
  return Boolean(settings.baseUrl.trim() && parseApiKeys(settings.apiKey).length && settings.model.trim());
};

const isConnectionConfigured = (settings: AppSettings) => {
  if (settings.providerType === "acp") {
    return true;
  }
  return Boolean(settings.baseUrl.trim() && parseApiKeys(settings.apiKey).length);
};

const clampInteger = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
};

const normalizeRequestTimeoutMs = (value: number) =>
  clampInteger(value, MIN_REQUEST_TIMEOUT_MS, MAX_REQUEST_TIMEOUT_MS, DEFAULT_SETTINGS.requestTimeoutMs);

const normalizeRetryCount = (value: number) =>
  clampInteger(value, MIN_RETRY_COUNT, MAX_RETRY_COUNT, DEFAULT_SETTINGS.retryCount);

const isAbortError = (error: unknown): error is Error =>
  error instanceof Error && error.name === "AbortError";

const runStreamWithTimeout = async (
  signal: AbortSignal,
  timeoutMs: number,
  execute: (attemptSignal: AbortSignal) => Promise<void>
) => {
  if (timeoutMs <= 0) {
    await execute(signal);
    return;
  }

  const attemptController = new AbortController();
  let didTimeout = false;
  const syncAbortState = () => {
    attemptController.abort();
  };

  if (signal.aborted) {
    attemptController.abort();
  } else {
    signal.addEventListener("abort", syncAbortState, { once: true });
  }

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    attemptController.abort();
  }, timeoutMs);

  try {
    await execute(attemptController.signal);
  } catch (error) {
    if (didTimeout && isAbortError(error)) {
      throw new Error(`Request timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener("abort", syncAbortState);
  }
};

const createSseDebugLogger =
  (enabled: boolean, streamId: string) =>
  (...parts: unknown[]) => {
    if (!enabled) {
      return;
    }
    console.info(`[sse:${streamId}]`, ...parts);
  };

const runCodexCommand = async (
  args: string[],
  timeoutMs = CODEX_RUNTIME_CHECK_TIMEOUT_MS
): Promise<{ ok: boolean; message: string }> =>
  new Promise((resolve) => {
    let settled = false;
    const child = spawn("codex", args, { stdio: ["ignore", "pipe", "pipe"] });
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

const listCodexAcpModels = async (timeoutMs = CODEX_RUNTIME_CHECK_TIMEOUT_MS): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"]
    });
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
          version: app.getVersion()
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: null
        }
      }
    });
  });

const formatMessagesForAcpTurn = (payload: ChatStreamRequest) =>
  payload.messages
    .map((message) => ({
      role: message.role.toUpperCase(),
      content: message.content.trim()
    }))
    .filter((message) => Boolean(message.content))
    .map((message) => `[${message.role}]\n${message.content}`)
    .join("\n\n");

const fetchModelIds = async (settings: AppSettings): Promise<ModelListResult> => {
  if (settings.providerType === "acp") {
    try {
      const models = await listCodexAcpModels();
      return {
        ok: true,
        message: models.length
          ? `Fetched ${models.length} ACP model(s).`
          : "ACP runtime is reachable, but no models were returned.",
        models
      };
    } catch (error) {
      return {
        ok: false,
        message: `Failed to fetch ACP models. ${error instanceof Error ? error.message : "Unknown error."}`,
        models: []
      };
    }
  }

  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const apiKeys = parseApiKeys(settings.apiKey);
  if (!baseUrl || !apiKeys.length) {
    return { ok: false, message: "Please fill Base URL and API key.", models: [] };
  }

  const isAnthropic = settings.providerType === "anthropic";
  const attempts: Array<{ endpoint: string; headers: Record<string, string> }> = isAnthropic
    ? apiKeys.flatMap((apiKey) => [
        {
          endpoint: resolveAnthropicEndpoint(baseUrl, "models"),
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } as Record<
            string,
            string
          >
        },
        {
          endpoint: `${baseUrl}/models`,
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } as Record<
            string,
            string
          >
        },
        {
          endpoint: resolveAnthropicEndpoint(baseUrl, "models"),
          headers: { Authorization: `Bearer ${apiKey}` } as Record<string, string>
        },
        {
          endpoint: `${baseUrl}/models`,
          headers: { Authorization: `Bearer ${apiKey}` } as Record<string, string>
        }
      ])
    : apiKeys.map((apiKey) => ({
        endpoint: `${baseUrl}/models`,
        headers: { Authorization: `Bearer ${apiKey}` } as Record<string, string>
      }));

  let lastFailure = "Unknown error.";

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.endpoint, { headers: attempt.headers });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        lastFailure = `HTTP ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`;
        continue;
      }

      const parsed = (await response.json().catch(() => null)) as unknown;
      const models = extractModelIds(parsed);
      return {
        ok: true,
        message: models.length
          ? `Fetched ${models.length} model(s).`
          : "Connected, but provider returned no model list.",
        models
      };
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "Network request failed.";
    }
  }

  return {
    ok: false,
    message: `Failed to fetch models. ${lastFailure}`,
    models: []
  };
};

const sendStreamEvent = (
  sender: IpcMainInvokeEvent["sender"],
  streamId: string,
  event: ChatStreamEvent
) => {
  const payload: StreamEnvelope = { streamId, event };
  sender.send(STREAM_EVENT_CHANNEL, payload);
};

const streamOpenAICompatible = async (
  sender: IpcMainInvokeEvent["sender"],
  streamId: string,
  payload: ChatStreamRequest,
  apiKey: string,
  signal: AbortSignal,
  onDelta?: () => void
) => {
  const baseUrl = normalizeBaseUrl(payload.settings.baseUrl);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: payload.settings.model.trim(),
      stream: true,
      messages: payload.messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    }),
    signal
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Provider returned HTTP ${response.status}${body ? `: ${body}` : ""}`);
  }
  if (!response.body) {
    throw new Error("Provider response has no stream body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneSent = false;

  const emitDone = () => {
    if (!doneSent) {
      doneSent = true;
      sendStreamEvent(sender, streamId, { type: "done" });
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      emitDone();
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        emitDone();
        return;
      }

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
          error?: { message?: string };
        };

        if (parsed.error?.message) {
          sendStreamEvent(sender, streamId, {
            type: "error",
            message: parsed.error.message
          });
          emitDone();
          return;
        }

        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          onDelta?.();
          sendStreamEvent(sender, streamId, { type: "delta", delta });
        }

        if (parsed.choices?.[0]?.finish_reason) {
          emitDone();
          return;
        }
      } catch {
        continue;
      }
    }
  }
};

const streamAnthropic = async (
  sender: IpcMainInvokeEvent["sender"],
  streamId: string,
  payload: ChatStreamRequest,
  apiKey: string,
  signal: AbortSignal,
  onDelta?: () => void
) => {
  const endpoint = resolveAnthropicEndpoint(payload.settings.baseUrl, "messages");
  const systemPrompt = payload.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");
  const anthropicMessages = payload.messages
    .filter((message) => message.role !== "system" && Boolean(message.content.trim()))
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: [{ type: "text", text: message.content }]
    }));

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: payload.settings.model.trim(),
      stream: true,
      max_tokens: payload.settings.maxTokens,
      temperature: payload.settings.temperature,
      system: systemPrompt || undefined,
      messages: anthropicMessages
    }),
    signal
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Provider returned HTTP ${response.status}${body ? `: ${body}` : ""}`);
  }
  if (!response.body) {
    throw new Error("Provider response has no stream body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneSent = false;

  const emitDone = () => {
    if (!doneSent) {
      doneSent = true;
      sendStreamEvent(sender, streamId, { type: "done" });
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      emitDone();
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") {
        emitDone();
        return;
      }

      try {
        const parsed = JSON.parse(data) as {
          type?: string;
          delta?: { text?: string };
          error?: { message?: string };
        };

        if (parsed.type === "error") {
          sendStreamEvent(sender, streamId, {
            type: "error",
            message: parsed.error?.message || "Streaming failed."
          });
          emitDone();
          return;
        }

        const delta = parsed.delta?.text;
        if (delta) {
          onDelta?.();
          sendStreamEvent(sender, streamId, { type: "delta", delta });
        }

        if (parsed.type === "message_stop") {
          emitDone();
          return;
        }
      } catch {
        continue;
      }
    }
  }
};

const streamCodexAcp = async (
  sender: IpcMainInvokeEvent["sender"],
  streamId: string,
  payload: ChatStreamRequest,
  _apiKey: string,
  signal: AbortSignal,
  onDelta?: () => void
) => {
  const turnInput = formatMessagesForAcpTurn(payload);
  if (!turnInput) {
    throw new Error("No message content to send.");
  }

  const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
    stdio: ["pipe", "pipe", "pipe"]
  });

  let stderr = "";
  let stdoutBuffer = "";
  let doneSent = false;
  let settled = false;
  let emittedAnyDelta = false;

  const emitDone = () => {
    if (!doneSent) {
      doneSent = true;
      sendStreamEvent(sender, streamId, { type: "done" });
    }
  };

  const emitError = (message: string) => {
    sendStreamEvent(sender, streamId, { type: "error", message });
  };

  const initializeId = createId();
  const chatStartId = createId();
  const turnStartId = createId();

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
              config: null,
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
          const chatId = parsed.result?.thread && typeof parsed.result.thread === "object"
            ? (parsed.result.thread as { id?: string }).id
            : null;
          if (!chatId) {
            settleReject(reject, new Error("ACP start did not return a chat id."));
            return;
          }
          writeRpc({
            method: "turn/start",
            id: turnStartId,
            params: {
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
            }
          });
          continue;
        }

        if (parsed.id === turnStartId) {
          continue;
        }

        if (parsed.method === "item/agentMessage/delta") {
          const delta = parsed.params?.delta;
          if (typeof delta === "string" && delta) {
            emittedAnyDelta = true;
            onDelta?.();
            sendStreamEvent(sender, streamId, { type: "delta", delta });
          }
          continue;
        }

        if (parsed.method === "item/completed") {
          const item = parsed.params?.item as
            | { type?: string; content?: Array<{ type?: string; text?: string }> }
            | undefined;
          if (!emittedAnyDelta && item?.type === "agentMessage" && Array.isArray(item.content)) {
            const text = item.content
              .filter((part) => part?.type === "text" && typeof part.text === "string")
              .map((part) => part.text ?? "")
              .join("");
            if (text) {
              emittedAnyDelta = true;
              onDelta?.();
              sendStreamEvent(sender, streamId, { type: "delta", delta: text });
            }
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
            | { status?: string; error?: { message?: string } | null }
            | undefined;
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

const registerIpcHandlers = () => {
  ipcMain.handle("settings:get", async () => {
    const saved = await readJson<Partial<AppSettings>>(SETTINGS_FILE, {});
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });
  });

  ipcMain.handle("settings:save", async (_, settings: AppSettings) => {
    await writeJson(SETTINGS_FILE, normalizeSettings(settings));
  });

  ipcMain.handle(
    "settings:testConnection",
    async (_, settings: AppSettings): Promise<ConnectionTestResult> => {
      if (settings.providerType === "acp") {
        const result = await runCodexCommand(["--version"]);
        return {
          ok: result.ok,
          message: result.ok ? `Codex runtime is available (${result.message}).` : result.message
        };
      }

      if (!isConnectionConfigured(settings)) {
        return { ok: false, message: "Please fill Base URL and API key." };
      }
      const result = await fetchModelIds(settings);
      if (!result.ok) {
        return { ok: false, message: result.message };
      }
      return { ok: true, message: "Connection succeeded." };
    }
  );

  ipcMain.handle("settings:listModels", async (_, settings: AppSettings): Promise<ModelListResult> =>
    fetchModelIds(settings)
  );

  ipcMain.handle("sessions:get", async () => readJson<ChatSession[]>(SESSIONS_FILE, []));

  ipcMain.handle("sessions:save", async (_, sessions: ChatSession[]) => {
    await writeJson(SESSIONS_FILE, sessions);
  });

  ipcMain.handle(
    "chat:startStream",
    async (event, payload: ChatStreamRequest): Promise<{ streamId: string }> => {
      if (!isSettingsConfigured(payload.settings)) {
        throw new Error("Provider settings are incomplete.");
      }
      const streamId = createId();
      const controller = new AbortController();
      streamControllers.set(streamId, controller);

      const stream =
        payload.settings.providerType === "acp"
          ? streamCodexAcp
          : payload.settings.providerType === "anthropic"
            ? streamAnthropic
            : streamOpenAICompatible;
      const timeoutMs = normalizeRequestTimeoutMs(payload.settings.requestTimeoutMs);
      const retryCount = normalizeRetryCount(payload.settings.retryCount);
      const apiKeys =
        payload.settings.providerType === "acp" ? ["__acp__"] : parseApiKeys(payload.settings.apiKey);
      const maxAttempts =
        payload.settings.providerType === "acp" ? 1 : Math.max(retryCount + 1, apiKeys.length);
      const debug = createSseDebugLogger(Boolean(payload.settings.sseDebug), streamId);

      void (async () => {
        let attempt = 0;

        while (attempt < maxAttempts) {
          let emittedDelta = false;
          const attemptNumber = attempt + 1;
          const apiKey = apiKeys[attempt % apiKeys.length];
          debug(`attempt ${attemptNumber}/${maxAttempts} started`, {
            apiKeySlot:
              payload.settings.providerType === "acp"
                ? "ACP"
                : `${(attempt % apiKeys.length) + 1}/${apiKeys.length}`
          });

          try {
            await runStreamWithTimeout(controller.signal, timeoutMs, (attemptSignal) =>
              stream(event.sender, streamId, payload, apiKey, attemptSignal, () => {
                emittedDelta = true;
              })
            );
            debug(`attempt ${attemptNumber} completed`, { emittedDelta });
            return;
          } catch (error) {
            if (controller.signal.aborted && isAbortError(error)) {
              debug("aborted by user");
              sendStreamEvent(event.sender, streamId, { type: "done" });
              return;
            }

            const message = error instanceof Error ? error.message : "Streaming failed.";
            const shouldRetry = attempt + 1 < maxAttempts && !emittedDelta;
            debug(`attempt ${attemptNumber} failed`, { message, emittedDelta, shouldRetry });
            if (shouldRetry) {
              attempt += 1;
              continue;
            }

            sendStreamEvent(event.sender, streamId, { type: "error", message });
            return;
          }
        }
      })()
        .finally(() => {
          streamControllers.delete(streamId);
        });

      return { streamId };
    }
  );

  ipcMain.handle("chat:stopStream", async (_, streamId: string) => {
    const controller = streamControllers.get(streamId);
    if (controller) {
      controller.abort();
      streamControllers.delete(streamId);
    }
  });
};

const createMainWindow = () => {
  const preloadPath = path.join(__dirname, "preload.cjs");
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 680,
    minHeight: 450,
    backgroundColor: "#f3f5f8",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    return;
  }

  const rendererPath = path.join(app.getAppPath(), "dist", "index.html");
  void mainWindow.loadFile(rendererPath);
};

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
