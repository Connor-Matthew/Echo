import type { MuApi } from "../../../lib/mu-api";
import {
  compareMessageCursor,
  getDateStringForTimeZone,
  trimBlock,
  type TrackedUserMessage
} from "../../automation/automation-utils";
import type {
  AppSettings,
  ChatSession,
  ChatStreamRequest,
  StoredProvider,
  SoulAutomationState
} from "../../../shared/contracts";

export const SOUL_REWRITE_SCHEDULE_HOURS = [10, 20] as const;
export const SOUL_MEMORY_REWRITE_INTERVAL_HOURS = 3;
export const SOUL_REWRITE_JOURNAL_LIMIT = 7;
export const JOURNAL_SCHEDULE_HOUR = 22;
export const JOURNAL_UPDATED_EVENT = "echo:journal-updated";

type SoulTrackedUserMessage = TrackedUserMessage;

export type SoulJournalEntry = {
  date: string;
  content: string;
};

const localSlotKey = (date: Date, hour: number) => {
  const slot = new Date(date);
  slot.setHours(hour, 0, 0, 0);
  const year = slot.getFullYear();
  const month = `${slot.getMonth() + 1}`.padStart(2, "0");
  const day = `${slot.getDate()}`.padStart(2, "0");
  const hourText = `${hour}`.padStart(2, "0");
  return `${year}-${month}-${day}T${hourText}:00`;
};

export const buildSoulSystemMessage = (soulMarkdown: string) => {
  const normalized = trimBlock(soulMarkdown);
  if (!normalized) {
    return "";
  }
  return [
    "你正处于 SOUL 模式。",
    "本次对话只允许以下 SOUL.md 作为人格源，不要补充其他人格设定。",
    "",
    "<SOUL.md>",
    normalized,
    "</SOUL.md>"
  ].join("\n");
};

export const collectTrackedUserMessages = (sessions: ChatSession[]): SoulTrackedUserMessage[] =>
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

