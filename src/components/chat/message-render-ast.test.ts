import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatMessage, ToolCall } from "../../shared/contracts";
import {
  buildMessageAst,
  buildMessageRenderContext,
  type MessageAstNode
} from "./message-render-ast";

const createToolCall = (overrides: Partial<ToolCall> = {}): ToolCall => ({
  id: "tool-1",
  serverName: "filesystem",
  toolName: "read_file",
  status: "success",
  message: "",
  ...overrides
});

const createMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "msg-1",
  role: "assistant",
  content: "Hello world",
  createdAt: "2026-03-18T00:00:00.000Z",
  ...overrides
});

const getKinds = (nodes: MessageAstNode[]) => nodes.map((node) => node.kind);

describe("components/chat/message-render-ast", () => {
  it("builds render context for inline agent tool rendering", () => {
    const message = createMessage({
      content: "Alpha Beta Gamma",
      toolCalls: [
        createToolCall({ id: "tool-inline", contentOffset: 6, message: "Reading file" })
      ]
    });

    const context = buildMessageRenderContext({
      message,
      mode: "agent",
      isGenerating: true,
      isTopSnapActive: false,
      activeGeneratingAssistantId: "msg-1"
    });

    assert.equal(context.hasMcpEvents, true);
    assert.equal(context.shouldShowAgentToolSection, true);
    assert.equal(context.shouldRenderAgentToolInline, true);
    assert.equal(context.clampedGroups.length, 1);
    assert.equal(context.clampedGroups[0]?.offset, 6);
  });

  it("builds chat-mode assistant ast with panels and markdown body", () => {
    const message = createMessage({
      content: "Answer body",
      reasoningContent: "Private chain",
      toolCalls: [
        createToolCall({ id: "permission:req-1", status: "pending", toolName: "exec_command" })
      ],
      appliedSkill: {
        icon: "S",
        name: "Skill",
        command: "skill"
      }
    });

    const context = buildMessageRenderContext({
      message,
      mode: "chat",
      isGenerating: true,
      isTopSnapActive: false,
      activeGeneratingAssistantId: "msg-1"
    });
    const ast = buildMessageAst({
      context,
      presentation: {
        isEditing: false,
        isReasoningExpanded: true,
        isMcpEventsExpanded: true,
        expandedAgentGroupIds: {},
        expandedAgentResultIds: {},
        editDraft: message.content,
        editAttachments: []
      }
    });

    assert.deepEqual(getKinds(ast.nodes), [
      "skill_badge",
      "pending_tool_banner",
      "tool_panel",
      "permission_request",
      "reasoning_panel",
      "markdown"
    ]);
  });

  it("builds agent-mode ast with inline markdown and tool groups", () => {
    const message = createMessage({
      content: "Before tool after tool",
      toolCalls: [
        createToolCall({ id: "tool-inline", contentOffset: 7, message: "read step" })
      ]
    });

    const context = buildMessageRenderContext({
      message,
      mode: "agent",
      isGenerating: false,
      isTopSnapActive: false,
      activeGeneratingAssistantId: null
    });
    const ast = buildMessageAst({
      context,
      presentation: {
        isEditing: false,
        isReasoningExpanded: false,
        isMcpEventsExpanded: true,
        expandedAgentGroupIds: {},
        expandedAgentResultIds: {},
        editDraft: message.content,
        editAttachments: []
      }
    });

    assert.deepEqual(getKinds(ast.nodes), ["markdown", "inline_tool_group", "markdown"]);
  });

  it("uses message editor node for user messages in edit mode", () => {
    const message = createMessage({
      role: "user",
      content: "Draft me"
    });

    const context = buildMessageRenderContext({
      message,
      mode: "chat",
      isGenerating: false,
      isTopSnapActive: false,
      activeGeneratingAssistantId: null
    });
    const ast = buildMessageAst({
      context,
      presentation: {
        isEditing: true,
        isReasoningExpanded: false,
        isMcpEventsExpanded: true,
        expandedAgentGroupIds: {},
        expandedAgentResultIds: {},
        editDraft: "Edited draft",
        editAttachments: []
      }
    });

    assert.deepEqual(getKinds(ast.nodes), ["message_editor"]);
  });
});
