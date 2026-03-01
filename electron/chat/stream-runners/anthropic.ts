import type { IpcMainInvokeEvent } from "electron";
import { resolveAnthropicEndpoint } from "../../../src/domain/provider/utils";
import type {
  AppSettings,
  ChatStreamEvent,
  ChatStreamRequest,
  CompletionMessage
} from "../../../src/shared/contracts";
import {
  extractAnthropicUsage,
  logProviderUsage,
  logProviderUsageMissing
} from "../stream-parser-utils";

type StreamSender = IpcMainInvokeEvent["sender"];

type RunnerDeps = {
  mcpManager: {
    getAllTools: () => Array<{
      serverName: string;
      name: string;
      description?: string;
      inputSchema?: unknown;
    }>;
    callTool: (serverName: string, toolName: string, input: unknown) => Promise<unknown>;
  };
  sendStreamEvent: (sender: StreamSender, streamId: string, event: ChatStreamEvent) => void;
  logChatRequestPayload: (
    streamId: string,
    providerType: AppSettings["providerType"],
    source: string,
    requestPayload: unknown
  ) => void;
  toAnthropicTools: (
    tools: Array<{ serverName: string; name: string; description?: string; inputSchema?: unknown }>
  ) => Array<unknown>;
  resolveEnabledMcpServerNames: (payload: ChatStreamRequest) => Set<string>;
  parseMcpToolName: (name: string) => { serverName: string; toolName: string } | null;
  toAnthropicContentBlocks: (
    message: CompletionMessage
  ) => Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  >;
};

