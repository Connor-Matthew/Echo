import type { Dispatch, RefObject, SetStateAction } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { ChatContextWindow } from "../../shared/contracts";
import { Button } from "../ui/button";

type ContextWindowOption = { value: ChatContextWindow; label: string };

type ContextWindowPopoverProps = {
  quickSettingsRef: RefObject<HTMLDivElement>;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  options: ContextWindowOption[];
  selectedIndex: number;
  onChangeChatContextWindow: (value: ChatContextWindow) => void;
};

export const ContextWindowPopover = ({
  quickSettingsRef,
  isOpen,
  setIsOpen,
  options,
  selectedIndex,
  onChangeChatContextWindow
}: ContextWindowPopoverProps) => (
  <div className="relative" ref={quickSettingsRef}>
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-[32px] w-[32px] rounded-full bg-accent/55 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
      onClick={() => setIsOpen((previous) => !previous)}
      aria-label="上下文窗口设置"
      title="上下文档位"
    >
      <SlidersHorizontal className="h-4 w-4" />
    </Button>
    {isOpen ? (
      <div className="absolute bottom-full left-0 z-[60] mb-2 w-[236px] rounded-md border border-border bg-card p-2.5 shadow-[0_10px_20px_rgba(15,23,42,0.12)]">
        <p className="mb-1 px-1 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          上下文窗口
        </p>
        <input
          type="range"
          min={0}
          max={options.length - 1}
          step={1}
          value={selectedIndex}
          className="h-5 w-full accent-primary"
          aria-label="上下文窗口滑块"
          onChange={(event) => {
            const nextIndex = Number.parseInt(event.target.value, 10);
            if (!Number.isFinite(nextIndex)) {
              return;
            }
            const clampedIndex = Math.max(0, Math.min(options.length - 1, nextIndex));
            const nextOption = options[clampedIndex];
            if (nextOption) {
              onChangeChatContextWindow(nextOption.value);
            }
          }}
        />
        <div className="mt-1 flex items-center justify-between px-0.5 text-[11px] text-muted-foreground">
          {options.map((option, index) => (
            <span
              key={String(option.value)}
              className={index === selectedIndex ? "font-semibold text-foreground" : ""}
            >
              {option.label}
            </span>
          ))}
        </div>
      </div>
    ) : null}
  </div>
);
