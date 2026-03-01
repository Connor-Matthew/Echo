import path from "node:path";
import type {
  AgentMessage,
  AgentPermissionDecision,
  AgentResolvePermissionRequest,
  AgentResolvePermissionResult,
  AgentSendMessageRequest,
  AgentSendMessageResult,
  AgentSessionMeta,
  AgentStreamEnvelope,
  AgentStreamEvent,
  AgentTypedError
} from "../../src/shared/agent-contracts";
import { agentSessionManager } from "./agent-session-manager";
import { runClaudeAgentQuery } from "./agent-service";
import type { ToolCall } from "../../src/shared/contracts";

type ActiveRunState = {
  controller: AbortController;
  sessionId: string;
  seq: number;
};

type StartAgentRunInput = {
  request: AgentSendMessageRequest;
  emitEnvelope: (envelope: AgentStreamEnvelope) => void;
};

type StopAgentRunInput = {
  runId?: string;
  sessionId?: string;
};

type PendingPermissionRequest = {
  resolveDecision: (
    decision: AgentPermissionDecision,
    message?: string,
    applySuggestions?: boolean
  ) => void;
  rejectDecision: (error: Error) => void;
  sessionId?: string;
  toolName?: string;
  blockedPath?: string;
};

type AlwaysAllowRule = {
  toolName: string;
  blockedPath?: string;
};

const activeRunsByRunId = new Map<string, ActiveRunState>();
const activeRunIdBySessionId = new Map<string, string>();
const pendingPermissionsByRunId = new Map<string, Map<string, PendingPermissionRequest>>();
const alwaysAllowRulesBySessionId = new Map<string, AlwaysAllowRule[]>();

const createId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const createAbortError = () => Object.assign(new Error("Aborted"), { name: "AbortError" });
const normalizeToolName = (value?: string) => value?.trim().toLowerCase() ?? "";
const normalizeBlockedPath = (value?: string) => {
  const raw = value?.trim();
  if (!raw) {
    return undefined;
  }
  const normalized = path.normalize(raw);
  return normalized.replace(/[\\/]+$/, "");
};

const isSameOrChildPath = (candidate: string, expectedParent: string) =>
  candidate === expectedParent || candidate.startsWith(`${expectedParent}${path.sep}`);

const registerAlwaysAllowRule = (sessionId: string, toolName?: string, blockedPath?: string) => {
  const normalizedToolName = normalizeToolName(toolName);
  if (!sessionId || !normalizedToolName) {
    return;
  }

  const normalizedBlockedPath = normalizeBlockedPath(blockedPath);
  const current = alwaysAllowRulesBySessionId.get(sessionId) ?? [];
  const exists = current.some(
    (rule) =>
      rule.toolName === normalizedToolName &&
      normalizeBlockedPath(rule.blockedPath) === normalizedBlockedPath
  );
  if (exists) {
    return;
  }

  alwaysAllowRulesBySessionId.set(sessionId, [
    ...current,
    {
      toolName: normalizedToolName,
      blockedPath: normalizedBlockedPath
    }
  ]);
};

const shouldAutoApprovePermission = (
  sessionId: string,
  toolName?: string,
  blockedPath?: string
) => {
  const rules = alwaysAllowRulesBySessionId.get(sessionId);
  if (!rules?.length) {
    return false;
  }

  const normalizedToolName = normalizeToolName(toolName);
  const normalizedBlockedPath = normalizeBlockedPath(blockedPath);
  return rules.some((rule) => {
    if (rule.toolName !== normalizedToolName) {
      return false;
    }

    if (!rule.blockedPath) {
      return true;
    }
    if (!normalizedBlockedPath) {
      return false;
    }
    return isSameOrChildPath(normalizedBlockedPath, rule.blockedPath);
  });
};

const matchesAlwaysAllowTarget = (base: PendingPermissionRequest, target: PendingPermissionRequest) => {
  const baseToolName = normalizeToolName(base.toolName);
  const targetToolName = normalizeToolName(target.toolName);
  if (!baseToolName || baseToolName !== targetToolName) {
    return false;
  }

  const baseBlockedPath = normalizeBlockedPath(base.blockedPath);
  if (!baseBlockedPath) {
    return true;
  }
  const targetBlockedPath = normalizeBlockedPath(target.blockedPath);
  if (!targetBlockedPath) {
    return false;
  }
  return isSameOrChildPath(targetBlockedPath, baseBlockedPath);
};

