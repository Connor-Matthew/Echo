import {
  ArrowLeft,
  Bot,
  Clock3,
  Database,
  MessageSquare,
  Palette,
  PenLine,
  Plus,
  Server,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2
} from "lucide-react";
import { cn } from "../lib/utils";
import type { ChatSession } from "../shared/contracts";
import { Button } from "./ui/button";

export type SettingsSection = "provider" | "chat" | "theme" | "data" | "advanced";

type ChatSidebarProps = {
  mode: "chat";
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onRenameSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onEnterSettings: () => void;
};

type SettingsSidebarProps = {
  mode: "settings";
  settingsSection: SettingsSection;
  onSelectSettingsSection: (section: SettingsSection) => void;
  onExitSettings: () => void;
};

type SidebarProps = ChatSidebarProps | SettingsSidebarProps;

const formatRelativeTime = (iso: string) => {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
};

export const Sidebar = (props: SidebarProps) => {
  if (props.mode === "settings") {
    const settingsItems: Array<{ key: SettingsSection; label: string; icon: typeof Server }> = [
      { key: "provider", label: "Provider", icon: Server },
      { key: "chat", label: "Chat", icon: MessageSquare },
      { key: "theme", label: "Theme", icon: Palette },
      { key: "data", label: "Data", icon: Database },
      { key: "advanced", label: "Advanced", icon: SlidersHorizontal }
    ];

    return (
      <aside className="flex h-full flex-col overflow-hidden border-r border-border bg-[#edf1f5] px-3 pb-3 pt-5 dark:bg-[#121f33]">
        <div className="space-y-1 pb-4">
          <Button
            variant="ghost"
            className="h-9 w-full justify-start gap-2 px-2 text-sm font-semibold text-foreground/90"
            onClick={props.onExitSettings}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to chat
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 px-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Settings</p>
          </div>
          <div className="space-y-1 pr-1">
            {settingsItems.map((item) => {
              const active = props.settingsSection === item.key;
              const Icon = item.icon;
              return (
                <Button
                  key={item.key}
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-9 w-full justify-start gap-2 rounded-md border border-transparent px-2 text-sm",
                    active
                      ? "border-[#d5dfea] bg-[#f8fbff] text-[#22374d] dark:border-[#355073] dark:bg-[#1a2a44] dark:text-[#d8e7fa]"
                      : "text-foreground/80 hover:bg-white/60 dark:hover:bg-[#192941]"
                  )}
                  onClick={() => props.onSelectSettingsSection(item.key)}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 border-t border-border/80 pt-2">
          <div className="mt-1 flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            Local mode
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-border bg-[#edf1f5] px-3 pb-3 pt-5 dark:bg-[#121f33]">
      <div className="space-y-1 pb-4">
        <Button
          variant="ghost"
          className="h-9 w-full justify-start gap-2 px-2 text-sm font-semibold text-foreground/90"
          onClick={props.onCreateSession}
        >
          <PenLine className="h-4 w-4" />
          New thread
        </Button>
        <Button
          variant="ghost"
          className="h-9 w-full justify-start gap-2 px-2 text-sm text-foreground/80"
        >
          <Clock3 className="h-4 w-4" />
          Automations
        </Button>
        <Button
          variant="ghost"
          className="h-9 w-full justify-start gap-2 px-2 text-sm text-foreground/80"
        >
          <Sparkles className="h-4 w-4" />
          Skills
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Threads</p>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 rounded-md"
            onClick={props.onCreateSession}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="min-h-0 space-y-1 overflow-auto pr-1">
          {props.sessions.map((session) => {
            const active = session.id === props.activeSessionId;
            return (
              <article
                key={session.id}
                className={cn(
                  "group relative rounded-md border border-transparent bg-transparent transition-colors",
                  active && "border-[#d5dfea] bg-[#f8fbff] dark:border-[#355073] dark:bg-[#1a2a44]"
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-1.5 h-6 w-0.5 rounded bg-transparent",
                    active && "bg-primary"
                  )}
                />
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left"
                  onClick={() => props.onSelectSession(session.id)}
                >
                  <p className="truncate text-sm text-foreground">{session.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatRelativeTime(session.updatedAt)}
                  </p>
                </button>
                <div className="absolute right-1 top-1 hidden items-center gap-1 rounded-md bg-card/95 p-0.5 group-hover:flex group-focus-within:flex">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-md"
                    onClick={() => props.onRenameSession(session.id)}
                    aria-label="Rename thread"
                  >
                    <PenLine className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-md text-destructive hover:text-destructive"
                    onClick={() => props.onDeleteSession(session.id)}
                    aria-label="Delete thread"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="mt-3 border-t border-border/80 pt-2">
        <Button
          variant="ghost"
          className="h-9 w-full justify-start gap-2 px-2 text-sm text-foreground/80"
          onClick={props.onEnterSettings}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Button>
        <div className="mt-3 flex items-center gap-2 px-2 text-xs text-muted-foreground">
          <Bot className="h-3.5 w-3.5" />
          Local mode
        </div>
      </div>
    </aside>
  );
};
