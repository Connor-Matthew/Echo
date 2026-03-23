import { MessageFrame } from "./message-frame";
import { useChatScrollFollow } from "./use-chat-scroll-follow";
import type { ConversationMode, MessageFrameHandlers, PermissionRequest } from "./conversation-types";
import type { ChatMessage, MarkdownRenderMode } from "../../shared/contracts";

type ConversationViewportProps = {
  sessionId: string;
  messages: ChatMessage[];
  isConfigured: boolean;
  isGenerating: boolean;
  mode: ConversationMode;
  markdownRenderMode: MarkdownRenderMode;
  permissionRequest?: PermissionRequest | null;
} & MessageFrameHandlers;

export const getConversationViewportLayoutClassNames = () => ({
  scrollContainer: "chat-scroll-stage echo-scrollbar-minimal h-full w-full overflow-auto",
  scrollContent:
    "chat-scroll-content mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-5 pb-80 pt-10 sm:px-8 md:px-12"
});

export const ConversationViewport = ({
  sessionId,
  messages,
  isConfigured,
  isGenerating,
  mode,
  markdownRenderMode,
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

  const layoutClassNames = getConversationViewportLayoutClassNames();

  const renderMessageFrames = (items: ChatMessage[], isTopSnapActive: boolean) =>
    items.map((message, index) => {
      const previousMessage = index > 0 ? items[index - 1] : null;
      const compactSpacingAbove =
        previousMessage?.role === "user" && message.role === "assistant";

      return (
      <MessageFrame
        key={message.id}
        message={message}
        compactSpacingAbove={compactSpacingAbove}
        isGenerating={isGenerating}
        isTopSnapActive={isTopSnapActive}
        activeGeneratingAssistantId={activeGeneratingAssistantId}
        mode={mode}
        markdownRenderMode={markdownRenderMode}
        permissionRequest={permissionRequest}
        onResolvePermission={onResolvePermission}
        onEditMessage={onEditMessage}
        onDeleteMessage={onDeleteMessage}
        onResendMessage={onResendMessage}
      />
      );
    });
  if (!isConfigured) {
    return (
      <section className="paper-conversation-stage mx-auto flex h-full w-full items-center justify-center px-4 py-6 sm:px-5 sm:py-7 md:px-6 md:py-8">
        <div className="rounded-[28px] border border-border/70 bg-card px-8 py-7 text-center sm:px-10 sm:py-8 md:px-12 md:py-10">
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
          <p className="mb-5 inline-flex items-center rounded-full border border-border/70 bg-background px-3.5 py-1 text-[11px] tracking-[0.08em] text-muted-foreground">
            New conversation
          </p>
          <h2 className="text-[30px] font-semibold leading-[1.2] text-foreground sm:text-[36px] md:text-[40px]">
            从一个清晰的问题开始
          </h2>
          <p className="mx-auto mt-4 max-w-[560px] text-sm leading-7 text-muted-foreground sm:text-base">
            保持问题具体、直接，界面会尽量把注意力留给内容本身。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={scrollContainerRef}
      className={layoutClassNames.scrollContainer}
    >
      <div ref={scrollContentRef} className={layoutClassNames.scrollContent}>
        {renderMessageFrames(messages, isTopSnapActive)}
      </div>
    </section>
  );
};
