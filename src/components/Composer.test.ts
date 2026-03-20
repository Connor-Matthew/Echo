import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getComposerChromeVisibility,
  getComposerContainerClassName,
  getComposerMinimalControlClassNames,
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
    assert.match(classNames.trigger, /border-border\/65/);
    assert.match(classNames.trigger, /rounded-\[16px\]/);
    assert.match(classNames.surface, /w-\[320px\]/);
    assert.match(classNames.surface, /rounded-\[20px\]/);
    assert.match(classNames.surface, /shadow-\[0_24px_60px_rgba\(42,37,30,0\.12\)\]/);
    assert.match(classNames.item, /h-\[46px\]/);
    assert.match(classNames.item, /text-\[14px\]/);
    assert.match(classNames.nestedPanel, /rounded-\[14px\]/);
    assert.match(classNames.divider, /bg-border\/55/);
  });
});

describe("components/Composer container classes", () => {
  it("uses a tighter composer shell radius in minimal mode", () => {
    const className = getComposerContainerClassName({ minimalControls: true });

    assert.match(className, /rounded-\[30px\]/);
    assert.match(className, /border-border\/65/);
    assert.match(className, /bg-card\/95/);
    assert.match(className, /shadow-\[0_18px_48px_rgba\(42,37,30,0\.1\)\]/);
  });

  it("keeps the outer highlight ring visible even before focus", () => {
    const className = getComposerContainerClassName({ minimalControls: true });
    const tokens = className.split(/\s+/);

    assert.ok(tokens.includes("backdrop-blur-xl"));
    assert.ok(tokens.includes("supports-[backdrop-filter]:bg-card/82"));
  });
});

describe("components/Composer minimal controls", () => {
  it("keeps utility controls shell-less but gives the send action a primary round button", () => {
    const classNames = getComposerMinimalControlClassNames();

    assert.ok(!classNames.trigger.includes("rounded-full"));
    assert.ok(classNames.trigger.includes("border-0"));
    assert.ok(!classNames.modelSelect.includes("rounded-full"));
    assert.ok(classNames.modelSelect.includes("border-0"));
    assert.ok(classNames.actionButton.includes("h-10"));
    assert.ok(classNames.actionButton.includes("w-10"));
    assert.ok(classNames.actionButton.includes("rounded-full"));
    assert.ok(classNames.actionButton.includes("bg-primary"));
    assert.ok(classNames.actionButton.includes("text-primary-foreground"));
    assert.ok(classNames.stopButton.includes("h-10"));
    assert.ok(classNames.stopButton.includes("w-10"));
    assert.ok(classNames.stopButton.includes("rounded-full"));
  });
});
