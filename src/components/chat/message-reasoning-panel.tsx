import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";

type MessageReasoningPanelProps = {
  isExpanded: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export const MessageReasoningPanel = ({
  isExpanded,
  onToggle,
  children
}: MessageReasoningPanelProps) => (
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
      思维链
    </Button>
    {isExpanded ? (
      <div className="mt-1.5 rounded-md border border-border bg-accent/42 px-3 py-2">
        {children}
      </div>
    ) : null}
  </div>
);
