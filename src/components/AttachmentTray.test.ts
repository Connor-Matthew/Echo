import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAttachmentTrayClassNames } from "./AttachmentTray";

describe("components/AttachmentTray classes", () => {
  it("uses warmer dock cards that visually merge with the hero composer", () => {
    const classNames = getAttachmentTrayClassNames();

    assert.match(classNames.tray, /\bcomposer-attachment-tray\b/);
    assert.match(classNames.tray, /\bgap-3\b/);
    assert.match(classNames.item, /rounded-\[24px\]/);
    assert.match(classNames.item, /border-border\/50/);
    assert.match(classNames.item, /bg-card\/78/);
    assert.match(classNames.preview, /rounded-\[18px\]/);
    assert.match(classNames.preview, /border-border\/50/);
    assert.match(classNames.textPreview, /bg-accent\/22/);
  });
});
