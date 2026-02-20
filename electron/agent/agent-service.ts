import { buildAgentPrompt } from "./agent-prompt-builder";
import type {
  AgentMessage,
  AgentRunSettingsSnapshot,
  AgentSendMessageRequest,
  AgentStreamEvent,
  AgentUsage
} from "../../src/shared/agent-contracts";

type RunClaudeAgentInput = {
  request: AgentSendMessageRequest;
  history: AgentMessage[];
  signal: AbortSignal;
  cwd: string;
  resumeSessionId?: string;
  onEvent: (event: AgentStreamEvent) => void;
};

type RunClaudeAgentResult = {
  assistantText: string;
  sdkSessionId?: string;
  usage?: AgentUsage;
};

const toError = (error: unknown, fallback: string) =>
  error instanceof Error ? error : new Error(fallback);

const readString = (value: unknown) => (typeof value === "string" ? value : "");

const toJsonSnippet = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

const extractUsage = (message: Record<string, unknown>): AgentUsage | undefined => {
  const usage = message.usage;
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const source = usage as Record<string, unknown>;
  const toNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

  return {
    inputTokens: toNumber(source.input_tokens ?? source.inputTokens),
    outputTokens: toNumber(source.output_tokens ?? source.outputTokens),
    cacheReadTokens: toNumber(source.cache_read_input_tokens ?? source.cacheReadTokens),
    cacheWriteTokens: toNumber(source.cache_creation_input_tokens ?? source.cacheWriteTokens)
  };
};

const extractSdkSessionId = (message: Record<string, unknown>) => {
  const sessionId =
    readString(message.sessionId) ||
    readString(message.session_id) ||
    readString(message.conversationId) ||
    readString(message.threadId);
  if (sessionId) {
    return sessionId;
  }

  const thread = message.thread;
  if (thread && typeof thread === "object") {
    const id = readString((thread as Record<string, unknown>).id);
    if (id) {
      return id;
    }
  }

  return undefined;
};

const extractTextBlocks = (message: Record<string, unknown>): string[] => {
  const textBlocks: string[] = [];

  const direct =
    readString(message.text) ||
    readString(message.delta) ||
    readString(message.content) ||
    readString(message.message);
  if (direct) {
    textBlocks.push(direct);
  }

  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const typedBlock = block as Record<string, unknown>;
      const text =
        readString(typedBlock.text) ||
        readString(typedBlock.delta) ||
        readString(typedBlock.content);
      if (text) {
        textBlocks.push(text);
      }
    }
  }

  return textBlocks;
};

const convertSdkMessageToEvents = (sdkMessage: unknown): AgentStreamEvent[] => {
  if (!sdkMessage || typeof sdkMessage !== "object") {
    return [];
  }

  const message = sdkMessage as Record<string, unknown>;
  const type = readString(message.type).toLowerCase();
  const events: AgentStreamEvent[] = [];

  if (type.includes("error")) {
    const errorValue = message.error;
    const errorMessage =
      (errorValue && typeof errorValue === "object"
        ? readString((errorValue as Record<string, unknown>).message)
        : "") || readString(message.message);
    if (errorMessage) {
      events.push({ type: "error", message: errorMessage, code: readString(message.code) || undefined });
      return events;
    }
  }

  const hasDeltaSignal = type.includes("delta") || type === "text_delta";
  const hasTextCompleteSignal =
    type === "text_complete" || type.includes("message") || type.includes("assistant") || type.includes("final");

  const textBlocks = extractTextBlocks(message);
  if (textBlocks.length) {
    for (const text of textBlocks) {
      events.push(
        hasDeltaSignal
          ? { type: "text_delta", text }
          : { type: "text_complete", text, isIntermediate: !hasTextCompleteSignal }
      );
    }
  }

  const toolName = readString(message.toolName) || readString(message.name);
  const toolId = readString(message.toolId) || readString(message.id) || readString(message.tool_call_id);
  if (type.includes("tool") && (type.includes("start") || type.includes("use")) && (toolName || toolId)) {
    events.push({
      type: "tool_start",
      toolId: toolId || toolName,
      toolName: toolName || "tool",
      input: toJsonSnippet(message.input ?? message.arguments)
    });
  }

  if (type.includes("tool") && (type.includes("result") || type.includes("output")) && (toolName || toolId)) {
    events.push({
      type: "tool_result",
      toolId: toolId || toolName,
      toolName: toolName || "tool",
      output: readString(message.output) || toJsonSnippet(message.result),
      isError: Boolean(message.isError)
    });
  }

  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (!block || typeof block !== "object") {
        continue;
      }
      const item = block as Record<string, unknown>;
      const blockType = readString(item.type).toLowerCase();
      if (!blockType) {
        continue;
      }

      if (blockType === "tool_use") {
        const nextToolName = readString(item.name) || "tool";
        const nextToolId = readString(item.id) || nextToolName;
        events.push({
          type: "tool_start",
          toolId: nextToolId,
          toolName: nextToolName,
          input: toJsonSnippet(item.input)
        });
      }

      if (blockType === "tool_result") {
        const nextToolId = readString(item.tool_use_id) || readString(item.id) || "tool";
        events.push({
          type: "tool_result",
          toolId: nextToolId,
          toolName: readString(item.name) || "tool",
          output: readString(item.content) || toJsonSnippet(item.content),
          isError: Boolean(item.is_error)
        });
      }
    }
  }

  const progressText =
    readString(message.progress) ||
    readString(message.status) ||
    readString(message.state) ||
    readString(message.stage);
  if (progressText && (type.includes("progress") || type.includes("status"))) {
    events.push({ type: "task_progress", message: progressText });
  }

  return events;
};

