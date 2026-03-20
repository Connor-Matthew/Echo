import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Bot,
  BookOpen,
  Cpu,
  Database,
  Download,
  MessageSquare,
  Palette,
  PanelLeft,
  PenLine,
  Pin,
  Plus,
  Server,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2
} from "lucide-react";
import { cn } from "../lib/utils";
import type { ChatSession, Skill } from "../shared/contracts";
import type { AgentSessionMeta } from "../shared/agent-contracts";
import { Button } from "./ui/button";

export type SettingsSection =
  | "provider"
  | "mcp"
  | "chat"
  | "memory"
  | "profile"
  | "skills"
  | "environment"
  | "theme"
  | "data"
  | "advanced"
  | "soul"
  | "journal";

type ChatSidebarProps = {
  mode: "chat";
  sessions: ChatSession[];
  activeSessionId: string;
  userSkills: Skill[];
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onRenameSession: (sessionId: string, title?: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onTogglePinSession: (sessionId: string) => void;
  onExportSession: (sessionId: string) => void;
  onExportSessionMarkdown: (sessionId: string) => void;
  onEnterAgent: () => void;
  onEnterSettings: (section?: SettingsSection) => void;
  onSaveUserSkills: (skills: Skill[]) => void;
  onToggleSidebar?: () => void;
};

type AgentSidebarProps = {
  mode: "agent";
  sessions: AgentSessionMeta[];
  activeSessionId: string;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onRenameSession: (sessionId: string, title?: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onEnterChat: () => void;
  onEnterSettings: (section?: SettingsSection) => void;
  onToggleSidebar?: () => void;
};

type SettingsSidebarProps = {
  mode: "settings";
  settingsSection: SettingsSection;
  onSelectSettingsSection: (section: SettingsSection) => void;
  onExitSettings: () => void;
  onToggleSidebar?: () => void;
};

type SidebarProps = ChatSidebarProps | AgentSidebarProps | SettingsSidebarProps;
type ChatContextMenuState = { sessionId: string; x: number; y: number };
type ChatSessionGroup = { label: string; sessions: ChatSession[] };
type ModeSwitch = "chat" | "agent";

const formatRelativeTime = (iso: string) => {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
};

const groupChatSessionsByRecency = (sessions: ChatSession[]): ChatSessionGroup[] => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfSevenDays = new Date(startOfToday);
  startOfSevenDays.setDate(startOfSevenDays.getDate() - 7);
  const startOfThirtyDays = new Date(startOfToday);
  startOfThirtyDays.setDate(startOfThirtyDays.getDate() - 30);

  const grouped: ChatSessionGroup[] = [
    { label: "今天", sessions: [] },
    { label: "7 天内", sessions: [] },
    { label: "30 天内", sessions: [] },
    { label: "更早", sessions: [] }
  ];

  sessions.forEach((session) => {
    const updatedAt = new Date(session.updatedAt);
    if (updatedAt >= startOfToday) {
      grouped[0].sessions.push(session);
      return;
    }
    if (updatedAt >= startOfSevenDays) {
      grouped[1].sessions.push(session);
      return;
    }
    if (updatedAt >= startOfThirtyDays) {
      grouped[2].sessions.push(session);
      return;
    }
    grouped[3].sessions.push(session);
  });

  return grouped.filter((group) => group.sessions.length > 0);
};

const ChatAgentModeSwitch = ({
  activeMode,
  onSelectChat,
  onSelectAgent
}: {
  activeMode: ModeSwitch;
  onSelectChat: () => void;
  onSelectAgent: () => void;
}) => {
  const isChat = activeMode === "chat";
  return (
    <div className="mode-switch-track relative grid grid-cols-2 rounded-full p-0.5">
      <span
        aria-hidden
        className={cn(
          "mode-switch-thumb pointer-events-none absolute bottom-0.5 left-0.5 top-0.5 w-[calc(50%-2px)] rounded-full",
          isChat ? "translate-x-0" : "translate-x-full"
        )}
      />
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "relative z-10 h-8 justify-center rounded-full text-[13px] transition-colors",
          isChat
            ? "font-semibold text-foreground hover:bg-transparent"
            : "text-foreground/80 hover:bg-card/45"
        )}
        onClick={() => {
          if (!isChat) {
            onSelectChat();
          }
        }}
      >
        Chat
      </Button>
      <Button
        type="button"
        variant="ghost"
        className={cn(
          "relative z-10 h-8 justify-center rounded-full text-[13px] transition-colors",
          isChat
            ? "text-foreground/80 hover:bg-card/45"
            : "font-semibold text-foreground hover:bg-transparent"
        )}
        onClick={() => {
          if (isChat) {
            onSelectAgent();
          }
        }}
      >
        Agent
      </Button>
    </div>
  );
};

