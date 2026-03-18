import { ChatConversationView } from "./chat/conversation-shells";
import type { MessageFrameHandlers, PermissionRequest } from "./chat/conversation-types";
import type { ChatMessage } from "../shared/contracts";

type ChatViewProps = {
  sessionId: string;
  messages: ChatMessage[];
  isConfigured: boolean;
  isGenerating: boolean;
  permissionRequest?: PermissionRequest | null;
} & MessageFrameHandlers;

export const ChatView = (props: ChatViewProps) => <ChatConversationView {...props} />;
