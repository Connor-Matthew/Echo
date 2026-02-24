import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  Database,
  Eye,
  EyeOff,
  MessageSquare,
  Palette,
  Plus,
  Search,
  Server,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { cn } from "../lib/utils";
import {
  resolveProviderModelContextWindow,
  toModelContextWindowKey
} from "../lib/model-context-window";
import {
  resolveProviderModelCapabilities,
  toModelCapabilityKey
} from "../lib/model-capabilities";
import {
  areSettingsEqual,
  chatContextWindowOptions,
  clamp,
  createProvider,
  densityOptions,
  fontScaleOptions,
  getActiveProvider,
  getProviderBadgeVisual,
  isValidImportedSessions,
  normalizeDraft,
  providerPresets,
  resolvePresetByBaseUrl,
  resolveProviderEndpoints,
  syncProviderState,
  themeOptions,
  validateSettingsForSection
} from "../lib/settings-center-utils";
import type {
  AppSettings,
  ChatSession,
  ConnectionTestResult,
  ModelListResult,
  ModelCapabilities,
  PersonaSnapshot,
  StoredProvider
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
  onTestMemos: (settings: AppSettings) => Promise<ConnectionTestResult>;
  onListModels: (settings: AppSettings) => Promise<ModelListResult>;
  onGetPersonaSnapshot: () => Promise<PersonaSnapshot>;
  onGetPersonaMarkdown: () => Promise<string>;
  onSavePersonaMarkdown: (markdown: string) => Promise<PersonaSnapshot>;
  onExportSessions: () => void;
  onImportSessions: (sessions: ChatSession[]) => void;
  onClearSessions: () => void;
  onResetSettings: () => Promise<void>;
};