export const Sidebar = (props: SidebarProps) => {
  const [editingChatSessionId, setEditingChatSessionId] = useState<string | null>(null);
  const [editingChatTitle, setEditingChatTitle] = useState("");
  const [editingAgentSessionId, setEditingAgentSessionId] = useState<string | null>(null);
  const [editingAgentTitle, setEditingAgentTitle] = useState("");
  const [chatContextMenu, setChatContextMenu] = useState<ChatContextMenuState | null>(null);
  const [agentContextMenu, setAgentContextMenu] = useState<ChatContextMenuState | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (props.mode === "chat" && editingChatSessionId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
      return;
    }
    setEditingChatSessionId(null);
    setEditingChatTitle("");
  }, [editingChatSessionId, props.mode]);

  useEffect(() => {
    if (props.mode === "agent" && editingAgentSessionId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
      return;
    }
    setEditingAgentSessionId(null);
    setEditingAgentTitle("");
  }, [editingAgentSessionId, props.mode]);

  useEffect(() => {
    if (props.mode !== "chat") {
      setChatContextMenu(null);
    }
  }, [props.mode]);

  useEffect(() => {
    if (!chatContextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (contextMenuRef.current && target instanceof Node && contextMenuRef.current.contains(target)) {
        return;
      }
      setChatContextMenu(null);
    };

    const closeMenu = () => setChatContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setChatContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [chatContextMenu]);

  useEffect(() => {
    if (props.mode !== "agent") {
      setAgentContextMenu(null);
    }
  }, [props.mode]);

  useEffect(() => {
    if (!agentContextMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (contextMenuRef.current && target instanceof Node && contextMenuRef.current.contains(target)) {
        return;
      }
      setAgentContextMenu(null);
    };

    const closeMenu = () => setAgentContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAgentContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [agentContextMenu]);

  const startChatRename = (session: ChatSession) => {
    if (props.mode !== "chat") {
      return;
    }
    setEditingChatSessionId(session.id);
    setEditingChatTitle(session.title);
    setChatContextMenu(null);
  };

  const cancelChatRename = () => {
    setEditingChatSessionId(null);
    setEditingChatTitle("");
  };

  const commitChatRename = () => {
    if (props.mode !== "chat" || !editingChatSessionId) {
      return;
    }
    const title = editingChatTitle.trim();
    const target = props.sessions.find((session) => session.id === editingChatSessionId);
    if (title && target && target.title !== title) {
      props.onRenameSession(editingChatSessionId, title);
    }
    cancelChatRename();
  };

  const startAgentRename = (session: AgentSessionMeta) => {
    if (props.mode !== "agent") {
      return;
    }
    setEditingAgentSessionId(session.id);
    setEditingAgentTitle(session.title);
    setAgentContextMenu(null);
  };

  const cancelAgentRename = () => {
    setEditingAgentSessionId(null);
    setEditingAgentTitle("");
  };

  const commitAgentRename = () => {
    if (props.mode !== "agent" || !editingAgentSessionId) {
      return;
    }
    const title = editingAgentTitle.trim();
    const target = props.sessions.find((session) => session.id === editingAgentSessionId);
    if (title && target && target.title !== title) {
      props.onRenameSession(editingAgentSessionId, title);
    }
    cancelAgentRename();
  };

  if (props.mode === "settings") {
    const settingsItems: Array<{
      key: SettingsSection;
      label: string;
      icon: typeof Server;
      group: string;
    }> = [
      { key: "provider", label: "渠道", icon: Server, group: "基础配置" },
      { key: "mcp", label: "MCP", icon: Server, group: "基础配置" },
      { key: "chat", label: "对话", icon: MessageSquare, group: "基础配置" },
      { key: "memory", label: "记忆", icon: Database, group: "能力增强" },
      { key: "profile", label: "画像", icon: PenLine, group: "能力增强" },
      { key: "skills", label: "技能", icon: Sparkles, group: "能力增强" },
      { key: "environment", label: "环境", icon: Cpu, group: "能力增强" },
      { key: "soul", label: "灵魂", icon: Bot, group: "能力增强" },
      { key: "journal", label: "日记", icon: BookOpen, group: "能力增强" },
      { key: "theme", label: "主题", icon: Palette, group: "界面与数据" },
      { key: "data", label: "数据", icon: Database, group: "界面与数据" },
      { key: "advanced", label: "高级", icon: SlidersHorizontal, group: "界面与数据" }
    ];

    return (
      <aside className="sidebar-surface flex h-full flex-col overflow-hidden px-3 pb-3 pt-3">
        <div className="-mt-[12px] mb-3 flex items-center justify-end">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground"
            onClick={props.onExitSettings}
            aria-label="返回对话"
            title="返回对话"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 px-1">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">设置导航</p>
          </div>
          <div className="space-y-1 pr-1">
            {settingsItems.map((item, index) => {
              const active = props.settingsSection === item.key;
              const Icon = item.icon;
              const showGroupTitle = index === 0 || settingsItems[index - 1]?.group !== item.group;
              return (
                <div key={item.key}>
                  {showGroupTitle ? (
                    <p className={cn("px-2 pb-1 pt-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground", index === 0 && "pt-0")}>
                      {item.group}
                    </p>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      "sidebar-nav-button h-9 w-full justify-start gap-2 rounded-full px-3 text-sm"
                    )}
                    data-active={active ? "true" : "false"}
                    onClick={() => props.onSelectSettingsSection(item.key)}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-2 pt-2">
          <div className="mt-1 flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            本地模式
          </div>
        </div>
      </aside>
    );
  }

  if (props.mode === "chat") {
    const sortedSessions = props.sessions;
    const pinnedSessions = sortedSessions.filter((session) => Boolean(session.isPinned));
    const groupedSessions = groupChatSessionsByRecency(
      sortedSessions.filter((session) => !Boolean(session.isPinned))
    );

    const contextMenuSession = chatContextMenu
      ? sortedSessions.find((session) => session.id === chatContextMenu.sessionId) ?? null
      : null;

    const contextMenuStyle = (() => {
      if (!chatContextMenu) {
        return { left: 0, top: 0 };
      }
      const viewportWidth = typeof window === "undefined" ? chatContextMenu.x + 200 : window.innerWidth;
      const viewportHeight =
        typeof window === "undefined" ? chatContextMenu.y + 200 : window.innerHeight;
      const menuWidth = 160;
      const menuHeight = 208;
      return {
        left: Math.max(8, Math.min(chatContextMenu.x, viewportWidth - menuWidth - 8)),
        top: Math.max(8, Math.min(chatContextMenu.y, viewportHeight - menuHeight - 8))
      };
    })();

    return (
      <>
        <aside className="sidebar-surface relative flex h-full flex-col overflow-hidden">
          <div className="px-5 pb-5 pt-4">
            <div className="-mt-[8px] mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_28px_hsl(var(--primary)/0.22)]">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[1.08rem] font-semibold tracking-[-0.03em] text-foreground">Echo</p>
                  <p className="mt-0.5 text-[11px] tracking-[0.04em] text-muted-foreground/80">
                    Creative partner for deep work
                  </p>
                </div>
              </div>
              {props.onToggleSidebar ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-muted-foreground hover:bg-card/80 hover:text-foreground"
                  onClick={props.onToggleSidebar}
                  aria-label="收缩侧边栏"
                  title="收缩侧边栏"
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            <Button
              className="mb-4 h-12 w-full justify-start rounded-[20px] border-0 bg-foreground/[0.045] px-3.5 text-foreground shadow-none hover:bg-foreground/[0.065]"
              onClick={props.onCreateSession}
            >
              <span className="mr-3 flex h-8 w-8 items-center justify-center rounded-[14px] bg-primary text-primary-foreground">
                <Plus className="h-4 w-4" />
              </span>
              New Chat
            </Button>

            <div className="space-y-1">
              <Button
                type="button"
                variant="ghost"
                className="sidebar-nav-button h-11 w-full justify-start rounded-[18px] px-3 text-[15px] text-foreground/82 hover:bg-card/75"
                data-active="true"
                onClick={() => props.onSelectSession(props.activeSessionId)}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                History
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="sidebar-nav-button h-11 w-full justify-start rounded-[18px] px-3 text-[15px] text-foreground/82 hover:bg-card/75"
                data-active="false"
                onClick={() => props.onEnterSettings("skills")}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Prompts
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="sidebar-nav-button h-11 w-full justify-start rounded-[18px] px-3 text-[15px] text-foreground/82 hover:bg-card/75"
                data-active="false"
                onClick={() => props.onEnterSettings("data")}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Library
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5 pt-4">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/72">Recent</p>
              <Button
                type="button"
                variant="ghost"
                className="h-8 rounded-full px-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:bg-card/75 hover:text-foreground"
                onClick={props.onEnterAgent}
              >
                Agent
              </Button>
            </div>
            <div className="echo-scrollbar-minimal min-h-0 space-y-5 overflow-auto">
              {pinnedSessions.length > 0 ? (
                <section>
                  <p className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.08] px-2.5 py-1 text-[12px] font-semibold text-primary">
                    <Pin className="h-3.5 w-3.5 fill-current" />
                    置顶
                  </p>
                  <div className="mt-2 space-y-1">
                    {pinnedSessions.map((session) => {
                      const active = session.id === props.activeSessionId;
                      const editing = session.id === editingChatSessionId;
                      const pinned = Boolean(session.isPinned);
                      return (
                        <article
                          key={session.id}
                          className="session-list-item rounded-[18px] transition-colors"
                          data-active={active ? "true" : "false"}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            cancelChatRename();
                            setChatContextMenu({
                              sessionId: session.id,
                              x: event.clientX,
                              y: event.clientY
                            });
                          }}
                        >
                          <button
                            type="button"
                            className={cn(
                              "session-list-item-button w-full rounded-[18px] px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              active ? "session-list-item-button-active" : ""
                            )}
                            onClick={() => {
                              if (!editing) {
                                props.onSelectSession(session.id);
                              }
                            }}
                          >
                            {editing ? (
                              <input
                                ref={editInputRef}
                                value={editingChatTitle}
                                onChange={(event) => setEditingChatTitle(event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                onBlur={commitChatRename}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    commitChatRename();
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelChatRename();
                                  }
                                }}
                                className="h-8 w-full rounded-xl border border-border/80 bg-background px-3 text-[14px] text-foreground outline-none ring-0 focus:border-primary"
                              />
                            ) : (
                              <p
                                className={cn(
                                  "session-list-item-title truncate text-[14px] font-medium text-foreground/90",
                                  active ? "session-list-item-title-active" : ""
                                )}
                                onDoubleClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  startChatRename(session);
                                }}
                              >
                                {session.title}
                              </p>
                            )}
                            <p
                              className={cn(
                                "session-list-item-meta mt-0.5 text-[12px] text-muted-foreground/85",
                                active ? "session-list-item-meta-active" : ""
                              )}
                            >
                              {pinned ? "置顶 · " : ""}
                              {formatRelativeTime(session.updatedAt)}
                            </p>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ) : null}
              {groupedSessions.map((group) => (
                <section key={group.label}>
                  <p className="px-1 text-[12px] font-semibold text-muted-foreground/85">{group.label}</p>
                  <div className="mt-1.5 space-y-1">
                    {group.sessions.map((session) => {
                      const active = session.id === props.activeSessionId;
                      const editing = session.id === editingChatSessionId;
                      const pinned = Boolean(session.isPinned);
                      return (
                        <article
                          key={session.id}
                          className="session-list-item rounded-[18px] transition-colors"
                          data-active={active ? "true" : "false"}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            cancelChatRename();
                            setChatContextMenu({
                              sessionId: session.id,
                              x: event.clientX,
                              y: event.clientY
                            });
                          }}
                        >
                          <button
                            type="button"
                            className={cn(
                              "session-list-item-button w-full rounded-[18px] px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              active ? "session-list-item-button-active" : ""
                            )}
                            onClick={() => {
                              if (!editing) {
                                props.onSelectSession(session.id);
                              }
                            }}
                          >
                            {editing ? (
                              <input
                                ref={editInputRef}
                                value={editingChatTitle}
                                onChange={(event) => setEditingChatTitle(event.target.value)}
                                onClick={(event) => event.stopPropagation()}
                                onBlur={commitChatRename}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    commitChatRename();
                                  }
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    cancelChatRename();
                                  }
                                }}
                                className="h-8 w-full rounded-xl border border-border/80 bg-background px-3 text-[14px] text-foreground outline-none ring-0 focus:border-primary"
                              />
                            ) : (
                              <p
                                className={cn(
                                  "session-list-item-title truncate text-[14px] font-medium text-foreground/90",
                                  active ? "session-list-item-title-active" : ""
                                )}
                                onDoubleClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  startChatRename(session);
                                }}
                              >
                                {session.title}
                              </p>
                            )}
                            <p
                              className={cn(
                                "session-list-item-meta mt-0.5 text-[12px] text-muted-foreground/85",
                                active ? "session-list-item-meta-active" : ""
                              )}
                            >
                              {pinned ? "置顶 · " : ""}
                              {formatRelativeTime(session.updatedAt)}
                            </p>
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <div className="border-t border-border/45 px-5 pb-5 pt-4">
            <div className="mb-3 rounded-[24px] border border-border/55 bg-card/68 p-4 shadow-[0_16px_32px_rgba(79,60,35,0.05)]">
              <p className="text-[15px] font-semibold tracking-[-0.02em] text-foreground">Ready to create</p>
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                Keep the stage clean and drop into Agent mode when the task needs deeper execution.
              </p>
            </div>
            <Button
              variant="ghost"
              className="h-11 w-full justify-start rounded-[18px] text-sm text-foreground/82 hover:bg-card/80"
              onClick={() => props.onEnterSettings("provider")}
            >
              <Settings className="mr-1 h-4 w-4" />
              Settings
            </Button>
          </div>
        </aside>
        {chatContextMenu && contextMenuSession && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={contextMenuRef}
                className="fixed z-[90] w-40 rounded-[18px] border border-border bg-card p-1.5 shadow-[0_16px_40px_rgba(42,37,30,0.08)]"
                style={contextMenuStyle}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-foreground/90 hover:bg-accent/70"
                  onClick={() => {
                    props.onTogglePinSession(contextMenuSession.id);
                    setChatContextMenu(null);
                  }}
                >
                  <Pin className={cn("h-3.5 w-3.5", contextMenuSession.isPinned && "fill-current")} />
                  {contextMenuSession.isPinned ? "取消置顶" : "置顶会话"}
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-foreground/90 hover:bg-accent/70"
                  onClick={() => startChatRename(contextMenuSession)}
                >
                  <PenLine className="h-3.5 w-3.5" />
                  重命名
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-foreground/90 hover:bg-accent/70"
                  onClick={() => {
                    props.onExportSession(contextMenuSession.id);
                    setChatContextMenu(null);
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  导出 JSON
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-foreground/90 hover:bg-accent/70"
                  onClick={() => {
                    props.onExportSessionMarkdown(contextMenuSession.id);
                    setChatContextMenu(null);
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                  导出 Markdown
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-destructive hover:bg-accent/70"
                  onClick={() => {
                    props.onDeleteSession(contextMenuSession.id);
                    setChatContextMenu(null);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </div>,
              document.body
            )
          : null}

      </>
    );
  }

  if (props.mode === "agent") {
    const contextMenuSession = agentContextMenu
      ? props.sessions.find((session) => session.id === agentContextMenu.sessionId) ?? null
      : null;

    const contextMenuStyle = (() => {
      if (!agentContextMenu) {
        return { left: 0, top: 0 };
      }
      const viewportWidth = typeof window === "undefined" ? agentContextMenu.x + 180 : window.innerWidth;
      const viewportHeight =
        typeof window === "undefined" ? agentContextMenu.y + 120 : window.innerHeight;
      const menuWidth = 144;
      const menuHeight = 92;
      return {
        left: Math.max(8, Math.min(agentContextMenu.x, viewportWidth - menuWidth - 8)),
        top: Math.max(8, Math.min(agentContextMenu.y, viewportHeight - menuHeight - 8))
      };
    })();

    return (
      <>
        <aside className="sidebar-surface relative flex h-full flex-col overflow-hidden">
          <div className="px-5 pb-5 pt-4">
            <div className="-mt-[8px] mb-5 flex items-center justify-between">
              <div>
                <p className="text-[1.02rem] font-semibold tracking-[-0.02em] text-foreground">Agent</p>
                <p className="mt-0.5 text-[11px] tracking-[0.04em] text-muted-foreground/80">
                  Task execution workspace
                </p>
              </div>
              {props.onToggleSidebar ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-muted-foreground hover:bg-card hover:text-foreground"
                  onClick={props.onToggleSidebar}
                  aria-label="收缩侧边栏"
                  title="收缩侧边栏"
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
            <ChatAgentModeSwitch
              activeMode="agent"
              onSelectChat={props.onEnterChat}
              onSelectAgent={() => {}}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5 pt-4">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/72">Agent 会话</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full hover:bg-card"
                onClick={props.onCreateSession}
                aria-label="新增 Agent 会话"
                title="新增 Agent 会话"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="echo-scrollbar-minimal min-h-0 space-y-1 overflow-auto">
              {props.sessions.map((session) => {
                const active = session.id === props.activeSessionId;
                const editing = session.id === editingAgentSessionId;
                return (
                  <article
                    key={session.id}
                    className="session-list-item rounded-[18px] transition-colors"
                    data-active={active ? "true" : "false"}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      cancelAgentRename();
                      setAgentContextMenu({
                        sessionId: session.id,
                        x: event.clientX,
                        y: event.clientY
                      });
                    }}
                  >
                    <button
                      type="button"
                      className={cn(
                        "session-list-item-button w-full rounded-[18px] px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "session-list-item-button-active" : ""
                      )}
                      onClick={() => {
                        if (!editing) {
                          props.onSelectSession(session.id);
                        }
                      }}
                    >
                      {editing ? (
                        <input
                          ref={editInputRef}
                          value={editingAgentTitle}
                          onChange={(event) => setEditingAgentTitle(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          onBlur={commitAgentRename}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitAgentRename();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelAgentRename();
                            }
                          }}
                          className="h-8 w-full rounded-xl border border-border/80 bg-background px-3 text-[14px] text-foreground outline-none ring-0 focus:border-primary"
                        />
                      ) : (
                        <p
                          className={cn(
                            "session-list-item-title truncate text-[14px] font-medium text-foreground/90",
                            active ? "session-list-item-title-active" : ""
                          )}
                          onDoubleClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            startAgentRename(session);
                          }}
                        >
                          {session.title}
                        </p>
                      )}
                      <p
                        className={cn(
                          "session-list-item-meta mt-0.5 text-[12px] text-muted-foreground/85",
                          active ? "session-list-item-meta-active" : ""
                        )}
                      >
                        {formatRelativeTime(session.updatedAt)}
                      </p>
                    </button>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border/55 px-4 py-3">
            <Button
              variant="ghost"
              className="h-10 w-full justify-start rounded-full text-sm text-foreground/78 hover:bg-card/80"
              onClick={() => props.onEnterSettings("provider")}
            >
              <Settings className="mr-1 h-4 w-4" />
              设置
            </Button>
          </div>
        </aside>
        {agentContextMenu && contextMenuSession && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={contextMenuRef}
                className="fixed z-[90] w-36 rounded-lg border border-border bg-card p-1 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
                style={contextMenuStyle}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground/90 hover:bg-accent/70"
                  onClick={() => startAgentRename(contextMenuSession)}
                >
                  <PenLine className="h-3.5 w-3.5" />
                  重命名
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent/70"
                  onClick={() => {
                    props.onDeleteSession(contextMenuSession.id);
                    setAgentContextMenu(null);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </div>,
              document.body
            )
          : null}
      </>
    );
  }

  return null;
};
