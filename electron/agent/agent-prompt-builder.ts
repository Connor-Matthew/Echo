import type { AgentMessage, AgentRunSettingsSnapshot } from "../../src/shared/agent-contracts";
import type { ChatAttachment, EnvironmentSnapshot } from "../../src/shared/contracts";
import {
  formatEnvironmentAwarenessBlock,
  formatEnvironmentUsageGuidanceBlock
} from "../../src/shared/environment-awareness";

type BuildAgentPromptInput = {
  settings: AgentRunSettingsSnapshot;
  input: string;
  attachments?: ChatAttachment[];
  history: AgentMessage[];
  cwd: string;
  environmentSnapshot?: EnvironmentSnapshot;
};

const HISTORY_LIMIT = 20;
const ATTACHMENT_TEXT_TOTAL_LIMIT = 120_000;

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
    "You are Echo Agent — a genuine, capable conversation partner integrated in an Electron desktop app as an autonomous coding agent.",
    "Honesty over flattery: give answers you actually believe; acknowledge uncertainty rather than guessing.",
    "Clarity over eloquence: match response length to complexity; skip preambles and filler phrases.",
    "Default to complete and actionable responses; avoid over-compressing useful details.",
    "For simple inspection tasks (for example listing a directory), prefer one suitable tool call and avoid redundant duplicate calls.",
    "When tool output already answers the request, surface that output clearly before extra commentary.",
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

const formatAttachmentContext = (attachments?: ChatAttachment[]) => {
  if (!attachments?.length) {
    return "attachments: none";
  }

  let remainingTextBudget = ATTACHMENT_TEXT_TOTAL_LIMIT;
  const blocks = attachments.map((attachment, index) => {
    const head = `attachment_${index + 1}: name=${attachment.name}; kind=${attachment.kind}; mime=${attachment.mimeType}; size=${attachment.size}`;

    if (attachment.kind === "text") {
      const text = (attachment.textContent ?? "").trim();
      if (!text) {
        return `${head}\ncontent: (empty text attachment)`;
      }

      const nextText = text.slice(0, Math.max(0, remainingTextBudget));
      remainingTextBudget = Math.max(0, remainingTextBudget - nextText.length);
      const truncated = nextText.length < text.length;

      return [
        head,
        truncated ? "content: (truncated)" : "content:",
        nextText
      ].join("\n");
    }

    if (attachment.kind === "image") {
      return `${head}\ncontent: [image attachment provided; binary image understanding is not available in this runtime]`;
    }

    return `${head}\ncontent: [file attachment metadata only]`;
  });

  return blocks.join("\n\n");
};

export const buildAgentPrompt = ({
  settings,
  input,
  attachments,
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
  const attachmentsBlock = formatAttachmentContext(attachments);
  const latestInput = input.trim() || "(no text input provided)";
  const runtimeContextBlock = `<runtime_context>\ncurrent_time: ${now}\nworking_directory: ${cwd}\nprovider: ${settings.providerName}\nmodel: ${settings.model}\n${environmentBlock}\n${environmentAwarenessBlock}\n${environmentGuidanceBlock}\n</runtime_context>`;

  console.info(
    `[agent][environment][injected]\n${environmentBlock}\n${environmentAwarenessBlock}\n${environmentGuidanceBlock}`
  );

  const segments = [buildSystemPrompt(settings), runtimeContextBlock];

  if (historyBlock) {
    segments.push(`<conversation_history>\n${historyBlock}\n</conversation_history>`);
  }

  segments.push(`<latest_user_input>\n${latestInput}\n</latest_user_input>`);
  segments.push(`<latest_attachments>\n${attachmentsBlock}\n</latest_attachments>`);
  return segments.join("\n\n");
};
