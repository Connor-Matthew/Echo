import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  buildAgentToolRenderItems,
  buildClampedToolAnchorGroups,
  hasPendingToolInRenderItems,
  isProgressToolCall
} from "./chat/agent-tool-render-helpers";
import { AgentToolItems } from "./chat/agent-tool-items";
import { MessageActionBar } from "./chat/message-action-bar";
import { MessageAttachmentList } from "./chat/message-attachment-list";
import { MessageEditPanel } from "./chat/message-edit-panel";
import { MarkdownContent } from "./chat/message-markdown-content";
import { MessageReasoningPanel } from "./chat/message-reasoning-panel";
import { MessageToolCallsPanel } from "./chat/message-tool-calls-panel";
import { MessageUsageStats } from "./chat/message-usage-stats";
import { useChatScrollFollow } from "./chat/use-chat-scroll-follow";
import { useStreamRevealedContent } from "./chat/use-stream-revealed-content";
import type { ChatAttachment, ChatMessage } from "../shared/contracts";

type EditAttachment = ChatAttachment & {
  previewUrl?: string;
  error?: string;
};

const cloneMessageAttachments = (attachments?: ChatAttachment[]): EditAttachment[] =>
  (attachments ?? []).map((attachment) => ({ ...attachment }));

type PermissionRequest = {
  runId: string;
  sessionId: string;
  requestId: string;
  toolName?: string;
  reason?: string;
  blockedPath?: string;
  supportsAlwaysAllow?: boolean;
  resolving?: boolean;
};

type ChatViewProps = {
  sessionId: string;
  messages: ChatMessage[];
  isConfigured: boolean;
  isGenerating: boolean;
  mode?: "chat" | "agent";
  permissionRequest?: PermissionRequest | null;
  onResolvePermission?: (
    request: PermissionRequest,
    decision: "approved" | "denied",
    applySuggestions: boolean
  ) => void;
  onEditMessage: (
    message: ChatMessage,
    nextContent: string,
    nextAttachments: ChatAttachment[]
  ) => void;
  onDeleteMessage: (message: ChatMessage) => void;
  onResendMessage: (message: ChatMessage) => void;
};

type MessageBubbleProps = {
  message: ChatMessage;
  isGenerating: boolean;
  activeGeneratingAssistantId?: string | null;
  mode: "chat" | "agent";
  permissionRequest?: PermissionRequest | null;
  onResolvePermission?: (
    request: PermissionRequest,
    decision: "approved" | "denied",
    applySuggestions: boolean
  ) => void;
  onEditMessage: (
    message: ChatMessage,
    nextContent: string,
    nextAttachments: ChatAttachment[]
  ) => void;
  onDeleteMessage: (message: ChatMessage) => void;
  onResendMessage: (message: ChatMessage) => void;
};

const TEXT_ATTACHMENT_LIMIT = 60000;
const IMAGE_ATTACHMENT_LIMIT = 5 * 1024 * 1024;
const AGENT_GROUP_DONE_COLLAPSE_DELAY_MS = 700;
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