const finalizeTitleFromPrompt = (prompt: string) => {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "New Agent Session";
  }
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed;
};

const resolveRunCwd = (requestCwd?: string) => {
  const raw = requestCwd?.trim();
  if (!raw) {
    return process.cwd();
  }
  return path.isAbsolute(raw) ? raw : process.cwd();
};

const appendAgentMessage = (
  sessionId: string,
  role: AgentMessage["role"],
  content: string,
  runId: string | undefined,
  status: AgentMessage["status"],
  attachments?: AgentMessage["attachments"],
  toolCalls?: AgentMessage["toolCalls"]
): AgentMessage => ({
  id: createId(),
  sessionId,
  role,
  content,
  createdAt: nowIso(),
  attachments: attachments?.length ? attachments : undefined,
  toolCalls: toolCalls?.length ? toolCalls : undefined,
  runId,
  status
});

const emitEvent = (
  sessionId: string,
  runId: string,
  state: ActiveRunState,
  emitEnvelope: (envelope: AgentStreamEnvelope) => void,
  event: AgentStreamEvent
) => {
  state.seq += 1;
  emitEnvelope({
    sessionId,
    runId,
    seq: state.seq,
    timestamp: nowIso(),
    event
  });
};

const parseStatusCode = (message: string) => {
  const match = message.match(/\b([45]\d{2})\b/);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
};

const toTypedError = (error: unknown): AgentTypedError => {
  const message = error instanceof Error ? error.message : "Agent execution failed.";
  const lower = message.toLowerCase();
  const status = parseStatusCode(message);

  if (lower.includes("already active") || lower.includes("already running")) {
    return {
      code: "session_busy",
      title: "Session Is Busy",
      message: "当前会话已有运行中的 Agent 任务，请先停止或等待完成。",
      actions: ["retry"]
    };
  }

  if (lower.includes("missing api key") || lower.includes("provider settings are incomplete")) {
    return {
      code: "provider_misconfigured",
      title: "Provider Misconfigured",
      message: "Agent provider 配置不完整，请检查 API Key / Model / Base URL。",
      actions: ["open_settings"]
    };
  }

  if (
    lower.includes("failed to spawn claude code process") &&
    (lower.includes("enoent") || lower.includes("spawn node"))
  ) {
    return {
      code: "provider_misconfigured",
      title: "Agent Runtime Missing",
      message:
        "Agent 运行时启动失败（未找到可执行 Node 运行环境）。请升级到最新打包版本后重试。",
      actions: ["retry", "open_settings"]
    };
  }

  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid api key")
  ) {
    return {
      code: "authentication_failed",
      title: "Authentication Failed",
      message: "鉴权失败，请检查 API Key 或渠道权限。",
      status,
      actions: ["open_settings"]
    };
  }

  if (lower.includes("429") || lower.includes("rate limit")) {
    return {
      code: "rate_limited",
      title: "Rate Limited",
      message: "请求频率受限，请稍后重试。",
      status,
      retryable: true,
      actions: ["retry"]
    };
  }

  if (lower.includes("permission")) {
    return {
      code: "permission_denied",
      title: "Permission Denied",
      message: "工具权限请求被拒绝或未通过。",
      status,
      actions: ["review_permissions"]
    };
  }

  if (
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("fetch failed") ||
    lower.includes("econn") ||
    lower.includes("socket")
  ) {
    return {
      code: "network_error",
      title: "Network Error",
      message: "网络连接异常，请检查网络或代理设置后重试。",
      status,
      retryable: true,
      actions: ["retry"]
    };
  }

  if (lower.includes("empty") || lower.includes("mismatch") || lower.includes("not found")) {
    return {
      code: "invalid_request",
      title: "Invalid Request",
      message,
      status
    };
  }

  if (status && status >= 500) {
    return {
      code: "provider_error",
      title: "Provider Error",
      message,
      status,
      retryable: true,
      actions: ["retry"]
    };
  }

  return {
    code: "unknown_error",
    title: "Agent Execution Failed",
    message,
    status
  };
};

const ensureSession = async (sessionId: string): Promise<AgentSessionMeta> => {
  const sessions = await agentSessionManager.listSessions();
  const session = sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    throw new Error("Agent session not found.");
  }
  return session;
};

const hasAttachments = (attachments?: AgentMessage["attachments"]) => Boolean(attachments?.length);

