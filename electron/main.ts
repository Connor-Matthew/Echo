import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
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

const isSettingsConfigured = (settings: AppSettings) =>
  Boolean(settings.baseUrl.trim() && settings.apiKey.trim() && settings.model.trim());

const fetchModelIds = async (settings: AppSettings): Promise<ModelListResult> => {
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  if (!baseUrl || !settings.apiKey.trim()) {
    return { ok: false, message: "Please fill Base URL and API key.", models: [] };
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
  signal: AbortSignal
) => {
  const baseUrl = normalizeBaseUrl(payload.settings.baseUrl);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${payload.settings.apiKey.trim()}`
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
  signal: AbortSignal
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
      "x-api-key": payload.settings.apiKey.trim(),
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
      if (!isSettingsConfigured(settings)) {
        return { ok: false, message: "Please fill Base URL, API key, and model." };
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
        payload.settings.providerType === "anthropic" ? streamAnthropic : streamOpenAICompatible;

      void stream(event.sender, streamId, payload, controller.signal)
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") {
            sendStreamEvent(event.sender, streamId, { type: "done" });
            return;
          }
          sendStreamEvent(event.sender, streamId, {
            type: "error",
            message: error instanceof Error ? error.message : "Streaming failed."
          });
        })
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
    minWidth: 1100,
    minHeight: 700,
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
