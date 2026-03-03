import { useCallback, useEffect, useMemo, useRef, useState, type DragEventHandler } from "react";
import type { SettingsSection } from "../../components/Sidebar";
import {
  runAgentMessageService,
  type AgentActiveRun
} from "../agent/services/run-agent-message";
import { loadEnvironmentSnapshot } from "../../domain/environment/load-snapshot";
import { useAgentOrchestration } from "../agent/use-agent-orchestration";
import { useChatOrchestration } from "../chat/use-chat-orchestration";
import {
  buildAgentPermissionResolutionMessage,
  enqueueAgentPermissionFromEnvelope,
  markAgentPermissionResolving,
  mergeRuntimeAgentMessageDecorations,
  normalizeIncomingDraftFiles,
  removeAttachmentById,
  removeAgentPermissionQueueItems,
  summarizeBlockedAttachmentMessages,
  type PendingAgentPermission,
  withPersistedAutoDetectedCapabilities
} from "./controller-helpers";
import {
  sendFromBaseMessagesService,
  type ChatActiveStream,
  type SendFromBaseMessagesOptions
} from "../chat/services/send-from-base-messages";
import { buildDraftAttachments, type DraftAttachment } from "../../lib/app-draft-attachments";
import {
  exportSessionAsJson,
  exportSessionAsMarkdown,
  exportSessionsAsJson
} from "../../lib/app-session-transfer";
import {
  applyUsageDeltaToSession as applyUsageDeltaToSessionMutation,
  applyUsageToAssistantMessage as applyUsageToAssistantMessageMutation,
  removeAssistantPlaceholderIfEmpty as removeAssistantPlaceholderIfEmptyMutation,
  upsertSessionById
} from "../../lib/app-session-mutations";
import { getMuApi } from "../../lib/mu-api";
import {
  inferModelCapabilities,
  resolveProviderModelCapabilities,
  toModelCapabilityKey
} from "../../lib/model-capabilities";
import {
  SIDEBAR_AUTO_HIDE_WIDTH,
  createId,
  createSession,
  ensureSessions,
  getCurrentViewportWidth,
  getResponsiveSidebarWidth,
  hasAttachmentPayload,
  nowIso,
  revokeAttachmentPreview,
  sessionToCompletionMessages,
  type StreamUsageSnapshot
} from "../../lib/app-chat-utils";
import {
  type AgentMessage,
  type AgentSessionMeta,
  type AgentStreamEnvelope
} from "../../shared/agent-contracts";
import {
  formatEnvironmentAwarenessBlock,
  formatEnvironmentUsageGuidanceBlock
} from "../../shared/environment-awareness";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
  type ChatAttachment,
  type ChatMessageUsage,
  type ChatMessage,
  type ChatSession,
  type ChatStreamRequest,
  type ConnectionTestResult,
  type EnvironmentSnapshot,
  type McpServerListResult,
  type McpServerStatusListResult,
  type Skill
} from "../../shared/contracts";
import { applySkillToMessages, normalizeSkills } from "../../lib/skills-utils";

type RemovedSession = {
  session: ChatSession;
  index: number;
  timeoutId: number;
};

type AppView = "chat" | "agent" | "settings";

const api = getMuApi();
const TOP_FRAME_HEIGHT_PX = 12;

