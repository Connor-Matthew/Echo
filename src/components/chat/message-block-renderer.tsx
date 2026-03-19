import type { ReactNode } from "react";
import { AgentToolItems } from "./agent-tool-items";
import type {
  MessageFrameHandlers,
  MessagePresentationActions,
  MessagePresentationStateSnapshot,
  MessageRenderContext
} from "./conversation-types";
import { formatBytes } from "./message-presentation-helpers";
import { MessageEditPanel } from "./message-edit-panel";
import { MarkdownContent } from "./message-markdown-content";
import { MessageReasoningPanel } from "./message-reasoning-panel";
import { MessageToolCallsPanel } from "./message-tool-calls-panel";
import type { MessageAst, MessageAstNode } from "./message-render-ast";
import type { MarkdownRenderMode } from "../../shared/contracts";

type BlockRendererBaseProps = {
  context: MessageRenderContext;
  presentation: MessagePresentationStateSnapshot;
  actions: MessagePresentationActions;
  handlers: Pick<MessageFrameHandlers, "onResolvePermission">;
  markdownRenderMode: MarkdownRenderMode;
};

type BlockRendererProps<K extends MessageAstNode["kind"]> = BlockRendererBaseProps & {
  node: Extract<MessageAstNode, { kind: K }>;
};

export type MessageBlockRendererRegistry = {
  [K in MessageAstNode["kind"]]: (props: BlockRendererProps<K>) => ReactNode;
};

const AppliedSkillBadge = ({
  appliedSkill
}: {
  appliedSkill: NonNullable<MessageRenderContext["message"]["appliedSkill"]>;
}) => (
  <div className="mb-1.5 flex items-center gap-1.5">
    <span className="text-sm leading-none">{appliedSkill.icon}</span>
    <span className="text-[11px] font-medium text-primary/80">{appliedSkill.name}</span>
    <span className="text-[11px] text-muted-foreground">/{appliedSkill.command}</span>
  </div>
);

