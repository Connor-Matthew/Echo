import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import {
  decodeComposerModelOption,
  encodeComposerModelOption,
  formatTokenCount,
  toProviderInputTokens
} from "../../lib/app-chat-utils";
import { resolveProviderModelContextWindow } from "../../lib/model-context-window";
import { resolveProviderModelCapabilities } from "../../lib/model-capabilities";
import {
  normalizeSettings,
  type AppSettings,
  type ChatSession,
  type StoredProvider
} from "../../shared/contracts";

type UseChatOrchestrationParams = {
  sessions: ChatSession[];
  activeSessionId: string;
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  setErrorBanner: Dispatch<SetStateAction<string | null>>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  withPersistedAutoDetectedCapabilities: (settings: AppSettings) => AppSettings;
};

type ComposerModelOption = { value: string; label: string };

export const useChatOrchestration = ({
  sessions,
  activeSessionId,
  settings,
  setSettings,
  setErrorBanner,
  saveSettings,
  withPersistedAutoDetectedCapabilities
}: UseChatOrchestrationParams) => {
  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [sessions, activeSessionId]
  );

  const activeEnabledMcpServers = useMemo(
    () => activeSession?.enabledMcpServers ?? [],
    [activeSession]
  );

  const orderedChatSessions = useMemo(() => {
    const indexed = sessions.map((session, index) => ({ session, index }));
    indexed.sort((left, right) => {
      const pinDelta = Number(Boolean(right.session.isPinned)) - Number(Boolean(left.session.isPinned));
      if (pinDelta !== 0) {
        return pinDelta;
      }
      return left.index - right.index;
    });
    return indexed.map((entry) => entry.session);
  }, [sessions]);

  const activeProvider = useMemo<StoredProvider | undefined>(
    () =>
      settings.providers.find((provider) => provider.id === settings.activeProviderId) ??
      settings.providers[0],
    [settings.activeProviderId, settings.providers]
  );

  const isConfigured = useMemo(() => {
    if (!activeProvider || activeProvider.enabled === false) {
      return false;
    }

    const model = settings.model.trim();
    if (!model) {
      return false;
    }

    if (activeProvider.providerType === "acp") {
      return true;
    }
    if (activeProvider.providerType === "claude-agent") {
      return false;
    }

    return Boolean(settings.baseUrl.trim() && settings.apiKey.trim());
  }, [activeProvider, settings.apiKey, settings.baseUrl, settings.model]);

  const composerModelOptions = useMemo<ComposerModelOption[]>(() => {
    const seen = new Set<string>();
    return settings.providers.flatMap((provider) => {
      if (provider.enabled === false || provider.providerType === "claude-agent") {
        return [];
      }
      const selectedModels = Array.from(
        new Set(
          [provider.model, ...(Array.isArray(provider.savedModels) ? provider.savedModels : [])]
            .map((entry) => entry.trim())
            .filter(Boolean)
        )
      );

      return selectedModels
        .map((modelId) => {
          const value = encodeComposerModelOption(provider.id, modelId);
          if (seen.has(value)) {
            return null;
          }
          seen.add(value);
          return { value, label: `${provider.name} | ${modelId}` };
        })
        .filter((option): option is ComposerModelOption => Boolean(option));
    });
  }, [settings.providers]);

  const activeComposerModelValue = useMemo(() => {
    const modelId = settings.model.trim();
    if (!activeProvider?.id || !modelId || activeProvider.providerType === "claude-agent") {
      return "";
    }
    return encodeComposerModelOption(activeProvider.id, modelId);
  }, [activeProvider?.id, activeProvider?.providerType, settings.model]);

  const activeModelCapabilities = useMemo(
    () => resolveProviderModelCapabilities(activeProvider!, settings.model),
    [activeProvider, settings.model]
  );

  const activeModelContextWindow = useMemo(
    () => resolveProviderModelContextWindow(activeProvider!, settings.model),
    [activeProvider, settings.model]
  );

  const latestAssistantProviderInputTokens = useMemo<number | null>(() => {
    if (!activeSession) {
      return null;
    }
    for (let index = activeSession.messages.length - 1; index >= 0; index -= 1) {
      const candidate = activeSession.messages[index];
      if (candidate.role !== "assistant") {
        continue;
      }
      const inputTokens = toProviderInputTokens(candidate.usage);
      if (inputTokens > 0) {
        return inputTokens;
      }
    }
    return null;
  }, [activeSession]);

  const composerUsageLabel = useMemo(() => {
    const inputTokenLabel =
      latestAssistantProviderInputTokens && latestAssistantProviderInputTokens > 0
        ? formatTokenCount(latestAssistantProviderInputTokens)
        : "--";
    return `${inputTokenLabel} / ${formatTokenCount(activeModelContextWindow)}`;
  }, [activeModelContextWindow, latestAssistantProviderInputTokens]);

  const selectComposerModel = useCallback(
    (modelOptionValue: string) => {
      const parsed = decodeComposerModelOption(modelOptionValue);
      if (!parsed) {
        return;
      }
      const { providerId, modelId } = parsed;
      const nextModel = modelId.trim();
      if (!nextModel) {
        return;
      }

      setSettings((previous) => {
        let nextSettings = normalizeSettings({
          ...previous,
          activeProviderId: providerId,
          providers: previous.providers.map((provider) =>
            provider.id === providerId
              ? {
                  ...provider,
                  model: nextModel,
                  savedModels: Array.from(
                    new Set([...(provider.savedModels ?? []), nextModel].map((entry) => entry.trim()))
                  ).filter(Boolean)
                }
              : provider
          ),
          model: nextModel
        });
        nextSettings = withPersistedAutoDetectedCapabilities(nextSettings);

        void saveSettings(nextSettings).catch((error) => {
          setErrorBanner(error instanceof Error ? error.message : "Failed to save model selection.");
        });

        return nextSettings;
      });
    },
    [saveSettings, setErrorBanner, setSettings, withPersistedAutoDetectedCapabilities]
  );

  const updateChatContextWindow = useCallback(
    (nextWindow: AppSettings["chatContextWindow"]) => {
      setSettings((previous) => {
        if (previous.chatContextWindow === nextWindow) {
          return previous;
        }

        const nextSettings = normalizeSettings({
          ...previous,
          chatContextWindow: nextWindow
        });

        void saveSettings(nextSettings).catch((error) => {
          setErrorBanner(error instanceof Error ? error.message : "Failed to save chat context window.");
        });

        return nextSettings;
      });
    },
    [saveSettings, setErrorBanner, setSettings]
  );

  return {
    activeSession,
    activeEnabledMcpServers,
    orderedChatSessions,
    activeProvider,
    isConfigured,
    composerModelOptions,
    activeComposerModelValue,
    activeModelCapabilities,
    activeModelContextWindow,
    composerUsageLabel,
    selectComposerModel,
    updateChatContextWindow
  };
};
