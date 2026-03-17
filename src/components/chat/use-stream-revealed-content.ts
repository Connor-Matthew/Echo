import { startTransition, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../shared/contracts";

const STREAM_REVEAL_MAX_STEP = 9999;
const STREAM_REVEAL_FAST_CPS = 6400;
const STREAM_REVEAL_MEDIUM_CPS = 5200;
const STREAM_REVEAL_SLOW_CPS = 4200;
const STREAM_REVEAL_COMMIT_INTERVAL_MS = 72;

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

export const resolveStreamRevealCommitLength = (
  _content: string,
  _displayedLength: number,
  targetLength: number
) => targetLength;

export const useStreamRevealedContent = ({
  content,
  role,
  disabled = false
}: {
  content: string;
  role: ChatMessage["role"];
  disabled?: boolean;
}) => {
  const [displayedContent, setDisplayedContent] = useState(content);
  const displayedContentRef = useRef(content);
  const targetContentRef = useRef(content);
  const commitDisplayedContent = (next: string) => {
    displayedContentRef.current = next;
    startTransition(() => {
      setDisplayedContent(next);
    });
  };

  useEffect(() => {
    targetContentRef.current = content;

    if (role !== "assistant" || disabled) {
      commitDisplayedContent(content);
      return;
    }

    if (content.length <= displayedContentRef.current.length) {
      commitDisplayedContent(content);
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
        const commitLength = resolveStreamRevealCommitLength(
          target,
          displayedContentRef.current.length,
          virtualLength
        );
        if (commitLength > displayedContentRef.current.length) {
          const next = target.slice(0, commitLength);
          commitDisplayedContent(next);
          lastCommitAt = timestamp;
        }
      }

      if (virtualLength >= target.length) {
        if (displayedContentRef.current.length < target.length) {
          commitDisplayedContent(target);
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
  }, [content, disabled, role]);

  return displayedContent;
};
