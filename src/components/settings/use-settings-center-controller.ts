import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  resolveProviderModelContextWindow,
  toModelContextWindowKey
} from "../../lib/model-context-window";
import {
  resolveProviderModelCapabilities,
  toModelCapabilityKey
} from "../../lib/model-capabilities";
import {
  areSettingsEqual,
  clamp,
  createProvider,
  getActiveProvider,
  isValidImportedSessions,
  normalizeDraft,
  providerPresets,
  resolvePresetByBaseUrl,
  resolveProviderEndpoints,
  syncProviderState,
  validateSettingsForSection
} from "../../lib/settings-center-utils";
import {
  combineStatusMessages,
  toMcpStatusMap,
  toProviderTypeValue
} from "./controller-helpers";
import type {
  AppSettings,
  ChatSession,
  ConnectionTestResult,
  ModelCapabilities,
  ModelListResult,
  McpServerConfig,
  McpServerStatus,
  McpServerStatusListResult,
  Skill,
  StoredProvider
} from "../../shared/contracts";
import type { SettingsSection } from "../Sidebar";

export type SettingsCenterProps = {
  section: SettingsSection;
  userSkills: Skill[];
  onSaveUserSkills: (skills: Skill[]) => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
  onTest: (settings: AppSettings) => Promise<ConnectionTestResult>;
  onTestMemos: (settings: AppSettings) => Promise<ConnectionTestResult>;
  onListModels: (settings: AppSettings) => Promise<ModelListResult>;
  onListMcpServers: (settings: AppSettings) => Promise<{ ok: boolean; message: string; servers: McpServerConfig[] }>;
  onListMcpServerStatus: (settings: AppSettings) => Promise<McpServerStatusListResult>;
  onReloadMcpServers: (settings: AppSettings) => Promise<McpServerStatusListResult>;
  onExportSessions: () => void;
  onImportSessions: (sessions: ChatSession[]) => void;
  onClearSessions: () => void;
  onResetSettings: () => Promise<void>;
};

