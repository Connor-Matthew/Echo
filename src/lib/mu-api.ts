import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
  type ChatSession,
  type ChatStreamEvent,
  type ChatStreamRequest,
  type ConnectionTestResult,
  type ModelListResult
} from "../shared/contracts";

export type MuApi = {
  settings: {
    get: () => Promise<AppSettings>;
    save: (settings: AppSettings) => Promise<void>;
    testConnection: (settings: AppSettings) => Promise<ConnectionTestResult>;
    listModels: (settings: AppSettings) => Promise<ModelListResult>;
  };
  sessions: {
    get: () => Promise<ChatSession[]>;
    save: (sessions: ChatSession[]) => Promise<void>;
  };
  chat: {
    startStream: (payload: ChatStreamRequest) => Promise<{ streamId: string }>;
    stopStream: (streamId: string) => Promise<void>;
    onStreamEvent: (
      streamId: string,
      listener: (event: ChatStreamEvent) => void
    ) => () => void;
  };
};

const SETTINGS_KEY = "mu.settings.v1";
const SESSIONS_KEY = "mu.sessions.v1";
const MIN_REQUEST_TIMEOUT_MS = 5000;
const MAX_REQUEST_TIMEOUT_MS = 180000;
const MIN_RETRY_COUNT = 0;
const MAX_RETRY_COUNT = 3;

