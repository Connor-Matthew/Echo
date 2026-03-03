import { useEffect, useMemo, useRef } from "react";
import type { ChatMessage } from "../../shared/contracts";

const AUTO_SCROLL_THRESHOLD = 24;
const STREAM_AUTO_FOLLOW_INTERVAL_MS = 260;
const STREAM_RESIZE_FOLLOW_INTERVAL_MS = 240;
const STREAM_RESIZE_FOLLOW_MIN_DELTA_PX = 16;
const STREAM_FOLLOW_TAIL_MIN_PX = 24;
const STREAM_FOLLOW_TAIL_MAX_PX = 96;
const STREAM_FOLLOW_TAIL_RATIO = 0.42;
const STREAM_FOLLOW_TARGET_STEP_PX = 10;
const STREAM_FOLLOW_MAGNETIC_SNAP_RANGE = 40;
const CINEMATIC_FOLLOW_SPRING_STIFFNESS = 330;
const CINEMATIC_FOLLOW_DAMPING = 38;
const CINEMATIC_FOLLOW_MAX_DT_SECONDS = 1 / 24;
const CINEMATIC_FOLLOW_STOP_DISTANCE_PX = 0.6;
const CINEMATIC_FOLLOW_STOP_VELOCITY = 12;
const MANUAL_SCROLL_LERP_FACTOR = 0.14;

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

export const getFollowTargetTop = (payload: {
  bottomTop: number;
  currentTop: number;
  streaming: boolean;
}) => {
  if (!payload.streaming) {
    return payload.bottomTop;
  }
  const distanceToBottom = Math.max(0, payload.bottomTop - payload.currentTop);
  if (distanceToBottom <= STREAM_FOLLOW_MAGNETIC_SNAP_RANGE) {
    return payload.bottomTop;
  }
  const tailDistance = Math.min(
    STREAM_FOLLOW_TAIL_MAX_PX,
    Math.max(STREAM_FOLLOW_TAIL_MIN_PX, distanceToBottom * STREAM_FOLLOW_TAIL_RATIO)
  );
  const rawTarget = Math.max(0, payload.bottomTop - tailDistance);
  const steppedTarget =
    Math.floor(rawTarget / STREAM_FOLLOW_TARGET_STEP_PX) * STREAM_FOLLOW_TARGET_STEP_PX;
  return Math.max(0, Math.min(payload.bottomTop, steppedTarget));
};

