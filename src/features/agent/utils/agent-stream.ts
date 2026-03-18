import type { AgentMessage, AgentStreamEnvelope } from "../../../shared/agent-contracts";

type UpsertAgentMessages = (
  sessionId: string,
  mutate: (messages: AgentMessage[]) => AgentMessage[]
) => void;

type AgentToolCall = NonNullable<AgentMessage["toolCalls"]>[number];

const MAX_INLINE_DETAIL_LENGTH = 1200;
const MAX_INLINE_DETAIL_LINES = 32;

const clampInlineDetail = (value: string) =>
  value.length > MAX_INLINE_DETAIL_LENGTH ? `${value.slice(0, MAX_INLINE_DETAIL_LENGTH)}...` : value;

const readStringFromRecord = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const extractInlineDetail = (value: unknown, depth = 0): string => {
  if (depth > 4 || value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const flatText = value
      .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
      .filter(Boolean);
    if (flatText.length) {
      return flatText.join(" ");
    }
    for (const entry of value) {
      const nested = extractInlineDetail(entry, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return "";
  }

  if (typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  const command =
    readStringFromRecord(record, ["cmd", "command", "shellCommand", "script", "path"]) ||
    (() => {
      const args = record.args;
      if (!Array.isArray(args)) {
        return "";
      }
      const parsedArgs = args
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean);
      return parsedArgs.length ? parsedArgs.join(" ") : "";
    })();
  if (command) {
    return command;
  }

  const query = readStringFromRecord(record, [
    "q",
    "query",
    "pattern",
    "url",
    "location",
    "question",
    "prompt",
    "ticker"
  ]);
  if (query) {
    return query;
  }

  const nestedKeys = [
    "input",
    "arguments",
    "argument",
    "params",
    "payload",
    "data",
    "request",
    "toolInput",
    "tool_input"
  ];
  for (const key of nestedKeys) {
    const nested = extractInlineDetail(record[key], depth + 1);
    if (nested) {
      return nested;
    }
  }

  const firstString = Object.values(record).find(
    (entry): entry is string => typeof entry === "string" && Boolean(entry.trim())
  );
  return firstString ? firstString.trim() : "";
};

const summarizeToolInput = (input?: string) => {
  if (!input?.trim()) {
    return "";
  }

  const raw = input.trim();
  try {
    const parsed = JSON.parse(raw) as unknown;
    const detail = extractInlineDetail(parsed);
    return detail ? clampInlineDetail(detail) : "";
  } catch {
    return clampInlineDetail(raw);
  }
};

const normalizeOutputPreview = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trimEnd());
  const clippedLines = lines.slice(0, MAX_INLINE_DETAIL_LINES);
  const joined = clippedLines.join("\n");
  const withEllipsis = lines.length > MAX_INLINE_DETAIL_LINES ? `${joined}\n...` : joined;
  return clampInlineDetail(withEllipsis);
};