const formatBytes = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const formatTokenCount = (value: number) => {
  const formatCompact = (raw: number, suffix: "k" | "m") => {
    const fixed = raw.toFixed(1);
    return `${fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed}${suffix}`;
  };
  if (value >= 1_000_000) {
    return formatCompact(value / 1_000_000, "m");
  }
  if (value >= 1_000) {
    return formatCompact(value / 1_000, "k");
  }
  return `${Math.round(value)}`;
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

const toMessageAttachment = (attachment: EditAttachment): ChatAttachment => ({
  id: attachment.id,
  name: attachment.name,
  mimeType: attachment.mimeType,
  size: attachment.size,
  kind: attachment.kind,
  textContent: attachment.kind === "text" ? attachment.textContent : undefined,
  imageDataUrl: attachment.kind === "image" ? attachment.imageDataUrl : undefined
});

const revokeAttachmentPreview = (attachment: EditAttachment) => {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
};

const MessageBubble = ({
  message,
  isGenerating,
  activeGeneratingAssistantId,
  mode,
  permissionRequest,
  onResolvePermission,
  onEditMessage,
  onDeleteMessage,
  onResendMessage
}: MessageBubbleProps) => {
  const isUser = message.role === "user";
  const isAgentMode = mode === "agent";
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [editAttachments, setEditAttachments] = useState<EditAttachment[]>(
    cloneMessageAttachments(message.attachments)
  );
  const [isDragOverEdit, setIsDragOverEdit] = useState(false);
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(false);
  const [isMcpEventsExpanded, setIsMcpEventsExpanded] = useState(true);
  const [expandedAgentResultIds, setExpandedAgentResultIds] = useState<Record<string, boolean>>({});
  const [expandedAgentGroupIds, setExpandedAgentGroupIds] = useState<Record<string, boolean>>({});
  const displayedContent = useStreamRevealedContent({
    content: message.content,
    role: message.role
  });
  const editAttachmentsRef = useRef<EditAttachment[]>(editAttachments);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousGroupPendingMapRef = useRef<Record<string, boolean>>({});
  const agentGroupCollapseTimersRef = useRef<Record<string, number>>({});

  const clearAgentGroupCollapseTimer = (groupId: string) => {
    const timerId = agentGroupCollapseTimersRef.current[groupId];
    if (typeof timerId === "number") {
      window.clearTimeout(timerId);
      delete agentGroupCollapseTimersRef.current[groupId];
    }
  };

  const scheduleAgentGroupCollapse = (groupId: string) => {
    clearAgentGroupCollapseTimer(groupId);
    agentGroupCollapseTimersRef.current[groupId] = window.setTimeout(() => {
      setExpandedAgentGroupIds((current) => {
        if (!(groupId in current) || current[groupId] === false) {
          return current;
        }
        return {
          ...current,
          [groupId]: false
        };
      });
      delete agentGroupCollapseTimersRef.current[groupId];
    }, AGENT_GROUP_DONE_COLLAPSE_DELAY_MS);
  };

  useEffect(() => {
    editAttachmentsRef.current = editAttachments;
  }, [editAttachments]);

  const resetEditState = () => {
    setIsDragOverEdit(false);
    setEditDraft(message.content);
    setEditAttachments((previous) => {
      previous.forEach(revokeAttachmentPreview);
      return cloneMessageAttachments(message.attachments);
    });
  };

  useEffect(() => {
    if (!isEditing) {
      resetEditState();
    }
  }, [message.content, message.attachments, isEditing]);

  useEffect(() => {
    setExpandedAgentResultIds({});
    setExpandedAgentGroupIds({});
    previousGroupPendingMapRef.current = {};
    Object.values(agentGroupCollapseTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    agentGroupCollapseTimersRef.current = {};
  }, [message.id]);

  useEffect(() => {
    return () => {
      editAttachmentsRef.current.forEach(revokeAttachmentPreview);
      Object.values(agentGroupCollapseTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      agentGroupCollapseTimersRef.current = {};
    };
  }, []);

  const copyMessage = async () => {
    const content = isUser ? message.content : displayedContent;
    if (!content.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      setCopied(false);
    }
  };

  const saveEdit = () => {
    const next = editDraft.trim();
    const hasAnyAttachmentPayload = editAttachments.some((attachment) => {
      if (attachment.kind === "text") {
        return Boolean(attachment.textContent?.trim());
      }
      if (attachment.kind === "image") {
        return Boolean(attachment.imageDataUrl?.trim());
      }
      return true;
    });
    const currentAttachments = message.attachments ?? [];
    const nextMessageAttachments = editAttachments.map(toMessageAttachment);
    const attachmentsChanged =
      JSON.stringify(nextMessageAttachments) !== JSON.stringify(currentAttachments);

    if (!next && !hasAnyAttachmentPayload) {
      setIsEditing(false);
      resetEditState();
      return;
    }

    if (next === message.content && !attachmentsChanged) {
      setIsEditing(false);
      resetEditState();
      return;
    }
    editAttachments.forEach(revokeAttachmentPreview);
    setIsDragOverEdit(false);
    onEditMessage(message, next, nextMessageAttachments);
    setIsEditing(false);
  };

  const attachments = message.attachments ?? [];
  const hasReasoning = !isUser && Boolean(message.reasoningContent?.trim());
  const hasMcpEvents = !isUser && Boolean(message.toolCalls?.length);
  const agentToolCalls = isAgentMode && !isUser ? message.toolCalls ?? [] : [];
  const agentProgressCalls = agentToolCalls.filter(isProgressToolCall);
  const agentExecutionCalls = agentToolCalls.filter((toolCall) => !isProgressToolCall(toolCall));
  const agentToolRenderItems = buildAgentToolRenderItems(agentToolCalls);
  const activePendingExecutionCall = [...agentExecutionCalls]
    .reverse()
    .find((toolCall) => toolCall.status === "pending");
  const activePendingProgressCall = [...agentProgressCalls]
    .reverse()
    .find((toolCall) => toolCall.status === "pending");
  const isCurrentGeneratingAssistant = Boolean(
    !isUser && isGenerating && activeGeneratingAssistantId === message.id
  );
  const shouldShowAgentToolSection = isAgentMode && !isUser && hasMcpEvents;
  const assistantVisibleContent = isUser ? message.content : displayedContent;

  const clampedGroups = shouldShowAgentToolSection
    ? buildClampedToolAnchorGroups(agentToolRenderItems, assistantVisibleContent.length)
    : [];

  const shouldRenderAgentToolInline = clampedGroups.length > 0;
  const nonInlineGroupId = "standalone";
  const groupPendingMap = useMemo<Record<string, boolean>>(() => {
    if (!shouldShowAgentToolSection) {
      return {};
    }
    if (shouldRenderAgentToolInline) {
      return clampedGroups.reduce<Record<string, boolean>>((acc, group) => {
        acc[group.key] = hasPendingToolInRenderItems(group.items);
        return acc;
      }, {});
    }
    return {
      [nonInlineGroupId]: hasPendingToolInRenderItems(agentToolRenderItems)
    };
  }, [agentToolRenderItems, clampedGroups, shouldRenderAgentToolInline, shouldShowAgentToolSection]);

  const toggleAgentResultDetail = (toolCallId: string) => {
    setExpandedAgentResultIds((previous) => ({
      ...previous,
      [toolCallId]: !previous[toolCallId]
    }));
  };

  const toggleAgentGroupDetail = (groupId: string) => {
    setExpandedAgentGroupIds((previous) => ({
      ...previous,
      [groupId]: !(previous[groupId] ?? false)
    }));
  };

  useEffect(() => {
    if (!isAgentMode && isCurrentGeneratingAssistant && hasMcpEvents) {
      setIsMcpEventsExpanded(true);
    }
  }, [hasMcpEvents, isAgentMode, isCurrentGeneratingAssistant]);

  useEffect(() => {
    if (!shouldShowAgentToolSection) {
      previousGroupPendingMapRef.current = {};
      Object.values(agentGroupCollapseTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      agentGroupCollapseTimersRef.current = {};
      return;
    }

    const previousPendingMap = previousGroupPendingMapRef.current;
    const justCompletedGroupIds: string[] = [];
    setExpandedAgentGroupIds((current) => {
      let changed = false;
      const next = { ...current };

      for (const [groupId, isPending] of Object.entries(groupPendingMap)) {
        const wasPending = previousPendingMap[groupId];
        if (isPending && wasPending !== true && next[groupId] !== true) {
          clearAgentGroupCollapseTimer(groupId);
          next[groupId] = true;
          changed = true;
        }
        if (!isPending && wasPending === true) {
          justCompletedGroupIds.push(groupId);
          if (next[groupId] !== true) {
            next[groupId] = true;
            changed = true;
          }
        }
        if (isPending) {
          clearAgentGroupCollapseTimer(groupId);
        }
      }

      for (const groupId of Object.keys(next)) {
        if (!(groupId in groupPendingMap)) {
          clearAgentGroupCollapseTimer(groupId);
          delete next[groupId];
          changed = true;
        }
      }

      return changed ? next : current;
    });
    justCompletedGroupIds.forEach((groupId) => scheduleAgentGroupCollapse(groupId));
    previousGroupPendingMapRef.current = groupPendingMap;
  }, [groupPendingMap, shouldShowAgentToolSection]);

  const assistantUsage =
    !isCurrentGeneratingAssistant &&
    !isUser &&
    message.usage &&
    ((message.usage.inputTokens ?? 0) > 0 ||
      (message.usage.outputTokens ?? 0) > 0 ||
      (message.usage.cacheReadTokens ?? 0) > 0 ||
      (message.usage.cacheWriteTokens ?? 0) > 0)
      ? message.usage
      : null;

  const addEditFiles = (files: FileList | null) => {
    if (!files?.length) {
      return;
    }
    void (async () => {
      const next = await Promise.all(
        Array.from(files).map(async (file): Promise<EditAttachment> => {
          const base: EditAttachment = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            kind: "file"
          };

          if (file.type.startsWith("image/")) {
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

          if (isTextAttachment(file)) {
            try {
              const content = await file.text();
              const isTrimmed = content.length > TEXT_ATTACHMENT_LIMIT;
              return {
                ...base,
                kind: "text",
                textContent: content.slice(0, TEXT_ATTACHMENT_LIMIT),
                error: isTrimmed ? `文本已截断到前 ${TEXT_ATTACHMENT_LIMIT} 个字符。` : undefined
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
      setEditAttachments((previous) => [...previous, ...next]);
    })();
  };

  const removeEditAttachment = (attachmentId: string) => {
    setEditAttachments((previous) => {
      const target = previous.find((attachment) => attachment.id === attachmentId);
      if (target) {
        revokeAttachmentPreview(target);
      }
      return previous.filter((attachment) => attachment.id !== attachmentId);
    });
  };

  return (
    <div className={`group paper-message-enter flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex flex-none flex-col ${
          isUser ? "max-w-[78%] items-end sm:max-w-[70%] lg:max-w-[62%]" : "w-full max-w-[620px] items-start"
        }`}
      >
        {isUser && isEditing ? (
          <MessageEditPanel
            isDragOver={isDragOverEdit}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setIsDragOverEdit(true);
            }}
            onDragLeave={() => setIsDragOverEdit(false)}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsDragOverEdit(false);
              addEditFiles(event.dataTransfer.files);
            }}
            fileInputRef={fileInputRef}
            onFileInputChange={addEditFiles}
            editDraft={editDraft}
            onChangeDraft={setEditDraft}
            editAttachments={editAttachments}
            formatBytes={formatBytes}
            onRemoveAttachment={removeEditAttachment}
            onOpenFilePicker={() => fileInputRef.current?.click()}
            onCancel={() => {
              setIsEditing(false);
              resetEditState();
            }}
            onSave={saveEdit}
            isGenerating={isGenerating}
          />
        ) : (
          <div
            className={[
              "inline-block w-fit max-w-full break-words transition-opacity duration-150",
              isUser
                ? "rounded-md border border-border/80 bg-secondary px-3 py-2 sm:px-3.5"
                : "rounded-md border border-transparent bg-transparent px-1 py-1"
            ].join(" ")}
          >
            {!isUser && message.appliedSkill ? (
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-sm leading-none">{message.appliedSkill.icon}</span>
                <span className="text-[11px] font-medium text-primary/80">{message.appliedSkill.name}</span>
                <span className="text-[11px] text-muted-foreground">/{message.appliedSkill.command}</span>
              </div>
            ) : null}
            {!isAgentMode && isCurrentGeneratingAssistant && (() => {
              const pendingTool = [...(message.toolCalls ?? [])].reverse().find((tc) => tc.status === "pending");
              return pendingTool ? (
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex gap-[3px]">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="inline-block h-1 w-1 rounded-full bg-muted-foreground/60"
                        style={{ animation: `mcpDot 1.2s ease-in-out ${i * 0.2}s infinite` }}
                      />
                    ))}
                  </span>
                  <span>
                    [{pendingTool.serverName}] {pendingTool.toolName}
                  </span>
                </div>
              ) : null;
            })()}
            {hasMcpEvents && !isAgentMode ? (
              <MessageToolCallsPanel
                toolCalls={message.toolCalls ?? []}
                isExpanded={isMcpEventsExpanded}
                onToggle={() => setIsMcpEventsExpanded((previous) => !previous)}
              />
            ) : null}
            {hasReasoning ? (
              <MessageReasoningPanel
                isExpanded={isReasoningExpanded}
                onToggle={() => setIsReasoningExpanded((previous) => !previous)}
              >
                <MarkdownContent content={message.reasoningContent ?? ""} isUser={false} />
              </MessageReasoningPanel>
            ) : null}
            <div>
              {assistantVisibleContent ? (
                shouldRenderAgentToolInline ? (
                  <>
                    {(() => {
                      const segments: ReactNode[] = [];
                      let cursor = 0;
                      for (let i = 0; i < clampedGroups.length; i++) {
                        const group = clampedGroups[i];
                        const textSlice = assistantVisibleContent.slice(cursor, group.offset);
                        if (textSlice) {
                          segments.push(
                            <MarkdownContent key={`text-${i}`} content={textSlice} isUser={isUser} />
                          );
                        }
                        segments.push(
                          <div key={`tools-${i}`} className={i > 0 ? "mt-1" : ""}>
                            <AgentToolItems
                              items={group.items}
                              groupId={group.key}
                              isLastGroup={i === clampedGroups.length - 1}
                              expandedAgentGroupIds={expandedAgentGroupIds}
                              expandedAgentResultIds={expandedAgentResultIds}
                              isCurrentGeneratingAssistant={isCurrentGeneratingAssistant}
                              activePendingExecutionCall={activePendingExecutionCall}
                              activePendingProgressCall={activePendingProgressCall}
                              permissionRequest={permissionRequest}
                              onResolvePermission={onResolvePermission}
                              onToggleGroupDetail={toggleAgentGroupDetail}
                              onToggleResultDetail={toggleAgentResultDetail}
                            />
                          </div>
                        );
                        cursor = group.offset;
                      }
                      const tail = assistantVisibleContent.slice(cursor);
                      if (tail) {
                        segments.push(
                          <div key="text-tail" className="mt-1">
                            <MarkdownContent content={tail} isUser={isUser} />
                          </div>
                        );
                      }
                      return segments;
                    })()}
                  </>
                ) : (
                  <MarkdownContent content={assistantVisibleContent} isUser={isUser} />
                )
              ) : (
                <span className="text-muted-foreground">Generating...</span>
              )}
            </div>
            {shouldShowAgentToolSection && !shouldRenderAgentToolInline
              ? (
                  <AgentToolItems
                    items={agentToolRenderItems}
                    groupId={nonInlineGroupId}
                    expandedAgentGroupIds={expandedAgentGroupIds}
                    expandedAgentResultIds={expandedAgentResultIds}
                    isCurrentGeneratingAssistant={isCurrentGeneratingAssistant}
                    activePendingExecutionCall={activePendingExecutionCall}
                    activePendingProgressCall={activePendingProgressCall}
                    permissionRequest={permissionRequest}
                    onResolvePermission={onResolvePermission}
                    onToggleGroupDetail={toggleAgentGroupDetail}
                    onToggleResultDetail={toggleAgentResultDetail}
                  />
                )
              : null}
          </div>
        )}

        <MessageAttachmentList attachments={attachments} isUser={isUser} />
        <MessageUsageStats usage={assistantUsage} formatTokenCount={formatTokenCount} />

        <MessageActionBar
          isUser={isUser}
          isAgentMode={isAgentMode}
          isGenerating={isGenerating}
          copied={copied}
          message={message}
          onCopy={() => {
            void copyMessage();
          }}
          onStartEditing={() => setIsEditing(true)}
          onResendMessage={onResendMessage}
          onDeleteMessage={onDeleteMessage}
        />
      </div>
      {isUser ? (
        <div className="grid h-7 w-7 place-content-center rounded-md border border-border/80 bg-accent/55 text-[10px] font-semibold tracking-wide text-foreground">
          U
        </div>
      ) : null}
    </div>
  );
};

export const ChatView = ({
  sessionId,
  messages,
  isConfigured,
  isGenerating,
  mode = "chat",
  permissionRequest,
  onResolvePermission,
  onEditMessage,
  onDeleteMessage,
  onResendMessage
}: ChatViewProps) => {
  const { scrollContainerRef, scrollContentRef, activeGeneratingAssistantId } = useChatScrollFollow({
    sessionId,
    messages,
    isConfigured,
    isGenerating
  });

  if (!isConfigured) {
    return (
      <section className="paper-conversation-stage mx-auto flex h-full w-full items-center justify-center px-4 py-6 sm:px-5 sm:py-7 md:px-6 md:py-8">
        <div className="rounded-lg border border-border/75 bg-card px-6 py-6 text-center sm:px-8 sm:py-7 md:px-10 md:py-8">
          <h2 className="text-[28px] font-semibold leading-none text-foreground sm:text-[36px] md:text-[42px]">
            Hello, Echo
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            请在左下角 Settings 完成渠道配置
          </p>
        </div>
      </section>
    );
  }

  if (!messages.length) {
    return (
      <section className="paper-conversation-stage mx-auto flex h-full w-full items-center justify-center px-4 py-6 text-center sm:px-5 sm:py-7 md:px-6 md:py-8">
        <div>
          <p className="mb-4 inline-flex items-center rounded-md border border-border/70 bg-card px-3 py-1 text-xs text-muted-foreground">
            New conversation
          </p>
          <h2 className="text-[28px] font-semibold leading-[1.2] text-foreground sm:text-[34px] md:text-[38px]">
            Start with a clear prompt
          </h2>
          <p className="mx-auto mt-3 max-w-[520px] text-sm text-muted-foreground sm:text-base">
            提问越具体，结果越稳定。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={scrollContainerRef}
      className="paper-conversation-stage mx-auto h-full w-full max-w-[760px] overflow-auto px-4 py-5 sm:px-5 sm:py-6 md:px-6 md:py-7"
    >
      <div ref={scrollContentRef} className="grid gap-3.5 sm:gap-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isGenerating={isGenerating}
            activeGeneratingAssistantId={activeGeneratingAssistantId}
            mode={mode}
            permissionRequest={permissionRequest}
            onResolvePermission={onResolvePermission}
            onEditMessage={onEditMessage}
            onDeleteMessage={onDeleteMessage}
            onResendMessage={onResendMessage}
          />
        ))}
      </div>
    </section>
  );
};
