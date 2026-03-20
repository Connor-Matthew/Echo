import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("src/index.css", () => {
  it("gives floating notes and the sidebar toggle a glass-like shell", () => {
    const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");

    assert.match(css, /\.state-note\s*\{[\s\S]*border-radius:\s*999px;/);
    assert.match(css, /\.state-note\s*\{[\s\S]*background:\s*hsl\(var\(--card\) \/ 0\.78\);/);
    assert.match(css, /\.state-note\s*\{[\s\S]*backdrop-filter:\s*blur\(18px\);/);
    assert.match(css, /\.state-note\s*\{[\s\S]*box-shadow:\s*0 16px 36px hsl\(28 24% 35% \/ 0\.1\);/);
    assert.match(css, /\.floating-sidebar-toggle\s*\{[\s\S]*background:\s*hsl\(var\(--card\) \/ 0\.78\);/);
    assert.match(css, /\.floating-sidebar-toggle\s*\{[\s\S]*backdrop-filter:\s*blur\(22px\);/);
  });
});
