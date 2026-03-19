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
  it("renders a more compact chat sidebar shell", () => {
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
        onSaveUserSkills={() => {}}
      />
    );

    assert.match(markup, /border-b border-border\/70 px-3 pb-3 pt-2\.5/);
    assert.match(markup, /flex min-h-0 flex-1 flex-col overflow-hidden pb-3 pl-3 pr-px pt-3/);
    assert.match(markup, /mb-3 flex items-center justify-between pl-1 pr-3/);
    assert.match(markup, /echo-scrollbar-minimal/);
    assert.match(markup, /min-h-0 [^"]*overflow-auto/);
    assert.match(markup, /relative z-10 h-8 justify-center rounded-full text-\[13px\] transition-colors/);
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

    assert.match(markup, /flex min-h-0 flex-1 flex-col overflow-hidden pb-3 pl-3 pr-px pt-3/);
    assert.match(markup, /mb-3 flex items-center justify-between pl-1 pr-3/);
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
        onSaveUserSkills={() => {}}
      />
    );

    assert.match(markup, /data-active="true"/);
    assert.match(markup, /session-list-item-button-active/);
    assert.match(markup, /session-list-item-title-active/);
    assert.match(markup, /session-list-item-meta-active/);
  });
});
