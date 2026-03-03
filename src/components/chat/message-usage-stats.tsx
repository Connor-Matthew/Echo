import { ArrowDown, ArrowUp } from "lucide-react";
import type { ChatMessageUsage } from "../../shared/contracts";

type MessageUsageStatsProps = {
  usage: ChatMessageUsage | null;
  formatTokenCount: (value: number) => string;
};

export const MessageUsageStats = ({ usage, formatTokenCount }: MessageUsageStatsProps) => {
  if (!usage) {
    return null;
  }

  return (
    <div
      className={[
        "mt-1 inline-flex items-center gap-2 text-[13px] font-medium tabular-nums",
        usage.source === "provider" ? "text-muted-foreground" : "text-muted-foreground/80"
      ].join(" ")}
      title={usage.source === "provider" ? "Provider usage" : "Estimated usage"}
    >
      <span className="inline-flex items-center gap-1">
        <ArrowUp className="h-3 w-3" />
        {formatTokenCount(usage.inputTokens)}
      </span>
      <span className="inline-flex items-center gap-1">
        <ArrowDown className="h-3 w-3" />
        {formatTokenCount(usage.outputTokens)}
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="text-[11px] font-semibold tracking-wide">cache</span>
        {formatTokenCount(usage.cacheReadTokens)}
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide">CW</span>
        {formatTokenCount(usage.cacheWriteTokens)}
      </span>
    </div>
  );
};
