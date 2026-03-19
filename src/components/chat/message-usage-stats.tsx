import { ArrowDown, ArrowUp } from "lucide-react";
import type { ChatMessageUsage } from "../../shared/contracts";

type MessageUsageStatsProps = {
  usage: ChatMessageUsage | null;
  formatTokenCount: (value: number) => string;
};

export const getMessageUsageStatsClassName = (source: ChatMessageUsage["source"]) =>
  [
    "mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border/65 bg-background px-2.5 py-1 text-[11px] font-medium tabular-nums leading-none transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
    source === "provider" ? "text-muted-foreground" : "text-muted-foreground/78"
  ].join(" ");

export const getMessageUsageItemClassName = () => "inline-flex items-center gap-0.5";

export const getMessageUsageLabelClassName = () => "text-[11px] font-semibold tracking-[0.01em]";

export const MessageUsageStats = ({ usage, formatTokenCount }: MessageUsageStatsProps) => {
  if (!usage) {
    return null;
  }

  return (
    <div
      className={getMessageUsageStatsClassName(usage.source)}
      title={usage.source === "provider" ? "Provider usage" : "Estimated usage"}
    >
      <span className={getMessageUsageItemClassName()}>
        <ArrowUp className="h-3 w-3" />
        {formatTokenCount(usage.inputTokens)}
      </span>
      <span className={getMessageUsageItemClassName()}>
        <ArrowDown className="h-3 w-3" />
        {formatTokenCount(usage.outputTokens)}
      </span>
      <span className={getMessageUsageItemClassName()}>
        <span className={getMessageUsageLabelClassName()}>cache</span>
        {formatTokenCount(usage.cacheReadTokens)}
      </span>
      <span className={getMessageUsageItemClassName()}>
        <span className={`${getMessageUsageLabelClassName()} uppercase`}>CW</span>
        {formatTokenCount(usage.cacheWriteTokens)}
      </span>
    </div>
  );
};