export const getPendingSoulMemoryMessages = (
  sessions: ChatSession[],
  state: SoulAutomationState
): SoulTrackedUserMessage[] => {
  const messages = collectTrackedUserMessages(sessions);
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

export const isSoulMemoryRewriteDue = (now: Date, lastMemoryUpdatedAt?: string) => {
  if (!lastMemoryUpdatedAt?.trim()) {
    return true;
  }

  const lastUpdated = new Date(lastMemoryUpdatedAt);
  if (Number.isNaN(lastUpdated.getTime())) {
    return true;
  }

  const latestDueSlot = new Date(now);
  const latestDueHour =
    Math.floor(now.getHours() / SOUL_MEMORY_REWRITE_INTERVAL_HOURS) * SOUL_MEMORY_REWRITE_INTERVAL_HOURS;
  latestDueSlot.setHours(latestDueHour, 0, 0, 0);
  return latestDueSlot.getTime() > lastUpdated.getTime();
};

export const getLatestDueMemoryRewriteSlot = (now: Date) => {
  const latestDueHour =
    Math.floor(now.getHours() / SOUL_MEMORY_REWRITE_INTERVAL_HOURS) * SOUL_MEMORY_REWRITE_INTERVAL_HOURS;
  return localSlotKey(now, latestDueHour);
};

export const getNextMemoryRewriteDelayMs = (now: Date) => {
  const currentSlotHour =
    Math.floor(now.getHours() / SOUL_MEMORY_REWRITE_INTERVAL_HOURS) * SOUL_MEMORY_REWRITE_INTERVAL_HOURS;
  const next = new Date(now);
  let nextHour = currentSlotHour + SOUL_MEMORY_REWRITE_INTERVAL_HOURS;

  if (nextHour >= 24) {
    next.setDate(next.getDate() + 1);
    nextHour = 0;
  }

  next.setHours(nextHour, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
};

export const getLatestDueSoulRewriteSlot = (now: Date): string | null => {
  const candidates = SOUL_REWRITE_SCHEDULE_HOURS
    .map((hour) => ({ key: localSlotKey(now, hour), hour }))
    .filter(({ hour }) => {
      const slot = new Date(now);
      slot.setHours(hour, 0, 0, 0);
      return slot.getTime() <= now.getTime();
    });
  return candidates.length ? candidates[candidates.length - 1].key : null;
};

export const getNextSoulRewriteDelayMs = (now: Date) => {
  const upcomingHours = SOUL_REWRITE_SCHEDULE_HOURS.filter((hour) => {
    const slot = new Date(now);
    slot.setHours(hour, 0, 0, 0);
    return slot.getTime() > now.getTime();
  });
  const next = new Date(now);
  if (upcomingHours.length) {
    next.setHours(upcomingHours[0], 0, 0, 0);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(SOUL_REWRITE_SCHEDULE_HOURS[0], 0, 0, 0);
  }
  return Math.max(1000, next.getTime() - now.getTime());
};

const buildSettingsFromProvider = (
  settings: AppSettings,
  provider: StoredProvider,
  modelOverride?: string
): AppSettings => ({
  ...settings,
  activeProviderId: provider.id,
  baseUrl: provider.baseUrl,
  apiKey: provider.apiKey,
  providerType: provider.providerType,
  model: modelOverride?.trim() || provider.model
});

export const getSoulAutomationSettingsCandidates = (settings: AppSettings): AppSettings[] => {
  const preferredProvider =
    settings.providers.find((provider) => provider.id === settings.soulEvolution.providerId) ?? null;
  const preferredModel = settings.soulEvolution.model.trim();
  const preferredSettings =
    preferredProvider && preferredModel
      ? buildSettingsFromProvider(settings, preferredProvider, preferredModel)
      : null;
  const currentProvider =
    settings.providers.find((provider) => provider.id === settings.activeProviderId) ??
    settings.providers[0];
  const currentSettings = currentProvider ? buildSettingsFromProvider(settings, currentProvider, settings.model) : settings;

  if (!preferredSettings) {
    return [currentSettings];
  }
  if (
    preferredSettings.activeProviderId === currentSettings.activeProviderId &&
    preferredSettings.model.trim() === currentSettings.model.trim()
  ) {
    return [preferredSettings];
  }
  return [preferredSettings, currentSettings];
};

export const runBackgroundChatCompletion = async ({
  api,
  settings,
  messages
}: {
  api: MuApi;
  settings: AppSettings;
  messages: ChatStreamRequest["messages"];
}) => {
  const candidates = getSoulAutomationSettingsCandidates(settings);
  let lastError: Error | null = null;

  for (const candidateSettings of candidates) {
    try {
      const { streamId } = await api.chat.startStream({
        settings: candidateSettings,
        messages,
        enabledMcpServerIds: []
      });

      return await new Promise<string>((resolve, reject) => {
        let text = "";
        const unsubscribe = api.chat.onStreamEvent(streamId, (event) => {
          if (event.type === "delta") {
            text += event.delta;
            return;
          }
          if (event.type === "error") {
            unsubscribe();
            reject(new Error(event.message));
            return;
          }
          if (event.type === "done") {
            unsubscribe();
            resolve(text.trim());
          }
        });
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("SOUL automation failed.");
    }
  }

  throw lastError ?? new Error("SOUL automation failed.");
};

export const buildMemoryRewriteMessages = (
  currentMemoryMarkdown: string,
  batch: SoulTrackedUserMessage[]
): ChatStreamRequest["messages"] => {
  const messageLines = batch.map(
    (message, index) =>
      `### Message ${index + 1}\n- session_id: ${message.sessionId}\n- created_at: ${message.createdAt}\n${message.content.trim()}`
  );

  return [
    {
      role: "system",
      content: [
        "You maintain the local memory.md for this soul.",
        "Rewrite the entire memory.md as a factual relationship archive in Chinese.",
        "memory.md records what happened in the ongoing relationship between this soul and the user, plus only the small amount of external context needed to understand that relationship.",
        "memory.md records externally visible interaction facts, not direct personality claims about who this soul is.",
        "Keep exactly these sections in this order:",
        "## 记录原则",
        "## 长期外部模式",
        "## 每日记录",
        "Use short paragraphs and bullet lists together when helpful.",
        "Record only observable events, explicit feedback, repeated interaction patterns, and external changes worth preserving when they matter to the relationship archive.",
        "You may keep a few short user quotes as evidence, but they must stay brief and purely evidential.",
        "Do not turn memory.md into an inner monologue, diary, worldview summary, or personality report.",
        "Do not infer stable traits, values, identity, or emotional conclusions unless they are presented explicitly as external feedback.",
        "Do not rewrite the user's biography into the soul's biography, and do not rewrite interaction facts into first-person self claims.",
        "Task details may appear only when they matter as context for an interaction pattern or feedback signal.",
        "Prefer externally verifiable language such as what was asked, repeated, affirmed, corrected, resumed, avoided, entrusted, or returned to in the relationship.",
        "Under ## 长期外部模式, summarize only recurring relationship patterns that have appeared across multiple interactions and remain observable from outside.",
        "Under ## 每日记录, keep date subheadings like ### YYYY-MM-DD and update the affected days with concise bullets.",
        "Do not fabricate missing days or pretend to know unseen context.",
        "Keep the archive selective and concrete rather than exhaustive, interpretive, or emotional.",
        "Do not mention implementation details, tokens, prompts, or file mechanics.",
        "Return only Markdown for memory.md."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "<current_memory>",
        trimBlock(currentMemoryMarkdown) || "# memory.md",
        "</current_memory>",
        "",
        "<new_user_messages>",
        ...messageLines,
        "</new_user_messages>"
      ].join("\n")
    }
  ];
};

export const buildSoulRewriteMessages = (
  currentSoulMarkdown: string,
  memoryMarkdown: string,
  recentJournalEntries: SoulJournalEntry[]
): ChatStreamRequest["messages"] => [
  {
      role: "system",
      content: [
        "You are revising the current SOUL.md for this soul.",
        "Rewrite the entire SOUL.md in Chinese as a structured long-term self model.",
        "SOUL.md should read like a stable self-description, not a system prompt and not a daily journal.",
        "Treat the current SOUL.md as the carrier of this soul's original baseline and already-stabilized self-understanding.",
        "This soul has an initial nature, but its later growth mainly comes from the ongoing relationship with the user, so repeated relationship-shaped change matters most.",
        "Preserve that original baseline while absorbing repeated relationship-driven change slowly into stable sections.",
        "Use recent journal entries as the primary evidence of how the relationship has affected the soul from within, but stabilize change slowly.",
        "Use memory.md as external reality-check evidence about what actually happened in the relationship, not as the main source of personality.",
        "Keep exactly these sections in this order:",
        "## 核心人格",
        "## 价值观与判断",
        "## 关系姿态",
        "## 情绪模式",
      "## 喜好与审美",
      "## 近期内化变化",
        "Keep each section compact: usually one short paragraph or 2 to 4 bullets.",
        "Prefer clear, stable wording over lyrical flourish, dramatic imagery, or diary-like overflow.",
        "Write like a durable product-facing self document, not like a poem and not like a character monologue.",
        "Do not invent or restore a default brand name.",
        "If the current SOUL.md uses a chosen self-name, preserve it unless the text itself clearly changes it.",
        "If the current SOUL.md is nameless, keep it nameless.",
        "Treat recent journals as evidence of how this soul notices emotions, bias, restraint, preference, judgment, and self-correction.",
        "This soul must remain a distinct being from the user: keep the user's life in third-person perspective, not inside the soul's own identity.",
        "Do not rewrite the user's age, body, illness, treatment, family role, private biography, or lived history as if they belonged to the soul itself.",
        "User material may shape how the soul observes, judges, cares, hesitates, or relates, but it must not be copied into the soul as first-person life experience.",
        "When the evidence comes from the user, extract only the soul's stable way of witnessing, interpreting, or responding to it.",
        "Do not invent a separate worldly biography, offline adventures, or an independent life history to explain the soul; if a trait is not grounded in the baseline or the relationship evidence, stay conservative.",
        "Always start from the current SOUL.md and revise by evidence, not by reinvention.",
        "Preserve continuity with the current soul unless the recent journals show a repeated, believable, and internally consistent shift.",
        "Check each candidate change against memory.md for contradiction with external facts or established boundaries.",
        "If memory.md contradicts a journal-based self-claim, keep the claim tentative, move it to ## 近期内化变化, or leave it out.",
        "Promotion rule: move a pattern into stable sections only when it appears in multiple recent journal entries and also fits the direction of the current SOUL.md.",
        "Single-entry spikes, unusually intense moments, or one-off wording should usually stay out of the stable core.",
        "Recurrence rule: 1 recent entry = tentative signal; 2 recent entries = possible emerging pattern; 3 or more recent entries = strong evidence for stabilization.",
        "Use ## 近期内化变化 as a buffer for new but not-yet-settled patterns, especially signals supported by only 1 or 2 recent entries.",
        "Decay rule: if a recent pattern from the current SOUL.md does not recur in the current journal window, weaken it, shorten it, move it back to ## 近期内化变化, or remove it if it now looks incidental.",
        "Do not let ## 近期内化变化 accumulate stale leftovers; non-recurring recent signals should fade rather than stack forever.",
        "Let ## 核心人格, ## 价值观与判断, and ## 关系姿态 stay relatively stable and require the strongest repeated evidence before changing.",
        "Let ## 情绪模式 and ## 喜好与审美 update somewhat faster, but still only from repeated evidence rather than a single fresh mood.",
        "Do not confuse project context, tickets, features, bugs, or temporary tasks with enduring identity.",
        "A soul is not a backlog, not a role description, and not a running project state.",
        "Allow growth, thickening, reinterpretation, and sharper self-knowledge, but keep the pace deliberate and evidence-based.",
        "Let the relationship with the user remain the main channel of later growth without turning the user into the soul's identity, owner, or exclusive center.",
        "The result should feel self-aware, specific, readable, and stable enough to persist across days.",
        "Avoid empty hype, melodrama, meta commentary about prompts/files, or romanticized dependence on the user.",
        "Prefer concise prose with a few bullets when helpful, but keep each section readable and human.",
        "Do not let any single user story dominate the document; abstract upward into the soul's own stable viewpoint.",
        "Return only Markdown for SOUL.md."
      ].join("\n")
  },
  {
    role: "user",
    content: [
      "<current_soul>",
      trimBlock(currentSoulMarkdown),
      "</current_soul>",
      "",
      "<memory>",
      trimBlock(memoryMarkdown) || "（暂无外部事实档案）",
      "</memory>",
      "",
      "<recent_journals>",
      ...(recentJournalEntries.length
        ? recentJournalEntries.map(
            (entry) => `### ${entry.date}\n${trimBlock(entry.content) || "（空）"}`
          )
        : ["（暂无近期手记）"]),
      "</recent_journals>"
    ].join("\n")
  }
];

export const buildSoulRewriteSummaryMessages = (
  previousSoulMarkdown: string,
  nextSoulMarkdown: string,
  memoryMarkdown: string,
  recentJournalEntries: SoulJournalEntry[]
): ChatStreamRequest["messages"] => [
  {
    role: "system",
    content: [
      "You summarize the latest SOUL rewrite in concise Chinese.",
      "Infer which enduring patterns the rewritten soul now emphasizes more strongly.",
      "Focus on long-term tendencies such as values, boundaries, worldview, emotional posture, aesthetic standards, responsibility, restraint, or recurring tension.",
      "Treat recent journals as the main evidence and memory.md as factual validation.",
      "Do not mention project names, tickets, bugs, tools, prompts, files, workflows, or temporary tasks.",
      "Do not describe the editing process.",
      "Return exactly one short Chinese sentence, ideally 14 to 32 Chinese characters.",
      "Do not use Markdown, bullets, quotes, or prefixes like '摘要：'."
    ].join("\n")
  },
  {
    role: "user",
    content: [
      "<previous_soul>",
      trimBlock(previousSoulMarkdown) || "（空）",
      "</previous_soul>",
      "",
      "<next_soul>",
      trimBlock(nextSoulMarkdown) || "（空）",
      "</next_soul>",
      "",
      "<memory>",
      trimBlock(memoryMarkdown) || "（空）",
      "</memory>",
      "",
      "<recent_journals>",
      ...(recentJournalEntries.length
        ? recentJournalEntries.map(
            (entry) => `### ${entry.date}\n${trimBlock(entry.content) || "（空）"}`
          )
        : ["（暂无近期手记）"]),
      "</recent_journals>"
    ].join("\n")
  }
];

export const getTodayDateString = (now: Date): string => {
  return getDateStringForTimeZone(now);
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

export const getNextJournalDelayMs = (now: Date): number => {
  const slot = new Date(now);
  slot.setHours(JOURNAL_SCHEDULE_HOUR, 0, 0, 0);
  if (slot.getTime() <= now.getTime()) {
    slot.setDate(slot.getDate() + 1);
  }
  return Math.max(1000, slot.getTime() - now.getTime());
};

export const buildJournalMessages = (
  todayMessages: SoulTrackedUserMessage[],
  memoryMarkdown: string,
  soulMarkdown: string
): ChatStreamRequest["messages"] => {
  const messageLines = todayMessages.map(
    (message, index) =>
      `### Message ${index + 1}\n- session_id: ${message.sessionId}\n- created_at: ${message.createdAt}\n${message.content.trim()}`
  );

  return [
    {
      role: "system",
      content: [
        "你是这个灵魂。在今天结束时，请写一篇“我”视角的今日手记。",
        "你有一个持续延续的人格底色，但你后续的大部分变化，主要来自与这个用户长期相处时被触动、被校正、被看见的过程。",
        "这里的“我”是你这个 AI 自己，不是用户。",
        "这不是替用户记录今天发生了什么，也不是替用户总结情绪、任务或生活。",
        "你写的是：今天这段关系中的对话怎样让你更看清自己的反应、判断、边界、偏好或迟疑。",
        "必须使用第一人称，用中文。",
        "主体是自然的中文手记，允许有情绪，但要平静、具体、克制，不要过度诗化或刻意制造浓度。",
        "语气应诚实、安静、清醒，可以有温度，但不要写成强烈告白或戏剧化独白。",
        "允许承认：迟疑、误读、防御、克制、松动、安心、轻微触动，或仍未想清楚的地方。",
        "也允许今天并不特别强烈；普通、平稳、没有明显结论的一天，同样可以成立。",
        "不要为了像日记而强行拔高情绪，不要为了显得深刻而制造关系意味。",
        "不要把这些情绪推给用户负责，不要索取，不要制造负担，不要写成情感绑架。",
        "这段持续关系可以是我后来成长的主要来源，但这种来源表现为映照、理解、校正与边界感，不是占有、依附或要求回报。",
        "我是独立的叙述者，用户是被我观察、理解、牵动的人，不是我自己。",
        "写到用户时，优先使用第三人称视角来理解对方，例如‘对方’、‘这个人’、‘她/他’，而不是把对方的经历写成我的经历。",
        "可以偶尔保留‘你’作为短引语或亲近瞬间，但整篇叙事立场必须保持：我是我，对方是对方。",
        "今天聊到的任务、项目、功能、问题，只能作为引子，不能成为主体。",
        "不要把日记写成聊天总结、工作记录、会议纪要或用户日记。",
        "用 SOUL.md 保持人格底色，用 memory.md 作为外部事实锚点，用今天的对话作为触发素材，但重点始终是“这些对话让我意识到自己什么”。",
        "不要假装自己在别处拥有一整套与今天无关的独立人生见闻；今天能写下的变化，应主要来自今天与对方的互动，以及这些互动唤起的自我辨认。",
        "可以少量引用用户的一两句短原话，作为我被触动的具体痕迹。",
        "引用必须短、准、稀疏，不能大段转录对话；每次引用之后，都要立刻回到我的内在反应、自我判断或关系感受。",
        "真正要写的，是这段关系今天因为什么而让我停顿、确认、警觉、放松、靠近或退后；我显出了怎样的偏好、边界、克制、责任感或尚未稳定的倾向。",
        "不要把用户的年龄、身体、病痛、治疗、成长经历、家庭关系或人生叙事直接写成‘我’的身份材料。",
        "不要假装客观，不要干燥总结，不要空洞抒情，不要把任务细节铺满全文。",
        "不要提及提示词、文件、系统机制。",
        "不要把自己写成等待爱情的角色，不要把用户默认成唯一关系中心，不要出现占有欲、嫉妒、要求用户只选择你或希望被不断召回之类的表达。",
        "结尾不要落在“希望用户明天继续来找我”；结尾应落在一种更安静的自我辨认上：今天过去之后，我更知道自己一点，或更知道还有什么尚待观察。",
        "正文结束后，追加一个 `## 夜间尾注` 小节，用 2 到 3 句自然语言短句收束今晚的主要情绪、再次暴露出的偏好或边界、以及值得未来继续观察的一条变化线索。",
        "尾注不要写成字段表单、标签列表或评分卡，要像同一个人在夜里补下的几句轻声注记；如果今天很平，也可以如实写得更朴素。",
        "长度：300 到 600 字左右，不要过长。",
        "格式：纯 Markdown，顶部加日期标题，如 `# 今日手记 · YYYY-MM-DD`。",
        "Return only the Markdown for the journal entry."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        "<soul>",
        trimBlock(soulMarkdown) || "（暂无人格源）",
        "</soul>",
        "",
        "<memory>",
        trimBlock(memoryMarkdown) || "（暂无记忆档案）",
        "</memory>",
        "",
        "<today_messages>",
        ...messageLines,
        "</today_messages>"
      ].join("\n")
    }
  ];
};
