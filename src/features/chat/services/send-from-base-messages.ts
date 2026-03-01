import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  EMPTY_STREAM_USAGE_SNAPSHOT,
  createId,
  estimateTokensFromCompletionMessages,
  estimateTokensFromText,
  finalizeTitleFromPrompt,
  limitCompletionMessagesByTurns,
  mergeUsageSnapshot,
  nowIso,
  sessionToCompletionMessages,
  toModelUsageKey,
  type StreamUsageSnapshot
} from "../../../lib/app-chat-utils";
import type { MuApi } from "../../../lib/mu-api";
import type {
  AppliedSkillMeta,
  AppSettings,
  ChatMessage,
  ChatMessageUsage,
  ChatSession,
  ChatStreamRequest,
  ToolCall
} from "../../../shared/contracts";

export type SendFromBaseMessagesOptions = {
  completionMessagesOverride?: ChatStreamRequest["messages"];
  assistantAppliedSkill?: AppliedSkillMeta;
};

export type ChatActiveStream = {
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
  pendingStatusEvents: ToolCall[];
  flushTimeoutId: number | null;
  flushPending: () => void;
  unsubscribe: () => void;
  stoppedByUser: boolean;
};

type SendFromBaseMessagesServiceParams = {
  session: ChatSession;
  baseMessages: ChatMessage[];
  userMessage: ChatMessage;
  allowRetitle: boolean;
  options?: SendFromBaseMessagesOptions;
  isConfigured: boolean;
  isGenerating: boolean;
  settings: AppSettings;
  api: MuApi;
  activeStreamRef: MutableRefObject<ChatActiveStream | null>;
  setDraft: Dispatch<SetStateAction<string>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  setErrorBanner: Dispatch<SetStateAction<string | null>>;
  buildChatEnvironmentSystemMessage: () => Promise<string | null>;
  upsertSession: (sessionId: string, mutate: (session: ChatSession) => ChatSession) => void;
  applyUsageDeltaToSession: (
    sessionId: string,
    modelUsageKey: string,
    delta: StreamUsageSnapshot
  ) => void;
  applyUsageToAssistantMessage: (
    sessionId: string,
    assistantMessageId: string,
    usage: StreamUsageSnapshot,
    source: ChatMessageUsage["source"]
  ) => void;
  removeAssistantPlaceholderIfEmpty: (sessionId: string, messageId: string) => void;
  finishActiveStream: () => void;
  persistObservedModelCapability: (
    providerId: string,
    modelIdRaw: string,
    field: "imageInput" | "audioInput" | "videoInput" | "reasoningDisplay"
  ) => void;
};

export const sendFromBaseMessagesService = async ({
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
}: SendFromBaseMessagesServiceParams) => {
  if (!isConfigured || isGenerating) {
    return;
  }

  setErrorBanner(null);

  const assistantMessage: ChatMessage = {
    id: createId(),
    role: "assistant",
    content: "",
    reasoningContent: "",
    toolCalls: [],
    appliedSkill: options?.assistantAppliedSkill,
    createdAt: nowIso()
  };
  const nextMessages = [...baseMessages, userMessage, assistantMessage];
  const completionMessages = limitCompletionMessagesByTurns(
    options?.completionMessagesOverride ?? sessionToCompletionMessages([...baseMessages, userMessage]),
    settings.chatContextWindow
  );
  const systemPrompt = settings.systemPrompt.trim();

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

  let memosMemoryContent: string | null = null;
  if (settings.memos.enabled && userMessage.content.trim()) {
    try {
      const result = await api.memos.searchMemory({
        settings,
        query: userMessage.content,
        conversationId: "echo-global-memory"
      });
      if (result.ok && result.memories.length) {
        const memoryLines = result.memories.slice(0, settings.memos.topK).map((item) => `- ${item}`);
        memosMemoryContent = ["<memos_memory>", ...memoryLines, "</memos_memory>"].join("\n");
      } else if (!result.ok) {
        console.warn("[memos][search] failed", result.message);
      }
    } catch (error) {
      console.warn("[memos][search] failed", error instanceof Error ? error.message : "unknown_error");
      memosMemoryContent = null;
    }
  }

  const systemMessages: ChatStreamRequest["messages"] = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...(environmentSystemContent ? [{ role: "system" as const, content: environmentSystemContent }] : []),
    ...(memosMemoryContent ? [{ role: "system" as const, content: memosMemoryContent }] : [])
  ];
  const messagesWithSystem = [...systemMessages, ...completionMessages];
  const submittedContextTokens = estimateTokensFromCompletionMessages(messagesWithSystem);

  upsertSession(session.id, (current) => {
    const shouldRetitle = allowRetitle && current.messages.length === 0 && current.title === "New Chat";
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
  const streamProviderId = settings.activeProviderId;
  const streamModelId = settings.model;
  let assistantResponseText = "";

  try {
    const { streamId } = await api.chat.startStream({
      settings,
      messages: messagesWithSystem,
      enabledMcpServerIds: session.enabledMcpServers ?? []
    });

    const streamState: ChatActiveStream = {
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
      pendingStatusEvents: [],
      flushTimeoutId: null,
      flushPending: () => {},
      unsubscribe: () => {},
      stoppedByUser: false
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
      if (
        !streamState.pendingDelta &&
        !streamState.pendingReasoningDelta &&
        !streamState.pendingStatusEvents.length
      ) {
        return;
      }
      const chunk = streamState.pendingDelta;
      const reasoningChunk = streamState.pendingReasoningDelta;
      const statusEvents = streamState.pendingStatusEvents;
      streamState.pendingDelta = "";
      streamState.pendingReasoningDelta = "";
      streamState.pendingStatusEvents = [];
      upsertSession(streamState.sessionId, (current) => ({
        ...current,
        updatedAt: nowIso(),
        messages: current.messages.map((message) =>
          message.id === streamState.assistantMessageId
            ? {
                ...message,
                content: `${message.content}${chunk}`,
                reasoningContent: `${message.reasoningContent ?? ""}${reasoningChunk}`,
                toolCalls: [...(message.toolCalls ?? []), ...statusEvents]
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
        assistantResponseText += event.delta;
        if (streamState.flushTimeoutId === null) {
          streamState.flushTimeoutId = window.setTimeout(() => {
            streamState.flushTimeoutId = null;
            flushPendingDelta();
          }, 24);
        }
        return;
      }
      if (event.type === "reasoning") {
        if (event.delta.trim()) {
          persistObservedModelCapability(streamProviderId, streamModelId, "reasoningDisplay");
        }
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
      if (event.type === "status") {
        streamState.pendingStatusEvents.push(event.toolCall);
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
      if (!streamState.stoppedByUser && settings.memos.enabled) {
        void api.memos
          .addMessage({
            settings,
            conversationId: "echo-global-memory",
            userMessage: userMessage.content,
            assistantMessage: assistantResponseText
          })
          .then((result) => {
            if (!result.ok) {
              console.warn("[memos][add] failed", result.message);
            }
          })
          .catch((error) => {
            console.warn("[memos][add] failed", error instanceof Error ? error.message : "unknown_error");
          });
      }
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
