import type { Dispatch, RefObject, SetStateAction } from "react";
import { Server } from "lucide-react";
import type { UserMcpServer } from "../../shared/contracts";
import { Button } from "../ui/button";

type McpPickerPopoverProps = {
  mcpServers: UserMcpServer[];
  enabledMcpServers: string[];
  activeMcpCount: number;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  popoverRef: RefObject<HTMLDivElement>;
  onToggleMcp: (id: string) => void;
};

export const McpPickerPopover = ({
  mcpServers,
  enabledMcpServers,
  activeMcpCount,
  isOpen,
  setIsOpen,
  popoverRef,
  onToggleMcp
}: McpPickerPopoverProps) => {
  const availableServers = mcpServers.filter((server) => server.enabled);

  if (availableServers.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={popoverRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={[
          "relative h-[32px] w-[32px] rounded-full bg-accent/55 hover:bg-accent/80",
          activeMcpCount > 0 ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        ].join(" ")}
        onClick={() => setIsOpen((previous) => !previous)}
        aria-label="选择 MCP 工具"
        title="MCP 工具"
      >
        <Server className="h-4 w-4" />
        {activeMcpCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-primary text-[9px] font-bold text-primary-foreground">
            {activeMcpCount}
          </span>
        ) : null}
      </Button>
      {isOpen ? (
        <div className="absolute bottom-full left-0 z-[60] mb-2 w-[220px] rounded-md border border-border bg-card p-2 shadow-[0_10px_20px_rgba(15,23,42,0.12)]">
          <p className="mb-1.5 px-1 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            MCP 工具
          </p>
          <div className="space-y-0.5">
            {availableServers.map((server) => {
              const isOn = enabledMcpServers.includes(server.id);
              return (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => onToggleMcp(server.id)}
                  className={[
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    isOn ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  ].join(" ")}
                >
                  <span className={["flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border", isOn ? "border-primary bg-primary text-primary-foreground" : "border-border"].join(" ")}>
                    {isOn ? <span className="text-[10px] font-bold">✓</span> : null}
                  </span>
                  <span className="truncate">{server.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
