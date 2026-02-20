export type ThemeMode = "system" | "light" | "dark";
export type FontScale = "sm" | "md" | "lg";
export type MessageDensity = "compact" | "comfortable";
export type ChatContextWindow = 5 | 20 | 50 | "infinite";
export type ProviderType = "openai" | "anthropic" | "acp" | "claude-agent";
export type AttachmentKind = "text" | "image" | "file";

export type ModelCapabilities = {
  textInput: boolean;
  imageInput: boolean;
  audioInput: boolean;
  videoInput: boolean;
  reasoningDisplay: boolean;
};

export type StoredProvider = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  savedModels: string[];
  modelCapabilities: Record<string, ModelCapabilities>;
  providerType: ProviderType;
  enabled: boolean;
  isPinned: boolean;
};

export type MessageRole = "system" | "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  reasoningContent?: string;
  createdAt: string;
  attachments?: ChatAttachment[];
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
  messages: ChatMessage[];
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
  temperature: number;
  maxTokens: number;
  chatContextWindow: ChatContextWindow;
  sendWithEnter: boolean;
  fontScale: FontScale;
  messageDensity: MessageDensity;
  requestTimeoutMs: number;
  retryCount: number;
  sseDebug: boolean;
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

export type CompletionMessage = {
  role: MessageRole;
  content: string;
  attachments?: ChatAttachment[];
};

export type ChatStreamRequest = {
  settings: AppSettings;
  messages: CompletionMessage[];
};

export type ChatStreamEvent =
  | { type: "delta"; delta: string }
  | { type: "reasoning"; delta: string }
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
  providerType: "openai",
  enabled: true,
  isPinned: false
};

export const DEFAULT_SETTINGS: AppSettings = {
  baseUrl: "",
  apiKey: "",
  model: "",
  providerType: "openai",
  providers: [DEFAULT_PROVIDER],
  activeProviderId: DEFAULT_PROVIDER.id,
  theme: "system",
  systemPrompt: "You are a precise and pragmatic coding assistant.",
  temperature: 0.4,
  maxTokens: 2048,
  chatContextWindow: "infinite",
  sendWithEnter: true,
  fontScale: "md",
  messageDensity: "comfortable",
  requestTimeoutMs: 60000,
  retryCount: 1,
  sseDebug: false
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

  return {
    id: candidate?.id?.trim() || `provider-${fallbackIndex + 1}`,
    name: candidate?.name?.trim() || `Provider ${fallbackIndex + 1}`,
    baseUrl: typeof candidate?.baseUrl === "string" ? candidate.baseUrl : "",
    apiKey: typeof candidate?.apiKey === "string" ? candidate.apiKey : "",
    model,
    savedModels: dedupedSavedModels,
    modelCapabilities: normalizedCapabilities,
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

export const normalizeSettings = (saved: Partial<AppSettings>): AppSettings => {
  const merged = { ...DEFAULT_SETTINGS, ...saved };
  const rawChatContextWindow = (saved as { chatContextWindow?: unknown }).chatContextWindow;
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
    chatContextWindow: normalizeChatContextWindow(rawChatContextWindow)
  };
};
