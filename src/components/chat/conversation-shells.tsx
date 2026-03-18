import type { AgentMessage } from "../../shared/agent-contracts";
import type { ChatMessage } from "../../shared/contracts";
import { ConversationViewport } from "./conversation-viewport";
import type { MessageFrameHandlers, PermissionRequest } from "./conversation-types";

type ChatConversationViewProps = {
  sessionId: string;
  messages: ChatMessage[];
  isConfigured: boolean;
  isGenerating: boolean;
  permissionRequest?: PermissionRequest | null;
} & MessageFrameHandlers;

type AgentConversationViewProps = {
  sessionId: string;
  messages: AgentMessage[];
  isRunning: boolean;
  permissionRequest?: PermissionRequest | null;
  onResolvePermission?: (
    request: PermissionRequest,
    decision: "approved" | "denied",
    applySuggestions: boolean
  ) => void;
};

export const mapAgentMessagesToChatMessages = (messages: AgentMessage[]): ChatMessage[] =>
  messages.map((message) => ({
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content: message.role === "system" ? `[system] ${message.content}` : message.content,
    createdAt: message.createdAt,
    attachments: message.attachments,
    toolCalls: message.toolCalls
  }));

export const ChatConversationView = (props: ChatConversationViewProps) => (
  <ConversationViewport mode="chat" {...props} />
);

export const AgentConversationView = ({
  sessionId,
  messages,
  isRunning,
  permissionRequest,
  onResolvePermission
}: AgentConversationViewProps) => (
  <ConversationViewport
    mode="agent"
    sessionId={sessionId}
    messages={mapAgentMessagesToChatMessages(messages)}
    isConfigured={true}
    isGenerating={isRunning}
    permissionRequest={permissionRequest}
    onResolvePermission={onResolvePermission}
    onEditMessage={() => {}}
    onDeleteMessage={() => {}}
    onResendMessage={() => {}}
  />
);