const finalizeTitleFromRequest = (input: string, attachments?: AgentMessage["attachments"]) => {
  const titleFromPrompt = finalizeTitleFromPrompt(input);
  if (titleFromPrompt !== "New Agent Session") {
    return titleFromPrompt;
  }
  const firstAttachmentName = attachments?.[0]?.name?.trim();
  if (!firstAttachmentName) {
    return titleFromPrompt;
  }
  return firstAttachmentName.length > 40 ? `${firstAttachmentName.slice(0, 40)}...` : firstAttachmentName;
};

const waitForPermissionDecision = (
  runId: string,
  requestId: string,
  signal: AbortSignal,
  metadata: {
    sessionId: string;
    toolName?: string;
    blockedPath?: string;
  }
): Promise<{ decision: AgentPermissionDecision; message?: string; applySuggestions?: boolean }> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }

    const bucket = pendingPermissionsByRunId.get(runId) ?? new Map<string, PendingPermissionRequest>();
    pendingPermissionsByRunId.set(runId, bucket);

    const finalize = () => {
      signal.removeEventListener("abort", onAbort);
      bucket.delete(requestId);
      if (!bucket.size) {
        pendingPermissionsByRunId.delete(runId);
      }
    };

    const onAbort = () => {
      finalize();
      reject(createAbortError());
    };

    signal.addEventListener("abort", onAbort, { once: true });

    bucket.set(requestId, {
      resolveDecision: (decision, message, applySuggestions) => {
        finalize();
        resolve({ decision, message, applySuggestions });
      },
      rejectDecision: (error) => {
        finalize();
        reject(error);
      },
      sessionId: metadata.sessionId,
      toolName: metadata.toolName,
      blockedPath: metadata.blockedPath
    });
  });

const rejectPendingPermissions = (runId: string, reason: string) => {
  const bucket = pendingPermissionsByRunId.get(runId);
  if (!bucket) {
    return;
  }
  for (const pending of bucket.values()) {
    const abortError = createAbortError();
    abortError.message = reason;
    pending.rejectDecision(abortError);
  }
  pendingPermissionsByRunId.delete(runId);
};

