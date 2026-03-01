import { useMemo } from "react";
import { encodeComposerModelOption } from "../../lib/app-chat-utils";
import {
  buildAgentRunSettingsSnapshot,
  type AgentMessage,
  type AgentSessionMeta
} from "../../shared/agent-contracts";
import type { AppSettings } from "../../shared/contracts";

type UseAgentOrchestrationParams = {
  agentSessions: AgentSessionMeta[];
  activeAgentSessionId: string;
  agentMessagesBySession: Record<string, AgentMessage[]>;
  settings: AppSettings;
};

type AgentModelOption = { value: string; label: string };

export const useAgentOrchestration = ({
  agentSessions,
  activeAgentSessionId,
  agentMessagesBySession,
  settings
}: UseAgentOrchestrationParams) => {
  const activeAgentSession = useMemo(
    () => agentSessions.find((session) => session.id === activeAgentSessionId),
    [agentSessions, activeAgentSessionId]
  );

  const activeAgentMessages = useMemo(
    () => agentMessagesBySession[activeAgentSessionId] ?? [],
    [agentMessagesBySession, activeAgentSessionId]
  );

  const activeProvider = useMemo(
    () =>
      settings.providers.find((provider) => provider.id === settings.activeProviderId) ??
      settings.providers[0],
    [settings.activeProviderId, settings.providers]
  );

  const agentModelOptions = useMemo<AgentModelOption[]>(() => {
    const seen = new Set<string>();
    return settings.providers.flatMap((provider) => {
      if (provider.enabled === false) {
        return [];
      }
      if (provider.providerType !== "claude-agent" && provider.providerType !== "anthropic") {
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

          return {
            value,
            label: `${provider.name} | ${modelId}`
          };
        })
        .filter((option): option is AgentModelOption => Boolean(option));
    });
  }, [settings.providers]);

  const activeAgentModelValue = useMemo(() => {
    const modelId = settings.model.trim();
    if (!activeProvider?.id || !modelId) {
      return "";
    }
    if (activeProvider.providerType !== "claude-agent" && activeProvider.providerType !== "anthropic") {
      return "";
    }
    return encodeComposerModelOption(activeProvider.id, modelId);
  }, [activeProvider?.id, activeProvider?.providerType, settings.model]);

  const agentSettingsSnapshot = useMemo(() => buildAgentRunSettingsSnapshot(settings), [settings]);
  const isAgentConfigured = useMemo(
    () => Boolean(agentSettingsSnapshot?.apiKey.trim() && agentSettingsSnapshot.model.trim()),
    [agentSettingsSnapshot]
  );

  return {
    activeAgentSession,
    activeAgentMessages,
    agentModelOptions,
    activeAgentModelValue,
    agentSettingsSnapshot,
    isAgentConfigured
  };
};
