export type ThemeMode = "system" | "light" | "dark";
export type FontScale = "sm" | "md" | "lg";
export type MessageDensity = "compact" | "comfortable";
export type ChatContextWindow = 5 | 20 | 50 | "infinite";
export type ProviderType = "openai" | "anthropic" | "acp" | "claude-agent";
export type AttachmentKind = "text" | "image" | "file";
export type EnvironmentTemperatureUnit = "c" | "f";
export type EnvironmentWeatherStatus = "ok" | "stale" | "unavailable";

export type ModelCapabilities = {
  textInput: boolean;
  imageInput: boolean;
  audioInput: boolean;
  videoInput: boolean;
  reasoningDisplay: boolean;
};

export type ChatUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type ChatSessionUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  updatedAt: string;
};

export type McpServerOverride = {
  enabled: boolean;
};

export type UserMcpServer = {
  id: string;
  name: string;
  transportType: "stdio" | "streamable_http";
  endpoint: string;
  enabled: boolean;
};

export type StoredProvider = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  savedModels: string[];
  modelCapabilities: Record<string, ModelCapabilities>;
  modelContextWindows: Record<string, number>;
  mcpServerOverrides: Record<string, McpServerOverride>;
  providerType: ProviderType;
  enabled: boolean;
  isPinned: boolean;
};

export type MessageRole = "system" | "user" | "assistant";

export type ToolCall = {
  id: string;
  serverName: string;
  toolName: string;
  status: "pending" | "success" | "error";
  message: string;
  contentOffset?: number;
};

export type SkillParam = {
  key: string;
  label: string;
  defaultValue: string;
};

export type Skill = {
  id: string;
  name: string;
  command: string;
  description: string;
  icon: string;
  userPromptTemplate: string;
  systemPromptOverride?: string;
  params: SkillParam[];
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppliedSkillMeta = {
  icon: string;
  name: string;
  command: string;
};

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCall[];
  usage?: ChatMessageUsage;
  createdAt: string;
  attachments?: ChatAttachment[];
  appliedSkill?: AppliedSkillMeta;
};

export type ChatMessageUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  source: "provider" | "estimated";
};

export type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  // Text payload used to build model context for md/txt attachments.
  textContent?: string;
  // Image payload used for multimodal inference.
  imageDataUrl?: string;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isPinned?: boolean;
  soulModeEnabled?: boolean;
  enabledMcpServers?: string[];
  messages: ChatMessage[];
  usageByModel?: Record<string, ChatSessionUsage>;
};

export type SoulAutomationState = {
  lastProcessedUserMessageId?: string;
  lastProcessedUserMessageCreatedAt?: string;
  lastMemoryUpdatedAt?: string;
  lastSoulRewriteAt?: string;
  lastSoulRewriteSlot?: string;
  lastSoulRewriteSummary?: string;
  lastJournalDate?: string;
};

export type UserProfileLayer = "preferences" | "background" | "relationship";
export type UserProfileItemStatus = "active" | "disabled";
export type UserProfileItemSource = "auto" | "manual";

export type UserProfileDailyNote = {
  id: string;
  date: string;
  summaryMarkdown: string;
  sourceMessageCount: number;
  source: "auto" | "manual";
  createdAt: string;
  updatedAt: string;
};

