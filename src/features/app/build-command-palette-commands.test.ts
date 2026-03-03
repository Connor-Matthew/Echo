import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCommandPaletteCommands } from "./build-command-palette-commands";
import type { AgentSessionMeta } from "../../shared/agent-contracts";
import type { ChatSession } from "../../shared/contracts";

const createChatSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: "chat-1",
  title: "支付排查",
  createdAt: "2026-03-02T00:00:00.000Z",
  updatedAt: "2026-03-02T00:00:00.000Z",
  messages: [
    {
      id: "m-1",
      role: "user",
      content: "请帮我定位支付回调 timeout bug",
      createdAt: "2026-03-02T00:00:00.000Z"
    }
  ],
  ...overrides
});

const createAgentSession = (overrides: Partial<AgentSessionMeta> = {}): AgentSessionMeta => ({
  id: "agent-1",
  title: "Agent 会话",
  createdAt: "2026-03-02T00:00:00.000Z",
  updatedAt: "2026-03-02T00:00:00.000Z",
  ...overrides
});

const createArgs = () => {
  const chatSession = createChatSession();
  const agentSession = createAgentSession();

  return {
    activeView: "chat" as const,
    isSidebarOpen: true,
    activeSession: chatSession,
    activeAgentSession: agentSession,
    orderedChatSessions: [chatSession],
    agentSessions: [agentSession],
    isGenerating: true,
    isAgentRunning: true,
    closeSidebarIfCompact: () => {},
    setActiveView: () => {},
    setActiveSessionId: () => {},
    setActiveAgentSessionId: () => {},
    setIsSidebarOpen: () => {},
    createNewChat: () => {},
    createNewAgentSession: async () => {},
    openSettings: () => {},
    renameChat: () => {},
    toggleChatPin: () => {},
    exportSession: () => {},
    exportSessionMarkdown: () => {},
    deleteChat: () => {},
    renameAgentSession: async () => {},
    deleteAgentSession: async () => {},
    stopGenerating: async () => {},
    stopAgentRun: async () => {},
    focusComposerInView: () => {},
    exportSessions: () => {},
    clearAllSessions: () => {},
    resetSettings: async () => {}
  };
};

describe("features/app/build-command-palette-commands", () => {
  it("includes content-searchable chat session switch command", () => {
    const commands = buildCommandPaletteCommands(createArgs());
    const target = commands.find((command) => command.id === "switch-chat-session-chat-1");

    assert.ok(target);
    assert.equal(target?.keywords?.includes("timeout"), true);
    assert.equal(target?.keywords?.includes("支付回调"), true);
    assert.equal((target?.description ?? "").includes("请帮我定位支付回调"), true);
  });

  it("includes conditional stop commands when running", () => {
    const commands = buildCommandPaletteCommands(createArgs());

    assert.ok(commands.some((command) => command.id === "chat-stop-stream"));
    assert.ok(commands.some((command) => command.id === "agent-stop-run"));
  });

  it("exposes documented shortcuts for key navigation commands", () => {
    const commands = buildCommandPaletteCommands(createArgs());
    const byId = new Map(commands.map((command) => [command.id, command]));

    assert.equal(byId.get("switch-chat")?.shortcut, "mod+1");
    assert.equal(byId.get("switch-agent")?.shortcut, "mod+2");
    assert.equal(byId.get("switch-settings")?.shortcut, "mod+3");
    assert.equal(byId.get("new-chat")?.shortcut, "mod+n");
    assert.equal(byId.get("new-agent-session")?.shortcut, "mod+shift+n");
  });

  it("exposes aliases for chinese pinyin and english tolerant search", () => {
    const commands = buildCommandPaletteCommands(createArgs());
    const byId = new Map(commands.map((command) => [command.id, command]));

    assert.equal(byId.get("switch-settings")?.aliases?.includes("shezhi"), true);
    assert.equal(byId.get("switch-settings")?.aliases?.includes("sz"), true);
    assert.equal(byId.get("settings-provider")?.aliases?.includes("szprovider"), true);
  });
});
