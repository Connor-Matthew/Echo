export type ThemeMode = "system" | "light" | "dark";
export type FontScale = "sm" | "md" | "lg";
export type MessageDensity = "compact" | "comfortable";
export type ProviderType = "openai" | "anthropic" | "acp";
export type AttachmentKind = "text" | "image" | "file";

export type StoredProvider = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  savedModels: string[];
  providerType: ProviderType;
  enabled: boolean;
  isPinned: boolean;
};

export type MessageRole = "system" | "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
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

  return {
    id: candidate?.id?.trim() || `provider-${fallbackIndex + 1}`,
    name: candidate?.name?.trim() || `Provider ${fallbackIndex + 1}`,
    baseUrl: typeof candidate?.baseUrl === "string" ? candidate.baseUrl : "",
    apiKey: typeof candidate?.apiKey === "string" ? candidate.apiKey : "",
    model,
    savedModels: dedupedSavedModels,
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

export const normalizeSettings = (saved: Partial<AppSettings>): AppSettings => {
  const merged = { ...DEFAULT_SETTINGS, ...saved };
  const rawProviders = Array.isArray(saved.providers) ? saved.providers : [];
  const providersFromLegacy: StoredProvider[] = [
    {
      id: merged.activeProviderId || DEFAULT_PROVIDER.id,
      name: DEFAULT_PROVIDER.name,
      baseUrl: merged.baseUrl,
      apiKey: merged.apiKey,
      model: merged.model,
      savedModels: merged.model.trim() ? [merged.model.trim()] : [],
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
    providerType: activeProvider.providerType
  };
};
