import { type AppSettings, type ChatAttachment, type ChatSession, type ChatStreamEvent, type ChatStreamRequest, type ChatUsage, type CompletionMessage, type ConnectionTestResult, type EnvironmentDeviceStatus, type EnvironmentWeatherRequest, type EnvironmentWeatherSnapshot, type MemosAddPayload, type MemosAddResult, type MemosSearchPayload, type MemosSearchResult, type ModelListResult, type McpServerListResult, type McpServerStatusListResult, type SoulAutomationState, type Skill, type UserProfileAutomationState, type UserProfileDailyNote, type UserProfileEvidence, type UserProfileItem, type UserProfileItemDraft, type UserProfileManualItemPayload, type UserProfileItemStatus, type UserProfileLayer } from "../shared/contracts";
import { DEFAULT_SETTINGS, normalizeSettings } from "../domain/settings/normalize";
import {
  clampInteger,
  extractModelIds,
  normalizeBaseUrl,
  parseApiKeys,
  resolveAnthropicEndpoint
} from "../domain/provider/utils";
import type {
  AgentMessage,
  AgentResolvePermissionRequest,
  AgentResolvePermissionResult,
  AgentSendMessageRequest,
  AgentSendMessageResult,
  AgentSessionMeta,
  AgentStreamEnvelope
} from "../shared/agent-contracts";

export type MuApi = {
  settings: {
    get: () => Promise<AppSettings>;
    save: (settings: AppSettings) => Promise<void>;
    testConnection: (settings: AppSettings) => Promise<ConnectionTestResult>;
    listModels: (settings: AppSettings) => Promise<ModelListResult>;
    listMcpServers: (settings: AppSettings) => Promise<McpServerListResult>;
    listMcpServerStatus: (settings: AppSettings) => Promise<McpServerStatusListResult>;
    reloadMcpServers: (settings: AppSettings) => Promise<McpServerStatusListResult>;
  };
  sessions: {
    get: () => Promise<ChatSession[]>;
    save: (sessions: ChatSession[]) => Promise<void>;
  };
  env: {
    getWeatherSnapshot: (payload: EnvironmentWeatherRequest) => Promise<EnvironmentWeatherSnapshot>;
    getSystemStatus: () => Promise<EnvironmentDeviceStatus>;
  };
  memos: {
    testConnection: (settings: AppSettings) => Promise<ConnectionTestResult>;
    searchMemory: (payload: MemosSearchPayload) => Promise<MemosSearchResult>;
    addMessage: (payload: MemosAddPayload) => Promise<MemosAddResult>;
  };
  chat: {
    startStream: (payload: ChatStreamRequest) => Promise<{ streamId: string }>;
    stopStream: (streamId: string) => Promise<void>;
    onStreamEvent: (
      streamId: string,
      listener: (event: ChatStreamEvent) => void
    ) => () => void;
  };
  agent: {
    listSessions: () => Promise<AgentSessionMeta[]>;
    createSession: (title?: string) => Promise<AgentSessionMeta>;
    deleteSession: (sessionId: string) => Promise<void>;
    updateSessionTitle: (payload: { sessionId: string; title: string }) => Promise<AgentSessionMeta>;
    getMessages: (sessionId: string) => Promise<AgentMessage[]>;
    sendMessage: (payload: AgentSendMessageRequest) => Promise<AgentSendMessageResult>;
    stop: (payload: { runId?: string; sessionId?: string }) => Promise<void>;
    resolvePermission: (payload: AgentResolvePermissionRequest) => Promise<AgentResolvePermissionResult>;
    onStreamEvent: (
      runId: string,
      listener: (payload: AgentStreamEnvelope) => void
    ) => () => void;
  };
  skills: {
    get: () => Promise<Skill[]>;
    save: (skills: Skill[]) => Promise<void>;
    scanClaude: () => Promise<Array<{ name: string; command: string; description: string; content: string }>>;
  };
  soul: {
    getMarkdown: () => Promise<string>;
    saveMarkdown: (markdown: string) => Promise<void>;
    getMemoryMarkdown: () => Promise<string>;
    saveMemoryMarkdown: (markdown: string) => Promise<void>;
    getAutomationState: () => Promise<SoulAutomationState>;
    saveAutomationState: (state: SoulAutomationState) => Promise<SoulAutomationState>;
    getJournalEntry: (date: string) => Promise<string | null>;
    saveJournalEntry: (date: string, markdown: string) => Promise<void>;
    listJournalDates: () => Promise<string[]>;
  };
  profile: {
    listDailyNotes: () => Promise<UserProfileDailyNote[]>;
    getDailyNote: (date: string) => Promise<UserProfileDailyNote | null>;
    upsertDailyNote: (note: {
      date: string;
      summaryMarkdown: string;
      sourceMessageCount: number;
      source?: "auto" | "manual";
    }) => Promise<UserProfileDailyNote>;
    listItems: (layer?: UserProfileLayer) => Promise<UserProfileItem[]>;
    listEvidence: (profileItemId: string) => Promise<UserProfileEvidence[]>;
    replaceAutoProfile: (payload: {
      items: UserProfileItemDraft[];
      snapshotMarkdown: string;
    }) => Promise<UserProfileItem[]>;
    saveManualItem: (payload: UserProfileManualItemPayload) => Promise<UserProfileItem>;
    updateItemStatus: (payload: {
      itemId: string;
      status: UserProfileItemStatus;
    }) => Promise<UserProfileItem | null>;
    deleteItem: (itemId: string) => Promise<void>;
    getSnapshotMarkdown: () => Promise<string>;
    getAutomationState: () => Promise<UserProfileAutomationState>;
    saveAutomationState: (state: UserProfileAutomationState) => Promise<UserProfileAutomationState>;
  };
};