export const createStreamAnthropic = (deps: RunnerDeps) => {
  return async (
    sender: StreamSender,
    streamId: string,
    payload: ChatStreamRequest,
    apiKey: string,
    signal: AbortSignal,
    onDelta?: () => void
  ) => {
    const endpoint = resolveAnthropicEndpoint(payload.settings.baseUrl, "messages");
    const systemPrompt = payload.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content.trim())
      .filter(Boolean)
      .join("\n\n");

    const enabledMcpServerNames = deps.resolveEnabledMcpServerNames(payload);
    const mcpTools = deps
      .mcpManager
      .getAllTools()
      .filter((tool) => enabledMcpServerNames.has(tool.serverName));
    const anthropicTools = mcpTools.length ? deps.toAnthropicTools(mcpTools) : undefined;

    type AnthropicBlock = { type: string; [key: string]: unknown };
    type AnthropicMessage = { role: "user" | "assistant"; content: AnthropicBlock[] | string };
    const messages: AnthropicMessage[] = payload.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: deps.toAnthropicContentBlocks(m) }))
      .filter((m) => (Array.isArray(m.content) ? m.content.length > 0 : Boolean(m.content)));

    let doneSent = false;
    let sawUsage = false;
    let usageMissingLogged = false;

    const emitDone = () => {
      if (!doneSent) {
        doneSent = true;
        deps.sendStreamEvent(sender, streamId, { type: "done" });
      }
    };
    const reportUsageMissing = (reason: string, providerPayload: unknown, rawData: string) => {
      if (sawUsage || usageMissingLogged) return;
      usageMissingLogged = true;
      logProviderUsageMissing(
        streamId,
        payload.settings.providerType,
        "anthropic-sse",
        reason,
        providerPayload,
        rawData
      );
    };

    for (;;) {
      if (signal.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });

      const requestBody: Record<string, unknown> = {
        model: payload.settings.model.trim(),
        stream: true,
        max_tokens: payload.settings.maxTokens,
        temperature: payload.settings.temperature,
        system: systemPrompt || undefined,
        messages
      };
      if (anthropicTools) requestBody.tools = anthropicTools;

      deps.logChatRequestPayload(streamId, payload.settings.providerType, "anthropic-sse", requestBody);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify(requestBody),
        signal
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Provider returned HTTP ${response.status}${body ? `: ${body}` : ""}`);
      }
      if (!response.body) throw new Error("Provider response has no stream body.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastProviderPayload: unknown = null;
      let lastRawData = "";
      let stopReason: string | null = null;

      type ToolUseAccum = { id: string; name: string; inputJson: string };
      const toolUseAccum = new Map<string, ToolUseAccum>();
      let currentBlockType: string | null = null;
      let currentBlockId: string | null = null;
      let assistantTextContent = "";

      streamLoop: while (true) {
        const { value, done } = await reader.read();
        if (done) {
          reportUsageMissing("stream-closed", lastProviderPayload, lastRawData);
          break streamLoop;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") {
            reportUsageMissing("done-marker", lastProviderPayload, data || "[EMPTY]");
            break streamLoop;
          }

          try {
            const parsed = JSON.parse(data) as {
              type?: string;
              index?: number;
              content_block?: { type?: string; id?: string; name?: string };
              delta?: {
                type?: string;
                text?: string;
                thinking?: string;
                partial_json?: string;
                stop_reason?: string;
                usage?: Record<string, unknown>;
              };
              usage?: Record<string, unknown>;
              message?: { usage?: Record<string, unknown>; stop_reason?: string };
              error?: { message?: string };
            };
            lastProviderPayload = parsed;
            lastRawData = data;

            if (parsed.type === "error") {
              deps.sendStreamEvent(sender, streamId, {
                type: "error",
                message: parsed.error?.message || "Streaming failed."
              });
              emitDone();
              return;
            }

            const usage = extractAnthropicUsage(parsed);
            if (usage) {
              sawUsage = true;
              logProviderUsage(streamId, payload.settings.providerType, "anthropic-sse", usage, parsed, data);
              deps.sendStreamEvent(sender, streamId, { type: "usage", usage });
            }

            if (parsed.type === "content_block_start") {
              currentBlockType = parsed.content_block?.type ?? null;
              currentBlockId = parsed.content_block?.id ?? null;
              if (currentBlockType === "tool_use" && currentBlockId) {
                toolUseAccum.set(currentBlockId, {
                  id: currentBlockId,
                  name: parsed.content_block?.name ?? "",
                  inputJson: ""
                });
              }
              continue;
            }

            if (parsed.type === "content_block_delta") {
              const deltaType = parsed.delta?.type;
              if (deltaType === "text_delta" && parsed.delta?.text) {
                assistantTextContent += parsed.delta.text;
                onDelta?.();
                deps.sendStreamEvent(sender, streamId, { type: "delta", delta: parsed.delta.text });
              } else if (deltaType === "thinking_delta" && parsed.delta?.thinking) {
                onDelta?.();
                deps.sendStreamEvent(sender, streamId, { type: "reasoning", delta: parsed.delta.thinking });
              } else if (deltaType === "input_json_delta" && currentBlockId && parsed.delta?.partial_json) {
                const accum = toolUseAccum.get(currentBlockId);
                if (accum) accum.inputJson += parsed.delta.partial_json;
              }
              continue;
            }

            if (parsed.type === "message_delta") {
              if (parsed.delta?.stop_reason) stopReason = parsed.delta.stop_reason;
              continue;
            }

            if (parsed.type === "message_stop") {
              reportUsageMissing("message-stop-without-usage", parsed, data);
              break streamLoop;
            }

            if (parsed.type === "message_start" && parsed.message?.stop_reason) {
              stopReason = parsed.message.stop_reason;
            }
          } catch {
            continue;
          }
        }
      }

      if (toolUseAccum.size === 0 || stopReason !== "tool_use") {
        emitDone();
        return;
      }

      const assistantBlocks: AnthropicBlock[] = [];
      if (assistantTextContent) assistantBlocks.push({ type: "text", text: assistantTextContent });
      for (const tc of toolUseAccum.values()) {
        let input: unknown = {};
        try {
          input = JSON.parse(tc.inputJson || "{}");
        } catch {
          // keep empty
        }
        assistantBlocks.push({ type: "tool_use", id: tc.id, name: tc.name, input });
      }
      messages.push({ role: "assistant", content: assistantBlocks });

      const toolResultBlocks: AnthropicBlock[] = [];
      for (const tc of toolUseAccum.values()) {
        const parsed = deps.parseMcpToolName(tc.name);
        if (!parsed) {
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: tc.id,
            content: `Unknown tool: ${tc.name}`
          });
          continue;
        }
        if (!enabledMcpServerNames.has(parsed.serverName)) {
          const disabledMsg = `Tool is disabled for this chat: ${parsed.serverName}__${parsed.toolName}`;
          deps.sendStreamEvent(sender, streamId, {
            type: "status",
            source: "mcp",
            toolCall: {
              id: tc.id,
              serverName: parsed.serverName,
              toolName: parsed.toolName,
              status: "error",
              message: disabledMsg
            }
          });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: tc.id,
            is_error: true,
            content: disabledMsg
          });
          continue;
        }

        deps.sendStreamEvent(sender, streamId, {
          type: "status",
          source: "mcp",
          toolCall: {
            id: tc.id,
            serverName: parsed.serverName,
            toolName: parsed.toolName,
            status: "pending",
            message: ""
          }
        });

        let toolInput: unknown = {};
        try {
          toolInput = JSON.parse(tc.inputJson || "{}");
        } catch {
          // keep empty
        }

        try {
          const result = await deps.mcpManager.callTool(parsed.serverName, parsed.toolName, toolInput);
          const resultText = typeof result === "string" ? result : JSON.stringify(result);
          deps.sendStreamEvent(sender, streamId, {
            type: "status",
            source: "mcp",
            toolCall: {
              id: tc.id,
              serverName: parsed.serverName,
              toolName: parsed.toolName,
              status: "success",
              message: ""
            }
          });
          toolResultBlocks.push({ type: "tool_result", tool_use_id: tc.id, content: resultText });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Tool call failed.";
          deps.sendStreamEvent(sender, streamId, {
            type: "status",
            source: "mcp",
            toolCall: {
              id: tc.id,
              serverName: parsed.serverName,
              toolName: parsed.toolName,
              status: "error",
              message: errMsg
            }
          });
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: tc.id,
            is_error: true,
            content: errMsg
          });
        }
      }

      messages.push({ role: "user", content: toolResultBlocks });
    }
  };
};