export const SettingsCenter = ({
  section,
  settings,
  onSave,
  onTest,
  onTestMemos,
  onListModels,
  onGetPersonaSnapshot,
  onGetPersonaMarkdown,
  onSavePersonaMarkdown,
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
  const [providerSearch, setProviderSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [collapsedModelGroups, setCollapsedModelGroups] = useState<Record<string, boolean>>({});
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [isApiKeyCopied, setIsApiKeyCopied] = useState(false);
  const [modelContextWindowDraft, setModelContextWindowDraft] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [personaSnapshot, setPersonaSnapshot] = useState<PersonaSnapshot | null>(null);
  const [isPersonaLoading, setIsPersonaLoading] = useState(false);
  const [isPersonaDocumentSaving, setIsPersonaDocumentSaving] = useState(false);
  const [personaDocumentDraft, setPersonaDocumentDraft] = useState("");
  const [personaDocumentBaseline, setPersonaDocumentBaseline] = useState("");
  const [personaDocumentMessage, setPersonaDocumentMessage] = useState<string | null>(null);
  const [personaError, setPersonaError] = useState<string | null>(null);
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
    setPersonaError(null);
    setPersonaDocumentMessage(null);
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

  const refreshPersonaSnapshot = useCallback(async () => {
    setIsPersonaLoading(true);
    setPersonaError(null);
    setPersonaDocumentMessage(null);
    try {
      const [snapshot, markdown] = await Promise.all([onGetPersonaSnapshot(), onGetPersonaMarkdown()]);
      setPersonaSnapshot(snapshot);
      setPersonaDocumentDraft(markdown);
      setPersonaDocumentBaseline(markdown);
    } catch (error) {
      setPersonaError(error instanceof Error ? error.message : "Failed to load soul profile.");
    } finally {
      setIsPersonaLoading(false);
    }
  }, [onGetPersonaMarkdown, onGetPersonaSnapshot]);

  const hasPersonaDocumentChanges = personaDocumentDraft !== personaDocumentBaseline;

  const savePersonaDocument = async () => {
    setIsPersonaDocumentSaving(true);
    setPersonaError(null);
    setPersonaDocumentMessage(null);
    try {
      const snapshot = await onSavePersonaMarkdown(personaDocumentDraft);
      const latestMarkdown = await onGetPersonaMarkdown();
      setPersonaSnapshot(snapshot);
      setPersonaDocumentDraft(latestMarkdown);
      setPersonaDocumentBaseline(latestMarkdown);
      setPersonaDocumentMessage(
        snapshot.warning ? `Saved with warning: ${snapshot.warning.message}` : "Document saved."
      );
    } catch (error) {
      setPersonaError(error instanceof Error ? error.message : "Failed to save soul document.");
    } finally {
      setIsPersonaDocumentSaving(false);
    }
  };

  useEffect(() => {
    if (section !== "soul") {
      return;
    }
    void refreshPersonaSnapshot();
  }, [refreshPersonaSnapshot, section]);

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
                    <div className="space-y-1.5 rounded-md border border-border bg-secondary/45 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                          Context Window (tokens)
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={resetActiveModelContextWindow}
                          disabled={!activeProvider.model.trim() || !hasActiveModelContextWindowOverride}
                        >
                          Auto detect
                        </Button>
                      </div>
                      <Input
                        value={modelContextWindowDraft}
                        onChange={(event) => setModelContextWindowDraft(event.target.value)}
                        onBlur={() => {
                          const parsed = Number.parseInt(modelContextWindowDraft, 10);
                          if (!Number.isFinite(parsed)) {
                            setModelContextWindowDraft(String(activeModelContextWindow));
                            return;
                          }
                          setActiveModelContextWindow(parsed);
                        }}
                        type="number"
                        min={1024}
                        max={2_000_000}
                        step={1}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        这里是模型可用上下文窗口。输入框右下角的 usage 监控会显示“已用 / 这个上限”。
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

        {section === "soul" ? (
          <Card className="border-border bg-card/80">
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">Soul</span>
              </div>
              <CardTitle className="text-2xl">Soul mode</CardTitle>
              <CardDescription>
                Set default behavior for new chats and inspect what Soul mode records.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-[6px] border px-4 py-3 text-left transition-colors",
                  draft.defaultSoulModeEnabled
                    ? "border-border bg-accent/60"
                    : "border-border/70 bg-card hover:bg-secondary/65"
                )}
                onClick={() => updateField("defaultSoulModeEnabled", !draft.defaultSoulModeEnabled)}
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">Enable Soul mode for new chats</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Existing chats keep their current state. You can still toggle Soul mode per chat in
                    the header.
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {draft.defaultSoulModeEnabled ? "On" : "Off"}
                </span>
              </button>

              <div className="rounded-[6px] border border-border/75 bg-card px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Soul profile snapshot</p>
                    <p className="text-xs text-muted-foreground">
                      Profile and source document used for Soul mode memory injection.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void refreshPersonaSnapshot();
                    }}
                    disabled={isPersonaLoading}
                  >
                    {isPersonaLoading ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>

                {personaError ? <p className="mt-3 text-sm text-destructive">{personaError}</p> : null}
                {personaDocumentMessage ? (
                  <p className="mt-3 text-sm text-muted-foreground">{personaDocumentMessage}</p>
                ) : null}

                {personaSnapshot ? (
                  <div className="mt-3 space-y-3">
                    <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                      <p>Updated: {new Date(personaSnapshot.profile.updatedAt).toLocaleString()}</p>
                      <p>Source mode: {personaSnapshot.profile.sourceMode}</p>
                      <p>
                        Ingested user messages:{" "}
                        {personaSnapshot.profile.counters.ingestedUserMessages.toLocaleString()}
                      </p>
                      <p>
                        Last ingested:{" "}
                        {personaSnapshot.profile.counters.lastIngestedAt
                          ? new Date(personaSnapshot.profile.counters.lastIngestedAt).toLocaleString()
                          : "n/a"}
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          Stable preferences
                        </p>
                        {personaSnapshot.profile.stablePreferences.length ? (
                          <div className="space-y-1 text-sm text-foreground">
                            {personaSnapshot.profile.stablePreferences.slice(0, 6).map((item) => (
                              <p key={item.id} className="truncate">
                                {item.text}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No records yet.</p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          Recent events
                        </p>
                        {personaSnapshot.profile.recentEvents.length ? (
                          <div className="space-y-1 text-sm text-foreground">
                            {personaSnapshot.profile.recentEvents.slice(0, 6).map((item) => (
                              <p key={item.id} className="truncate">
                                {item.text}
                              </p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No records yet.</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Source document (Markdown)
                      </p>
                      <textarea
                        className="min-h-[260px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono leading-5 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={personaDocumentDraft}
                        onChange={(event) => setPersonaDocumentDraft(event.target.value)}
                        placeholder="Soul document content"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          Path: <span className="font-mono">{personaSnapshot.markdownPath}</span>
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void refreshPersonaSnapshot();
                            }}
                            disabled={isPersonaLoading}
                          >
                            Reload
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              void savePersonaDocument();
                            }}
                            disabled={isPersonaDocumentSaving || !hasPersonaDocumentChanges}
                          >
                            {isPersonaDocumentSaving ? "Saving..." : "Save document"}
                          </Button>
                        </div>
                      </div>
                      {personaSnapshot.warning ? (
                        <p className="text-xs text-destructive">
                          Parse warning: {personaSnapshot.warning.message}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {isPersonaLoading ? "Loading soul profile..." : "No soul profile data available."}
                  </p>
                )}
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

        {section === "memory" ? (
          <Card className="border-border bg-card/80">
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Database className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">Memory</span>
              </div>
              <CardTitle className="text-2xl">记忆</CardTitle>
              <CardDescription>
                启用后 Chat 和 Agent 模式都会跨会话记住重要信息。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between rounded-[6px] border px-4 py-3 text-left transition-colors",
                  draft.memos.enabled
                    ? "border-border bg-accent/60"
                    : "border-border/70 bg-card hover:bg-secondary/65"
                )}
                onClick={() => updateMemosField("enabled", !draft.memos.enabled)}
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">启用记忆功能</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    开启后将自动检索相关记忆并在回复完成后写回记忆库。
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {draft.memos.enabled ? "On" : "Off"}
                </span>
              </button>

              <div className="rounded-[8px] border border-border/75 bg-muted/35 px-4 py-4">
                <p className="text-sm leading-7 text-muted-foreground">
                  记忆功能由 <span className="font-semibold text-foreground">MemOS Cloud</span>{" "}
                  提供，启用后可跨会话保存偏好、决策和项目上下文。
                </p>
                <p className="mt-3 text-sm font-semibold text-foreground">配置步骤：</p>
                <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>
                    1. 访问{" "}
                    <a
                      href="https://memos-dashboard.openmem.net/cn/quickstart/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground underline underline-offset-4"
                    >
                      MemOS Cloud 控制台
                    </a>{" "}
                    注册账号
                  </li>
                  <li>2. 在 API Keys 页面生成一个 API Key</li>
                  <li>3. 填入下方配置并点击测试连接</li>
                </ol>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="memosBaseUrl" className="text-sm text-muted-foreground">
                    Base URL
                  </label>
                  <Input
                    id="memosBaseUrl"
                    value={draft.memos.baseUrl}
                    onChange={(event) => updateMemosField("baseUrl", event.target.value)}
                    placeholder="https://memos.memtensor.cn/api/openmem/v1"
                    disabled={!draft.memos.enabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="memosUserId" className="text-sm text-muted-foreground">
                    User ID
                  </label>
                  <Input
                    id="memosUserId"
                    value={draft.memos.userId}
                    onChange={(event) => updateMemosField("userId", event.target.value)}
                    placeholder="echo-user-001"
                    disabled={!draft.memos.enabled}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="memosApiKey" className="text-sm text-muted-foreground">
                  API Key
                </label>
                <Input
                  id="memosApiKey"
                  type="password"
                  value={draft.memos.apiKey}
                  onChange={(event) => updateMemosField("apiKey", event.target.value)}
                  placeholder="sk-..."
                  disabled={!draft.memos.enabled}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="memosTopK" className="text-sm text-muted-foreground">
                    Top K (1 - 20)
                  </label>
                  <Input
                    id="memosTopK"
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    value={draft.memos.topK}
                    onChange={(event) =>
                      updateMemosField("topK", Number.parseInt(event.target.value, 10) || 1)
                    }
                    onBlur={() => updateMemosField("topK", Math.round(clamp(draft.memos.topK, 1, 20)))}
                    disabled={!draft.memos.enabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="memosSearchTimeoutMs" className="text-sm text-muted-foreground">
                    Search timeout (ms)
                  </label>
                  <Input
                    id="memosSearchTimeoutMs"
                    type="number"
                    min={1000}
                    max={15000}
                    step={100}
                    value={draft.memos.searchTimeoutMs}
                    onChange={(event) =>
                      updateMemosField("searchTimeoutMs", Number.parseInt(event.target.value, 10) || 1000)
                    }
                    onBlur={() =>
                      updateMemosField(
                        "searchTimeoutMs",
                        Math.round(clamp(draft.memos.searchTimeoutMs, 1000, 15000))
                      )
                    }
                    disabled={!draft.memos.enabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="memosAddTimeoutMs" className="text-sm text-muted-foreground">
                    Add timeout (ms)
                  </label>
                  <Input
                    id="memosAddTimeoutMs"
                    type="number"
                    min={1000}
                    max={15000}
                    step={100}
                    value={draft.memos.addTimeoutMs}
                    onChange={(event) =>
                      updateMemosField("addTimeoutMs", Number.parseInt(event.target.value, 10) || 1000)
                    }
                    onBlur={() =>
                      updateMemosField(
                        "addTimeoutMs",
                        Math.round(clamp(draft.memos.addTimeoutMs, 1000, 15000))
                      )
                    }
                    disabled={!draft.memos.enabled}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                {memosTestResult ? (
                  <p
                    className={cn(
                      "text-sm",
                      memosTestResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                    )}
                  >
                    {memosTestResult.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    点击测试连接来验证当前记忆配置是否可用。
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void testMemosConnection();
                  }}
                  disabled={isTestingMemos || !draft.memos.enabled}
                >
                  {isTestingMemos ? "Testing..." : "测试连接"}
                </Button>
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

        {section === "environment" ? (
          <Card className="border-border bg-card/80">
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Cpu className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">Environment</span>
              </div>
              <CardTitle className="text-2xl">Environment injection</CardTitle>
              <CardDescription>
                Configure runtime environment context injection for Chat and Agent.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 rounded-[6px] border border-border/75 bg-card px-4 py-3">
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-[6px] border px-3 py-2 text-left transition-colors",
                    draft.environment.enabled
                      ? "border-border bg-accent/50"
                      : "border-border/70 bg-background hover:bg-secondary/65"
                  )}
                  onClick={() => updateEnvironmentField("enabled", !draft.environment.enabled)}
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">Inject environment context</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Adds date, time, city weather, network, battery, and device hints to runtime context.
                    </p>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {draft.environment.enabled ? "On" : "Off"}
                  </span>
                </button>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="environmentCity" className="text-sm text-muted-foreground">
                      City (manual)
                    </label>
                    <Input
                      id="environmentCity"
                      value={draft.environment.city}
                      onChange={(event) => updateEnvironmentField("city", event.target.value)}
                      placeholder="e.g. San Francisco"
                      disabled={!draft.environment.enabled}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">Temperature unit</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["c", "f"] as const).map((unit) => (
                        <button
                          key={unit}
                          type="button"
                          className={cn(
                            "rounded-[6px] border px-3 py-2 text-sm font-medium transition-colors",
                            draft.environment.temperatureUnit === unit
                              ? "border-border bg-accent/60"
                              : "border-border/70 bg-background hover:bg-secondary/65"
                          )}
                          onClick={() => updateEnvironmentField("temperatureUnit", unit)}
                          disabled={!draft.environment.enabled}
                        >
                          {unit === "c" ? "Celsius (C)" : "Fahrenheit (F)"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="weatherCacheTtlMs" className="text-sm text-muted-foreground">
                      Weather cache TTL (60000 - 3600000 ms)
                    </label>
                    <Input
                      id="weatherCacheTtlMs"
                      type="number"
                      min={60000}
                      max={3600000}
                      step={1000}
                      value={draft.environment.weatherCacheTtlMs}
                      onChange={(event) =>
                        updateEnvironmentField(
                          "weatherCacheTtlMs",
                          Number.parseInt(event.target.value, 10) || 60000
                        )
                      }
                      onBlur={() =>
                        updateEnvironmentField(
                          "weatherCacheTtlMs",
                          Math.round(clamp(draft.environment.weatherCacheTtlMs, 60000, 3600000))
                        )
                      }
                      disabled={!draft.environment.enabled}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="environmentSendTimeoutMs" className="text-sm text-muted-foreground">
                      Send-time wait limit (100 - 2000 ms)
                    </label>
                    <Input
                      id="environmentSendTimeoutMs"
                      type="number"
                      min={100}
                      max={2000}
                      step={50}
                      value={draft.environment.sendTimeoutMs}
                      onChange={(event) =>
                        updateEnvironmentField(
                          "sendTimeoutMs",
                          Number.parseInt(event.target.value, 10) || 100
                        )
                      }
                      onBlur={() =>
                        updateEnvironmentField(
                          "sendTimeoutMs",
                          Math.round(clamp(draft.environment.sendTimeoutMs, 100, 2000))
                        )
                      }
                      disabled={!draft.environment.enabled}
                    />
                  </div>
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