const buildSdkOptions = (
  settings: AgentRunSettingsSnapshot,
  cwd: string,
  signal: AbortSignal,
  resumeSessionId?: string
) => {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ANTHROPIC_API_KEY: settings.apiKey.trim()
  };

  if (settings.baseUrl.trim()) {
    env.ANTHROPIC_BASE_URL = settings.baseUrl.trim();
  }

  const options: Record<string, unknown> = {
    model: settings.model.trim(),
    cwd,
    maxTurns: 30,
    permissionMode: "default",
    env,
    signal
  };

  if (resumeSessionId) {
    options.resume = resumeSessionId;
  }

  return options;
};

export const runClaudeAgentQuery = async ({
  request,
  history,
  signal,
  cwd,
  resumeSessionId,
  onEvent
}: RunClaudeAgentInput): Promise<RunClaudeAgentResult> => {
  if (request.settings.providerType !== "claude-agent") {
    throw new Error("Agent provider type mismatch.");
  }

  const input = request.input.trim();
  if (!input) {
    throw new Error("Message content is empty.");
  }

  if (!request.settings.apiKey.trim()) {
    throw new Error("Missing API key for Claude Agent provider.");
  }

  const prompt = buildAgentPrompt({
    settings: request.settings,
    input,
    history,
    cwd
  });

  const sdkModule = (await import("@anthropic-ai/claude-agent-sdk")) as {
    query?: (payload: Record<string, unknown>) => AsyncIterable<unknown>;
  };

  if (typeof sdkModule.query !== "function") {
    throw new Error("Claude Agent SDK is available but query() was not found.");
  }

  const iterator = sdkModule.query({
    prompt,
    options: buildSdkOptions(request.settings, cwd, signal, resumeSessionId)
  });

  if (!iterator || typeof iterator[Symbol.asyncIterator] !== "function") {
    throw new Error("Claude Agent SDK query() did not return an async iterator.");
  }

  let assistantText = "";
  let usage: AgentUsage | undefined;
  let sdkSessionId: string | undefined;

  try {
    for await (const sdkMessage of iterator) {
      if (signal.aborted) {
        throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      }

      if (!sdkMessage || typeof sdkMessage !== "object") {
        continue;
      }

      const typedMessage = sdkMessage as Record<string, unknown>;
      usage = extractUsage(typedMessage) ?? usage;
      sdkSessionId = extractSdkSessionId(typedMessage) ?? sdkSessionId;

      const events = convertSdkMessageToEvents(sdkMessage);
      for (const event of events) {
        if (event.type === "text_delta") {
          assistantText = `${assistantText}${event.text}`;
        }
        if (event.type === "text_complete" && event.text && !assistantText.endsWith(event.text)) {
          assistantText = `${assistantText}${event.text}`;
        }

        onEvent(event);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw toError(error, "Claude Agent SDK stream failed.");
  }

  return {
    assistantText: assistantText.trim(),
    usage,
    sdkSessionId
  };
};
