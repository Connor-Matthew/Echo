import type { CommandPaletteCommand } from "../../components/CommandPalette";
import type { SettingsSection } from "../../components/Sidebar";
import type { AgentSessionMeta } from "../../shared/agent-contracts";
import type { ChatSession } from "../../shared/contracts";
import { buildSessionSearchMetadata } from "./command-palette-session-search";

type AppViewMode = "chat" | "agent" | "settings";

type BuildCommandPaletteCommandsArgs = {
  shell: {
    activeView: AppViewMode;
    isSidebarOpen: boolean;
    closeSidebarIfCompact: () => void;
    setActiveView: (view: AppViewMode) => void;
    setIsSidebarOpen: (updater: (previous: boolean) => boolean) => void;
    openSettings: (section: SettingsSection) => void;
  };
  chat: {
    activeSession: ChatSession | null | undefined;
    orderedChatSessions: ChatSession[];
    isGenerating: boolean;
    setActiveSessionId: (sessionId: string) => void;
    createNewChat: () => void;
    renameChat: (sessionId: string) => void;
    toggleChatPin: (sessionId: string) => void;
    exportSession: (sessionId: string) => void;
    exportSessionMarkdown: (sessionId: string) => void;
    deleteChat: (sessionId: string) => void;
    stopGenerating: () => Promise<void> | void;
    exportSessions: () => void;
    clearAllSessions: () => void;
  };
  agent: {
    activeAgentSession: AgentSessionMeta | null;
    agentSessions: AgentSessionMeta[];
    isAgentRunning: boolean;
    setActiveAgentSessionId: (sessionId: string) => void;
    createNewAgentSession: () => Promise<void> | void;
    renameAgentSession: (sessionId: string) => Promise<void> | void;
    deleteAgentSession: (sessionId: string) => Promise<void> | void;
    stopAgentRun: () => Promise<void> | void;
  };
  settings: {
    resetSettings: () => Promise<void> | void;
  };
  focusComposerInView: (view: "chat" | "agent") => void;
};