const extractToolOutputDetail = (value: unknown, depth = 0): string => {
  if (depth > 5 || value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractToolOutputDetail(entry, depth + 1);
      if (nested) {
        return nested;
      }
    }
    return "";
  }

  if (typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  const preferredKeys = [
    "stdout",
    "stderr",
    "output",
    "result",
    "text",
    "message",
    "content",
    "data"
  ];
  for (const key of preferredKeys) {
    const nested = extractToolOutputDetail(record[key], depth + 1);
    if (nested) {
      return nested;
    }
  }

  for (const entry of Object.values(record)) {
    const nested = extractToolOutputDetail(entry, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return "";
};

const summarizeToolOutput = (output?: string) => {
  if (!output?.trim()) {
    return "";
  }

  const raw = output.trim();
  try {
    const parsed = JSON.parse(raw) as unknown;
    const detail = extractToolOutputDetail(parsed);
    return normalizeOutputPreview(detail || raw);
  } catch {
    return normalizeOutputPreview(raw);
  }
};

const prettifyToolLabel = (rawToolName: string) => {
  const normalized = rawToolName.trim().toLowerCase();
  if (
    normalized === "exec_command" ||
    normalized === "bash" ||
    normalized === "shell" ||
    normalized === "terminal"
  ) {
    return "Bash";
  }
  if (normalized === "todowrite" || normalized === "todo_write") {
    return "TodoWrite";
  }
  if (normalized === "apply_patch") {
    return "Patch";
  }
  if (normalized === "search_query" || normalized === "web_search") {
    return "Web";
  }
  return rawToolName || "Tool";
};

const inferBashActionLabel = (command: string) => {
  const normalized = command.trim().toLowerCase();
  if (!normalized) {
    return "执行命令";
  }
  if (normalized.startsWith("ls")) {
    return "查看目录内容";
  }
  if (normalized.startsWith("pwd")) {
    return "查看当前目录";
  }
  if (
    normalized.startsWith("cat ") ||
    normalized.startsWith("sed ") ||
    normalized.startsWith("head ") ||
    normalized.startsWith("tail ")
  ) {
    return "查看文件内容";
  }
  if (normalized.startsWith("rg ") || normalized.startsWith("grep ") || normalized.startsWith("find ")) {
    return "搜索内容";
  }
  if (normalized.startsWith("git status") || normalized.startsWith("git log") || normalized.startsWith("git diff")) {
    return "查看仓库状态";
  }
  if (normalized.includes("typecheck") || normalized.includes("tsc")) {
    return "运行类型检查";
  }
  if (normalized.includes("test")) {
    return "运行测试";
  }
  return "执行命令";
};

const inferToolActionLabel = (rawToolName: string, inlineDetail: string) => {
  const label = prettifyToolLabel(rawToolName);
  if (label === "Bash") {
    return inferBashActionLabel(inlineDetail);
  }
  if (label === "TodoWrite") {
    return "更新任务清单";
  }
  if (label === "Patch") {
    return "修改文件";
  }
  if (label === "Web") {
    return "查询信息";
  }
  return "执行操作";
};

const mutateAssistantMessage = (
  messages: AgentMessage[],
  assistantMessageId: string,
  mutate: (message: AgentMessage) => AgentMessage
) =>
  messages.map((message) => (message.id === assistantMessageId ? mutate(message) : message));

const upsertAssistantToolCall = (
  messages: AgentMessage[],
  assistantMessageId: string,
  toolCallId: string,
  buildFallback: (context: { contentOffset: number }) => AgentToolCall,
  mutate: (current: AgentToolCall, context: { contentOffset: number }) => AgentToolCall = (current) => current
) =>
  mutateAssistantMessage(messages, assistantMessageId, (message) => {
    const context = { contentOffset: Math.max(0, message.content.length) };
    const toolCalls = message.toolCalls ?? [];
    const callIndex = toolCalls.findIndex((call) => call.id === toolCallId);
    if (callIndex < 0) {
      return { ...message, toolCalls: [...toolCalls, buildFallback(context)] };
    }
    const nextToolCalls = [...toolCalls];
    nextToolCalls[callIndex] = mutate(nextToolCalls[callIndex], context);
    return { ...message, toolCalls: nextToolCalls };
  });

const settleAssistantPendingToolCalls = (
  messages: AgentMessage[],
  assistantMessageId: string,
  status: "success" | "error"
) =>
  mutateAssistantMessage(messages, assistantMessageId, (message) => {
    if (!message.toolCalls?.length) {
      return message;
    }
    return {
      ...message,
      toolCalls: message.toolCalls.map((toolCall) =>
        toolCall.status === "pending" ? { ...toolCall, status } : toolCall
      )
    };
  });

const settlePendingProgressCalls = (messages: AgentMessage[], assistantMessageId: string) =>
  mutateAssistantMessage(messages, assistantMessageId, (message) => {
    if (!message.toolCalls?.length) {
      return message;
    }
    return {
      ...message,
      toolCalls: message.toolCalls.map((toolCall) =>
        toolCall.status === "pending" && toolCall.id.startsWith("progress:")
          ? { ...toolCall, status: "success" }
          : toolCall
      )
    };
  });

type AgentStreamHandlerOptions = {
  sessionId: string;
  assistantMessageId: string;
  upsertAgentMessages: UpsertAgentMessages;
  appendAgentSystemEvent: (sessionId: string, text: string) => void;
  setAgentErrorBanner: (message: string) => void;
  finishAgentRun: () => void;
  loadAgentMessages: (sessionId: string) => Promise<void>;
  onPermissionRequest?: (payload: AgentStreamEnvelope) => void;
  onPermissionResolved?: (payload: AgentStreamEnvelope) => void;
  onAskUserRequest?: (payload: AgentStreamEnvelope) => void;
};

export const createAgentStreamEnvelopeHandler = ({
  sessionId,
  assistantMessageId,
  upsertAgentMessages,
  appendAgentSystemEvent,
  setAgentErrorBanner,
  finishAgentRun,
  loadAgentMessages,
  onPermissionRequest,
  onPermissionResolved,
  onAskUserRequest
}: AgentStreamHandlerOptions) => {
  const finishAndRefresh = () => {
    finishAgentRun();
    void loadAgentMessages(sessionId).catch(() => {});
  };

  return (payload: AgentStreamEnvelope) => {
    const streamEvent = payload.event;
    if (streamEvent.type === "text_delta") {
      upsertAgentMessages(sessionId, (messages) =>
        mutateAssistantMessage(messages, assistantMessageId, (message) => ({
          ...message,
          content: `${message.content}${streamEvent.text}`
        }))
      );
      return;
    }

    if (streamEvent.type === "text_complete") {
      upsertAgentMessages(sessionId, (messages) =>
        mutateAssistantMessage(messages, assistantMessageId, (message) =>
          message.content.endsWith(streamEvent.text)
            ? message
            : { ...message, content: `${message.content}${streamEvent.text}` }
        )
      );
      return;
    }

    if (streamEvent.type === "usage_update") {
      return;
    }

    if (streamEvent.type === "task_progress") {
      upsertAgentMessages(sessionId, (messages) =>
        upsertAssistantToolCall(
          settlePendingProgressCalls(messages, assistantMessageId),
          assistantMessageId,
          `progress:${payload.seq}`,
          ({ contentOffset }) => ({
            id: `progress:${payload.seq}`,
            serverName: "TodoWrite",
            toolName: clampInlineDetail(streamEvent.message),
            status: "pending",
            message: "",
            contentOffset
          })
        )
      );
      return;
    }

    if (streamEvent.type === "tool_start") {
      const inlineDetail = summarizeToolInput(streamEvent.input);
      const toolLabel = prettifyToolLabel(streamEvent.toolName);
      const actionLabel = inferToolActionLabel(streamEvent.toolName, inlineDetail);
      upsertAgentMessages(sessionId, (messages) =>
        upsertAssistantToolCall(
          messages,
          assistantMessageId,
          `tool:${streamEvent.toolId}`,
          ({ contentOffset }) => ({
            id: `tool:${streamEvent.toolId}`,
            serverName: toolLabel,
            toolName: actionLabel,
            status: "pending",
            message: inlineDetail || "",
            contentOffset
          }),
          (current, { contentOffset }) => ({
            ...current,
            serverName: current.serverName || toolLabel,
            toolName: current.toolName || actionLabel,
            status: "pending",
            message: inlineDetail || current.message || "",
            contentOffset:
              typeof current.contentOffset === "number" && Number.isFinite(current.contentOffset)
                ? current.contentOffset
                : contentOffset
          })
        )
      );
      return;
    }

    if (streamEvent.type === "tool_result") {
      const inlineResult = summarizeToolOutput(streamEvent.output);
      const toolLabel = prettifyToolLabel(streamEvent.toolName);
      upsertAgentMessages(sessionId, (messages) =>
        upsertAssistantToolCall(
          messages,
          assistantMessageId,
          `tool:${streamEvent.toolId}`,
          ({ contentOffset }) => ({
            id: `tool:${streamEvent.toolId}`,
            serverName: toolLabel,
            toolName: inferToolActionLabel(streamEvent.toolName, ""),
            status: streamEvent.isError ? "error" : "success",
            message: inlineResult || (streamEvent.isError ? "Failed" : "Completed"),
            contentOffset
          }),
          (current, { contentOffset }) => ({
            ...current,
            status: streamEvent.isError ? "error" : "success",
            message: inlineResult || current.message || (streamEvent.isError ? "Failed" : "Completed"),
            contentOffset:
              typeof current.contentOffset === "number" && Number.isFinite(current.contentOffset)
                ? current.contentOffset
                : contentOffset
          })
        )
      );
      return;
    }

    if (streamEvent.type === "permission_request") {
      if (onPermissionRequest) {
        onPermissionRequest(payload);
      }
      const permissionMessage = [streamEvent.reason, streamEvent.blockedPath]
        .filter(Boolean)
        .map((part) => String(part).trim())
        .join(" ");
      upsertAgentMessages(sessionId, (messages) =>
        upsertAssistantToolCall(
          messages,
          assistantMessageId,
          `permission:${streamEvent.requestId}`,
          ({ contentOffset }) => ({
            id: `permission:${streamEvent.requestId}`,
            serverName: "Permission",
            toolName: streamEvent.toolName ?? "tool",
            status: "pending",
            message: permissionMessage ? clampInlineDetail(permissionMessage) : "Awaiting approval",
            contentOffset
          }),
          (current) => ({
            ...current,
            status: "pending",
            message:
              permissionMessage && permissionMessage !== current.message
                ? clampInlineDetail(permissionMessage)
                : current.message
          })
        )
      );
      return;
    }

    if (streamEvent.type === "permission_resolved") {
      if (onPermissionResolved) {
        onPermissionResolved(payload);
      }
      upsertAgentMessages(sessionId, (messages) =>
        upsertAssistantToolCall(
          messages,
          assistantMessageId,
          `permission:${streamEvent.requestId}`,
          ({ contentOffset }) => ({
            id: `permission:${streamEvent.requestId}`,
            serverName: "Permission",
            toolName: "request",
            status: streamEvent.decision === "approved" ? "success" : "error",
            message: streamEvent.decision === "approved" ? "Approved" : "Denied",
            contentOffset
          }),
          (current) => ({
            ...current,
            status: streamEvent.decision === "approved" ? "success" : "error",
            message: streamEvent.decision === "approved" ? "Approved" : "Denied"
          })
        )
      );
      return;
    }

    if (streamEvent.type === "ask_user_request") {
      if (onAskUserRequest) {
        onAskUserRequest(payload);
      }
      upsertAgentMessages(sessionId, (messages) =>
        upsertAssistantToolCall(messages, assistantMessageId, `ask-user:${streamEvent.requestId}`, ({ contentOffset }) => ({
          id: `ask-user:${streamEvent.requestId}`,
          serverName: "Input",
          toolName: "User confirmation",
          status: "pending",
          message: clampInlineDetail(streamEvent.question),
          contentOffset
        }))
      );
      return;
    }

    if (streamEvent.type === "compacting") {
      upsertAgentMessages(sessionId, (messages) =>
        upsertAssistantToolCall(
          messages,
          assistantMessageId,
          "compacting",
          ({ contentOffset }) => ({
            id: "compacting",
            serverName: "Context",
            toolName: "Compacting",
            status: "pending",
            message: clampInlineDetail(streamEvent.message ?? "running"),
            contentOffset
          }),
          (current) => ({
            ...current,
            status: "pending",
            message: clampInlineDetail(streamEvent.message ?? "running")
          })
        )
      );
      return;
    }

    if (streamEvent.type === "compact_complete") {
      upsertAgentMessages(sessionId, (messages) =>
        upsertAssistantToolCall(
          messages,
          assistantMessageId,
          "compacting",
          ({ contentOffset }) => ({
            id: "compacting",
            serverName: "Context",
            toolName: "Compacting",
            status: "success",
            message: clampInlineDetail(streamEvent.message ?? "done"),
            contentOffset
          }),
          (current) => ({
            ...current,
            status: "success",
            message: clampInlineDetail(streamEvent.message ?? "done")
          })
        )
      );
      return;
    }

    if (streamEvent.type === "typed_error") {
      const error = streamEvent.error;
      upsertAgentMessages(sessionId, (messages) =>
        settleAssistantPendingToolCalls(messages, assistantMessageId, "error")
      );
      appendAgentSystemEvent(sessionId, `Error: ${error.title}`);
      setAgentErrorBanner(`${error.title}: ${error.message}`);
      finishAndRefresh();
      return;
    }

    if (streamEvent.type === "error") {
      upsertAgentMessages(sessionId, (messages) =>
        settleAssistantPendingToolCalls(messages, assistantMessageId, "error")
      );
      appendAgentSystemEvent(sessionId, `Error: ${streamEvent.message}`);
      setAgentErrorBanner(streamEvent.message);
      finishAndRefresh();
      return;
    }

    if (streamEvent.type === "complete") {
      upsertAgentMessages(sessionId, (messages) =>
        settleAssistantPendingToolCalls(messages, assistantMessageId, "success")
      );
      finishAndRefresh();
      return;
    }
  };
};
