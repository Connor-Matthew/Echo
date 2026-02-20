import { useEffect, useMemo, useRef, useState, type DragEventHandler } from "react";
import { PanelLeft } from "lucide-react";
import { AgentView } from "./components/AgentView";
import { ChatView } from "./components/ChatView";
import { Composer, type ComposerAttachment } from "./components/Composer";
import { SettingsCenter } from "./components/SettingsCenter";
import { Sidebar, type SettingsSection } from "./components/Sidebar";
import { Button } from "./components/ui/button";
import { Textarea } from "./components/ui/textarea";
import { getMuApi } from "./lib/mu-api";
import { resolveProviderModelCapabilities } from "./lib/model-capabilities";
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
  type ChatMessage,
  type ChatSession,
  type ChatStreamRequest,
  type ConnectionTestResult
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

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const nowIso = () => new Date().toISOString();
const TEXT_ATTACHMENT_LIMIT = 60000;
const IMAGE_ATTACHMENT_LIMIT = 5 * 1024 * 1024;
const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".xml",
  ".yaml",
  ".yml",
  ".log"
]);
const TEXT_ATTACHMENT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/x-yaml",
  "text/csv"
]);
const AUDIO_ATTACHMENT_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"]);
const VIDEO_ATTACHMENT_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"]);
const COMPOSER_MODEL_DELIMITER = "::";
const SIDEBAR_AUTO_HIDE_WIDTH = 800;
const SIDEBAR_MIN_WIDTH = 228;
const SIDEBAR_MAX_WIDTH = 322;
const SIDEBAR_FULL_WIDTH_AT = 1400;

const getCurrentViewportWidth = () =>
  typeof window === "undefined" ? SIDEBAR_AUTO_HIDE_WIDTH + 1 : window.innerWidth;

const getResponsiveSidebarWidth = (viewportWidth: number) => {
  const widthRange = SIDEBAR_FULL_WIDTH_AT - SIDEBAR_AUTO_HIDE_WIDTH;
  if (widthRange <= 0) {
    return SIDEBAR_MAX_WIDTH;
  }

  const progress = (viewportWidth - SIDEBAR_AUTO_HIDE_WIDTH) / widthRange;
  const normalizedProgress = Math.min(Math.max(progress, 0), 1);
  return Math.round(
    SIDEBAR_MIN_WIDTH + (SIDEBAR_MAX_WIDTH - SIDEBAR_MIN_WIDTH) * normalizedProgress
  );
};

const encodeComposerModelOption = (providerId: string, modelId: string) =>
  `${encodeURIComponent(providerId)}${COMPOSER_MODEL_DELIMITER}${encodeURIComponent(modelId)}`;

const decodeComposerModelOption = (rawValue: string) => {
  const [encodedProviderId, ...encodedModelParts] = rawValue.split(COMPOSER_MODEL_DELIMITER);
  if (!encodedProviderId || !encodedModelParts.length) {
    return null;
  }

  try {
    const providerId = decodeURIComponent(encodedProviderId);
    const modelId = decodeURIComponent(encodedModelParts.join(COMPOSER_MODEL_DELIMITER)).trim();
    if (!providerId || !modelId) {
      return null;
    }
    return { providerId, modelId };
  } catch {
    return null;
  }
};

const getExtension = (name: string) => {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
};

const isTextAttachment = (file: File) => {
  if (file.type.startsWith("text/") || TEXT_ATTACHMENT_MIME_TYPES.has(file.type)) {
    return true;
  }
  return TEXT_ATTACHMENT_EXTENSIONS.has(getExtension(file.name));
};

const isAudioAttachment = (file: File) =>
  file.type.startsWith("audio/") || AUDIO_ATTACHMENT_EXTENSIONS.has(getExtension(file.name));

const isVideoAttachment = (file: File) =>
  file.type.startsWith("video/") || VIDEO_ATTACHMENT_EXTENSIONS.has(getExtension(file.name));

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("Failed to read file as data URL."));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file."));
    };
    reader.readAsDataURL(file);
  });

const hasAttachmentPayload = (attachment: ChatAttachment) => {
  if (attachment.kind === "text") {
    return Boolean(attachment.textContent?.trim());
  }
  if (attachment.kind === "image") {
    return Boolean(attachment.imageDataUrl?.trim());
  }
  return true;
};

const revokeAttachmentPreview = (attachment: { previewUrl?: string }) => {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
};

const createSession = (title = "New Chat"): ChatSession => {
  const now = nowIso();
  return {
    id: createId(),
    title,
    createdAt: now,
    updatedAt: now,
    messages: []
  };
};

const sessionToCompletionMessages = (messages: ChatMessage[]): ChatStreamRequest["messages"] =>
  messages
    .map((message) => {
      const attachments = (message.attachments ?? []).filter(hasAttachmentPayload);
      return {
        role: message.role,
        content: message.content,
        attachments: attachments.length ? attachments : undefined
      };
    })
    .filter((message) => Boolean(message.content.trim()) || Boolean(message.attachments?.length));

