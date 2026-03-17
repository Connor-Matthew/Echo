import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToolCall } from "../../src/shared/contracts";
import { upsertCollectedToolCall } from "./collected-tool-calls";

describe("electron/agent/collected-tool-calls", () => {
  it("persists tool output instead of keeping the stale input preview", () => {
    const collectedToolCalls = new Map<string, ToolCall>();

    upsertCollectedToolCall(
      collectedToolCalls,
      {
        type: "tool_start",
        toolId: "tool-1",
        toolName: "Bash",
        input: "{\"cmd\":\"ls\"}"
      },
      ""
    );

    upsertCollectedToolCall(
      collectedToolCalls,
      {
        type: "tool_result",
        toolId: "tool-1",
        toolName: "Bash",
        output: "file-a\nfile-b",
        isError: false
      },
      ""
    );

    assert.equal(collectedToolCalls.get("tool:tool-1")?.message, "file-a\nfile-b");
    assert.equal(collectedToolCalls.get("tool:tool-1")?.status, "success");
  });
});
