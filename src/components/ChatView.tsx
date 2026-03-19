import { ChatConversationView } from "./chat/conversation-shells";
import type { MessageFrameHandlers, PermissionRequest } from "./chat/conversation-types";
import type { ChatMessage, MarkdownRenderMode } from "../shared/contracts";

type ChatViewProps = {
  sessionId: string;
  messages: ChatMessage[];
  isConfigured: boolean;
  isGenerating: boolean;
  markdownRenderMode: MarkdownRenderMode;
  permissionRequest?: PermissionRequest | null;
} & MessageFrameHandlers;

export const ChatView = (props: ChatViewProps) => <ChatConversationView {...props} />;
