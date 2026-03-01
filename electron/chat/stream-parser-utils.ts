import type { AppSettings, ChatUsage } from "../../src/shared/contracts";

const readString = (value: unknown) => (typeof value === "string" ? value : "");

const extractTextFromUnknown = (value: unknown): string => {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (entry && typeof entry === "object") {
          const block = entry as { text?: unknown; content?: unknown };
          return readString(block.text) || readString(block.content);
        }
        return "";
      })
      .join("");
  }
  if (typeof value === "object") {
    const block = value as { text?: unknown; content?: unknown };
    return readString(block.text) || readString(block.content);
  }
  return "";
};

export const extractOpenAiLikeDeltas = (delta: unknown): { content: string; reasoning: string } => {
  if (!delta || typeof delta !== "object") {
    return { content: "", reasoning: "" };
  }

  const source = delta as {
    content?: unknown;
    reasoning_content?: unknown;
    reasoning?: unknown;
    reasoningContent?: unknown;
    thinking?: unknown;
  };

  return {
    content: extractTextFromUnknown(source.content),
    reasoning:
      extractTextFromUnknown(source.reasoning_content) ||
      extractTextFromUnknown(source.reasoningContent) ||
      extractTextFromUnknown(source.reasoning) ||
      extractTextFromUnknown(source.thinking)
  };
};

const toTokenNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
};

const pickLargestTokenNumber = (...values: unknown[]) => {
  let resolved: number | undefined;
  for (const value of values) {
    const token = toTokenNumber(value);
    if (token === undefined) {
      continue;
    }
    resolved = resolved === undefined ? token : Math.max(resolved, token);
  }
  return resolved;
};

const readNestedTokenNumber = (
  source: Record<string, unknown>,
  key: string,
  nestedKey: string
) => {
  const nested = source[key];
  if (!nested || typeof nested !== "object") {
    return undefined;
  }
  return toTokenNumber((nested as Record<string, unknown>)[nestedKey]);
};

export const extractOpenAiUsage = (payload: unknown): ChatUsage | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const source = payload as { usage?: Record<string, unknown> };
  if (!source.usage || typeof source.usage !== "object") {
    return undefined;
  }

  const usage = source.usage;
  const inputTokens = toTokenNumber(usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens);
  const outputTokens = toTokenNumber(
    usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens
  );
  const totalTokens = toTokenNumber(usage.total_tokens ?? usage.totalTokens);
  const cacheReadTokens = pickLargestTokenNumber(
    usage.cached_tokens,
    usage.cache_read_input_tokens,
    readNestedTokenNumber(usage, "prompt_tokens_details", "cached_tokens"),
    readNestedTokenNumber(usage, "input_tokens_details", "cached_tokens")
  );
  const cacheWriteTokens = toTokenNumber(usage.cache_creation_input_tokens);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens,
    cacheWriteTokens
  };
};

export const extractAnthropicUsage = (payload: unknown): ChatUsage | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const source = payload as {
    usage?: Record<string, unknown>;
    message?: { usage?: Record<string, unknown> };
    delta?: { usage?: Record<string, unknown> };
  };
  const usageSource = source.usage ?? source.message?.usage ?? source.delta?.usage;
  if (!usageSource || typeof usageSource !== "object") {
    return undefined;
  }

  const inputTokens = toTokenNumber(usageSource.input_tokens ?? usageSource.inputTokens);
  const outputTokens = toTokenNumber(usageSource.output_tokens ?? usageSource.outputTokens);
  const cacheReadTokens = toTokenNumber(
    usageSource.cache_read_input_tokens ?? usageSource.cacheReadTokens
  );
  const cacheWriteTokens = toTokenNumber(
    usageSource.cache_creation_input_tokens ?? usageSource.cacheWriteTokens
  );
  const totalTokens = toTokenNumber(usageSource.total_tokens ?? usageSource.totalTokens);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      totalTokens ??
      (inputTokens !== undefined || outputTokens !== undefined
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined),
    cacheReadTokens,
    cacheWriteTokens
  };
};

export const extractGenericUsage = (payload: unknown): ChatUsage | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const source = payload as Record<string, unknown>;
  const usageSource =
    (source.usage && typeof source.usage === "object" ? (source.usage as Record<string, unknown>) : null) ??
    (source.turn && typeof source.turn === "object"
      ? (((source.turn as Record<string, unknown>).usage as Record<string, unknown> | undefined) ?? null)
      : null) ??
    (source.result && typeof source.result === "object"
      ? (((source.result as Record<string, unknown>).usage as Record<string, unknown> | undefined) ?? null)
      : null);

  if (!usageSource) {
    return undefined;
  }

  const inputTokens = toTokenNumber(
    usageSource.input_tokens ??
      usageSource.inputTokens ??
      usageSource.prompt_tokens ??
      usageSource.promptTokens
  );
  const outputTokens = toTokenNumber(
    usageSource.output_tokens ??
      usageSource.outputTokens ??
      usageSource.completion_tokens ??
      usageSource.completionTokens
  );
  const totalTokens = toTokenNumber(usageSource.total_tokens ?? usageSource.totalTokens);
  const cacheReadTokens = pickLargestTokenNumber(
    usageSource.cache_read_input_tokens,
    usageSource.cacheReadTokens,
    usageSource.cached_tokens,
    readNestedTokenNumber(usageSource, "prompt_tokens_details", "cached_tokens"),
    readNestedTokenNumber(usageSource, "input_tokens_details", "cached_tokens")
  );
  const cacheWriteTokens = toTokenNumber(
    usageSource.cache_creation_input_tokens ?? usageSource.cacheWriteTokens
  );

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      totalTokens ??
      (inputTokens !== undefined || outputTokens !== undefined
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined),
    cacheReadTokens,
    cacheWriteTokens
  };
};

export const logProviderUsage = (
  streamId: string,
  providerType: AppSettings["providerType"],
  source: string,
  usage: ChatUsage,
  providerPayload: unknown,
  rawData: string
) => {
  console.info("[chat][provider:usage]", {
    streamId,
    providerType,
    source,
    usage,
    providerPayload,
    rawData
  });
};

export const logProviderUsageMissing = (
  streamId: string,
  providerType: AppSettings["providerType"],
  source: string,
  reason: string,
  providerPayload: unknown,
  rawData: string
) => {
  console.info("[chat][provider:usage-missing]", {
    streamId,
    providerType,
    source,
    reason,
    providerPayload,
    rawData
  });
};
