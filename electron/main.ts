import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { registerAgentIpcHandlers } from "./agent/agent-ipc";
import { buildAcpMcpConfigOverrides } from "./chat/acp-mcp-overrides";
import {
  formatMessagesForAcpTurn,
  toAnthropicContentBlocks,
  toOpenAiStreamMessages
} from "./chat/message-formatters";
import { createStreamCodexAcp } from "./chat/stream-runners/acp";
import { createStreamAnthropic } from "./chat/stream-runners/anthropic";
import { createStreamOpenAICompatible } from "./chat/stream-runners/openai";
import {
  listCodexMcpServers,
  runCodexCommand
} from "./codex/codex-runtime";
import {
  createSseDebugLogger,
  isAbortError,
  logChatRequestPayload,
  runStreamWithTimeout
} from "./chat/stream-utils";
import { McpManager, type McpToolWithServer } from "./mcp/mcp-manager";
import { addMemosMessage, searchMemosMemory, testMemosConnection } from "./memos/memos-client";
import { getEnvironmentDeviceStatus, getEnvironmentWeatherSnapshot } from "./env/env-context-service";
import { registerChatHandlers } from "./ipc/register-chat-handlers";
import { registerEnvironmentHandlers } from "./ipc/register-environment-handlers";
import { registerMemosHandlers } from "./ipc/register-memos-handlers";
import { registerProfileHandlers } from "./ipc/register-profile-handlers";
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
  deleteProfileItem,
  getProfileAutomationState,
  getProfileDailyNote,
  getProfileSnapshotMarkdown,
  listProfileDailyNotes,
  listProfileEvidence,
  listProfileItems,
  replaceAutoProfile,
  saveManualProfileItem,
  saveProfileAutomationState,
  updateProfileItemStatus,
  upsertProfileDailyNote
} from "./profile/profile-service";
import { type AppSettings, type ChatStreamEvent, type ChatStreamRequest, type McpServerListResult, type McpServerStatusListResult, type StreamEnvelope } from "../src/shared/contracts";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/domain/settings/normalize";
import {
  clampInteger,
  parseApiKeys
} from "../src/domain/provider/utils";
import { createFetchModelIds } from "./settings/model-fetcher";
import { scanClaudeSkills } from "./storage/claude-skill-scanner";

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

const fetchModelIds = createFetchModelIds({ createId });

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

  registerProfileHandlers(ipcMain, {
    listProfileDailyNotes,
    getProfileDailyNote,
    upsertProfileDailyNote,
    listProfileItems,
    listProfileEvidence,
    replaceAutoProfile,
    saveManualProfileItem,
    updateProfileItemStatus,
    deleteProfileItem,
    getProfileSnapshotMarkdown,
    getProfileAutomationState,
    saveProfileAutomationState
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
