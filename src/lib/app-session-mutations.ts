import type { ChatMessageUsage, ChatSession } from "../shared/contracts";
import type { StreamUsageSnapshot } from "./app-chat-utils";

export const upsertSessionById = (
  sessions: ChatSession[],
  sessionId: string,
  mutate: (session: ChatSession) => ChatSession
) => sessions.map((session) => (session.id === sessionId ? mutate(session) : session));

const hasUsageDelta = (delta: StreamUsageSnapshot) =>
  delta.inputTokens > 0 ||
  delta.outputTokens > 0 ||
  delta.totalTokens > 0 ||
  delta.cacheReadTokens > 0 ||
  delta.cacheWriteTokens > 0;

export const applyUsageDeltaToSession = (
  session: ChatSession,
  modelUsageKey: string,
  delta: StreamUsageSnapshot,
  nowIso: () => string
): ChatSession => {
  if (!modelUsageKey || !hasUsageDelta(delta)) {
    return session;
  }

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
};

export const applyUsageToAssistantMessage = (
  session: ChatSession,
  assistantMessageId: string,
  usage: StreamUsageSnapshot,
  source: ChatMessageUsage["source"]
): ChatSession => ({
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
});

export const removeAssistantPlaceholderIfEmpty = (
  session: ChatSession,
  messageId: string,
  nowIso: () => string
): ChatSession => {
  const target = session.messages.find((message) => message.id === messageId);
  if (
    !target ||
    target.role !== "assistant" ||
    target.content.trim() ||
    target.reasoningContent?.trim() ||
    (target.toolCalls?.length ?? 0) > 0
  ) {
    return session;
  }
  return {
    ...session,
    updatedAt: nowIso(),
    messages: session.messages.filter((message) => message.id !== messageId)
  };
};
