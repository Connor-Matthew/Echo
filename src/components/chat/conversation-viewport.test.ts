import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getConversationViewportLayoutClassNames } from "./conversation-viewport";

describe("components/chat/conversation-viewport layout", () => {
  it("keeps the scroll container full width while turning the content area into a calm reading stage", () => {
    const layoutClassNames = getConversationViewportLayoutClassNames();

    assert.match(layoutClassNames.scrollContainer, /\boverflow-auto\b/);
    assert.match(layoutClassNames.scrollContainer, /\bw-full\b/);
    assert.match(layoutClassNames.scrollContainer, /\becho-scrollbar-minimal\b/);
    assert.doesNotMatch(layoutClassNames.scrollContainer, /\bmx-auto\b/);
    assert.doesNotMatch(layoutClassNames.scrollContainer, /\bpx-4\b/);

    assert.match(layoutClassNames.scrollContent, /\bchat-scroll-content\b/);
    assert.match(layoutClassNames.scrollContent, /\bmx-auto\b/);
    assert.match(layoutClassNames.scrollContent, /\bgap-5\b/);
    assert.match(layoutClassNames.scrollContent, /\bpb-40\b/);
    assert.doesNotMatch(layoutClassNames.scrollContent, /max-w-\[/);
    assert.doesNotMatch(layoutClassNames.scrollContent, /\boverflow-auto\b/);
  });
});
