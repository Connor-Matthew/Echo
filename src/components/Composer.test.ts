import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getComposerChromeVisibility,
  getComposerContainerClassName,
  getComposerToolMenuClassNames,
  getComposerToolMenuItemLabels
} from "./Composer";

describe("components/Composer chrome visibility", () => {
  it("switches chat mode to a plus-button tool menu in minimal mode", () => {
    assert.deepEqual(
      getComposerChromeVisibility({
        minimalControls: true,
        isToolMenuOpen: false
      }),
      {
        showExpandedToolbar: false,
        showMinimalToolMenuButton: true,
        showCapabilityIndicators: false
      }
    );
  });

  it("restores the full chrome when minimal mode is disabled", () => {
    assert.deepEqual(
      getComposerChromeVisibility({
        minimalControls: false,
        isToolMenuOpen: false
      }),
      {
        showExpandedToolbar: true,
        showMinimalToolMenuButton: false,
        showCapabilityIndicators: true
      }
    );
  });
});

describe("components/Composer tool menu labels", () => {
  it("builds the popup menu from the available chat tools", () => {
    assert.deepEqual(
      getComposerToolMenuItemLabels({
        hasQuickToggle: true,
        hasSkills: true,
        hasMcpServers: true
      }),
      [
        "Add files or photos",
        "SOUL mode",
        "Use style",
        "Connectors",
        "Context window"
      ]
    );
  });
});

describe("components/Composer tool menu classes", () => {
  it("uses a flat utility-sheet style for the plus-button menu", () => {
    const classNames = getComposerToolMenuClassNames();

    assert.match(classNames.trigger, /\bh-9\b/);
    assert.match(classNames.trigger, /\bw-9\b/);
    assert.match(classNames.trigger, /border-border\/70/);
    assert.match(classNames.trigger, /rounded-\[14px\]/);
    assert.match(classNames.surface, /w-\[300px\]/);
    assert.match(classNames.surface, /rounded-\[16px\]/);
    assert.match(classNames.surface, /shadow-\[0_18px_40px_rgba\(42,37,30,0\.08\)\]/);
    assert.match(classNames.item, /h-\[44px\]/);
    assert.match(classNames.item, /text-\[14px\]/);
    assert.match(classNames.nestedPanel, /rounded-\[12px\]/);
    assert.match(classNames.divider, /bg-border\/55/);
  });
});

describe("components/Composer container classes", () => {
  it("uses a tighter composer shell radius in minimal mode", () => {
    const className = getComposerContainerClassName({ minimalControls: true });

    assert.match(className, /rounded-\[24px\]/);
    assert.doesNotMatch(className, /rounded-\[28px\]/);
  });

  it("keeps the outer highlight ring visible even before focus", () => {
    const className = getComposerContainerClassName({ minimalControls: true });
    const tokens = className.split(/\s+/);

    assert.ok(tokens.includes("border-ring/45"));
    assert.ok(tokens.includes("shadow-[0_0_0_1px_hsl(var(--ring)/0.12)]"));
  });
});
