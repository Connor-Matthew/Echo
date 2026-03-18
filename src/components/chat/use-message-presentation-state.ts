import { useEffect, useMemo, useRef, useState } from "react";
import { hasPendingToolInRenderItems } from "./agent-tool-render-helpers";
import type {
  MessageFrameHandlers,
  MessagePresentationActions,
  MessagePresentationStateSnapshot,
  MessageRenderContext
} from "./conversation-types";
import {
  AGENT_GROUP_DONE_COLLAPSE_DELAY_MS,
  IMAGE_ATTACHMENT_LIMIT,
  TEXT_ATTACHMENT_LIMIT,
  cloneMessageAttachments,
  isTextAttachment,
  readFileAsDataUrl,
  revokeAttachmentPreview,
  toMessageAttachment
} from "./message-presentation-helpers";

const buildGroupPendingMap = (renderContext: MessageRenderContext) => {
  if (!renderContext.shouldShowAgentToolSection) {
    return {};
  }
  if (renderContext.shouldRenderAgentToolInline) {
    return renderContext.clampedGroups.reduce<Record<string, boolean>>((acc, group) => {
      acc[group.key] = hasPendingToolInRenderItems(group.items);
      return acc;
    }, {});
  }
  return {
    standalone: hasPendingToolInRenderItems(renderContext.agentToolRenderItems)
  };
};

type UseMessagePresentationStateParams = {
  renderContext: MessageRenderContext;
  handlers: Pick<MessageFrameHandlers, "onEditMessage">;
};

export const useMessagePresentationState = ({
  renderContext,
  handlers
}: UseMessagePresentationStateParams): {
  state: MessagePresentationStateSnapshot;
  actions: MessagePresentationActions;
} => {
  const { message, mode, displayedContent, isUser } = renderContext;
  const isAgentMode = mode === "agent";
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [editAttachments, setEditAttachments] = useState(cloneMessageAttachments(message.attachments));
  const [isDragOverEdit, setIsDragOverEdit] = useState(false);
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(false);
  const [isMcpEventsExpanded, setIsMcpEventsExpanded] = useState(true);
  const [expandedAgentResultIds, setExpandedAgentResultIds] = useState<Record<string, boolean>>({});
  const [expandedAgentGroupIds, setExpandedAgentGroupIds] = useState<Record<string, boolean>>({});
  const editAttachmentsRef = useRef(editAttachments);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousGroupPendingMapRef = useRef<Record<string, boolean>>({});
  const agentGroupCollapseTimersRef = useRef<Record<string, number>>({});
  const copyTimerRef = useRef<number | null>(null);

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
  }, [isEditing, message.attachments, message.content]);

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
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const groupPendingMap = useMemo(
    () => buildGroupPendingMap(renderContext),
    [renderContext]
  );

  useEffect(() => {
    if (!isAgentMode && renderContext.isCurrentGeneratingAssistant && renderContext.hasMcpEvents) {
      setIsMcpEventsExpanded(true);
    }
  }, [isAgentMode, renderContext.hasMcpEvents, renderContext.isCurrentGeneratingAssistant]);

  useEffect(() => {
    if (!renderContext.shouldShowAgentToolSection) {
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
  }, [groupPendingMap, renderContext.shouldShowAgentToolSection]);

  const addEditFiles = (files: FileList | null) => {
    if (!files?.length) {
      return;
    }
    void (async () => {
      const next = await Promise.all(
        Array.from(files).map(async (file) => {
          const base = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            kind: "file" as const
          };

          if (file.type.startsWith("image/")) {
            const previewUrl = URL.createObjectURL(file);
            if (file.size > IMAGE_ATTACHMENT_LIMIT) {
              return {
                ...base,
                kind: "image" as const,
                previewUrl,
                error: `图片超过 ${(IMAGE_ATTACHMENT_LIMIT / (1024 * 1024)).toFixed(0)}MB，无法发送给模型。`
              };
            }

            try {
              const imageDataUrl = await readFileAsDataUrl(file);
              return {
                ...base,
                kind: "image" as const,
                previewUrl,
                imageDataUrl
              };
            } catch {
              return {
                ...base,
                kind: "image" as const,
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
                kind: "text" as const,
                textContent: content.slice(0, TEXT_ATTACHMENT_LIMIT),
                error: isTrimmed ? `文本已截断到前 ${TEXT_ATTACHMENT_LIMIT} 个字符。` : undefined
              };
            } catch {
              return {
                ...base,
                kind: "text" as const,
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

  const copyMessage = async () => {
    const content = isUser ? message.content : displayedContent;
    if (!content.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
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
    handlers.onEditMessage(message, next, nextMessageAttachments);
    setIsEditing(false);
  };

  return {
    state: {
      copied,
      isEditing,
      isDragOverEdit,
      editDraft,
      editAttachments,
      isReasoningExpanded,
      isMcpEventsExpanded,
      expandedAgentResultIds,
      expandedAgentGroupIds,
      fileInputRef
    },
    actions: {
      onCopy: () => {
        void copyMessage();
      },
      onStartEditing: () => setIsEditing(true),
      onCancelEditing: () => {
        setIsEditing(false);
        resetEditState();
      },
      onSaveEdit: saveEdit,
      onChangeDraft: setEditDraft,
      onRemoveAttachment: removeEditAttachment,
      onOpenFilePicker: () => fileInputRef.current?.click(),
      onFileInputChange: addEditFiles,
      onDragOverEdit: (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsDragOverEdit(true);
      },
      onDragLeaveEdit: () => setIsDragOverEdit(false),
      onDropEdit: (event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragOverEdit(false);
        addEditFiles(event.dataTransfer.files);
      },
      onToggleMcpEvents: () => setIsMcpEventsExpanded((previous) => !previous),
      onToggleReasoning: () => setIsReasoningExpanded((previous) => !previous),
      onToggleGroupDetail: (groupId: string) =>
        setExpandedAgentGroupIds((previous) => ({
          ...previous,
          [groupId]: !(previous[groupId] ?? false)
        })),
      onToggleResultDetail: (toolCallId: string) =>
        setExpandedAgentResultIds((previous) => ({
          ...previous,
          [toolCallId]: !previous[toolCallId]
        }))
    }
  };
};