export const useSettingsCenterController = ({
  section,
  userSkills,
  onSaveUserSkills,
  settings,
  onSave,
  onTest,
  onTestMemos,
  onListModels,
  onListMcpServers,
  onListMcpServerStatus,
  onReloadMcpServers,
  onExportSessions,
  onImportSessions,
  onClearSessions,
  onResetSettings
}: SettingsCenterProps) => {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [isTestingMemos, setIsTestingMemos] = useState(false);
  const [memosTestResult, setMemosTestResult] = useState<ConnectionTestResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [providerMessage, setProviderMessage] = useState<string | null>(null);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [mcpServerStatuses, setMcpServerStatuses] = useState<Record<string, McpServerStatus>>({});
  const [isFetchingMcp, setIsFetchingMcp] = useState(false);
  const [isReloadingMcp, setIsReloadingMcp] = useState(false);
  const [mcpMessage, setMcpMessage] = useState<string | null>(null);
  const [providerSearch, setProviderSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [collapsedModelGroups, setCollapsedModelGroups] = useState<Record<string, boolean>>({});
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [isApiKeyCopied, setIsApiKeyCopied] = useState(false);
  const [modelContextWindowDraft, setModelContextWindowDraft] = useState("");
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
    setModelContextWindowDraft("");
    setMemosTestResult(null);
    setIsTestingMemos(false);
  }, [settings, section]);

  const isDirty = useMemo(() => !areSettingsEqual(draft, settings), [draft, settings]);
  const activeProvider = useMemo(() => getActiveProvider(draft), [draft]);
  const isAcpProvider = activeProvider.providerType === "acp";
  const isClaudeAgentProvider = activeProvider.providerType === "claude-agent";
  const activeProviderPreset = useMemo(
    () => resolvePresetByBaseUrl(activeProvider.baseUrl, activeProvider.providerType)?.id ?? "custom",
    [activeProvider.baseUrl, activeProvider.providerType]
  );
  const soulEvolutionProvider = useMemo(
    () =>
      draft.providers.find((provider) => provider.id === draft.soulEvolution.providerId) ??
      draft.providers[0],
    [draft.providers, draft.soulEvolution.providerId]
  );
  const soulEvolutionModelOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...(Array.isArray(soulEvolutionProvider?.savedModels) ? soulEvolutionProvider.savedModels : []),
            soulEvolutionProvider?.model ?? "",
            draft.soulEvolution.model
          ]
            .map((entry) => entry.trim())
            .filter(Boolean)
        )
      ),
    [draft.soulEvolution.model, soulEvolutionProvider]
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
  const activeModelContextWindow = useMemo(
    () => resolveProviderModelContextWindow(activeProvider, activeProvider.model),
    [activeProvider]
  );
  const hasActiveModelContextWindowOverride = useMemo(() => {
    const key = toModelContextWindowKey(activeProvider.model);
    return Boolean(key && typeof activeProvider.modelContextWindows?.[key] === "number");
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

  useEffect(() => {
    setModelContextWindowDraft(String(activeModelContextWindow));
  }, [activeModelContextWindow, activeProvider.id, activeProvider.model]);

  const updateField = <K extends keyof AppSettings>(field: K, value: AppSettings[K]) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
  };

  const updateEnvironmentField = <K extends keyof AppSettings["environment"]>(
    field: K,
    value: AppSettings["environment"][K]
  ) => {
    setDraft((previous) => ({
      ...previous,
      environment: {
        ...previous.environment,
        [field]: value
      }
    }));
  };

  const updateMemosField = <K extends keyof AppSettings["memos"]>(
    field: K,
    value: AppSettings["memos"][K]
  ) => {
    setDraft((previous) => ({
      ...previous,
      memos: {
        ...previous.memos,
        [field]: value
      }
    }));
    setMemosTestResult(null);
    setSaveError(null);
  };

  const updateSoulEvolutionField = <K extends keyof AppSettings["soulEvolution"]>(
    field: K,
    value: AppSettings["soulEvolution"][K]
  ) => {
    setDraft((previous) => {
      const nextSoulEvolution = {
        ...previous.soulEvolution,
        [field]: value
      };
      if (field === "providerId") {
        const nextProvider =
          previous.providers.find((provider) => provider.id === value) ?? previous.providers[0];
        nextSoulEvolution.model = nextSoulEvolution.model.trim() || nextProvider?.model || "";
      }
      return {
        ...previous,
        soulEvolution: nextSoulEvolution
      };
    });
    setSaveError(null);
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
                  ? toProviderTypeValue(value)
                  : value
            }
          : provider
      );
      return syncProviderState(previous, nextProviders, previous.activeProviderId);
    });
    setTestResult(null);
    setSaveError(null);
  };

  const updateActiveProviderMcpOverride = (
    serverNameRaw: string,
    mode: "default" | "enabled" | "disabled"
  ) => {
    const serverName = serverNameRaw.trim();
    if (!serverName) {
      return;
    }

    setDraft((previous) => {
      const nextProviders = previous.providers.map((provider) => {
        if (provider.id !== previous.activeProviderId) {
          return provider;
        }
        const nextOverrides = { ...(provider.mcpServerOverrides ?? {}) };
        if (mode === "default") {
          delete nextOverrides[serverName];
        } else {
          nextOverrides[serverName] = { enabled: mode === "enabled" };
        }
        return {
          ...provider,
          mcpServerOverrides: nextOverrides
        };
      });
      return syncProviderState(previous, nextProviders, previous.activeProviderId);
    });
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
        const nextContextWindows = { ...(provider.modelContextWindows ?? {}) };
        if (key) {
          delete nextCapabilities[key];
          delete nextContextWindows[key];
        }
        return {
          ...provider,
          model: nextModel,
          savedModels: nextSavedModels,
          modelCapabilities: nextCapabilities,
          modelContextWindows: nextContextWindows
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

  const setActiveModelContextWindow = (nextValue: number) => {
    const modelId = activeProvider.model.trim();
    const key = toModelContextWindowKey(modelId);
    if (!key) {
      setProviderMessage("Please choose a model first.");
      return;
    }

    const normalized = Math.round(clamp(nextValue, 1024, 2_000_000));
    setDraft((previous) => {
      const nextProviders = previous.providers.map((provider) => {
        if (provider.id !== previous.activeProviderId) {
          return provider;
        }
        return {
          ...provider,
          modelContextWindows: {
            ...(provider.modelContextWindows ?? {}),
            [key]: normalized
          }
        };
      });
      return syncProviderState(previous, nextProviders, previous.activeProviderId);
    });
    setProviderMessage(`Updated model context window: ${normalized.toLocaleString()} tokens`);
    setSaveError(null);
  };

  const resetActiveModelContextWindow = () => {
    const key = toModelContextWindowKey(activeProvider.model);
    if (!key) {
      setProviderMessage("Please choose a model first.");
      return;
    }

    setDraft((previous) => {
      const nextProviders = previous.providers.map((provider) => {
        if (provider.id !== previous.activeProviderId) {
          return provider;
        }
        const nextContextWindows = { ...(provider.modelContextWindows ?? {}) };
        delete nextContextWindows[key];
        return {
          ...provider,
          modelContextWindows: nextContextWindows
        };
      });
      return syncProviderState(previous, nextProviders, previous.activeProviderId);
    });
    setProviderMessage("Model context window reset to auto-detected value.");
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
        systemPrompt: draft.systemPrompt.trim(),
        agentSystemPrompt: draft.agentSystemPrompt.trim()
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

  const testMemosConnection = async () => {
    setIsTestingMemos(true);
    try {
      const result = await onTestMemos(normalizeDraft(draft));
      setMemosTestResult(result);
    } finally {
      setIsTestingMemos(false);
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

  const refreshMcpServers = async () => {
    setIsFetchingMcp(true);
    setMcpMessage(null);
    try {
      const source = normalizeDraft(draft);
      const [configResult, statusResult] = await Promise.all([
        onListMcpServers(source),
        onListMcpServerStatus(source)
      ]);
      setMcpServers(configResult.servers);
      setMcpServerStatuses(toMcpStatusMap(statusResult.servers));
      setMcpMessage(combineStatusMessages(configResult.message, statusResult.message));
    } finally {
      setIsFetchingMcp(false);
    }
  };

  const reloadMcpServerConfig = async () => {
    setIsReloadingMcp(true);
    setMcpMessage(null);
    try {
      const source = normalizeDraft(draft);
      const [reloadResult, configResult] = await Promise.all([
        onReloadMcpServers(source),
        onListMcpServers(source)
      ]);
      setMcpServerStatuses(toMcpStatusMap(reloadResult.servers));
      setMcpServers(configResult.servers);
      setMcpMessage(combineStatusMessages(reloadResult.message, configResult.message));
    } finally {
      setIsReloadingMcp(false);
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

  useEffect(() => {
    if (section !== "provider" && section !== "mcp") {
      return;
    }
    void refreshMcpServers();
  }, [activeProvider.id, section]);

  return {
    section,
    userSkills,
    onSaveUserSkills,
    settings,
    onSave,
    onTest,
    onTestMemos,
    onListModels,
    onListMcpServers,
    onListMcpServerStatus,
    onReloadMcpServers,
    onExportSessions,
    onImportSessions,
    onClearSessions,
    onResetSettings,
    draft,
    setDraft,
    isSaving,
    isTesting,
    testResult,
    isTestingMemos,
    memosTestResult,
    saveError,
    dataMessage,
    providerMessage,
    isFetchingModels,
    modelOptions,
    mcpServers,
    mcpServerStatuses,
    isFetchingMcp,
    isReloadingMcp,
    mcpMessage,
    providerSearch,
    setProviderSearch,
    modelSearch,
    setModelSearch,
    collapsedModelGroups,
    setCollapsedModelGroups,
    isApiKeyVisible,
    setIsApiKeyVisible,
    isApiKeyCopied,
    modelContextWindowDraft,
    setModelContextWindowDraft,
    isResetting,
    fileInputRef,
    isDirty,
    activeProvider,
    isAcpProvider,
    isClaudeAgentProvider,
    activeProviderPreset,
    soulEvolutionProvider,
    soulEvolutionModelOptions,
    activeSavedModels,
    activeModelCapabilities,
    hasActiveModelCapabilityOverride,
    activeModelContextWindow,
    hasActiveModelContextWindowOverride,
    mergedModelOptions,
    activeProviderEndpoints,
    filteredProviders,
    filteredModelOptions,
    groupedModelOptions,
    updateField,
    updateEnvironmentField,
    updateMemosField,
    updateSoulEvolutionField,
    updateActiveProviderField,
    updateActiveProviderMcpOverride,
    setActiveProviderModel,
    toggleSavedModelSelection,
    addCurrentModelToSavedModels,
    removeSavedModel,
    updateActiveModelCapability,
    resetActiveModelCapabilities,
    setActiveModelContextWindow,
    resetActiveModelContextWindow,
    switchActiveProvider,
    addProvider,
    toggleProviderEnabled,
    removeActiveProvider,
    save,
    testConnection,
    testMemosConnection,
    applyProviderPreset,
    toggleModelGroup,
    fetchModels,
    toMcpStatusMap,
    refreshMcpServers,
    reloadMcpServerConfig,
    copyApiKey,
    importSessionsFromFile,
    triggerImport,
    clearSessions,
    resetSettings
  };
};
