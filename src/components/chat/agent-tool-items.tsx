import { AlertCircle, Check, ChevronDown, ChevronRight, Loader2, X } from "lucide-react";
import {
  hasPendingToolInRenderItems,
  isProgressToolCall,
  type AgentToolRenderItem,
  type ToolCallItem
} from "./agent-tool-render-helpers";

type PermissionRequest = {
  runId: string;
  sessionId: string;
  requestId: string;
  toolName?: string;
  reason?: string;
  blockedPath?: string;
  supportsAlwaysAllow?: boolean;
  resolving?: boolean;
};

const ToolStatusIcon = ({
  status,
  isActivePending,
}: {
  status: "pending" | "success" | "error";
  isActivePending: boolean;
}) => {
  if (status === "error") {
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center">
        <X className="h-2.5 w-2.5 text-destructive/75" />
      </span>
    );
  }
  if (status === "pending" || isActivePending) {
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center">
        <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground/75" />
      </span>
    );
  }
  return (
    <span className="flex h-3.5 w-3.5 items-center justify-center">
      <Check className="h-2.5 w-2.5 text-foreground/55" />
    </span>
  );
};

const AgentToolCallRow = ({
  toolCall,
  isActivePending,
  isDetailExpanded,
  onToggleDetail,
  permissionRequest,
  onResolvePermission,
  isLast,
}: {
  toolCall: ToolCallItem;
  isActivePending: boolean;
  isDetailExpanded: boolean;
  onToggleDetail: () => void;
  permissionRequest?: PermissionRequest | null;
  onResolvePermission?: (
    request: PermissionRequest,
    decision: "approved" | "denied",
    applySuggestions: boolean
  ) => void;
  isLast?: boolean;
}) => {
  const isProgress = toolCall.id.startsWith("progress:");
  const { status } = toolCall;
  const detailText = toolCall.message.trim();
  const canShowDetail = Boolean(detailText);
  const hasError = status === "error";
  const isPending = status === "pending";
  const displayName = toolCall.toolName.trim() || toolCall.serverName.trim() || "Tool";
  const serverLabel = toolCall.serverName.trim();

  const isThisPermission =
    permissionRequest && toolCall.id === `permission:${permissionRequest.requestId}`;

  const rowOpacity =
    status === "success" && !isProgress ? "opacity-60" : "opacity-100";

  return (
    <div className={`relative flex gap-3 transition-opacity duration-300 ${rowOpacity}`} data-agent-tool-call-id={toolCall.id}>
      <div className="flex flex-col items-center">
        <ToolStatusIcon status={status} isActivePending={isActivePending} />
        {!isLast && (
          <div className="mt-1 w-px flex-1 bg-border/50" style={{ minHeight: "12px" }} />
        )}
      </div>

      <div className="min-w-0 flex-1 pb-3">
        <button
          type="button"
          className={[
            "group/row flex w-full items-center gap-2 px-0.5 py-0.5 text-left transition-colors",
            canShowDetail ? "cursor-pointer hover:text-foreground/90" : "cursor-default",
            hasError ? "text-destructive/90" : "",
          ].join(" ")}
          onClick={canShowDetail ? onToggleDetail : undefined}
          aria-expanded={canShowDetail ? isDetailExpanded : undefined}
          disabled={!canShowDetail}
        >
          <span className={[
            "truncate text-[13px] font-medium leading-5",
            hasError ? "text-destructive" : isPending || isActivePending ? "text-foreground/90" : "text-foreground/70",
          ].join(" ")}>
            {displayName}
          </span>
          {serverLabel ? (
            <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground/55">
              {serverLabel}
            </span>
          ) : null}
          {canShowDetail && (
            <span className="ml-auto shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100">
              {isDetailExpanded
                ? <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
                : <ChevronRight className="h-3 w-3 text-muted-foreground/60" />}
            </span>
          )}
        </button>

        {canShowDetail && isDetailExpanded ? (
          <div className="ml-2 mt-0.5 border-l border-border/35 pl-2">
            <pre className="overflow-x-auto">
              <code className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.6] text-foreground/80">
                {detailText}
              </code>
            </pre>
          </div>
        ) : null}

        {isThisPermission && permissionRequest && onResolvePermission ? (
          <div className="ml-2 mt-1.5 border-l border-amber-500/35 pl-2">
            <p className="text-[12px] font-medium text-amber-800/90 dark:text-amber-300/85">
              权限请求 · {permissionRequest.toolName ?? "tool"}
            </p>
            {permissionRequest.reason ? (
              <p className="mt-0.5 text-[12px] text-amber-800/80 dark:text-amber-300/75">
                {permissionRequest.reason}
              </p>
            ) : null}
            {permissionRequest.blockedPath ? (
              <p className="mt-0.5 font-mono text-[11.5px] text-amber-700/75 dark:text-amber-400/65">
                {permissionRequest.blockedPath}
              </p>
            ) : null}
            <div className="mt-1.5 flex items-center gap-3">
              <button
                type="button"
                className="text-[12px] font-medium text-foreground/85 underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-45"
                disabled={permissionRequest.resolving}
                onClick={() => onResolvePermission(permissionRequest, "approved", false)}
              >
                允许
              </button>
              <button
                type="button"
                className="text-[12px] font-medium text-foreground/80 underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-45"
                disabled={permissionRequest.resolving || !permissionRequest.supportsAlwaysAllow}
                onClick={() => onResolvePermission(permissionRequest, "approved", true)}
              >
                始终允许
              </button>
              <button
                type="button"
                className="text-[12px] font-medium text-destructive/85 underline-offset-2 transition-colors hover:text-destructive hover:underline disabled:cursor-not-allowed disabled:opacity-45"
                disabled={permissionRequest.resolving}
                onClick={() => onResolvePermission(permissionRequest, "denied", false)}
              >
                拒绝
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const AgentTodoProgressGroup = ({
  parent,
  steps,
  isParentPending,
  activePendingProgressId,
  isParentDetailExpanded,
  onToggleParentDetail,
  isLast,
}: {
  parent: ToolCallItem;
  steps: ToolCallItem[];
  isParentPending: boolean;
  activePendingProgressId?: string;
  isParentDetailExpanded: boolean;
  onToggleParentDetail: () => void;
  isLast?: boolean;
}) => {
  const allDone = steps.every((s) => s.status !== "pending");
  const doneCount = steps.filter((s) => s.status === "success").length;

  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <ToolStatusIcon status={parent.status} isActivePending={isParentPending} />
        {!isLast && (
          <div className="mt-1 w-px flex-1 bg-border/50" style={{ minHeight: "12px" }} />
        )}
      </div>

      <div className="min-w-0 flex-1 pb-3">
        <button
          type="button"
          className={[
            "group/row flex w-full items-center gap-2 px-0.5 py-0.5 text-left transition-colors",
            isParentDetailExpanded || Boolean(parent.message.trim())
              ? "cursor-pointer hover:text-foreground/90"
              : "cursor-default",
          ].join(" ")}
          onClick={Boolean(parent.message.trim()) ? onToggleParentDetail : undefined}
          aria-expanded={Boolean(parent.message.trim()) ? isParentDetailExpanded : undefined}
          disabled={!Boolean(parent.message.trim())}
        >
          <span className="truncate text-[13px] font-medium leading-5 text-foreground/75">
            {parent.toolName.trim() || parent.serverName.trim() || "TodoWrite"}
          </span>
          {steps.length > 0 && (
            <span className="shrink-0 text-[10px] text-muted-foreground/55">
              {allDone ? `${doneCount}/${steps.length}` : `${doneCount}/${steps.length}`}
            </span>
          )}
          {Boolean(parent.message.trim()) && (
            <span className="ml-auto shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100">
              {isParentDetailExpanded
                ? <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
                : <ChevronRight className="h-3 w-3 text-muted-foreground/60" />}
            </span>
          )}
        </button>

        {isParentDetailExpanded && parent.message.trim() ? (
          <div className="ml-2 mt-0.5 border-l border-border/35 pl-2">
            <pre className="overflow-x-auto">
              <code className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.6] text-foreground/80">
                {parent.message.trim()}
              </code>
            </pre>
          </div>
        ) : null}

        {steps.length > 0 && (
          <div className="ml-2 mt-1 space-y-0.5 border-l border-border/30 pl-2">
            {steps.map((step) => {
              const isPending = step.status === "pending";
              const isError = step.status === "error";
              const isSuccess = step.status === "success";
              const isActivePending = Boolean(activePendingProgressId && step.id === activePendingProgressId);

              return (
                <div key={step.id} className="flex items-center gap-2 py-[2px]">
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {isActivePending || isPending ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground/75" />
                    ) : isError ? (
                      <AlertCircle className="h-2.5 w-2.5 text-destructive/75" />
                    ) : (
                      <Check className="h-2.5 w-2.5 text-foreground/55" />
                    )}
                  </span>
                  <span className={[
                    "text-[11.5px] leading-5",
                    isSuccess
                      ? "text-foreground/45 line-through decoration-foreground/25 decoration-[1px]"
                      : isError
                        ? "text-destructive/80"
                        : isActivePending
                          ? "text-foreground/85"
                          : "text-foreground/60",
                  ].join(" ")}>
                    {step.toolName || step.message || "未命名步骤"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

type AgentToolItemsProps = {
  items: AgentToolRenderItem[];
  groupId: string;
  isLastGroup?: boolean;
  expandedAgentGroupIds: Record<string, boolean>;
  expandedAgentResultIds: Record<string, boolean>;
  isCurrentGeneratingAssistant: boolean;
  activePendingExecutionCall?: ToolCallItem;
  activePendingProgressCall?: ToolCallItem;
  permissionRequest?: PermissionRequest | null;
  onResolvePermission?: (
    request: PermissionRequest,
    decision: "approved" | "denied",
    applySuggestions: boolean
  ) => void;
  onToggleGroupDetail: (groupId: string) => void;
  onToggleResultDetail: (toolCallId: string) => void;
};

export const AgentToolItems = ({
  items,
  groupId,
  isLastGroup = true,
  expandedAgentGroupIds,
  expandedAgentResultIds,
  isCurrentGeneratingAssistant,
  activePendingExecutionCall,
  activePendingProgressCall,
  permissionRequest,
  onResolvePermission,
  onToggleGroupDetail,
  onToggleResultDetail
}: AgentToolItemsProps) => {
  const groupExecutionCount = items.filter((item) =>
    item.kind === "single" ? !isProgressToolCall(item.toolCall) : true
  ).length;
  const hasPendingGroupItem = hasPendingToolInRenderItems(items);
  const isGroupExpanded =
    expandedAgentGroupIds[groupId] ?? (isCurrentGeneratingAssistant && hasPendingGroupItem);

  const statusLabel =
    isCurrentGeneratingAssistant && hasPendingGroupItem && isLastGroup ? "执行中" : "执行记录";

  return (
    <div className="mt-1.5">
      <button
        type="button"
        className="group/hdr mb-1 flex items-center gap-1.5 px-0.5 py-0.5 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground/75"
        onClick={() => onToggleGroupDetail(groupId)}
        aria-expanded={isGroupExpanded}
      >
        {isGroupExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>{statusLabel}</span>
        <span className="text-[10px] text-muted-foreground/55">{Math.max(groupExecutionCount, 1)} 步</span>
      </button>

      {isGroupExpanded ? (
        <div className="pl-1">
          {items.map((item, idx) => {
            const isLastItem = idx === items.length - 1;

            if (item.kind === "single") {
              const toolCall = item.toolCall;
              const isProgress = isProgressToolCall(toolCall);
              const isActivePending =
                isCurrentGeneratingAssistant &&
                (isProgress
                  ? activePendingProgressCall?.id === toolCall.id
                  : activePendingExecutionCall?.id === toolCall.id) &&
                toolCall.status === "pending";
              return (
                <AgentToolCallRow
                  key={toolCall.id}
                  toolCall={toolCall}
                  isActivePending={isActivePending}
                  isDetailExpanded={Boolean(expandedAgentResultIds[toolCall.id])}
                  onToggleDetail={() => onToggleResultDetail(toolCall.id)}
                  permissionRequest={permissionRequest}
                  onResolvePermission={onResolvePermission}
                  isLast={isLastItem}
                />
              );
            }

            const parent = item.parent;
            const isParentPending =
              isCurrentGeneratingAssistant &&
              activePendingExecutionCall?.id === parent.id &&
              parent.status === "pending";

            return (
              <AgentTodoProgressGroup
                key={parent.id}
                parent={parent}
                steps={item.steps}
                isParentPending={isParentPending}
                activePendingProgressId={activePendingProgressCall?.id}
                isParentDetailExpanded={Boolean(expandedAgentResultIds[parent.id])}
                onToggleParentDetail={() => onToggleResultDetail(parent.id)}
                isLast={isLastItem}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
