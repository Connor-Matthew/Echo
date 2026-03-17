import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { __test__ } from "./claude-agent-adapter";

describe("electron/agent/adapters/claude-agent-adapter", () => {
  it("preserves whitespace in streamed text deltas", () => {
    const state = __test__.createStreamParseState();
    const sdkMessage: SDKMessage = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "text_delta",
          text: " foo\n"
        }
      },
      parent_tool_use_id: null,
      session_id: "session-1",
      uuid: "00000000-0000-0000-0000-000000000001"
    };

    const events = __test__.convertSdkMessageToEvents(sdkMessage, state);

    assert.deepEqual(events, [{ type: "text_delta", text: " foo\n" }]);
  });

  it("extracts final result text from successful SDK result messages", () => {
    const sdkMessage: SDKMessage = {
      type: "result",
      subtype: "success",
      duration_ms: 10,
      duration_api_ms: 5,
      is_error: false,
      num_turns: 1,
      result: "final answer",
      total_cost_usd: 0,
      usage: {
        input_tokens: 1,
        output_tokens: 2,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        server_tool_use: {
          web_search_requests: 0
        }
      },
      modelUsage: {},
      permission_denials: [],
      uuid: "00000000-0000-0000-0000-000000000002",
      session_id: "session-1"
    };

    assert.equal(__test__.extractFinalResultText(sdkMessage), "final answer");
  });

  it("converts failed result messages into explicit error events", () => {
    const state = __test__.createStreamParseState();
    const sdkMessage: SDKMessage = {
      type: "result",
      subtype: "error_during_execution",
      duration_ms: 10,
      duration_api_ms: 5,
      is_error: true,
      num_turns: 1,
      total_cost_usd: 0,
      usage: {
        input_tokens: 1,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        server_tool_use: {
          web_search_requests: 0
        }
      },
      modelUsage: {},
      permission_denials: [],
      errors: ["Tool execution failed", "Permission denied"],
      uuid: "00000000-0000-0000-0000-000000000003",
      session_id: "session-1"
    };

    const events = __test__.convertSdkMessageToEvents(sdkMessage, state);

    assert.deepEqual(events, [
      {
        type: "usage_update",
        usage: {
          inputTokens: 1,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0
        }
      },
      {
        type: "error",
        message: "Tool execution failed\nPermission denied",
        code: "error_during_execution"
      }
    ]);
  });

  it("maps compacting system status messages to compact events", () => {
    const state = __test__.createStreamParseState();
    const sdkMessage: SDKMessage = {
      type: "system",
      subtype: "status",
      status: "compacting",
      uuid: "00000000-0000-0000-0000-000000000004",
      session_id: "session-1"
    };

    const events = __test__.convertSdkMessageToEvents(sdkMessage, state);

    assert.deepEqual(events, [{ type: "compacting" }]);
  });

  it("maps auth status errors to authentication error events", () => {
    const state = __test__.createStreamParseState();
    const sdkMessage: SDKMessage = {
      type: "auth_status",
      isAuthenticating: false,
      output: [],
      error: "API key rejected",
      uuid: "00000000-0000-0000-0000-000000000005",
      session_id: "session-1"
    };

    const events = __test__.convertSdkMessageToEvents(sdkMessage, state);

    assert.deepEqual(events, [
      {
        type: "error",
        message: "API key rejected",
        code: "authentication_failed"
      }
    ]);
  });
});
