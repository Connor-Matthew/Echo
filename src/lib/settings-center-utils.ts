import type {
  AppSettings,
  ChatContextWindow,
  ChatSession,
  FontScale,
  MarkdownRenderMode,
  MessageDensity,
  ModelCapabilities,
  ProviderType,
  StoredProvider,
  ThemeMode
} from "../shared/contracts";

export type SettingsValidationSection =
  | "provider"
  | "mcp"
  | "chat"
  | "memory"
  | "profile"
  | "skills"
  | "environment"
  | "theme"
  | "data"
  | "advanced"
  | "soul"
  | "journal";

export type ProviderPreset = {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  providerType: ProviderType;
};

export const themeOptions: Array<{ value: ThemeMode; label: string; description: string }> = [
  { value: "system", label: "System", description: "Follow your OS preference." },
  { value: "light", label: "Light", description: "Always use the light interface." },
  { value: "dark", label: "Dark", description: "Always use the dark interface." }
];

export const fontScaleOptions: Array<{ value: FontScale; label: string; description: string }> = [
  { value: "sm", label: "Small", description: "More content on screen." },
  { value: "md", label: "Medium", description: "Balanced reading size." },
  { value: "lg", label: "Large", description: "Larger, easier to read text." }
];

export const densityOptions: Array<{ value: MessageDensity; label: string; description: string }> = [
  { value: "compact", label: "Compact", description: "Reduced spacing between messages." },
  { value: "comfortable", label: "Comfortable", description: "More breathing room in chat." }
];

export const markdownRenderModeOptions: Array<{
  value: MarkdownRenderMode;
  label: string;
  description: string;
}> = [
  { value: "paragraph", label: "按段", description: "保留完整 Markdown 段落和块结构。" },
  { value: "line", label: "按行", description: "按换行逐段渲染，更接近逐行阅读。" }
];

export const chatContextWindowOptions: Array<{
  value: ChatContextWindow;
  label: string;
  description: string;
}> = [
  { value: 5, label: "5", description: "Use the latest 5 user turns." },
  { value: 20, label: "20", description: "Use the latest 20 user turns." },
  { value: 50, label: "50", description: "Use the latest 50 user turns." },
  { value: "infinite", label: "Unlimited", description: "Use full session history." }
];

export const providerPresets: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    providerType: "openai"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4.1-mini",
    providerType: "openai"
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    providerType: "openai"
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    providerType: "openai"
  },
  {
    id: "claude",
    label: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-3-5-sonnet-latest",
    providerType: "anthropic"
  },
  {
    id: "claude-agent",
    label: "Claude Agent SDK",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5",
    providerType: "claude-agent"
  },
  {
    id: "ollama",
    label: "Ollama (Local)",
    baseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "qwen2.5:14b",
    providerType: "openai"
  },
  {
    id: "lmstudio",
    label: "LM Studio (Local)",
    baseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "local-model",
    providerType: "openai"
  },
  {
    id: "codex-acp",
    label: "Codex CLI (ACP)",
    baseUrl: "",
    defaultModel: "gpt-5-codex",
    providerType: "acp"
  }
];

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const normalizeBaseUrl = (raw: string) => raw.trim().replace(/\/+$/, "");

const resolveAnthropicEndpoint = (baseUrl: string, resource: "models" | "messages") => {
  const normalized = normalizeBaseUrl(baseUrl);
  const rooted = normalized
    .replace(/\/v1\/(messages|models)$/i, "")
    .replace(/\/(messages|models)$/i, "");
  return rooted.endsWith("/v1") ? `${rooted}/${resource}` : `${rooted}/v1/${resource}`;
};

export const resolveProviderEndpoints = (baseUrl: string, providerType: ProviderType) => {
  if (providerType === "acp") {
    return {
      normalized: "local-codex",
      models: "model/list (not exposed)",
      chat: "codex app-server --listen stdio://"
    };
  }

  const normalized = normalizeBaseUrl(
    baseUrl || (providerType === "claude-agent" ? "https://api.anthropic.com" : "")
  );
  if (!normalized) {
    return null;
  }

  if (providerType === "claude-agent") {
    return {
      normalized,
      models: resolveAnthropicEndpoint(normalized, "models"),
      chat: "Claude Agent SDK query()"
    };
  }

  if (providerType === "anthropic") {
    return {
      normalized,
      models: resolveAnthropicEndpoint(normalized, "models"),
      chat: resolveAnthropicEndpoint(normalized, "messages")
    };
  }

  return {
    normalized,
    models: `${normalized}/models`,
    chat: `${normalized}/chat/completions`
  };
};

