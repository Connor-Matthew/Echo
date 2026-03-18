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
