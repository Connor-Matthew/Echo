import { useEffect, useMemo, useRef, useState } from "react";
import { ChatView } from "./components/ChatView";
import { Composer, type ComposerAttachment } from "./components/Composer";
import { SettingsCenter } from "./components/SettingsCenter";
import { Sidebar, type SettingsSection } from "./components/Sidebar";
import { Button } from "./components/ui/button";
import { getMuApi } from "./lib/mu-api";
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
  flushTimeoutId: number | null;
  flushPending: () => void;
  unsubscribe: () => void;
};

type DraftAttachment = ComposerAttachment & {
  mimeType: string;
  textContent?: string;
};

type AppView = "chat" | "settings";

const api = getMuApi();

const suggestionPrompts = [
  "Build a classic Snake game in this repo.",
  "Create a one-page PDF that summarizes this app.",
  "Create a plan to improve onboarding in this project."
];

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const nowIso = () => new Date().toISOString();
const TEXT_ATTACHMENT_LIMIT = 60000;
const TEXT_ATTACHMENT_EXTENSIONS = new Set([".md", ".txt"]);
const COMPOSER_MODEL_DELIMITER = "::";

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
  if (file.type === "text/plain" || file.type === "text/markdown") {
    return true;
  }
  return TEXT_ATTACHMENT_EXTENSIONS.has(getExtension(file.name));
};

const revokeAttachmentPreview = (attachment: { previewUrl?: string }) => {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
};

const createSession = (title = "New thread"): ChatSession => {
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
      if (message.role !== "user") {
        return { role: message.role, content: message.content };
      }

      const textAttachments = (message.attachments ?? []).filter(
        (attachment) => attachment.kind === "text" && Boolean(attachment.textContent?.trim())
      );
      if (!textAttachments.length) {
        return { role: message.role, content: message.content };
      }

      const attachmentBlocks = textAttachments
        .map(
          (attachment) =>
            `[Attachment: ${attachment.name}]\n${attachment.textContent?.trim() ?? ""}`
        )
        .join("\n\n");
      const mergedContent = message.content.trim()
        ? `${message.content}\n\n${attachmentBlocks}`
        : attachmentBlocks;

      return { role: message.role, content: mergedContent };
    })
    .filter((message) => Boolean(message.content.trim()));

