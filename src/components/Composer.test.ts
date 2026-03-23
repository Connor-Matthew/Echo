import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getComposerChromeVisibility,
  getComposerContainerClassName,
  getComposerMinimalControlClassNames,
  getComposerTextareaClassName,
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
  it("uses a light floating sheet style for the plus-button menu", () => {
    const classNames = getComposerToolMenuClassNames();

    assert.match(classNames.trigger, /\bh-8\b/);
    assert.match(classNames.trigger, /\bw-8\b/);
    assert.match(classNames.trigger, /rounded-full/);
    assert.doesNotMatch(classNames.trigger, /bg-white\/80/);
    assert.match(classNames.surface, /w-\[340px\]/);
    assert.match(classNames.surface, /rounded-\[24px\]/);
    assert.match(classNames.surface, /bg-white\/92/);
    assert.match(classNames.surface, /shadow-\[0_18px_40px_rgba\(148,163,184,0\.16\)\]/);
    assert.match(classNames.item, /h-\[46px\]/);
    assert.match(classNames.item, /text-\[14px\]/);
    assert.match(classNames.nestedPanel, /rounded-\[18px\]/);
    assert.match(classNames.divider, /bg-slate-200\/80/);
  });
});

describe("components/Composer container classes", () => {
  it("uses a lighter minimal shell without a wrapped background", () => {
    const className = getComposerContainerClassName({ minimalControls: true });

    assert.match(className, /rounded-\[24px\]/);
    assert.match(className, /min-h-\[88px\]/);
    assert.match(className, /border-2/);
    assert.match(className, /border-slate-300\/80/);
    assert.doesNotMatch(className, /bg-\[linear-gradient/);
    assert.doesNotMatch(className, /shadow-\[/);
  });

  it("keeps the minimal shell visually plain", () => {
    const className = getComposerContainerClassName({ minimalControls: true });

    assert.doesNotMatch(className, /backdrop-blur-\[24px\]/);
    assert.doesNotMatch(className, /supports-\[backdrop-filter\]:bg-\[linear-gradient/);
  });
});

describe("components/Composer textarea classes", () => {
  it("uses a 40px textarea height in minimal mode", () => {
    const className = getComposerTextareaClassName({ minimalControls: true });

    assert.match(className, /h-\[40px\]/);
    assert.match(className, /min-h-\[40px\]/);
    assert.doesNotMatch(className, /h-\[56px\]/);
    assert.doesNotMatch(className, /min-h-\[56px\]/);
  });

  it("uses a 40px textarea height in standard mode", () => {
    const className = getComposerTextareaClassName({ minimalControls: false });

    assert.match(className, /h-\[40px\]/);
    assert.match(className, /min-h-\[40px\]/);
    assert.doesNotMatch(className, /h-\[44px\]/);
    assert.doesNotMatch(className, /min-h-\[44px\]/);
  });
});

describe("components/Composer minimal controls", () => {
  it("uses lighter utility controls while keeping the restrained send button", () => {
    const classNames = getComposerMinimalControlClassNames();

    assert.ok(classNames.trigger.includes("rounded-full"));
    assert.ok(classNames.trigger.includes("h-8"));
    assert.ok(classNames.trigger.includes("w-8"));
    assert.ok(classNames.trigger.includes("bg-transparent"));
    assert.ok(classNames.modelWrap.includes("rounded-full"));
    assert.ok(!classNames.modelWrap.includes("border-slate-200/80"));
    assert.ok(classNames.modelSelect.includes("rounded-full"));
    assert.ok(classNames.actionButton.includes("h-9"));
    assert.ok(classNames.actionButton.includes("w-9"));
    assert.ok(classNames.actionButton.includes("rounded-full"));
    assert.ok(classNames.actionButton.includes("bg-transparent"));
    assert.ok(!classNames.actionButton.includes("bg-[linear-gradient"));
    assert.ok(classNames.stopButton.includes("h-9"));
    assert.ok(classNames.stopButton.includes("w-9"));
    assert.ok(classNames.stopButton.includes("rounded-full"));
    assert.ok(classNames.stopButton.includes("bg-transparent"));
    assert.ok(!classNames.stopButton.includes("bg-white/90"));
  });
});