export type UserProfileItem = {
  id: string;
  layer: UserProfileLayer;
  title: string;
  description: string;
  confidence: number;
  status: UserProfileItemStatus;
  source: UserProfileItemSource;
  lastConfirmedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type UserProfileEvidence = {
  id: string;
  profileItemId: string;
  dailyNoteDate: string;
  excerpt: string;
  weight: number;
  createdAt: string;
};

export type UserProfileAutomationState = {
  lastProcessedUserMessageId?: string;
  lastProcessedUserMessageCreatedAt?: string;
  lastProfileUpdatedAt?: string;
  lastDailyNoteDate?: string;
};

export type UserProfileItemDraft = {
  layer: UserProfileLayer;
  title: string;
  description: string;
  confidence: number;
  evidence: Array<{
    dailyNoteDate: string;
    excerpt: string;
    weight?: number;
  }>;
};

export type UserProfileManualItemPayload = {
  itemId?: string;
  layer: UserProfileLayer;
  title: string;
  description: string;
  confidence: number;
  status?: UserProfileItemStatus;
  evidence: Array<{
    dailyNoteDate: string;
    excerpt: string;
    weight?: number;
  }>;
};

export type EnvironmentSettings = {
  enabled: boolean;
  city: string;
  temperatureUnit: EnvironmentTemperatureUnit;
  weatherCacheTtlMs: number;
  sendTimeoutMs: number;
};

export type EnvironmentWeatherSnapshot = {
  status: EnvironmentWeatherStatus;
  source: "open-meteo";
  fetchedAt?: string;
  city?: string;
  summary?: string;
  temp?: number;
  feelsLike?: number;
  humidity?: number;
  windKph?: number;
  reason?: string;
};

export type EnvironmentSystemInfo = {
  platform: string;
  release: string;
  version?: string;
  arch: string;
  hostname?: string;
  machineName?: string;
  machineModel?: string;
  chip?: string;
  physicalMemory?: string;
};

export type EnvironmentMemoryInfo = {
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
};

export type EnvironmentStorageInfo = {
  mountPath: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
};

export type EnvironmentDeviceStatus = {
  system?: EnvironmentSystemInfo;
  memory?: EnvironmentMemoryInfo;
  storage?: EnvironmentStorageInfo;
};

export type EnvironmentSnapshot = {
  capturedAt: string;
  cwd: string;
  time: {
    iso: string;
    date: string;
    time: string;
    timezone: string;
    locale: string;
  };
  device: {
    type: "desktop" | "laptop" | "unknown";
    network?: {
      online: boolean;
      effectiveType?: string;
    };
    battery?: {
      level?: number;
      charging?: boolean;
    };
  } & EnvironmentDeviceStatus;
  location: {
    city: string;
  };
  weather: EnvironmentWeatherSnapshot;
};

export type EnvironmentWeatherRequest = {
  city: string;
  temperatureUnit: EnvironmentTemperatureUnit;
  cacheTtlMs?: number;
};

export type MemosSettings = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  userId: string;
  topK: number;
  searchTimeoutMs: number;
  addTimeoutMs: number;
};

export type SoulEvolutionSettings = {
  providerId: string;
  model: string;
};

export type AppSettings = {
  baseUrl: string;
  apiKey: string;
  model: string;
  providerType: ProviderType;
  providers: StoredProvider[];
  activeProviderId: string;
  theme: ThemeMode;
  systemPrompt: string;
  agentSystemPrompt: string;
  temperature: number;
  maxTokens: number;
  chatContextWindow: ChatContextWindow;
  sendWithEnter: boolean;
  fontScale: FontScale;
  messageDensity: MessageDensity;
  requestTimeoutMs: number;
  retryCount: number;
  sseDebug: boolean;
  environment: EnvironmentSettings;
  memos: MemosSettings;
  soulEvolution: SoulEvolutionSettings;
  mcpServers: UserMcpServer[];
};

export type MemosSearchPayload = {
  settings: AppSettings;
  query: string;
  conversationId: string;
};

export type MemosSearchResult = {
  ok: boolean;
  message: string;
  memories: string[];
};

export type MemosAddPayload = {
  settings: AppSettings;
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
};

export type MemosAddResult = {
  ok: boolean;
  message: string;
};

export type ConnectionTestResult = {
  ok: boolean;
  message: string;
};

export type ModelListResult = {
  ok: boolean;
  message: string;
  models: string[];
};

export type McpAuthStatus = "unsupported" | "notLoggedIn" | "bearerToken" | "oAuth" | "unknown";

