import { useCallback, useEffect, useMemo, useRef, useState, type DragEventHandler } from "react";
import { PanelLeft } from "lucide-react";
import { AgentView } from "./components/AgentView";
import { AttachmentTray } from "./components/AttachmentTray";
import { ChatView } from "./components/ChatView";
import { Composer, type ComposerAttachment } from "./components/Composer";
import { SettingsCenter } from "./components/SettingsCenter";
import { Sidebar, type SettingsSection } from "./components/Sidebar";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import {
  buildUnavailableWeather,
  collectLocalEnvironmentContext,
  toStaleWeatherFromPrevious
} from "./lib/environment-context";
import { getMuApi } from "./lib/mu-api";
import { resolveProviderModelContextWindow } from "./lib/model-context-window";
import { resolveProviderModelCapabilities } from "./lib/model-capabilities";
import {
  EMPTY_STREAM_USAGE_SNAPSHOT,
  IMAGE_ATTACHMENT_LIMIT,
  SIDEBAR_AUTO_HIDE_WIDTH,
  TEXT_ATTACHMENT_LIMIT,
  createId,
  createSession,
  decodeComposerModelOption,
  encodeComposerModelOption,
  ensureSessions,
  estimateTokensFromCompletionMessages,
  finalizeTitleFromPrompt,
  formatEnvironmentBatteryLabel,
  formatEnvironmentChipLabel,
  formatEnvironmentMemoryLabel,
  formatEnvironmentStorageLabel,
  formatEnvironmentSystemLabel,
  formatEnvironmentWeatherLabel,
  formatTokenCount,
  getCurrentViewportWidth,
  getResponsiveSidebarWidth,
  hasAttachmentPayload,
  isAudioAttachment,
  isTextAttachment,
  isVideoAttachment,
  limitCompletionMessagesByTurns,
  mergeUsageSnapshot,
  nowIso,
  estimateTokensFromText,
  readFileAsDataUrl,
  revokeAttachmentPreview,
  sessionToCompletionMessages,
  sessionToMarkdown,
  toModelUsageKey,
  toProviderInputTokens,
  toSafeFileNameSegment,
  type StreamUsageSnapshot
} from "./lib/app-chat-utils";
import {
  buildAgentRunSettingsSnapshot,
  type AgentMessage,
  type AgentSessionMeta,
  type AgentStreamEnvelope
} from "./shared/agent-contracts";
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
  type EnvironmentSnapshot
} from "./shared/contracts";

type RemovedSession = {
  session: ChatSession;
  index: number;
  timeoutId: number;
};

type ActiveStream = {
  streamId: string;
  sessionId: string;
  assistantMessageId: string;
  usageModelKey: string;
  usageSnapshot: StreamUsageSnapshot;
  hasUsageEvent: boolean;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  pendingDelta: string;
  pendingReasoningDelta: string;
  flushTimeoutId: number | null;
  flushPending: () => void;
  unsubscribe: () => void;
};

type DraftAttachment = ComposerAttachment & {
  mimeType: string;
  textContent?: string;
  imageDataUrl?: string;
};

type AppView = "chat" | "agent" | "settings";

type ActiveAgentRun = {
  runId: string;
  sessionId: string;
  assistantMessageId: string;
  unsubscribe: () => void;
};

const api = getMuApi();

