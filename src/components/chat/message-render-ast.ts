import {
  buildAgentToolRenderItems,
  buildClampedToolAnchorGroups,
  isProgressToolCall,
  type AgentToolRenderItem
} from "./agent-tool-render-helpers";
import type {
  ConversationMode,
  EditAttachment,
  MessagePresentationStateSnapshot,
  MessageRenderContext,
  PermissionRequest
} from "./conversation-types";
import { hasUsage } from "./message-presentation-helpers";
import type { ChatMessage, ToolCall } from "../../shared/contracts";

export type MessageAstNode =
  | { kind: "skill_badge"; appliedSkill: NonNullable<ChatMessage["appliedSkill"]> }
  | { kind: "pending_tool_banner"; toolCalls: ChatMessage["toolCalls"] }
  | { kind: "tool_panel"; toolCalls: ToolCall[]; isExpanded: boolean }
  | { kind: "permission_request"; request?: PermissionRequest | null }
  | { kind: "reasoning_panel"; content: string; isExpanded: boolean }
  | { kind: "markdown"; content: string; isUser: boolean; streaming?: boolean }
  | {
      kind: "inline_tool_group";
      items: AgentToolRenderItem[];
      groupId: string;
      isLastGroup: boolean;
    }
  | {
      kind: "standalone_tool_group";
      items: AgentToolRenderItem[];
      groupId: string;
      isLastGroup: boolean;
    }
  | { kind: "message_editor"; editDraft: string; editAttachments: EditAttachment[] };

export type MessageAst = {
  nodes: MessageAstNode[];
};

type BuildMessageRenderContextParams = {
  message: ChatMessage;
  mode: ConversationMode;
  isGenerating: boolean;
  isTopSnapActive: boolean;
  activeGeneratingAssistantId?: string | null;
  displayedContent?: string;
  permissionRequest?: PermissionRequest | null;
};

type BuildMessageAstParams = {
  context: MessageRenderContext;
  presentation: Pick<
    MessagePresentationStateSnapshot,
    | "isEditing"
    | "isReasoningExpanded"
    | "isMcpEventsExpanded"
    | "expandedAgentGroupIds"
    | "expandedAgentResultIds"
    | "editDraft"
    | "editAttachments"
  >;
};

const buildPermissionRequestNode = (params: {
  permissionRequest?: PermissionRequest | null;
  toolCalls?: ToolCall[];
}) => {
  const hasPermissionTool = (params.toolCalls ?? []).some((toolCall) =>
    toolCall.id.startsWith("permission:")
  );
  if (!params.permissionRequest && !hasPermissionTool) {
    return null;
  }
  return {
    kind: "permission_request",
    request: params.permissionRequest ?? null
  } as const;
};

export const buildMessageRenderContext = ({
  message,
  mode,
  isGenerating,
  activeGeneratingAssistantId = null,
  displayedContent,
  permissionRequest
}: BuildMessageRenderContextParams): MessageRenderContext => {
  const isUser = message.role === "user";
  const isAgentMode = mode === "agent";
  const isCurrentGeneratingAssistant = Boolean(
    !isUser && isGenerating && activeGeneratingAssistantId === message.id
  );
  const resolvedDisplayedContent = displayedContent ?? message.content;
  const hasMcpEvents = !isUser && Boolean(message.toolCalls?.length);
  const agentToolCalls = isAgentMode && !isUser ? message.toolCalls ?? [] : [];
  const agentProgressCalls = agentToolCalls.filter(isProgressToolCall);
  const agentExecutionCalls = agentToolCalls.filter((toolCall) => !isProgressToolCall(toolCall));
  const agentToolRenderItems = buildAgentToolRenderItems(agentToolCalls);
  const assistantVisibleContent = isUser ? message.content : resolvedDisplayedContent;
  const clampedGroups =
    isAgentMode && !isUser && hasMcpEvents
      ? buildClampedToolAnchorGroups(agentToolRenderItems, assistantVisibleContent.length)
      : [];
  const shouldShowAgentToolSection = isAgentMode && !isUser && hasMcpEvents;
  const shouldRenderAgentToolInline = clampedGroups.length > 0;

  return {
    message,
    mode,
    isGenerating,
    isUser,
    isAgentMode,
    isCurrentGeneratingAssistant,
    displayedContent: resolvedDisplayedContent,
    assistantVisibleContent,
    attachments: message.attachments ?? [],
    hasReasoning: !isUser && Boolean(message.reasoningContent?.trim()),
    hasMcpEvents,
    agentToolCalls,
    agentToolRenderItems,
    activePendingExecutionCall: [...agentExecutionCalls]
      .reverse()
      .find((toolCall) => toolCall.status === "pending"),
    activePendingProgressCall: [...agentProgressCalls]
      .reverse()
      .find((toolCall) => toolCall.status === "pending"),
    shouldUseStreamingTextPresentation:
      !isUser && (isCurrentGeneratingAssistant || resolvedDisplayedContent !== message.content),
    shouldShowAgentToolSection,
    shouldRenderAgentToolInline,
    clampedGroups,
    assistantUsage:
      !isCurrentGeneratingAssistant && !isUser && hasUsage(message.usage) ? message.usage ?? null : null,
    permissionRequest
  };
};

