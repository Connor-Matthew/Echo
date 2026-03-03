import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isEditableEventTarget, matchesShortcut } from "./shortcut-utils";

type KeyboardLike = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

const createKeyEvent = (overrides: Partial<KeyboardLike>): KeyboardLike => ({
  key: "",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides
});

describe("components/command-palette/shortcut-utils", () => {
  it("matches mod shortcuts on mac with meta key", () => {
    const event = createKeyEvent({ key: "k", metaKey: true });
    assert.equal(matchesShortcut(event, "mod+k", true), true);
    assert.equal(matchesShortcut(event, "mod+k", false), false);
  });

  it("matches mod shortcuts on non-mac with ctrl key", () => {
    const event = createKeyEvent({ key: "k", ctrlKey: true });
    assert.equal(matchesShortcut(event, "mod+k", false), true);
    assert.equal(matchesShortcut(event, "mod+k", true), false);
  });

  it("matches slash and shift-aware shortcuts", () => {
    const slashEvent = createKeyEvent({ key: "/", ctrlKey: true });
    assert.equal(matchesShortcut(slashEvent, "mod+/", false), true);

    const shiftedEvent = createKeyEvent({ key: "K", ctrlKey: true, shiftKey: true });
    assert.equal(matchesShortcut(shiftedEvent, "mod+shift+k", false), true);
  });

  it("rejects extra modifier keys that are not part of shortcut", () => {
    const event = createKeyEvent({ key: "1", ctrlKey: true, shiftKey: true });
    assert.equal(matchesShortcut(event, "mod+1", false), false);
  });

  it("detects editable targets for keyboard shortcut guard", () => {
    assert.equal(isEditableEventTarget({ tagName: "input" } as unknown as EventTarget), true);
    assert.equal(isEditableEventTarget({ tagName: "textarea" } as unknown as EventTarget), true);
    assert.equal(
      isEditableEventTarget({
        tagName: "div",
        isContentEditable: true
      } as unknown as EventTarget),
      true
    );
    assert.equal(
      isEditableEventTarget({
        tagName: "div",
        getAttribute: (name: string) => (name === "role" ? "textbox" : null)
      } as unknown as EventTarget),
      true
    );
    assert.equal(isEditableEventTarget({ tagName: "button" } as unknown as EventTarget), false);
  });
});
