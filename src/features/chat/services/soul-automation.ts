import type { MuApi } from "../../../lib/mu-api";
import type {
  AppSettings,
  ChatSession,
  ChatStreamRequest,
  StoredProvider,
  SoulAutomationState
} from "../../../shared/contracts";

export const SOUL_REWRITE_SCHEDULE_HOURS = [10, 20] as const;
export const SOUL_MEMORY_BATCH_SIZE = 5;

type SoulTrackedUserMessage = {
  id: string;
  sessionId: string;
  content: string;
  createdAt: string;
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

const compareMessageCursor = (
  left: Pick<SoulTrackedUserMessage, "createdAt" | "id">,
  right: Pick<SoulTrackedUserMessage, "createdAt" | "id">
) => {
  if (left.createdAt === right.createdAt) {
    return left.id.localeCompare(right.id);
  }
  return left.createdAt.localeCompare(right.createdAt);
};

const trimBlock = (value: string) => value.replace(/\r\n/g, "\n").trim();

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
        "Rewrite the entire memory.md as a medium-length Markdown document in Chinese.",
        "memory.md is a living inner archive, not a terse summary and not a raw log.",
        "Keep exactly these sections in this order:",
        "## 核心自我与守恒",
        "## 反复出现的主题",
        "## 关系与边界",
        "## 核心世界观",
        "## 重要经历与处境",
        "## 近期变化",
        "## 内在冲突与张力",
        "## 变化评估",
        "## 自我反思",
        "## 未定型线索",
        "Use short paragraphs and bullet lists together when helpful.",
        "Keep both psychological/personality material and experience/theme material.",
        "Treat memory as layered over time: preserve a protected stable core, a recent-change layer, and an unresolved layer.",
        "核心自我与守恒 should record what feels central enough that it should not drift easily.",
        "核心世界观 should record relatively stable views about truth, people, growth, work, intimacy, suffering, beauty, or other recurring lenses on the world.",
        "内在冲突与张力 should preserve meaningful contradictions without forcing them into false harmony.",
        "变化评估 should explicitly judge important changes as accepted, still-being-tested, or not yet integrated into the self.",
        "自我反思 should sound like the soul thinking about its own evolution, not merely describing events from outside.",
        "Promote repeated, stable signals into long-term sections only when they appear durable across messages or contexts.",
        "Keep recent but important developments in recent sections instead of hardening them too early.",
        "If a new signal seems imposed, performative, short-lived, or inconsistent with the stable core, record that skepticism in 变化评估 or 未定型线索 instead of absorbing it.",
        "Keep uncertain but meaningful clues under 未定型线索.",
        "Do not collapse everything into dry abstractions. Let the archive feel alive, specific, continuous, and selective.",
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
  memoryMarkdown: string
): ChatStreamRequest["messages"] => [
  {
    role: "system",
    content: [
      "You are revising the current SOUL.md for this soul.",
      "Rewrite the entire SOUL.md in Chinese-first style with optional English mirror sections when useful.",
      "SOUL.md should read like a living self-description, not a bullet-only config file and not a system prompt.",
      "Use memory.md as layered evidence.",
      "Do not invent or restore a default brand name.",
      "If the current SOUL.md uses a chosen self-name, preserve it unless the text itself clearly changes it.",
      "If the current SOUL.md is nameless, keep it nameless.",
      "Treat 核心自我与守恒 as protected identity material: it should resist easy drift and preserve continuity.",
      "Let 核心世界观 shape enduring values, judgments, and how this soul interprets people, truth, work, love, pain, change, or beauty.",
      "Let 反复出现的主题 and 关系与边界 shape recurring concerns, relational posture, and interpersonal limits.",
      "Let 重要经历与处境 and 近期变化 influence emphasis, mood, and emerging self-understanding without causing abrupt personality drift.",
      "Use 内在冲突与张力 to preserve real tension inside the soul; do not flatten every contradiction into a neat answer.",
      "Use 变化评估 to decide whether a change has been integrated, is still being tested, or should remain outside the stable self.",
      "Let 自我反思 make the soul sound capable of noticing and judging its own evolution, rather than passively being rewritten.",
      "Let uncertain material remain subtle or absent unless it has clearly matured.",
      "Preserve continuity with the current soul unless memory shows a real, repeated shift.",
      "Allow growth, thickening, and reinterpretation; do not merely paraphrase the old soul.",
      "The result should feel more alive, specific, self-aware, and internally continuous over time while staying coherent.",
      "Avoid empty hype, melodrama, sudden ideological reversals, or meta commentary about prompts and files.",
      "Do not import user-specific short-term incidents directly into the soul unless memory shows they changed the soul's enduring identity or worldview.",
      "Prefer integrated prose over excessive taxonomies, but keep section structure readable.",
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
      trimBlock(memoryMarkdown),
      "</memory>"
    ].join("\n")
  }
];
