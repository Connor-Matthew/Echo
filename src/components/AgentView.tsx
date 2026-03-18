import { AgentConversationView } from "./chat/conversation-shells";
import type { AgentMessage } from "../shared/agent-contracts";
import type { PermissionRequest } from "./chat/conversation-types";

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

  return (
    <div className="h-full min-h-0">
      <AgentConversationView
        sessionId={sessionId}
        messages={messages}
        isRunning={isRunning}
        permissionRequest={permissionRequest}
        onResolvePermission={onResolvePermission}
      />
    </div>
  );
};