const readLocalStorage = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeLocalStorage = (key: string, value: unknown) => {
  window.localStorage.setItem(key, JSON.stringify(value));
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
        .map((item) => (typeof item === "string" ? item : item?.id || item?.name || ""))
        .filter((value): value is string => Boolean(value))
    : [];
  const fromModelIds = Array.isArray(source.model_ids)
    ? source.model_ids.filter((value): value is string => typeof value === "string")
    : [];

  return Array.from(new Set([...fromData, ...fromModels, ...fromModelIds])).sort((a, b) =>
    a.localeCompare(b)
  );
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

  const timeoutId = window.setTimeout(() => {
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
    window.clearTimeout(timeoutId);
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

const createBrowserFallbackApi = (): MuApi => {
  const listeners = new Map<string, Set<(event: ChatStreamEvent) => void>>();
  const controllers = new Map<string, AbortController>();

  const emit = (streamId: string, event: ChatStreamEvent) => {
    const streamListeners = listeners.get(streamId);
    if (!streamListeners) {
      return;
    }
    streamListeners.forEach((listener) => listener(event));
  };

  return {
    settings: {
      get: async () => {
        const saved = readLocalStorage<Partial<AppSettings>>(SETTINGS_KEY, {});
        return normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });
      },
      save: async (settings) => writeLocalStorage(SETTINGS_KEY, normalizeSettings(settings)),
      testConnection: async (settings) => {
        if (settings.providerType === "acp") {
          return {
            ok: false,
            message: "ACP is only available in the Electron desktop runtime."
          };
        }
        const baseUrl = normalizeBaseUrl(settings.baseUrl);
        const apiKeys = parseApiKeys(settings.apiKey);
        if (!baseUrl || !apiKeys.length) {
          return { ok: false, message: "Missing Base URL or API key." };
        }
        try {
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

          for (const attempt of attempts) {
            const res = await fetch(attempt.endpoint, { headers: attempt.headers });
            if (res.ok) {
              return { ok: true, message: "Connection succeeded." };
            }
          }
          return { ok: false, message: "Connection failed: all API keys were rejected." };
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : "Connection failed."
          };
        }
      },
      listModels: async (settings) => {
        if (settings.providerType === "acp") {
          return {
            ok: false,
            message: "ACP model listing is only available in the Electron desktop runtime.",
            models: []
          };
        }
        const baseUrl = normalizeBaseUrl(settings.baseUrl);
        const apiKeys = parseApiKeys(settings.apiKey);
        if (!baseUrl || !apiKeys.length) {
          return { ok: false, message: "Missing Base URL or API key.", models: [] };
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
      }
    },
    sessions: {
      get: async () => readLocalStorage<ChatSession[]>(SESSIONS_KEY, []),
      save: async (sessions) => writeLocalStorage(SESSIONS_KEY, sessions)
    },
    chat: {
      startStream: async ({ settings, messages }) => {
        if (settings.providerType === "acp") {
          throw new Error("ACP is only available in the Electron desktop runtime.");
        }
        const streamId = crypto.randomUUID();
        const baseUrl = normalizeBaseUrl(settings.baseUrl);
        const apiKeys = parseApiKeys(settings.apiKey);
        if (!apiKeys.length) {
          throw new Error("Missing API key.");
        }
        const controller = new AbortController();
        controllers.set(streamId, controller);
        listeners.set(streamId, listeners.get(streamId) ?? new Set());
        const timeoutMs = normalizeRequestTimeoutMs(settings.requestTimeoutMs);
        const retryCount = normalizeRetryCount(settings.retryCount);
        const maxAttempts = Math.max(retryCount + 1, apiKeys.length);
        const debug = createSseDebugLogger(Boolean(settings.sseDebug), streamId);

        void (async () => {
          const isAnthropic = settings.providerType === "anthropic";
          const endpoint = isAnthropic
            ? resolveAnthropicEndpoint(baseUrl, "messages")
            : `${baseUrl}/chat/completions`;
          const body = isAnthropic
            ? (() => {
                const system = messages
                  .filter((message) => message.role === "system")
                  .map((message) => message.content.trim())
                  .filter(Boolean)
                  .join("\n\n");
                return {
                  model: settings.model.trim(),
                  stream: true,
                  max_tokens: settings.maxTokens,
                  temperature: settings.temperature,
                  system: system || undefined,
                  messages: messages
                    .filter((message) => message.role !== "system" && Boolean(message.content.trim()))
                    .map((message) => ({
                      role: message.role as "user" | "assistant",
                      content: [{ type: "text", text: message.content }]
                    }))
                };
              })()
            : {
                model: settings.model.trim(),
                stream: true,
                messages
              };
          let attempt = 0;

          while (attempt < maxAttempts) {
            let emittedDelta = false;
            const attemptNumber = attempt + 1;
            const apiKey = apiKeys[attempt % apiKeys.length];
            const headers: Record<string, string> = isAnthropic
              ? {
                  "Content-Type": "application/json",
                  "x-api-key": apiKey,
                  "anthropic-version": "2023-06-01"
                }
              : {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`
                };
            debug(`attempt ${attemptNumber}/${maxAttempts} started`, {
              apiKeySlot: `${(attempt % apiKeys.length) + 1}/${apiKeys.length}`
            });

            try {
              await runStreamWithTimeout(controller.signal, timeoutMs, async (attemptSignal) => {
                const response = await fetch(endpoint, {
                  method: "POST",
                  headers,
                  signal: attemptSignal,
                  body: JSON.stringify(body)
                });

                if (!response.ok || !response.body) {
                  const detail = await response.text().catch(() => "");
                  throw new Error(
                    `Request failed: HTTP ${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}`
                  );
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                  const { value, done } = await reader.read();
                  if (done) {
                    emit(streamId, { type: "done" });
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
                    if (isAnthropic) {
                      if (!data || data === "[DONE]") {
                        emit(streamId, { type: "done" });
                        return;
                      }
                    } else {
                      if (data === "[DONE]") {
                        emit(streamId, { type: "done" });
                        return;
                      }
                      if (!data) {
                        continue;
                      }
                    }

                    try {
                      const parsed = JSON.parse(data) as {
                        choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
                        type?: string;
                        delta?: { text?: string };
                        error?: { message?: string };
                      };

                      if (isAnthropic && parsed.type === "error") {
                        emit(streamId, {
                          type: "error",
                          message: parsed.error?.message || "Streaming failed."
                        });
                        emit(streamId, { type: "done" });
                        return;
                      }

                      if (!isAnthropic && parsed.error?.message) {
                        emit(streamId, { type: "error", message: parsed.error.message });
                        emit(streamId, { type: "done" });
                        return;
                      }

                      const delta = isAnthropic
                        ? parsed.delta?.text
                        : parsed.choices?.[0]?.delta?.content;
                      if (delta) {
                        emittedDelta = true;
                        emit(streamId, { type: "delta", delta });
                      }

                      if (
                        (!isAnthropic && parsed.choices?.[0]?.finish_reason) ||
                        (isAnthropic && parsed.type === "message_stop")
                      ) {
                        emit(streamId, { type: "done" });
                        return;
                      }
                    } catch {
                      continue;
                    }
                  }
                }
              });

              debug(`attempt ${attemptNumber} completed`, { emittedDelta });
              return;
            } catch (error) {
              if (controller.signal.aborted && isAbortError(error)) {
                debug("aborted by user");
                emit(streamId, { type: "done" });
                return;
              }

              const message = error instanceof Error ? error.message : "Streaming failed.";
              const shouldRetry = attempt + 1 < maxAttempts && !emittedDelta;
              debug(`attempt ${attemptNumber} failed`, { message, emittedDelta, shouldRetry });
              if (shouldRetry) {
                attempt += 1;
                continue;
              }

              emit(streamId, { type: "error", message });
              return;
            }
          }
        })()
          .finally(() => {
            controllers.delete(streamId);
          });

        return { streamId };
      },
      stopStream: async (streamId) => {
        const controller = controllers.get(streamId);
        if (controller) {
          controller.abort();
          controllers.delete(streamId);
        }
      },
      onStreamEvent: (streamId, listener) => {
        const bucket = listeners.get(streamId) ?? new Set<(event: ChatStreamEvent) => void>();
        bucket.add(listener);
        listeners.set(streamId, bucket);

        return () => {
          const current = listeners.get(streamId);
          if (!current) {
            return;
          }
          current.delete(listener);
          if (!current.size) {
            listeners.delete(streamId);
          }
        };
      }
    }
  };
};

let cachedApi: MuApi | null = null;

export const getMuApi = (): MuApi => {
  if (cachedApi) {
    return cachedApi;
  }
  if (typeof window !== "undefined" && window.muApi) {
    cachedApi = window.muApi;
    return cachedApi;
  }
  cachedApi = createBrowserFallbackApi();
  return cachedApi;
};
