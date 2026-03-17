import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAppController } from "./app-controller";

describe("features/app/app-controller", () => {
  it("creates a grouped controller contract without leaking flat top-level fields", () => {
    const controller = createAppController({
      shell: {
        activeView: "chat" as const
      },
      chat: {
        activeSessionId: "chat-1"
      },
      agent: {
        activeAgentSessionId: "agent-1"
      },
      settings: {
        settings: {
          model: "gpt-5"
        }
      },
      automation: {
        isJournalGenerating: false
      }
    });

    assert.deepEqual(Object.keys(controller).sort(), [
      "agent",
      "automation",
      "chat",
      "settings",
      "shell"
    ]);
    assert.equal(controller.shell.activeView, "chat");
    assert.equal(controller.chat.activeSessionId, "chat-1");
    assert.equal(controller.agent.activeAgentSessionId, "agent-1");
    assert.equal(controller.settings.settings.model, "gpt-5");
    assert.equal(controller.automation.isJournalGenerating, false);
    assert.equal("activeView" in controller, false);
    assert.equal("activeSessionId" in controller, false);
  });
});
