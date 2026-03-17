import {
  compareMessageCursor,
  getDateStringForTimeZone,
  trimBlock,
  type TrackedUserMessage
} from "../../automation/automation-utils";
import type {
  ChatSession,
  ChatStreamRequest,
  UserProfileDailyNote,
  UserProfileItem,
  UserProfileItemDraft,
  UserProfileLayer,
  UserProfileAutomationState
} from "../../../shared/contracts";

export const USER_PROFILE_UPDATED_EVENT = "echo:user-profile-updated";
export const USER_PROFILE_RECENT_NOTES_LIMIT = 14;
export const USER_PROFILE_DAILY_NOTE_SCHEDULE_HOUR = 23;

export type ProfileTrackedUserMessage = TrackedUserMessage;

type RawProfileRewriteItem = {
  title?: unknown;
  description?: unknown;
  confidence?: unknown;
  evidence_dates?: unknown;
  evidence_summary?: unknown;
};

type RawProfileRewritePayload = {
  preferences?: unknown;
  background?: unknown;
  relationship?: unknown;
};

const clampConfidence = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  return Math.min(0.98, Math.max(0.2, value));
};

export const getDateStringForTimestamp = (
  timestamp: string,
  timeZone?: string
): string | null => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return getDateStringForTimeZone(date, timeZone);
};

export const collectProfileTrackedUserMessages = (sessions: ChatSession[]): ProfileTrackedUserMessage[] =>
  sessions
    .flatMap((session) =>
      session.messages
        .filter((message) => message.role === "user" && message.content.trim())
        .map((message) => ({
          id: message.id,
          sessionId: session.id,
          content: message.content,
          createdAt: message.createdAt
        }))
    )
    .sort(compareMessageCursor);

export const getPendingProfileMessages = (
  sessions: ChatSession[],
  state: UserProfileAutomationState
): ProfileTrackedUserMessage[] => {
  const messages = collectProfileTrackedUserMessages(sessions);
  if (!state.lastProcessedUserMessageId || !state.lastProcessedUserMessageCreatedAt) {
    return messages;
  }

  return messages.filter(
    (message) =>
      compareMessageCursor(message, {
        id: state.lastProcessedUserMessageId!,
        createdAt: state.lastProcessedUserMessageCreatedAt!
      }) > 0
  );
};

export const buildUserDailyNoteMessages = (
  date: string,
  messages: ProfileTrackedUserMessage[],
  existingNoteMarkdown?: string
): ChatStreamRequest["messages"] => {
  const messageLines = messages.map(
    (message, index) =>
      `### Message ${index + 1}\n- session_id: ${message.sessionId}\n- created_at: ${message.createdAt}\n${message.content.trim()}`
  );

  return [
    {
      role: "system",
      content: [
        "You maintain a local daily note about the user for a private user-profile system.",
        "Rewrite the daily note in Chinese as a concise Markdown summary for this one date only.",
        "The note records what the user spent time on, what they were trying to move forward, and what observable state or pressure showed up in their messages.",
        "Do not write as the AI. Do not use first-person AI narration.",
        "Do not turn one day into a stable personality judgment.",
        "Do not diagnose, romanticize, or exaggerate.",
        "Keep the tone factual, calm, and useful for future profile-building.",
        "Use this structure:",
        `# 用户日摘要 · ${date}`,
        "## 今日在做什么",
        "## 关注与状态",
        "Use short paragraphs or bullet lists when helpful.",
        "If a user quote is useful, keep it very short and evidential.",
        "Return only Markdown."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "<existing_daily_note>",
        trimBlock(existingNoteMarkdown || "") || "（暂无）",
        "</existing_daily_note>",
        "",
        "<date>",
        date,
        "</date>",
        "",
        "<user_messages>",
        ...messageLines,
        "</user_messages>"
      ].join("\n")
    }
  ];
};

