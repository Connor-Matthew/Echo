import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractAnthropicUsage,
  extractGenericUsage,
  extractOpenAiLikeDeltas,
  extractOpenAiUsage
} from "./stream-parser-utils";

describe("stream-parser-utils", () => {
  it("extracts text and reasoning deltas from OpenAI-like payloads", () => {
    const parsed = extractOpenAiLikeDeltas({
      content: [{ text: "Hello " }, { content: "World" }],
      reasoning_content: [{ text: "Think" }]
    });

    assert.deepEqual(parsed, {
      content: "Hello World",
      reasoning: "Think"
    });
  });

  it("extracts OpenAI usage with the largest cache-read token value", () => {
    const usage = extractOpenAiUsage({
      usage: {
        prompt_tokens: "12",
        completion_tokens: 8,
        total_tokens: 20,
        cached_tokens: 5,
        cache_read_input_tokens: 4,
        prompt_tokens_details: { cached_tokens: 3 }
      }
    });

    assert.deepEqual(usage, {
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      cacheReadTokens: 5,
      cacheWriteTokens: undefined
    });
  });

  it("fills anthropic total tokens when only input/output are present", () => {
    const usage = extractAnthropicUsage({
      usage: {
        input_tokens: 9,
        output_tokens: 2
      }
    });

    assert.deepEqual(usage, {
      inputTokens: 9,
      outputTokens: 2,
      totalTokens: 11,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined
    });
  });

  it("extracts generic usage from nested turn payload", () => {
    const usage = extractGenericUsage({
      turn: {
        usage: {
          inputTokens: 7,
          outputTokens: 5,
          cacheReadTokens: 2
        }
      }
    });

    assert.deepEqual(usage, {
      inputTokens: 7,
      outputTokens: 5,
      totalTokens: 12,
      cacheReadTokens: 2,
      cacheWriteTokens: undefined
    });
  });
});