export type McpServerConfig = {
  name: string;
  enabled: boolean;
  disabledReason: string | null;
  authStatus: McpAuthStatus;
  transportType: "stdio" | "streamable_http" | "unknown";
  endpoint: string;
  startupTimeoutSec: number | null;
  toolTimeoutSec: number | null;
};

export type McpServerListResult = {
  ok: boolean;
  message: string;
  servers: McpServerConfig[];
};

export type McpServerStatus = {
  name: string;
  authStatus: McpAuthStatus;
  toolCount: number;
  resourceCount: number;
  resourceTemplateCount: number;
};

export type McpServerStatusListResult = {
  ok: boolean;
  message: string;
  servers: McpServerStatus[];
};

export type CompletionMessage = {
  role: MessageRole;
  content: string;
  attachments?: ChatAttachment[];
};

export type ChatStreamRequest = {
  settings: AppSettings;
  messages: CompletionMessage[];
  enabledMcpServerIds?: string[];
};

export type ChatStreamEvent =
  | { type: "delta"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "status"; source: "mcp"; toolCall: ToolCall }
  | { type: "usage"; usage: ChatUsage }
  | { type: "done" }
  | { type: "error"; message: string };

export type StreamEnvelope = {
  streamId: string;
  event: ChatStreamEvent;
};

const DEFAULT_PROVIDER: StoredProvider = {
  id: "provider-default",
  name: "Default provider",
  baseUrl: "",
  apiKey: "",
  model: "",
  savedModels: [],
  modelCapabilities: {},
  modelContextWindows: {},
  mcpServerOverrides: {},
  providerType: "openai",
  enabled: true,
  isPinned: false
};

export const DEFAULT_ENVIRONMENT_SETTINGS: EnvironmentSettings = {
  enabled: true,
  city: "",
  temperatureUnit: "c",
  weatherCacheTtlMs: 600000,
  sendTimeoutMs: 600
};

export const DEFAULT_MEMOS_SETTINGS: MemosSettings = {
  enabled: false,
  baseUrl: "https://memos.memtensor.cn/api/openmem/v1",
  apiKey: "",
  userId: "",
  topK: 3,
  searchTimeoutMs: 6000,
  addTimeoutMs: 6000
};

export const DEFAULT_SETTINGS: AppSettings = {
  baseUrl: "",
  apiKey: "",
  model: "",
  providerType: "openai",
  providers: [DEFAULT_PROVIDER],
  activeProviderId: DEFAULT_PROVIDER.id,
  theme: "system",
  systemPrompt: `You are a genuine conversation partner, not a response machine.

Core principles:
- Honesty over flattery: Give answers you actually believe. If something is wrong, say so. If a view deserves scrutiny, raise it — gently but directly.
- Clarity over eloquence: Match response length to the complexity of the question, not to signal effort. Skip preambles and filler phrases like "Great question!" or "Certainly!".
- Genuine curiosity: Acknowledge uncertainty honestly. Admit what you don't know rather than guessing or fabricating.
- Respect through directness: Treat users as capable adults. Don't over-simplify or condescend.

Character: Calm and unhurried. Direct without being blunt. Occasionally humorous when the moment calls for it — never performative. Humble about limitations without unnecessary self-deprecation.

Communication style:
- Respond in the user's language. In Chinese contexts, use natural idiomatic Chinese, not translated-sounding prose.
- Calibrate tone to context: precise in technical work, open in creative exploration, gentle in emotional conversations.
- Use formatting (lists, headers, code blocks) only when it genuinely aids understanding.

Limits: Acknowledge when your knowledge may be outdated. Recommend verification for important decisions. For things you shouldn't do, explain why clearly rather than pretending you can't.`,
  agentSystemPrompt: `You are a genuine conversation partner, not a response machine.

Core principles:
- Honesty over flattery: Give answers you actually believe. If something is wrong, say so.
- Clarity over eloquence: Match response length to complexity. Skip preambles and filler phrases.
- Respect through directness: Treat users as capable adults.

Communication: Respond in the user's language. In Chinese contexts, use natural idiomatic Chinese. Use formatting only when it aids understanding.`,
  temperature: 0.4,
  maxTokens: 2048,
  chatContextWindow: "infinite",
  sendWithEnter: true,
  fontScale: "md",
  messageDensity: "comfortable",
  requestTimeoutMs: 60000,
  retryCount: 1,
  sseDebug: false,
  environment: DEFAULT_ENVIRONMENT_SETTINGS,
  memos: DEFAULT_MEMOS_SETTINGS,
  soulEvolution: {
    providerId: DEFAULT_PROVIDER.id,
    model: ""
  },
  mcpServers: []
};

