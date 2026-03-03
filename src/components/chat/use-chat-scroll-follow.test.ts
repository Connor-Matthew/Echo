import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatMessage } from "../../shared/contracts";
import {
  getActiveGeneratingAssistantId,
  getFollowTargetTop
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

  it("returns bottomTop for non-streaming follow", () => {
    assert.equal(
      getFollowTargetTop({ bottomTop: 800, currentTop: 500, streaming: false }),
      800
    );
  });

  it("keeps a stepped tail distance for streaming follow", () => {
    const target = getFollowTargetTop({ bottomTop: 1000, currentTop: 700, streaming: true });
    assert.equal(target, 900);
  });
});