const PendingToolBanner = ({
  toolCalls
}: {
  toolCalls: MessageRenderContext["message"]["toolCalls"];
}) => {
  const pendingTool = [...(toolCalls ?? [])].reverse().find((toolCall) => toolCall.status === "pending");

  if (!pendingTool) {
    return null;
  }

  return (
    <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex gap-[3px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-1 w-1 rounded-full bg-muted-foreground/60"
            style={{ animation: `mcpDot 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </span>
      <span>
        [{pendingTool.serverName}] {pendingTool.toolName}
      </span>
    </div>
  );
};

const registry: MessageBlockRendererRegistry = {
  skill_badge: ({ node }) => <AppliedSkillBadge appliedSkill={node.appliedSkill} />,
  pending_tool_banner: ({ node }) => <PendingToolBanner toolCalls={node.toolCalls} />,
  tool_panel: ({ node, actions }) => (
    <MessageToolCallsPanel
      toolCalls={node.toolCalls}
      isExpanded={node.isExpanded}
      onToggle={actions.onToggleMcpEvents}
    />
  ),
  permission_request: ({ node }) => {
    if (!node.request) {
      return null;
    }
    return (
      <div className="mb-2 rounded-md border border-amber-500/35 bg-amber-500/8 px-3 py-2">
        <p className="text-[12px] font-medium text-amber-800/90 dark:text-amber-300/85">
          权限请求 · {node.request.toolName ?? "tool"}
        </p>
        {node.request.reason ? (
          <p className="mt-0.5 text-[12px] text-amber-800/80 dark:text-amber-300/75">
            {node.request.reason}
          </p>
        ) : null}
        {node.request.blockedPath ? (
          <p className="mt-0.5 font-mono text-[11.5px] text-amber-700/75 dark:text-amber-400/65">
            {node.request.blockedPath}
          </p>
        ) : null}
      </div>
    );
  },
  reasoning_panel: ({ node, actions, markdownRenderMode }) => (
    <MessageReasoningPanel isExpanded={node.isExpanded} onToggle={actions.onToggleReasoning}>
      <MarkdownContent content={node.content} isUser={false} renderMode={markdownRenderMode} />
    </MessageReasoningPanel>
  ),
  markdown: ({ node, context, markdownRenderMode }) => {
    if (!node.content && !node.isUser && context.isCurrentGeneratingAssistant) {
      return <span className="text-muted-foreground">Generating...</span>;
    }
    return (
      <MarkdownContent
        content={node.content}
        isUser={node.isUser}
        streaming={Boolean(node.streaming)}
        renderMode={markdownRenderMode}
      />
    );
  },
  inline_tool_group: ({ node, context, presentation, actions, handlers }) => (
    <div className={node.isLastGroup ? "" : "mt-1"}>
      <AgentToolItems
        items={node.items}
        groupId={node.groupId}
        isLastGroup={node.isLastGroup}
        expandedAgentGroupIds={presentation.expandedAgentGroupIds}
        expandedAgentResultIds={presentation.expandedAgentResultIds}
        isCurrentGeneratingAssistant={context.isCurrentGeneratingAssistant}
        activePendingExecutionCall={context.activePendingExecutionCall}
        activePendingProgressCall={context.activePendingProgressCall}
        permissionRequest={context.permissionRequest}
        onResolvePermission={handlers.onResolvePermission}
        onToggleGroupDetail={actions.onToggleGroupDetail}
        onToggleResultDetail={actions.onToggleResultDetail}
      />
    </div>
  ),
  standalone_tool_group: ({ node, context, presentation, actions, handlers }) => (
    <AgentToolItems
      items={node.items}
      groupId={node.groupId}
      isLastGroup={node.isLastGroup}
      expandedAgentGroupIds={presentation.expandedAgentGroupIds}
      expandedAgentResultIds={presentation.expandedAgentResultIds}
      isCurrentGeneratingAssistant={context.isCurrentGeneratingAssistant}
      activePendingExecutionCall={context.activePendingExecutionCall}
      activePendingProgressCall={context.activePendingProgressCall}
      permissionRequest={context.permissionRequest}
      onResolvePermission={handlers.onResolvePermission}
      onToggleGroupDetail={actions.onToggleGroupDetail}
      onToggleResultDetail={actions.onToggleResultDetail}
    />
  ),
  message_editor: ({ node, presentation, actions, context }) => (
    <MessageEditPanel
      isDragOver={presentation.isDragOverEdit}
      onDragOver={actions.onDragOverEdit}
      onDragLeave={actions.onDragLeaveEdit}
      onDrop={actions.onDropEdit}
      fileInputRef={presentation.fileInputRef}
      onFileInputChange={actions.onFileInputChange}
      editDraft={node.editDraft}
      onChangeDraft={actions.onChangeDraft}
      editAttachments={node.editAttachments}
      formatBytes={formatBytes}
      onRemoveAttachment={actions.onRemoveAttachment}
      onOpenFilePicker={actions.onOpenFilePicker}
      onCancel={actions.onCancelEditing}
      onSave={actions.onSaveEdit}
      isGenerating={context.isGenerating}
    />
  )
};

export const renderMessageBlocks = ({
  ast,
  context,
  presentation,
  actions,
  handlers,
  markdownRenderMode
}: {
  ast: MessageAst;
  context: MessageRenderContext;
  presentation: MessagePresentationStateSnapshot;
  actions: MessagePresentationActions;
  handlers: Pick<MessageFrameHandlers, "onResolvePermission">;
  markdownRenderMode: MarkdownRenderMode;
}) =>
  ast.nodes.map((node, index) => (
    <div key={`${node.kind}-${index}`}>
      {registry[node.kind]({
        node: node as never,
        context,
        presentation,
        actions,
        handlers,
        markdownRenderMode
      })}
    </div>
  ));

export const messageBlockRendererRegistry = registry;