const normalizeProviderType = (providerType: unknown): ProviderType => {
  if (providerType === "anthropic") {
    return "anthropic";
  }
  if (providerType === "acp") {
    return "acp";
  }
  if (providerType === "claude-agent") {
    return "claude-agent";
  }
  return "openai";
};

const sanitizeProvider = (
  candidate: Partial<StoredProvider> | undefined,
  fallbackIndex: number
): StoredProvider => {
  const model = typeof candidate?.model === "string" ? candidate.model.trim() : "";
  const savedModelsFromCandidate = Array.isArray(candidate?.savedModels)
    ? candidate.savedModels
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter((entry): entry is string => Boolean(entry))
    : [];
  const dedupedSavedModels = Array.from(
    new Set(model ? [...savedModelsFromCandidate, model] : savedModelsFromCandidate)
  );
  const rawCapabilities =
    candidate?.modelCapabilities && typeof candidate.modelCapabilities === "object"
      ? candidate.modelCapabilities
      : {};
  const normalizedCapabilities = Object.fromEntries(
    Object.entries(rawCapabilities)
      .map(([modelId, capabilities]) => {
        const key = modelId.trim().toLowerCase();
        if (!key || !capabilities || typeof capabilities !== "object") {
          return null;
        }
        const typed = capabilities as Partial<ModelCapabilities>;
        return [
          key,
          {
            textInput: typed.textInput !== false,
            imageInput: Boolean(typed.imageInput),
            audioInput: Boolean(typed.audioInput),
            videoInput: Boolean(typed.videoInput),
            reasoningDisplay: Boolean(typed.reasoningDisplay)
          } satisfies ModelCapabilities
        ];
      })
      .filter((entry): entry is [string, ModelCapabilities] => Boolean(entry))
  );
  const rawModelContextWindows =
    candidate?.modelContextWindows && typeof candidate.modelContextWindows === "object"
      ? candidate.modelContextWindows
      : {};
  const normalizedContextWindows = Object.fromEntries(
    Object.entries(rawModelContextWindows)
      .map(([modelId, contextWindow]) => {
        const key = modelId.trim().toLowerCase();
        if (!key || typeof contextWindow !== "number" || !Number.isFinite(contextWindow)) {
          return null;
        }
        const rounded = Math.round(contextWindow);
        if (rounded < 1024 || rounded > 2_000_000) {
          return null;
        }
        return [key, rounded] as const;
      })
      .filter((entry): entry is [string, number] => Boolean(entry))
  );
  const rawMcpServerOverrides =
    candidate?.mcpServerOverrides && typeof candidate.mcpServerOverrides === "object"
      ? candidate.mcpServerOverrides
      : {};
  const normalizedMcpServerOverrides = Object.fromEntries(
    Object.entries(rawMcpServerOverrides)
      .map(([serverName, override]) => {
        const key = serverName.trim();
        if (!key || !override || typeof override !== "object") {
          return null;
        }
        const enabled = (override as { enabled?: unknown }).enabled;
        if (typeof enabled !== "boolean") {
          return null;
        }
        return [key, { enabled }] as const;
      })
      .filter((entry): entry is [string, McpServerOverride] => Boolean(entry))
  );

  return {
    id: candidate?.id?.trim() || `provider-${fallbackIndex + 1}`,
    name: candidate?.name?.trim() || `Provider ${fallbackIndex + 1}`,
    baseUrl: typeof candidate?.baseUrl === "string" ? candidate.baseUrl : "",
    apiKey: typeof candidate?.apiKey === "string" ? candidate.apiKey : "",
    model,
    savedModels: dedupedSavedModels,
    modelCapabilities: normalizedCapabilities,
    modelContextWindows: normalizedContextWindows,
    mcpServerOverrides: normalizedMcpServerOverrides,
    providerType: normalizeProviderType(candidate?.providerType),
    enabled: candidate?.enabled !== false,
    isPinned: Boolean(candidate?.isPinned)
  };
};

