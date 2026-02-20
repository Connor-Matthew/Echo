import type { AppSettings, StoredProvider } from "./contracts";

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
  runId?: string;
  status?: AgentMessageStatus;
};

export type AgentUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
};

export type AgentStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "text_complete"; text: string; isIntermediate?: boolean }
  | { type: "tool_start"; toolId: string; toolName: string; input?: string }
  | { type: "tool_result"; toolId: string; toolName: string; output?: string; isError?: boolean }
  | { type: "task_progress"; message: string }
  | { type: "complete"; usage?: AgentUsage }
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
  cwd?: string;
  settings: AgentRunSettingsSnapshot;
};

export type AgentSendMessageResult = {
  runId: string;
};

const toAgentProviderType = (provider: StoredProvider) => provider.providerType === "claude-agent";

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
    baseUrl: activeProvider.baseUrl,
    apiKey: activeProvider.apiKey,
    model: activeProvider.model,
    systemPrompt: settings.systemPrompt
  };
};