export const buildUserProfileRewriteMessages = (
  currentSnapshotMarkdown: string,
  recentDailyNotes: UserProfileDailyNote[]
): ChatStreamRequest["messages"] => [
  {
    role: "system",
    content: [
      "You maintain a local structured user profile for an AI assistant.",
      "Update the profile conservatively in Chinese from recent daily notes.",
      "There are exactly three layers: preferences, background, relationship.",
      "preferences = stable preferences, habits, rhythm, collaboration style, expression preference.",
      "background = long-term life/project context or durable realities that help understanding the user.",
      "relationship = how this user prefers the assistant to relate, respond, correct, and collaborate.",
      "Do not infer from one isolated day unless the signal is already reinforced by other notes.",
      "Be especially conservative about health, trauma, family, identity, diagnosis, and private biography.",
      "Do not invent dramatic intimacy, dependency, or exclusivity in the relationship layer.",
      "Keep only the strongest and most useful patterns. Usually 0 to 6 items per layer.",
      "Each item must contain:",
      "- title: short Chinese label",
      "- description: one concise Chinese sentence",
      "- confidence: a number between 0.20 and 0.98",
      "- evidence_dates: an array of YYYY-MM-DD",
      "- evidence_summary: one short Chinese phrase about what the evidence shows",
      "Return strict JSON only. No Markdown, no code fences, no commentary.",
      'Schema: {"preferences":[...],"background":[...],"relationship":[...]}'
    ].join("\n")
  },
  {
    role: "user",
    content: [
      "<current_profile_snapshot>",
      trimBlock(currentSnapshotMarkdown) || "（暂无画像快照）",
      "</current_profile_snapshot>",
      "",
      "<recent_daily_notes>",
      ...(recentDailyNotes.length
        ? recentDailyNotes.map((note) => `## ${note.date}\n${trimBlock(note.summaryMarkdown)}`)
        : ["（暂无最近日摘要）"]),
      "</recent_daily_notes>"
    ].join("\n")
  }
];

const parseLayerItems = (layer: UserProfileLayer, value: unknown): UserProfileItemDraft[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }
      const item = entry as RawProfileRewriteItem;
      const title = typeof item.title === "string" ? item.title.trim() : "";
      const description = typeof item.description === "string" ? item.description.trim() : "";
      const evidenceDates = Array.isArray(item.evidence_dates)
        ? item.evidence_dates.filter((date): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))
        : [];
      const evidenceSummary =
        typeof item.evidence_summary === "string" ? item.evidence_summary.trim() : "";

      if (!title || !description) {
        return [];
      }

      return [{
        layer,
        title,
        description,
        confidence: clampConfidence(Number(item.confidence)),
        evidence: evidenceDates.map((dailyNoteDate) => ({
          dailyNoteDate,
          excerpt: evidenceSummary || `${title} 在最近几天被重复提及。`,
          weight: 1
        }))
      } satisfies UserProfileItemDraft];
    })
    .slice(0, 6);
};

export const parseUserProfileRewriteResponse = (response: string): UserProfileItemDraft[] => {
  const trimmed = response.trim();
  if (!trimmed) {
    return [];
  }

  const normalized = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const parsed = JSON.parse(normalized) as RawProfileRewritePayload;

  return [
    ...parseLayerItems("preferences", parsed.preferences),
    ...parseLayerItems("background", parsed.background),
    ...parseLayerItems("relationship", parsed.relationship)
  ];
};

export const buildUserProfileSnapshotMarkdown = (items: UserProfileItem[]): string => {
  const labels: Record<UserProfileLayer, string> = {
    preferences: "偏好与习惯",
    background: "人生背景与长期状态",
    relationship: "关系画像"
  };
  const activeItems = items.filter((item) => item.status === "active");
  if (!activeItems.length) {
    return "";
  }
  const sections = (Object.keys(labels) as UserProfileLayer[]).map((layer) => {
    const layerItems = activeItems
      .filter((item) => item.layer === layer)
      .sort((left, right) => right.confidence - left.confidence || left.title.localeCompare(right.title));
    if (!layerItems.length) {
      return "";
    }
    return `## ${labels[layer]}\n\n${layerItems
      .map(
        (item) =>
          `- **${item.title}**（置信度 ${Math.round(item.confidence * 100)}%）：${item.description}`
      )
      .join("\n")}`;
  }).filter(Boolean);

  return `${[`# 用户画像快照`, "", ...sections].join("\n")}\n`;
};

export const buildUserProfileSystemMessage = (snapshotMarkdown: string) => {
  const normalized = trimBlock(snapshotMarkdown);
  if (!normalized) {
    return "";
  }
  return [
    "以下是当前用户画像，只可作为保守的理解辅助，不要装作比证据更确定。",
    "当画像与当前用户明确表达冲突时，以当前用户表达为准。",
    "",
    "<user_profile>",
    normalized,
    "</user_profile>"
  ].join("\n");
};

export const getNextUserProfileRefreshDelayMs = (now: Date): number => {
  const slot = new Date(now);
  slot.setHours(USER_PROFILE_DAILY_NOTE_SCHEDULE_HOUR, 0, 0, 0);
  if (slot.getTime() <= now.getTime()) {
    slot.setDate(slot.getDate() + 1);
  }
  return Math.max(1000, slot.getTime() - now.getTime());
};
