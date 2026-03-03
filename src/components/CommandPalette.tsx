import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "../lib/utils";
import { Input } from "./ui/input";
import {
  buildCommandHighlightParts,
  filterCommandPaletteItems,
  formatCommandShortcut,
  groupCommandPaletteItems,
  sortCommandPaletteItemsByRecent
} from "./command-palette/command-palette-utils";
import { detectIsMacPlatform } from "./command-palette/shortcut-utils";

export type CommandPaletteCommand = {
  id: string;
  title: string;
  group?: string;
  description?: string;
  keywords?: string[];
  aliases?: string[];
  shortcut?: string;
  onSelect: () => void;
};

type CommandPaletteProps = {
  isOpen: boolean;
  commands: CommandPaletteCommand[];
  onClose: () => void;
};

const COMMAND_PALETTE_RECENT_STORAGE_KEY = "echo.commandPalette.recent.v1";
const COMMAND_PALETTE_RECENT_LIMIT = 8;

export const CommandPalette = ({ isOpen, commands, onClose }: CommandPaletteProps) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isMac = useMemo(() => detectIsMacPlatform(), []);

  const filteredCommands = useMemo(() => {
    const searched = filterCommandPaletteItems(commands, query);
    if (query.trim()) {
      return searched;
    }
    return sortCommandPaletteItemsByRecent(searched, recentCommandIds);
  }, [commands, query, recentCommandIds]);
  const groupedCommands = useMemo(
    () => groupCommandPaletteItems(filteredCommands, "通用"),
    [filteredCommands]
  );
  const indexByCommandId = useMemo(
    () => new Map(filteredCommands.map((command, index) => [command.id, index])),
    [filteredCommands]
  );
  const recentCommandIdSet = useMemo(() => new Set(recentCommandIds), [recentCommandIds]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COMMAND_PALETTE_RECENT_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter((value): value is string => typeof value === "string");
        setRecentCommandIds(cleaned.slice(0, COMMAND_PALETTE_RECENT_LIMIT));
      }
    } catch {
      // no-op: recent history is optional
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        COMMAND_PALETTE_RECENT_STORAGE_KEY,
        JSON.stringify(recentCommandIds)
      );
    } catch {
      // no-op: recent history persistence failure should not break command execution
    }
  }, [recentCommandIds]);

  const executeCommand = (command: CommandPaletteCommand) => {
    setRecentCommandIds((previous) => {
      const next = [command.id, ...previous.filter((id) => id !== command.id)];
      return next.slice(0, COMMAND_PALETTE_RECENT_LIMIT);
    });
    command.onSelect();
  };

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
      return;
    }
    setSelectedIndex(0);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setSelectedIndex((previous) => {
      if (filteredCommands.length === 0) {
        return 0;
      }
      return Math.min(previous, filteredCommands.length - 1);
    });
  }, [filteredCommands, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (!filteredCommands.length) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((previous) => (previous + 1) % filteredCommands.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((previous) =>
          previous <= 0 ? filteredCommands.length - 1 : previous - 1
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const command = filteredCommands[selectedIndex];
        if (command) {
          executeCommand(command);
        }
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [filteredCommands, isOpen, onClose, selectedIndex]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center bg-background/60 px-4 pb-8 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      data-no-drag="true"
      role="presentation"
    >
      <div className="surface-1 w-full max-w-[720px] overflow-hidden rounded-xl">
        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入命令，例如：新建聊天、切换到 Agent、打开设置..."
            className="h-8 border-none bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            aria-label="Command Palette Search"
          />
          <kbd className="rounded border border-border/70 px-1.5 py-0.5 text-[11px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {!query.trim() ? (
            <p className="px-2 pb-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              最近执行优先
            </p>
          ) : null}
          {filteredCommands.length === 0 ? (
            <div className="rounded-md px-3 py-8 text-center text-sm text-muted-foreground">
              没找到匹配命令
            </div>
          ) : (
            <div className="grid gap-2">
              {groupedCommands.map((section) => (
                <section key={section.group} className="grid gap-1">
                  <p className="px-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {section.group}
                  </p>
                  <ul className="grid gap-1" role="listbox" aria-label={`${section.group} Command List`}>
                    {section.items.map((command) => {
                      const index = indexByCommandId.get(command.id) ?? -1;
                      const isActive = index === selectedIndex;
                      const shortcutLabel = command.shortcut
                        ? formatCommandShortcut(command.shortcut, isMac)
                        : "";
                      const titleParts = buildCommandHighlightParts(command.title, query);
                      const isRecent = recentCommandIdSet.has(command.id);

                      return (
                        <li key={command.id}>
                          <button
                            type="button"
                            className={cn(
                              "w-full rounded-md border px-3 py-2 text-left transition-colors",
                              isActive
                                ? "border-primary/45 bg-primary/10"
                                : "border-transparent hover:border-border/75 hover:bg-accent/45"
                            )}
                            onMouseEnter={() => {
                              if (index >= 0) {
                                setSelectedIndex(index);
                              }
                            }}
                            onClick={() => {
                              executeCommand(command);
                              onClose();
                            }}
                            role="option"
                            aria-selected={isActive}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm text-foreground">
                                {titleParts.map((part, partIndex) => (
                                  <span
                                    key={`${command.id}-${partIndex}`}
                                    className={part.matched ? "font-semibold text-primary" : ""}
                                  >
                                    {part.text}
                                  </span>
                                ))}
                              </p>
                              <div className="flex items-center gap-1.5">
                                {isRecent ? (
                                  <span className="rounded border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    最近
                                  </span>
                                ) : null}
                                {shortcutLabel ? (
                                  <kbd className="rounded border border-border/70 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                    {shortcutLabel}
                                  </kbd>
                                ) : null}
                              </div>
                            </div>
                            {command.description ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">{command.description}</p>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
