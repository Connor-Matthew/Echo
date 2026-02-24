import type { AgentMessage, AgentRunSettingsSnapshot } from "../../src/shared/agent-contracts";
import type { EnvironmentSnapshot } from "../../src/shared/contracts";
import {
  formatEnvironmentAwarenessBlock,
  formatEnvironmentUsageGuidanceBlock
} from "../../src/shared/environment-awareness";

type BuildAgentPromptInput = {
  settings: AgentRunSettingsSnapshot;
  input: string;
  history: AgentMessage[];
  cwd: string;
  environmentSnapshot?: EnvironmentSnapshot;
};

const HISTORY_LIMIT = 20;

const formatHistory = (history: AgentMessage[]) => {
  if (!history.length) {
    return "";
  }

  const clipped = history.slice(-HISTORY_LIMIT);
  return clipped
    .map((message) => {
      const role = message.role.toUpperCase();
      const content = message.content.trim();
      if (!content) {
        return "";
      }
      return `[${role}]\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
};

const buildSystemPrompt = (settings: AgentRunSettingsSnapshot) => {
  const userPrompt = settings.systemPrompt.trim();
  const basePrompt = [
    "You are Echo Agent, a practical coding assistant integrated in an Electron desktop app.",
    "Prefer concise and actionable responses.",
    "Use Markdown when formatting is helpful.",
    "Confirm destructive operations before running them.",
    "Default language: Chinese; keep technical identifiers in their original form."
  ].join("\n");

  return userPrompt ? `${basePrompt}\n\n<user_system_prompt>\n${userPrompt}\n</user_system_prompt>` : basePrompt;
};

const formatEnvironmentSnapshot = (snapshot: EnvironmentSnapshot) =>
  JSON.stringify(snapshot, null, 2)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

export const buildAgentPrompt = ({
  settings,
  input,
  history,
  cwd,
  environmentSnapshot
}: BuildAgentPromptInput) => {
  const now = new Date().toLocaleString();
  const historyBlock = formatHistory(history);
  const environmentBlock = environmentSnapshot
    ? `environment_snapshot_json:\n${formatEnvironmentSnapshot(environmentSnapshot)}`
    : "environment_snapshot_json: null";
  const environmentAwarenessBlock = environmentSnapshot
    ? formatEnvironmentAwarenessBlock(environmentSnapshot)
    : "environment_awareness: null";
  const environmentGuidanceBlock = formatEnvironmentUsageGuidanceBlock();
  const runtimeContextBlock = `<runtime_context>\ncurrent_time: ${now}\nworking_directory: ${cwd}\nprovider: ${settings.providerName}\nmodel: ${settings.model}\n${environmentBlock}\n${environmentAwarenessBlock}\n${environmentGuidanceBlock}\n</runtime_context>`;

  console.info(
    `[agent][environment][injected]\n${environmentBlock}\n${environmentAwarenessBlock}\n${environmentGuidanceBlock}`
  );

  const segments = [buildSystemPrompt(settings), runtimeContextBlock];

  if (historyBlock) {
    segments.push(`<conversation_history>\n${historyBlock}\n</conversation_history>`);
  }

  segments.push(`<latest_user_input>\n${input.trim()}\n</latest_user_input>`);
  return segments.join("\n\n");
};
