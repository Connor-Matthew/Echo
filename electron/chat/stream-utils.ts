import type { AppSettings } from "../../src/shared/contracts";

const REQUEST_LOG_STRING_LIMIT = 1600;
const REQUEST_LOG_ARRAY_LIMIT = 40;
const REQUEST_LOG_OBJECT_KEY_LIMIT = 40;
const REQUEST_LOG_MAX_DEPTH = 8;

const truncateForLog = (value: string) =>
  value.length > REQUEST_LOG_STRING_LIMIT
    ? `${value.slice(0, REQUEST_LOG_STRING_LIMIT)}...[truncated ${
        value.length - REQUEST_LOG_STRING_LIMIT
      } chars]`
    : value;

const toRequestPreview = (value: unknown, depth = 0): unknown => {
  if (typeof value === "string") {
    return truncateForLog(value);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (depth >= REQUEST_LOG_MAX_DEPTH) {
    return "[max-depth]";
  }
  if (Array.isArray(value)) {
    const items = value
      .slice(0, REQUEST_LOG_ARRAY_LIMIT)
      .map((entry) => toRequestPreview(entry, depth + 1));
    if (value.length > REQUEST_LOG_ARRAY_LIMIT) {
      items.push(`[+${value.length - REQUEST_LOG_ARRAY_LIMIT} items omitted]`);
    }
    return items;
  }

  const source = value as Record<string, unknown>;
  const entries = Object.entries(source).slice(0, REQUEST_LOG_OBJECT_KEY_LIMIT);
  const preview = Object.fromEntries(
    entries.map(([key, entry]) => [key, toRequestPreview(entry, depth + 1)] as const)
  );
  if (Object.keys(source).length > REQUEST_LOG_OBJECT_KEY_LIMIT) {
    return {
      ...preview,
      __omittedKeys: Object.keys(source).length - REQUEST_LOG_OBJECT_KEY_LIMIT
    };
  }
  return preview;
};

export const isAbortError = (error: unknown): error is Error =>
  error instanceof Error && error.name === "AbortError";

export const runStreamWithTimeout = async (
  signal: AbortSignal,
  timeoutMs: number,
  execute: (attemptSignal: AbortSignal) => Promise<void>
) => {
  if (timeoutMs <= 0) {
    await execute(signal);
    return;
  }

  const attemptController = new AbortController();
  let didTimeout = false;
  const syncAbortState = () => {
    attemptController.abort();
  };

  if (signal.aborted) {
    attemptController.abort();
  } else {
    signal.addEventListener("abort", syncAbortState, { once: true });
  }

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    attemptController.abort();
  }, timeoutMs);

  try {
    await execute(attemptController.signal);
  } catch (error) {
    if (didTimeout && isAbortError(error)) {
      throw new Error(`Request timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener("abort", syncAbortState);
  }
};

export const createSseDebugLogger =
  (enabled: boolean, streamId: string) =>
  (...parts: unknown[]) => {
    if (!enabled) {
      return;
    }
    console.info(`[sse:${streamId}]`, ...parts);
  };

export const logChatRequestPayload = (
  streamId: string,
  providerType: AppSettings["providerType"],
  source: string,
  requestPayload: unknown
) => {
  console.info("[chat][provider:request]", {
    streamId,
    providerType,
    source,
    requestPayload: toRequestPreview(requestPayload)
  });
};
