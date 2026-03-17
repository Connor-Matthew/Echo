import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type {
  Options,
  PermissionUpdate,
  Query,
  SDKAssistantMessage,
  SDKAuthStatusMessage,
  SDKHookResponseMessage,
  SDKMessage,
  SDKResultMessage,
  SDKStatusMessage,
  SDKToolProgressMessage
} from "@anthropic-ai/claude-agent-sdk";
import { buildAgentPrompt } from "../agent-prompt-builder";
import type {
  AgentMessage,
  AgentRunSettingsSnapshot,
  AgentSendMessageRequest,
  AgentStreamEvent,
  AgentUsage
} from "../../../src/shared/agent-contracts";
import { normalizeAnthropicBaseUrlForSdk } from "../../../src/shared/agent-contracts";

type RunClaudeAgentInput = {
  request: AgentSendMessageRequest;
  history: AgentMessage[];
  signal: AbortSignal;
  cwd: string;
  resumeSessionId?: string;
  onEvent: (event: AgentStreamEvent) => void;
  onPermissionRequest?: (payload: {
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
    reason?: string;
    blockedPath?: string;
    suggestions?: unknown[];
    signal: AbortSignal;
  }) => Promise<{
    decision: "approved" | "denied";
    message?: string;
    updatedInput?: Record<string, unknown>;
    updatedPermissions?: unknown[];
  }>;
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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

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

const extractContentBlocks = (message: Record<string, unknown>) => {
  if (Array.isArray(message.content)) {
    return message.content;
  }
  const nestedMessage = asRecord(message.message);
  if (nestedMessage && Array.isArray(nestedMessage.content)) {
    return nestedMessage.content;
  }
  return [];
};

const pushTextEvent = (
  events: AgentStreamEvent[],
  text: string,
  mode: "delta" | "complete",
  isIntermediate = false
) => {
  if (!text.length) {
    return;
  }
  events.push(
    mode === "delta"
      ? { type: "text_delta", text }
      : { type: "text_complete", text, isIntermediate }
  );
};

const appendContentBlockEvents = (
  blocks: unknown[],
  events: AgentStreamEvent[],
  mode: "delta" | "complete"
) => {
  for (const block of blocks) {
    const item = asRecord(block);
    if (!item) {
      continue;
    }
    const blockType = readString(item.type).toLowerCase();
    if (!blockType) {
      continue;
    }

    if (blockType === "text") {
      pushTextEvent(events, readString(item.text) || readString(item.content), mode, true);
      continue;
    }

    if (blockType === "tool_use") {
      const toolName = readString(item.name) || "tool";
      const toolId = readString(item.id) || toolName;
      events.push({
        type: "tool_start",
        toolId,
        toolName,
        input: toJsonSnippet(item.input)
      });
      continue;
    }

    if (blockType === "tool_result") {
      const toolId = readString(item.tool_use_id) || readString(item.id) || "tool";
      events.push({
        type: "tool_result",
        toolId,
        toolName: readString(item.name) || "tool",
        output: readString(item.content) || toJsonSnippet(item.content),
        isError: Boolean(item.is_error)
      });
    }
  }
};

type StreamToolBlock = {
  toolId: string;
  toolName: string;
  inputJson: string;
};

type StreamParseState = {
  toolBlocksByIndex: Map<number, StreamToolBlock>;
};

const createStreamParseState = (): StreamParseState => ({
  toolBlocksByIndex: new Map<number, StreamToolBlock>()
});

const readIndex = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return null;
};

