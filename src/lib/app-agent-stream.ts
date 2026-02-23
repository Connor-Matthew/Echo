import type { AgentMessage, AgentStreamEnvelope } from "../shared/agent-contracts";

type UpsertAgentMessages = (
  sessionId: string,
  mutate: (messages: AgentMessage[]) => AgentMessage[]
) => void;

type AgentStreamHandlerOptions = {
  sessionId: string;
  assistantMessageId: string;
  upsertAgentMessages: UpsertAgentMessages;
  appendAgentSystemEvent: (sessionId: string, text: string) => void;
  setAgentErrorBanner: (message: string) => void;
  finishAgentRun: () => void;
  loadAgentMessages: (sessionId: string) => Promise<void>;
};

export const createAgentStreamEnvelopeHandler = ({
  sessionId,
  assistantMessageId,
  upsertAgentMessages,
  appendAgentSystemEvent,
  setAgentErrorBanner,
  finishAgentRun,
  loadAgentMessages
}: AgentStreamHandlerOptions) => {
  const finishAndRefresh = () => {
    finishAgentRun();
    void loadAgentMessages(sessionId).catch(() => {});
  };

  return (payload: AgentStreamEnvelope) => {
    const streamEvent = payload.event;
    if (streamEvent.type === "text_delta") {
      upsertAgentMessages(sessionId, (messages) =>
        messages.map((message) =>
          message.id === assistantMessageId
            ? { ...message, content: `${message.content}${streamEvent.text}` }
            : message
        )
      );
      return;
    }

    if (streamEvent.type === "text_complete") {
      upsertAgentMessages(sessionId, (messages) =>
        messages.map((message) =>
          message.id === assistantMessageId
            ? message.content.endsWith(streamEvent.text)
              ? message
              : { ...message, content: `${message.content}${streamEvent.text}` }
            : message
        )
      );
      return;
    }

    if (streamEvent.type === "task_progress") {
      appendAgentSystemEvent(sessionId, `Progress: ${streamEvent.message}`);
      return;
    }

    if (streamEvent.type === "tool_start") {
      appendAgentSystemEvent(sessionId, `Tool start: ${streamEvent.toolName}`);
      return;
    }

    if (streamEvent.type === "tool_result") {
      appendAgentSystemEvent(sessionId, `Tool result: ${streamEvent.toolName}`);
      return;
    }

    if (streamEvent.type === "error") {
      setAgentErrorBanner(streamEvent.message);
      finishAndRefresh();
      return;
    }

    finishAndRefresh();
  };
};