export const useChatScrollFollow = ({
  sessionId,
  messages,
  isConfigured,
  isGenerating
}: UseChatScrollFollowParams) => {
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const scrollContentRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const pendingScrollFrameRef = useRef<number | null>(null);
  const smoothScrollFrameRef = useRef<number | null>(null);
  const manualScrollFrameRef = useRef<number | null>(null);
  const manualScrollTargetRef = useRef<number | null>(null);
  const cinematicFollowVelocityRef = useRef(0);
  const cinematicFollowLastTimestampRef = useRef<number | null>(null);
  const cinematicFollowStreamingRef = useRef(false);
  const streamResizeLastFollowAtRef = useRef(0);
  const streamResizeLastHeightRef = useRef(0);
  const isProgrammaticScrollRef = useRef(false);
  const lastStreamFollowAtRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const previousMessageCountRef = useRef(messages.length);

  const setProgrammaticScrollTop = (container: HTMLElement, nextTop: number) => {
    if (Math.abs(container.scrollTop - nextTop) <= 0.5) {
      return;
    }
    isProgrammaticScrollRef.current = true;
    container.scrollTop = nextTop;
  };

  const stopCinematicFollow = () => {
    if (smoothScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(smoothScrollFrameRef.current);
      smoothScrollFrameRef.current = null;
    }
    cinematicFollowVelocityRef.current = 0;
    cinematicFollowLastTimestampRef.current = null;
  };

  const requestCinematicFollow = (streaming: boolean) => {
    cinematicFollowStreamingRef.current = streaming;
    if (!shouldAutoScrollRef.current) {
      return;
    }
    if (smoothScrollFrameRef.current !== null) {
      return;
    }
    cinematicFollowLastTimestampRef.current = null;

    const animate = (timestamp: number) => {
      const container = scrollContainerRef.current;
      if (!container || !shouldAutoScrollRef.current) {
        stopCinematicFollow();
        return;
      }

      const bottomTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const targetTop = getFollowTargetTop({
        bottomTop,
        currentTop: container.scrollTop,
        streaming: cinematicFollowStreamingRef.current
      });
      const currentTop = container.scrollTop;
      const delta = targetTop - currentTop;
      const previousTimestamp = cinematicFollowLastTimestampRef.current;
      const dt =
        previousTimestamp === null
          ? 1 / 60
          : Math.min(
              CINEMATIC_FOLLOW_MAX_DT_SECONDS,
              Math.max(1 / 240, (timestamp - previousTimestamp) / 1000)
            );
      cinematicFollowLastTimestampRef.current = timestamp;

      const acceleration =
        delta * CINEMATIC_FOLLOW_SPRING_STIFFNESS -
        cinematicFollowVelocityRef.current * CINEMATIC_FOLLOW_DAMPING;
      cinematicFollowVelocityRef.current += acceleration * dt;
      const nextTop = Math.max(
        0,
        Math.min(bottomTop, currentTop + cinematicFollowVelocityRef.current * dt)
      );
      setProgrammaticScrollTop(container, nextTop);

      const distanceToTarget = targetTop - container.scrollTop;
      const distanceToBottom = bottomTop - container.scrollTop;
      const shouldMagneticSnap =
        cinematicFollowStreamingRef.current &&
        distanceToBottom <= STREAM_FOLLOW_MAGNETIC_SNAP_RANGE &&
        cinematicFollowVelocityRef.current > -10;
      if (shouldMagneticSnap) {
        setProgrammaticScrollTop(container, bottomTop);
        stopCinematicFollow();
        return;
      }
      if (
        Math.abs(distanceToTarget) <= CINEMATIC_FOLLOW_STOP_DISTANCE_PX &&
        Math.abs(cinematicFollowVelocityRef.current) <= CINEMATIC_FOLLOW_STOP_VELOCITY
      ) {
        setProgrammaticScrollTop(container, targetTop);
        stopCinematicFollow();
        return;
      }
      smoothScrollFrameRef.current = window.requestAnimationFrame(animate);
    };

    smoothScrollFrameRef.current = window.requestAnimationFrame(animate);
  };

  const latestMessage = messages[messages.length - 1];
  const activeGeneratingAssistantId = useMemo(
    () => getActiveGeneratingAssistantId(messages, isGenerating),
    [isGenerating, messages]
  );
  const hasGeneratingAssistant = isGenerating && Boolean(activeGeneratingAssistantId);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const isNearBottom = () =>
      container.scrollHeight - container.scrollTop - container.clientHeight <= AUTO_SCROLL_THRESHOLD;

    const onWheel = (event: WheelEvent) => {
      let deltaY = event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        deltaY *= 16;
      } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        deltaY *= container.clientHeight;
      }

      if (Math.abs(deltaY) < 0.1) {
        return;
      }

      event.preventDefault();
      const nearBottomBeforeScroll = isNearBottom();
      if (deltaY < 0 || !nearBottomBeforeScroll) {
        shouldAutoScrollRef.current = false;
      }

      stopCinematicFollow();

      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const baseTarget = manualScrollTargetRef.current ?? container.scrollTop;
      manualScrollTargetRef.current = Math.max(0, Math.min(maxTop, baseTarget + deltaY));

      if (manualScrollFrameRef.current !== null) {
        return;
      }

      const animateManualScroll = () => {
        const target = manualScrollTargetRef.current;
        if (target === null) {
          manualScrollFrameRef.current = null;
          return;
        }
        const current = container.scrollTop;
        const delta = target - current;
        if (Math.abs(delta) <= 0.6) {
          setProgrammaticScrollTop(container, target);
          lastScrollTopRef.current = target;
          manualScrollTargetRef.current = null;
          manualScrollFrameRef.current = null;
          return;
        }

        setProgrammaticScrollTop(container, current + delta * MANUAL_SCROLL_LERP_FACTOR);
        lastScrollTopRef.current = container.scrollTop;
        manualScrollFrameRef.current = window.requestAnimationFrame(animateManualScroll);
      };

      manualScrollFrameRef.current = window.requestAnimationFrame(animateManualScroll);
    };

    const onScroll = () => {
      const currentTop = container.scrollTop;

      if (isProgrammaticScrollRef.current) {
        isProgrammaticScrollRef.current = false;
        lastScrollTopRef.current = currentTop;
        return;
      }

      stopCinematicFollow();
      if (manualScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(manualScrollFrameRef.current);
        manualScrollFrameRef.current = null;
      }
      manualScrollTargetRef.current = null;
      const nearBottom = isNearBottom();

      shouldAutoScrollRef.current = nearBottom;

      lastScrollTopRef.current = currentTop;
    };

    lastScrollTopRef.current = container.scrollTop;
    shouldAutoScrollRef.current = isNearBottom();
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("scroll", onScroll);
    };
  }, [isConfigured]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = scrollContentRef.current;
    if (!container || !content || typeof ResizeObserver === "undefined") {
      return;
    }

    let frameId: number | null = null;
    const queueCinematicFollow = () => {
      frameId = null;
      if (!shouldAutoScrollRef.current) {
        return;
      }
      requestCinematicFollow(hasGeneratingAssistant);
    };

    const observer = new ResizeObserver(() => {
      if (!shouldAutoScrollRef.current) {
        return;
      }
      if (hasGeneratingAssistant) {
        const now = window.performance.now();
        const currentHeight = content.scrollHeight;
        const heightDelta = Math.abs(currentHeight - streamResizeLastHeightRef.current);
        const intervalElapsed = now - streamResizeLastFollowAtRef.current;
        if (
          heightDelta < STREAM_RESIZE_FOLLOW_MIN_DELTA_PX &&
          intervalElapsed < STREAM_RESIZE_FOLLOW_INTERVAL_MS
        ) {
          return;
        }
        streamResizeLastHeightRef.current = currentHeight;
        streamResizeLastFollowAtRef.current = now;
      }
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(queueCinematicFollow);
    });
    observer.observe(content);
    streamResizeLastHeightRef.current = content.scrollHeight;
    streamResizeLastFollowAtRef.current = window.performance.now();

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [hasGeneratingAssistant, isConfigured, messages.length, sessionId]);

  useEffect(() => {
    return () => {
      if (pendingScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current);
      }
      stopCinematicFollow();
      if (manualScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(manualScrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
    }
    stopCinematicFollow();
    if (manualScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(manualScrollFrameRef.current);
      manualScrollFrameRef.current = null;
    }
    manualScrollTargetRef.current = null;
    lastStreamFollowAtRef.current = 0;
    cinematicFollowStreamingRef.current = false;
    streamResizeLastFollowAtRef.current = 0;
    streamResizeLastHeightRef.current = 0;
    shouldAutoScrollRef.current = true;
    previousMessageCountRef.current = messages.length;
    pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingScrollFrameRef.current = null;
      const nextContainer = scrollContainerRef.current;
      if (!nextContainer) {
        return;
      }
      setProgrammaticScrollTop(nextContainer, nextContainer.scrollHeight);
      lastScrollTopRef.current = nextContainer.scrollTop;
    });
  }, [sessionId]);

  useEffect(() => {
    if (!messages.length) {
      return;
    }

    const previousMessageCount = previousMessageCountRef.current;
    const hasNewMessage = messages.length > previousMessageCount;
    const shouldForceScroll = latestMessage?.role === "user";
    const isStreamingAssistantUpdate = Boolean(
      hasGeneratingAssistant &&
      latestMessage?.role === "assistant" &&
      latestMessage?.id === activeGeneratingAssistantId &&
      !hasNewMessage &&
      !shouldForceScroll
    );
    const shouldFollow = shouldAutoScrollRef.current || shouldForceScroll;
    if (!shouldFollow) {
      previousMessageCountRef.current = messages.length;
      return;
    }

    if (isStreamingAssistantUpdate) {
      const now = window.performance.now();
      if (now - lastStreamFollowAtRef.current < STREAM_AUTO_FOLLOW_INTERVAL_MS) {
        previousMessageCountRef.current = messages.length;
        return;
      }
      lastStreamFollowAtRef.current = now;
    }

    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
    }
    pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingScrollFrameRef.current = null;
      if (manualScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(manualScrollFrameRef.current);
        manualScrollFrameRef.current = null;
      }
      manualScrollTargetRef.current = null;
      const shouldUseStreamingTail = isStreamingAssistantUpdate && !shouldForceScroll && !hasNewMessage;
      if (shouldForceScroll) {
        cinematicFollowVelocityRef.current = Math.max(cinematicFollowVelocityRef.current, 380);
      }
      requestCinematicFollow(shouldUseStreamingTail);
      shouldAutoScrollRef.current = true;
    });
    previousMessageCountRef.current = messages.length;
  }, [
    messages.length,
    activeGeneratingAssistantId,
    hasGeneratingAssistant,
    latestMessage?.id,
    latestMessage?.content,
    latestMessage?.reasoningContent,
    latestMessage?.toolCalls?.length,
    latestMessage?.toolCalls?.[latestMessage.toolCalls.length - 1]?.status
  ]);

  return {
    scrollContainerRef,
    scrollContentRef,
    activeGeneratingAssistantId
  };
};
