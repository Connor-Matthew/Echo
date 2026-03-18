import type { DragEvent, RefObject } from "react";
import type { AgentToolRenderItem, ToolAnchorGroup, ToolCallItem } from "./agent-tool-render-helpers";
import type { ChatAttachment, ChatMessage, ChatMessageUsage } from "../../shared/contracts";

export type ConversationMode = "chat" | "agent";

export type PermissionRequest = {
  runId: string;
  sessionId: string;
  requestId: string;
  toolName?: string;
  reason?: string;
  blockedPath?: string;
  supportsAlwaysAllow?: boolean;
  resolving?: boolean;
};

export type EditAttachment = ChatAttachment & {
  previewUrl?: string;
  error?: string;
};

export type MessageFrameHandlers = {
  onResolvePermission?: (
    request: PermissionRequest,
    decision: "approved" | "denied",
    applySuggestions: boolean
  ) => void;
  onEditMessage: (
    message: ChatMessage,
    nextContent: string,
    nextAttachments: ChatAttachment[]
  ) => void;
  onDeleteMessage: (message: ChatMessage) => void;
  onResendMessage: (message: ChatMessage) => void;
};

export type MessagePresentationStateSnapshot = {
  copied: boolean;
  isEditing: boolean;
  isDragOverEdit: boolean;
  editDraft: string;
  editAttachments: EditAttachment[];
  isReasoningExpanded: boolean;
  isMcpEventsExpanded: boolean;
  expandedAgentResultIds: Record<string, boolean>;
  expandedAgentGroupIds: Record<string, boolean>;
  fileInputRef: RefObject<HTMLInputElement>;
};

export type MessagePresentationActions = {
  onCopy: () => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
  onSaveEdit: () => void;
  onChangeDraft: (value: string) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onOpenFilePicker: () => void;
  onFileInputChange: (files: FileList | null) => void;
  onDragOverEdit: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeaveEdit: () => void;
  onDropEdit: (event: DragEvent<HTMLDivElement>) => void;
  onToggleMcpEvents: () => void;
  onToggleReasoning: () => void;
  onToggleGroupDetail: (groupId: string) => void;
  onToggleResultDetail: (toolCallId: string) => void;
};

export type MessageRenderContext = {
  message: ChatMessage;
  mode: ConversationMode;
  isGenerating: boolean;
  isUser: boolean;
  isAgentMode: boolean;
  isCurrentGeneratingAssistant: boolean;
  displayedContent: string;
  assistantVisibleContent: string;
  attachments: ChatAttachment[];
  hasReasoning: boolean;
  hasMcpEvents: boolean;
  agentToolCalls: ToolCallItem[];
  agentToolRenderItems: AgentToolRenderItem[];
  activePendingExecutionCall?: ToolCallItem;
  activePendingProgressCall?: ToolCallItem;
  shouldUseStreamingTextPresentation: boolean;
  shouldShowAgentToolSection: boolean;
  shouldRenderAgentToolInline: boolean;
  clampedGroups: ToolAnchorGroup[];
  assistantUsage: ChatMessageUsage | null;
  permissionRequest?: PermissionRequest | null;
};
