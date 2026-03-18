import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../../shared/contracts";

const AUTO_SCROLL_THRESHOLD = 24;
const TOP_SNAPPED_MESSAGE_SELECTOR = "[data-chat-message-id]";
const PROGRAMMATIC_SCROLL_TOLERANCE = 1.5;
const ANCHORED_MESSAGE_REALIGN_TOLERANCE = 1.5;

export type ChatScrollMode =
  | "idle_follow_bottom"
  | "anchored_latest_user"
  | "manual_browsing";

export type MessageListScrollAction =
  | "anchor-latest-user-message"
  | "keep-anchored-user-message"
  | "align-bottom"
  | "none";

type UseChatScrollFollowParams = {
  sessionId: string;
  messages: ChatMessage[];
  isConfigured: boolean;
  isGenerating: boolean;
  mode: "chat" | "agent";
};

type ResolveMessageListScrollActionParams = {
  mode: "chat" | "agent";
  messages: ChatMessage[];
  previousMessageCount: number;
  previousLatestTurnAnchorKey: string | null;
  scrollMode: ChatScrollMode;
  anchoredUserMessageId: string | null;
  shouldAutoScroll: boolean;
};

type ResolveScrollStateFromUserScrollParams = {
  mode: "chat" | "agent";
  isNearBottom: boolean;
  scrollMode: ChatScrollMode;
  anchoredUserMessageId: string | null;
};

export const getActiveGeneratingAssistantId = (
  messages: ChatMessage[],
  isGenerating: boolean
) => {
  if (!isGenerating) {
    return null;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "assistant") {
      return messages[index].id;
    }
  }
  return null;
};

export const getLatestUserMessageId = (messages: ChatMessage[]) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      return messages[index].id;
    }
  }
  return null;
};

export const getLatestTurnAnchorKey = (messages: ChatMessage[]) => {
  const latestUserMessageId = getLatestUserMessageId(messages);
  if (!latestUserMessageId) {
    return null;
  }

  const latestUserIndex = messages.findIndex((message) => message.id === latestUserMessageId);
  let latestAssistantAfterUserId: string | null = null;

  for (let index = messages.length - 1; index > latestUserIndex; index -= 1) {
    if (messages[index].role === "assistant") {
      latestAssistantAfterUserId = messages[index].id;
      break;
    }
  }

  return `${latestUserMessageId}:${latestAssistantAfterUserId ?? "none"}`;
};

export const getTopSnappedMessageScrollTop = (payload: {
  currentScrollTop: number;
  containerTop: number;
  containerPaddingTop: number;
  messageTop: number;
}) =>
  Math.max(
    0,
    payload.currentScrollTop +
      payload.messageTop -
      (payload.containerTop + payload.containerPaddingTop)
  );

export const getTopSnapBottomSpacerHeight = (payload: {
  targetTop: number;
  intrinsicBottomTop: number;
}) => Math.max(0, payload.targetTop - payload.intrinsicBottomTop);

export const resolveMessageListScrollAction = ({
  mode,
  messages,
  previousMessageCount,
  previousLatestTurnAnchorKey,
  scrollMode,
  anchoredUserMessageId,
  shouldAutoScroll
}: ResolveMessageListScrollActionParams): MessageListScrollAction => {
  if (!messages.length) {
    return "none";
  }

  const hasNewMessage = messages.length > previousMessageCount;
  const latestUserMessageId = getLatestUserMessageId(messages);
  const latestTurnAnchorKey = getLatestTurnAnchorKey(messages);
  const latestTurnChanged = latestTurnAnchorKey !== previousLatestTurnAnchorKey;

  if (mode === "agent") {
    if (latestTurnChanged && latestUserMessageId) {
      return "anchor-latest-user-message";
    }
    if (anchoredUserMessageId) {
      return "keep-anchored-user-message";
    }
    if (shouldAutoScroll && hasNewMessage) {
      return "align-bottom";
    }
    return "none";
  }

  if (latestTurnChanged && latestUserMessageId) {
    return "anchor-latest-user-message";
  }
  if (scrollMode === "anchored_latest_user" && anchoredUserMessageId) {
    return "keep-anchored-user-message";
  }
  if (scrollMode === "idle_follow_bottom" && shouldAutoScroll && hasNewMessage) {
    return "align-bottom";
  }
  return "none";
};

export const resolveScrollStateFromUserScroll = ({
  mode,
  isNearBottom,
  scrollMode,
  anchoredUserMessageId
}: ResolveScrollStateFromUserScrollParams) => {
  if (mode === "chat") {
    return {
      shouldAutoScroll: false,
      shouldClearAnchor: Boolean(anchoredUserMessageId),
      nextScrollMode: "manual_browsing" as ChatScrollMode
    };
  }

  if (anchoredUserMessageId) {
    return {
      shouldAutoScroll: false,
      shouldClearAnchor: true,
      nextScrollMode: "manual_browsing" as ChatScrollMode
    };
  }

  return {
    shouldAutoScroll: isNearBottom,
    shouldClearAnchor: false,
    nextScrollMode: (scrollMode === "anchored_latest_user"
      ? "manual_browsing"
      : isNearBottom
        ? "idle_follow_bottom"
        : "manual_browsing") as ChatScrollMode
  };
};

