import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAttachmentTrayClassNames } from "./AttachmentTray";

describe("components/AttachmentTray classes", () => {
  it("uses low-noise dock chips that visually merge with the minimalist composer", () => {
    const classNames = getAttachmentTrayClassNames();

    assert.match(classNames.tray, /\bcomposer-attachment-tray\b/);
    assert.match(classNames.tray, /\bgap-2\.5\b/);
    assert.match(classNames.item, /rounded-\[18px\]/);
    assert.match(classNames.item, /border-border\/70/);
    assert.match(classNames.item, /bg-background\/80/);
    assert.match(classNames.preview, /rounded-\[14px\]/);
    assert.match(classNames.preview, /border-border\/60/);
    assert.match(classNames.textPreview, /bg-accent\/20/);
  });
});
