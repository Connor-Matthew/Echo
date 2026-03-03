import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolCall } from "../../shared/contracts";
import {
  buildAgentToolRenderItems,
  buildClampedToolAnchorGroups,
  hasPendingToolInRenderItems,
  isProgressToolCall
} from "./agent-tool-render-helpers";

const createToolCall = (overrides: Partial<ToolCall>): ToolCall => ({
  id: "tool-1",
  serverName: "server",
  toolName: "tool",
  status: "success",
  message: "",
  ...overrides
});

describe("components/chat/agent-tool-render-helpers", () => {
  it("detects progress tool call by id prefix", () => {
    assert.equal(isProgressToolCall(createToolCall({ id: "progress:1" })), true);
    assert.equal(isProgressToolCall(createToolCall({ id: "tool:1" })), false);
  });

  it("groups TodoWrite parent with trailing progress calls", () => {
    const items = buildAgentToolRenderItems([
      createToolCall({ id: "t1", serverName: "TodoWrite", toolName: "TodoWrite" }),
      createToolCall({ id: "progress:1", serverName: "TodoWrite", toolName: "TodoRead" }),
      createToolCall({ id: "progress:2", serverName: "TodoWrite", toolName: "TodoRead" }),
      createToolCall({ id: "t2", serverName: "filesystem", toolName: "read_file" })
    ]);

    assert.equal(items.length, 2);
    assert.equal(items[0]?.kind, "todo_group");
    assert.equal(items[1]?.kind, "single");
    if (items[0]?.kind === "todo_group") {
      assert.equal(items[0].steps.length, 2);
    }
  });

  it("keeps TodoWrite as single when no progress steps follow", () => {
    const items = buildAgentToolRenderItems([
      createToolCall({ id: "t1", serverName: "TodoWrite", toolName: "TodoWrite" }),
      createToolCall({ id: "t2", serverName: "filesystem", toolName: "read_file" })
    ]);

    assert.equal(items.length, 2);
    assert.equal(items[0]?.kind, "single");
  });

  it("reports pending state for both single and grouped items", () => {
    const grouped = buildAgentToolRenderItems([
      createToolCall({ id: "t1", serverName: "TodoWrite", toolName: "TodoWrite", status: "success" }),
      createToolCall({ id: "progress:1", serverName: "TodoWrite", toolName: "TodoRead", status: "pending" })
    ]);
    const single = buildAgentToolRenderItems([
      createToolCall({ id: "t1", serverName: "filesystem", toolName: "read_file", status: "pending" })
    ]);

    assert.equal(hasPendingToolInRenderItems(grouped), true);
    assert.equal(hasPendingToolInRenderItems(single), true);
  });

  it("builds and clamps anchor groups by content length", () => {
    const items = buildAgentToolRenderItems([
      createToolCall({ id: "a", contentOffset: 10 }),
      createToolCall({ id: "b" }),
      createToolCall({ id: "c", contentOffset: 120 })
    ]);
    const groups = buildClampedToolAnchorGroups(items, 50);

    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.offset, 10);
    assert.equal(groups[0]?.items.length, 2);
    assert.equal(groups[1]?.offset, 50);
  });
});
