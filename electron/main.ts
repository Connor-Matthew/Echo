import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { registerAgentIpcHandlers } from "./agent/agent-ipc";
import {
  formatMessagesForAcpTurn,
  toAnthropicContentBlocks,
  toOpenAiStreamMessages
} from "./chat/message-formatters";
import { createStreamCodexAcp } from "./chat/stream-runners/acp";
import { createStreamAnthropic } from "./chat/stream-runners/anthropic";
import { createStreamOpenAICompatible } from "./chat/stream-runners/openai";
import {
  listCodexAcpModels,
  listCodexMcpServers,
  runCodexCommand
} from "./codex/codex-runtime";
import { McpManager, type McpToolWithServer } from "./mcp/mcp-manager";
import { addMemosMessage, searchMemosMemory, testMemosConnection } from "./memos/memos-client";
import { getEnvironmentDeviceStatus, getEnvironmentWeatherSnapshot } from "./env/env-context-service";
import { registerChatHandlers } from "./ipc/register-chat-handlers";
import { registerEnvironmentHandlers } from "./ipc/register-environment-handlers";
import { registerMemosHandlers } from "./ipc/register-memos-handlers";
import { registerSettingsHandlers } from "./ipc/register-settings-handlers";
import { registerStorageHandlers } from "./ipc/register-storage-handlers";
import { registerSoulHandlers } from "./ipc/register-soul-handlers";
import {
  getSoulAutomationState,
  getSoulMarkdownDocument,
  getSoulMemoryMarkdownDocument,
  saveSoulAutomationState,
  saveSoulMarkdownDocument,
  saveSoulMemoryMarkdownDocument,
  getJournalEntry,
  saveJournalEntry,
  listJournalDates
} from "./memory/soul-service";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
  type ChatStreamEvent,
  type ChatStreamRequest,
  type ModelListResult,
  type McpServerListResult,
  type McpServerStatusListResult,
  type StreamEnvelope
} from "../src/shared/contracts";
import {
  clampInteger,
  extractModelIds,
  normalizeBaseUrl,
  parseApiKeys,
  resolveAnthropicEndpoint
} from "../src/domain/provider/utils";

const STORE_DIR_NAME = "store";
const SETTINGS_FILE = "settings.json";
const SESSIONS_FILE = "sessions.json";
const SKILLS_FILE = "skills.json";
const STREAM_EVENT_CHANNEL = "chat:stream:event";
const MIN_REQUEST_TIMEOUT_MS = 5000;
const MAX_REQUEST_TIMEOUT_MS = 180000;
const MIN_RETRY_COUNT = 0;
const MAX_RETRY_COUNT = 3;
const APP_ICON_FILE = "tabler_brand-nuxt.png";

const streamControllers = new Map<string, AbortController>();

const mcpManager = new McpManager();

const createId = () => crypto.randomUUID();

const resolveAppIconPath = () => {
  const candidates = [
    path.join(app.getAppPath(), APP_ICON_FILE),
    path.resolve(__dirname, "..", APP_ICON_FILE),
    path.join(process.cwd(), APP_ICON_FILE)
  ];
  return candidates.find((candidate) => existsSync(candidate));
};

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

const isSettingsConfigured = (settings: AppSettings) => {
  if (settings.providerType === "acp") {
    return true;
  }
  if (settings.providerType === "claude-agent") {
    return Boolean(parseApiKeys(settings.apiKey).length && settings.model.trim());
  }
  return Boolean(settings.baseUrl.trim() && parseApiKeys(settings.apiKey).length && settings.model.trim());
};

