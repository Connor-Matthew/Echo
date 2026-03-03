import type {
  McpServerStatus,
  StoredProvider
} from "../../shared/contracts";

export const toProviderTypeValue = (value: string): StoredProvider["providerType"] => {
  if (value === "anthropic") {
    return "anthropic";
  }
  if (value === "acp") {
    return "acp";
  }
  if (value === "claude-agent") {
    return "claude-agent";
  }
  return "openai";
};

export const toMcpStatusMap = (servers: McpServerStatus[]) =>
  Object.fromEntries(servers.map((server) => [server.name, server] as const));

export const combineStatusMessages = (...messages: string[]) =>
  messages
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(" ");
