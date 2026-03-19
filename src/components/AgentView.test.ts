import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidElement, type ReactElement } from "react";
import { AgentView } from "./AgentView";
import { AgentConversationView } from "./chat/conversation-shells";
import type { AgentMessage } from "../shared/agent-contracts";

const createAgentMessage = (overrides: Partial<AgentMessage>): AgentMessage => ({
  id: "msg-1",
  sessionId: "agent-1",
  role: "assistant",
  content: "",
  createdAt: "2026-03-17T00:00:00.000Z",
  ...overrides
});

describe("components/AgentView", () => {
  it("wires agent sessions through the agent conversation shell", () => {
    const element = AgentView({
      sessionId: "agent-1",
      isRunning: true,
      markdownRenderMode: "paragraph",
      messages: [
        createAgentMessage({ id: "sys-1", role: "system", content: "system note" }),
        createAgentMessage({ id: "user-1", role: "user", content: "hello" })
      ]
    });

    assert.ok(isValidElement(element));
    const rootElement = element as ReactElement<{
      children: ReactElement<{
        sessionId: string;
        isRunning: boolean;
        markdownRenderMode: "paragraph";
        messages: AgentMessage[];
      }>;
    }>;
    const shellElement = rootElement.props.children;
    assert.equal(shellElement.type, AgentConversationView);
    assert.equal(shellElement.props.sessionId, "agent-1");
    assert.equal(shellElement.props.isRunning, true);
    assert.equal(shellElement.props.markdownRenderMode, "paragraph");
    assert.deepEqual(shellElement.props.messages, [
      createAgentMessage({ id: "sys-1", role: "system", content: "system note" }),
      createAgentMessage({ id: "user-1", role: "user", content: "hello" })
    ]);
  });
});