export const isValidHttpUrl = (raw: string) => {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const createProviderId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `provider-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export const createProvider = (index: number): StoredProvider => ({
  id: createProviderId(),
  name: `Provider ${index + 1}`,
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
});

export const getActiveProvider = (settings: AppSettings): StoredProvider => {
  if (!settings.providers.length) {
    return {
      id: "provider-default",
      name: "Default provider",
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      savedModels: settings.model.trim() ? [settings.model.trim()] : [],
      modelCapabilities: {},
      modelContextWindows: {},
      mcpServerOverrides: {},
      providerType: settings.providerType,
      enabled: true,
      isPinned: false
    };
  }
  return (
    settings.providers.find((provider) => provider.id === settings.activeProviderId) ??
    settings.providers[0]
  );
};

const sortProviders = (providers: StoredProvider[]) => {
  const pinned = providers.filter((provider) => provider.isPinned);
  const others = providers.filter((provider) => !provider.isPinned);
  return [...pinned, ...others];
};

export const syncProviderState = (
  settings: AppSettings,
  providers: StoredProvider[],
  requestedActiveId: string
): AppSettings => {
  const safeProviders = sortProviders(providers.length ? providers : [createProvider(0)]);
  const activeProvider =
    safeProviders.find((provider) => provider.id === requestedActiveId) ?? safeProviders[0];
  const currentSoulProviderId = settings.soulEvolution?.providerId?.trim();
  const soulProvider =
    safeProviders.find((provider) => provider.id === currentSoulProviderId) ?? activeProvider;
  const currentSoulModel = settings.soulEvolution?.model?.trim();

  return {
    ...settings,
    providers: safeProviders,
    activeProviderId: activeProvider.id,
    baseUrl: activeProvider.baseUrl,
    apiKey: activeProvider.apiKey,
    model: activeProvider.model,
    providerType: activeProvider.providerType,
    soulEvolution: {
      providerId: soulProvider.id,
      model: currentSoulModel || soulProvider.model
    }
  };
};

export const normalizeDraft = (settings: AppSettings): AppSettings => {
  const providers: StoredProvider[] = settings.providers.map((provider, index) => {
    const model = provider.model.trim();
    const savedModels = Array.from(
      new Set(
        (Array.isArray(provider.savedModels) ? provider.savedModels : [])
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry): entry is string => Boolean(entry))
          .concat(model ? [model] : [])
      )
    );
    const modelCapabilities = Object.fromEntries(
      Object.entries(provider.modelCapabilities ?? {})
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
    const modelContextWindows = Object.fromEntries(
      Object.entries(provider.modelContextWindows ?? {})
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
    const mcpServerOverrides = Object.fromEntries(
      Object.entries(provider.mcpServerOverrides ?? {})
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
        .filter((entry): entry is [string, { enabled: boolean }] => Boolean(entry))
    );

    return {
      ...provider,
      id: provider.id.trim() || `provider-${index + 1}`,
      name: provider.name.trim() || `Provider ${index + 1}`,
      baseUrl: normalizeBaseUrl(provider.baseUrl),
      apiKey: provider.apiKey.trim(),
      model,
      savedModels,
      modelCapabilities,
      modelContextWindows,
      mcpServerOverrides,
      providerType:
        provider.providerType === "anthropic"
          ? "anthropic"
          : provider.providerType === "acp"
            ? "acp"
            : provider.providerType === "claude-agent"
              ? "claude-agent"
              : "openai",
      enabled: provider.enabled !== false,
      isPinned: Boolean(provider.isPinned)
    };
  });

  const synced = syncProviderState(settings, providers, settings.activeProviderId);
  const soulProvider =
    synced.providers.find((provider) => provider.id === settings.soulEvolution?.providerId?.trim()) ??
    synced.providers.find((provider) => provider.id === synced.soulEvolution.providerId) ??
    synced.providers[0];

  return {
    ...synced,
    soulEvolution: {
      providerId: soulProvider.id,
      model: settings.soulEvolution?.model?.trim() || soulProvider.model
    },
    mcpServers: settings.mcpServers ?? []
  };
};

export const resolvePresetByBaseUrl = (baseUrl: string, providerType: ProviderType) => {
  if (providerType === "acp") {
    return providerPresets.find((preset) => preset.id === "codex-acp") ?? null;
  }
  if (providerType === "claude-agent" && !normalizeBaseUrl(baseUrl)) {
    return providerPresets.find((preset) => preset.id === "claude-agent") ?? null;
  }

  const normalized = normalizeBaseUrl(baseUrl);
  return (
    providerPresets.find(
      (preset) =>
        preset.providerType === providerType && normalizeBaseUrl(preset.baseUrl) === normalized
    ) ?? null
  );
};

const providerBadgeByPreset: Record<string, { token: string; bgClass: string; textClass: string }> = {
  openai: { token: "OA", bgClass: "bg-primary/15", textClass: "text-primary" },
  openrouter: { token: "OR", bgClass: "bg-accent", textClass: "text-foreground/85" },
  groq: { token: "GQ", bgClass: "bg-muted", textClass: "text-foreground/80" },
  deepseek: { token: "DS", bgClass: "bg-secondary", textClass: "text-foreground/85" },
  claude: { token: "CL", bgClass: "bg-accent/70", textClass: "text-foreground/85" },
  "claude-agent": { token: "CA", bgClass: "bg-accent/70", textClass: "text-foreground/85" },
  ollama: { token: "OL", bgClass: "bg-secondary", textClass: "text-foreground/80" },
  lmstudio: { token: "LM", bgClass: "bg-muted", textClass: "text-foreground/80" },
  "codex-acp": { token: "CP", bgClass: "bg-accent", textClass: "text-foreground/85" }
};

const inferProviderPresetId = (provider: StoredProvider) => {
  const matchedPreset = resolvePresetByBaseUrl(provider.baseUrl, provider.providerType);
  if (matchedPreset) {
    return matchedPreset.id;
  }

  const probe = `${provider.name} ${provider.baseUrl}`.toLowerCase();
  if (probe.includes("openrouter")) {
    return "openrouter";
  }
  if (probe.includes("openai")) {
    return "openai";
  }
  if (probe.includes("groq")) {
    return "groq";
  }
  if (probe.includes("deepseek")) {
    return "deepseek";
  }
  if (probe.includes("anthropic") || probe.includes("claude")) {
    if (provider.providerType === "claude-agent") {
      return "claude-agent";
    }
    return "claude";
  }
  if (probe.includes("ollama") || probe.includes("11434")) {
    return "ollama";
  }
  if (probe.includes("lmstudio") || probe.includes("1234")) {
    return "lmstudio";
  }
  if (probe.includes("codex") || probe.includes("acp")) {
    return "codex-acp";
  }
  return "custom";
};

export const getProviderBadgeVisual = (provider: StoredProvider) => {
  const presetId = inferProviderPresetId(provider);
  const presetBadge = providerBadgeByPreset[presetId];
  if (presetBadge) {
    return presetBadge;
  }

  const trimmed = provider.name.trim();
  return {
    token: trimmed ? trimmed.slice(0, 1).toUpperCase() : "P",
    bgClass: "bg-accent",
    textClass: "text-foreground/85"
  };
};

export const validateSettingsForSection = (
  draft: AppSettings,
  section: SettingsValidationSection
): string | null => {
  if (section === "provider") {
    const activeProvider = getActiveProvider(draft);
    if (!activeProvider.enabled) {
      return null;
    }
    if (!activeProvider.name.trim()) {
      return "Provider name is required.";
    }
    if (activeProvider.providerType === "acp") {
      return null;
    }
    if (activeProvider.providerType !== "claude-agent") {
      if (!activeProvider.baseUrl.trim() || !isValidHttpUrl(activeProvider.baseUrl.trim())) {
        return "Base URL is invalid.";
      }
    } else if (activeProvider.baseUrl.trim() && !isValidHttpUrl(activeProvider.baseUrl.trim())) {
      return "Base URL is invalid.";
    }
    if (!activeProvider.apiKey.trim()) {
      return "API key is required.";
    }
    if (!activeProvider.model.trim()) {
      return "Model is required.";
    }
    return null;
  }

  if (section === "chat") {
    if (draft.temperature < 0 || draft.temperature > 2) {
      return "Temperature must be between 0 and 2.";
    }
    if (!Number.isInteger(draft.maxTokens) || draft.maxTokens < 64 || draft.maxTokens > 8192) {
      return "Max tokens must be 64-8192.";
    }
    if (![5, 20, 50, "infinite"].includes(draft.chatContextWindow)) {
      return "Context window must be 5, 20, 50, or Unlimited.";
    }
    return null;
  }

  if (section === "memory") {
    if (!draft.memos.enabled) {
      return null;
    }
    if (!draft.memos.baseUrl.trim() || !isValidHttpUrl(draft.memos.baseUrl.trim())) {
      return "MemOS Base URL is invalid.";
    }
    if (!draft.memos.apiKey.trim()) {
      return "MemOS API key is required.";
    }
    if (!draft.memos.userId.trim()) {
      return "MemOS user ID is required.";
    }
    if (!Number.isInteger(draft.memos.topK) || draft.memos.topK < 1 || draft.memos.topK > 20) {
      return "MemOS Top K must be 1-20.";
    }
    if (
      !Number.isInteger(draft.memos.searchTimeoutMs) ||
      draft.memos.searchTimeoutMs < 1000 ||
      draft.memos.searchTimeoutMs > 15000
    ) {
      return "MemOS search timeout must be 1000-15000 ms.";
    }
    if (
      !Number.isInteger(draft.memos.addTimeoutMs) ||
      draft.memos.addTimeoutMs < 1000 ||
      draft.memos.addTimeoutMs > 15000
    ) {
      return "MemOS add timeout must be 1000-15000 ms.";
    }
    return null;
  }

  if (section === "soul") {
    const soulProvider = draft.providers.find((provider) => provider.id === draft.soulEvolution.providerId);
    if (!soulProvider) {
      return "SOUL 演化渠道不存在。";
    }
    if (!draft.soulEvolution.model.trim()) {
      return "SOUL 演化模型不能为空。";
    }
    return null;
  }

  if (section === "environment") {
    if (draft.environment.temperatureUnit !== "c" && draft.environment.temperatureUnit !== "f") {
      return "Environment temperature unit must be C or F.";
    }
    if (
      !Number.isInteger(draft.environment.weatherCacheTtlMs) ||
      draft.environment.weatherCacheTtlMs < 60000 ||
      draft.environment.weatherCacheTtlMs > 3600000
    ) {
      return "Weather cache TTL must be 60000-3600000 ms.";
    }
    if (
      !Number.isInteger(draft.environment.sendTimeoutMs) ||
      draft.environment.sendTimeoutMs < 100 ||
      draft.environment.sendTimeoutMs > 2000
    ) {
      return "Environment timeout must be 100-2000 ms.";
    }
    return null;
  }

  if (section === "advanced") {
    if (
      !Number.isInteger(draft.requestTimeoutMs) ||
      draft.requestTimeoutMs < 5000 ||
      draft.requestTimeoutMs > 180000
    ) {
      return "Timeout must be 5000-180000 ms.";
    }
    if (!Number.isInteger(draft.retryCount) || draft.retryCount < 0 || draft.retryCount > 3) {
      return "Retry count must be 0-3.";
    }
  }

  return null;
};

export const areSettingsEqual = (left: AppSettings, right: AppSettings) =>
  left.baseUrl === right.baseUrl &&
  left.apiKey === right.apiKey &&
  left.model === right.model &&
  left.activeProviderId === right.activeProviderId &&
  JSON.stringify(left.providers) === JSON.stringify(right.providers) &&
  left.theme === right.theme &&
  left.systemPrompt === right.systemPrompt &&
  left.agentSystemPrompt === right.agentSystemPrompt &&
  left.temperature === right.temperature &&
  left.maxTokens === right.maxTokens &&
  left.chatContextWindow === right.chatContextWindow &&
  left.sendWithEnter === right.sendWithEnter &&
  left.fontScale === right.fontScale &&
  left.messageDensity === right.messageDensity &&
  left.markdownRenderMode === right.markdownRenderMode &&
  left.requestTimeoutMs === right.requestTimeoutMs &&
  left.retryCount === right.retryCount &&
  left.sseDebug === right.sseDebug &&
  JSON.stringify(left.environment) === JSON.stringify(right.environment) &&
  JSON.stringify(left.memos) === JSON.stringify(right.memos) &&
  JSON.stringify(left.soulEvolution) === JSON.stringify(right.soulEvolution) &&
  JSON.stringify(left.mcpServers) === JSON.stringify(right.mcpServers);

export const isValidImportedSessions = (value: unknown): value is ChatSession[] =>
  Array.isArray(value) &&
  value.every(
    (session) =>
      session &&
      typeof session === "object" &&
      typeof (session as ChatSession).id === "string" &&
      typeof (session as ChatSession).title === "string" &&
      Array.isArray((session as ChatSession).messages)
  );