export const getSessionScrollFollowResetState = (messages: ChatMessage[]) => ({
  previousMessageCount: messages.length,
  previousLatestTurnAnchorKey: getLatestTurnAnchorKey(messages),
  anchoredUserMessageId: null,
  shouldAutoScroll: true,
  scrollMode: "idle_follow_bottom" as ChatScrollMode
});

export const shouldIgnoreProgrammaticScrollEvent = (payload: {
  isProgrammaticScroll: boolean;
  currentScrollTop: number;
  targetScrollTop: number | null;
}) =>
  Boolean(
    payload.isProgrammaticScroll &&
      payload.targetScrollTop !== null &&
      Math.abs(payload.currentScrollTop - payload.targetScrollTop) <= PROGRAMMATIC_SCROLL_TOLERANCE
  );

export const getAnchoredMessageTopDelta = (payload: {
  containerTop: number;
  containerPaddingTop: number;
  messageTop: number;
}) => payload.messageTop - (payload.containerTop + payload.containerPaddingTop);

export const shouldRealignAnchoredMessage = (topDelta: number) =>
  Math.abs(topDelta) > ANCHORED_MESSAGE_REALIGN_TOLERANCE;

const getBottomScrollTop = (container: HTMLElement) =>
  Math.max(0, container.scrollHeight - container.clientHeight);

