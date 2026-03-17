import { useEffect, useMemo, useState } from "react";
import {
  inferModelCapabilities,
  resolveProviderModelCapabilities
} from "../../domain/model/capabilities";
import { getMuApi } from "../../lib/mu-api";
import type { Skill } from "../../shared/contracts";
import type { AgentMessage, AgentSessionMeta } from "../../shared/agent-contracts";
import { createAppController } from "./app-controller";
import { useAppShellController } from "./use-app-shell-controller";
import { useSettingsController } from "./use-settings-controller";
import { useDraftManager } from "./use-draft-manager";
import { useChatController } from "../chat/use-chat-controller";
import { useAgentController } from "../agent/use-agent-controller";
import { useAutomationController } from "./use-automation-controller";
import { createId, createSession, nowIso } from "../chat/utils/chat-utils";

const api = getMuApi();

export const useAppController = () => {
  const [isHydrated, setIsHydrated] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [agentErrorBanner, setAgentErrorBanner] = useState<string | null>(null);
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);

  const settingsController = useSettingsController({
    api,
    isHydrated,
    setErrorBanner
  });

  const shell = useAppShellController({
    settings: settingsController.settings,
    isHydrated,
    errorBanner,
    setErrorBanner
  });

  const activeProvider = useMemo(
    () =>
      settingsController.settings.providers.find(
        (candidate) => candidate.id === settingsController.settings.activeProviderId
      ) ?? settingsController.settings.providers[0],
    [settingsController.settings.activeProviderId, settingsController.settings.providers]
  );

  const draftManager = useDraftManager({
    activeView: shell.activeView,
    modelId: settingsController.settings.model,
    modelCapabilities: activeProvider
      ? resolveProviderModelCapabilities(activeProvider, settingsController.settings.model)
      : inferModelCapabilities(
          settingsController.settings.providerType,
          settingsController.settings.model
        ),
    setErrorBanner,
    setAgentErrorBanner
  });

  const chat = useChatController({
    api,
    isHydrated,
    activeView: shell.activeView,
    settings: settingsController.settings,
    setSettings: settingsController.setSettings,
    setErrorBanner,
    showSoulStatus: shell.showSoulStatus,
    draftController: {
      draft: draftManager.draft,
      setDraft: draftManager.setDraft,
      draftAttachments: draftManager.draftAttachments,
      clearDraftAttachments: draftManager.clearDraftAttachments,
      addFiles: draftManager.addFiles,
      removeAttachment: draftManager.removeAttachment,
      toChatAttachments: draftManager.toChatAttachments,
      isChatDragOver: draftManager.isChatDragOver,
      handleChatDragEnter: draftManager.handleChatDragEnter,
      handleChatDragOver: draftManager.handleChatDragOver,
      handleChatDragLeave: draftManager.handleChatDragLeave,
      handleChatDrop: draftManager.handleChatDrop
    }
  });

  const agent = useAgentController({
    api,
    isHydrated,
    activeView: shell.activeView,
    settings: settingsController.settings,
    agentErrorBanner,
    setAgentErrorBanner,
    selectComposerModel: chat.selectComposerModel,
    draftController: {
      agentDraft: draftManager.agentDraft,
      setAgentDraft: draftManager.setAgentDraft,
      agentDraftAttachments: draftManager.agentDraftAttachments,
      clearAgentDraftAttachments: draftManager.clearAgentDraftAttachments,
      addAgentFiles: draftManager.addAgentFiles,
      removeAgentAttachment: draftManager.removeAgentAttachment,
      toChatAttachments: draftManager.toChatAttachments
    }
  });

  const automation = useAutomationController({
    api,
    sessions: chat.sessions,
    settings: settingsController.settings,
    isHydrated,
    isConfigured: chat.isConfigured,
    isGenerating: chat.isGenerating,
    setErrorBanner,
    showSoulStatus: shell.showSoulStatus
  });

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const [savedSettings, savedSessions, savedAgentSessions, savedSkills] = await Promise.all([
          api.settings.get(),
          api.sessions.get(),
          api.agent.listSessions(),
          api.skills.get()
        ]);
        if (cancelled) {
          return;
        }

        const initialAgentSession =
          savedAgentSessions[0] ?? (await api.agent.createSession("New Agent Session"));
        const initialAgentMessages = await api.agent.getMessages(initialAgentSession.id);
        if (cancelled) {
          return;
        }

        settingsController.hydrateSettings(savedSettings, savedSkills);
        chat.hydrateChatSessions(savedSessions);
        agent.hydrateAgentState(
          savedAgentSessions.length ? savedAgentSessions : [initialAgentSession],
          initialAgentSession.id,
          { [initialAgentSession.id]: initialAgentMessages }
        );
        setErrorBanner(null);
        setAgentErrorBanner(null);
      } catch (error) {
        if (!cancelled) {
          setErrorBanner(
            error instanceof Error ? error.message : "Failed to initialize application."
          );
          const fallback = createSession();
          const fallbackAgentSession: AgentSessionMeta = {
            id: createId(),
            title: "New Agent Session",
            createdAt: nowIso(),
            updatedAt: nowIso()
          };
          settingsController.hydrateSettings(settingsController.settings, []);
          chat.hydrateChatSessions([fallback]);
          agent.hydrateAgentState([fallbackAgentSession], fallbackAgentSession.id, {
            [fallbackAgentSession.id]: [] as AgentMessage[]
          });
        }
      } finally {
        if (!cancelled) {
          setIsHydrated(true);
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  return createAppController({
    shell,
    chat: {
      ...chat,
      activeSkill,
      setActiveSkill
    },
    agent,
    settings: settingsController,
    automation
  });
};
