import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "../../shared/contracts";

const AUTO_SCROLL_THRESHOLD = 24;
const TOP_SNAPPED_MESSAGE_SELECTOR = "[data-chat-message-id]";

type UseChatScrollFollowParams = {
  sessionId: string;
  messages: ChatMessage[];
  isConfigured: boolean;
  isGenerating: boolean;
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

export const getTopSnappedMessageScrollTop = (payload: {
  contentTop: number;
  messageTop: number;
  topInset: number;
}) => Math.max(0, payload.contentTop + payload.messageTop - payload.topInset);

export const getTopSnapBottomSpacerHeight = (payload: {
  targetTop: number;
  bottomTop: number;
}) => Math.max(0, payload.targetTop - payload.bottomTop);

const getBottomScrollTop = (container: HTMLElement) =>
  Math.max(0, container.scrollHeight - container.clientHeight);

export const useChatScrollFollow = ({
  sessionId,
  messages,
  isConfigured,
  isGenerating
}: UseChatScrollFollowParams) => {
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const scrollContentRef = useRef<HTMLDivElement | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const previousMessageCountRef = useRef(messages.length);
  const previousLatestUserMessageIdRef = useRef<string | null>(getLatestUserMessageId(messages));
  const anchoredUserMessageIdRef = useRef<string | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const sessionScrollFrameRef = useRef<number | null>(null);
  const shouldAutoScrollRef = useRef(true);
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
      return;
    }
    isProgrammaticScrollRef.current = true;
    container.scrollTop = nextTop;
  };

  const clearAnchor = () => {
    anchoredUserMessageIdRef.current = null;
    setAnchoredUserMessageId(null);
    setBottomSpacer(0);
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

    const computedStyle = window.getComputedStyle(container);
    const topInset = Number.parseFloat(computedStyle.paddingTop || "0") || 0;
    const targetTop = getTopSnappedMessageScrollTop({
      contentTop: content.offsetTop,
      messageTop: messageElement.offsetTop,
      topInset
    });

    const bottomTop = getBottomScrollTop(container);
    setBottomSpacer(
      getTopSnapBottomSpacerHeight({
        targetTop,
        bottomTop
      })
    );

    setProgrammaticScrollTop(container, Math.min(targetTop, getBottomScrollTop(container)));
    return true;
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const isNearBottom = () => getBottomScrollTop(container) - container.scrollTop <= AUTO_SCROLL_THRESHOLD;

    const onScroll = () => {
      if (isProgrammaticScrollRef.current) {
        isProgrammaticScrollRef.current = false;
        return;
      }

      shouldAutoScrollRef.current = isNearBottom();
      if (anchoredUserMessageIdRef.current) {
        clearAnchor();
      }
    };

    shouldAutoScrollRef.current = isNearBottom();
    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", onScroll);
    };
  }, [isConfigured]);

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
        if (shouldAutoScrollRef.current) {
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

    clearAnchor();
    shouldAutoScrollRef.current = true;
    previousMessageCountRef.current = messages.length;
    previousLatestUserMessageIdRef.current = getLatestUserMessageId(messages);

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
  }, [sessionId]);

  useLayoutEffect(() => {
    if (!messages.length) {
      return;
    }

    const hasNewMessage = messages.length > previousMessageCountRef.current;
    const latestUserMessageId = getLatestUserMessageId(messages);
    const latestUserMessageChanged = latestUserMessageId !== previousLatestUserMessageIdRef.current;

    if (latestUserMessageChanged && latestUserMessageId) {
      anchoredUserMessageIdRef.current = latestUserMessageId;
      setAnchoredUserMessageId(latestUserMessageId);
      shouldAutoScrollRef.current = true;
      alignAnchoredUserMessage(latestUserMessageId);
    } else if (anchoredUserMessageIdRef.current) {
      alignAnchoredUserMessage(anchoredUserMessageIdRef.current);
    } else if (shouldAutoScrollRef.current && hasNewMessage) {
      alignBottom();
    }

    previousMessageCountRef.current = messages.length;
    previousLatestUserMessageIdRef.current = latestUserMessageId;
  }, [messages]);

  useEffect(() => {
    return () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
      if (sessionScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(sessionScrollFrameRef.current);
      }
    };
  }, []);

  return {
    scrollContainerRef,
    scrollContentRef,
    activeGeneratingAssistantId,
    isTopSnapActive: Boolean(anchoredUserMessageId)
  };
};