export const useChatScrollFollow = ({
  sessionId,
  messages,
  isConfigured,
  isGenerating,
  mode
}: UseChatScrollFollowParams) => {
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const scrollContentRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const previousMessageCountRef = useRef(messages.length);
  const previousLatestTurnAnchorKeyRef = useRef<string | null>(getLatestTurnAnchorKey(messages));
  const anchoredUserMessageIdRef = useRef<string | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const sessionScrollFrameRef = useRef<number | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const scrollModeRef = useRef<ChatScrollMode>("idle_follow_bottom");
  const programmaticScrollTargetRef = useRef<number | null>(null);
  const [anchoredUserMessageId, setAnchoredUserMessageId] = useState<string | null>(null);

  const activeGeneratingAssistantId = useMemo(
    () => getActiveGeneratingAssistantId(messages, isGenerating),
    [isGenerating, messages]
  );

  const setBottomSpacer = (height: number) => {
    const content = scrollContentRef.current;
    if (!content) {
      return;
    }
    content.style.paddingBottom = height > 0 ? `${height}px` : "";
  };

  const setProgrammaticScrollTop = (container: HTMLElement, nextTop: number) => {
    if (Math.abs(container.scrollTop - nextTop) <= 0.5) {
      programmaticScrollTargetRef.current = nextTop;
      return;
    }
    isProgrammaticScrollRef.current = true;
    programmaticScrollTargetRef.current = nextTop;
    container.scrollTop = nextTop;
  };

  const clearAnchor = () => {
    anchoredUserMessageIdRef.current = null;
    setAnchoredUserMessageId(null);
    // Do NOT clear the bottom spacer here. The spacer is what makes the current
    // scroll position reachable. Removing it immediately would shrink scrollHeight
    // and cause the browser to clamp scrollTop, producing a visible jump.
    // The spacer is cleared lazily in alignBottom() when the user or logic
    // actually scrolls to the bottom.
  };

  const alignBottom = () => {
    const container = scrollContainerRef.current;
    if (!container) {
      return false;
    }
    setBottomSpacer(0);
    setProgrammaticScrollTop(container, getBottomScrollTop(container));
    return true;
  };

  const alignAnchoredUserMessage = (messageId: string) => {
    const container = scrollContainerRef.current;
    const content = scrollContentRef.current;
    if (!container || !content) {
      return false;
    }

    const messageElement = content.querySelector<HTMLElement>(
      `${TOP_SNAPPED_MESSAGE_SELECTOR}[data-chat-message-id="${messageId}"]`
    );
    if (!messageElement) {
      return false;
    }

    const containerRect = container.getBoundingClientRect();
    const messageRect = messageElement.getBoundingClientRect();
    const containerPaddingTop =
      Number.parseFloat(window.getComputedStyle(container).paddingTop || "0") || 0;
    const topDelta = getAnchoredMessageTopDelta({
      containerTop: containerRect.top,
      containerPaddingTop,
      messageTop: messageRect.top
    });
    const targetTop = getTopSnappedMessageScrollTop({
      currentScrollTop: container.scrollTop,
      containerTop: containerRect.top,
      containerPaddingTop,
      messageTop: messageRect.top
    });

    const currentBottomSpacerHeight =
      Number.parseFloat(window.getComputedStyle(content).paddingBottom || "0") || 0;
    const intrinsicBottomTop = Math.max(0, getBottomScrollTop(container) - currentBottomSpacerHeight);
    const neededSpacerHeight = getTopSnapBottomSpacerHeight({
      targetTop,
      intrinsicBottomTop
    });
    // setBottomSpacer adjusts paddingBottom so targetTop becomes reachable.
    // scrollHeight won't reflect this until after layout, so use targetTop directly
    // rather than clamping with a stale getBottomScrollTop().
    setBottomSpacer(neededSpacerHeight);

    if (shouldRealignAnchoredMessage(topDelta)) {
      setProgrammaticScrollTop(container, targetTop);
    } else {
      programmaticScrollTargetRef.current = targetTop;
    }
    return true;
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const isNearBottom = () => getBottomScrollTop(container) - container.scrollTop <= AUTO_SCROLL_THRESHOLD;

    const onScroll = () => {
      if (
        shouldIgnoreProgrammaticScrollEvent({
          isProgrammaticScroll: isProgrammaticScrollRef.current,
          currentScrollTop: container.scrollTop,
          targetScrollTop: programmaticScrollTargetRef.current
        })
      ) {
        return;
      }

      isProgrammaticScrollRef.current = false;
      programmaticScrollTargetRef.current = null;

      const nextScrollState = resolveScrollStateFromUserScroll({
        mode,
        isNearBottom: isNearBottom(),
        scrollMode: scrollModeRef.current,
        anchoredUserMessageId: anchoredUserMessageIdRef.current
      });

      shouldAutoScrollRef.current = nextScrollState.shouldAutoScroll;
      scrollModeRef.current = nextScrollState.nextScrollMode;
      if (nextScrollState.shouldClearAnchor) {
        clearAnchor();
      }
    };

    shouldAutoScrollRef.current = isNearBottom();
    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", onScroll);
    };
  }, [isConfigured, mode]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = scrollContentRef.current;
    if (!container || !content || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }

      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        if (anchoredUserMessageIdRef.current) {
          alignAnchoredUserMessage(anchoredUserMessageIdRef.current);
          return;
        }
        if (shouldAutoScrollRef.current && scrollModeRef.current !== "manual_browsing") {
          alignBottom();
        }
      });
    });

    observer.observe(content);

    return () => {
      observer.disconnect();
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [isConfigured]);

  useEffect(() => {
    if (sessionScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(sessionScrollFrameRef.current);
    }

    const nextSessionState = getSessionScrollFollowResetState(messages);
    clearAnchor();
    anchoredUserMessageIdRef.current = nextSessionState.anchoredUserMessageId;
    shouldAutoScrollRef.current = nextSessionState.shouldAutoScroll;
    scrollModeRef.current = nextSessionState.scrollMode;
    previousMessageCountRef.current = nextSessionState.previousMessageCount;
    previousLatestTurnAnchorKeyRef.current = nextSessionState.previousLatestTurnAnchorKey;

    sessionScrollFrameRef.current = window.requestAnimationFrame(() => {
      sessionScrollFrameRef.current = null;
      alignBottom();
    });

    return () => {
      if (sessionScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(sessionScrollFrameRef.current);
        sessionScrollFrameRef.current = null;
      }
    };
  }, [mode, sessionId]);

  useLayoutEffect(() => {
    const nextAction = resolveMessageListScrollAction({
      mode,
      messages,
      previousMessageCount: previousMessageCountRef.current,
      previousLatestTurnAnchorKey: previousLatestTurnAnchorKeyRef.current,
      scrollMode: scrollModeRef.current,
      anchoredUserMessageId: anchoredUserMessageIdRef.current,
      shouldAutoScroll: shouldAutoScrollRef.current
    });
    const latestUserMessageId = getLatestUserMessageId(messages);
    const latestTurnAnchorKey = getLatestTurnAnchorKey(messages);

    if (nextAction === "anchor-latest-user-message" && latestUserMessageId) {
      anchoredUserMessageIdRef.current = latestUserMessageId;
      setAnchoredUserMessageId(latestUserMessageId);
      shouldAutoScrollRef.current = mode === "agent";
      scrollModeRef.current = "anchored_latest_user";
      alignAnchoredUserMessage(latestUserMessageId);
    } else if (nextAction === "keep-anchored-user-message" && anchoredUserMessageIdRef.current) {
      scrollModeRef.current = "anchored_latest_user";
      alignAnchoredUserMessage(anchoredUserMessageIdRef.current);
    } else if (nextAction === "align-bottom") {
      scrollModeRef.current = "idle_follow_bottom";
      alignBottom();
    }

    previousMessageCountRef.current = messages.length;
    previousLatestTurnAnchorKeyRef.current = latestTurnAnchorKey;
  }, [messages, mode]);

  useEffect(() => {
    return () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
      if (sessionScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(sessionScrollFrameRef.current);
      }
      programmaticScrollTargetRef.current = null;
    };
  }, []);

  return {
    scrollContainerRef,
    scrollContentRef,
    activeGeneratingAssistantId,
    isTopSnapActive: Boolean(anchoredUserMessageId)
  };
};
