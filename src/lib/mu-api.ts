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
        const baseUrl = normalizeBaseUrl(settings.baseUrl);
        if (!baseUrl || !settings.apiKey.trim()) {
          return { ok: false, message: "Missing Base URL or API key." };
        }
        try {
          const isAnthropic = settings.providerType === "anthropic";
          const endpoint = isAnthropic ? resolveAnthropicEndpoint(baseUrl, "models") : `${baseUrl}/models`;
          const headers: Record<string, string> = isAnthropic
            ? {
                "x-api-key": settings.apiKey.trim(),
                "anthropic-version": "2023-06-01"
              }
            : {
                Authorization: `Bearer ${settings.apiKey.trim()}`
              };
          const res = await fetch(endpoint, { headers });
          if (!res.ok) {
            return { ok: false, message: `HTTP ${res.status}` };
          }
          return { ok: true, message: "Connection succeeded." };
        } catch (error) {
          return {
            ok: false,
            message: error instanceof Error ? error.message : "Connection failed."
          };
        }
      },
      listModels: async (settings) => {
        const baseUrl = normalizeBaseUrl(settings.baseUrl);
        if (!baseUrl || !settings.apiKey.trim()) {
          return { ok: false, message: "Missing Base URL or API key.", models: [] };
        }

        const isAnthropic = settings.providerType === "anthropic";
        const anthropicHeaders: Record<string, string> = {
          "x-api-key": settings.apiKey.trim(),
          "anthropic-version": "2023-06-01"
        };
        const bearerHeaders: Record<string, string> = {
          Authorization: `Bearer ${settings.apiKey.trim()}`
        };

        const attempts: Array<{ endpoint: string; headers: Record<string, string> }> = isAnthropic
          ? [
              { endpoint: resolveAnthropicEndpoint(baseUrl, "models"), headers: anthropicHeaders },
              { endpoint: `${baseUrl}/models`, headers: anthropicHeaders },
              { endpoint: resolveAnthropicEndpoint(baseUrl, "models"), headers: bearerHeaders },
              { endpoint: `${baseUrl}/models`, headers: bearerHeaders }
            ]
          : [{ endpoint: `${baseUrl}/models`, headers: bearerHeaders }];

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
        const streamId = crypto.randomUUID();
        const baseUrl = normalizeBaseUrl(settings.baseUrl);
        const controller = new AbortController();
        controllers.set(streamId, controller);
        listeners.set(streamId, listeners.get(streamId) ?? new Set());

        void (async () => {
          try {
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
            const headers: Record<string, string> = isAnthropic
              ? {
                  "Content-Type": "application/json",
                  "x-api-key": settings.apiKey.trim(),
                  "anthropic-version": "2023-06-01"
                }
              : {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${settings.apiKey.trim()}`
                };
            const response = await fetch(endpoint, {
              method: "POST",
              headers,
              signal: controller.signal,
              body: JSON.stringify(body)
            });

            if (!response.ok || !response.body) {
              throw new Error(`Request failed: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                emit(streamId, { type: "done" });
                break;
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
                  emit(streamId, { type: "done" });
                  break;
                }
                try {
                  const parsed = JSON.parse(data) as {
                    choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
                    type?: string;
                    delta?: { text?: string };
                  };
                  const delta = isAnthropic
                    ? parsed.delta?.text
                    : parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    emit(streamId, { type: "delta", delta });
                  }
                  if (
                    (!isAnthropic && parsed.choices?.[0]?.finish_reason) ||
                    (isAnthropic && parsed.type === "message_stop")
                  ) {
                    emit(streamId, { type: "done" });
                  }
                } catch {
                  continue;
                }
              }
            }
          } catch (error) {
            if ((error as Error).name === "AbortError") {
              emit(streamId, { type: "done" });
            } else {
              emit(streamId, {
                type: "error",
                message: error instanceof Error ? error.message : "Streaming failed."
              });
            }
          } finally {
            controllers.delete(streamId);
          }
        })();

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
