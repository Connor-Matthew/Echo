import { ChatView } from "./ChatView";
import type { AgentMessage } from "../shared/agent-contracts";
import type { ChatMessage } from "../shared/contracts";

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

type AgentViewProps = {
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

const toChatMessages = (messages: AgentMessage[]): ChatMessage[] =>
  messages.map((message) => ({
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    content:
      message.role === "system"
        ? `[system] ${message.content}`
        : message.content,
    createdAt: message.createdAt,
    attachments: message.attachments,
    toolCalls: message.toolCalls
  }));

export const AgentView = ({ sessionId, messages, isRunning, permissionRequest, onResolvePermission }: AgentViewProps) => {
  if (!messages.length) {
    return (
      <div className="grid h-full place-content-center px-6 text-center">
        <div className="max-w-xl rounded-lg border border-border/80 bg-card px-8 py-7">
          <p className="text-[24px] font-semibold leading-none text-foreground">Agent Workspace</p>
          <p className="mt-2 text-sm text-muted-foreground">
            这里会显示 Claude Agent SDK 的执行过程与回复。
          </p>
        </div>
      </div>
    );
  }

  const mappedMessages = toChatMessages(messages);

  return (
    <div className="h-full min-h-0">
      <ChatView
        mode="agent"
        sessionId={sessionId}
        messages={mappedMessages}
        isConfigured={true}
        isGenerating={isRunning}
        permissionRequest={permissionRequest}
        onResolvePermission={onResolvePermission}
        onEditMessage={() => {}}
        onDeleteMessage={() => {}}
        onResendMessage={() => {}}
      />
    </div>
  );
};
