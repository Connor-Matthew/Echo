import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { loadEnvironmentSnapshot } from "../../domain/environment/load-snapshot";
import type { MuApi } from "../../lib/mu-api";
import type { DraftAttachment } from "../app/draft-attachments";
import type {
  AgentMessage,
  AgentSessionMeta,
  AgentStreamEnvelope
} from "../../shared/agent-contracts";
import type { AppSettings, ChatAttachment, EnvironmentSnapshot } from "../../shared/contracts";
import { createId, nowIso } from "../chat/utils/chat-utils";
import { useAgentOrchestration } from "./use-agent-orchestration";
import {
  buildAgentPermissionResolutionMessage,
  enqueueAgentPermissionFromEnvelope,
  markAgentPermissionResolving,
  mergeRuntimeAgentMessageDecorations,
  removeAgentPermissionQueueItems,
  type PendingAgentPermission
} from "../app/controller-helpers";
import {
  runAgentMessageService,
  type AgentActiveRun
} from "./services/run-agent-message";

type AgentDraftController = {
  agentDraft: string;
  setAgentDraft: Dispatch<SetStateAction<string>>;
  agentDraftAttachments: DraftAttachment[];
  clearAgentDraftAttachments: () => void;
  addAgentFiles: (files: FileList | File[] | null) => void;
  removeAgentAttachment: (attachmentId: string) => void;
  toChatAttachments: (attachments: DraftAttachment[]) => ChatAttachment[];
};

type UseAgentControllerParams = {
  api: MuApi;
  isHydrated: boolean;
  activeView: "chat" | "agent" | "settings";
  settings: AppSettings;
  agentErrorBanner: string | null;
  setAgentErrorBanner: Dispatch<SetStateAction<string | null>>;
  draftController: AgentDraftController;
  selectComposerModel: (modelOptionValue: string) => void;
};

export const useAgentController = ({
  api,
  isHydrated,
  activeView,
  settings,
  agentErrorBanner,
  setAgentErrorBanner,
  draftController,
  selectComposerModel
}: UseAgentControllerParams) => {
  const {
    agentDraft,
    setAgentDraft,
    agentDraftAttachments,
    clearAgentDraftAttachments,
    addAgentFiles,
    removeAgentAttachment,
    toChatAttachments
  } = draftController;

  const [agentSessions, setAgentSessions] = useState<AgentSessionMeta[]>([]);
  const [activeAgentSessionId, setActiveAgentSessionId] = useState("");
  const [agentMessagesBySession, setAgentMessagesBySession] = useState<Record<string, AgentMessage[]>>(
    {}
  );
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentPermissionQueue, setAgentPermissionQueue] = useState<PendingAgentPermission[]>([]);
  const [agentEnvironmentSnapshot, setAgentEnvironmentSnapshot] =
    useState<EnvironmentSnapshot | null>(null);

  const activeAgentRunRef = useRef<AgentActiveRun | null>(null);
  const agentEnvironmentSnapshotRef = useRef<EnvironmentSnapshot | null>(null);

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

  const hydrateAgentState = useCallback(
    (sessions: AgentSessionMeta[], nextActiveSessionId: string, messagesBySession: Record<string, AgentMessage[]>) => {
      setAgentSessions(sessions);
      setActiveAgentSessionId(nextActiveSessionId);
      setAgentMessagesBySession(messagesBySession);
    },
    []
  );

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

  const finishAgentRun = useCallback(() => {
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
  }, []);

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
      return agentEnvironmentSnapshotRef.current;
    }
  }, [
    activeAgentSession?.lastCwd,
    api.env,
    settings.environment.city,
    settings.environment.enabled,
    settings.environment.sendTimeoutMs,
    settings.environment.temperatureUnit,
    settings.environment.weatherCacheTtlMs
  ]);

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
  }, [activeAgentSessionId, agentMessagesBySession, isHydrated, setAgentErrorBanner]);

  useEffect(() => {
    return () => {
      const activeRun = activeAgentRunRef.current;
      if (activeRun) {
        void api.agent.stop({ runId: activeRun.runId });
      }
      finishAgentRun();
    };
  }, [api.agent, finishAgentRun]);

  const selectAgentModel = (modelOptionValue: string) => {
    selectComposerModel(modelOptionValue);
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
    if (!title || target.title === title) {
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

  const sendAgentMessage = async (inputOverride?: string) => {
    if (!activeAgentSession || isAgentRunning) {
      return;
    }

    const input = (inputOverride ?? agentDraft).trim();
    const messageAttachments = toChatAttachments(agentDraftAttachments);
    const hasAnyAttachmentPayload = messageAttachments.length > 0;
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

  return {
    agentSessions,
    activeAgentSession: activeAgentSession ?? null,
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
    hydrateAgentState
  };
};