const runInBackground = async (
  runId: string,
  state: ActiveRunState,
  session: AgentSessionMeta,
  request: AgentSendMessageRequest,
  emitEnvelope: (envelope: AgentStreamEnvelope) => void
) => {
  const sessionId = request.sessionId;
  const cwd = resolveRunCwd(request.cwd);
  let streamedAssistantText = "";
  const collectedToolCalls = new Map<string, ToolCall>();

  try {
    const history = await agentSessionManager.getMessages(sessionId);
    const result = await runClaudeAgentQuery({
      request,
      history,
      signal: state.controller.signal,
      cwd,
      resumeSessionId: session.sdkSessionId,
      onEvent: (streamEvent) => {
        if (streamEvent.type === "text_delta") {
          streamedAssistantText = `${streamedAssistantText}${streamEvent.text}`;
        }
        if (streamEvent.type === "text_complete" && !streamedAssistantText.endsWith(streamEvent.text)) {
          streamedAssistantText = `${streamedAssistantText}${streamEvent.text}`;
        }
        if (streamEvent.type === "tool_start") {
          const id = `tool:${streamEvent.toolId}`;
          collectedToolCalls.set(id, {
            id,
            serverName: streamEvent.toolName,
            toolName: streamEvent.toolName,
            status: "pending",
            message: streamEvent.input ?? "",
            contentOffset: Math.max(0, streamedAssistantText.length)
          });
        }
        if (streamEvent.type === "tool_result") {
          const id = `tool:${streamEvent.toolId}`;
          const existing = collectedToolCalls.get(id);
          collectedToolCalls.set(id, {
            ...(existing ?? {
              id,
              serverName: streamEvent.toolName,
              toolName: streamEvent.toolName,
              message: "",
              contentOffset: Math.max(0, streamedAssistantText.length)
            }),
            status: streamEvent.isError ? "error" : "success",
            message: existing?.message ?? streamEvent.output ?? "",
            contentOffset:
              typeof existing?.contentOffset === "number" && Number.isFinite(existing.contentOffset)
                ? existing.contentOffset
                : Math.max(0, streamedAssistantText.length)
          });
        }
        emitEvent(sessionId, runId, state, emitEnvelope, streamEvent);
      },
      onPermissionRequest: async (permissionRequest) => {
        if (shouldAutoApprovePermission(sessionId, permissionRequest.toolName, permissionRequest.blockedPath)) {
          return {
            decision: "approved",
            message: "Approved by saved always-allow rule.",
            updatedInput: permissionRequest.input,
            updatedPermissions: Array.isArray(permissionRequest.suggestions)
              ? permissionRequest.suggestions
              : undefined
          };
        }

        emitEvent(sessionId, runId, state, emitEnvelope, {
          type: "permission_request",
          requestId: permissionRequest.requestId,
          toolName: permissionRequest.toolName,
          blockedPath: permissionRequest.blockedPath,
          reason:
            permissionRequest.reason ||
            (permissionRequest.blockedPath ? `Blocked path: ${permissionRequest.blockedPath}` : undefined),
          supportsAlwaysAllow: Array.isArray(permissionRequest.suggestions) && permissionRequest.suggestions.length > 0
        });

        const decision = await waitForPermissionDecision(
          runId,
          permissionRequest.requestId,
          permissionRequest.signal,
          {
            sessionId,
            toolName: permissionRequest.toolName,
            blockedPath: permissionRequest.blockedPath
          }
        );

        if (decision.decision === "approved" && decision.applySuggestions) {
          registerAlwaysAllowRule(sessionId, permissionRequest.toolName, permissionRequest.blockedPath);
        }

        emitEvent(sessionId, runId, state, emitEnvelope, {
          type: "permission_resolved",
          requestId: permissionRequest.requestId,
          decision: decision.decision
        });

        return {
          decision: decision.decision,
          message: decision.message,
          updatedInput: permissionRequest.input,
          updatedPermissions:
            decision.decision === "approved" &&
            Boolean(decision.applySuggestions) &&
            Array.isArray(permissionRequest.suggestions)
              ? permissionRequest.suggestions
              : undefined
        };
      }
    });

    const assistantText = result.assistantText || streamedAssistantText.trim();
    const finalToolCalls = collectedToolCalls.size ? [...collectedToolCalls.values()] : undefined;
    if (assistantText) {
      await agentSessionManager.appendMessage(
        sessionId,
        appendAgentMessage(sessionId, "assistant", assistantText, runId, "completed", undefined, finalToolCalls)
      );
    } else {
      await agentSessionManager.appendMessage(
        sessionId,
        appendAgentMessage(
          sessionId,
          "assistant",
          "[Agent Error] Agent run completed but returned no assistant text. This usually means provider response format is incompatible with current parser.",
          runId,
          "error",
          undefined,
          finalToolCalls
        )
      );
      emitEvent(sessionId, runId, state, emitEnvelope, {
        type: "typed_error",
        error: {
          code: "provider_error",
          title: "Empty Agent Response",
          message:
            "Agent 运行已结束，但未解析到任何文本输出。请检查 provider 是否兼容 Claude Agent SDK 输出格式。",
          retryable: true,
          actions: ["open_settings", "retry"]
        }
      });
      emitEvent(sessionId, runId, state, emitEnvelope, {
        type: "error",
        message:
          "Agent run completed but no assistant text was parsed from provider response.",
        code: "provider_error"
      });
    }

    await agentSessionManager.updateSessionMeta(sessionId, {
      sdkSessionId: result.sdkSessionId ?? session.sdkSessionId,
      lastCwd: cwd,
      lastModel: request.settings.model,
      lastProviderId: request.settings.providerId
    });

    emitEvent(sessionId, runId, state, emitEnvelope, {
      type: "complete",
      usage: result.usage
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (streamedAssistantText.trim()) {
        await agentSessionManager.appendMessage(
          sessionId,
          appendAgentMessage(sessionId, "assistant", streamedAssistantText.trim(), runId, "stopped", undefined, collectedToolCalls.size ? [...collectedToolCalls.values()] : undefined)
        );
      }
      emitEvent(sessionId, runId, state, emitEnvelope, {
        type: "task_progress",
        message: "Stopped by user."
      });
      emitEvent(sessionId, runId, state, emitEnvelope, { type: "complete" });
      return;
    }

    const typedError = toTypedError(error);
    const persistedErrorText = streamedAssistantText.trim()
      ? `${streamedAssistantText.trim()}\n\n[Agent Error] ${typedError.message}`
      : `[Agent Error] ${typedError.message}`;
    await agentSessionManager.appendMessage(
      sessionId,
      appendAgentMessage(sessionId, "assistant", persistedErrorText, runId, "error", undefined, collectedToolCalls.size ? [...collectedToolCalls.values()] : undefined)
    );

    emitEvent(sessionId, runId, state, emitEnvelope, {
      type: "typed_error",
      error: typedError
    });
    emitEvent(sessionId, runId, state, emitEnvelope, {
      type: "error",
      message: typedError.message,
      code: typedError.code
    });
  } finally {
    rejectPendingPermissions(runId, "Agent run finished.");
    activeRunsByRunId.delete(runId);
    activeRunIdBySessionId.delete(sessionId);
  }
};

export const agentOrchestrator = {
  async startRun({ request, emitEnvelope }: StartAgentRunInput): Promise<AgentSendMessageResult> {
    if (request.settings.providerType !== "claude-agent") {
      throw new Error("Selected provider is not Claude Agent.");
    }

    const input = request.input.trim();
    if (!input && !hasAttachments(request.attachments)) {
      throw new Error("Message content is empty.");
    }

    if (activeRunIdBySessionId.has(request.sessionId)) {
      throw new Error("An agent run is already active for this session.");
    }

    const session = await ensureSession(request.sessionId);
    const runId = createId();
    const state: ActiveRunState = {
      controller: new AbortController(),
      sessionId: request.sessionId,
      seq: 0
    };

    activeRunsByRunId.set(runId, state);
    activeRunIdBySessionId.set(request.sessionId, runId);
    try {
      const userMessage = appendAgentMessage(
        request.sessionId,
        "user",
        input,
        runId,
        "completed",
        request.attachments
      );
      await agentSessionManager.appendMessage(request.sessionId, userMessage);

      if (session.title === "New Agent Session") {
        await agentSessionManager.updateSessionMeta(request.sessionId, {
          title: finalizeTitleFromRequest(input, request.attachments)
        });
      }

      const cwd = resolveRunCwd(request.cwd);
      await agentSessionManager.updateSessionMeta(request.sessionId, {
        lastCwd: cwd,
        lastModel: request.settings.model,
        lastProviderId: request.settings.providerId
      });

      void runInBackground(runId, state, session, request, emitEnvelope);
      return { runId };
    } catch (error) {
      rejectPendingPermissions(runId, "Agent run initialization failed.");
      activeRunsByRunId.delete(runId);
      activeRunIdBySessionId.delete(request.sessionId);
      throw error;
    }
  },

  async stopRun(payload: StopAgentRunInput): Promise<void> {
    const { runId, sessionId } = payload;

    if (runId) {
      const active = activeRunsByRunId.get(runId);
      if (active) {
        active.controller.abort();
        rejectPendingPermissions(runId, "Agent run stopped.");
        activeRunsByRunId.delete(runId);
        activeRunIdBySessionId.delete(active.sessionId);
      }
      return;
    }

    if (!sessionId) {
      return;
    }

    const activeRunId = activeRunIdBySessionId.get(sessionId);
    if (!activeRunId) {
      return;
    }
    const active = activeRunsByRunId.get(activeRunId);
    if (!active) {
      activeRunIdBySessionId.delete(sessionId);
      return;
    }
    active.controller.abort();
    rejectPendingPermissions(activeRunId, "Agent run stopped.");
    activeRunsByRunId.delete(activeRunId);
    activeRunIdBySessionId.delete(sessionId);
  },

  async resolvePermission(
    payload: AgentResolvePermissionRequest
  ): Promise<AgentResolvePermissionResult> {
    const bucket = pendingPermissionsByRunId.get(payload.runId);
    if (!bucket) {
      return { ok: false };
    }

    const pending = bucket.get(payload.requestId);
    if (!pending) {
      return { ok: false };
    }

    const shouldApplyAlwaysAllow = payload.decision === "approved" && Boolean(payload.applySuggestions);
    const siblingsToAutoResolve = shouldApplyAlwaysAllow
      ? [...bucket.entries()]
          .filter(([requestId, sibling]) => requestId !== payload.requestId && matchesAlwaysAllowTarget(pending, sibling))
          .map(([, sibling]) => sibling)
      : [];

    pending.resolveDecision(payload.decision, payload.message, Boolean(payload.applySuggestions));

    if (shouldApplyAlwaysAllow && pending.sessionId) {
      registerAlwaysAllowRule(pending.sessionId, pending.toolName, pending.blockedPath);
      for (const sibling of siblingsToAutoResolve) {
        sibling.resolveDecision("approved", "Approved by saved always-allow rule.", true);
      }
    }

    return { ok: true };
  }
};
