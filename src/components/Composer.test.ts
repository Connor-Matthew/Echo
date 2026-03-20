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
  it("uses a warmer floating sheet style for the plus-button menu", () => {
    const classNames = getComposerToolMenuClassNames();

    assert.match(classNames.trigger, /\bh-10\b/);
    assert.match(classNames.trigger, /\bw-10\b/);
    assert.match(classNames.trigger, /border-border\/55/);
    assert.match(classNames.trigger, /rounded-full/);
    assert.match(classNames.surface, /w-\[340px\]/);
    assert.match(classNames.surface, /rounded-\[24px\]/);
    assert.match(classNames.surface, /shadow-\[0_28px_80px_rgba\(42,37,30,0\.14\)\]/);
    assert.match(classNames.item, /h-\[48px\]/);
    assert.match(classNames.item, /text-\[14px\]/);
    assert.match(classNames.nestedPanel, /rounded-\[18px\]/);
    assert.match(classNames.divider, /bg-border\/45/);
  });
});

describe("components/Composer container classes", () => {
  it("uses a long pill-shaped shell in minimal mode", () => {
    const className = getComposerContainerClassName({ minimalControls: true });

    assert.match(className, /rounded-\[38px\]/);
    assert.match(className, /border-border\/50/);
    assert.match(className, /bg-card\/78/);
    assert.match(className, /shadow-\[0_26px_60px_rgba\(42,37,30,0\.12\)\]/);
  });

  it("keeps the outer highlight ring visible even before focus", () => {
    const className = getComposerContainerClassName({ minimalControls: true });
    const tokens = className.split(/\s+/);

    assert.ok(tokens.includes("backdrop-blur-2xl"));
    assert.ok(tokens.includes("supports-[backdrop-filter]:bg-card/68"));
  });
});

describe("components/Composer minimal controls", () => {
  it("uses softer utility controls while keeping a prominent round send button", () => {
    const classNames = getComposerMinimalControlClassNames();

    assert.ok(classNames.trigger.includes("rounded-full"));
    assert.ok(classNames.trigger.includes("h-10"));
    assert.ok(classNames.trigger.includes("w-10"));
    assert.ok(!classNames.modelSelect.includes("rounded-full"));
    assert.ok(classNames.modelSelect.includes("border-0"));
    assert.ok(classNames.actionButton.includes("h-12"));
    assert.ok(classNames.actionButton.includes("w-12"));
    assert.ok(classNames.actionButton.includes("rounded-full"));
    assert.ok(classNames.actionButton.includes("bg-primary"));
    assert.ok(classNames.actionButton.includes("text-primary-foreground"));
    assert.ok(classNames.stopButton.includes("h-12"));
    assert.ok(classNames.stopButton.includes("w-12"));
    assert.ok(classNames.stopButton.includes("rounded-full"));
  });
});
