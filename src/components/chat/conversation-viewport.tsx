import { MessageFrame } from "./message-frame";
import { useChatScrollFollow } from "./use-chat-scroll-follow";
import type { ConversationMode, MessageFrameHandlers, PermissionRequest } from "./conversation-types";
import type { ChatMessage } from "../../shared/contracts";

type ConversationViewportProps = {
  sessionId: string;
  messages: ChatMessage[];
  isConfigured: boolean;
  isGenerating: boolean;
  mode: ConversationMode;
  permissionRequest?: PermissionRequest | null;
} & MessageFrameHandlers;

export const ConversationViewport = ({
  sessionId,
  messages,
  isConfigured,
  isGenerating,
  mode,
  permissionRequest,
  onResolvePermission,
  onEditMessage,
  onDeleteMessage,
  onResendMessage
}: ConversationViewportProps) => {
  const {
    scrollContainerRef,
    scrollContentRef,
    activeGeneratingAssistantId,
    isTopSnapActive
  } = useChatScrollFollow({
    sessionId,
    messages,
    isConfigured,
    isGenerating,
    mode
  });

  const renderMessageFrames = (items: ChatMessage[], isTopSnapActive: boolean) =>
    items.map((message) => (
      <MessageFrame
        key={message.id}
        message={message}
        isGenerating={isGenerating}
        isTopSnapActive={isTopSnapActive}
        activeGeneratingAssistantId={activeGeneratingAssistantId}
        mode={mode}
        permissionRequest={permissionRequest}
        onResolvePermission={onResolvePermission}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        onResendMessage={onResendMessage}
      />
    ));
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
      className="chat-scroll-stage paper-conversation-stage mx-auto h-full w-full overflow-auto px-4 py-5 sm:px-5 sm:py-6 md:px-6 md:py-7"
    >
      <div ref={scrollContentRef} className="grid gap-3.5 sm:gap-4">
        {renderMessageFrames(messages, isTopSnapActive)}
      </div>
    </section>
  );
};