export const buildCommandPaletteCommands = ({
  shell,
  chat,
  agent,
  settings,
  focusComposerInView,
}: BuildCommandPaletteCommandsArgs): CommandPaletteCommand[] => {
  const {
    activeView,
    isSidebarOpen,
    closeSidebarIfCompact,
    setActiveView,
    setIsSidebarOpen,
    openSettings
  } = shell;
  const {
    activeSession,
    orderedChatSessions,
    isGenerating,
    setActiveSessionId,
    createNewChat,
    renameChat,
    toggleChatPin,
    exportSession,
    exportSessionMarkdown,
    deleteChat,
    stopGenerating,
    exportSessions,
    clearAllSessions
  } = chat;
  const {
    activeAgentSession,
    agentSessions,
    isAgentRunning,
    setActiveAgentSessionId,
    createNewAgentSession,
    renameAgentSession,
    deleteAgentSession,
    stopAgentRun
  } = agent;
  const { resetSettings } = settings;
  const commands: CommandPaletteCommand[] = [
    {
      id: "new-chat",
      group: "会话",
      title: "新建 Chat 会话",
      description: "创建并切换到一个新的聊天会话",
      keywords: ["new", "chat", "session", "新建", "会话"],
      aliases: ["xinjianchat", "xjchat", "newchat"],
      shortcut: "mod+n",
      onSelect: () => {
        setActiveView("chat");
        createNewChat();
      }
    },
    {
      id: "new-agent-session",
      group: "会话",
      title: "新建 Agent 会话",
      description: "创建并切换到一个新的 Agent 任务会话",
      keywords: ["new", "agent", "session", "新建", "任务"],
      aliases: ["xinjianagent", "xjagent", "newagent"],
      shortcut: "mod+shift+n",
      onSelect: () => {
        setActiveView("agent");
        void createNewAgentSession();
      }
    },
    {
      id: "chat-export-all-json",
      group: "Chat 会话",
      title: "导出全部 Chat（JSON）",
      keywords: ["chat", "export", "all", "json", "导出"],
      aliases: ["daochu", "dcchat", "exportallchat"],
      onSelect: () => exportSessions()
    },
    {
      id: "chat-clear-all",
      group: "Chat 会话",
      title: "清空全部 Chat 会话",
      keywords: ["chat", "clear", "all", "删除", "清空"],
      aliases: ["qingkong", "qkchat", "clearallchat"],
      onSelect: () => {
        if (!window.confirm("确认清空全部 Chat 会话吗？该操作不可撤销。")) {
          return;
        }
        clearAllSessions();
      }
    },
    {
      id: "settings-reset-default",
      group: "设置",
      title: "重置设置为默认值",
      keywords: ["settings", "reset", "default", "重置"],
      aliases: ["chongzhi", "czsz", "resetsettings"],
      onSelect: () => {
        if (!window.confirm("确认将设置重置为默认值吗？")) {
          return;
        }
        void resetSettings();
      }
    },
    {
      id: "switch-chat",
      group: "导航",
      title: "切换到 Chat",
      keywords: ["chat", "view", "聊天", "切换"],
      aliases: ["liaotian", "lt", "chatview"],
      shortcut: "mod+1",
      onSelect: () => {
        setActiveView("chat");
      }
    },
    {
      id: "switch-agent",
      group: "导航",
      title: "切换到 Agent",
      keywords: ["agent", "view", "代理", "切换"],
      aliases: ["daili", "dl", "agentview"],
      shortcut: "mod+2",
      onSelect: () => {
        setActiveView("agent");
      }
    },
    {
      id: "switch-settings",
      group: "导航",
      title: "切换到 Settings",
      keywords: ["settings", "view", "设置", "切换"],
      aliases: ["shezhi", "sz", "settingsview"],
      shortcut: "mod+3",
      onSelect: () => {
        setActiveView("settings");
      }
    },
    {
      id: "settings-provider",
      group: "设置",
      title: "打开设置 / Provider",
      keywords: ["settings", "provider", "配置", "模型"],
      aliases: ["shezhiprovider", "szprovider", "mxpz"],
      onSelect: () => openSettings("provider")
    },
    {
      id: "settings-mcp",
      group: "设置",
      title: "打开设置 / MCP",
      keywords: ["settings", "mcp", "tools", "工具"],
      aliases: ["shezhimcp", "szmcp", "mcp"],
      onSelect: () => openSettings("mcp")
    },
    {
      id: "settings-memory",
      group: "设置",
      title: "打开设置 / Memory",
      keywords: ["settings", "memory", "记忆"],
      aliases: ["shezhimemory", "szmemory", "jiyi"],
      onSelect: () => openSettings("memory")
    },
    {
      id: "settings-profile",
      group: "设置",
      title: "打开设置 / Profile",
      keywords: ["settings", "profile", "画像", "用户画像"],
      aliases: ["shezhiprofile", "szprofile", "huaxiang", "yonghuhuaxiang"],
      onSelect: () => openSettings("profile")
    },
    {
      id: "settings-skills",
      group: "设置",
      title: "打开设置 / Skills",
      keywords: ["settings", "skills", "技能"],
      aliases: ["shezhiskills", "szskills", "jineng"],
      onSelect: () => openSettings("skills")
    },
    {
      id: "settings-theme",
      group: "设置",
      title: "打开设置 / Theme",
      keywords: ["settings", "theme", "主题"],
      aliases: ["shezhitheme", "sztheme", "zhuti"],
      onSelect: () => openSettings("theme")
    },
    {
      id: "settings-chat",
      group: "设置",
      title: "打开设置 / Chat",
      keywords: ["settings", "chat", "聊天"],
      aliases: ["shezhichat", "szchat", "liaotian"],
      onSelect: () => openSettings("chat")
    },
    {
      id: "settings-environment",
      group: "设置",
      title: "打开设置 / Environment",
      keywords: ["settings", "environment", "环境"],
      aliases: ["shezhienv", "szenv", "huanjing"],
      onSelect: () => openSettings("environment")
    },
    {
      id: "settings-data",
      group: "设置",
      title: "打开设置 / Data",
      keywords: ["settings", "data", "导入", "导出"],
      aliases: ["shezhidata", "szdata", "daoru", "daochu"],
      onSelect: () => openSettings("data")
    },
    {
      id: "settings-advanced",
      group: "设置",
      title: "打开设置 / Advanced",
      keywords: ["settings", "advanced", "高级"],
      aliases: ["shezhiadvanced", "szadvanced", "gaoji"],
      onSelect: () => openSettings("advanced")
    },
    {
      id: "focus-composer",
      group: "导航",
      title: "聚焦输入框",
      description: "将光标定位到当前视图的输入框",
      keywords: ["focus", "input", "composer", "输入"],
      aliases: ["jujiaoshuru", "jj", "focusinput"],
      shortcut: "mod+/",
      onSelect: () => {
        const view = activeView === "agent" ? "agent" : "chat";
        if (view === "chat") {
          setActiveView("chat");
        }
        focusComposerInView(view);
      }
    },
    {
      id: "toggle-sidebar",
      group: "导航",
      title: isSidebarOpen ? "收起侧栏" : "展开侧栏",
      keywords: ["sidebar", "panel", "侧栏"],
      aliases: ["celan", "cl", "sidebar"],
      shortcut: "mod+b",
      onSelect: () => {
        setIsSidebarOpen((previous) => !previous);
      }
    }
  ];

  if (activeSession) {
    commands.push(
      {
        id: "chat-rename-current",
        group: "Chat 会话",
        title: "重命名当前 Chat 会话",
        keywords: ["chat", "rename", "会话", "重命名"],
        aliases: ["renamechat", "chongmingming", "cmm"],
        onSelect: () => renameChat(activeSession.id)
      },
      {
        id: "chat-pin-current",
        group: "Chat 会话",
        title: activeSession.isPinned ? "取消置顶当前 Chat 会话" : "置顶当前 Chat 会话",
        keywords: ["chat", "pin", "置顶", "会话"],
        aliases: ["pinchat", "zhiding", "zd"],
        onSelect: () => toggleChatPin(activeSession.id)
      },
      {
        id: "chat-export-current-json",
        group: "Chat 会话",
        title: "导出当前 Chat（JSON）",
        keywords: ["chat", "export", "json", "导出"],
        onSelect: () => exportSession(activeSession.id)
      },
      {
        id: "chat-export-current-markdown",
        group: "Chat 会话",
        title: "导出当前 Chat（Markdown）",
        keywords: ["chat", "export", "markdown", "导出"],
        onSelect: () => exportSessionMarkdown(activeSession.id)
      },
      {
        id: "chat-delete-current",
        group: "Chat 会话",
        title: "删除当前 Chat 会话",
        keywords: ["chat", "delete", "会话", "删除"],
        aliases: ["deletechat", "shanchu", "sc"],
        onSelect: () => deleteChat(activeSession.id)
      }
    );
  }

  if (activeAgentSession) {
    commands.push(
      {
        id: "agent-rename-current",
        group: "Agent 会话",
        title: "重命名当前 Agent 会话",
        keywords: ["agent", "rename", "会话", "重命名"],
        aliases: ["renameagent", "chongmingming"],
        onSelect: () => {
          void renameAgentSession(activeAgentSession.id);
        }
      },
      {
        id: "agent-delete-current",
        group: "Agent 会话",
        title: "删除当前 Agent 会话",
        keywords: ["agent", "delete", "会话", "删除"],
        aliases: ["deleteagent", "shanchu"],
        onSelect: () => {
          void deleteAgentSession(activeAgentSession.id);
        }
      }
    );
  }

  if (isGenerating) {
    commands.push({
      id: "chat-stop-stream",
      group: "运行控制",
      title: "停止当前 Chat 生成",
      keywords: ["chat", "stop", "stream", "停止"],
      aliases: ["stopchat", "tingzhi", "tz"],
      onSelect: () => {
        void stopGenerating();
      }
    });
  }

  if (isAgentRunning) {
    commands.push({
      id: "agent-stop-run",
      group: "运行控制",
      title: "停止当前 Agent 运行",
      keywords: ["agent", "stop", "run", "停止"],
      aliases: ["stopagent", "tingzhi", "tz"],
      onSelect: () => {
        void stopAgentRun();
      }
    });
  }

  orderedChatSessions.slice(0, 8).forEach((session) => {
    const searchMetadata = buildSessionSearchMetadata(session);
    commands.push({
      id: `switch-chat-session-${session.id}`,
      group: "会话跳转",
      title: `切换 Chat 会话：${session.title}`,
      description: session.updatedAt
        ? `更新于 ${new Date(session.updatedAt).toLocaleString()} · ${searchMetadata.preview}`
        : searchMetadata.preview,
      keywords: [
        "chat",
        "session",
        "switch",
        "切换",
        "内容",
        session.title,
        ...searchMetadata.keywords
      ],
      onSelect: () => {
        setActiveView("chat");
        setActiveSessionId(session.id);
        closeSidebarIfCompact();
      }
    });
  });

  agentSessions.slice(0, 6).forEach((session) => {
    commands.push({
      id: `switch-agent-session-${session.id}`,
      group: "会话跳转",
      title: `切换 Agent 会话：${session.title}`,
      description: session.updatedAt ? `更新于 ${new Date(session.updatedAt).toLocaleString()}` : "",
      keywords: ["agent", "session", "switch", "切换", session.title],
      onSelect: () => {
        setActiveView("agent");
        setActiveAgentSessionId(session.id);
        closeSidebarIfCompact();
      }
    });
  });

  return commands;
};
