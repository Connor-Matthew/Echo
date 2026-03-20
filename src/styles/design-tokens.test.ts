import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("styles/design-tokens", () => {
  it("widens the shell and reading stage for the high-fidelity Atelier layout", () => {
    const css = readFileSync(new URL("./design-tokens.css", import.meta.url), "utf8");

    assert.match(css, /--echo-shell-radius:\s*36px;/);
    assert.match(css, /--echo-chat-stage-max-width:\s*780px;/);
    assert.match(css, /--echo-chat-assistant-max-width:\s*860px;/);
    assert.match(css, /--echo-conversation-max-width:\s*1320px;/);
    assert.match(css, /--echo-topbar-max-width:\s*1180px;/);
  });

  it("keeps chat markdown line-height compact enough for dense reading", () => {
    const css = readFileSync(new URL("./design-tokens.css", import.meta.url), "utf8");

    assert.match(css, /--echo-chat-markdown-line-height:\s*1\.72;/);
  });
});
