import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Eye,
  EyeOff,
  MessageSquare,
  Palette,
  Plus,
  Search,
  Server,
  SlidersHorizontal,
  Trash2,
  X
} from "lucide-react";
import { cn } from "../lib/utils";
import {
  resolveProviderModelCapabilities,
  toModelCapabilityKey
} from "../lib/model-capabilities";
import type {
  AppSettings,
  ChatContextWindow,
  ChatSession,
  ConnectionTestResult,
  FontScale,
  ModelCapabilities,
  MessageDensity,
  ModelListResult,
  ProviderType,
  StoredProvider,
  ThemeMode
} from "../shared/contracts";
import type { SettingsSection } from "./Sidebar";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

type SettingsCenterProps = {
  section: SettingsSection;
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
  onTest: (settings: AppSettings) => Promise<ConnectionTestResult>;
  onListModels: (settings: AppSettings) => Promise<ModelListResult>;
  onExportSessions: () => void;
  onImportSessions: (sessions: ChatSession[]) => void;
  onClearSessions: () => void;
  onResetSettings: () => Promise<void>;
};

type ProviderPreset = {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  providerType: ProviderType;
};

const themeOptions: Array<{ value: ThemeMode; label: string; description: string }> = [
  { value: "system", label: "System", description: "Follow your OS preference." },
  { value: "light", label: "Light", description: "Always use the light interface." },
  { value: "dark", label: "Dark", description: "Always use the dark interface." }
];

const fontScaleOptions: Array<{ value: FontScale; label: string; description: string }> = [
  { value: "sm", label: "Small", description: "More content on screen." },
  { value: "md", label: "Medium", description: "Balanced reading size." },
  { value: "lg", label: "Large", description: "Larger, easier to read text." }
];

const densityOptions: Array<{ value: MessageDensity; label: string; description: string }> = [
  { value: "compact", label: "Compact", description: "Reduced spacing between messages." },
  { value: "comfortable", label: "Comfortable", description: "More breathing room in chat." }
];

const chatContextWindowOptions: Array<{
  value: ChatContextWindow;
  label: string;
  description: string;
}> = [
  { value: 5, label: "5", description: "Use the latest 5 user turns." },
  { value: 20, label: "20", description: "Use the latest 20 user turns." },
  { value: 50, label: "50", description: "Use the latest 50 user turns." },
  { value: "infinite", label: "Unlimited", description: "Use full session history." }
];

