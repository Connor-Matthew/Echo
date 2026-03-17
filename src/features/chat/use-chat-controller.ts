import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type DragEventHandler,
  type SetStateAction
} from "react";
import { loadEnvironmentSnapshot } from "../../domain/environment/load-snapshot";
import {
  inferModelCapabilities,
  resolveProviderModelCapabilities,
  toModelCapabilityKey
} from "../../domain/model/capabilities";
import type { MuApi } from "../../lib/mu-api";
import { applySkillToMessages } from "../../lib/skills-utils";
import type { DraftAttachment } from "../app/draft-attachments";
import {
  normalizeSettings,
  type AppSettings,
  type ChatAttachment,
  type ChatMessage,
  type ChatMessageUsage,
  type ChatSession,
  type EnvironmentSnapshot,
  type Skill
} from "../../shared/contracts";
import {
  formatEnvironmentAwarenessBlock,
  formatEnvironmentUsageGuidanceBlock
} from "../../shared/environment-awareness";
import {
  applyUsageDeltaToSession as applyUsageDeltaToSessionMutation,
  applyUsageToAssistantMessage as applyUsageToAssistantMessageMutation,
  removeAssistantPlaceholderIfEmpty as removeAssistantPlaceholderIfEmptyMutation
} from "./utils/session-mutations";
import {
  createId,
  createSession,
  hasAttachmentPayload,
  nowIso,
  sessionToCompletionMessages,
  type StreamUsageSnapshot
} from "./utils/chat-utils";
import { useChatOrchestration } from "./use-chat-orchestration";
import { useSessionManager } from "./use-session-manager";
import {
  sendFromBaseMessagesService,
  type ChatActiveStream,
  type SendFromBaseMessagesOptions
} from "./services/send-from-base-messages";
import { withPersistedAutoDetectedCapabilities } from "../app/controller-helpers";

type ChatDraftController = {
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  draftAttachments: DraftAttachment[];
  clearDraftAttachments: () => void;
  addFiles: (files: FileList | File[] | null) => void;
  removeAttachment: (attachmentId: string) => void;
  toChatAttachments: (attachments: DraftAttachment[]) => ChatAttachment[];
  isChatDragOver: boolean;
  handleChatDragEnter: DragEventHandler<HTMLElement>;
  handleChatDragOver: DragEventHandler<HTMLElement>;
  handleChatDragLeave: DragEventHandler<HTMLElement>;
  handleChatDrop: DragEventHandler<HTMLElement>;
};

type UseChatControllerParams = {
  api: MuApi;
  isHydrated: boolean;
  activeView: "chat" | "agent" | "settings";
  settings: AppSettings;
  setSettings: Dispatch<SetStateAction<AppSettings>>;
  setErrorBanner: Dispatch<SetStateAction<string | null>>;
  showSoulStatus: (message: string) => void;
  draftController: ChatDraftController;
};

