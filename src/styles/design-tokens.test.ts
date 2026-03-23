import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("styles/design-tokens", () => {
  it("defines the light shell and reading stage tokens for the silver workspace", () => {
    const css = readFileSync(new URL("./design-tokens.css", import.meta.url), "utf8");

    assert.match(css, /--echo-shell-bg-start:\s*220 20% 96%;/);
    assert.match(css, /--echo-shell-bg-end:\s*220 16% 92%;/);
    assert.match(css, /--echo-shell-radius:\s*30px;/);
    assert.match(css, /--echo-shell-panel-radius:\s*26px;/);
    assert.match(css, /--echo-shell-frame-bg-alpha:\s*0\.82;/);
    assert.match(css, /--echo-shell-glass-blur:\s*24px;/);
    assert.match(css, /--echo-toolbar-bg-alpha:\s*0\.72;/);
    assert.match(css, /--echo-chat-stage-max-width:\s*920px;/);
    assert.match(css, /--echo-chat-assistant-max-width:\s*980px;/);
    assert.match(css, /--echo-conversation-max-width:\s*1420px;/);
    assert.match(css, /--echo-topbar-max-width:\s*1240px;/);
  });

  it("keeps chat markdown line-height tuned for denser dark-surface reading", () => {
    const css = readFileSync(new URL("./design-tokens.css", import.meta.url), "utf8");

    assert.match(css, /--echo-chat-markdown-line-height:\s*1\.76;/);
  });
});
