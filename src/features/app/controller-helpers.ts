import {
  inferModelCapabilities,
  toModelCapabilityKey
} from "../../domain/model/capabilities";
import { type AppSettings } from "../../shared/contracts";
import { normalizeSettings } from "../../domain/settings/normalize";
import type { AgentMessage, AgentStreamEnvelope } from "../../shared/agent-contracts";

export type PendingAgentPermission = {
  runId: string;
  sessionId: string;
  requestId: string;
  toolName?: string;
  reason?: string;
  blockedPath?: string;
  supportsAlwaysAllow: boolean;
  resolving: boolean;
  createdAt: string;
};

export const withPersistedAutoDetectedCapabilities = (source: AppSettings): AppSettings => {
  const modelId = source.model.trim();
  if (!modelId) {
    return source;
  }

  const activeProvider =
    source.providers.find((provider) => provider.id === source.activeProviderId) ??
    source.providers[0];
  if (!activeProvider) {
    return source;
  }

  const capabilityKey = toModelCapabilityKey(modelId);
  if (!capabilityKey) {
    return source;
  }

  const inferred = inferModelCapabilities(activeProvider.providerType, modelId);
  const hasDetectedSignal =
    inferred.imageInput || inferred.audioInput || inferred.videoInput || inferred.reasoningDisplay;
  const stored = activeProvider.modelCapabilities?.[capabilityKey];
  if (!stored) {
    if (!hasDetectedSignal) {
      return source;
    }
    return normalizeSettings({
      ...source,
      providers: source.providers.map((provider) =>
        provider.id === activeProvider.id
          ? {
              ...provider,
              modelCapabilities: {
                ...(provider.modelCapabilities ?? {}),
                [capabilityKey]: inferred
              }
            }
          : provider
      )
    });
  }

  const isLegacyAllDisabled =
    stored.textInput !== false &&
    !stored.imageInput &&
    !stored.audioInput &&
    !stored.videoInput &&
    !stored.reasoningDisplay;
  if (!isLegacyAllDisabled || !hasDetectedSignal) {
    return source;
  }

  const promoted = {
    ...stored,
    imageInput: stored.imageInput || inferred.imageInput,
    audioInput: stored.audioInput || inferred.audioInput,
    videoInput: stored.videoInput || inferred.videoInput,
    reasoningDisplay: stored.reasoningDisplay || inferred.reasoningDisplay
  };
  if (
    promoted.imageInput === stored.imageInput &&
    promoted.audioInput === stored.audioInput &&
    promoted.videoInput === stored.videoInput &&
    promoted.reasoningDisplay === stored.reasoningDisplay
  ) {
    return source;
  }

  return normalizeSettings({
    ...source,
    providers: source.providers.map((provider) =>
      provider.id === activeProvider.id
        ? {
            ...provider,
            modelCapabilities: {
              ...(provider.modelCapabilities ?? {}),
              [capabilityKey]: promoted
            }
          }
        : provider
    )
  });
};

