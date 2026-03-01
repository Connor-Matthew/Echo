import type {
  AgentMessage,
  AgentSendMessageRequest,
  AgentStreamEvent,
  AgentUsage
} from "../../src/shared/agent-contracts";
import { runClaudeAgentAdapter } from "./adapters/claude-agent-adapter";

type RunClaudeAgentInput = {
  request: AgentSendMessageRequest;
  history: AgentMessage[];
  signal: AbortSignal;
  cwd: string;
  resumeSessionId?: string;
  onEvent: (event: AgentStreamEvent) => void;
  onPermissionRequest?: (payload: {
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
    reason?: string;
    blockedPath?: string;
    suggestions?: unknown[];
    signal: AbortSignal;
  }) => Promise<{
    decision: "approved" | "denied";
    message?: string;
    updatedInput?: Record<string, unknown>;
    updatedPermissions?: unknown[];
  }>;
};

type RunClaudeAgentResult = {
  assistantText: string;
  sdkSessionId?: string;
  usage?: AgentUsage;
};

// Keep this facade stable so IPC/orchestrator can depend on one local service API.
export const runClaudeAgentQuery = (input: RunClaudeAgentInput): Promise<RunClaudeAgentResult> =>
  runClaudeAgentAdapter(input);
