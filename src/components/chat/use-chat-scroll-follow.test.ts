import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatMessage } from "../../shared/contracts";
import {
  getActiveGeneratingAssistantId,
  getLatestUserMessageId,
  getTopSnapBottomSpacerHeight,
  getTopSnappedMessageScrollTop
} from "./use-chat-scroll-follow";

const createMessage = (overrides: Partial<ChatMessage>): ChatMessage => ({
  id: "m1",
  role: "assistant",
  content: "",
  createdAt: "2026-03-02T00:00:00.000Z",
  ...overrides
});

describe("components/chat/use-chat-scroll-follow helpers", () => {
  it("returns last assistant id when generating", () => {
    const messages: ChatMessage[] = [
      createMessage({ id: "u1", role: "user", content: "hello" }),
      createMessage({ id: "a1", role: "assistant", content: "one" }),
      createMessage({ id: "a2", role: "assistant", content: "two" })
    ];
    assert.equal(getActiveGeneratingAssistantId(messages, true), "a2");
  });

  it("returns null when not generating", () => {
    const messages: ChatMessage[] = [createMessage({ id: "a1", role: "assistant", content: "one" })];
    assert.equal(getActiveGeneratingAssistantId(messages, false), null);
  });

  it("returns the newest user message id", () => {
    const messages: ChatMessage[] = [
      createMessage({ id: "u1", role: "user", content: "first" }),
      createMessage({ id: "a1", role: "assistant", content: "reply" }),
      createMessage({ id: "u2", role: "user", content: "latest" })
    ];
    assert.equal(getLatestUserMessageId(messages), "u2");
  });

  it("computes a top-snapped scroll target for the newest user message", () => {
    assert.equal(
      getTopSnappedMessageScrollTop({
        contentTop: 20,
        topInset: 20,
        messageTop: 540
      }),
      540
    );
  });

  it("adds bottom spacer when top snap target exceeds current max scroll", () => {
    assert.equal(
      getTopSnapBottomSpacerHeight({
        targetTop: 540,
        bottomTop: 420
      }),
      120
    );
  });

  it("does not add bottom spacer when target is already reachable", () => {
    assert.equal(
      getTopSnapBottomSpacerHeight({
        targetTop: 320,
        bottomTop: 420
      }),
      0
    );
  });
});
