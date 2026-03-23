import { memo } from "react";
import { renderMessageBlocks } from "./message-block-renderer";
import type { MessageFrameHandlers, PermissionRequest } from "./conversation-types";
import { buildMessageAst, buildMessageRenderContext } from "./message-render-ast";
import { formatTokenCount } from "./message-presentation-helpers";
import { MessageActionBar } from "./message-action-bar";
import { MessageAttachmentList } from "./message-attachment-list";
import { MessageUsageStats } from "./message-usage-stats";
import { useMessagePresentationState } from "./use-message-presentation-state";
import { useStreamRevealedContent } from "./use-stream-revealed-content";
import type { ChatMessage, MarkdownRenderMode } from "../../shared/contracts";

type MessageFrameProps = {
  message: ChatMessage;
  compactSpacingAbove?: boolean;
  isGenerating: boolean;
  isTopSnapActive: boolean;
  activeGeneratingAssistantId?: string | null;
  mode: "chat" | "agent";
  markdownRenderMode: MarkdownRenderMode;
  permissionRequest?: PermissionRequest | null;
} & MessageFrameHandlers;

const MessageFrameInner = ({
  message,
  compactSpacingAbove = false,
  isGenerating,
  isTopSnapActive,
  activeGeneratingAssistantId,
  mode,
  markdownRenderMode,
  permissionRequest,
  onResolvePermission,
  onEditMessage,
  onDeleteMessage,
  onResendMessage
}: MessageFrameProps) => {
  const displayedContent = useStreamRevealedContent({
    content: message.content,
    role: message.role,
    disabled:
      Boolean(activeGeneratingAssistantId === message.id) &&
      isGenerating &&
      isTopSnapActive
  });

  const renderContext = buildMessageRenderContext({
    message,
    mode,
    isGenerating,
    isTopSnapActive,
    activeGeneratingAssistantId,
    displayedContent,
    permissionRequest
  });

  const { state, actions } = useMessagePresentationState({
    renderContext,
    handlers: {
      onEditMessage
    }
  });

  const ast = buildMessageAst({
    context: renderContext,
    presentation: {
      isEditing: state.isEditing,
      isReasoningExpanded: state.isReasoningExpanded,
      isMcpEventsExpanded: state.isMcpEventsExpanded,
      expandedAgentGroupIds: state.expandedAgentGroupIds,
      expandedAgentResultIds: state.expandedAgentResultIds,
      editDraft: state.editDraft,
      editAttachments: state.editAttachments
    }
  });

  return (
    <div
      data-chat-message-id={message.id}
      data-chat-message-role={message.role}
      className={`group paper-message-enter flex items-start gap-3 ${
        compactSpacingAbove ? "mt-[-6px]" : ""
      } ${
        renderContext.isUser ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`flex flex-none flex-col ${
          renderContext.isUser ? "chat-message-column-user" : "chat-message-column-assistant"
        }`}
      >
        <div
          className={getMessageSurfaceClassName(renderContext.isUser)}
        >
          {renderMessageBlocks({
            ast,
            context: renderContext,
          presentation: state,
          actions,
          handlers: {
            onResolvePermission
          },
          markdownRenderMode
        })}
        </div>

        <MessageAttachmentList attachments={renderContext.attachments} isUser={renderContext.isUser} />
        <MessageUsageStats usage={renderContext.assistantUsage} formatTokenCount={formatTokenCount} />

        <MessageActionBar
          isUser={renderContext.isUser}
          isAgentMode={renderContext.isAgentMode}
          isGenerating={isGenerating}
          copied={state.copied}
          message={message}
          onCopy={actions.onCopy}
          onStartEditing={actions.onStartEditing}
          onResendMessage={onResendMessage}
          onDeleteMessage={onDeleteMessage}
        />
      </div>
    </div>
  );
};

export const getMessageSurfaceClassName = (isUser: boolean) =>
  [
    "max-w-full break-words transition-opacity duration-150",
    isUser
      ? "chat-message-surface-user inline-block w-fit rounded-[22px] border border-white/[0.09] bg-black/10 px-4 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl sm:px-4.5"
      : "chat-message-surface-assistant w-full"
  ].join(" ");

const areMessageFramePropsEqual = (prev: MessageFrameProps, next: MessageFrameProps) => {
  if (prev.message !== next.message) {
    return false;
  }
  if (prev.mode !== next.mode) {
    return false;
  }
  if (prev.markdownRenderMode !== next.markdownRenderMode) {
    return false;
  }
  if (prev.isTopSnapActive !== next.isTopSnapActive) {
    return false;
  }

  const prevIsGeneratingMessage =
    prev.isGenerating && prev.activeGeneratingAssistantId === prev.message.id;
  const nextIsGeneratingMessage =
    next.isGenerating && next.activeGeneratingAssistantId === next.message.id;
  if (prevIsGeneratingMessage !== nextIsGeneratingMessage) {
    return false;
  }

  const prevRequest = prev.permissionRequest;
  const nextRequest = next.permissionRequest;
  if (
    prevRequest?.requestId !== nextRequest?.requestId ||
    prevRequest?.runId !== nextRequest?.runId ||
    prevRequest?.resolving !== nextRequest?.resolving
  ) {
    return false;
  }

  return (
    prev.onResolvePermission === next.onResolvePermission &&
    prev.onEditMessage === next.onEditMessage &&
    prev.onDeleteMessage === next.onDeleteMessage &&
    prev.onResendMessage === next.onResendMessage
  );
};

export const MessageFrame = memo(MessageFrameInner, areMessageFramePropsEqual);