const finalizeTitleFromPrompt = (prompt: string) => {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "New Chat";
  }
  return trimmed.length > 34 ? `${trimmed.slice(0, 34)}...` : trimmed;
};

const ensureSessions = (value: ChatSession[]) => (value.length ? value : [createSession()]);

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
        const nextSessions = savedSessions.length ? savedSessions : [createSession()];
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

  const renameChat = (sessionId: string) => {
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
    upsertSession(sessionId, (session) => ({ ...session, title, updatedAt: nowIso() }));
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

  const addFiles = (files: FileList | null) => {
    if (!files || !files.length) {
      return;
    }

    void (async () => {
      const blockedMessages: string[] = [];
      const nextAttachments = await Promise.all(
        Array.from(files).map(async (file): Promise<DraftAttachment | null> => {
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
    void sendFromBaseMessages(activeSession, baseMessages, editedMessage, false);
  };

  const sendFromBaseMessages = async (
    session: ChatSession,
    baseMessages: ChatMessage[],
    userMessage: ChatMessage,
    allowRetitle: boolean
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
    const completionMessages = sessionToCompletionMessages([...baseMessages, userMessage]);
    const systemPrompt = settings.systemPrompt.trim();
    const messagesWithSystem = systemPrompt
      ? [{ role: "system" as const, content: systemPrompt }, ...completionMessages]
      : completionMessages;

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

    try {
      const { streamId } = await api.chat.startStream({
        settings,
        messages: messagesWithSystem
      });

      const streamState: ActiveStream = {
        streamId,
        sessionId: session.id,
        assistantMessageId: assistantMessage.id,
        pendingDelta: "",
        pendingReasoningDelta: "",
        flushTimeoutId: null,
        flushPending: () => {},
        unsubscribe: () => {}
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
          streamState.pendingReasoningDelta += event.delta;
          if (streamState.flushTimeoutId === null) {
            streamState.flushTimeoutId = window.setTimeout(() => {
              streamState.flushTimeoutId = null;
              flushPendingDelta();
            }, 24);
          }
          return;
        }

        if (event.type === "error") {
          flushPendingDelta();
          removeAssistantPlaceholderIfEmpty(streamState.sessionId, streamState.assistantMessageId);
          setErrorBanner(event.message);
          finishActiveStream();
          return;
        }

        flushPendingDelta();
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
    void sendFromBaseMessages(activeSession, baseMessages, userMessage, false);
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

    await sendFromBaseMessages(activeSession, activeSession.messages, userMessage, true);
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
    setIsAgentRunning(true);

    try {
      const { runId } = await api.agent.sendMessage({
        sessionId,
        input,
        settings: runSettings
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
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(sessionId) => {
          setActiveSessionId(sessionId);
          closeSidebarIfCompact();
        }}
        onCreateSession={() => {
          createNewChat();
          closeSidebarIfCompact();
        }}
        onRenameSession={renameChat}
        onDeleteSession={deleteChat}
        onEnterAgent={() => {
          setActiveView("agent");
          closeSidebarIfCompact();
        }}
        onEnterSettings={() => {
          setActiveSettingsSection("provider");
          setActiveView("settings");
          closeSidebarIfCompact();
        }}
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
        onEnterSettings={() => {
          setActiveSettingsSection("provider");
          setActiveView("settings");
          closeSidebarIfCompact();
        }}
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
                  <p className="rounded-[4px] border border-border/90 bg-card/70 px-2.5 py-1 text-xs text-muted-foreground">
                    {activeSession?.messages.length ?? 0} notes
                  </p>
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
                  <Composer
                    value={draft}
                    modelLabel={settings.model || "Model"}
                    modelValue={activeComposerModelValue}
                    modelOptions={composerModelOptions}
                    modelCapabilities={activeModelCapabilities}
                    sendWithEnter={settings.sendWithEnter}
                    attachments={draftAttachments}
                    onAddFiles={addFiles}
                    onRemoveAttachment={removeAttachment}
                    onSelectModel={selectComposerModel}
                    onChange={setDraft}
                    onSubmit={(value) => {
                      void sendMessage(value);
                    }}
                    onStop={() => {
                      void stopGenerating();
                    }}
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

              <div className="h-full min-h-0 bg-card/40 pb-[168px]">
                <AgentView messages={activeAgentMessages} isRunning={isAgentRunning} />
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#f5f8fe] via-[#f5f8fe]/95 to-transparent px-2 pb-2 pt-4 dark:from-[#20293a] dark:via-[#20293a]/94 sm:px-3 sm:pb-3 sm:pt-6 md:px-6 md:pb-4 md:pt-7">
                <div className="pointer-events-auto mx-auto w-full min-w-0 max-w-[980px] rounded-[8px] border border-border/85 bg-card/90 p-3 shadow-[3px_3px_0_hsl(var(--border))]">
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
