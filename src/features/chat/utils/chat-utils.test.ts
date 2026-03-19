import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIDEBAR_AUTO_HIDE_WIDTH,
  SIDEBAR_FULL_WIDTH_AT,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  getResponsiveSidebarWidth
} from "./chat-utils";

describe("features/chat/utils/chat-utils", () => {
  it("uses a noticeably wider desktop sidebar scale", () => {
    assert.equal(SIDEBAR_MIN_WIDTH, 272);
    assert.equal(SIDEBAR_MAX_WIDTH, 320);
    assert.equal(getResponsiveSidebarWidth(SIDEBAR_AUTO_HIDE_WIDTH), 272);
    assert.equal(getResponsiveSidebarWidth(SIDEBAR_FULL_WIDTH_AT), 320);
  });
});
