import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChatMessage } from "../../shared/contracts";
import {
  type ChatScrollMode,
  getActiveGeneratingAssistantId,
  getAnchoredMessageTargetScrollTop,
  getAnchoredMessageTopDelta,
  getScrollFollowTopInset,
  getLatestTurnAnchorKey,
  getLatestUserMessageId,
  getSessionScrollFollowResetState,
  shouldRealignAnchoredMessage,
  shouldIgnoreProgrammaticScrollEvent,
  resolveMessageListScrollAction,
  resolveScrollStateFromUserScroll,
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

const expectScrollMode = (value: unknown, expected: ChatScrollMode) => {
  assert.equal(value, expected);
};

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

  it("tracks the latest turn anchor key using the latest user and its trailing assistant", () => {
    const messages: ChatMessage[] = [
      createMessage({ id: "u1", role: "user", content: "first" }),
      createMessage({ id: "a1", role: "assistant", content: "reply 1" }),
      createMessage({ id: "u2", role: "user", content: "latest" }),
      createMessage({ id: "a2", role: "assistant", content: "reply 2" })
    ];

    assert.equal(getLatestTurnAnchorKey(messages), "u2:a2");
  });

  it("computes a top-snapped scroll target for the newest user message", () => {
    assert.equal(
      getTopSnappedMessageScrollTop({
        currentScrollTop: 120,
        containerTop: 100,
        topInset: 20,
        messageTop: 620
      }),
      620
    );
  });

  it("derives the anchored target from layout offset so transform animations do not skew it", () => {
    assert.equal(
      getAnchoredMessageTargetScrollTop({
        messageOffsetTop: 620,
        contentOffsetTop: 0,
        contentPaddingTop: 20
      }),
      600
    );
  });

  it("subtracts the content container offset so the anchor does not overshoot under the top edge", () => {
    assert.equal(
      getAnchoredMessageTargetScrollTop({
        messageOffsetTop: 620,
        contentOffsetTop: 48,
        contentPaddingTop: 20
      }),
      552
    );
  });

  it("includes content top padding in the top-snap inset", () => {
    assert.equal(
      getScrollFollowTopInset({
        containerPaddingTop: 0,
        contentPaddingTop: 32
      }),
      32
    );
  });

  it("adds bottom spacer when top snap target exceeds current max scroll", () => {
    assert.equal(
      getTopSnapBottomSpacerHeight({
        targetTop: 540,
        intrinsicBottomTop: 420
      }),
      120
    );
  });

  it("does not add bottom spacer when target is already reachable", () => {
    assert.equal(
      getTopSnapBottomSpacerHeight({
        targetTop: 320,
        intrinsicBottomTop: 420
      }),
      0
    );
  });

  it("keeps the extra bottom spacer when the target is only reachable because padding was already added", () => {
    assert.equal(
      getTopSnapBottomSpacerHeight({
        targetTop: 540,
        intrinsicBottomTop: 0
      }),
      540
    );
  });

  it("does not shrink the anchored bottom spacer while the current scroll position still depends on it", () => {
    assert.equal(
      getTopSnapBottomSpacerHeight({
        targetTop: 540,
        intrinsicBottomTop: 560,
        currentBottomSpacerHeight: 120
      }),
      120
    );
  });

  it("anchors the newest user message when a new user message appears", () => {
    assert.equal(
      resolveMessageListScrollAction({
        mode: "chat",
        messages: [
          createMessage({ id: "u1", role: "user", content: "first" }),
          createMessage({ id: "a1", role: "assistant", content: "reply" }),
          createMessage({ id: "u2", role: "user", content: "latest" })
        ],
        previousMessageCount: 2,
        previousLatestTurnAnchorKey: "u1:a1",
        scrollMode: "idle_follow_bottom",
        anchoredUserMessageId: null,
        shouldAutoScroll: false
      }),
      "anchor-latest-user-message"
    );
  });

  it("chat mode keeps the latest user message anchored while assistant streaming extends the tail", () => {
    assert.equal(
      resolveMessageListScrollAction({
        mode: "chat",
        messages: [
          createMessage({ id: "u1", role: "user", content: "latest" }),
          createMessage({ id: "a1", role: "assistant", content: "reply" })
        ],
        previousMessageCount: 1,
        previousLatestTurnAnchorKey: "u1:a1",
        scrollMode: "anchored_latest_user",
        anchoredUserMessageId: "u1",
        shouldAutoScroll: true
      }),
      "keep-anchored-user-message"
    );
  });

  it("chat mode releases the anchor and enters manual browsing on any manual scroll", () => {
    const next = resolveScrollStateFromUserScroll({
      mode: "chat",
      isNearBottom: true,
      scrollMode: "anchored_latest_user",
      anchoredUserMessageId: "u2"
    });

    assert.deepEqual(
      next,
      {
        shouldAutoScroll: false,
        shouldClearAnchor: true,
        nextScrollMode: "manual_browsing"
      }
    );
    expectScrollMode(next.nextScrollMode, "manual_browsing");
  });

  it("chat mode stays in manual browsing after leaving the anchor, even if near the bottom", () => {
    const next = resolveScrollStateFromUserScroll({
      mode: "chat",
      isNearBottom: true,
      scrollMode: "manual_browsing",
      anchoredUserMessageId: null
    });

    assert.deepEqual(
      resolveScrollStateFromUserScroll({
        mode: "chat",
        isNearBottom: true,
        scrollMode: "manual_browsing",
        anchoredUserMessageId: null
      }),
      {
        shouldAutoScroll: false,
        shouldClearAnchor: false,
        nextScrollMode: "manual_browsing"
      }
    );
    expectScrollMode(next.nextScrollMode, "manual_browsing");
  });

  it("restores a clean session-follow baseline when switching sessions", () => {
    assert.deepEqual(
      getSessionScrollFollowResetState(
        [
          createMessage({ id: "u1", role: "user", content: "first" }),
          createMessage({ id: "a1", role: "assistant", content: "reply" }),
          createMessage({ id: "u2", role: "user", content: "latest" })
        ]
      ),
      {
        previousMessageCount: 3,
        previousLatestTurnAnchorKey: "u2:none",
        anchoredUserMessageId: null,
        shouldAutoScroll: true,
        scrollMode: "idle_follow_bottom"
      }
    );
  });

  it("chat mode re-anchors when a newer user message arrives after manual browsing", () => {
    assert.equal(
      resolveMessageListScrollAction({
        mode: "chat",
        messages: [
          createMessage({ id: "u1", role: "user", content: "first" }),
          createMessage({ id: "a1", role: "assistant", content: "reply" }),
          createMessage({ id: "u2", role: "user", content: "latest" })
        ],
        previousMessageCount: 2,
        previousLatestTurnAnchorKey: "u1:a1",
        scrollMode: "manual_browsing",
        anchoredUserMessageId: null,
        shouldAutoScroll: false
      }),
      "anchor-latest-user-message"
    );
  });

  it("chat mode does not auto-follow assistant updates after manual browsing", () => {
    assert.equal(
      resolveMessageListScrollAction({
        mode: "chat",
        messages: [
          createMessage({ id: "u1", role: "user", content: "latest" }),
          createMessage({ id: "a1", role: "assistant", content: "reply plus more" })
        ],
        previousMessageCount: 1,
        previousLatestTurnAnchorKey: "u1:a1",
        scrollMode: "manual_browsing",
        anchoredUserMessageId: null,
        shouldAutoScroll: false
      }),
      "none"
    );
  });

  it("agent mode keeps the legacy manual-scroll behavior", () => {
    assert.deepEqual(
      resolveScrollStateFromUserScroll({
        mode: "agent",
        isNearBottom: true,
        scrollMode: "idle_follow_bottom",
        anchoredUserMessageId: null
      }),
      {
        shouldAutoScroll: true,
        shouldClearAnchor: false,
        nextScrollMode: "idle_follow_bottom"
      }
    );
  });

  it("agent mode keeps the legacy anchor resolution behavior", () => {
    assert.equal(
      resolveMessageListScrollAction({
        mode: "agent",
        messages: [
          createMessage({ id: "u1", role: "user", content: "latest" }),
          createMessage({ id: "a1", role: "assistant", content: "reply" })
        ],
        previousMessageCount: 1,
        previousLatestTurnAnchorKey: "u1:a1",
        scrollMode: "idle_follow_bottom",
        anchoredUserMessageId: "u1",
        shouldAutoScroll: true
      }),
      "keep-anchored-user-message"
    );
  });

  it("re-anchors when the same latest user message starts a fresh assistant turn after edit or resend", () => {
    assert.equal(
      resolveMessageListScrollAction({
        mode: "chat",
        messages: [
          createMessage({ id: "u1", role: "user", content: "latest edited" }),
          createMessage({ id: "a-new", role: "assistant", content: "" })
        ],
        previousMessageCount: 2,
        previousLatestTurnAnchorKey: "u1:a-old",
        scrollMode: "manual_browsing",
        anchoredUserMessageId: null,
        shouldAutoScroll: false
      }),
      "anchor-latest-user-message"
    );
  });

  it("ignores repeated scroll events that still land on the programmatic target", () => {
    assert.equal(
      shouldIgnoreProgrammaticScrollEvent({
        isProgrammaticScroll: true,
        currentScrollTop: 420,
        targetScrollTop: 420
      }),
      true
    );
    assert.equal(
      shouldIgnoreProgrammaticScrollEvent({
        isProgrammaticScroll: true,
        currentScrollTop: 421.4,
        targetScrollTop: 420
      }),
      true
    );
    assert.equal(
      shouldIgnoreProgrammaticScrollEvent({
        isProgrammaticScroll: true,
        currentScrollTop: 420.4,
        targetScrollTop: 420
      }),
      true
    );
  });

  it("does not ignore user scroll once position moves away from the programmatic target", () => {
    assert.equal(
      shouldIgnoreProgrammaticScrollEvent({
        isProgrammaticScroll: true,
        currentScrollTop: 431,
        targetScrollTop: 420
      }),
      false
    );
    assert.equal(
      shouldIgnoreProgrammaticScrollEvent({
        isProgrammaticScroll: false,
        currentScrollTop: 420,
        targetScrollTop: 420
      }),
      false
    );
  });

  it("measures anchored message top drift against the desired top position", () => {
    assert.equal(
      getAnchoredMessageTopDelta({
        containerTop: 100,
        topInset: 20,
        messageTop: 120
      }),
      0
    );
    assert.equal(
      getAnchoredMessageTopDelta({
        containerTop: 100,
        topInset: 20,
        messageTop: 121.4
      }),
      1.4000000000000057
    );
  });

  it("skips re-alignment when the anchored message only drifts by sub-pixel layout noise", () => {
    assert.equal(shouldRealignAnchoredMessage(0), false);
    assert.equal(shouldRealignAnchoredMessage(0.8), false);
    assert.equal(shouldRealignAnchoredMessage(-0.9), false);
  });

  it("re-aligns when the anchored message visibly drifts away from the target top", () => {
    assert.equal(shouldRealignAnchoredMessage(1.6), true);
    assert.equal(shouldRealignAnchoredMessage(-2), true);
  });
});
