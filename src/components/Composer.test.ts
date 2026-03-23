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
  it("uses a light floating sheet style for the plus-button menu", () => {
    const classNames = getComposerToolMenuClassNames();

    assert.match(classNames.trigger, /\bh-10\b/);
    assert.match(classNames.trigger, /\bw-10\b/);
    assert.match(classNames.trigger, /border-slate-300\/60/);
    assert.match(classNames.trigger, /rounded-full/);
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
  it("uses a silver-glass shell in minimal mode", () => {
    const className = getComposerContainerClassName({ minimalControls: true });

    assert.match(className, /rounded-\[34px\]/);
    assert.match(className, /border-slate-200\/90/);
    assert.match(className, /min-h-\[124px\]/);
    assert.match(className, /shadow-\[0_18px_36px_rgba\(148,163,184,0\.14\)/);
  });

  it("keeps a blurred glass treatment around the landing composer shell", () => {
    const className = getComposerContainerClassName({ minimalControls: true });
    const tokens = className.split(/\s+/);

    assert.ok(tokens.includes("backdrop-blur-[24px]"));
    assert.ok(
      tokens.includes(
        "supports-[backdrop-filter]:bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(246,248,251,0.82))]"
      )
    );
  });
});

describe("components/Composer minimal controls", () => {
  it("uses lighter utility controls while keeping the restrained send button", () => {
    const classNames = getComposerMinimalControlClassNames();

    assert.ok(classNames.trigger.includes("rounded-full"));
    assert.ok(classNames.trigger.includes("h-10"));
    assert.ok(classNames.trigger.includes("w-10"));
    assert.ok(classNames.modelWrap.includes("rounded-full"));
    assert.ok(classNames.modelWrap.includes("border-slate-200/80"));
    assert.ok(classNames.modelSelect.includes("rounded-full"));
    assert.ok(classNames.actionButton.includes("h-12"));
    assert.ok(classNames.actionButton.includes("w-12"));
    assert.ok(classNames.actionButton.includes("rounded-full"));
    assert.ok(classNames.actionButton.includes("bg-[linear-gradient"));
    assert.ok(classNames.stopButton.includes("h-12"));
    assert.ok(classNames.stopButton.includes("w-12"));
    assert.ok(classNames.stopButton.includes("rounded-full"));
    assert.ok(classNames.stopButton.includes("bg-white/90"));
  });
});
