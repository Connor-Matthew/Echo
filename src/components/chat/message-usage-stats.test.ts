import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMessageUsageStatsClassName } from "./message-usage-stats";

describe("components/chat/message-usage-stats", () => {
  it("keeps token stats quiet until the message is hovered", () => {
    const className = getMessageUsageStatsClassName("provider");

    assert.match(className, /\bmd:opacity-0\b/);
    assert.match(className, /\bmd:group-hover:opacity-100\b/);
    assert.match(className, /\btext-muted-foreground\b/);
  });
});