export const App = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeView, setActiveView] = useState<AppView>("chat");
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSection>("provider");
  const [isGenerating, setIsGenerating] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<DraftAttachment[]>([]);
  const [agentSessions, setAgentSessions] = useState<AgentSessionMeta[]>([]);
  const [activeAgentSessionId, setActiveAgentSessionId] = useState("");
  const [agentMessagesBySession, setAgentMessagesBySession] = useState<Record<string, AgentMessage[]>>(
    {}
  );
  const [agentDraft, setAgentDraft] = useState("");
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentErrorBanner, setAgentErrorBanner] = useState<string | null>(null);
  const [agentEnvironmentSnapshot, setAgentEnvironmentSnapshot] =
    useState<EnvironmentSnapshot | null>(null);
  const [agentEnvironmentCityDraft, setAgentEnvironmentCityDraft] = useState("");
  const [agentEnvironmentWeatherSummaryDraft, setAgentEnvironmentWeatherSummaryDraft] = useState("");
  const [isAgentEnvironmentRefreshing, setIsAgentEnvironmentRefreshing] = useState(false);
  const [isAgentEnvironmentExpanded, setIsAgentEnvironmentExpanded] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [removedSession, setRemovedSession] = useState<RemovedSession | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(getCurrentViewportWidth);
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => getCurrentViewportWidth() >= SIDEBAR_AUTO_HIDE_WIDTH
  );

  const activeStreamRef = useRef<ActiveStream | null>(null);
  const removedTimeoutRef = useRef<number | null>(null);
  const draftAttachmentsRef = useRef<DraftAttachment[]>([]);
  const activeAgentRunRef = useRef<ActiveAgentRun | null>(null);
  const agentEnvironmentSnapshotRef = useRef<EnvironmentSnapshot | null>(null);
  const chatEnvironmentSnapshotRef = useRef<EnvironmentSnapshot | null>(null);
  const agentEnvironmentCityDraftRef = useRef("");
  const agentEnvironmentWeatherSummaryDraftRef = useRef("");
  const wasCompactLayoutRef = useRef(getCurrentViewportWidth() < SIDEBAR_AUTO_HIDE_WIDTH);
  const chatDropDepthRef = useRef(0);
  const [isChatDragOver, setIsChatDragOver] = useState(false);

  const isCompactLayout = viewportWidth < SIDEBAR_AUTO_HIDE_WIDTH;

  useEffect(() => {
    if (activeView !== "chat") {
      chatDropDepthRef.current = 0;
      setIsChatDragOver(false);
    }
  }, [activeView]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [sessions, activeSessionId]
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

  const composerModelOptions = useMemo(() => {
    const seen = new Set<string>();
    return settings.providers.flatMap((provider) => {
      if (provider.providerType === "claude-agent") {
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
        .filter((option): option is { value: string; label: string } => Boolean(option));
    });
  }, [settings.providers]);

  const activeComposerModelValue = useMemo(() => {
    const modelId = settings.model.trim();
    if (!activeProvider?.id || !modelId || activeProvider.providerType === "claude-agent") {
      return "";
    }
    return encodeComposerModelOption(activeProvider.id, modelId);
  }, [activeProvider?.id, settings.model]);
  const activeModelCapabilities = useMemo(
    () => resolveProviderModelCapabilities(activeProvider, settings.model),
    [activeProvider, settings.model]
  );
  const activeModelContextWindow = useMemo(
    () => resolveProviderModelContextWindow(activeProvider, settings.model),
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
  const agentSettingsSnapshot = useMemo(() => buildAgentRunSettingsSnapshot(settings), [settings]);
  const isAgentConfigured = useMemo(
    () => Boolean(agentSettingsSnapshot?.apiKey.trim() && agentSettingsSnapshot.model.trim()),
    [agentSettingsSnapshot]
  );

  const upsertSession = (
    sessionId: string,
    mutate: (session: ChatSession) => ChatSession
  ) => {
    setSessions((previous) =>
      previous.map((session) => (session.id === sessionId ? mutate(session) : session))
    );
  };

  const applyUsageDeltaToSession = (
    sessionId: string,
    modelUsageKey: string,
    delta: StreamUsageSnapshot
  ) => {
    if (
      !modelUsageKey ||
      (delta.inputTokens <= 0 &&
        delta.outputTokens <= 0 &&
        delta.totalTokens <= 0 &&
        delta.cacheReadTokens <= 0 &&
        delta.cacheWriteTokens <= 0)
    ) {
      return;
    }

    upsertSession(sessionId, (session) => {
      const current = session.usageByModel?.[modelUsageKey] ?? {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        updatedAt: nowIso()
      };

      const nextInputTokens = current.inputTokens + delta.inputTokens;
      const nextOutputTokens = current.outputTokens + delta.outputTokens;
      const nextTotalTokens = Math.max(
        current.totalTokens + delta.totalTokens,
        nextInputTokens + nextOutputTokens
      );

      return {
        ...session,
        usageByModel: {
          ...(session.usageByModel ?? {}),
          [modelUsageKey]: {
            inputTokens: nextInputTokens,
            outputTokens: nextOutputTokens,
            totalTokens: nextTotalTokens,
            cacheReadTokens: current.cacheReadTokens + delta.cacheReadTokens,
            cacheWriteTokens: current.cacheWriteTokens + delta.cacheWriteTokens,
            updatedAt: nowIso()
          }
        }
      };
    });
  };

  const applyUsageToAssistantMessage = (
    sessionId: string,
    assistantMessageId: string,
    usage: StreamUsageSnapshot,
    source: ChatMessageUsage["source"]
  ) => {
    upsertSession(sessionId, (session) => ({
      ...session,
      messages: session.messages.map((message) =>
        message.id === assistantMessageId
          ? {
              ...message,
              usage: {
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: Math.max(usage.totalTokens, usage.inputTokens + usage.outputTokens),
                cacheReadTokens: usage.cacheReadTokens,
                cacheWriteTokens: usage.cacheWriteTokens,
                source
              }
            }
          : message
      )
    }));
  };

  const removeAssistantPlaceholderIfEmpty = (sessionId: string, messageId: string) => {
    upsertSession(sessionId, (session) => {
      const target = session.messages.find((message) => message.id === messageId);
      if (
        !target ||
        target.role !== "assistant" ||
        target.content.trim() ||
        target.reasoningContent?.trim()
      ) {
        return session;
      }
      return {
        ...session,
        updatedAt: nowIso(),
        messages: session.messages.filter((message) => message.id !== messageId)
      };
    });
  };

  const clearDraftAttachments = () => {
    setDraftAttachments((previous) => {
      previous.forEach(revokeAttachmentPreview);
      return [];
    });
  };

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

  const finishAgentRun = () => {
    const activeRun = activeAgentRunRef.current;
    if (!activeRun) {
      return;
    }
    activeRun.unsubscribe();
    activeAgentRunRef.current = null;
    setIsAgentRunning(false);
  };

  const loadAgentMessages = async (sessionId: string) => {
    const messages = await api.agent.getMessages(sessionId);
    setAgentMessagesBySession((previous) => ({
      ...previous,
      [sessionId]: messages
    }));
  };

  const refreshAgentEnvironmentSnapshot = useCallback(async (): Promise<EnvironmentSnapshot | null> => {
    if (!settings.environment.enabled) {
      setAgentEnvironmentSnapshot(null);
      return null;
    }

    setIsAgentEnvironmentRefreshing(true);
    try {
      const city = agentEnvironmentCityDraftRef.current.trim() || settings.environment.city.trim();
      const cwd = activeAgentSession?.lastCwd ?? "";
      const [local, systemStatus] = await Promise.all([
        collectLocalEnvironmentContext(cwd),
        api.env.getSystemStatus().catch(() => ({}))
      ]);
      let weather = buildUnavailableWeather(city ? "weather_lookup_skipped" : "city_not_set");

      if (city) {
        const timeoutMs = Math.min(Math.max(settings.environment.sendTimeoutMs, 100), 2000);
        let timeoutId: number | null = null;

        try {
          const weatherRequest = api.env.getWeatherSnapshot({
            city,
            temperatureUnit: settings.environment.temperatureUnit,
            cacheTtlMs: settings.environment.weatherCacheTtlMs
          });
          const timeoutRequest = new Promise<null>((resolve) => {
            timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
          });
          const nextWeather = await Promise.race([weatherRequest, timeoutRequest]);
          weather =
            nextWeather ??
            toStaleWeatherFromPrevious(agentEnvironmentSnapshotRef.current?.weather, "weather_timeout") ??
            buildUnavailableWeather("weather_timeout");
        } catch (error) {
          const reason = error instanceof Error ? error.message : "weather_lookup_failed";
          weather =
            toStaleWeatherFromPrevious(agentEnvironmentSnapshotRef.current?.weather, reason) ??
            buildUnavailableWeather(reason);
        } finally {
          if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
          }
        }
      }

      const summaryOverride = agentEnvironmentWeatherSummaryDraftRef.current.trim();
      if (summaryOverride) {
        weather = { ...weather, summary: summaryOverride };
      }

      const snapshot: EnvironmentSnapshot = {
        ...local,
        device: {
          ...local.device,
          ...systemStatus
        },
        location: { city },
        weather
      };
      setAgentEnvironmentSnapshot(snapshot);
      return snapshot;
    } catch {
      const fallback = agentEnvironmentSnapshotRef.current;
      if (fallback) {
        return fallback;
      }
      return null;
    } finally {
      setIsAgentEnvironmentRefreshing(false);
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

    const city = settings.environment.city.trim();
    const [local, systemStatus] = await Promise.all([
      collectLocalEnvironmentContext(""),
      api.env.getSystemStatus().catch(() => ({}))
    ]);
    let weather = buildUnavailableWeather(city ? "weather_lookup_skipped" : "city_not_set");

    if (city) {
      const timeoutMs = Math.min(Math.max(settings.environment.sendTimeoutMs, 100), 2000);
      let timeoutId: number | null = null;
      try {
        const weatherRequest = api.env.getWeatherSnapshot({
          city,
          temperatureUnit: settings.environment.temperatureUnit,
          cacheTtlMs: settings.environment.weatherCacheTtlMs
        });
        const timeoutRequest = new Promise<null>((resolve) => {
          timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
        });
        const nextWeather = await Promise.race([weatherRequest, timeoutRequest]);
        weather =
          nextWeather ??
          toStaleWeatherFromPrevious(chatEnvironmentSnapshotRef.current?.weather, "weather_timeout") ??
          buildUnavailableWeather("weather_timeout");
      } catch (error) {
        const reason = error instanceof Error ? error.message : "weather_lookup_failed";
        weather =
          toStaleWeatherFromPrevious(chatEnvironmentSnapshotRef.current?.weather, reason) ??
          buildUnavailableWeather(reason);
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      }
    }

    const snapshot: EnvironmentSnapshot = {
      ...local,
      device: {
        ...local.device,
        ...systemStatus
      },
      location: { city },
      weather
    };
    chatEnvironmentSnapshotRef.current = snapshot;
    const content = `environment_snapshot_json:\n${JSON.stringify(snapshot, null, 2)}`;
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
        const [savedSettings, savedSessions, savedAgentSessions] = await Promise.all([
          api.settings.get(),
          api.sessions.get(),
          api.agent.listSessions()
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
    agentEnvironmentSnapshotRef.current = agentEnvironmentSnapshot;
  }, [agentEnvironmentSnapshot]);

  useEffect(() => {
    agentEnvironmentCityDraftRef.current = agentEnvironmentCityDraft;
  }, [agentEnvironmentCityDraft]);

  useEffect(() => {
    agentEnvironmentWeatherSummaryDraftRef.current = agentEnvironmentWeatherSummaryDraft;
  }, [agentEnvironmentWeatherSummaryDraft]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }
    if (agentEnvironmentCityDraftRef.current.trim()) {
      return;
    }
    if (!settings.environment.city.trim()) {
      return;
    }
    setAgentEnvironmentCityDraft(settings.environment.city);
  }, [isHydrated, settings.environment.city]);

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

  const createNewChat = () => {
    const session = createSession();
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
    const mergedSessions = remaining.length ? remaining : [createSession()];
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
    try {
      await api.chat.stopStream(activeStream.streamId);
    } finally {
      finishActiveStream();
    }
  };

  const saveSettings = async (next: AppSettings) => {
    const normalized = normalizeSettings(next);
    await api.settings.save(normalized);
    setSettings(normalized);
    setErrorBanner(null);
  };

  const selectComposerModel = (modelOptionValue: string) => {
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
      const nextSettings = normalizeSettings({
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

      void api.settings.save(nextSettings).catch((error) => {
        setErrorBanner(error instanceof Error ? error.message : "Failed to save model selection.");
      });

      return nextSettings;
    });
  };

  const updateChatContextWindow = (nextWindow: AppSettings["chatContextWindow"]) => {
    setSettings((previous) => {
      if (previous.chatContextWindow === nextWindow) {
        return previous;
      }

      const nextSettings = normalizeSettings({
        ...previous,
        chatContextWindow: nextWindow
      });

      void api.settings.save(nextSettings).catch((error) => {
        setErrorBanner(error instanceof Error ? error.message : "Failed to save chat context window.");
      });

      return nextSettings;
    });
  };

  const toggleChatEnvironmentInjection = () => {
    setSettings((previous) => {
      const nextSettings = normalizeSettings({
        ...previous,
        environment: {
          ...previous.environment,
          enabled: !previous.environment.enabled
        }
      });

      void api.settings.save(nextSettings).catch((error) => {
        setErrorBanner(
          error instanceof Error ? error.message : "Failed to save environment injection setting."
        );
      });

      return nextSettings;
    });
  };

  const toggleSessionSoulMode = () => {
    if (!activeSession) {
      return;
    }
    upsertSession(activeSession.id, (session) => ({
      ...session,
      soulModeEnabled: !Boolean(session.soulModeEnabled),
      updatedAt: nowIso()
    }));
  };

  const testConnection = async (next: AppSettings): Promise<ConnectionTestResult> =>
    api.settings.testConnection(next);

  const listModels = async (next: AppSettings) => api.settings.listModels(next);

  const exportSessions = () => {
    try {
      const payload = JSON.stringify(sessions, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `mu-sessions-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
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
      const payload = JSON.stringify(target, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const dateSuffix = new Date().toISOString().slice(0, 10);
      anchor.download = `mu-session-${toSafeFileNameSegment(target.title)}-${dateSuffix}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
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
      const payload = sessionToMarkdown(target);
      const blob = new Blob([payload], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const dateSuffix = new Date().toISOString().slice(0, 10);
      anchor.download = `mu-session-${toSafeFileNameSegment(target.title)}-${dateSuffix}.md`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
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
    const nextSessions = [createSession()];
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
    setAgentErrorBanner(null);
  };

  const renameAgentSession = async (sessionId: string) => {
    const target = agentSessions.find((session) => session.id === sessionId);
    if (!target) {
      return;
    }
    const input = window.prompt("Rename Agent Session", target.title);
    if (!input) {
      return;
    }
    const title = input.trim();
    if (!title) {
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

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) {
      return;
    }
    const incomingFiles = Array.isArray(files) ? files : Array.from(files);
    if (!incomingFiles.length) {
      return;
    }

    void (async () => {
      const blockedMessages: string[] = [];
      const nextAttachments = await Promise.all(
        incomingFiles.map(async (file): Promise<DraftAttachment | null> => {
          const base: DraftAttachment = {
            id: createId(),
            name: file.name,
            size: file.size,
            kind: "file",
            mimeType: file.type || "application/octet-stream"
          };

          if (file.type.startsWith("image/")) {
            if (!activeModelCapabilities.imageInput) {
              blockedMessages.push(`模型 "${settings.model}" 不支持图片输入：${file.name}`);
              return null;
            }
            const previewUrl = URL.createObjectURL(file);
            if (file.size > IMAGE_ATTACHMENT_LIMIT) {
              return {
                ...base,
                kind: "image",
                previewUrl,
                error: `图片超过 ${(IMAGE_ATTACHMENT_LIMIT / (1024 * 1024)).toFixed(0)}MB，无法发送给模型。`
              };
            }

            try {
              const imageDataUrl = await readFileAsDataUrl(file);
              return {
                ...base,
                kind: "image",
                previewUrl,
                imageDataUrl
              };
            } catch {
              return {
                ...base,
                kind: "image",
                previewUrl,
                error: "图片读取失败，无法发送给模型。"
              };
            }
          }

          if (isAudioAttachment(file)) {
            if (!activeModelCapabilities.audioInput) {
              blockedMessages.push(`模型 "${settings.model}" 不支持音频输入：${file.name}`);
              return null;
            }
            return base;
          }

          if (isVideoAttachment(file)) {
            if (!activeModelCapabilities.videoInput) {
              blockedMessages.push(`模型 "${settings.model}" 不支持视频输入：${file.name}`);
              return null;
            }
            return base;
          }

          if (isTextAttachment(file)) {
            try {
              const content = await file.text();
              const isTrimmed = content.length > TEXT_ATTACHMENT_LIMIT;
              return {
                ...base,
                kind: "text",
                textContent: content.slice(0, TEXT_ATTACHMENT_LIMIT),
                error: isTrimmed
                  ? `文本已截断到前 ${TEXT_ATTACHMENT_LIMIT} 个字符。`
                  : undefined
              };
            } catch {
              return {
                ...base,
                kind: "text",
                error: "文件读取失败，无法注入到消息上下文。"
              };
            }
          }

          return base;
        })
      );

      if (blockedMessages.length) {
        const uniqueMessages = Array.from(new Set(blockedMessages));
        setErrorBanner(uniqueMessages.slice(0, 3).join("；"));
      }

      const accepted = nextAttachments.filter((attachment): attachment is DraftAttachment =>
        Boolean(attachment)
      );
      if (!accepted.length) {
        return;
      }
      setDraftAttachments((previous) => [...previous, ...accepted]);
    })();
  };

  const removeAttachment = (attachmentId: string) => {
    setDraftAttachments((previous) => {
      const target = previous.find((attachment) => attachment.id === attachmentId);
      if (target) {
        revokeAttachmentPreview(target);
      }
      return previous.filter((attachment) => attachment.id !== attachmentId);
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
    void sendFromBaseMessages(activeSession, baseMessages, editedMessage, false, false);
  };

  const sendFromBaseMessages = async (
    session: ChatSession,
    baseMessages: ChatMessage[],
    userMessage: ChatMessage,
    allowRetitle: boolean,
    shouldIngestPersona: boolean
  ) => {
    if (!isConfigured || isGenerating) {
      return;
    }

    setErrorBanner(null);

    const assistantMessage: ChatMessage = {
      id: createId(),
      role: "assistant",
      content: "",
      reasoningContent: "",
      createdAt: nowIso()
    };
    const nextMessages = [...baseMessages, userMessage, assistantMessage];
    const completionMessages = limitCompletionMessagesByTurns(
      sessionToCompletionMessages([...baseMessages, userMessage]),
      settings.chatContextWindow
    );
    const systemPrompt = settings.systemPrompt.trim();

    if (shouldIngestPersona) {
      void api.persona
        .ingestMessage({
          text: userMessage.content,
          createdAt: userMessage.createdAt
        })
        .catch((error) => {
          console.warn(
            "[persona][ingest] failed",
            error instanceof Error ? error.message : "unknown_error"
          );
        });
    }

    let environmentSystemContent: string | null = null;
    try {
      environmentSystemContent = await buildChatEnvironmentSystemMessage();
    } catch (error) {
      console.warn(
        "[chat][environment][injected] failed",
        error instanceof Error ? error.message : "unknown_error"
      );
      environmentSystemContent = null;
    }

    let soulMemoryContent: string | null = null;
    if (session.soulModeEnabled) {
      try {
        const payload = await api.persona.getInjectionPayload();
        soulMemoryContent = payload.block.trim() || null;
        if (payload.snapshot.warning) {
          console.warn("[persona][sync] warning", payload.snapshot.warning.message);
        }
      } catch (error) {
        console.warn(
          "[persona][injected] failed",
          error instanceof Error ? error.message : "unknown_error"
        );
        soulMemoryContent = null;
      }
    }

    const systemMessages: ChatStreamRequest["messages"] = [
      ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
      ...(environmentSystemContent
        ? [{ role: "system" as const, content: environmentSystemContent }]
        : []),
      ...(soulMemoryContent
        ? [{ role: "system" as const, content: soulMemoryContent }]
        : [])
    ];
    const messagesWithSystem = [...systemMessages, ...completionMessages];
    const submittedContextTokens = estimateTokensFromCompletionMessages(messagesWithSystem);

    upsertSession(session.id, (current) => {
      const shouldRetitle =
        allowRetitle && current.messages.length === 0 && current.title === "New Chat";
      return {
        ...current,
        title: shouldRetitle ? finalizeTitleFromPrompt(userMessage.content) : current.title,
        updatedAt: nowIso(),
        messages: nextMessages
      };
    });

    setDraft("");
    setIsGenerating(true);
    const streamModelUsageKey = toModelUsageKey(settings.activeProviderId, settings.model);

    try {
      const { streamId } = await api.chat.startStream({
        settings,
        messages: messagesWithSystem
      });

      const streamState: ActiveStream = {
        streamId,
        sessionId: session.id,
        assistantMessageId: assistantMessage.id,
        usageModelKey: streamModelUsageKey,
        usageSnapshot: { ...EMPTY_STREAM_USAGE_SNAPSHOT },
        hasUsageEvent: false,
        estimatedInputTokens: submittedContextTokens,
        estimatedOutputTokens: 0,
        pendingDelta: "",
        pendingReasoningDelta: "",
        flushTimeoutId: null,
        flushPending: () => {},
        unsubscribe: () => {}
      };

      const applyEstimatedUsageFallback = () => {
        if (streamState.hasUsageEvent) {
          return;
        }
        const totalTokens = streamState.estimatedInputTokens + streamState.estimatedOutputTokens;
        if (totalTokens <= 0) {
          return;
        }
        console.info("[usage][estimated]", {
          streamId: streamState.streamId,
          providerType: settings.providerType,
          model: settings.model,
          usage: {
            inputTokens: streamState.estimatedInputTokens,
            outputTokens: streamState.estimatedOutputTokens,
            totalTokens
          }
        });
        applyUsageDeltaToSession(streamState.sessionId, streamState.usageModelKey, {
          inputTokens: streamState.estimatedInputTokens,
          outputTokens: streamState.estimatedOutputTokens,
          totalTokens,
          cacheReadTokens: 0,
          cacheWriteTokens: 0
        });
        applyUsageToAssistantMessage(
          streamState.sessionId,
          streamState.assistantMessageId,
          {
            inputTokens: streamState.estimatedInputTokens,
            outputTokens: streamState.estimatedOutputTokens,
            totalTokens,
            cacheReadTokens: 0,
            cacheWriteTokens: 0
          },
          "estimated"
        );
      };

      const flushPendingDelta = () => {
        if (!streamState.pendingDelta && !streamState.pendingReasoningDelta) {
          return;
        }
        const chunk = streamState.pendingDelta;
        const reasoningChunk = streamState.pendingReasoningDelta;
        streamState.pendingDelta = "";
        streamState.pendingReasoningDelta = "";
        upsertSession(streamState.sessionId, (session) => ({
          ...session,
          updatedAt: nowIso(),
          messages: session.messages.map((message) =>
            message.id === streamState.assistantMessageId
              ? {
                  ...message,
                  content: `${message.content}${chunk}`,
                  reasoningContent: `${message.reasoningContent ?? ""}${reasoningChunk}`
                }
              : message
          )
        }));
      };
      streamState.flushPending = flushPendingDelta;

      const unsubscribe = api.chat.onStreamEvent(streamId, (event) => {
        if (event.type === "delta") {
          streamState.estimatedOutputTokens += estimateTokensFromText(event.delta);
          streamState.pendingDelta += event.delta;
          if (streamState.flushTimeoutId === null) {
            streamState.flushTimeoutId = window.setTimeout(() => {
              streamState.flushTimeoutId = null;
              flushPendingDelta();
            }, 24);
          }
          return;
        }
        if (event.type === "reasoning") {
          streamState.estimatedOutputTokens += estimateTokensFromText(event.delta);
          streamState.pendingReasoningDelta += event.delta;
          if (streamState.flushTimeoutId === null) {
            streamState.flushTimeoutId = window.setTimeout(() => {
              streamState.flushTimeoutId = null;
              flushPendingDelta();
            }, 24);
          }
          return;
        }
        if (event.type === "usage") {
          console.info("[usage][stream:event]", {
            streamId: streamState.streamId,
            providerType: settings.providerType,
            model: settings.model,
            usage: event.usage
          });
          streamState.hasUsageEvent = true;
          const { next, delta } = mergeUsageSnapshot(streamState.usageSnapshot, event.usage);
          streamState.usageSnapshot = next;
          applyUsageDeltaToSession(streamState.sessionId, streamState.usageModelKey, delta);
          applyUsageToAssistantMessage(
            streamState.sessionId,
            streamState.assistantMessageId,
            streamState.usageSnapshot,
            "provider"
          );
          return;
        }

        if (event.type === "error") {
          flushPendingDelta();
          applyEstimatedUsageFallback();
          removeAssistantPlaceholderIfEmpty(streamState.sessionId, streamState.assistantMessageId);
          setErrorBanner(event.message);
          finishActiveStream();
          return;
        }

        flushPendingDelta();
        applyEstimatedUsageFallback();
        removeAssistantPlaceholderIfEmpty(streamState.sessionId, streamState.assistantMessageId);
        finishActiveStream();
      });

      streamState.unsubscribe = unsubscribe;
      activeStreamRef.current = streamState;
    } catch (error) {
      removeAssistantPlaceholderIfEmpty(session.id, assistantMessage.id);
      setErrorBanner(error instanceof Error ? error.message : "Failed to start streaming.");
      setIsGenerating(false);
    }
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
    void sendFromBaseMessages(activeSession, baseMessages, userMessage, false, false);
  };

  const sendMessage = async (content: string) => {
    if (!activeSession || !isConfigured || isGenerating) {
      return;
    }

    const prompt = content.trim();
    const messageAttachments: ChatAttachment[] = draftAttachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      size: attachment.size,
      kind: attachment.kind,
      textContent: attachment.kind === "text" ? attachment.textContent : undefined,
      imageDataUrl: attachment.kind === "image" ? attachment.imageDataUrl : undefined
    }));
    const hasAnyAttachmentPayload = messageAttachments.some(hasAttachmentPayload);

    if (!prompt && !hasAnyAttachmentPayload) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: prompt,
      createdAt: nowIso(),
      attachments: messageAttachments.length ? messageAttachments : undefined
    };

    await sendFromBaseMessages(activeSession, activeSession.messages, userMessage, true, true);
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

  const sendAgentMessage = async () => {
    if (!activeAgentSession || isAgentRunning) {
      return;
    }

    const input = agentDraft.trim();
    if (!input) {
      return;
    }

    const runSettings = agentSettingsSnapshot;
    if (!runSettings) {
      setAgentErrorBanner("请先在 Settings 选择 Claude Agent SDK provider。");
      return;
    }

    let environmentSnapshot: EnvironmentSnapshot | undefined;
    if (settings.environment.enabled) {
      try {
        environmentSnapshot = (await refreshAgentEnvironmentSnapshot()) ?? undefined;
      } catch {
        environmentSnapshot = undefined;
      }
    }

    setAgentErrorBanner(null);

    const sessionId = activeAgentSession.id;
    const userMessage: AgentMessage = {
      id: createId(),
      sessionId,
      role: "user",
      content: input,
      createdAt: nowIso()
    };
    const assistantMessage: AgentMessage = {
      id: createId(),
      sessionId,
      role: "assistant",
      content: "",
      createdAt: nowIso()
    };

    upsertAgentMessages(sessionId, (messages) => [...messages, userMessage, assistantMessage]);
    if (activeAgentSession.title === "New Agent Session") {
      const nextTitle = input.length > 40 ? `${input.slice(0, 40)}...` : input;
      setAgentSessions((previous) =>
        previous.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                title: nextTitle,
                updatedAt: nowIso()
              }
            : session
        )
      );
    }
    setAgentDraft("");
    setAgentEnvironmentWeatherSummaryDraft("");
    agentEnvironmentWeatherSummaryDraftRef.current = "";
    setIsAgentRunning(true);

    try {
      const { runId } = await api.agent.sendMessage({
        sessionId,
        input,
        settings: runSettings,
        environmentSnapshot
      });

      const handleEnvelope = (payload: AgentStreamEnvelope) => {
        const streamEvent = payload.event;
        if (streamEvent.type === "text_delta") {
          upsertAgentMessages(sessionId, (messages) =>
            messages.map((message) =>
              message.id === assistantMessage.id
                ? { ...message, content: `${message.content}${streamEvent.text}` }
                : message
            )
          );
          return;
        }

        if (streamEvent.type === "text_complete") {
          upsertAgentMessages(sessionId, (messages) =>
            messages.map((message) =>
              message.id === assistantMessage.id
                ? message.content.endsWith(streamEvent.text)
                  ? message
                  : { ...message, content: `${message.content}${streamEvent.text}` }
                : message
            )
          );
          return;
        }

        if (streamEvent.type === "task_progress") {
          appendAgentSystemEvent(sessionId, `Progress: ${streamEvent.message}`);
          return;
        }

        if (streamEvent.type === "tool_start") {
          appendAgentSystemEvent(sessionId, `Tool start: ${streamEvent.toolName}`);
          return;
        }

        if (streamEvent.type === "tool_result") {
          appendAgentSystemEvent(sessionId, `Tool result: ${streamEvent.toolName}`);
          return;
        }

        if (streamEvent.type === "error") {
          setAgentErrorBanner(streamEvent.message);
          finishAgentRun();
          void loadAgentMessages(sessionId).catch(() => {});
          return;
        }

        finishAgentRun();
        void loadAgentMessages(sessionId).catch(() => {});
      };

      const unsubscribe = api.agent.onStreamEvent(runId, handleEnvelope);
      activeAgentRunRef.current = {
        runId,
        sessionId,
        assistantMessageId: assistantMessage.id,
        unsubscribe
      };
    } catch (error) {
      setIsAgentRunning(false);
      setAgentErrorBanner(error instanceof Error ? error.message : "Failed to start agent run.");
      void loadAgentMessages(sessionId).catch(() => {});
    }
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

  const sidebarWidth =
    !isCompactLayout || isSidebarOpen ? getResponsiveSidebarWidth(viewportWidth) : 0;

  const hasFileTransfer = (dataTransfer: DataTransfer | null) =>
    Boolean(dataTransfer && Array.from(dataTransfer.types).includes("Files"));

  const handleChatDragEnter: DragEventHandler<HTMLElement> = (event) => {
    if (activeView !== "chat" || !hasFileTransfer(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    chatDropDepthRef.current += 1;
    setIsChatDragOver(true);
  };

  const handleChatDragOver: DragEventHandler<HTMLElement> = (event) => {
    if (activeView !== "chat" || !hasFileTransfer(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isChatDragOver) {
      setIsChatDragOver(true);
    }
  };

  const handleChatDragLeave: DragEventHandler<HTMLElement> = (event) => {
    if (activeView !== "chat" || !hasFileTransfer(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    chatDropDepthRef.current = Math.max(0, chatDropDepthRef.current - 1);
    if (chatDropDepthRef.current === 0) {
      setIsChatDragOver(false);
    }
  };

  const handleChatDrop: DragEventHandler<HTMLElement> = (event) => {
    if (activeView !== "chat" || !hasFileTransfer(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    chatDropDepthRef.current = 0;
    setIsChatDragOver(false);
    addFiles(event.dataTransfer.files);
  };

  const sidebarContent =
    activeView === "chat" ? (
      <Sidebar
        mode="chat"
        sessions={orderedChatSessions}
        activeSessionId={activeSessionId}
        onSelectSession={(sessionId) => {
          setActiveSessionId(sessionId);
          closeSidebarIfCompact();
        }}
        onCreateSession={() => {
          createNewChat();
          closeSidebarIfCompact();
        }}
        onRenameSession={(sessionId, title) => renameChat(sessionId, title)}
        onDeleteSession={deleteChat}
        onTogglePinSession={toggleChatPin}
        onExportSession={exportSession}
        onExportSessionMarkdown={exportSessionMarkdown}
        onEnterAgent={() => {
          setActiveView("agent");
          closeSidebarIfCompact();
        }}
        onEnterSettings={() => openSettings("provider")}
      />
    ) : activeView === "agent" ? (
      <Sidebar
        mode="agent"
        sessions={agentSessions}
        activeSessionId={activeAgentSessionId}
        onSelectSession={(sessionId) => {
          setActiveAgentSessionId(sessionId);
          closeSidebarIfCompact();
        }}
        onCreateSession={() => {
          void createNewAgentSession();
          closeSidebarIfCompact();
        }}
        onRenameSession={(sessionId) => {
          void renameAgentSession(sessionId);
        }}
        onDeleteSession={(sessionId) => {
          void deleteAgentSession(sessionId);
        }}
        onEnterChat={() => {
          setActiveView("chat");
          closeSidebarIfCompact();
        }}
        onEnterSettings={() => openSettings("provider")}
      />
    ) : (
      <Sidebar
        mode="settings"
        settingsSection={activeSettingsSection}
        onSelectSettingsSection={(section) => {
          setActiveSettingsSection(section);
          closeSidebarIfCompact();
        }}
        onExitSettings={() => {
          setActiveView("chat");
          closeSidebarIfCompact();
        }}
      />
    );

  if (!isHydrated) {
    return (
      <div className="grid h-screen place-content-center bg-background text-muted-foreground">
        <div className="sketch-panel rounded-[8px] px-6 py-4 text-center">
          <p className="sketch-title text-[26px] uppercase leading-none text-primary sm:text-[34px]">Echo</p>
          <p className="mt-2 text-sm">Preparing your notebook...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell relative h-screen min-w-0 overflow-hidden bg-background px-2 py-2 sm:px-3 sm:py-3 md:px-4 md:py-4 lg:px-5 lg:py-5">
      <div className="app-window-drag-layer" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[120px] bg-gradient-to-b from-white/75 to-transparent dark:from-[#1d2533]/45" />
      <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-[#cfd8ea]/35 blur-3xl dark:bg-[#38506f]/25" />
      <div className="pointer-events-none absolute -bottom-20 right-6 h-80 w-80 rounded-full bg-[#dbe2f0]/30 blur-3xl dark:bg-[#3b4b64]/25" />

      <div
        className={`relative grid h-full transition-[grid-template-columns,gap] duration-300 ease-out ${
          isCompactLayout && !isSidebarOpen ? "gap-0" : "gap-2 md:gap-4"
        }`}
        style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)` }}
      >
        <div
          data-no-drag="true"
          className={`sketch-panel overflow-hidden rounded-[8px] transition-[transform,opacity] duration-300 ease-out ${
            isCompactLayout && !isSidebarOpen
              ? "-translate-x-[110%] opacity-0 pointer-events-none"
              : "translate-x-0 opacity-100"
          }`}
        >
          {sidebarContent}
        </div>

        <main
          data-no-drag="true"
          className={[
            "sketch-panel relative flex min-h-0 flex-col overflow-hidden rounded-[8px] border-2 transition-colors",
            activeView === "chat" && isChatDragOver
              ? "border-primary bg-accent/30"
              : "border-transparent"
          ].join(" ")}
          onDragEnter={handleChatDragEnter}
          onDragOver={handleChatDragOver}
          onDragLeave={handleChatDragLeave}
          onDrop={handleChatDrop}
        >
          {activeView === "chat" && isChatDragOver ? (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/40 backdrop-blur-[6px]">
              <div className="rounded-[10px] border border-primary/55 bg-card/78 px-6 py-3 text-sm font-medium text-primary shadow-[4px_4px_0_hsl(var(--border))]">
                松开鼠标即可添加附件
              </div>
            </div>
          ) : null}
          {activeView === "chat" ? (
            <>
              <header className="border-b border-border/85 bg-white/80 px-3 py-2 sm:px-4 sm:py-2.5 md:px-5 md:py-3 dark:bg-[#222c3d]/55">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-start gap-2">
                    {isCompactLayout ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2"
                        onClick={() => setIsSidebarOpen((previous) => !previous)}
                      >
                        <PanelLeft className="h-4 w-4" />
                        Menu
                      </Button>
                    ) : null}
                    <div>
                      <p className="sketch-title text-[22px] uppercase leading-none text-primary sm:text-[28px] md:text-[34px]">
                        Notebook Desk
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activeSession?.title ?? "New Chat"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={activeSession?.soulModeEnabled ? "default" : "outline"}
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={toggleSessionSoulMode}
                    >
                      灵魂模式: {activeSession?.soulModeEnabled ? "On" : "Off"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={toggleChatEnvironmentInjection}
                    >
                      环境注入: {settings.environment.enabled ? "On" : "Off"}
                    </Button>
                    <p className="rounded-[4px] border border-border/90 bg-card/70 px-2.5 py-1 text-xs text-muted-foreground">
                      {activeSession?.messages.length ?? 0} notes
                    </p>
                  </div>
                </div>
              </header>

              {removedSession || errorBanner ? (
                <div className="mx-auto mt-3 grid w-[min(900px,calc(100%-48px))] gap-3">
                  {removedSession ? (
                    <div className="flex items-center justify-between rounded-[6px] border border-border/90 bg-card px-3 py-2 text-foreground">
                      <span>Chat deleted.</span>
                      <Button
                        variant="ghost"
                        className="h-auto px-1 py-0.5 text-primary"
                        onClick={undoDelete}
                      >
                        Undo
                      </Button>
                    </div>
                  ) : null}

                  {errorBanner ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {errorBanner}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="h-full min-h-0 bg-card/40 pb-[112px] sm:pb-[128px] md:pb-[148px]">
                <ChatView
                  messages={activeSession?.messages ?? []}
                  isConfigured={isConfigured}
                  isGenerating={isGenerating}
                  onEditMessage={editMessage}
                  onDeleteMessage={deleteMessage}
                  onResendMessage={resendMessage}
                />
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#f5f8fe] via-[#f5f8fe]/95 to-transparent px-2 pb-2 pt-4 dark:from-[#20293a] dark:via-[#20293a]/94 sm:px-3 sm:pb-3 sm:pt-6 md:px-6 md:pb-4 md:pt-7">
                <div className="pointer-events-auto mx-auto w-full min-w-0 max-w-[980px]">
                  <AttachmentTray
                    attachments={draftAttachments}
                    onRemoveAttachment={removeAttachment}
                  />
                  <Composer
                    value={draft}
                    modelLabel={settings.model || "Model"}
                    modelValue={activeComposerModelValue}
                    modelOptions={composerModelOptions}
                    modelCapabilities={activeModelCapabilities}
                    sendWithEnter={settings.sendWithEnter}
                    chatContextWindow={settings.chatContextWindow}
                    attachmentCount={draftAttachments.length}
                    onAddFiles={addFiles}
                    onChangeChatContextWindow={updateChatContextWindow}
                    onSelectModel={selectComposerModel}
                    onChange={setDraft}
                    onSubmit={(value) => {
                      void sendMessage(value);
                    }}
                    onStop={() => {
                      void stopGenerating();
                    }}
                    usageLabel={composerUsageLabel}
                    disabled={!isConfigured}
                    isGenerating={isGenerating}
                  />
                </div>
              </div>
            </>
          ) : activeView === "agent" ? (
            <>
              <header className="border-b border-border/85 bg-white/80 px-3 py-2 sm:px-4 sm:py-2.5 md:px-5 md:py-3 dark:bg-[#222c3d]/55">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-start gap-2">
                    {isCompactLayout ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 px-2"
                        onClick={() => setIsSidebarOpen((previous) => !previous)}
                      >
                        <PanelLeft className="h-4 w-4" />
                        Menu
                      </Button>
                    ) : null}
                    <div>
                      <p className="sketch-title text-[22px] uppercase leading-none text-primary sm:text-[28px] md:text-[34px]">
                        Agent Desk
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {activeAgentSession?.title ?? "New Agent Session"}
                      </p>
                    </div>
                  </div>
                  <p className="rounded-[4px] border border-border/90 bg-card/70 px-2.5 py-1 text-xs text-muted-foreground">
                    {activeAgentMessages.length} events
                  </p>
                </div>
              </header>

              {agentErrorBanner ? (
                <div className="mx-auto mt-3 w-[min(900px,calc(100%-48px))]">
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {agentErrorBanner}
                  </div>
                </div>
              ) : null}

              {!isAgentConfigured ? (
                <div className="mx-auto mt-3 w-[min(900px,calc(100%-48px))]">
                  <div className="rounded-[6px] border border-border/90 bg-card px-3 py-2 text-sm text-muted-foreground">
                    请在 Settings 选择 `Claude Agent SDK` provider 并配置 API Key / Model。
                  </div>
                </div>
              ) : null}

              <div className="h-full min-h-0 bg-card/40 pb-[332px]">
                <AgentView messages={activeAgentMessages} isRunning={isAgentRunning} />
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#f5f8fe] via-[#f5f8fe]/95 to-transparent px-2 pb-2 pt-4 dark:from-[#20293a] dark:via-[#20293a]/94 sm:px-3 sm:pb-3 sm:pt-6 md:px-6 md:pb-4 md:pt-7">
                <div className="pointer-events-auto mx-auto w-full min-w-0 max-w-[980px] rounded-[8px] border border-border/85 bg-card/90 p-3 shadow-[3px_3px_0_hsl(var(--border))]">
                  {settings.environment.enabled ? (
                    <div className="mb-3 rounded-[6px] border border-border/70 bg-background/60 px-3 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                          Environment Context
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => {
                              void refreshAgentEnvironmentSnapshot();
                            }}
                            disabled={isAgentEnvironmentRefreshing}
                          >
                            {isAgentEnvironmentRefreshing ? "Refreshing..." : "Refresh"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => setIsAgentEnvironmentExpanded((previous) => !previous)}
                          >
                            {isAgentEnvironmentExpanded ? "Hide" : "Show"}
                          </Button>
                        </div>
                      </div>

                      {isAgentEnvironmentExpanded ? (
                        <div className="mt-2 space-y-2 border-t border-border/55 pt-2">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                                City
                              </label>
                              <Input
                                value={agentEnvironmentCityDraft}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setAgentEnvironmentCityDraft(nextValue);
                                  agentEnvironmentCityDraftRef.current = nextValue;
                                }}
                                placeholder={settings.environment.city || "e.g. San Francisco"}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                                Weather Summary Override
                              </label>
                              <Input
                                value={agentEnvironmentWeatherSummaryDraft}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setAgentEnvironmentWeatherSummaryDraft(nextValue);
                                  agentEnvironmentWeatherSummaryDraftRef.current = nextValue;
                                }}
                                placeholder="Optional, e.g. light rain"
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>

                          <div className="rounded-[6px] border border-border/60 bg-card/60 px-2.5 py-2 text-xs text-muted-foreground">
                            <p>
                              Time: {agentEnvironmentSnapshot?.time.date ?? "--"}{" "}
                              {agentEnvironmentSnapshot?.time.time ?? "--"} (
                              {agentEnvironmentSnapshot?.time.timezone ?? "--"})
                            </p>
                            <p>City: {agentEnvironmentSnapshot?.location.city || "(not set)"}</p>
                            <p>
                              Weather:{" "}
                              {formatEnvironmentWeatherLabel(
                                agentEnvironmentSnapshot?.weather,
                                settings.environment.temperatureUnit
                              )}
                            </p>
                            <p>
                              Network:{" "}
                              {agentEnvironmentSnapshot?.device.network
                                ? `${agentEnvironmentSnapshot.device.network.online ? "online" : "offline"}${agentEnvironmentSnapshot.device.network.effectiveType ? ` (${agentEnvironmentSnapshot.device.network.effectiveType})` : ""}`
                                : "n/a"}
                            </p>
                            <p>Battery: {formatEnvironmentBatteryLabel(agentEnvironmentSnapshot)}</p>
                            <p>Device: {agentEnvironmentSnapshot?.device.type ?? "unknown"}</p>
                            <p>System: {formatEnvironmentSystemLabel(agentEnvironmentSnapshot)}</p>
                            <p>Chip: {formatEnvironmentChipLabel(agentEnvironmentSnapshot)}</p>
                            <p>Memory: {formatEnvironmentMemoryLabel(agentEnvironmentSnapshot)}</p>
                            <p>Storage: {formatEnvironmentStorageLabel(agentEnvironmentSnapshot)}</p>
                            <p>CWD: {agentEnvironmentSnapshot?.cwd || "(default)"}</p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mb-3 rounded-[6px] border border-dashed border-border/65 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                      Environment context is disabled. Enable it in Settings {" > "} Chat.
                    </div>
                  )}

                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                      {agentSettingsSnapshot?.model || "Agent model"}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          void stopAgentRun();
                        }}
                        disabled={!isAgentRunning}
                      >
                        Stop
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          void sendAgentMessage();
                        }}
                        disabled={!isAgentConfigured || isAgentRunning || !agentDraft.trim()}
                      >
                        Send
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={agentDraft}
                    onChange={(event) => setAgentDraft(event.target.value)}
                    placeholder="给 Agent 下达任务，例如：重构设置页并补充测试。"
                    disabled={!isAgentConfigured || isAgentRunning}
                    className="min-h-[96px] resize-none"
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing || event.keyCode === 229) {
                        return;
                      }

                      if (!settings.sendWithEnter) {
                        return;
                      }
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendAgentMessage();
                      }
                    }}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <header className="border-b border-border/85 bg-white/80 px-3 py-2 sm:px-4 sm:py-2.5 md:px-5 md:py-3 dark:bg-[#222c3d]/55">
                <div className="flex items-start gap-2">
                  {isCompactLayout ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 px-2"
                      onClick={() => setIsSidebarOpen((previous) => !previous)}
                    >
                      <PanelLeft className="h-4 w-4" />
                      Menu
                    </Button>
                  ) : null}
                  <div>
                    <p className="sketch-title text-[22px] uppercase leading-none text-primary sm:text-[28px] md:text-[34px]">
                      Settings Ledger
                    </p>
                    <p className="text-xs text-muted-foreground">Tune providers and behavior controls</p>
                  </div>
                </div>
              </header>
              <SettingsCenter
                section={activeSettingsSection}
                settings={settings}
                onSave={saveSettings}
                onTest={testConnection}
                onListModels={listModels}
                onExportSessions={exportSessions}
                onImportSessions={importSessions}
                onClearSessions={clearAllSessions}
                onResetSettings={resetSettings}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
};