const SETTINGS_KEY = "mu.settings.v1";
const SESSIONS_KEY = "mu.sessions.v1";
const AGENT_SESSIONS_KEY = "mu.agent.sessions.v1";
const AGENT_MESSAGES_KEY = "mu.agent.messages.v1";
const SOUL_MARKDOWN_KEY = "mu.soul.markdown.v1";
const SOUL_MEMORY_MARKDOWN_KEY = "mu.soul.memory.markdown.v1";
const SOUL_AUTOMATION_STATE_KEY = "mu.soul.automation.state.v1";
const PROFILE_SNAPSHOT_MARKDOWN_KEY = "mu.profile.snapshot.markdown.v1";
const PROFILE_DAILY_NOTES_KEY = "mu.profile.daily-notes.v1";
const PROFILE_ITEMS_KEY = "mu.profile.items.v1";
const PROFILE_EVIDENCE_KEY = "mu.profile.evidence.v1";
const PROFILE_AUTOMATION_STATE_KEY = "mu.profile.automation.state.v1";
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

const createFallbackSoulAutomationState = (): SoulAutomationState => ({});
const createFallbackProfileAutomationState = (): UserProfileAutomationState => ({});

const renderFallbackProfileSnapshot = (items: UserProfileItem[]) => {
  const labels: Record<UserProfileLayer, string> = {
    preferences: "偏好与习惯",
    background: "人生背景与长期状态",
    relationship: "关系画像"
  };
  const activeItems = items.filter((item) => item.status === "active");
  if (!activeItems.length) {
    return "";
  }
  const sections = (Object.keys(labels) as UserProfileLayer[])
    .map((layer) => {
      const layerItems = activeItems.filter((item) => item.layer === layer);
      if (!layerItems.length) {
        return "";
      }
      return `## ${labels[layer]}\n\n${layerItems
        .map(
          (item) =>
            `- **${item.title}**（置信度 ${Math.round(item.confidence * 100)}%）：${item.description}`
        )
        .join("\n")}`;
    })
    .filter(Boolean);
  return `${[`# 用户画像快照`, "", ...sections].join("\n")}\n`;
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

const nowIso = () => new Date().toISOString();

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const readAgentSessions = () => readLocalStorage<AgentSessionMeta[]>(AGENT_SESSIONS_KEY, []);

const writeAgentSessions = (sessions: AgentSessionMeta[]) => {
  writeLocalStorage(AGENT_SESSIONS_KEY, sessions);
};

const readAgentMessagesMap = () =>
  readLocalStorage<Record<string, AgentMessage[]>>(AGENT_MESSAGES_KEY, {});

const writeAgentMessagesMap = (messagesMap: Record<string, AgentMessage[]>) => {
  writeLocalStorage(AGENT_MESSAGES_KEY, messagesMap);
};

const readString = (value: unknown) => (typeof value === "string" ? value : "");

const extractTextFromUnknown = (value: unknown): string => {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (entry && typeof entry === "object") {
          const block = entry as { text?: unknown; content?: unknown };
          return readString(block.text) || readString(block.content);
        }
        return "";
      })
      .join("");
  }
  if (typeof value === "object") {
    const block = value as { text?: unknown; content?: unknown };
    return readString(block.text) || readString(block.content);
  }
  return "";
};

