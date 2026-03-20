import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("styles/design-tokens", () => {
  it("widens the shell and reading stage for the Atelier Lite layout", () => {
    const css = readFileSync(new URL("./design-tokens.css", import.meta.url), "utf8");

    assert.match(css, /--echo-shell-radius:\s*32px;/);
    assert.match(css, /--echo-chat-stage-max-width:\s*760px;/);
    assert.match(css, /--echo-chat-assistant-max-width:\s*820px;/);
    assert.match(css, /--echo-conversation-max-width:\s*1240px;/);
  });

  it("keeps chat markdown line-height compact enough for dense reading", () => {
    const css = readFileSync(new URL("./design-tokens.css", import.meta.url), "utf8");

    assert.match(css, /--echo-chat-markdown-line-height:\s*1\.72;/);
  });
});
