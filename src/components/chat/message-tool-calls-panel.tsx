import { ChevronDown, ChevronRight } from "lucide-react";
import type { ToolCall } from "../../shared/contracts";
import { Button } from "../ui/button";

type MessageToolCallsPanelProps = {
  toolCalls: ToolCall[];
  isExpanded: boolean;
  onToggle: () => void;
};

export const MessageToolCallsPanel = ({
  toolCalls,
  isExpanded,
  onToggle
}: MessageToolCallsPanelProps) => {
  if (!toolCalls.length) {
    return null;
  }

  return (
    <div className="mb-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
        onClick={onToggle}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        工具调用 ({toolCalls.length})
      </Button>
      {isExpanded ? (
        <div className="mt-1.5 max-h-48 space-y-1 overflow-auto rounded-md border border-border bg-accent/35 px-3 py-2">
          {toolCalls.map((toolCall) => (
            <div key={toolCall.id} className="flex items-start gap-1.5 text-xs leading-5">
              <span
                className={
                  toolCall.status === "error"
                    ? "text-destructive"
                    : toolCall.status === "pending"
                      ? "text-muted-foreground"
                      : "text-green-500"
                }
              >
                {toolCall.status === "error" ? "✗" : toolCall.status === "pending" ? "…" : "✓"}
              </span>
              <span className="text-muted-foreground">[{toolCall.serverName}]</span>
              <span className="font-medium text-foreground/80">{toolCall.toolName}</span>
              {toolCall.message ? <span className="text-muted-foreground">{toolCall.message}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