const extractOpenAiLikeDeltas = (delta: unknown): { content: string; reasoning: string } => {
  if (!delta || typeof delta !== "object") {
    return { content: "", reasoning: "" };
  }

  const source = delta as {
    content?: unknown;
    reasoning_content?: unknown;
    reasoning?: unknown;
    reasoningContent?: unknown;
    thinking?: unknown;
  };

  return {
    content: extractTextFromUnknown(source.content),
    reasoning:
      extractTextFromUnknown(source.reasoning_content) ||
      extractTextFromUnknown(source.reasoningContent) ||
      extractTextFromUnknown(source.reasoning) ||
      extractTextFromUnknown(source.thinking)
  };
};

const extractAnthropicDeltas = (payload: unknown): { content: string; reasoning: string } => {
  if (!payload || typeof payload !== "object") {
    return { content: "", reasoning: "" };
  }

  const source = payload as {
    delta?: {
      type?: unknown;
      text?: unknown;
      thinking?: unknown;
    };
  };

  const delta = source.delta;
  if (!delta || typeof delta !== "object") {
    return { content: "", reasoning: "" };
  }

  const deltaType = readString((delta as { type?: unknown }).type);
  const text = readString((delta as { text?: unknown }).text);
  const thinking = readString((delta as { thinking?: unknown }).thinking);

  if (deltaType === "thinking_delta") {
    return { content: "", reasoning: thinking };
  }

  return { content: text, reasoning: thinking };
};

const toTokenNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
};

const pickLargestTokenNumber = (...values: unknown[]) => {
  let resolved: number | undefined;
  for (const value of values) {
    const token = toTokenNumber(value);
    if (token === undefined) {
      continue;
    }
    resolved = resolved === undefined ? token : Math.max(resolved, token);
  }
  return resolved;
};

const readNestedTokenNumber = (
  source: Record<string, unknown>,
  key: string,
  nestedKey: string
) => {
  const nested = source[key];
  if (!nested || typeof nested !== "object") {
    return undefined;
  }
  return toTokenNumber((nested as Record<string, unknown>)[nestedKey]);
};

const extractOpenAiUsage = (payload: unknown): ChatUsage | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const source = payload as { usage?: Record<string, unknown> };
  if (!source.usage || typeof source.usage !== "object") {
    return undefined;
  }

  const usage = source.usage;
  const inputTokens = toTokenNumber(usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens);
  const outputTokens = toTokenNumber(
    usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens
  );
  const totalTokens = toTokenNumber(usage.total_tokens ?? usage.totalTokens);
  const cacheReadTokens = pickLargestTokenNumber(
    usage.cached_tokens,
    usage.cache_read_input_tokens,
    readNestedTokenNumber(usage, "prompt_tokens_details", "cached_tokens"),
    readNestedTokenNumber(usage, "input_tokens_details", "cached_tokens")
  );
  const cacheWriteTokens = toTokenNumber(usage.cache_creation_input_tokens);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens,
    cacheWriteTokens
  };
};

const extractAnthropicUsage = (payload: unknown): ChatUsage | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const source = payload as {
    usage?: Record<string, unknown>;
    message?: { usage?: Record<string, unknown> };
    delta?: { usage?: Record<string, unknown> };
  };
  const usageSource = source.usage ?? source.message?.usage ?? source.delta?.usage;
  if (!usageSource || typeof usageSource !== "object") {
    return undefined;
  }

  const inputTokens = toTokenNumber(usageSource.input_tokens ?? usageSource.inputTokens);
  const outputTokens = toTokenNumber(usageSource.output_tokens ?? usageSource.outputTokens);
  const cacheReadTokens = toTokenNumber(
    usageSource.cache_read_input_tokens ?? usageSource.cacheReadTokens
  );
  const cacheWriteTokens = toTokenNumber(
    usageSource.cache_creation_input_tokens ?? usageSource.cacheWriteTokens
  );
  const totalTokens = toTokenNumber(usageSource.total_tokens ?? usageSource.totalTokens);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      totalTokens ??
      (inputTokens !== undefined || outputTokens !== undefined
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined),
    cacheReadTokens,
    cacheWriteTokens
  };
};

