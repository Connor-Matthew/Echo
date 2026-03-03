import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../shared/contracts";

const STREAM_REVEAL_MAX_STEP = 24;
const STREAM_REVEAL_FAST_CPS = 420;
const STREAM_REVEAL_MEDIUM_CPS = 300;
const STREAM_REVEAL_SLOW_CPS = 170;
const STREAM_REVEAL_COMMIT_INTERVAL_MS = 40;

export const resolveStreamRevealCharsPerSecond = (remaining: number) =>
  remaining > 600
    ? STREAM_REVEAL_FAST_CPS
    : remaining > 240
      ? STREAM_REVEAL_MEDIUM_CPS
      : STREAM_REVEAL_SLOW_CPS;

export const resolveStreamRevealStep = (carry: number, remaining: number) => {
  const whole = Math.floor(carry);
  if (whole <= 0) {
    return { step: 0, nextCarry: carry };
  }
  return {
    step: Math.min(whole, STREAM_REVEAL_MAX_STEP, remaining),
    nextCarry: carry - whole
  };
};

export const useStreamRevealedContent = ({
  content,
  role
}: {
  content: string;
  role: ChatMessage["role"];
}) => {
  const [displayedContent, setDisplayedContent] = useState(content);
  const displayedContentRef = useRef(content);
  const targetContentRef = useRef(content);

  useEffect(() => {
    targetContentRef.current = content;

    if (role !== "assistant") {
      displayedContentRef.current = content;
      setDisplayedContent(content);
      return;
    }

    if (content.length <= displayedContentRef.current.length) {
      displayedContentRef.current = content;
      setDisplayedContent(content);
      return;
    }

    let frameId: number | null = null;
    let carry = 0;
    let virtualLength = displayedContentRef.current.length;
    let lastTimestamp = window.performance.now();
    let lastCommitAt = lastTimestamp;

    const animate = (timestamp: number) => {
      const target = targetContentRef.current;
      if (virtualLength >= target.length) {
        frameId = null;
        return;
      }

      const elapsed = Math.max(0, timestamp - lastTimestamp);
      lastTimestamp = timestamp;
      const remaining = target.length - virtualLength;
      const charsPerSecond = resolveStreamRevealCharsPerSecond(remaining);
      carry += (elapsed / 1000) * charsPerSecond;

      const { step, nextCarry } = resolveStreamRevealStep(carry, remaining);
      carry = nextCarry;
      if (step > 0) {
        virtualLength += step;
      }

      const shouldCommit =
        timestamp - lastCommitAt >= STREAM_REVEAL_COMMIT_INTERVAL_MS || virtualLength >= target.length;
      if (shouldCommit && virtualLength > displayedContentRef.current.length) {
        const next = target.slice(0, virtualLength);
        displayedContentRef.current = next;
        setDisplayedContent(next);
        lastCommitAt = timestamp;
      }

      if (virtualLength >= target.length) {
        if (displayedContentRef.current.length < target.length) {
          displayedContentRef.current = target;
          setDisplayedContent(target);
        }
        frameId = null;
        return;
      }

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [content, role]);

  return displayedContent;
};