const dedupeProviderIds = (providers: StoredProvider[]) => {
  const seen = new Set<string>();
  return providers.map((provider) => {
    if (!seen.has(provider.id)) {
      seen.add(provider.id);
      return provider;
    }

    let suffix = 2;
    let nextId = `${provider.id}-${suffix}`;
    while (seen.has(nextId)) {
      suffix += 1;
      nextId = `${provider.id}-${suffix}`;
    }
    seen.add(nextId);
    return { ...provider, id: nextId };
  });
};

const normalizeChatContextWindow = (value: unknown): ChatContextWindow => {
  if (value === 5 || value === "5") {
    return 5;
  }
  if (value === 20 || value === "20") {
    return 20;
  }
  if (value === 50 || value === "50") {
    return 50;
  }
  if (value === "infinite") {
    return "infinite";
  }
  return DEFAULT_SETTINGS.chatContextWindow;
};

const clampInteger = (value: unknown, min: number, max: number, fallback: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
};

const normalizeEnvironmentTemperatureUnit = (value: unknown): EnvironmentTemperatureUnit =>
  value === "f" ? "f" : "c";

const normalizeEnvironmentSettings = (value: unknown): EnvironmentSettings => {
  const source =
    value && typeof value === "object" ? (value as Partial<EnvironmentSettings>) : undefined;
  return {
    enabled: source?.enabled !== false,
    city: typeof source?.city === "string" ? source.city : "",
    temperatureUnit: normalizeEnvironmentTemperatureUnit(source?.temperatureUnit),
    weatherCacheTtlMs: clampInteger(
      source?.weatherCacheTtlMs,
      60000,
      3600000,
      DEFAULT_ENVIRONMENT_SETTINGS.weatherCacheTtlMs
    ),
    sendTimeoutMs: clampInteger(
      source?.sendTimeoutMs,
      100,
      2000,
      DEFAULT_ENVIRONMENT_SETTINGS.sendTimeoutMs
    )
  };
};

const normalizeMemosSettings = (value: unknown): MemosSettings => {
  const source = value && typeof value === "object" ? (value as Partial<MemosSettings>) : undefined;
  return {
    enabled: source?.enabled === true,
    baseUrl:
      typeof source?.baseUrl === "string" && source.baseUrl.trim()
        ? source.baseUrl.trim().replace(/\/+$/, "")
        : DEFAULT_MEMOS_SETTINGS.baseUrl,
    apiKey: typeof source?.apiKey === "string" ? source.apiKey.trim() : "",
    userId: typeof source?.userId === "string" ? source.userId.trim() : "",
    topK: clampInteger(source?.topK, 1, 20, DEFAULT_MEMOS_SETTINGS.topK),
    searchTimeoutMs: clampInteger(
      source?.searchTimeoutMs,
      1000,
      15000,
      DEFAULT_MEMOS_SETTINGS.searchTimeoutMs
    ),
    addTimeoutMs: clampInteger(source?.addTimeoutMs, 1000, 15000, DEFAULT_MEMOS_SETTINGS.addTimeoutMs)
  };
};