const isConnectionConfigured = (settings: AppSettings) => {
  if (settings.providerType === "acp") {
    return true;
  }
  if (settings.providerType === "claude-agent") {
    return Boolean(parseApiKeys(settings.apiKey).length);
  }
  return Boolean(settings.baseUrl.trim() && parseApiKeys(settings.apiKey).length);
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

const REQUEST_LOG_STRING_LIMIT = 1600;
const REQUEST_LOG_ARRAY_LIMIT = 40;
const REQUEST_LOG_OBJECT_KEY_LIMIT = 40;
const REQUEST_LOG_MAX_DEPTH = 8;

const truncateForLog = (value: string) =>
  value.length > REQUEST_LOG_STRING_LIMIT
    ? `${value.slice(0, REQUEST_LOG_STRING_LIMIT)}...[truncated ${
        value.length - REQUEST_LOG_STRING_LIMIT
      } chars]`
    : value;

const toRequestPreview = (value: unknown, depth = 0): unknown => {
  if (typeof value === "string") {
    return truncateForLog(value);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (depth >= REQUEST_LOG_MAX_DEPTH) {
    return "[max-depth]";
  }
  if (Array.isArray(value)) {
    const items = value
      .slice(0, REQUEST_LOG_ARRAY_LIMIT)
      .map((entry) => toRequestPreview(entry, depth + 1));
    if (value.length > REQUEST_LOG_ARRAY_LIMIT) {
      items.push(`[+${value.length - REQUEST_LOG_ARRAY_LIMIT} items omitted]`);
    }
    return items;
  }

  const source = value as Record<string, unknown>;
  const entries = Object.entries(source).slice(0, REQUEST_LOG_OBJECT_KEY_LIMIT);
  const preview = Object.fromEntries(
    entries.map(([key, entry]) => [key, toRequestPreview(entry, depth + 1)] as const)
  );
  if (Object.keys(source).length > REQUEST_LOG_OBJECT_KEY_LIMIT) {
    return {
      ...preview,
      __omittedKeys: Object.keys(source).length - REQUEST_LOG_OBJECT_KEY_LIMIT
    };
  }
  return preview;
};

const logChatRequestPayload = (
  streamId: string,
  providerType: AppSettings["providerType"],
  source: string,
  requestPayload: unknown
) => {
  console.info("[chat][provider:request]", {
    streamId,
    providerType,
    source,
    requestPayload: toRequestPreview(requestPayload)
  });
};

const getActiveProviderFromSettings = (settings: AppSettings) =>
  settings.providers.find((provider) => provider.id === settings.activeProviderId) ??
  settings.providers[0];

const buildAcpMcpConfigOverrides = (settings: AppSettings, enabledMcpServerIds?: string[]) => {
  const activeProvider = getActiveProviderFromSettings(settings);
  if (!activeProvider || activeProvider.providerType !== "acp") {
    return null;
  }

  const overrideMap = new Map<string, { enabled: boolean }>();

  for (const [name, override] of Object.entries(activeProvider.mcpServerOverrides ?? {})) {
    const key = name.trim();
    if (!key || !override || typeof override.enabled !== "boolean") {
      continue;
    }
    overrideMap.set(key, { enabled: override.enabled });
  }

  if (Array.isArray(enabledMcpServerIds)) {
    const enabledIdSet = new Set(
      enabledMcpServerIds
        .map((id) => id.trim())
        .filter(Boolean)
    );
    for (const server of settings.mcpServers ?? []) {
      const name = server.name.trim();
      if (!name) {
        continue;
      }
      overrideMap.set(name, { enabled: server.enabled && enabledIdSet.has(server.id) });
    }
  }

  if (!overrideMap.size) {
    return null;
  }

  return {
    mcp_servers: Object.fromEntries(overrideMap.entries())
  };
};

const fetchMcpServers = (): McpServerListResult => mcpManager.getServerListResult();

const fetchMcpServerStatuses = async (reload: boolean): Promise<McpServerStatusListResult> => {
  if (reload) {
    try {
      const configs = await listCodexMcpServers();
      return await mcpManager.reload(configs);
    } catch (error) {
      return {
        ok: false,
        message: `Failed to reload MCP servers. ${error instanceof Error ? error.message : "Unknown error."}`,
        servers: []
      };
    }
  }
  return mcpManager.getServerStatusResult();
};

const fetchModelIds = async (settings: AppSettings): Promise<ModelListResult> => {
  if (settings.providerType === "acp") {
    try {
      const models = await listCodexAcpModels({
        appVersion: app.getVersion(),
        createId
      });
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

  const baseUrl = normalizeBaseUrl(
    settings.baseUrl || (settings.providerType === "claude-agent" ? "https://api.anthropic.com" : "")
  );
  const apiKeys = parseApiKeys(settings.apiKey);
  if (!baseUrl || !apiKeys.length) {
    return settings.providerType === "claude-agent"
      ? { ok: false, message: "Please fill API key.", models: [] }
      : { ok: false, message: "Please fill Base URL and API key.", models: [] };
  }

  const isAnthropic = settings.providerType === "anthropic" || settings.providerType === "claude-agent";
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

const toOpenAiTools = (tools: McpToolWithServer[]) =>
  tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: `${tool.serverName}__${tool.name}`,
      description: tool.description ?? "",
      parameters: (tool.inputSchema as object | undefined) ?? { type: "object", properties: {} }
    }
  }));

const toAnthropicTools = (tools: McpToolWithServer[]) =>
  tools.map((tool) => ({
    name: `${tool.serverName}__${tool.name}`,
    description: tool.description ?? "",
    input_schema: (tool.inputSchema as object | undefined) ?? { type: "object", properties: {} }
  }));

const resolveEnabledMcpServerNames = (payload: ChatStreamRequest) => {
  const selectedIds = Array.isArray(payload.enabledMcpServerIds)
    ? payload.enabledMcpServerIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    : [];
  if (!selectedIds.length) {
    return new Set<string>();
  }

  const selectedIdSet = new Set(selectedIds);
  return new Set(
    (payload.settings.mcpServers ?? [])
      .filter((server) => server.enabled && selectedIdSet.has(server.id))
      .map((server) => server.name.trim())
      .filter(Boolean)
  );
};

const parseMcpToolName = (name: string): { serverName: string; toolName: string } | null => {
  const idx = name.indexOf("__");
  if (idx < 1) return null;
  return { serverName: name.slice(0, idx), toolName: name.slice(idx + 2) };
};

const streamOpenAICompatible = createStreamOpenAICompatible({
  mcpManager,
  sendStreamEvent,
  logChatRequestPayload,
  toOpenAiTools,
  resolveEnabledMcpServerNames,
  parseMcpToolName,
  toOpenAiStreamMessages
});

const streamAnthropic = createStreamAnthropic({
  mcpManager,
  sendStreamEvent,
  logChatRequestPayload,
  toAnthropicTools,
  resolveEnabledMcpServerNames,
  parseMcpToolName,
  toAnthropicContentBlocks
});

const streamCodexAcp = createStreamCodexAcp({
  sendStreamEvent,
  logChatRequestPayload,
  formatMessagesForAcpTurn,
  buildAcpMcpConfigOverrides,
  createId
});

const scanClaudeSkills = async () => {
  const skillsDir = path.join(os.homedir(), ".claude", "skills");
  if (!existsSync(skillsDir)) {
    return [];
  }
  const entries = await readdir(skillsDir);
  const results: Array<{ name: string; command: string; description: string; content: string }> = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const entryPath = path.join(skillsDir, entry);
    try {
      const s = await stat(entryPath);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }
    const skillFile = path.join(entryPath, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    try {
      const raw = await readFile(skillFile, "utf-8");
      const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (!fmMatch) continue;
      const fm = fmMatch[1];
      const body = fmMatch[2].trim();
      const nameMatch = fm.match(/^name:\s*(.+)$/m);
      const descMatch = fm.match(/^description:\s*["']?([\s\S]*?)["']?\s*$/m);
      const name = nameMatch?.[1]?.trim() ?? entry;
      const description = descMatch?.[1]?.replace(/^["']|["']$/g, "").trim() ?? "";
      results.push({ name, command: entry, description, content: body });
    } catch {
      // skip unreadable files
    }
  }
  return results;
};

const registerIpcHandlers = () => {
  registerSettingsHandlers(ipcMain, {
    settingsFile: SETTINGS_FILE,
    readJson,
    writeJson,
    mcpManager,
    runCodexCommand,
    isConnectionConfigured,
    fetchModelIds,
    fetchMcpServers,
    fetchMcpServerStatuses
  });

  registerEnvironmentHandlers(ipcMain, {
    getEnvironmentWeatherSnapshot,
    getEnvironmentDeviceStatus
  });

  registerStorageHandlers(ipcMain, {
    sessionsFile: SESSIONS_FILE,
    skillsFile: SKILLS_FILE,
    readJson,
    writeJson,
    scanClaudeSkills
  });

  registerMemosHandlers(ipcMain, {
    testMemosConnection,
    searchMemosMemory,
    addMemosMessage
  });

  registerSoulHandlers(ipcMain, {
    getSoulMarkdownDocument,
    saveSoulMarkdownDocument,
    getSoulMemoryMarkdownDocument,
    saveSoulMemoryMarkdownDocument,
    getSoulAutomationState,
    saveSoulAutomationState,
    getJournalEntry,
    saveJournalEntry,
    listJournalDates
  });

  registerChatHandlers(ipcMain, {
    isSettingsConfigured,
    createId,
    streamControllers,
    streamOpenAICompatible,
    streamAnthropic,
    streamCodexAcp,
    normalizeRequestTimeoutMs,
    normalizeRetryCount,
    parseApiKeys,
    createSseDebugLogger,
    runStreamWithTimeout,
    isAbortError,
    sendStreamEvent
  });
};

const createMainWindow = () => {
  const preloadPath = path.join(__dirname, "preload.cjs");
  const iconPath = resolveAppIconPath();
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#f3f5f8",
    titleBarStyle: "hiddenInset",
    ...(iconPath ? { icon: iconPath } : {}),
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
  const iconPath = resolveAppIconPath();
  if (iconPath && process.platform === "darwin") {
    app.dock?.setIcon(iconPath);
  }

  registerIpcHandlers();
  registerAgentIpcHandlers();
  createMainWindow();

  // Initialize MCP manager from saved settings; fall back to Codex config if empty
  void readJson<Partial<AppSettings>>(SETTINGS_FILE, {})
    .then((saved) => {
      const settings = normalizeSettings(saved);
      if (settings.mcpServers.length) {
        return mcpManager.initializeFromUserServers(settings.mcpServers);
      }
      return listCodexMcpServers()
        .then((configs) => mcpManager.initialize(configs))
        .catch(() => undefined);
    })
    .catch(() => undefined);

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

app.on("before-quit", () => {
  mcpManager.destroy();
});