const appendRawStreamEvent = (
  streamEvent: Record<string, unknown>,
  events: AgentStreamEvent[],
  state: StreamParseState
) => {
  const streamType = readString(streamEvent.type).toLowerCase();
  if (!streamType) {
    return;
  }

  if (streamType === "content_block_delta") {
    const index = readIndex(streamEvent.index);
    const delta = asRecord(streamEvent.delta);
    const deltaType = readString(delta?.type).toLowerCase();
    if (deltaType === "text_delta") {
      pushTextEvent(events, readString(delta?.text), "delta");
      return;
    }
    if (deltaType === "input_json_delta" && index !== null) {
      const activeToolBlock = state.toolBlocksByIndex.get(index);
      if (!activeToolBlock) {
        return;
      }
      const partial =
        readString(delta?.partial_json) || readString(delta?.partialJson) || readString(delta?.text);
      if (!partial) {
        return;
      }
      activeToolBlock.inputJson = `${activeToolBlock.inputJson}${partial}`;
      state.toolBlocksByIndex.set(index, activeToolBlock);
      events.push({
        type: "tool_start",
        toolId: activeToolBlock.toolId,
        toolName: activeToolBlock.toolName,
        input: activeToolBlock.inputJson
      });
    }
    return;
  }

  if (streamType === "content_block_start") {
    const index = readIndex(streamEvent.index);
    const contentBlock = asRecord(streamEvent.content_block);
    if (!contentBlock) {
      return;
    }
    const blockType = readString(contentBlock.type).toLowerCase();
    if (blockType === "tool_use") {
      const toolName = readString(contentBlock.name) || "tool";
      const toolId = readString(contentBlock.id) || toolName;
      const rawInput = toJsonSnippet(contentBlock.input);
      const initialInput = rawInput && rawInput !== "{}" ? rawInput : "";

      if (index !== null) {
        state.toolBlocksByIndex.set(index, {
          toolId,
          toolName,
          inputJson: initialInput
        });
      }

      events.push({
        type: "tool_start",
        toolId,
        toolName,
        input: initialInput || undefined
      });
      return;
    }
    appendContentBlockEvents([contentBlock], events, "complete");
    return;
  }

  if (streamType === "content_block_stop") {
    const index = readIndex(streamEvent.index);
    if (index !== null) {
      const activeToolBlock = state.toolBlocksByIndex.get(index);
      if (activeToolBlock?.inputJson.trim()) {
        events.push({
          type: "tool_start",
          toolId: activeToolBlock.toolId,
          toolName: activeToolBlock.toolName,
          input: activeToolBlock.inputJson
        });
      }
      state.toolBlocksByIndex.delete(index);
    }
    return;
  }

  if (streamType === "message_stop") {
    state.toolBlocksByIndex.clear();
    return;
  }

  if (streamType === "message_delta" || streamType === "message_start") {
    const usage =
      extractUsage(streamEvent) ||
      (() => {
        const nestedMessage = asRecord(streamEvent.message);
        return nestedMessage ? extractUsage(nestedMessage) : undefined;
      })();
    if (usage) {
      events.push({ type: "usage_update", usage });
    }
  }
};

const getSdkResultErrorMessage = (message: SDKResultMessage) => {
  if (message.subtype === "success") {
    return "";
  }

  const details = Array.isArray(message.errors)
    ? message.errors.map((item) => item.trim()).filter(Boolean)
    : [];
  if (details.length) {
    return details.join("\n");
  }

  return `Claude Agent SDK ended with ${message.subtype}.`;
};

const appendStatusEvents = (message: SDKStatusMessage, events: AgentStreamEvent[]) => {
  if (message.subtype !== "status") {
    return;
  }

  if (message.status === "compacting") {
    events.push({ type: "compacting" });
  } else {
    events.push({ type: "compact_complete" });
  }
};

const appendHookResponseEvents = (message: SDKHookResponseMessage, events: AgentStreamEvent[]) => {
  const stdout = message.stdout.trim();
  const stderr = message.stderr.trim();
  const parts = [stdout, stderr].filter(Boolean);
  if (!parts.length) {
    return;
  }

  events.push({
    type: "task_progress",
    message: `${message.hook_name}: ${parts.join(" | ")}`
  });
};

const appendAuthStatusEvents = (message: SDKAuthStatusMessage, events: AgentStreamEvent[]) => {
  if (message.error?.trim()) {
    events.push({
      type: "error",
      message: message.error.trim(),
      code: "authentication_failed"
    });
    return;
  }

  const parts = message.output.map((item) => item.trim()).filter(Boolean);
  if (parts.length) {
    events.push({
      type: "task_progress",
      message: parts.join(" ")
    });
  }
};

const appendAssistantMessageEvents = (message: SDKAssistantMessage, events: AgentStreamEvent[]) => {
  appendContentBlockEvents(extractContentBlocks(message), events, "complete");

  if (message.error) {
    events.push({
      type: "error",
      message: `Assistant message reported ${message.error}.`,
      code: message.error
    });
  }
};

