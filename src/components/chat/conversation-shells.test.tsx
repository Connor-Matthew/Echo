import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isValidElement, type ReactElement } from "react";
import type { AgentMessage } from "../../shared/agent-contracts";
import type { ChatMessage } from "../../shared/contracts";
import { AgentConversationView, ChatConversationView } from "./conversation-shells";
import { ConversationViewport } from "./conversation-viewport";

const createChatMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "chat-1",
  role: "assistant",
  content: "hello",
  createdAt: "2026-03-18T00:00:00.000Z",
  ...overrides
});

const createAgentMessage = (overrides: Partial<AgentMessage> = {}): AgentMessage => ({
  id: "agent-1",
  sessionId: "session-1",
  role: "assistant",
  content: "agent hello",
  createdAt: "2026-03-18T00:00:00.000Z",
  ...overrides
});

describe("components/chat/conversation-shells", () => {
  it("renders chat sessions through the chat shell and viewport", () => {
    const element = ChatConversationView({
      sessionId: "chat-session",
      messages: [createChatMessage()],
      isConfigured: true,
      isGenerating: false,
      markdownRenderMode: "paragraph",
      onEditMessage: () => {},
      onDeleteMessage: () => {},
      onResendMessage: () => {}
    });

    assert.ok(isValidElement(element));
    const viewport = element as ReactElement<{ mode: "chat"; markdownRenderMode: "paragraph" }>;
    assert.equal(viewport.type, ConversationViewport);
    assert.equal(viewport.props.mode, "chat");
    assert.equal(viewport.props.markdownRenderMode, "paragraph");
  });

  it("maps agent messages into assistant/user chat messages before handing them to the viewport", () => {
    const element = AgentConversationView({
      sessionId: "agent-session",
      isRunning: true,
      markdownRenderMode: "line",
      messages: [
        createAgentMessage({ id: "sys-1", role: "system", content: "system note" }),
        createAgentMessage({ id: "user-1", role: "user", content: "hello" })
      ]
    });

    assert.ok(isValidElement(element));
    const viewport = element as ReactElement<{
      mode: "agent";
      isGenerating: boolean;
      markdownRenderMode: "line";
      messages: ChatMessage[];
    }>;
    assert.equal(viewport.type, ConversationViewport);
    assert.equal(viewport.props.mode, "agent");
    assert.equal(viewport.props.isGenerating, true);
    assert.equal(viewport.props.markdownRenderMode, "line");
    assert.deepEqual(viewport.props.messages, [
      {
        id: "sys-1",
        role: "assistant",
        content: "[system] system note",
        createdAt: "2026-03-18T00:00:00.000Z",
        attachments: undefined,
        toolCalls: undefined
      },
      {
        id: "user-1",
        role: "user",
        content: "hello",
        createdAt: "2026-03-18T00:00:00.000Z",
        attachments: undefined,
        toolCalls: undefined
      }
    ]);
  });
});