const logProviderUsage = (
  streamId: string,
  providerType: AppSettings["providerType"],
  source: string,
  usage: ChatUsage,
  rawData: string
) => {
  console.info("[usage][provider:fallback]", {
    streamId,
    providerType,
    source,
    usage,
    rawData
  });
};

const toAttachmentMetaText = (attachment: ChatAttachment) =>
  `[Attachment: ${attachment.name} | ${attachment.mimeType || "unknown"} | ${attachment.size} bytes]`;

const toTextAttachmentBlock = (attachment: ChatAttachment) =>
  `${toAttachmentMetaText(attachment)}\n${attachment.textContent?.trim() ?? ""}`;

const parseDataUrl = (dataUrl: string) => {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    return null;
  }
  return { mediaType: match[1], data: match[2] };
};

const buildOpenAiMessageContent = (message: CompletionMessage) => {
  const parts: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = [];

  const prompt = message.content.trim();
  if (prompt) {
    parts.push({ type: "text", text: prompt });
  }

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === "text" && attachment.textContent?.trim()) {
      parts.push({ type: "text", text: toTextAttachmentBlock(attachment) });
      continue;
    }

    if (attachment.kind === "image" && attachment.imageDataUrl?.trim()) {
      parts.push({
        type: "image_url",
        image_url: { url: attachment.imageDataUrl.trim() }
      });
      continue;
    }

    parts.push({ type: "text", text: toAttachmentMetaText(attachment) });
  }

  if (!parts.length) {
    return null;
  }
  if (parts.length === 1 && parts[0].type === "text") {
    return parts[0].text;
  }
  return parts;
};

const toOpenAiStreamMessages = (messages: CompletionMessage[]) =>
  messages
    .map((message) => {
      const content = buildOpenAiMessageContent(message);
      if (!content) {
        return null;
      }
      return {
        role: message.role,
        content
      };
    })
    .filter(
      (
        message
      ): message is {
        role: CompletionMessage["role"];
        content:
          | string
          | Array<
              { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
            >;
      } => Boolean(message)
    );

const toAnthropicContentBlocks = (message: CompletionMessage) => {
  const blocks: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  > = [];

  const prompt = message.content.trim();
  if (prompt) {
    blocks.push({ type: "text", text: prompt });
  }

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === "text" && attachment.textContent?.trim()) {
      blocks.push({ type: "text", text: toTextAttachmentBlock(attachment) });
      continue;
    }

    if (attachment.kind === "image" && attachment.imageDataUrl?.trim()) {
      const source = parseDataUrl(attachment.imageDataUrl);
      if (source) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: source.mediaType,
            data: source.data
          }
        });
        continue;
      }
    }

    blocks.push({ type: "text", text: toAttachmentMetaText(attachment) });
  }

  return blocks;
};