const providerPresets: ProviderPreset[] = [
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeBaseUrl = (raw: string) => raw.trim().replace(/\/+$/, "");
const resolveAnthropicEndpoint = (baseUrl: string, resource: "models" | "messages") => {
  const normalized = normalizeBaseUrl(baseUrl);
  const rooted = normalized
    .replace(/\/v1\/(messages|models)$/i, "")
    .replace(/\/(messages|models)$/i, "");
  return rooted.endsWith("/v1") ? `${rooted}/${resource}` : `${rooted}/v1/${resource}`;
};
const resolveProviderEndpoints = (baseUrl: string, providerType: ProviderType) => {
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

const isValidHttpUrl = (raw: string) => {
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

const createProvider = (index: number): StoredProvider => ({
  id: createProviderId(),
  name: `Provider ${index + 1}`,
  baseUrl: "",
  apiKey: "",
  model: "",
  savedModels: [],
  modelCapabilities: {},
  providerType: "openai",
  enabled: true,
  isPinned: false
});

const getActiveProvider = (settings: AppSettings): StoredProvider => {
  if (!settings.providers.length) {
    return {
      id: "provider-default",
      name: "Default provider",
      baseUrl: settings.baseUrl,
      apiKey: settings.apiKey,
      model: settings.model,
      savedModels: settings.model.trim() ? [settings.model.trim()] : [],
      modelCapabilities: {},
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

const syncProviderState = (
  settings: AppSettings,
  providers: StoredProvider[],
  requestedActiveId: string
): AppSettings => {
  const safeProviders = sortProviders(providers.length ? providers : [createProvider(0)]);
  const activeProvider =
    safeProviders.find((provider) => provider.id === requestedActiveId) ?? safeProviders[0];

  return {
    ...settings,
    providers: safeProviders,
    activeProviderId: activeProvider.id,
    baseUrl: activeProvider.baseUrl,
    apiKey: activeProvider.apiKey,
    model: activeProvider.model,
    providerType: activeProvider.providerType
  };
};

const normalizeDraft = (settings: AppSettings): AppSettings => {
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

    return {
      ...provider,
      id: provider.id.trim() || `provider-${index + 1}`,
      name: provider.name.trim() || `Provider ${index + 1}`,
      baseUrl: normalizeBaseUrl(provider.baseUrl),
      apiKey: provider.apiKey.trim(),
      model,
      savedModels,
      modelCapabilities,
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

  return syncProviderState(settings, providers, settings.activeProviderId);
};

const resolvePresetByBaseUrl = (baseUrl: string, providerType: ProviderType) => {
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

const providerBadgeByPreset: Record<
  string,
  { token: string; bgClass: string; textClass: string }
> = {
  openai: { token: "OA", bgClass: "bg-[#eef2f8]", textClass: "text-[#44536d]" },
  openrouter: { token: "OR", bgClass: "bg-[#f1f3f8]", textClass: "text-[#4f596d]" },
  groq: { token: "GQ", bgClass: "bg-[#f4f2ef]", textClass: "text-[#5b5350]" },
  deepseek: { token: "DS", bgClass: "bg-[#edf1f7]", textClass: "text-[#495871]" },
  claude: { token: "CL", bgClass: "bg-[#f4f1ee]", textClass: "text-[#5f5851]" },
  "claude-agent": { token: "CA", bgClass: "bg-[#f3efe8]", textClass: "text-[#5b5449]" },
  ollama: { token: "OL", bgClass: "bg-[#edf3f2]", textClass: "text-[#47605c]" },
  lmstudio: { token: "LM", bgClass: "bg-[#f1eef6]", textClass: "text-[#5b5370]" },
  "codex-acp": { token: "CP", bgClass: "bg-[#eef1f4]", textClass: "text-[#4a5866]" }
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

const getProviderBadgeVisual = (provider: StoredProvider) => {
  const presetId = inferProviderPresetId(provider);
  const presetBadge = providerBadgeByPreset[presetId];
  if (presetBadge) {
    return presetBadge;
  }

  const trimmed = provider.name.trim();
  return {
    token: trimmed ? trimmed.slice(0, 1).toUpperCase() : "P",
    bgClass: "bg-[#eef1f6]",
    textClass: "text-[#46556d]"
  };
};

const validateSettingsForSection = (draft: AppSettings, section: SettingsSection): string | null => {
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

const areSettingsEqual = (left: AppSettings, right: AppSettings) =>
  left.baseUrl === right.baseUrl &&
  left.apiKey === right.apiKey &&
  left.model === right.model &&
  left.activeProviderId === right.activeProviderId &&
  JSON.stringify(left.providers) === JSON.stringify(right.providers) &&
  left.theme === right.theme &&
  left.systemPrompt === right.systemPrompt &&
  left.temperature === right.temperature &&
  left.maxTokens === right.maxTokens &&
  left.chatContextWindow === right.chatContextWindow &&
  left.sendWithEnter === right.sendWithEnter &&
  left.fontScale === right.fontScale &&
  left.messageDensity === right.messageDensity &&
  left.requestTimeoutMs === right.requestTimeoutMs &&
  left.retryCount === right.retryCount &&
  left.sseDebug === right.sseDebug;

const isValidImportedSessions = (value: unknown): value is ChatSession[] =>
  Array.isArray(value) &&
  value.every(
    (session) =>
      session &&
      typeof session === "object" &&
      typeof (session as ChatSession).id === "string" &&
      typeof (session as ChatSession).title === "string" &&
      Array.isArray((session as ChatSession).messages)
  );

export const SettingsCenter = ({
  section,
  settings,
  onSave,
  onTest,
  onListModels,
  onExportSessions,
  onImportSessions,
  onClearSessions,
  onResetSettings
}: SettingsCenterProps) => {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [providerMessage, setProviderMessage] = useState<string | null>(null);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [providerSearch, setProviderSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [collapsedModelGroups, setCollapsedModelGroups] = useState<Record<string, boolean>>({});
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [isApiKeyCopied, setIsApiKeyCopied] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(settings);
    setTestResult(null);
    setSaveError(null);
    setDataMessage(null);
    setProviderMessage(null);
    setModelOptions([]);
    setProviderSearch("");
    setModelSearch("");
    setCollapsedModelGroups({});
    setIsFetchingModels(false);
    setIsApiKeyVisible(false);
    setIsApiKeyCopied(false);
  }, [settings, section]);

  const isDirty = useMemo(() => !areSettingsEqual(draft, settings), [draft, settings]);
  const activeProvider = useMemo(() => getActiveProvider(draft), [draft]);
  const isAcpProvider = activeProvider.providerType === "acp";
  const isClaudeAgentProvider = activeProvider.providerType === "claude-agent";
  const activeProviderPreset = useMemo(
    () => resolvePresetByBaseUrl(activeProvider.baseUrl, activeProvider.providerType)?.id ?? "custom",
    [activeProvider.baseUrl, activeProvider.providerType]
  );
  const activeSavedModels = useMemo(
    () =>
      Array.from(
        new Set(
          (Array.isArray(activeProvider.savedModels) ? activeProvider.savedModels : [])
            .map((entry) => entry.trim())
            .filter(Boolean)
        )
      ),
    [activeProvider.savedModels]
  );
  const activeModelCapabilities = useMemo(
    () => resolveProviderModelCapabilities(activeProvider, activeProvider.model),
    [activeProvider]
  );
  const hasActiveModelCapabilityOverride = useMemo(() => {
    const key = toModelCapabilityKey(activeProvider.model);
    return Boolean(key && activeProvider.modelCapabilities?.[key]);
  }, [activeProvider]);
  const mergedModelOptions = useMemo(() => {
    const currentModel = activeProvider.model.trim();
    return Array.from(
      new Set(
        [...activeSavedModels, ...modelOptions, currentModel]
          .map((entry) => entry.trim())
          .filter(Boolean)
      )
    );
  }, [activeProvider.model, activeSavedModels, modelOptions]);
  const activeProviderEndpoints = useMemo(
    () => resolveProviderEndpoints(activeProvider.baseUrl, activeProvider.providerType),
    [activeProvider.baseUrl, activeProvider.providerType]
  );
  const filteredProviders = useMemo(() => {
    const keyword = providerSearch.trim().toLowerCase();
    if (!keyword) {
      return draft.providers;
    }
    return draft.providers.filter((provider) => {
      const name = provider.name.toLowerCase();
      const baseUrl = provider.baseUrl.toLowerCase();
      return name.includes(keyword) || baseUrl.includes(keyword);
    });
  }, [draft.providers, providerSearch]);
  const filteredModelOptions = useMemo(() => {
    const keyword = modelSearch.trim().toLowerCase();
    if (!keyword) {
      return mergedModelOptions;
    }
    return mergedModelOptions.filter((modelId) => modelId.toLowerCase().includes(keyword));
  }, [mergedModelOptions, modelSearch]);
  const groupedModelOptions = useMemo(() => {
    const groups = new Map<string, string[]>();
    filteredModelOptions.forEach((modelId) => {
      const groupName = modelId.includes("/") ? modelId.split("/")[0] : "other";
      const current = groups.get(groupName) ?? [];
      current.push(modelId);
      groups.set(groupName, current);
    });
    return Array.from(groups.entries()).sort((left, right) => left[0].localeCompare(right[0]));
  }, [filteredModelOptions]);

  const updateField = <K extends keyof AppSettings>(field: K, value: AppSettings[K]) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
  };

  const updateActiveProviderField = (
    field: keyof Pick<StoredProvider, "name" | "baseUrl" | "apiKey" | "providerType">,
    value: string
  ) => {
    setDraft((previous) => {
      const nextProviders = previous.providers.map((provider) =>
        provider.id === previous.activeProviderId
          ? {
              ...provider,
              [field]:
                field === "providerType"
                  ? ((
                      value === "anthropic"
                        ? "anthropic"
                        : value === "acp"
                          ? "acp"
                          : value === "claude-agent"
                            ? "claude-agent"
                          : "openai"
                    ) as StoredProvider["providerType"])
                  : value
            }
          : provider
      );
      return syncProviderState(previous, nextProviders, previous.activeProviderId);
    });
    setTestResult(null);
    setSaveError(null);
  };

  const setActiveProviderModel = (nextModelRaw: string, persistToSavedModels: boolean) => {
    const nextModel = nextModelRaw.trim();
    setDraft((previous) => {
      const nextProviders = previous.providers.map((provider) => {
        if (provider.id !== previous.activeProviderId) {
          return provider;
        }

        const currentSavedModels = Array.from(
          new Set(
            (Array.isArray(provider.savedModels) ? provider.savedModels : [])
              .map((entry) => entry.trim())
              .filter(Boolean)
          )
        );
        const nextSavedModels = persistToSavedModels
          ? Array.from(new Set(nextModel ? [...currentSavedModels, nextModel] : currentSavedModels))
          : currentSavedModels;

        return {
          ...provider,
          model: nextModelRaw,
          savedModels: nextSavedModels
        };
      });
      return syncProviderState(previous, nextProviders, previous.activeProviderId);
    });
    setTestResult(null);
    setSaveError(null);
  };

  const toggleSavedModelSelection = (modelIdRaw: string) => {
    const modelId = modelIdRaw.trim();
    if (!modelId) {
      return;
    }

    setDraft((previous) => {
      const nextProviders = previous.providers.map((provider) => {
        if (provider.id !== previous.activeProviderId) {
          return provider;
        }

        const currentSavedModels = Array.from(
          new Set(
            (Array.isArray(provider.savedModels) ? provider.savedModels : [])
              .map((entry) => entry.trim())
              .filter(Boolean)
          )
        );
        const isSelected = currentSavedModels.includes(modelId);
        const nextSavedModels = isSelected
          ? currentSavedModels.filter((entry) => entry !== modelId)
          : [...currentSavedModels, modelId];
        const currentModel = provider.model.trim();
        const nextModel = isSelected
          ? currentModel === modelId
            ? nextSavedModels[0] ?? ""
            : provider.model
          : modelId;

        return {
          ...provider,
          model: nextModel,
          savedModels: nextSavedModels
        };
      });
      return syncProviderState(previous, nextProviders, previous.activeProviderId);
    });

    setTestResult(null);
    setSaveError(null);
  };

  const addCurrentModelToSavedModels = () => {
    const currentModel = activeProvider.model.trim();
    if (!currentModel) {
      setProviderMessage("Please enter a model first.");
      return;
    }
    setActiveProviderModel(currentModel, true);
    setProviderMessage(`Saved model: ${currentModel}`);
  };

  const removeSavedModel = (modelId: string) => {
    setDraft((previous) => {
      const nextProviders = previous.providers.map((provider) => {
        if (provider.id !== previous.activeProviderId) {
          return provider;
        }

        const nextSavedModels = (provider.savedModels ?? []).filter((entry) => entry !== modelId);
        const nextModel = provider.model === modelId ? nextSavedModels[0] ?? "" : provider.model;
        const key = toModelCapabilityKey(modelId);
        const nextCapabilities = { ...(provider.modelCapabilities ?? {}) };
        if (key) {
          delete nextCapabilities[key];
        }
        return {
          ...provider,
          model: nextModel,
          savedModels: nextSavedModels,
          modelCapabilities: nextCapabilities
        };
      });
      return syncProviderState(previous, nextProviders, previous.activeProviderId);
    });
    setProviderMessage(`Removed model: ${modelId}`);
    setTestResult(null);
    setSaveError(null);
  };

  const updateActiveModelCapability = (
    field: keyof Pick<
      ModelCapabilities,
      "imageInput" | "audioInput" | "videoInput" | "reasoningDisplay"
    >,
    value: boolean
  ) => {
    const modelId = activeProvider.model.trim();
    const key = toModelCapabilityKey(modelId);
    if (!key) {
      setProviderMessage("Please choose a model first.");
      return;
    }

    setDraft((previous) => {
      const nextProviders = previous.providers.map((provider) => {
        if (provider.id !== previous.activeProviderId) {
          return provider;
        }
        const current = resolveProviderModelCapabilities(provider, modelId);
        const nextCapabilities = {
          ...(provider.modelCapabilities ?? {}),
          [key]: {
            ...current,
            [field]: value
          }
        };
        return {
          ...provider,
          modelCapabilities: nextCapabilities
        };
      });
      return syncProviderState(previous, nextProviders, previous.activeProviderId);
    });
    setProviderMessage(`Updated model capability: ${field}`);
    setSaveError(null);
  };

  const resetActiveModelCapabilities = () => {
    const key = toModelCapabilityKey(activeProvider.model);
    if (!key) {
      setProviderMessage("Please choose a model first.");
      return;
    }

    setDraft((previous) => {
      const nextProviders = previous.providers.map((provider) => {
        if (provider.id !== previous.activeProviderId) {
          return provider;
        }
        const nextCapabilities = { ...(provider.modelCapabilities ?? {}) };
        delete nextCapabilities[key];
        return {
          ...provider,
          modelCapabilities: nextCapabilities
        };
      });
      return syncProviderState(previous, nextProviders, previous.activeProviderId);
    });
    setProviderMessage("Model capabilities reset to auto-detected values.");
  };

  const switchActiveProvider = (providerId: string) => {
    setDraft((previous) => syncProviderState(previous, previous.providers, providerId));
    setProviderMessage(null);
    setModelOptions([]);
    setModelSearch("");
    setCollapsedModelGroups({});
    setTestResult(null);
    setSaveError(null);
  };

  const addProvider = () => {
    setDraft((previous) => {
      const nextProvider = createProvider(previous.providers.length);
      const nextProviders = [...previous.providers, nextProvider];
      return syncProviderState(previous, nextProviders, nextProvider.id);
    });
    setProviderMessage("Added a new provider.");
    setModelOptions([]);
    setModelSearch("");
    setCollapsedModelGroups({});
    setTestResult(null);
    setSaveError(null);
  };

  const toggleProviderEnabled = (providerId: string) => {
    setDraft((previous) => {
      const nextProviders = previous.providers.map((provider) =>
        provider.id === providerId ? { ...provider, enabled: !provider.enabled } : provider
      );
      return syncProviderState(previous, nextProviders, previous.activeProviderId);
    });
    setProviderMessage("Provider state updated.");
    setTestResult(null);
    setSaveError(null);
  };

  const removeActiveProvider = () => {
    if (draft.providers.length <= 1) {
      setProviderMessage("Keep at least one provider.");
      return;
    }
    if (!window.confirm(`Remove "${activeProvider.name}"?`)) {
      return;
    }

    setDraft((previous) => {
      const nextProviders = previous.providers.filter(
        (provider) => provider.id !== previous.activeProviderId
      );
      const nextActiveId = nextProviders[0]?.id ?? "";
      return syncProviderState(previous, nextProviders, nextActiveId);
    });
    setProviderMessage("Provider removed.");
    setModelOptions([]);
    setModelSearch("");
    setCollapsedModelGroups({});
    setTestResult(null);
    setSaveError(null);
  };

  const save = async () => {
    const validationError = validateSettingsForSection(draft, section);
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const normalized = normalizeDraft({
        ...draft,
        systemPrompt: draft.systemPrompt.trim()
      });
      await onSave(normalized);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    setIsTesting(true);
    try {
      const result = await onTest(normalizeDraft(draft));
      setTestResult(result);
    } finally {
      setIsTesting(false);
    }
  };

  const applyProviderPreset = (presetId: string) => {
    if (presetId === "custom") {
      setProviderMessage("Using custom provider endpoint.");
      return;
    }

    const preset = providerPresets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    setDraft((previous) => {
      const nextProviders = previous.providers.map((provider) =>
        provider.id === previous.activeProviderId
          ? (() => {
              const nextModel = provider.model.trim() ? provider.model.trim() : preset.defaultModel;
              const nextApiKey = preset.providerType === "acp" ? "" : provider.apiKey;
              return {
                ...provider,
                baseUrl: preset.baseUrl,
                apiKey: nextApiKey,
                model: nextModel,
                savedModels: Array.from(
                  new Set([...(provider.savedModels ?? []), nextModel].map((entry) => entry.trim()))
                ).filter(Boolean),
                providerType: preset.providerType
              };
            })()
          : provider
      );
      return syncProviderState(previous, nextProviders, previous.activeProviderId);
    });
    setTestResult(null);
    setSaveError(null);
    setProviderMessage(`Applied ${preset.label} preset.`);
  };

  const toggleModelGroup = (groupName: string) => {
    setCollapsedModelGroups((previous) => ({
      ...previous,
      [groupName]: !previous[groupName]
    }));
  };

  const fetchModels = async () => {
    setIsFetchingModels(true);
    setProviderMessage(null);
    try {
      const source = normalizeDraft(draft);
      const result = await onListModels(source);
      setModelOptions(result.models);
      setCollapsedModelGroups({});
      if (result.ok && result.models.length && !activeProvider.model.trim()) {
        setActiveProviderModel(result.models[0], true);
      }
      setProviderMessage(result.message);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const copyApiKey = async () => {
    if (!activeProvider.apiKey.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(activeProvider.apiKey);
      setIsApiKeyCopied(true);
      window.setTimeout(() => setIsApiKeyCopied(false), 1200);
    } catch {
      setProviderMessage("Failed to copy API key.");
    }
  };

  const importSessionsFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as unknown;
      if (!isValidImportedSessions(parsed)) {
        throw new Error("JSON format is invalid.");
      }
      onImportSessions(parsed);
      setDataMessage(`Imported ${parsed.length} Chat(s).`);
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : "Failed to import sessions.");
    } finally {
      event.target.value = "";
    }
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  const clearSessions = () => {
    if (!window.confirm("Clear all Chats? This action cannot be undone.")) {
      return;
    }
    onClearSessions();
    setDataMessage("All Chats were cleared.");
  };

  const resetSettings = async () => {
    if (!window.confirm("Reset all settings to default values?")) {
      return;
    }

    setIsResetting(true);
    setSaveError(null);
    try {
      await onResetSettings();
      setDataMessage("Settings were reset to defaults.");
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : "Failed to reset settings.");
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <section className="h-full overflow-auto px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto w-full max-w-[980px]">
        {section === "provider" ? (
          <Card className="border-border bg-card/80">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Server className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-[0.16em]">Provider</span>
                  </div>
                  <CardTitle className="mt-2 text-2xl">Provider configuration</CardTitle>
                  <CardDescription className="mt-1">
                    Manage channels, then click one to edit its details.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm text-muted-foreground">Channels</label>
                    <Button type="button" variant="outline" onClick={addProvider}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Add channel
                    </Button>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={providerSearch}
                      onChange={(event) => setProviderSearch(event.target.value)}
                      placeholder="Search channels..."
                      className="pl-9"
                    />
                  </div>
                  <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
                    {filteredProviders.length ? (
                      filteredProviders.map((provider) => {
                        const isActive = provider.id === activeProvider.id;
                        const badgeVisual = getProviderBadgeVisual(provider);
                        return (
                          <div
                            key={provider.id}
                            className={cn(
                              "flex items-center justify-between rounded-[6px] border px-3 py-2 transition-colors",
                              isActive
                                ? "border-border bg-accent/60"
                                : "border-border/70 bg-card hover:bg-secondary/60"
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => switchActiveProvider(provider.id)}
                              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                            >
                              <span
                                className={cn(
                                  "grid h-8 w-8 shrink-0 place-content-center rounded-[4px] text-xs font-semibold",
                                  badgeVisual.bgClass,
                                  badgeVisual.textClass
                                )}
                              >
                                {badgeVisual.token}
                              </span>
                              <span className="truncate text-sm font-medium text-foreground">
                                {provider.name}
                              </span>
                            </button>
                            <Button
                              type="button"
                              variant="ghost"
                              className={cn(
                                "h-7 rounded-[4px] border px-2.5 text-xs",
                                provider.enabled
                                  ? "border-border bg-[#edf6ef] text-[#3d6644]"
                                  : "border-border/70 bg-muted text-muted-foreground"
                              )}
                              onClick={() => toggleProviderEnabled(provider.id)}
                            >
                              {provider.enabled ? "ON" : "OFF"}
                            </Button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-sm text-muted-foreground">
                        No provider matched your search.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">Channel details</p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={removeActiveProvider}
                        disabled={draft.providers.length <= 1}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        Remove channel
                      </Button>
                      <Button onClick={save} disabled={isSaving || !isDirty}>
                        {isSaving ? "确认中..." : "确认"}
                      </Button>
                    </div>
                  </div>

                  {!activeProvider.enabled ? (
                    <p className="rounded-md border border-border bg-accent/45 px-3 py-2 text-sm text-[#6c5740]">
                      This provider is OFF. Chat input will stay disabled until you turn it ON.
                    </p>
                  ) : null}

                  <div className="space-y-1.5">
                    <label htmlFor="providerName" className="text-sm text-muted-foreground">
                      Channel Name
                    </label>
                    <Input
                      id="providerName"
                      placeholder="e.g. OpenAI Work"
                      value={activeProvider.name}
                      onChange={(event) => updateActiveProviderField("name", event.target.value)}
                    />
                  </div>

                  {!isAcpProvider ? (
                    <div className="space-y-1.5">
                      <label htmlFor="apiKey" className="text-sm text-muted-foreground">
                        API Key
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id="apiKey"
                          type={isApiKeyVisible ? "text" : "password"}
                          placeholder="sk-..."
                          value={activeProvider.apiKey}
                          onChange={(event) => updateActiveProviderField("apiKey", event.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="px-2"
                          onClick={() => setIsApiKeyVisible((previous) => !previous)}
                          aria-label={isApiKeyVisible ? "Hide API key" : "Show API key"}
                        >
                          {isApiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="px-2"
                          onClick={copyApiKey}
                          disabled={!activeProvider.apiKey.trim()}
                          aria-label="Copy API key"
                        >
                          {isApiKeyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                        <Button type="button" variant="outline" onClick={testConnection} disabled={isTesting}>
                          {isTesting ? "Testing..." : "Test"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Use commas to separate multiple API keys.</p>
                    </div>
                  ) : (
                    <div className="rounded-md border border-border bg-secondary/55 p-3 text-sm text-muted-foreground">
                      <p>ACP uses your local Codex CLI login and config.</p>
                      <div className="mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={testConnection}
                          disabled={isTesting}
                        >
                          {isTesting ? "Checking..." : "Check Codex runtime"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="providerPreset" className="text-sm text-muted-foreground">
                        Provider Preset
                      </label>
                      <select
                        id="providerPreset"
                        value={activeProviderPreset}
                        onChange={(event) => applyProviderPreset(event.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="custom">Custom</option>
                        {providerPresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="providerType" className="text-sm text-muted-foreground">
                        API Format
                      </label>
                      <select
                        id="providerType"
                        value={activeProvider.providerType}
                        onChange={(event) => updateActiveProviderField("providerType", event.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="openai">OpenAI-compatible</option>
                        <option value="anthropic">Anthropic Messages API</option>
                        <option value="claude-agent">Claude Agent SDK</option>
                        <option value="acp">Codex CLI ACP</option>
                      </select>
                    </div>
                  </div>

                  {!isAcpProvider ? (
                    <div className="space-y-1.5">
                      <label htmlFor="baseUrl" className="text-sm text-muted-foreground">
                        {isClaudeAgentProvider ? "Anthropic Base URL (optional)" : "API URL"}
                      </label>
                      <Input
                        id="baseUrl"
                        placeholder={
                          isClaudeAgentProvider
                            ? "https://api.anthropic.com"
                            : "https://api.openai.com/v1"
                        }
                        value={activeProvider.baseUrl}
                        onChange={(event) => updateActiveProviderField("baseUrl", event.target.value)}
                      />
                      {activeProviderEndpoints ? (
                        <div className="rounded-md border border-border bg-secondary/55 p-2.5 text-xs text-muted-foreground">
                          <p>
                            Preview endpoint:{" "}
                            <span className="font-mono text-foreground">
                              {activeProviderEndpoints.chat}
                            </span>
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-sm text-muted-foreground">Runtime</label>
                      <div className="rounded-md border border-border bg-secondary/55 p-2.5 text-xs text-muted-foreground">
                        <p>
                          Transport:{" "}
                          <span className="font-mono text-foreground">
                            {activeProviderEndpoints?.chat ?? "codex app-server --listen stdio://"}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="model" className="text-sm text-muted-foreground">
                        Models
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="rounded-[4px] bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                          {filteredModelOptions.length}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addCurrentModelToSavedModels}
                          disabled={!activeProvider.model.trim()}
                        >
                          Save current
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={fetchModels}
                          disabled={isFetchingModels}
                        >
                          {isFetchingModels
                            ? isAcpProvider
                              ? "Checking..."
                              : "Fetching..."
                            : isAcpProvider
                              ? "Check models"
                              : "Fetch models"}
                        </Button>
                      </div>
                    </div>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={modelSearch}
                        onChange={(event) => setModelSearch(event.target.value)}
                        placeholder="Search models..."
                        className="pl-9"
                      />
                    </div>
                    <Input
                      id="model"
                      placeholder={isAcpProvider ? "gpt-5-codex (optional)" : "gpt-4.1-mini"}
                      value={activeProvider.model}
                      onChange={(event) => setActiveProviderModel(event.target.value, false)}
                    />
                    <div className="space-y-1.5 rounded-md border border-border bg-secondary/45 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                          Model capabilities
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={resetActiveModelCapabilities}
                          disabled={!activeProvider.model.trim() || !hasActiveModelCapabilityOverride}
                        >
                          Auto detect
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          className={cn(
                            "rounded-[6px] border px-2.5 py-2 text-left text-xs transition-colors",
                            activeModelCapabilities.imageInput
                              ? "border-border bg-accent/65 text-foreground"
                              : "border-border/70 bg-card text-muted-foreground hover:bg-secondary/65"
                          )}
                          onClick={() =>
                            updateActiveModelCapability("imageInput", !activeModelCapabilities.imageInput)
                          }
                        >
                          图片输入
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "rounded-[6px] border px-2.5 py-2 text-left text-xs transition-colors",
                            activeModelCapabilities.audioInput
                              ? "border-border bg-accent/65 text-foreground"
                              : "border-border/70 bg-card text-muted-foreground hover:bg-secondary/65"
                          )}
                          onClick={() =>
                            updateActiveModelCapability("audioInput", !activeModelCapabilities.audioInput)
                          }
                        >
                          音频输入
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "rounded-[6px] border px-2.5 py-2 text-left text-xs transition-colors",
                            activeModelCapabilities.videoInput
                              ? "border-border bg-accent/65 text-foreground"
                              : "border-border/70 bg-card text-muted-foreground hover:bg-secondary/65"
                          )}
                          onClick={() =>
                            updateActiveModelCapability("videoInput", !activeModelCapabilities.videoInput)
                          }
                        >
                          视频输入
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "rounded-[6px] border px-2.5 py-2 text-left text-xs transition-colors",
                            activeModelCapabilities.reasoningDisplay
                              ? "border-border bg-accent/65 text-foreground"
                              : "border-border/70 bg-card text-muted-foreground hover:bg-secondary/65"
                          )}
                          onClick={() =>
                            updateActiveModelCapability(
                              "reasoningDisplay",
                              !activeModelCapabilities.reasoningDisplay
                            )
                          }
                        >
                          思维链显示
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        默认按模型名自动推断；你可以手动覆盖。输入窗口会按这些能力限制附件并给出提示。
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        Saved models for this channel
                      </p>
                      {activeSavedModels.length ? (
                        <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-secondary/45 p-2">
                          {activeSavedModels.map((modelId) => (
                            <span
                              key={modelId}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                                activeSavedModels.includes(modelId)
                                  ? "border-border bg-accent/60 text-foreground"
                                  : "border-border/80 bg-card text-foreground"
                              )}
                            >
                              <button
                                type="button"
                                className="max-w-[220px] truncate text-left"
                                onClick={() => toggleSavedModelSelection(modelId)}
                                title={modelId}
                              >
                                {modelId}
                              </button>
                              <button
                                type="button"
                                className="rounded p-0.5 text-muted-foreground hover:bg-accent/55 hover:text-foreground"
                                onClick={() => removeSavedModel(modelId)}
                                aria-label={`Remove saved model ${modelId}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-md border border-dashed border-border/70 bg-card/70 px-2.5 py-2 text-xs text-muted-foreground">
                          No saved models yet. Pick one from the list below or type and click Save current.
                        </p>
                      )}
                    </div>
                    {groupedModelOptions.length ? (
                      <div className="max-h-[300px] space-y-2 overflow-auto rounded-md border border-border bg-secondary/45 p-2">
                        {groupedModelOptions.map(([groupName, models]) => {
                          const isCollapsed = Boolean(collapsedModelGroups[groupName]);
                          return (
                            <div key={groupName} className="rounded-md border border-border bg-card">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm font-medium text-foreground"
                                onClick={() => toggleModelGroup(groupName)}
                              >
                                {isCollapsed ? (
                                  <ChevronRight className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                                <span>{groupName}</span>
                              </button>
                              {!isCollapsed ? (
                                <div className="space-y-1 border-t border-border/55 px-2 py-2">
                                  {models.map((modelId) => (
                                    <button
                                      key={modelId}
                                      type="button"
                                      data-no-drag="true"
                                      className={cn(
                                        "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm",
                                        activeSavedModels.includes(modelId)
                                          ? "bg-accent/60 text-foreground"
                                          : "hover:bg-secondary/65"
                                      )}
                                      onClick={() => toggleSavedModelSelection(modelId)}
                                      aria-label={`Select model ${modelId}`}
                                    >
                                      <span className="truncate">{modelId}</span>
                                      <span
                                        className={cn(
                                          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                                          activeSavedModels.includes(modelId)
                                            ? "border-border bg-accent/70 text-foreground"
                                            : "border-border/70 bg-card text-transparent"
                                        )}
                                      >
                                        <Check className="h-3 w-3" />
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {testResult ? (
                <p className={testResult.ok ? "text-sm text-[#3f6b57]" : "text-sm text-destructive"}>
                  {testResult.message}
                </p>
              ) : null}
              {providerMessage ? <p className="text-sm text-muted-foreground">{providerMessage}</p> : null}
              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        {section === "chat" ? (
          <Card className="border-border bg-card/80">
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">Chat</span>
              </div>
              <CardTitle className="text-2xl">Chat behavior</CardTitle>
              <CardDescription>Tune response behavior and message composer shortcuts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="systemPrompt" className="text-sm text-muted-foreground">
                  System Prompt
                </label>
                <textarea
                  id="systemPrompt"
                  className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="You are a precise and pragmatic coding assistant."
                  value={draft.systemPrompt}
                  onChange={(event) => updateField("systemPrompt", event.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="temperature" className="text-sm text-muted-foreground">
                    Temperature (0 - 2)
                  </label>
                  <Input
                    id="temperature"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={draft.temperature}
                    onChange={(event) =>
                      updateField("temperature", Number.parseFloat(event.target.value) || 0)
                    }
                    onBlur={() => updateField("temperature", clamp(draft.temperature, 0, 2))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="maxTokens" className="text-sm text-muted-foreground">
                    Max Tokens (64 - 8192)
                  </label>
                  <Input
                    id="maxTokens"
                    type="number"
                    min={64}
                    max={8192}
                    step={1}
                    value={draft.maxTokens}
                    onChange={(event) =>
                      updateField("maxTokens", Number.parseInt(event.target.value, 10) || 64)
                    }
                    onBlur={() =>
                      updateField("maxTokens", Math.round(clamp(draft.maxTokens, 64, 8192)))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">Context Window</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {chatContextWindowOptions.map((option) => {
                    const active = draft.chatContextWindow === option.value;
                    return (
                      <button
                        key={String(option.value)}
                        type="button"
                        className={cn(
                          "rounded-[6px] border px-4 py-3 text-left transition-colors",
                          active
                            ? "border-border bg-accent/60"
                            : "border-border/70 bg-card hover:bg-secondary/65"
                        )}
                        onClick={() => updateField("chatContextWindow", option.value)}
                      >
                        <p className="text-sm font-semibold text-foreground">{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Applies to chat mode only. System prompt is always included.
                </p>
              </div>

              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-[6px] border px-4 py-3 text-left transition-colors",
                  draft.sendWithEnter
                    ? "border-border bg-accent/60"
                    : "border-border/70 bg-card hover:bg-secondary/65"
                )}
                onClick={() => updateField("sendWithEnter", !draft.sendWithEnter)}
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">Enter sends message</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {draft.sendWithEnter
                      ? "Enabled: Enter sends, Shift+Enter adds a new line."
                      : "Disabled: Enter adds a new line. Use Cmd/Ctrl+Enter to send."}
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {draft.sendWithEnter ? "On" : "Off"}
                </span>
              </button>

              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
              <div className="flex items-center justify-end">
                <Button onClick={save} disabled={isSaving || !isDirty}>
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === "theme" ? (
          <Card className="border-border bg-card/80">
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Palette className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">Theme</span>
              </div>
              <CardTitle className="text-2xl">Theme preference</CardTitle>
              <CardDescription>Choose how the app should display in your workspace.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                {themeOptions.map((option) => {
                  const active = draft.theme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        "rounded-[6px] border px-4 py-3 text-left transition-colors",
                        active
                          ? "border-border bg-accent/60"
                          : "border-border/70 bg-card hover:bg-secondary/65"
                      )}
                      onClick={() => updateField("theme", option.value)}
                    >
                      <p className="text-sm font-semibold text-foreground">{option.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Font size</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {fontScaleOptions.map((option) => {
                    const active = draft.fontScale === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          "rounded-[6px] border px-4 py-3 text-left transition-colors",
                          active
                            ? "border-border bg-accent/60"
                            : "border-border/70 bg-card hover:bg-secondary/65"
                        )}
                        onClick={() => updateField("fontScale", option.value)}
                      >
                        <p className="text-sm font-semibold text-foreground">{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Message density</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {densityOptions.map((option) => {
                    const active = draft.messageDensity === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(
                          "rounded-[6px] border px-4 py-3 text-left transition-colors",
                          active
                            ? "border-border bg-accent/60"
                            : "border-border/70 bg-card hover:bg-secondary/65"
                        )}
                        onClick={() => updateField("messageDensity", option.value)}
                      >
                        <p className="text-sm font-semibold text-foreground">{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
              <div className="flex items-center justify-end">
                <Button onClick={save} disabled={isSaving || !isDirty}>
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === "data" ? (
          <Card className="border-border bg-card/80">
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Database className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">Data</span>
              </div>
              <CardTitle className="text-2xl">Data management</CardTitle>
              <CardDescription>Export, import, and reset local app data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={importSessionsFromFile}
              />
              <div className="grid gap-2 md:grid-cols-2">
                <Button variant="outline" onClick={onExportSessions}>
                  Export sessions (.json)
                </Button>
                <Button variant="outline" onClick={triggerImport}>
                  Import sessions (.json)
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Button variant="outline" onClick={clearSessions}>
                  Clear all sessions
                </Button>
                <Button variant="outline" onClick={resetSettings} disabled={isResetting}>
                  {isResetting ? "Resetting..." : "Reset settings"}
                </Button>
              </div>
              {dataMessage ? <p className="text-sm text-muted-foreground">{dataMessage}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        {section === "advanced" ? (
          <Card className="border-border bg-card/80">
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">Advanced</span>
              </div>
              <CardTitle className="text-2xl">Advanced behavior</CardTitle>
              <CardDescription>Configure request timeout, retry strategy, and debug logs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="requestTimeoutMs" className="text-sm text-muted-foreground">
                    Request Timeout (ms)
                  </label>
                  <Input
                    id="requestTimeoutMs"
                    type="number"
                    min={5000}
                    max={180000}
                    step={1000}
                    value={draft.requestTimeoutMs}
                    onChange={(event) =>
                      updateField("requestTimeoutMs", Number.parseInt(event.target.value, 10) || 5000)
                    }
                    onBlur={() =>
                      updateField(
                        "requestTimeoutMs",
                        Math.round(clamp(draft.requestTimeoutMs, 5000, 180000))
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="retryCount" className="text-sm text-muted-foreground">
                    Retry Count
                  </label>
                  <Input
                    id="retryCount"
                    type="number"
                    min={0}
                    max={3}
                    step={1}
                    value={draft.retryCount}
                    onChange={(event) =>
                      updateField("retryCount", Number.parseInt(event.target.value, 10) || 0)
                    }
                    onBlur={() => updateField("retryCount", Math.round(clamp(draft.retryCount, 0, 3)))}
                  />
                </div>
              </div>

              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-[6px] border px-4 py-3 text-left transition-colors",
                  draft.sseDebug
                    ? "border-border bg-accent/60"
                    : "border-border/70 bg-card hover:bg-secondary/65"
                )}
                onClick={() => updateField("sseDebug", !draft.sseDebug)}
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">SSE debug log</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prints stream events in DevTools console for troubleshooting.
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {draft.sseDebug ? "On" : "Off"}
                </span>
              </button>

              {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
              <div className="flex items-center justify-end">
                <Button onClick={save} disabled={isSaving || !isDirty}>
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
};
