import type {
  AppSettings,
  ChatAttachment,
  EnvironmentSnapshot,
  StoredProvider,
  ToolCall
} from "./contracts";

export type AgentSessionMeta = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sdkSessionId?: string;
  lastCwd?: string;
  lastModel?: string;
  lastProviderId?: string;
};

export type AgentMessageRole = "system" | "user" | "assistant";

export type AgentMessageStatus = "completed" | "error" | "stopped";

export type AgentMessage = {
  id: string;
  sessionId: string;
  role: AgentMessageRole;
  content: string;
  createdAt: string;
  attachments?: ChatAttachment[];
  toolCalls?: ToolCall[];
  runId?: string;
  status?: AgentMessageStatus;
};

export type AgentUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type AgentTypedErrorCode =
  | "invalid_request"
  | "session_busy"
  | "provider_misconfigured"
  | "authentication_failed"
  | "rate_limited"
  | "permission_denied"
  | "network_error"
  | "provider_error"
  | "unknown_error";

export type AgentTypedErrorAction = "open_settings" | "retry" | "review_permissions";

export type AgentTypedError = {
  code: AgentTypedErrorCode;
  title: string;
  message: string;
  retryable?: boolean;
  status?: number;
  actions?: AgentTypedErrorAction[];
};

export type AgentStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "text_complete"; text: string; isIntermediate?: boolean }
  | { type: "tool_start"; toolId: string; toolName: string; input?: string }
  | { type: "tool_result"; toolId: string; toolName: string; output?: string; isError?: boolean }
  | { type: "usage_update"; usage: AgentUsage }
  | {
      type: "permission_request";
      requestId: string;
      toolName?: string;
      reason?: string;
      blockedPath?: string;
      supportsAlwaysAllow?: boolean;
    }
  | { type: "permission_resolved"; requestId: string; decision: "approved" | "denied" }
  | { type: "ask_user_request"; requestId: string; question: string }
  | { type: "compacting"; message?: string }
  | { type: "compact_complete"; message?: string }
  | { type: "task_progress"; message: string }
  | { type: "complete"; usage?: AgentUsage }
  | { type: "typed_error"; error: AgentTypedError }
  | { type: "error"; message: string; code?: string };

export type AgentStreamEnvelope = {
  sessionId: string;
  runId: string;
  seq: number;
  timestamp: string;
  event: AgentStreamEvent;
};

export type AgentRunSettingsSnapshot = {
  providerId: string;
  providerName: string;
  providerType: "claude-agent";
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
};

export type AgentSendMessageRequest = {
  sessionId: string;
  input: string;
  attachments?: ChatAttachment[];
  cwd?: string;
  settings: AgentRunSettingsSnapshot;
  environmentSnapshot?: EnvironmentSnapshot;
};

export type AgentSendMessageResult = {
  runId: string;
};

export type AgentPermissionDecision = "approved" | "denied";

export type AgentResolvePermissionRequest = {
  runId: string;
  requestId: string;
  decision: AgentPermissionDecision;
  applySuggestions?: boolean;
  message?: string;
};

export type AgentResolvePermissionResult = {
  ok: boolean;
};

const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const stripAnthropicResourceSuffix = (value: string) =>
  value.replace(/\/v1\/(messages|models)$/i, "/v1").replace(/\/(messages|models)$/i, "");

export const normalizeAnthropicCompatibleBaseUrl = (
  baseUrl: string,
  fallback = DEFAULT_ANTHROPIC_BASE_URL
) => {
  const normalized = normalizeBaseUrl(baseUrl || fallback);
  if (!normalized) {
    return `${DEFAULT_ANTHROPIC_BASE_URL}/v1`;
  }

  const rooted = stripAnthropicResourceSuffix(normalized);
  return /\/v\d+$/i.test(rooted) ? rooted : `${rooted}/v1`;
};

export const normalizeAnthropicBaseUrlForSdk = (
  baseUrl: string,
  fallback = DEFAULT_ANTHROPIC_BASE_URL
) =>
  normalizeAnthropicCompatibleBaseUrl(baseUrl, fallback)
    .replace(/\/v1\/messages$/i, "")
    .replace(/\/v1$/i, "");

const toAgentProviderType = (provider: StoredProvider) =>
  provider.providerType === "claude-agent" || provider.providerType === "anthropic";

export const getAgentProviderFromSettings = (settings: AppSettings): StoredProvider | null => {
  const activeProvider =
    settings.providers.find((provider) => provider.id === settings.activeProviderId) ?? settings.providers[0];
  if (!activeProvider || !toAgentProviderType(activeProvider)) {
    return null;
  }
  return activeProvider;
};

export const buildAgentRunSettingsSnapshot = (
  settings: AppSettings
): AgentRunSettingsSnapshot | null => {
  const activeProvider = getAgentProviderFromSettings(settings);
  if (!activeProvider) {
    return null;
  }

  return {
    providerId: activeProvider.id,
    providerName: activeProvider.name,
    providerType: "claude-agent",
    baseUrl: normalizeAnthropicCompatibleBaseUrl(activeProvider.baseUrl),
    apiKey: activeProvider.apiKey,
    model: activeProvider.model,
    systemPrompt: settings.systemPrompt
  };
};