const finalizeTitleFromPrompt = (prompt: string) => {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "New thread";
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
  const [isHydrated, setIsHydrated] = useState(false);
  const [removedSession, setRemovedSession] = useState<RemovedSession | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const activeStreamRef = useRef<ActiveStream | null>(null);
  const removedTimeoutRef = useRef<number | null>(null);
  const draftAttachmentsRef = useRef<DraftAttachment[]>([]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [sessions, activeSessionId]
  );

  const activeProvider = useMemo(
    () =>
      settings.providers.find((provider) => provider.id === settings.activeProviderId) ??
      settings.providers[0],
    [settings.activeProviderId, settings.providers]
  );

  const isConfigured = Boolean(
    (activeProvider?.enabled ?? true) &&
      settings.baseUrl.trim() &&
      settings.apiKey.trim() &&
      settings.model.trim()
  );

  const composerModelOptions = useMemo(() => {
    const seen = new Set<string>();
    return settings.providers.flatMap((provider) => {
      const selectedModels = Array.from(
        new Set(
          (Array.isArray(provider.savedModels) ? provider.savedModels : [])
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
    if (!activeProvider?.id || !modelId) {
      return "";
    }
    return encodeComposerModelOption(activeProvider.id, modelId);
  }, [activeProvider?.id, settings.model]);

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
      if (!target || target.role !== "assistant" || target.content.trim()) {
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

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const [savedSettings, savedSessions] = await Promise.all([
          api.settings.get(),
          api.sessions.get()
        ]);
        if (cancelled) {
          return;
        }

        const nextSessions = savedSessions.length ? savedSessions : [createSession()];
        setSettings(savedSettings);
        setSessions(nextSessions);
        setActiveSessionId(nextSessions[0].id);
      } catch (error) {
        if (!cancelled) {
          setErrorBanner(
            error instanceof Error ? error.message : "Failed to initialize application."
          );
          const fallback = createSession();
          setSessions([fallback]);
          setActiveSessionId(fallback.id);
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
    return () => {
      finishActiveStream();
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

  const createNewThread = () => {
    const session = createSession();
    setSessions((previous) => [session, ...previous]);
    setActiveSessionId(session.id);
    setDraft("");
    clearDraftAttachments();
  };

  const renameThread = (sessionId: string) => {
    const target = sessions.find((session) => session.id === sessionId);
    if (!target) {
      return;
    }
    const input = window.prompt("Rename thread", target.title);
    if (!input) {
      return;
    }
    const title = input.trim();
    if (!title) {
      return;
    }
    upsertSession(sessionId, (session) => ({ ...session, title, updatedAt: nowIso() }));
  };

  const deleteThread = (sessionId: string) => {
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

    const nextSettings = normalizeSettings({
      ...settings,
      activeProviderId: providerId,
      providers: settings.providers.map((provider) =>
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

    setSettings(nextSettings);
    void api.settings.save(nextSettings).catch((error) => {
      setErrorBanner(error instanceof Error ? error.message : "Failed to save model selection.");
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

  const resetSettings = async () => {
    await saveSettings(DEFAULT_SETTINGS);
  };

  const addFiles = (files: FileList | null) => {
    if (!files || !files.length) {
      return;
    }

    void (async () => {
      const nextAttachments = await Promise.all(
        Array.from(files).map(async (file): Promise<DraftAttachment> => {
          const base: DraftAttachment = {
            id: createId(),
            name: file.name,
            size: file.size,
            kind: "file",
            mimeType: file.type || "application/octet-stream"
          };

          if (file.type.startsWith("image/")) {
            return {
              ...base,
              kind: "image",
              previewUrl: URL.createObjectURL(file),
              error: "图片当前仅预览和存档，不会发送给模型。"
            };
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

          return {
            ...base,
            error: "当前先支持 md/txt 解析；该文件不会发送给模型。"
          };
        })
      );

      setDraftAttachments((previous) => [...previous, ...nextAttachments]);
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
    const hasTextPayload = nextAttachments.some(
      (attachment) => attachment.kind === "text" && Boolean(attachment.textContent?.trim())
    );
    if (!trimmedContent && !hasTextPayload) {
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
        allowRetitle && current.messages.length === 0 && current.title === "New thread";
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
        flushTimeoutId: null,
        flushPending: () => {},
        unsubscribe: () => {}
      };

      const flushPendingDelta = () => {
        if (!streamState.pendingDelta) {
          return;
        }
        const chunk = streamState.pendingDelta;
        streamState.pendingDelta = "";
        upsertSession(streamState.sessionId, (session) => ({
          ...session,
          updatedAt: nowIso(),
          messages: session.messages.map((message) =>
            message.id === streamState.assistantMessageId
              ? { ...message, content: `${message.content}${chunk}` }
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
      textContent: attachment.kind === "text" ? attachment.textContent : undefined
    }));
    const hasTextPayload = messageAttachments.some(
      (attachment) => attachment.kind === "text" && Boolean(attachment.textContent?.trim())
    );

    if (!prompt && !hasTextPayload) {
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

  if (!isHydrated) {
    return (
      <div className="grid h-screen place-content-center bg-background text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="app-shell relative h-screen min-w-[1100px] overflow-hidden bg-[#e8edf4] p-4">
      <div className="app-window-drag-layer" aria-hidden />
      <div className="pointer-events-none absolute -top-20 left-1/4 h-72 w-72 rounded-full bg-[#c8dcff]/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-12 h-80 w-80 rounded-full bg-[#c9ece9]/45 blur-3xl" />

      <div className="relative grid h-full grid-cols-[290px_minmax(760px,1fr)] gap-4">
        <div
          data-no-drag="true"
          className="overflow-hidden rounded-[28px] border border-white/60 bg-white/45 shadow-[0_14px_34px_rgba(15,23,42,0.08)] backdrop-blur-xl animate-rise-fade"
        >
          {activeView === "chat" ? (
            <Sidebar
              mode="chat"
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={setActiveSessionId}
              onCreateSession={createNewThread}
              onRenameSession={renameThread}
              onDeleteSession={deleteThread}
              onEnterSettings={() => {
                setActiveSettingsSection("provider");
                setActiveView("settings");
              }}
            />
          ) : (
            <Sidebar
              mode="settings"
              settingsSection={activeSettingsSection}
              onSelectSettingsSection={setActiveSettingsSection}
              onExitSettings={() => setActiveView("chat")}
            />
          )}
        </div>

        <main
          data-no-drag="true"
          className="relative min-h-0 overflow-hidden rounded-[30px] border border-white/70 bg-white/58 shadow-[0_20px_46px_rgba(15,23,42,0.12)] backdrop-blur-xl animate-rise-fade-delayed"
        >
          {activeView === "chat" ? (
            <>
              {removedSession || errorBanner ? (
                <div className="mx-auto mt-3 grid w-[min(900px,calc(100%-64px))] gap-3">
                  {removedSession ? (
                    <div className="flex items-center justify-between rounded-xl border border-[#dbe5f0] bg-[#f8fbff] px-3 py-2 text-[#2f4157]">
                      <span>Thread deleted.</span>
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

              <div className="h-full min-h-0 pb-[200px]">
                <ChatView
                  messages={activeSession?.messages ?? []}
                  isConfigured={isConfigured}
                  isGenerating={isGenerating}
                  suggestionPrompts={suggestionPrompts}
                  onSelectSuggestion={setDraft}
                  onEditMessage={editMessage}
                  onDeleteMessage={deleteMessage}
                  onResendMessage={resendMessage}
                />
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#edf3f9] via-[#edf3f9]/95 to-transparent px-8 pb-6 pt-12">
                <div className="pointer-events-auto mx-auto w-full max-w-[980px]">
                  <Composer
                    value={draft}
                    modelLabel={settings.model || "Model"}
                    modelValue={activeComposerModelValue}
                    modelOptions={composerModelOptions}
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
          ) : (
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
          )}
        </main>
      </div>
    </div>
  );
};
