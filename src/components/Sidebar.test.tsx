import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Sidebar } from "./Sidebar";
import type { ChatSession } from "../shared/contracts";
import type { AgentSessionMeta } from "../shared/agent-contracts";

const createChatSession = (overrides: Partial<ChatSession> = {}): ChatSession => ({
  id: "chat-1",
  title: "你好",
  messages: [],
  updatedAt: "2026-03-19T00:00:00.000Z",
  createdAt: "2026-03-19T00:00:00.000Z",
  ...overrides
});

const createAgentSession = (overrides: Partial<AgentSessionMeta> = {}): AgentSessionMeta => ({
  id: "agent-1",
  title: "Agent",
  createdAt: "2026-03-19T00:00:00.000Z",
  updatedAt: "2026-03-19T00:00:00.000Z",
  ...overrides
});

describe("components/Sidebar", () => {
  it("renders the fixed-nav dark-glass chat sidebar shell", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        mode="chat"
        sessions={[createChatSession()]}
        activeSessionId="chat-1"
        userSkills={[]}
        onSelectSession={() => {}}
        onCreateSession={() => {}}
        onRenameSession={() => {}}
        onDeleteSession={() => {}}
        onTogglePinSession={() => {}}
        onExportSession={() => {}}
        onExportSessionMarkdown={() => {}}
        onEnterAgent={() => {}}
        onEnterSettings={() => {}}
        onOpenSearch={() => {}}
        onSaveUserSkills={() => {}}
      />
    );

    assert.match(markup, /px-5 pb-4 pt-5/);
    assert.match(markup, /flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5 pt-2/);
    assert.match(markup, /mb-6 flex items-start justify-between/);
    assert.match(markup, /echo-scrollbar-minimal/);
    assert.match(markup, /min-h-0 [^"]*overflow-auto/);
  });

  it("gives the chat sidebar a search affordance, fixed nav block, and recent chat index", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        mode="chat"
        sessions={[createChatSession()]}
        activeSessionId="chat-1"
        userSkills={[]}
        onSelectSession={() => {}}
        onCreateSession={() => {}}
        onRenameSession={() => {}}
        onDeleteSession={() => {}}
        onTogglePinSession={() => {}}
        onExportSession={() => {}}
        onExportSessionMarkdown={() => {}}
        onEnterAgent={() => {}}
        onEnterSettings={() => {}}
        onOpenSearch={() => {}}
        onSaveUserSkills={() => {}}
      />
    );

    assert.match(markup, />Echo</);
    assert.match(markup, />Desktop Chat</);
    assert.match(markup, />Search</);
    assert.match(markup, />New Chat</);
    assert.match(markup, />Chat</);
    assert.match(markup, />Agent</);
    assert.match(markup, />Skills</);
    assert.match(markup, />Recent Chats</);
    assert.doesNotMatch(markup, /The Atelier/);
    assert.doesNotMatch(markup, />Archive</);
  });

  it("aligns the agent session scrollbar to the sidebar edge too", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        mode="agent"
        sessions={[createAgentSession()]}
        activeSessionId="agent-1"
        onSelectSession={() => {}}
        onCreateSession={() => {}}
        onRenameSession={() => {}}
        onDeleteSession={() => {}}
        onEnterChat={() => {}}
        onEnterSettings={() => {}}
      />
    );

    assert.match(markup, /flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5 pt-4/);
    assert.match(markup, /mb-5 flex items-center justify-between/);
    assert.match(markup, /echo-scrollbar-minimal/);
  });

  it("does not add a custom vertical divider for the sidebar edge", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        mode="chat"
        sessions={[createChatSession()]}
        activeSessionId="chat-1"
        userSkills={[]}
        onSelectSession={() => {}}
        onCreateSession={() => {}}
        onRenameSession={() => {}}
        onDeleteSession={() => {}}
        onTogglePinSession={() => {}}
        onExportSession={() => {}}
        onExportSessionMarkdown={() => {}}
        onEnterAgent={() => {}}
        onEnterSettings={() => {}}
        onOpenSearch={() => {}}
        onSaveUserSkills={() => {}}
      />
    );

    assert.doesNotMatch(markup, /top-\[42px\] w-px bg-border\/70/);
  });

  it("marks the active session content with dedicated styling hooks", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        mode="chat"
        sessions={[createChatSession()]}
        activeSessionId="chat-1"
        userSkills={[]}
        onSelectSession={() => {}}
        onCreateSession={() => {}}
        onRenameSession={() => {}}
        onDeleteSession={() => {}}
        onTogglePinSession={() => {}}
        onExportSession={() => {}}
        onExportSessionMarkdown={() => {}}
        onEnterAgent={() => {}}
        onEnterSettings={() => {}}
        onOpenSearch={() => {}}
        onSaveUserSkills={() => {}}
      />
    );

    assert.match(markup, /data-active="true"/);
    assert.match(markup, /session-list-item-button-active/);
    assert.match(markup, /session-list-item-title-active/);
    assert.match(markup, /session-list-item-meta-active/);
  });

  it("keeps only settings in the bottom dock", () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        mode="chat"
        sessions={[createChatSession()]}
        activeSessionId="chat-1"
        userSkills={[]}
        onSelectSession={() => {}}
        onCreateSession={() => {}}
        onRenameSession={() => {}}
        onDeleteSession={() => {}}
        onTogglePinSession={() => {}}
        onExportSession={() => {}}
        onExportSessionMarkdown={() => {}}
        onEnterAgent={() => {}}
        onEnterSettings={() => {}}
        onOpenSearch={() => {}}
        onSaveUserSkills={() => {}}
      />
    );

    assert.match(markup, />Settings</);
    assert.doesNotMatch(markup, />Help</);
    assert.doesNotMatch(markup, />Local Workspace</);
    assert.doesNotMatch(markup, />Personal AI desk</);
  });
});
