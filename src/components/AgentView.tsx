import { AgentConversationView } from "./chat/conversation-shells";
import type { AgentMessage } from "../shared/agent-contracts";
import type { PermissionRequest } from "./chat/conversation-types";
import type { MarkdownRenderMode } from "../shared/contracts";

type AgentViewProps = {
  sessionId: string;
  messages: AgentMessage[];
  isRunning: boolean;
  markdownRenderMode: MarkdownRenderMode;
  permissionRequest?: PermissionRequest | null;
  onResolvePermission?: (
    request: PermissionRequest,
    decision: "approved" | "denied",
    applySuggestions: boolean
  ) => void;
};

export const AgentView = ({
  sessionId,
  messages,
  isRunning,
  markdownRenderMode,
  permissionRequest,
  onResolvePermission
}: AgentViewProps) => {
  if (!messages.length) {
    return (
      <div className="grid h-full place-content-center px-6 text-center">
        <div className="max-w-xl rounded-[28px] border border-border/75 bg-card px-10 py-9">
          <p className="text-[24px] font-semibold leading-none text-foreground">Agent Workspace</p>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
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
        markdownRenderMode={markdownRenderMode}
        permissionRequest={permissionRequest}
        onResolvePermission={onResolvePermission}
      />
    </div>
  );
};