const createBrowserFallbackApi = (): MuApi => {
  const listeners = new Map<string, Set<(event: ChatStreamEvent) => void>>();
  const controllers = new Map<string, AbortController>();
  const agentListeners = new Map<string, Set<(payload: AgentStreamEnvelope) => void>>();
  const agentRunTimers = new Map<string, number>();

  const emit = (streamId: string, event: ChatStreamEvent) => {
    const streamListeners = listeners.get(streamId);
    if (!streamListeners) {
      return;
    }
    streamListeners.forEach((listener) => listener(event));
  };

  const emitAgent = (payload: AgentStreamEnvelope) => {
    const runListeners = agentListeners.get(payload.runId);
    if (runListeners) {
      runListeners.forEach((listener) => listener(payload));
    }
    const wildcardListeners = agentListeners.get("*");
    if (wildcardListeners) {
      wildcardListeners.forEach((listener) => listener(payload));
    }
  };

  return {
    settings: {
      get: async () => {
        const saved = readLocalStorage<Partial<AppSettings>>(SETTINGS_KEY, {});
        return normalizeSettings(saved);
      },
      save: async (settings) => writeLocalStorage(SETTINGS_KEY, normalizeSettings(settings)),
      testConnection: async (settings) => {
        if (settings.providerType === "acp") {
          return {
            ok: false,
            message: "ACP is only available in the Electron desktop runtime."
          };
        }
        const baseUrl = normalizeBaseUrl(
          settings.baseUrl || (settings.providerType === "claude-agent" ? "https://api.anthropic.com" : "")
        );
        const apiKeys = parseApiKeys(settings.apiKey);
        if (!baseUrl || !apiKeys.length) {
          return settings.providerType === "claude-agent"
            ? { ok: false, message: "Missing API key." }
            : { ok: false, message: "Missing Base URL or API key." };
        }
        try {
          const isAnthropic =
            settings.providerType === "anthropic" || settings.providerType === "claude-agent";
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
        const baseUrl = normalizeBaseUrl(
          settings.baseUrl || (settings.providerType === "claude-agent" ? "https://api.anthropic.com" : "")
        );
        const apiKeys = parseApiKeys(settings.apiKey);
        if (!baseUrl || !apiKeys.length) {
          return settings.providerType === "claude-agent"
            ? { ok: false, message: "Missing API key.", models: [] }
            : { ok: false, message: "Missing Base URL or API key.", models: [] };
        }

        const isAnthropic =
          settings.providerType === "anthropic" || settings.providerType === "claude-agent";
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
      },
      listMcpServers: async () => ({
        ok: false,
        message: "MCP server management is only available in the Electron desktop runtime.",
        servers: []
      }),
      listMcpServerStatus: async () => ({
        ok: false,
        message: "MCP server status is only available in the Electron desktop runtime.",
        servers: []
      }),
      reloadMcpServers: async () => ({
        ok: false,
        message: "MCP server reload is only available in the Electron desktop runtime.",
        servers: []
      })
    },
    sessions: {
      get: async () => readLocalStorage<ChatSession[]>(SESSIONS_KEY, []),
      save: async (sessions) => writeLocalStorage(SESSIONS_KEY, sessions)
    },
    env: {
      getWeatherSnapshot: async () => ({
        status: "unavailable" as const,
        source: "open-meteo" as const,
        reason: "environment_weather_ipc_unavailable"
      }),
      getSystemStatus: async () => ({})
    },
    memos: {
      testConnection: async () => ({
        ok: false,
        message: "MemOS integration is only available in the Electron desktop runtime."
      }),
      searchMemory: async () => ({
        ok: false,
        message: "MemOS integration is only available in the Electron desktop runtime.",
        memories: []
      }),
      addMessage: async () => ({
        ok: false,
        message: "MemOS integration is only available in the Electron desktop runtime."
      })
    },
    chat: {
      startStream: async ({ settings, messages }) => {
        if (settings.providerType === "acp" || settings.providerType === "claude-agent") {
          throw new Error(
            settings.providerType === "claude-agent"
              ? "Claude Agent provider is only available in Agent mode."
              : "ACP is only available in the Electron desktop runtime."
          );
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
          const isAnthropic =
            settings.providerType === "anthropic" || settings.providerType === "claude-agent";
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
                    .filter((message) => message.role !== "system")
                    .map((message) => ({
                      role: message.role as "user" | "assistant",
                      content: toAnthropicContentBlocks(message)
                    }))
                    .filter((message) => message.content.length)
                };
              })()
            : {
                model: settings.model.trim(),
                stream: true,
                stream_options: { include_usage: true },
                messages: toOpenAiStreamMessages(messages)
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
                        choices?: Array<{ delta?: unknown; finish_reason?: string }>;
                        type?: string;
                        usage?: Record<string, unknown>;
                        message?: { usage?: Record<string, unknown> };
                        delta?: {
                          usage?: Record<string, unknown>;
                          type?: string;
                          text?: string;
                          thinking?: string;
                        };
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

                      const deltas = isAnthropic
                        ? extractAnthropicDeltas(parsed)
                        : extractOpenAiLikeDeltas(parsed.choices?.[0]?.delta);
                      const usage = isAnthropic
                        ? extractAnthropicUsage(parsed)
                        : extractOpenAiUsage(parsed);
                      if (usage) {
                        logProviderUsage(
                          streamId,
                          settings.providerType,
                          isAnthropic ? "anthropic-sse" : "openai-sse",
                          usage,
                          data
                        );
                        emit(streamId, { type: "usage", usage });
                      }
                      if (deltas.content) {
                        emittedDelta = true;
                        emit(streamId, { type: "delta", delta: deltas.content });
                      }
                      if (deltas.reasoning) {
                        emittedDelta = true;
                        emit(streamId, { type: "reasoning", delta: deltas.reasoning });
                      }

                      if (!isAnthropic && parsed.choices?.[0]?.finish_reason) {
                        // OpenAI-compatible providers may send usage in a trailing chunk.
                        continue;
                      }

                      if (isAnthropic && parsed.type === "message_stop") {
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
    },
    agent: {
      listSessions: async () => readAgentSessions(),
      createSession: async (title) => {
        const now = nowIso();
        const nextSession: AgentSessionMeta = {
          id: createId(),
          title: title?.trim() || "New Agent Session",
          createdAt: now,
          updatedAt: now
        };
        const nextSessions = [nextSession, ...readAgentSessions()];
        writeAgentSessions(nextSessions);
        return nextSession;
      },
      deleteSession: async (sessionId) => {
        const nextSessions = readAgentSessions().filter((session) => session.id !== sessionId);
        writeAgentSessions(nextSessions);
        const messagesMap = readAgentMessagesMap();
        delete messagesMap[sessionId];
        writeAgentMessagesMap(messagesMap);
      },
      updateSessionTitle: async ({ sessionId, title }) => {
        const normalizedTitle = title.trim();
        if (!normalizedTitle) {
          throw new Error("Session title cannot be empty.");
        }
        const sessions = readAgentSessions();
        const target = sessions.find((session) => session.id === sessionId);
        if (!target) {
          throw new Error("Agent session not found.");
        }
        const next: AgentSessionMeta = {
          ...target,
          title: normalizedTitle,
          updatedAt: nowIso()
        };
        const nextSessions = [next, ...sessions.filter((session) => session.id !== sessionId)];
        writeAgentSessions(nextSessions);
        return next;
      },
      getMessages: async (sessionId) => readAgentMessagesMap()[sessionId] ?? [],
      sendMessage: async (payload) => {
        const runId = createId();
        const sessions = readAgentSessions();
        const target = sessions.find((session) => session.id === payload.sessionId);
        if (!target) {
          throw new Error("Agent session not found.");
        }

        const nextUserMessage: AgentMessage = {
          id: createId(),
          sessionId: payload.sessionId,
          role: "user",
          content: payload.input.trim(),
          createdAt: nowIso(),
          attachments: payload.attachments?.length ? payload.attachments : undefined,
          runId,
          status: "completed"
        };

        const messagesMap = readAgentMessagesMap();
        const currentMessages = messagesMap[payload.sessionId] ?? [];
        messagesMap[payload.sessionId] = [...currentMessages, nextUserMessage];
        writeAgentMessagesMap(messagesMap);

        const timeoutId = window.setTimeout(() => {
          emitAgent({
            sessionId: payload.sessionId,
            runId,
            seq: 1,
            timestamp: nowIso(),
            event: {
              type: "error",
              message: "Claude Agent SDK is only available in the Electron desktop runtime."
            }
          });
          agentRunTimers.delete(runId);
        }, 0);
        agentRunTimers.set(runId, timeoutId);

        return { runId };
      },
      stop: async ({ runId }) => {
        if (!runId) {
          return;
        }
        const timeoutId = agentRunTimers.get(runId);
        if (typeof timeoutId === "number") {
          window.clearTimeout(timeoutId);
          agentRunTimers.delete(runId);
        }
      },
      resolvePermission: async () => ({ ok: false }),
      onStreamEvent: (runId, listener) => {
        if (runId === "*") {
          const wildcardHandler = (payload: AgentStreamEnvelope) => {
            listener(payload);
          };
          const wildcardBucket =
            agentListeners.get("*") ?? new Set<(payload: AgentStreamEnvelope) => void>();
          wildcardBucket.add(wildcardHandler);
          agentListeners.set("*", wildcardBucket);

          return () => {
            const currentWildcard = agentListeners.get("*");
            if (!currentWildcard) {
              return;
            }
            currentWildcard.delete(wildcardHandler);
            if (!currentWildcard.size) {
              agentListeners.delete("*");
            }
          };
        }

        const bucket = agentListeners.get(runId) ?? new Set<(payload: AgentStreamEnvelope) => void>();
        bucket.add(listener);
        agentListeners.set(runId, bucket);

        return () => {
          const current = agentListeners.get(runId);
          if (!current) {
            return;
          }
          current.delete(listener);
          if (!current.size) {
            agentListeners.delete(runId);
          }
        };
      }
    },
    skills: {
      get: async () => readLocalStorage<Skill[]>("mu.skills.v1", []),
      save: async (skills) => writeLocalStorage("mu.skills.v1", skills),
      scanClaude: async () => []
    },
    soul: {
      getMarkdown: async () => readLocalStorage<string>(SOUL_MARKDOWN_KEY, ""),
      saveMarkdown: async (markdown) => writeLocalStorage(SOUL_MARKDOWN_KEY, markdown),
      getMemoryMarkdown: async () => readLocalStorage<string>(SOUL_MEMORY_MARKDOWN_KEY, ""),
      saveMemoryMarkdown: async (markdown) => writeLocalStorage(SOUL_MEMORY_MARKDOWN_KEY, markdown),
      getAutomationState: async () =>
        readLocalStorage<SoulAutomationState>(
          SOUL_AUTOMATION_STATE_KEY,
          createFallbackSoulAutomationState()
        ),
      saveAutomationState: async (state) => {
        writeLocalStorage(SOUL_AUTOMATION_STATE_KEY, state);
        return state;
      },
      getJournalEntry: async () => null,
      saveJournalEntry: async () => {},
      listJournalDates: async () => []
    },
    profile: {
      listDailyNotes: async () => readLocalStorage<UserProfileDailyNote[]>(PROFILE_DAILY_NOTES_KEY, []),
      getDailyNote: async (date) =>
        readLocalStorage<UserProfileDailyNote[]>(PROFILE_DAILY_NOTES_KEY, []).find((note) => note.date === date) ??
        null,
      upsertDailyNote: async (note) => {
        const existing = readLocalStorage<UserProfileDailyNote[]>(PROFILE_DAILY_NOTES_KEY, []);
        const now = nowIso();
        const source = note.source ?? "auto";
        const current = existing.find((entry) => entry.date === note.date);
        if (current?.source === "manual" && source === "auto") {
          return current;
        }
        const nextNote: UserProfileDailyNote = current
          ? {
              ...current,
              summaryMarkdown: note.summaryMarkdown,
              sourceMessageCount: note.sourceMessageCount,
              source,
              updatedAt: now
            }
          : {
              id: createId(),
              date: note.date,
              summaryMarkdown: note.summaryMarkdown,
              sourceMessageCount: note.sourceMessageCount,
              source,
              createdAt: now,
              updatedAt: now
            };
        const nextNotes = [...existing.filter((entry) => entry.date !== note.date), nextNote].sort((left, right) =>
          right.date.localeCompare(left.date)
        );
        writeLocalStorage(PROFILE_DAILY_NOTES_KEY, nextNotes);
        return nextNote;
      },
      listItems: async (layer) => {
        const items = readLocalStorage<UserProfileItem[]>(PROFILE_ITEMS_KEY, []);
        return layer ? items.filter((item) => item.layer === layer) : items;
      },
      listEvidence: async (profileItemId) =>
        readLocalStorage<UserProfileEvidence[]>(PROFILE_EVIDENCE_KEY, []).filter(
          (evidence) => evidence.profileItemId === profileItemId
        ),
      replaceAutoProfile: async (payload) => {
        const now = nowIso();
        const existingItems = readLocalStorage<UserProfileItem[]>(PROFILE_ITEMS_KEY, []);
        const existingEvidence = readLocalStorage<UserProfileEvidence[]>(PROFILE_EVIDENCE_KEY, []);
        const manualItems = existingItems.filter((item) => item.source === "manual");
        const manualEvidence = existingEvidence.filter((entry) =>
          manualItems.some((item) => item.id === entry.profileItemId)
        );
        const autoItems: UserProfileItem[] = payload.items.map((item) => ({
          id: createId(),
          layer: item.layer,
          title: item.title,
          description: item.description,
          confidence: item.confidence,
          status: "active",
          source: "auto",
          lastConfirmedAt: now,
          createdAt: now,
          updatedAt: now
        }));
        const autoEvidence: UserProfileEvidence[] = autoItems.flatMap((item, index) =>
          payload.items[index].evidence.map((entry) => ({
            id: createId(),
            profileItemId: item.id,
            dailyNoteDate: entry.dailyNoteDate,
            excerpt: entry.excerpt,
            weight: entry.weight ?? 1,
            createdAt: now
          }))
        );
        const nextItems = [...manualItems, ...autoItems];
        writeLocalStorage(PROFILE_ITEMS_KEY, nextItems);
        writeLocalStorage(PROFILE_EVIDENCE_KEY, [...manualEvidence, ...autoEvidence]);
        writeLocalStorage(PROFILE_SNAPSHOT_MARKDOWN_KEY, renderFallbackProfileSnapshot(nextItems));
        return nextItems;
      },
      saveManualItem: async (payload) => {
        const now = nowIso();
        const items = readLocalStorage<UserProfileItem[]>(PROFILE_ITEMS_KEY, []);
        const evidence = readLocalStorage<UserProfileEvidence[]>(PROFILE_EVIDENCE_KEY, []);
        const itemId = payload.itemId?.trim() || createId();
        const current = items.find((item) => item.id === itemId);
        const nextItem: UserProfileItem = {
          id: itemId,
          layer: payload.layer,
          title: payload.title.trim(),
          description: payload.description.trim(),
          confidence: payload.confidence,
          status: payload.status ?? current?.status ?? "active",
          source: "manual",
          lastConfirmedAt: now,
          createdAt: current?.createdAt ?? now,
          updatedAt: now
        };
        const nextItems = [...items.filter((item) => item.id !== itemId), nextItem];
        const nextEvidence = [
          ...evidence.filter((entry) => entry.profileItemId !== itemId),
          ...payload.evidence
            .filter((entry) => entry.dailyNoteDate.trim() && entry.excerpt.trim())
            .map((entry) => ({
              id: createId(),
              profileItemId: itemId,
              dailyNoteDate: entry.dailyNoteDate.trim(),
              excerpt: entry.excerpt.trim(),
              weight: entry.weight ?? 1,
              createdAt: now
            }))
        ];
        writeLocalStorage(PROFILE_ITEMS_KEY, nextItems);
        writeLocalStorage(PROFILE_EVIDENCE_KEY, nextEvidence);
        writeLocalStorage(PROFILE_SNAPSHOT_MARKDOWN_KEY, renderFallbackProfileSnapshot(nextItems));
        return nextItem;
      },
      updateItemStatus: async ({ itemId, status }) => {
        const items = readLocalStorage<UserProfileItem[]>(PROFILE_ITEMS_KEY, []);
        let updated: UserProfileItem | null = null;
        const nextItems = items.map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          updated = { ...item, status, updatedAt: nowIso() };
          return updated;
        });
        writeLocalStorage(PROFILE_ITEMS_KEY, nextItems);
        writeLocalStorage(PROFILE_SNAPSHOT_MARKDOWN_KEY, renderFallbackProfileSnapshot(nextItems));
        return updated;
      },
      deleteItem: async (itemId) => {
        const items = readLocalStorage<UserProfileItem[]>(PROFILE_ITEMS_KEY, []).filter(
          (item) => item.id !== itemId
        );
        const evidence = readLocalStorage<UserProfileEvidence[]>(PROFILE_EVIDENCE_KEY, []).filter(
          (item) => item.profileItemId !== itemId
        );
        writeLocalStorage(PROFILE_ITEMS_KEY, items);
        writeLocalStorage(PROFILE_EVIDENCE_KEY, evidence);
        writeLocalStorage(PROFILE_SNAPSHOT_MARKDOWN_KEY, renderFallbackProfileSnapshot(items));
      },
      getSnapshotMarkdown: async () => readLocalStorage<string>(PROFILE_SNAPSHOT_MARKDOWN_KEY, ""),
      getAutomationState: async () =>
        readLocalStorage<UserProfileAutomationState>(
          PROFILE_AUTOMATION_STATE_KEY,
          createFallbackProfileAutomationState()
        ),
      saveAutomationState: async (state) => {
        writeLocalStorage(PROFILE_AUTOMATION_STATE_KEY, state);
        return state;
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
    const fallbackApi = createBrowserFallbackApi();
    const runtimeApi = window.muApi as Partial<MuApi>;
    cachedApi = {
      settings: runtimeApi.settings ?? fallbackApi.settings,
      sessions: runtimeApi.sessions ?? fallbackApi.sessions,
      env: runtimeApi.env ?? fallbackApi.env,
      memos: runtimeApi.memos ?? fallbackApi.memos,
      chat: runtimeApi.chat ?? fallbackApi.chat,
      agent: runtimeApi.agent ?? fallbackApi.agent,
      skills: runtimeApi.skills ?? fallbackApi.skills,
      soul: runtimeApi.soul ?? fallbackApi.soul,
      profile: runtimeApi.profile ?? fallbackApi.profile
    };
    return cachedApi as MuApi;
  }
  cachedApi = createBrowserFallbackApi();
  return cachedApi;
};