export const mergeRuntimeAgentMessageDecorations = (
  incomingMessages: AgentMessage[],
  previousMessages: AgentMessage[]
) => {
  if (!previousMessages.length) {
    return incomingMessages;
  }

  const messageIdByRunRole = new Map<string, string>();
  const toolCallsByMessageId = new Map<string, NonNullable<AgentMessage["toolCalls"]>>();
  const toolCallsByRunId = new Map<string, NonNullable<AgentMessage["toolCalls"]>>();
  const contentByMessageId = new Map<string, string>();
  const contentByRunId = new Map<string, string>();

  for (const previousMessage of previousMessages) {
    if (previousMessage.runId) {
      messageIdByRunRole.set(`${previousMessage.runId}:${previousMessage.role}`, previousMessage.id);
    }
    if (previousMessage.role !== "assistant") {
      continue;
    }
    if (previousMessage.toolCalls?.length) {
      toolCallsByMessageId.set(previousMessage.id, previousMessage.toolCalls);
      if (previousMessage.runId) {
        toolCallsByRunId.set(previousMessage.runId, previousMessage.toolCalls);
      }
    }
    if (previousMessage.content) {
      contentByMessageId.set(previousMessage.id, previousMessage.content);
      if (previousMessage.runId) {
        contentByRunId.set(previousMessage.runId, previousMessage.content);
      }
    }
  }

  return incomingMessages.map((message) => {
    const stableMessageId = message.runId
      ? messageIdByRunRole.get(`${message.runId}:${message.role}`)
      : undefined;

    if (message.role !== "assistant") {
      if (!stableMessageId || stableMessageId === message.id) {
        return message;
      }
      return {
        ...message,
        id: stableMessageId
      };
    }

    const matchedToolCalls =
      !message.toolCalls?.length
        ? (toolCallsByMessageId.get(message.id) ??
            (message.runId ? toolCallsByRunId.get(message.runId) : undefined))
        : undefined;
    const matchedContent =
      !message.content
        ? (contentByMessageId.get(message.id) ??
            (message.runId ? contentByRunId.get(message.runId) : undefined))
        : undefined;
    if (
      !matchedToolCalls?.length &&
      !matchedContent &&
      (!stableMessageId || stableMessageId === message.id)
    ) {
      return message;
    }
    return {
      ...message,
      ...(stableMessageId && stableMessageId !== message.id ? { id: stableMessageId } : {}),
      ...(matchedContent ? { content: matchedContent } : {}),
      ...(matchedToolCalls?.length ? { toolCalls: matchedToolCalls.map((toolCall) => ({ ...toolCall })) } : {})
    };
  });
};

export const removeAgentPermissionQueueItems = (
  queue: PendingAgentPermission[],
  payload: {
    runId?: string;
    sessionId?: string;
    requestId?: string;
  }
) =>
  queue.filter((item) => {
    if (payload.runId && item.runId !== payload.runId) {
      return true;
    }
    if (payload.sessionId && item.sessionId !== payload.sessionId) {
      return true;
    }
    if (payload.requestId && item.requestId !== payload.requestId) {
      return true;
    }
    return false;
  });

export const enqueueAgentPermissionFromEnvelope = (
  queue: PendingAgentPermission[],
  payload: AgentStreamEnvelope
) => {
  if (payload.event.type !== "permission_request") {
    return queue;
  }
  const event = payload.event;
  const exists = queue.some(
    (item) => item.runId === payload.runId && item.requestId === event.requestId
  );
  if (exists) {
    return queue;
  }
  return [
    ...queue,
    {
      runId: payload.runId,
      sessionId: payload.sessionId,
      requestId: event.requestId,
      toolName: event.toolName,
      reason: event.reason,
      blockedPath: event.blockedPath,
      supportsAlwaysAllow: Boolean(event.supportsAlwaysAllow),
      resolving: false,
      createdAt: payload.timestamp
    }
  ];
};

export const markAgentPermissionResolving = (
  queue: PendingAgentPermission[],
  request: Pick<PendingAgentPermission, "runId" | "requestId">,
  resolving: boolean
) =>
  queue.map((item) =>
    item.runId === request.runId && item.requestId === request.requestId
      ? { ...item, resolving }
      : item
  );

export const buildAgentPermissionResolutionMessage = (
  decision: "approved" | "denied",
  applySuggestions: boolean
) =>
  decision === "approved"
    ? applySuggestions
      ? "Approved by user (always allow)."
      : "Approved by user (once)."
    : "Denied by user.";

export const normalizeIncomingDraftFiles = (files: FileList | File[] | null): File[] => {
  if (!files) {
    return [];
  }
  return Array.isArray(files) ? files : Array.from(files);
};

export const summarizeBlockedAttachmentMessages = (blockedMessages: string[]) => {
  if (!blockedMessages.length) {
    return "";
  }
  return Array.from(new Set(blockedMessages))
    .slice(0, 3)
    .join("；");
};

export const removeAttachmentById = <T extends { id: string }>(
  attachments: T[],
  attachmentId: string
) => {
  const removed = attachments.find((attachment) => attachment.id === attachmentId);
  return {
    removed,
    next: attachments.filter((attachment) => attachment.id !== attachmentId)
  };
};