export const useChatController = ({
  api,
  isHydrated,
  activeView,
  settings,
  setSettings,
  setErrorBanner,
  showSoulStatus,
  draftController
}: UseChatControllerParams) => {
  const {
    draft,
    setDraft,
    draftAttachments,
    clearDraftAttachments,
    addFiles,
    removeAttachment,
    toChatAttachments,
    isChatDragOver,
    handleChatDragEnter,
    handleChatDragOver,
    handleChatDragLeave,
    handleChatDrop
  } = draftController;

  const [isGenerating, setIsGenerating] = useState(false);
  const activeStreamRef = useRef<ChatActiveStream | null>(null);
  const chatEnvironmentSnapshotRef = useRef<EnvironmentSnapshot | null>(null);

  const {
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId,
    removedSession,
    upsertSession,
    createNewChat,
    renameChat,
    toggleChatPin,
    deleteChat,
    undoDelete,
    exportSessions,
    exportSession,
    exportSessionMarkdown,
    importSessions,
    clearAllSessions
  } = useSessionManager({
    api,
    isHydrated,
    setErrorBanner,
    onResetDraft: () => {
      setDraft("");
      clearDraftAttachments();
    }
  });

  const {
    activeSession,
    activeEnabledMcpServers,
    orderedChatSessions,
    isConfigured,
    composerModelOptions,
    activeComposerModelValue,
    activeModelCapabilities,
    composerUsageLabel,
    selectComposerModel,
    updateChatContextWindow
  } = useChatOrchestration({
    sessions,
    activeSessionId,
    settings,
    setSettings,
    setErrorBanner,
    saveSettings: api.settings.save,
    withPersistedAutoDetectedCapabilities
  });

  const hydrateChatSessions = useCallback((savedSessions: ChatSession[]) => {
    const nextSessions = savedSessions.length ? savedSessions : [createSession()];
    const normalizedSessions = nextSessions.length ? nextSessions : [createSession()];
    setSessions(normalizedSessions);
    setActiveSessionId(normalizedSessions[0].id);
  }, [setSessions, setActiveSessionId]);

  const updateSessionMcpServers = (enabledIds: string[]) => {
    if (!activeSession) {
      return;
    }
    upsertSession(activeSession.id, (session) => ({ ...session, enabledMcpServers: enabledIds }));
  };

  const persistObservedModelCapability = useCallback(
    (
      providerId: string,
      modelIdRaw: string,
      field: keyof Pick<
        ReturnType<typeof inferModelCapabilities>,
        "imageInput" | "audioInput" | "videoInput" | "reasoningDisplay"
      >
    ) => {
      const modelId = modelIdRaw.trim();
      const key = toModelCapabilityKey(modelId);
      if (!modelId || !key) {
        return;
      }

      setSettings((previous) => {
        const provider =
          previous.providers.find((candidate) => candidate.id === providerId) ??
          previous.providers[0];
        if (!provider) {
          return previous;
        }
        const current = resolveProviderModelCapabilities(provider, modelId);
        if (current[field]) {
          return previous;
        }

        const nextProviders = previous.providers.map((candidate) => {
          if (candidate.id !== provider.id) {
            return candidate;
          }
          return {
            ...candidate,
            modelCapabilities: {
              ...(candidate.modelCapabilities ?? {}),
              [key]: {
                ...current,
                [field]: true
              }
            }
          };
        });
        const nextSettings = normalizeSettings({
          ...previous,
          providers: nextProviders
        });

        void api.settings.save(nextSettings).catch((error) => {
          setErrorBanner(
            error instanceof Error ? error.message : "Failed to persist auto-detected model capabilities."
          );
        });
        return nextSettings;
      });
    },
    [api.settings, setErrorBanner, setSettings]
  );

  const applyUsageDeltaToSession = (
    sessionId: string,
    modelUsageKey: string,
    delta: StreamUsageSnapshot
  ) => {
    upsertSession(sessionId, (session) =>
      applyUsageDeltaToSessionMutation(session, modelUsageKey, delta, nowIso)
    );
  };

  const applyUsageToAssistantMessage = (
    sessionId: string,
    assistantMessageId: string,
    usage: StreamUsageSnapshot,
    source: ChatMessageUsage["source"]
  ) => {
    upsertSession(sessionId, (session) =>
      applyUsageToAssistantMessageMutation(session, assistantMessageId, usage, source)
    );
  };

  const removeAssistantPlaceholderIfEmpty = (sessionId: string, messageId: string) => {
    upsertSession(sessionId, (session) =>
      removeAssistantPlaceholderIfEmptyMutation(session, messageId, nowIso)
    );
  };

  const finishActiveStream = useCallback(() => {
    const activeStream = activeStreamRef.current;
    if (!activeStream) {
      return;
    }
    if (activeStream.flushTimeoutId !== null) {
      window.clearTimeout(activeStream.flushTimeoutId);
      activeStream.flushTimeoutId = null;
    }
    activeStream.flushPending();
    activeStream.unsubscribe();
    activeStreamRef.current = null;
    setIsGenerating(false);
  }, []);

  const buildChatEnvironmentSystemMessage = useCallback(async (): Promise<string | null> => {
    if (!settings.environment.enabled) {
      console.info("[chat][environment][injected]\nenvironment_snapshot_json: null (disabled)");
      return null;
    }

    const snapshot = await loadEnvironmentSnapshot({
      city: settings.environment.city,
      cwd: "",
      temperatureUnit: settings.environment.temperatureUnit,
      weatherCacheTtlMs: settings.environment.weatherCacheTtlMs,
      weatherTimeoutMs: settings.environment.sendTimeoutMs,
      previousWeather: chatEnvironmentSnapshotRef.current?.weather,
      getWeatherSnapshot: api.env.getWeatherSnapshot,
      getSystemStatus: api.env.getSystemStatus
    });
    chatEnvironmentSnapshotRef.current = snapshot;
    const content = [
      `environment_snapshot_json:\n${JSON.stringify(snapshot, null, 2)}`,
      formatEnvironmentAwarenessBlock(snapshot),
      formatEnvironmentUsageGuidanceBlock()
    ].join("\n");
    console.info(`[chat][environment][injected]\n${content}`);
    return content;
  }, [
    api.env,
    settings.environment.city,
    settings.environment.enabled,
    settings.environment.sendTimeoutMs,
    settings.environment.temperatureUnit,
    settings.environment.weatherCacheTtlMs
  ]);

  const sendFromBaseMessages = async (
    session: ChatSession,
    baseMessages: ChatMessage[],
    userMessage: ChatMessage,
    allowRetitle: boolean,
    options?: SendFromBaseMessagesOptions
  ) =>
    sendFromBaseMessagesService({
      session,
      baseMessages,
      userMessage,
      allowRetitle,
      options,
      isConfigured,
      isGenerating,
      settings,
      api,
      activeStreamRef,
      setDraft,
      setIsGenerating,
      setErrorBanner,
      buildChatEnvironmentSystemMessage,
      upsertSession,
      applyUsageDeltaToSession,
      applyUsageToAssistantMessage,
      removeAssistantPlaceholderIfEmpty,
      finishActiveStream,
      persistObservedModelCapability
    });

  const stopGenerating = async () => {
    const activeStream = activeStreamRef.current;
    if (!activeStream) {
      return;
    }
    activeStream.stoppedByUser = true;
    try {
      await api.chat.stopStream(activeStream.streamId);
    } finally {
      finishActiveStream();
    }
  };

  const deleteMessage = (message: ChatMessage) => {
    if (!activeSession || isGenerating) {
      return;
    }

    upsertSession(activeSession.id, (session) => ({
      ...session,
      updatedAt: nowIso(),
      messages: session.messages.filter((item) => item.id !== message.id)
    }));
  };

  const editMessage = (
    message: ChatMessage,
    nextContent: string,
    nextAttachments: ChatAttachment[]
  ) => {
    if (message.role !== "user" || !activeSession || isGenerating || !isConfigured) {
      return;
    }

    const editIndex = activeSession.messages.findIndex((item) => item.id === message.id);
    if (editIndex < 0) {
      return;
    }

    const trimmedContent = nextContent.trim();
    const hasAnyAttachmentPayload = nextAttachments.some(hasAttachmentPayload);
    if (!trimmedContent && !hasAnyAttachmentPayload) {
      return;
    }

    const original = activeSession.messages[editIndex];
    const baseMessages = activeSession.messages.slice(0, editIndex);
    const editedMessage: ChatMessage = {
      ...original,
      content: trimmedContent,
      attachments: nextAttachments.length ? nextAttachments : undefined
    };
    void sendFromBaseMessages(activeSession, baseMessages, editedMessage, false);
  };

  const resendMessage = (message: ChatMessage) => {
    if (message.role !== "user" || !activeSession || isGenerating || !isConfigured) {
      return;
    }

    const resendIndex = activeSession.messages.findIndex((item) => item.id === message.id);
    if (resendIndex < 0) {
      return;
    }

    const baseMessages = activeSession.messages.slice(0, resendIndex);
    const userMessage = activeSession.messages[resendIndex];
    void sendFromBaseMessages(activeSession, baseMessages, userMessage, false);
  };

  const handleApplySkill = (skill: Skill, params: Record<string, string>, input: string) => {
    if (!activeSession || !isConfigured || isGenerating) {
      return;
    }
    void sendMessage(input, skill, params);
  };

  const sendMessage = async (
    content: string,
    skill?: Skill,
    skillParams?: Record<string, string>
  ) => {
    if (!activeSession || !isConfigured || isGenerating) {
      return;
    }

    const prompt = content.trim();
    const messageAttachments = toChatAttachments(draftAttachments);
    const hasAnyAttachmentPayload = messageAttachments.some(hasAttachmentPayload);
    let completionMessagesOverride;

    if (skill && skillParams) {
      const completionMsgs = sessionToCompletionMessages(activeSession.messages);
      const withUser = [
        ...completionMsgs,
        {
          role: "user" as const,
          content: prompt || " ",
          attachments: messageAttachments.length ? messageAttachments : undefined
        }
      ];
      completionMessagesOverride = applySkillToMessages(withUser, skill, skillParams, prompt || " ");
    }

    if (!prompt && !hasAnyAttachmentPayload && !completionMessagesOverride) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: prompt,
      createdAt: nowIso(),
      attachments: messageAttachments.length ? messageAttachments : undefined
    };

    const assistantAppliedSkill = skill
      ? { icon: skill.icon, name: skill.name, command: skill.command }
      : undefined;

    await sendFromBaseMessages(activeSession, activeSession.messages, userMessage, true, {
      completionMessagesOverride,
      assistantAppliedSkill
    });
    clearDraftAttachments();
  };

  const updateSessionSoulMode = useCallback(
    (sessionId: string, enabled: boolean) => {
      upsertSession(sessionId, (session) => ({
        ...session,
        soulModeEnabled: enabled,
        updatedAt: nowIso()
      }));
      showSoulStatus(enabled ? "已经切换为 SOUL 模式" : "已经切换为系统提示词模式");
    },
    [showSoulStatus, upsertSession]
  );

  const hasChatMessages = (activeSession?.messages.length ?? 0) > 0;
  const showCenteredChatLanding = activeView === "chat" && isConfigured && !hasChatMessages;
  const activeChatMessageCount = activeSession?.messages.length ?? 0;

  return {
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    orderedChatSessions,
    activeEnabledMcpServers,
    isConfigured,
    composerModelOptions,
    activeComposerModelValue,
    activeModelCapabilities,
    composerUsageLabel,
    selectComposerModel,
    updateChatContextWindow,
    updateSessionMcpServers,
    isGenerating,
    draft,
    setDraft,
    draftAttachments,
    addFiles,
    removeAttachment,
    sendMessage,
    resendMessage,
    editMessage,
    deleteMessage,
    handleApplySkill,
    stopGenerating,
    removedSession,
    undoDelete,
    createNewChat,
    renameChat,
    deleteChat,
    toggleChatPin,
    updateSessionSoulMode,
    exportSession,
    exportSessionMarkdown,
    exportSessions,
    importSessions,
    clearAllSessions,
    isChatDragOver,
    handleChatDragEnter,
    handleChatDragOver,
    handleChatDragLeave,
    handleChatDrop,
    showCenteredChatLanding,
    activeChatMessageCount,
    hydrateChatSessions,
    finishActiveStream
  };
};