const convertSdkMessageToEvents = (sdkMessage: SDKMessage, state: StreamParseState): AgentStreamEvent[] => {
  const message = sdkMessage as Record<string, unknown>;
  const events: AgentStreamEvent[] = [];

  if (sdkMessage.type === "stream_event") {
    const streamEvent = asRecord(message.event);
    if (streamEvent) {
      appendRawStreamEvent(streamEvent, events, state);
    }
    return events;
  }

  const usage = extractUsage(message);
  if (usage) {
    events.push({ type: "usage_update", usage });
  }

  if (sdkMessage.type === "result") {
    const errorMessage = getSdkResultErrorMessage(sdkMessage);
    if (errorMessage) {
      events.push({
        type: "error",
        message: errorMessage,
        code: sdkMessage.subtype
      });
    }
    return events;
  }

  if (sdkMessage.type === "tool_progress") {
    const toolProgress = sdkMessage as SDKToolProgressMessage;
    events.push({
      type: "task_progress",
      message: `${toolProgress.tool_name} (${Math.max(0, toolProgress.elapsed_time_seconds).toFixed(1)}s)`
    });
    return events;
  }

  if (sdkMessage.type === "assistant") {
    appendAssistantMessageEvents(sdkMessage, events);
    return events;
  }

  if (sdkMessage.type === "system" && sdkMessage.subtype === "status") {
    appendStatusEvents(sdkMessage, events);
    return events;
  }

  if (sdkMessage.type === "system" && sdkMessage.subtype === "hook_response") {
    appendHookResponseEvents(sdkMessage, events);
    return events;
  }

  if (sdkMessage.type === "auth_status") {
    appendAuthStatusEvents(sdkMessage as SDKAuthStatusMessage, events);
    return events;
  }

  const type = readString(message.type).toLowerCase();
  const toolName = readString(message.toolName) || readString(message.name);
  const toolId = readString(message.toolId) || readString(message.id) || readString(message.tool_call_id);
  const isToolStartSignal = type.includes("tool") && (type.includes("start") || type.includes("use"));
  const isToolResultSignal = type.includes("tool") && (type.includes("result") || type.includes("output"));
  if (isToolStartSignal && (toolName || toolId)) {
    events.push({
      type: "tool_start",
      toolId: toolId || toolName,
      toolName: toolName || "tool",
      input: toJsonSnippet(message.input ?? message.arguments)
    });
  }

  if (isToolResultSignal && (toolName || toolId)) {
    events.push({
      type: "tool_result",
      toolId: toolId || toolName,
      toolName: toolName || "tool",
      output: readString(message.output) || toJsonSnippet(message.result),
      isError: Boolean(message.isError)
    });
  }

  appendContentBlockEvents(extractContentBlocks(message), events, type.includes("delta") ? "delta" : "complete");

  if (!isToolStartSignal && !isToolResultSignal) {
    const inlineTextCandidates = [readString(message.text), readString(message.delta), readString(message.message)]
      .filter((value) => value.length > 0);
    for (const candidate of inlineTextCandidates) {
      pushTextEvent(events, candidate, type.includes("delta") ? "delta" : "complete", true);
    }
  }

  const requestId = readString(message.requestId) || readString(message.permissionRequestId) || readString(message.id);

  if (type.includes("ask") && type.includes("user")) {
    const question = readString(message.question) || readString(message.prompt) || readString(message.message);
    if (question) {
      events.push({
        type: "ask_user_request",
        requestId: requestId || crypto.randomUUID(),
        question
      });
    }
  }

  if (type.includes("compact")) {
    if (type.includes("complete") || type.includes("done")) {
      events.push({ type: "compact_complete", message: readString(message.message) || undefined });
    } else {
      events.push({ type: "compacting", message: readString(message.message) || undefined });
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

const extractFinalResultText = (sdkMessage: SDKMessage) => {
  if (sdkMessage.type !== "result" || sdkMessage.subtype !== "success") {
    return undefined;
  }

  const result = sdkMessage.result;
  return typeof result === "string" && result.length ? result : undefined;
};

type EchoSdkOptions = Omit<Options, "executable"> & {
  executable?: string;
  stderr?: (chunk: string) => void;
};

type ClaudeAgentSdkModule = typeof import("@anthropic-ai/claude-agent-sdk");

// Cache expensive resolution results so they are only computed once per process.
let _cachedNodeExecutable: string | null | undefined = undefined;
let _cachedPackagedCli: { path: string; requiresElectronRuntime: boolean } | null | undefined = undefined;
let _cachedSdkModule: ClaudeAgentSdkModule | undefined;

const resolveNodeExecutable = () => {
  if (_cachedNodeExecutable !== undefined) {
    return _cachedNodeExecutable;
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const candidates: string[] = [];

  if (process.env.ECHO_NODE_PATH?.trim()) {
    candidates.push(process.env.ECHO_NODE_PATH.trim());
  }
  if (process.env.NVM_BIN?.trim()) {
    candidates.push(path.join(process.env.NVM_BIN.trim(), "node"));
  }
  if (homeDir) {
    const defaultAliasPath = path.join(homeDir, ".nvm", "alias", "default");
    const versionsRoot = path.join(homeDir, ".nvm", "versions", "node");
    if (existsSync(defaultAliasPath)) {
      try {
        const defaultAlias = readFileSync(defaultAliasPath, "utf-8").trim();
        if (defaultAlias) {
          candidates.push(path.join(versionsRoot, defaultAlias, "bin", "node"));
        }
      } catch {
        // Ignore alias read errors and continue with static candidates.
      }
    }
    if (existsSync(versionsRoot)) {
      try {
        const versions = readdirSync(versionsRoot).sort((a, b) =>
          b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" })
        );
        for (const version of versions) {
          candidates.push(path.join(versionsRoot, version, "bin", "node"));
        }
      } catch {
        // Ignore directory read errors.
      }
    }
  }

  candidates.push("/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node");
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      _cachedNodeExecutable = candidate;
      return candidate;
    }
  }
  _cachedNodeExecutable = null;
  return null;
};

const resolvePackagedClaudeCliPath = (): { path: string; requiresElectronRuntime: boolean } | null => {
  if (_cachedPackagedCli !== undefined) {
    return _cachedPackagedCli;
  }

  const resourcesPath = process.resourcesPath?.trim();
  if (!resourcesPath) {
    _cachedPackagedCli = null;
    return null;
  }

  const unpackedCli = path.join(
    resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    "@anthropic-ai",
    "claude-agent-sdk",
    "cli.js"
  );
  if (existsSync(unpackedCli)) {
    _cachedPackagedCli = { path: unpackedCli, requiresElectronRuntime: false };
    return _cachedPackagedCli;
  }

  // Node cannot execute files inside app.asar directly. If unpacked CLI is missing,
  // force Electron runtime so asar-aware module loading still works.
  const asarCli = path.join(
    resourcesPath,
    "app.asar",
    "node_modules",
    "@anthropic-ai",
    "claude-agent-sdk",
    "cli.js"
  );
  _cachedPackagedCli = { path: asarCli, requiresElectronRuntime: true };
  return _cachedPackagedCli;
};

const buildSdkOptions = (
  settings: AgentRunSettingsSnapshot,
  cwd: string,
  signal: AbortSignal,
  resumeSessionId?: string,
  onPermissionRequest?: RunClaudeAgentInput["onPermissionRequest"],
  onStderr?: (chunk: string) => void
): EchoSdkOptions => {
  const abortController = new AbortController();
  if (signal.aborted) {
    abortController.abort();
  } else {
    signal.addEventListener("abort", () => abortController.abort(), { once: true });
  }

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ANTHROPIC_API_KEY: settings.apiKey.trim(),
    ANTHROPIC_BASE_URL: normalizeAnthropicBaseUrlForSdk(settings.baseUrl)
  };
  const isPackagedElectron = Boolean(process.versions?.electron) && !process.defaultApp;
  const packagedCli = isPackagedElectron ? resolvePackagedClaudeCliPath() : null;
  const systemNodePath = resolveNodeExecutable();
  const electronExecPath = process.execPath?.trim();
  const useElectronAsNodeRuntime =
    Boolean(process.versions?.electron) &&
    Boolean(electronExecPath) &&
    (packagedCli?.requiresElectronRuntime || !systemNodePath);
  if (useElectronAsNodeRuntime && electronExecPath) {
    // Claude Agent SDK defaults to spawning "node". Packaged GUI apps often don't
    // have node in PATH or use app.asar for CLI entry. Force Electron to behave as
    // Node for the SDK subprocess in those cases.
    env.ELECTRON_RUN_AS_NODE = "1";
  } else {
    delete env.ELECTRON_RUN_AS_NODE;
  }

  const executable = useElectronAsNodeRuntime && electronExecPath
    ? electronExecPath
    : (systemNodePath || "node");
  const options: EchoSdkOptions = {
    model: settings.model.trim(),
    cwd,
    maxTurns: 30,
    permissionMode: "default",
    env,
    abortController,
    executable,
    executableArgs: [],
    stderr: (chunk: string) => {
      if (typeof chunk === "string" && chunk) {
        onStderr?.(chunk);
      }
    }
  };
  if (packagedCli?.path) {
    options.pathToClaudeCodeExecutable = packagedCli.path;
  }

  if (resumeSessionId) {
    options.resume = resumeSessionId;
  }

  if (onPermissionRequest) {
    options.canUseTool = async (
      toolName: unknown,
      input: unknown,
      details: {
        signal: AbortSignal;
        suggestions?: unknown[];
        blockedPath?: string;
        decisionReason?: string;
        toolUseID?: string;
      }
    ) => {
      const parsedToolName = readString(toolName) || "tool";
      const parsedInput =
        input && typeof input === "object" ? (input as Record<string, unknown>) : ({} as Record<string, unknown>);
      const requestId = readString(details.toolUseID) || crypto.randomUUID();
      const response = await onPermissionRequest({
        requestId,
        toolName: parsedToolName,
        input: parsedInput,
        reason: readString(details.decisionReason) || undefined,
        blockedPath: readString(details.blockedPath) || undefined,
        suggestions: Array.isArray(details.suggestions) ? details.suggestions : undefined,
        signal: details.signal
      });

      if (response.decision === "approved") {
        return {
          behavior: "allow",
          updatedInput: response.updatedInput ?? parsedInput,
          updatedPermissions: Array.isArray(response.updatedPermissions)
            ? (response.updatedPermissions as PermissionUpdate[])
            : undefined,
          toolUseID: requestId
        };
      }

      return {
        behavior: "deny",
        message: response.message ?? "Permission denied by user.",
        interrupt: true,
        toolUseID: requestId
      };
    };
  }

  return options;
};

export const runClaudeAgentAdapter = async ({
  request,
  history,
  signal,
  cwd,
  resumeSessionId,
  onEvent,
  onPermissionRequest
}: RunClaudeAgentInput): Promise<RunClaudeAgentResult> => {
  if (request.settings.providerType !== "claude-agent") {
    throw new Error("Agent provider type mismatch.");
  }

  const input = request.input.trim();
  const hasAttachments = Boolean(request.attachments?.length);
  if (!input && !hasAttachments) {
    throw new Error("Message content is empty.");
  }

  if (!request.settings.apiKey.trim()) {
    throw new Error("Missing API key for Claude Agent provider.");
  }

  const prompt = buildAgentPrompt({
    settings: request.settings,
    input,
    attachments: request.attachments,
    // Resumed SDK sessions already carry prior turns; replaying recent history here
    // duplicates context and makes the agent more repetitive.
    history: resumeSessionId ? [] : history,
    cwd,
    environmentSnapshot: request.environmentSnapshot
  });

  const sdkModule =
    _cachedSdkModule ??
    ((_cachedSdkModule = await import("@anthropic-ai/claude-agent-sdk")), _cachedSdkModule);

  if (typeof sdkModule.query !== "function") {
    throw new Error("Claude Agent SDK is available but query() was not found.");
  }

  let stderrTail = "";
  const pushStderr = (chunk: string) => {
    stderrTail = `${stderrTail}${chunk}`.slice(-4000);
  };

  const iterator: Query = sdkModule.query({
    prompt,
    options: buildSdkOptions(
      request.settings,
      cwd,
      signal,
      resumeSessionId,
      onPermissionRequest,
      pushStderr
    ) as Options
  });

  if (!iterator || typeof iterator[Symbol.asyncIterator] !== "function") {
    throw new Error("Claude Agent SDK query() did not return an async iterator.");
  }

  let assistantText = "";
  let finalResultText = "";
  let usage: AgentUsage | undefined;
  let sdkSessionId: string | undefined;
  const streamParseState = createStreamParseState();

  try {
    for await (const sdkMessage of iterator) {
      if (signal.aborted) {
        throw Object.assign(new Error("Aborted"), { name: "AbortError" });
      }

      const typedMessage = sdkMessage as SDKMessage;
      usage = extractUsage(typedMessage) ?? usage;
      sdkSessionId = extractSdkSessionId(typedMessage) ?? sdkSessionId;
      finalResultText = extractFinalResultText(typedMessage) ?? finalResultText;

      const events = convertSdkMessageToEvents(typedMessage, streamParseState);
      for (const event of events) {
        if (event.type === "text_delta") {
          assistantText = `${assistantText}${event.text}`;
        }
        if (event.type === "text_complete" && event.text && !assistantText.endsWith(event.text)) {
          assistantText = `${assistantText}${event.text}`;
        }
        if (event.type === "usage_update") {
          usage = event.usage;
        }

        onEvent(event);

        // SDK-level error messages are terminal in the current UI flow.
        // Propagate them immediately so the orchestrator persists the real cause
        // instead of falling through to an "empty response" error.
        if (event.type === "error") {
          throw new Error(event.message);
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    const baseError = toError(error, "Claude Agent SDK stream failed.");
    const stderrText = stderrTail.trim();
    if (!stderrText) {
      throw baseError;
    }
    const trimmedLines = stderrText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-8);
    const stderrSummary = trimmedLines.join(" | ").slice(0, 1200);
    throw new Error(`${baseError.message}\nClaude stderr: ${stderrSummary}`);
  }

  return {
    assistantText: assistantText || finalResultText,
    usage,
    sdkSessionId
  };
};

export const __test__ = {
  convertSdkMessageToEvents,
  createStreamParseState,
  extractFinalResultText
};