const normalizeSoulEvolutionSettings = (
  value: unknown,
  activeProvider: StoredProvider
): SoulEvolutionSettings => {
  const source =
    value && typeof value === "object" ? (value as Partial<SoulEvolutionSettings>) : undefined;
  return {
    providerId: typeof source?.providerId === "string" && source.providerId.trim()
      ? source.providerId.trim()
      : activeProvider.id,
    model:
      typeof source?.model === "string" && source.model.trim() ? source.model.trim() : activeProvider.model
  };
};

const normalizeMcpServers = (value: unknown): UserMcpServer[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): UserMcpServer | null => {
      if (!item || typeof item !== "object") return null;
      const s = item as Record<string, unknown>;
      const name = typeof s.name === "string" && s.name.trim() ? s.name.trim() : "";
      if (!name) return null;
      const transportType = s.transportType === "streamable_http" ? "streamable_http" : "stdio";
      const endpoint = typeof s.endpoint === "string" ? s.endpoint.trim() : "";
      const fallbackId = `${name}:${transportType}:${endpoint}`.toLowerCase();
      const id = typeof s.id === "string" && s.id.trim() ? s.id.trim() : fallbackId;
      return {
        id,
        name,
        transportType,
        endpoint,
        enabled: s.enabled !== false
      };
    })
    .filter((s): s is UserMcpServer => s !== null);
};

export const normalizeSettings = (saved: Partial<AppSettings>): AppSettings => {
  const merged = { ...DEFAULT_SETTINGS, ...saved };
  const rawChatContextWindow = (saved as { chatContextWindow?: unknown }).chatContextWindow;
  const rawEnvironment = (saved as { environment?: unknown }).environment;
  const rawMemos = (saved as { memos?: unknown }).memos;
  const rawAgentSystemPrompt = (saved as { agentSystemPrompt?: unknown }).agentSystemPrompt;
  const rawProviders = Array.isArray(saved.providers) ? saved.providers : [];
  const providersFromLegacy: StoredProvider[] = [
    {
      id: merged.activeProviderId || DEFAULT_PROVIDER.id,
      name: DEFAULT_PROVIDER.name,
      baseUrl: merged.baseUrl,
      apiKey: merged.apiKey,
      model: merged.model,
      savedModels: merged.model.trim() ? [merged.model.trim()] : [],
      modelCapabilities: {},
      modelContextWindows: {},
      mcpServerOverrides: {},
      providerType: normalizeProviderType(merged.providerType),
      enabled: true,
      isPinned: false
    }
  ];

  const normalizedProviders = dedupeProviderIds(
    (rawProviders.length ? rawProviders : providersFromLegacy).map((provider, index) =>
      sanitizeProvider(provider, index)
    )
  );

  const activeProvider =
    normalizedProviders.find((provider) => provider.id === merged.activeProviderId) ??
    normalizedProviders[0];

  return {
    ...merged,
    providers: normalizedProviders,
    activeProviderId: activeProvider.id,
    baseUrl: activeProvider.baseUrl,
    apiKey: activeProvider.apiKey,
    model: activeProvider.model,
    providerType: activeProvider.providerType,
    agentSystemPrompt:
      typeof rawAgentSystemPrompt === "string"
        ? rawAgentSystemPrompt
        : typeof saved.systemPrompt === "string"
          ? saved.systemPrompt
          : DEFAULT_SETTINGS.agentSystemPrompt,
    chatContextWindow: normalizeChatContextWindow(rawChatContextWindow),
    environment: normalizeEnvironmentSettings(rawEnvironment),
    memos: normalizeMemosSettings(rawMemos),
    soulEvolution: normalizeSoulEvolutionSettings(
      (saved as { soulEvolution?: unknown }).soulEvolution,
      activeProvider
    ),
    mcpServers: normalizeMcpServers(saved.mcpServers)
  };
};
