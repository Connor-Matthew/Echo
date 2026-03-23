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
  it("uses a dark floating sheet style for the plus-button menu", () => {
    const classNames = getComposerToolMenuClassNames();

    assert.match(classNames.trigger, /\bh-10\b/);
    assert.match(classNames.trigger, /\bw-10\b/);
    assert.match(classNames.trigger, /border-white\/10/);
    assert.match(classNames.trigger, /rounded-full/);
    assert.match(classNames.surface, /w-\[340px\]/);
    assert.match(classNames.surface, /rounded-\[26px\]/);
    assert.match(classNames.surface, /bg-\[rgba\(17,22,34,0\.94\)\]/);
    assert.match(classNames.surface, /shadow-\[0_32px_90px_rgba\(3,8,18,0\.42\)\]/);
    assert.match(classNames.item, /h-\[48px\]/);
    assert.match(classNames.item, /text-\[14px\]/);
    assert.match(classNames.nestedPanel, /rounded-\[20px\]/);
    assert.match(classNames.divider, /bg-white\/10/);
  });
});

describe("components/Composer container classes", () => {
  it("uses a deeper dark-glass shell in minimal mode", () => {
    const className = getComposerContainerClassName({ minimalControls: true });

    assert.match(className, /rounded-\[30px\]/);
    assert.match(className, /border-white\/10/);
    assert.match(className, /bg-\[rgba\(12,18,30,0\.78\)\]/);
    assert.match(className, /min-h-\[128px\]/);
    assert.match(className, /shadow-\[0_28px_80px_rgba\(3,8,18,0\.34\)\]/);
  });

  it("keeps a blurred glass treatment around the landing composer shell", () => {
    const className = getComposerContainerClassName({ minimalControls: true });
    const tokens = className.split(/\s+/);

    assert.ok(tokens.includes("backdrop-blur-2xl"));
    assert.ok(tokens.includes("supports-[backdrop-filter]:bg-[rgba(12,18,30,0.72)]"));
  });
});

describe("components/Composer minimal controls", () => {
  it("uses darker utility controls while keeping a restrained send button", () => {
    const classNames = getComposerMinimalControlClassNames();

    assert.ok(classNames.trigger.includes("rounded-full"));
    assert.ok(classNames.trigger.includes("h-10"));
    assert.ok(classNames.trigger.includes("w-10"));
    assert.ok(classNames.modelWrap.includes("rounded-full"));
    assert.ok(classNames.modelWrap.includes("border-white/10"));
    assert.ok(classNames.modelSelect.includes("rounded-full"));
    assert.ok(classNames.actionButton.includes("h-12"));
    assert.ok(classNames.actionButton.includes("w-12"));
    assert.ok(classNames.actionButton.includes("rounded-full"));
    assert.ok(classNames.actionButton.includes("bg-primary"));
    assert.ok(classNames.actionButton.includes("text-primary-foreground"));
    assert.ok(classNames.stopButton.includes("h-12"));
    assert.ok(classNames.stopButton.includes("w-12"));
    assert.ok(classNames.stopButton.includes("rounded-full"));
    assert.ok(classNames.stopButton.includes("bg-[rgba(18,24,38,0.92)]"));
  });
});