export const buildMessageAst = ({ context, presentation }: BuildMessageAstParams): MessageAst => {
  if (context.isUser && presentation.isEditing) {
    return {
      nodes: [
        {
          kind: "message_editor",
          editDraft: presentation.editDraft,
          editAttachments: presentation.editAttachments
        }
      ]
    };
  }

  const nodes: MessageAstNode[] = [];
  const toolPanelCalls = context.message.toolCalls ?? [];

  if (!context.isUser && context.message.appliedSkill) {
    nodes.push({
      kind: "skill_badge",
      appliedSkill: context.message.appliedSkill
    });
  }

  if (!context.isUser && !context.isAgentMode && context.isCurrentGeneratingAssistant) {
    nodes.push({
      kind: "pending_tool_banner",
      toolCalls: context.message.toolCalls
    });
  }

  if (context.hasMcpEvents && !context.isAgentMode) {
    nodes.push({
      kind: "tool_panel",
      toolCalls: toolPanelCalls,
      isExpanded: presentation.isMcpEventsExpanded
    });
  }

  const permissionNode = buildPermissionRequestNode({
    permissionRequest: context.permissionRequest,
    toolCalls: context.message.toolCalls
  });
  if (permissionNode) {
    nodes.push(permissionNode);
  }

  if (context.hasReasoning) {
    nodes.push({
      kind: "reasoning_panel",
      content: context.message.reasoningContent ?? "",
      isExpanded: presentation.isReasoningExpanded
    });
  }

  if (!context.isUser && context.shouldShowAgentToolSection && context.shouldRenderAgentToolInline) {
    let cursor = 0;
    for (let index = 0; index < context.clampedGroups.length; index += 1) {
      const group = context.clampedGroups[index];
      const textSlice = context.assistantVisibleContent.slice(cursor, group.offset);
      if (textSlice || index === 0) {
        nodes.push({
          kind: "markdown",
          content: textSlice,
          isUser: false,
          streaming: context.shouldUseStreamingTextPresentation
        });
      }
      nodes.push({
        kind: "inline_tool_group",
        items: group.items,
        groupId: group.key,
        isLastGroup: index === context.clampedGroups.length - 1
      });
      cursor = group.offset;
    }

    const tail = context.assistantVisibleContent.slice(cursor);
    if (tail) {
      nodes.push({
        kind: "markdown",
        content: tail,
        isUser: false,
        streaming: context.shouldUseStreamingTextPresentation
      });
    }
    return { nodes };
  }

  nodes.push({
    kind: "markdown",
    content: context.assistantVisibleContent,
    isUser: context.isUser,
    streaming: context.shouldUseStreamingTextPresentation
  });

  if (!context.isUser && context.shouldShowAgentToolSection && !context.shouldRenderAgentToolInline) {
    nodes.push({
      kind: "standalone_tool_group",
      items: context.agentToolRenderItems,
      groupId: "standalone",
      isLastGroup: true
    });
  }

  return { nodes };
};
