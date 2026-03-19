import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("styles/design-tokens", () => {
  it("keeps chat markdown line-height compact enough for dense reading", () => {
    const css = readFileSync(new URL("./design-tokens.css", import.meta.url), "utf8");

    assert.match(css, /--echo-chat-markdown-line-height:\s*1\.72;/);
  });
});
