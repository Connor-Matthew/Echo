import type { IpcMainInvokeEvent } from "electron";
import { normalizeBaseUrl } from "../../../src/domain/provider/utils";
import type { AppSettings, ChatStreamEvent, ChatStreamRequest } from "../../../src/shared/contracts";
import {
  extractOpenAiLikeDeltas,
  extractOpenAiUsage,
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
  toOpenAiTools: (
    tools: Array<{ serverName: string; name: string; description?: string; inputSchema?: unknown }>
  ) => Array<unknown>;
  resolveEnabledMcpServerNames: (payload: ChatStreamRequest) => Set<string>;
  parseMcpToolName: (name: string) => { serverName: string; toolName: string } | null;
  toOpenAiStreamMessages: (messages: ChatStreamRequest["messages"]) => Array<{
    role: string;
    content: unknown;
  }>;
};

export const createStreamOpenAICompatible = (deps: RunnerDeps) => {
  return async (
    sender: StreamSender,
    streamId: string,
    payload: ChatStreamRequest,
    apiKey: string,
    signal: AbortSignal,
    onDelta?: () => void
  ) => {
    const baseUrl = normalizeBaseUrl(payload.settings.baseUrl);
    const enabledMcpServerNames = deps.resolveEnabledMcpServerNames(payload);
    const mcpTools = deps
      .mcpManager
      .getAllTools()
      .filter((tool) => enabledMcpServerNames.has(tool.serverName));
    const openAiTools = mcpTools.length ? deps.toOpenAiTools(mcpTools) : undefined;

    type OaiMessage = {
      role: string;
      content: unknown;
      tool_calls?: unknown;
      tool_call_id?: string;
      name?: string;
    };
    const messages: OaiMessage[] = deps.toOpenAiStreamMessages(payload.messages);

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
        "openai-sse",
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
        stream_options: { include_usage: true },
        messages
      };
      if (openAiTools) requestBody.tools = openAiTools;

      deps.logChatRequestPayload(streamId, payload.settings.providerType, "openai-sse", requestBody);

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
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
      let finishReason: string | null = null;

      type ToolCallAccum = { id: string; name: string; arguments: string };
      const toolCallAccum = new Map<number, ToolCallAccum>();
      let assistantContent = "";

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
          if (data === "[DONE]") {
            reportUsageMissing("done-marker", lastProviderPayload, data);
            break streamLoop;
          }

          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{
                delta?: {
                  content?: unknown;
                  reasoning_content?: unknown;
                  reasoning?: unknown;
                  tool_calls?: Array<{
                    index?: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
                finish_reason?: string | null;
              }>;
              error?: { message?: string };
              usage?: Record<string, unknown>;
            };
            lastProviderPayload = parsed;
            lastRawData = data;

            if (parsed.error?.message) {
              deps.sendStreamEvent(sender, streamId, { type: "error", message: parsed.error.message });
              emitDone();
              return;
            }

            const usage = extractOpenAiUsage(parsed);
            if (usage) {
              sawUsage = true;
              logProviderUsage(streamId, payload.settings.providerType, "openai-sse", usage, parsed, data);
              deps.sendStreamEvent(sender, streamId, { type: "usage", usage });
            }

            const choice = parsed.choices?.[0];
            if (!choice) continue;

            if (choice.finish_reason) finishReason = choice.finish_reason;

            const delta = choice.delta;
            if (!delta) continue;

            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallAccum.has(idx)) {
                  toolCallAccum.set(idx, { id: tc.id ?? "", name: tc.function?.name ?? "", arguments: "" });
                }
                const accum = toolCallAccum.get(idx)!;
                if (tc.id) accum.id = tc.id;
                if (tc.function?.name) accum.name += tc.function.name;
                if (tc.function?.arguments) accum.arguments += tc.function.arguments;
              }
            }

            const { content, reasoning } = extractOpenAiLikeDeltas(delta);
            if (content) {
              assistantContent += content;
              onDelta?.();
              deps.sendStreamEvent(sender, streamId, { type: "delta", delta: content });
            }
            if (reasoning) {
              onDelta?.();
              deps.sendStreamEvent(sender, streamId, { type: "reasoning", delta: reasoning });
            }
          } catch {
            continue;
          }
        }
      }

      if (toolCallAccum.size === 0 || finishReason !== "tool_calls") {
        emitDone();
        return;
      }

      const toolCallsForMsg = Array.from(toolCallAccum.entries())
        .sort(([a], [b]) => a - b)
        .map(([, tc]) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: tc.arguments }
        }));

      messages.push({
        role: "assistant",
        content: assistantContent || null,
        tool_calls: toolCallsForMsg
      });

      for (const tc of toolCallsForMsg) {
        const parsed = deps.parseMcpToolName(tc.function.name);
        if (!parsed) {
          messages.push({ role: "tool", tool_call_id: tc.id, content: `Unknown tool: ${tc.function.name}` });
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
          messages.push({ role: "tool", tool_call_id: tc.id, content: `Error: ${disabledMsg}` });
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
          toolInput = JSON.parse(tc.function.arguments || "{}");
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
          messages.push({ role: "tool", tool_call_id: tc.id, content: resultText });
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
          messages.push({ role: "tool", tool_call_id: tc.id, content: `Error: ${errMsg}` });
        }
      }
    }
  };
};