export const useAppController = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [userSkills, setUserSkills] = useState<Skill[]>([]);
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
  const [activeView, setActiveView] = useState<AppView>("chat");
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSection>("provider");
  const [isGenerating, setIsGenerating] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
  const [agentDraftAttachments, setAgentDraftAttachments] = useState<DraftAttachment[]>([]);
  const [agentSessions, setAgentSessions] = useState<AgentSessionMeta[]>([]);
  const [activeAgentSessionId, setActiveAgentSessionId] = useState("");
  const [agentMessagesBySession, setAgentMessagesBySession] = useState<Record<string, AgentMessage[]>>(
    {}
  );
  const [agentDraft, setAgentDraft] = useState("");
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentErrorBanner, setAgentErrorBanner] = useState<string | null>(null);
  const [agentPermissionQueue, setAgentPermissionQueue] = useState<PendingAgentPermission[]>([]);
  const [agentEnvironmentSnapshot, setAgentEnvironmentSnapshot] =
    useState<EnvironmentSnapshot | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [removedSession, setRemovedSession] = useState<RemovedSession | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(getCurrentViewportWidth);
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => getCurrentViewportWidth() >= SIDEBAR_AUTO_HIDE_WIDTH
  );

  const activeStreamRef = useRef<ChatActiveStream | null>(null);
  const removedTimeoutRef = useRef<number | null>(null);
  const draftAttachmentsRef = useRef<DraftAttachment[]>([]);
  const agentDraftAttachmentsRef = useRef<DraftAttachment[]>([]);
  const activeAgentRunRef = useRef<AgentActiveRun | null>(null);
  const agentEnvironmentSnapshotRef = useRef<EnvironmentSnapshot | null>(null);
  const chatEnvironmentSnapshotRef = useRef<EnvironmentSnapshot | null>(null);
  const wasCompactLayoutRef = useRef(getCurrentViewportWidth() < SIDEBAR_AUTO_HIDE_WIDTH);
  const chatDropDepthRef = useRef(0);
  const isChatDragOverRef = useRef(false);
  const [isChatDragOver, setIsChatDragOver] = useState(false);

  const isCompactLayout = viewportWidth < SIDEBAR_AUTO_HIDE_WIDTH;

  useEffect(() => {
    if (activeView !== "chat") {
      chatDropDepthRef.current = 0;
      isChatDragOverRef.current = false;
      setIsChatDragOver(false);
    }
  }, [activeView]);

  const updateChatDragOver = (next: boolean) => {
    if (isChatDragOverRef.current === next) {
      return;
    }
    isChatDragOverRef.current = next;
    setIsChatDragOver(next);
  };

  useEffect(() => {
    const resetDragState = () => {
      chatDropDepthRef.current = 0;
      updateChatDragOver(false);
    };
    window.addEventListener("dragend", resetDragState);
    window.addEventListener("drop", resetDragState);
    return () => {
      window.removeEventListener("dragend", resetDragState);
      window.removeEventListener("drop", resetDragState);
    };
  }, []);

  const upsertSession = (
    sessionId: string,
    mutate: (session: ChatSession) => ChatSession
  ) => {
    setSessions((previous) => upsertSessionById(previous, sessionId, mutate));
  };

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

  const {
    activeAgentSession,
    activeAgentMessages,
    agentModelOptions,
    activeAgentModelValue,
    agentSettingsSnapshot,
    isAgentConfigured
  } = useAgentOrchestration({
    agentSessions,
    activeAgentSessionId,
    agentMessagesBySession,
    settings
  });

  const activeAgentPermissionRequest = useMemo(() => {
    if (!agentPermissionQueue.length) {
      return null;
    }
    return (
      agentPermissionQueue.find((item) => item.sessionId === activeAgentSessionId) ??
      agentPermissionQueue[0]
    );
  }, [agentPermissionQueue, activeAgentSessionId]);

  const updateSessionMcpServers = (enabledIds: string[]) => {
    if (!activeSession) return;
    upsertSession(activeSession.id, (session) => ({ ...session, enabledMcpServers: enabledIds }));
  };

  const selectAgentModel = (modelOptionValue: string) => {
    selectComposerModel(modelOptionValue);
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
    []
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

  const clearDraftAttachments = () => {
    setDraftAttachments((previous) => {
      previous.forEach(revokeAttachmentPreview);
      return [];
    });
  };
  const clearAgentDraftAttachments = () => {
    setAgentDraftAttachments((previous) => {
      previous.forEach(revokeAttachmentPreview);
      return [];
    });
  };

  const toChatAttachments = (attachments: DraftAttachment[]): ChatAttachment[] =>
    attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      kind: attachment.kind,
      textContent: attachment.kind === "text" ? attachment.textContent : undefined,
      imageDataUrl: attachment.kind === "image" ? attachment.imageDataUrl : undefined
    }));

  const finishActiveStream = () => {
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
  };

  const upsertAgentMessages = (
    sessionId: string,
    mutate: (messages: AgentMessage[]) => AgentMessage[]
  ) => {
    setAgentMessagesBySession((previous) => ({
      ...previous,
      [sessionId]: mutate(previous[sessionId] ?? [])
    }));
  };

  const removeAgentPermissionRequests = (payload: {
    runId?: string;
    sessionId?: string;
    requestId?: string;
  }) => {
    setAgentPermissionQueue((previous) => removeAgentPermissionQueueItems(previous, payload));
  };

  const enqueueAgentPermissionRequest = (payload: AgentStreamEnvelope) => {
    setAgentPermissionQueue((previous) => enqueueAgentPermissionFromEnvelope(previous, payload));
  };

  const resolveAgentPermissionRequest = async (
    request: Pick<PendingAgentPermission, "runId" | "sessionId" | "requestId">,
    decision: "approved" | "denied",
    applySuggestions: boolean
  ) => {
    setAgentPermissionQueue((previous) => markAgentPermissionResolving(previous, request, true));

    try {
      const result = await api.agent.resolvePermission({
        runId: request.runId,
        requestId: request.requestId,
        decision,
        applySuggestions,
        message: buildAgentPermissionResolutionMessage(decision, applySuggestions)
      });

      if (!result.ok) {
        removeAgentPermissionRequests({ runId: request.runId, requestId: request.requestId });
        appendAgentSystemEvent(request.sessionId, "Permission request expired before it was resolved.");
        return;
      }
    } catch {
      setAgentPermissionQueue((previous) => markAgentPermissionResolving(previous, request, false));
      appendAgentSystemEvent(request.sessionId, "Failed to resolve permission request.");
    }
  };

  const finishAgentRun = () => {
    const activeRun = activeAgentRunRef.current;
    if (!activeRun) {
      return;
    }
    if (activeRun.pollTimerId !== null) {
      window.clearInterval(activeRun.pollTimerId);
    }
    activeRun.unsubscribe();
    removeAgentPermissionRequests({ runId: activeRun.runId });
    activeAgentRunRef.current = null;
    setIsAgentRunning(false);
  };

  const fetchAndSetAgentMessages = async (sessionId: string) => {
    const messages = await api.agent.getMessages(sessionId);
    let mergedMessages = messages;
    setAgentMessagesBySession((previous) => {
      mergedMessages = mergeRuntimeAgentMessageDecorations(messages, previous[sessionId] ?? []);
      return {
        ...previous,
        [sessionId]: mergedMessages
      };
    });
    return mergedMessages;
  };

  const loadAgentMessages = async (sessionId: string): Promise<void> => {
    await fetchAndSetAgentMessages(sessionId);
  };

  const refreshAgentEnvironmentSnapshot = useCallback(async (): Promise<EnvironmentSnapshot | null> => {
    if (!settings.environment.enabled) {
      setAgentEnvironmentSnapshot(null);
      return null;
    }

    try {
      const snapshot = await loadEnvironmentSnapshot({
        city: settings.environment.city,
        cwd: activeAgentSession?.lastCwd ?? "",
        temperatureUnit: settings.environment.temperatureUnit,
        weatherCacheTtlMs: settings.environment.weatherCacheTtlMs,
        weatherTimeoutMs: settings.environment.sendTimeoutMs,
        previousWeather: agentEnvironmentSnapshotRef.current?.weather,
        getWeatherSnapshot: api.env.getWeatherSnapshot,
        getSystemStatus: api.env.getSystemStatus
      });
      setAgentEnvironmentSnapshot(snapshot);
      return snapshot;
    } catch {
      const fallback = agentEnvironmentSnapshotRef.current;
      if (fallback) {
        return fallback;
      }
      return null;
    }
  }, [
    activeAgentSession?.lastCwd,
    settings.environment.city,
    settings.environment.enabled,
    settings.environment.sendTimeoutMs,
    settings.environment.temperatureUnit,
    settings.environment.weatherCacheTtlMs
  ]);

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
    settings.environment.city,
    settings.environment.enabled,
    settings.environment.sendTimeoutMs,
    settings.environment.temperatureUnit,
    settings.environment.weatherCacheTtlMs
  ]);

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
        const nextSessions = ensureSessions(savedSessions);
        const initialAgentMessages = await api.agent.getMessages(initialAgentSession.id);
        setSettings(savedSettings);
        setSessions(nextSessions);
        setActiveSessionId(nextSessions[0].id);
        setUserSkills(normalizeSkills(savedSkills));
        setAgentSessions(savedAgentSessions.length ? savedAgentSessions : [initialAgentSession]);
        setActiveAgentSessionId(initialAgentSession.id);
        setAgentMessagesBySession({ [initialAgentSession.id]: initialAgentMessages });
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
          setSessions([fallback]);
          setActiveSessionId(fallback.id);
          setAgentSessions([fallbackAgentSession]);
          setActiveAgentSessionId(fallbackAgentSession.id);
          setAgentMessagesBySession({ [fallbackAgentSession.id]: [] });
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

  useEffect(() => {
    draftAttachmentsRef.current = draftAttachments;
  }, [draftAttachments]);

  useEffect(() => {
    agentDraftAttachmentsRef.current = agentDraftAttachments;
  }, [agentDraftAttachments]);

  useEffect(() => {
    agentEnvironmentSnapshotRef.current = agentEnvironmentSnapshot;
  }, [agentEnvironmentSnapshot]);

  useEffect(() => {
    if (!isHydrated || activeView !== "agent") {
      return;
    }
    if (!settings.environment.enabled) {
      setAgentEnvironmentSnapshot(null);
      return;
    }
    void refreshAgentEnvironmentSnapshot().catch(() => {});
  }, [
    activeAgentSessionId,
    activeView,
    isHydrated,
    refreshAgentEnvironmentSnapshot,
    settings.environment.city,
    settings.environment.enabled,
    settings.environment.temperatureUnit
  ]);

  useEffect(() => {
    if (!isHydrated || !activeAgentSessionId || agentMessagesBySession[activeAgentSessionId]) {
      return;
    }
    void loadAgentMessages(activeAgentSessionId).catch((error) => {
      setAgentErrorBanner(
        error instanceof Error ? error.message : "Failed to load agent session messages."
      );
    });
  }, [activeAgentSessionId, agentMessagesBySession, isHydrated]);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const wasCompact = wasCompactLayoutRef.current;
    if (!wasCompact && isCompactLayout) {
      setIsSidebarOpen(false);
    }
    if (wasCompact && !isCompactLayout) {
      setIsSidebarOpen(true);
    }
    wasCompactLayoutRef.current = isCompactLayout;
  }, [isCompactLayout]);

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolvedTheme =
        settings.theme === "system" ? (mediaQuery.matches ? "dark" : "light") : settings.theme;
      root.classList.toggle("dark", resolvedTheme === "dark");
      root.style.colorScheme = resolvedTheme;
    };

    applyTheme();

    if (settings.theme !== "system") {
      return;
    }

    const handleChange = () => {
      applyTheme();
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [settings.theme]);

  useEffect(() => {
    return () => {
      finishActiveStream();
      const activeRun = activeAgentRunRef.current;
      if (activeRun) {
        void api.agent.stop({ runId: activeRun.runId });
      }
      finishAgentRun();
      if (removedTimeoutRef.current !== null) {
        window.clearTimeout(removedTimeoutRef.current);
      }
      draftAttachmentsRef.current.forEach(revokeAttachmentPreview);
      agentDraftAttachmentsRef.current.forEach(revokeAttachmentPreview);
    };
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void api.sessions.save(sessions).catch((error) => {
        setErrorBanner(error instanceof Error ? error.message : "Failed to persist sessions.");
      });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [sessions, isHydrated]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const nextSettings = withPersistedAutoDetectedCapabilities(settings);
    if (nextSettings === settings) {
      return;
    }

    setSettings(nextSettings);
    void api.settings.save(nextSettings).catch((error) => {
      setErrorBanner(
        error instanceof Error ? error.message : "Failed to persist auto-detected model capabilities."
      );
    });
  }, [isHydrated, settings]);

  const createNewChat = () => {
    const session = createSession("New Chat");
    setSessions((previous) => [session, ...previous]);
    setActiveSessionId(session.id);
    setDraft("");
    clearDraftAttachments();
  };

  const applyChatTitle = (sessionId: string, nextTitle: string) => {
    const title = nextTitle.trim();
    if (!title) {
      return;
    }
    upsertSession(sessionId, (session) =>
      session.title === title ? session : { ...session, title, updatedAt: nowIso() }
    );
  };

  const renameChat = (sessionId: string, overrideTitle?: string) => {
    if (typeof overrideTitle === "string") {
      applyChatTitle(sessionId, overrideTitle);
      return;
    }

    const target = sessions.find((session) => session.id === sessionId);
    if (!target) {
      return;
    }
    const input = window.prompt("Rename Chat", target.title);
    if (!input) {
      return;
    }
    const title = input.trim();
    if (!title) {
      return;
    }
    applyChatTitle(sessionId, title);
  };

  const toggleChatPin = (sessionId: string) => {
    upsertSession(sessionId, (session) => ({ ...session, isPinned: !Boolean(session.isPinned) }));
  };

  const saveUserSkills = (skills: Skill[]) => {
    setUserSkills(skills);
    void api.skills.save(skills).catch((error) => {
      console.warn("[skills][save] failed", error instanceof Error ? error.message : "unknown");
    });
  };

  const deleteChat = (sessionId: string) => {
    if (removedSession) {
      window.clearTimeout(removedSession.timeoutId);
      removedTimeoutRef.current = null;
      setRemovedSession(null);
    }

    const currentIndex = sessions.findIndex((session) => session.id === sessionId);
    if (currentIndex < 0) {
      return;
    }

    const sessionToDelete = sessions[currentIndex];
    const remaining = sessions.filter((session) => session.id !== sessionId);
    const mergedSessions = remaining.length ? remaining : [createSession("New Chat")];
    setSessions(mergedSessions);

    if (activeSessionId === sessionId) {
      setActiveSessionId(mergedSessions[0].id);
    }

    const timeoutId = window.setTimeout(() => {
      setRemovedSession(null);
      removedTimeoutRef.current = null;
    }, 2000);
    removedTimeoutRef.current = timeoutId;

    setRemovedSession({
      session: sessionToDelete,
      index: currentIndex,
      timeoutId
    });
  };

  const undoDelete = () => {
    if (!removedSession) {
      return;
    }
    window.clearTimeout(removedSession.timeoutId);
    removedTimeoutRef.current = null;
    setSessions((previous) => {
      const next = [...previous];
      next.splice(removedSession.index, 0, removedSession.session);
      return next;
    });
    setActiveSessionId(removedSession.session.id);
    setRemovedSession(null);
  };

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

  const saveSettings = async (next: AppSettings) => {
    const normalized = withPersistedAutoDetectedCapabilities(normalizeSettings(next));
    await api.settings.save(normalized);
    setSettings(normalized);
    setErrorBanner(null);
  };

  const testConnection = async (next: AppSettings): Promise<ConnectionTestResult> =>
    api.settings.testConnection(next);
  const testMemosConnection = async (next: AppSettings): Promise<ConnectionTestResult> =>
    api.memos.testConnection(next);

  const listModels = async (next: AppSettings) => api.settings.listModels(next);
  const listMcpServers = async (next: AppSettings): Promise<McpServerListResult> =>
    api.settings.listMcpServers(next);
  const listMcpServerStatus = async (next: AppSettings): Promise<McpServerStatusListResult> =>
    api.settings.listMcpServerStatus(next);
  const reloadMcpServers = async (next: AppSettings): Promise<McpServerStatusListResult> =>
    api.settings.reloadMcpServers(next);

  const exportSessions = () => {
    try {
      exportSessionsAsJson(sessions);
    } catch (error) {
      setErrorBanner(error instanceof Error ? error.message : "Failed to export sessions.");
    }
  };

  const exportSession = (sessionId: string) => {
    const target = sessions.find((session) => session.id === sessionId);
    if (!target) {
      return;
    }

    try {
      exportSessionAsJson(target);
    } catch (error) {
      setErrorBanner(error instanceof Error ? error.message : "Failed to export session.");
    }
  };

  const exportSessionMarkdown = (sessionId: string) => {
    const target = sessions.find((session) => session.id === sessionId);
    if (!target) {
      return;
    }

    try {
      exportSessionAsMarkdown(target);
    } catch (error) {
      setErrorBanner(error instanceof Error ? error.message : "Failed to export session markdown.");
    }
  };

  const importSessions = (importedSessions: ChatSession[]) => {
    const nextSessions = ensureSessions(importedSessions);
    setSessions(nextSessions);
    setActiveSessionId(nextSessions[0].id);
    setErrorBanner(null);
    setDraft("");
    clearDraftAttachments();
  };

  const clearAllSessions = () => {
    const nextSessions = [createSession("New Chat")];
    setSessions(nextSessions);
    setActiveSessionId(nextSessions[0].id);
    setErrorBanner(null);
    setDraft("");
    clearDraftAttachments();
  };

  const createNewAgentSession = async () => {
    const session = await api.agent.createSession();
    setAgentSessions((previous) => [session, ...previous]);
    setActiveAgentSessionId(session.id);
    setAgentMessagesBySession((previous) => ({ ...previous, [session.id]: [] }));
    setAgentDraft("");
    clearAgentDraftAttachments();
    setAgentErrorBanner(null);
  };

  const renameAgentSession = async (sessionId: string, overrideTitle?: string) => {
    const target = agentSessions.find((session) => session.id === sessionId);
    if (!target) {
      return;
    }
    const title =
      typeof overrideTitle === "string"
        ? overrideTitle.trim()
        : (window.prompt("Rename Agent Session", target.title) ?? "").trim();
    if (!title) {
      return;
    }
    if (target.title === title) {
      return;
    }
    const updated = await api.agent.updateSessionTitle({ sessionId, title });
    setAgentSessions((previous) => {
      const rest = previous.filter((session) => session.id !== updated.id);
      return [updated, ...rest];
    });
  };

  const deleteAgentSession = async (sessionId: string) => {
    await api.agent.deleteSession(sessionId);
    removeAgentPermissionRequests({ sessionId });
    setAgentMessagesBySession((previous) => {
      const next = { ...previous };
      delete next[sessionId];
      return next;
    });
    const remaining = agentSessions.filter((session) => session.id !== sessionId);
    if (!remaining.length) {
      const nextSession = await api.agent.createSession();
      setAgentSessions([nextSession]);
      setActiveAgentSessionId(nextSession.id);
      setAgentMessagesBySession((previous) => ({ ...previous, [nextSession.id]: [] }));
      return;
    }
    setAgentSessions(remaining);
    if (activeAgentSessionId === sessionId) {
      setActiveAgentSessionId(remaining[0].id);
    }
  };

  const stopAgentRun = async () => {
    const activeRun = activeAgentRunRef.current;
    if (!activeRun) {
      return;
    }
    await api.agent.stop({ runId: activeRun.runId });
    finishAgentRun();
    void loadAgentMessages(activeRun.sessionId).catch(() => {});
  };

  const resetSettings = async () => {
    await saveSettings(DEFAULT_SETTINGS);
  };

  const addDraftLikeFiles = (
    files: FileList | File[] | null,
    onBlockedMessage: (message: string) => void,
    onAccepted: (accepted: DraftAttachment[]) => void
  ) => {
    const incomingFiles = normalizeIncomingDraftFiles(files);
    if (!incomingFiles.length) {
      return;
    }

    void (async () => {
      const { accepted, blockedMessages } = await buildDraftAttachments({
        files: incomingFiles,
        createId,
        modelId: settings.model,
        modelCapabilities: activeModelCapabilities
      });

      const blockedSummary = summarizeBlockedAttachmentMessages(blockedMessages);
      if (blockedSummary) {
        onBlockedMessage(blockedSummary);
      }

      if (!accepted.length) {
        return;
      }
      onAccepted(accepted);
    })();
  };

  const addFiles = (files: FileList | File[] | null) => {
    addDraftLikeFiles(
      files,
      (message) => setErrorBanner(message),
      (accepted) => setDraftAttachments((previous) => [...previous, ...accepted])
    );
  };

  const addAgentFiles = (files: FileList | File[] | null) => {
    addDraftLikeFiles(
      files,
      (message) => setAgentErrorBanner(message),
      (accepted) => setAgentDraftAttachments((previous) => [...previous, ...accepted])
    );
  };

  const removeAttachment = (attachmentId: string) => {
    setDraftAttachments((previous) => {
      const { removed, next } = removeAttachmentById(previous, attachmentId);
      if (removed) {
        revokeAttachmentPreview(removed);
      }
      return next;
    });
  };

  const removeAgentAttachment = (attachmentId: string) => {
    setAgentDraftAttachments((previous) => {
      const { removed, next } = removeAttachmentById(previous, attachmentId);
      if (removed) {
        revokeAttachmentPreview(removed);
      }
      return next;
    });
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
    if (!activeSession || !isConfigured || isGenerating) return;
    void sendMessage(input, skill, params);
  };

  const sendMessage = async (content: string, skill?: Skill, skillParams?: Record<string, string>) => {
    if (!activeSession || !isConfigured || isGenerating) {
      return;
    }

    const prompt = content.trim();
    const messageAttachments = toChatAttachments(draftAttachments);
    const hasAnyAttachmentPayload = messageAttachments.some(hasAttachmentPayload);
    let completionMessagesOverride: ChatStreamRequest["messages"] | undefined;

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

    await sendFromBaseMessages(
      activeSession,
      activeSession.messages,
      userMessage,
      true,
      {
        completionMessagesOverride,
        assistantAppliedSkill
      }
    );
    clearDraftAttachments();
  };

  const appendAgentSystemEvent = (sessionId: string, text: string) => {
    upsertAgentMessages(sessionId, (messages) => [
      ...messages,
      {
        id: createId(),
        sessionId,
        role: "system",
        content: text,
        createdAt: nowIso()
      }
    ]);
  };

  const sendAgentMessage = async (inputOverride?: string) => {
    if (!activeAgentSession || isAgentRunning) {
      return;
    }

    const input = (inputOverride ?? agentDraft).trim();
    const messageAttachments = toChatAttachments(agentDraftAttachments);
    const hasAnyAttachmentPayload = messageAttachments.some(hasAttachmentPayload);
    if (!input && !hasAnyAttachmentPayload) {
      return;
    }

    const baseRunSettings = agentSettingsSnapshot;
    if (!baseRunSettings) {
      setAgentErrorBanner(
        "请在 Settings 选择可用于 Agent 的渠道（Claude Agent SDK 或 Anthropic 兼容 provider）。"
      );
      return;
    }
    await runAgentMessageService({
      activeAgentSession,
      input,
      messageAttachments,
      settings,
      baseRunSettings,
      api,
      activeAgentRunRef,
      refreshAgentEnvironmentSnapshot,
      upsertAgentMessages,
      appendAgentSystemEvent,
      finishAgentRun,
      loadAgentMessages,
      fetchAndSetAgentMessages,
      enqueueAgentPermissionRequest,
      removeAgentPermissionRequests,
      clearAgentDraftAttachments,
      setAgentDraft,
      setAgentErrorBanner,
      setIsAgentRunning,
      setAgentSessions
    });
  };

  const closeSidebarIfCompact = () => {
    if (isCompactLayout) {
      setIsSidebarOpen(false);
    }
  };

  const openSettings = (section: SettingsSection = "provider") => {
    setActiveSettingsSection(section);
    setActiveView("settings");
    closeSidebarIfCompact();
  };

  const sidebarWidth = isSidebarOpen ? getResponsiveSidebarWidth(viewportWidth) : 0;
  const showFloatingSidebarToggle = isCompactLayout || !isSidebarOpen;
  const hasChatMessages = (activeSession?.messages.length ?? 0) > 0;
  const showCenteredChatLanding = activeView === "chat" && isConfigured && !hasChatMessages;
  const activeChatMessageCount = activeSession?.messages.length ?? 0;

  const hasFileTransfer = (dataTransfer: DataTransfer | null) =>
    Boolean(dataTransfer && Array.from(dataTransfer.types).includes("Files"));

  const handleChatDragEnter: DragEventHandler<HTMLElement> = (event) => {
    if (activeView !== "chat" || !hasFileTransfer(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    chatDropDepthRef.current += 1;
    updateChatDragOver(true);
  };

  const handleChatDragOver: DragEventHandler<HTMLElement> = (event) => {
    if (activeView !== "chat" || !hasFileTransfer(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    updateChatDragOver(true);
  };

  const handleChatDragLeave: DragEventHandler<HTMLElement> = (event) => {
    if (activeView !== "chat" || !hasFileTransfer(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    chatDropDepthRef.current = Math.max(0, chatDropDepthRef.current - 1);
    if (chatDropDepthRef.current === 0) {
      updateChatDragOver(false);
    }
  };

  const handleChatDrop: DragEventHandler<HTMLElement> = (event) => {
    if (activeView !== "chat" || !hasFileTransfer(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    chatDropDepthRef.current = 0;
    updateChatDragOver(false);
    addFiles(event.dataTransfer.files);
  };

  return {
    TOP_FRAME_HEIGHT_PX,
    activeView,
    setActiveView,
    activeSettingsSection,
    setActiveSettingsSection,
    sessions,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    orderedChatSessions,
    userSkills,
    saveUserSkills,
    activeSkill,
    setActiveSkill,
    activeEnabledMcpServers,
    updateSessionMcpServers,
    settings,
    isConfigured,
    composerModelOptions,
    activeComposerModelValue,
    activeModelCapabilities,
    composerUsageLabel,
    selectComposerModel,
    updateChatContextWindow,
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
    errorBanner,
    undoDelete,
    createNewChat,
    renameChat,
    deleteChat,
    toggleChatPin,
    exportSession,
    exportSessionMarkdown,
    exportSessions,
    importSessions,
    clearAllSessions,
    agentSessions,
    activeAgentSessionId,
    setActiveAgentSessionId,
    activeAgentMessages,
    activeAgentPermissionRequest,
    resolveAgentPermissionRequest,
    agentSettingsSnapshot,
    isAgentConfigured,
    agentModelOptions,
    activeAgentModelValue,
    selectAgentModel,
    agentDraft,
    setAgentDraft,
    agentDraftAttachments,
    addAgentFiles,
    removeAgentAttachment,
    sendAgentMessage,
    isAgentRunning,
    stopAgentRun,
    agentErrorBanner,
    createNewAgentSession,
    renameAgentSession,
    deleteAgentSession,
    isHydrated,
    isSidebarOpen,
    setIsSidebarOpen,
    isChatDragOver,
    sidebarWidth,
    showFloatingSidebarToggle,
    showCenteredChatLanding,
    activeChatMessageCount,
    closeSidebarIfCompact,
    openSettings,
    handleChatDragEnter,
    handleChatDragOver,
    handleChatDragLeave,
    handleChatDrop,
    saveSettings,
    testConnection,
    testMemosConnection,
    listModels,
    listMcpServers,
    listMcpServerStatus,
    reloadMcpServers,
    resetSettings
  };
};
