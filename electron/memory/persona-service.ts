import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  PersonaEmotionTrend,
  PersonaIngestPayload,
  PersonaIngestResult,
  PersonaInjectionPayload,
  PersonaPreference,
  PersonaProfile,
  PersonaRecentEvent,
  PersonaSnapshot,
  PersonaSyncWarning,
  PersonaUndoIngestPayload,
  PersonaUndoIngestResult
} from "../../src/shared/contracts";

const PERSONA_DIR_SEGMENTS = [".echo", "memory"] as const;
const PERSONA_JSON_FILENAME = "persona.json";
const PERSONA_MARKDOWN_FILENAME = "persona.md";
const PERSONA_OPERATIONS_FILENAME = "persona-operations.json";
const FALLBACK_STORE_DIR = "store";
const AUTO_REFRESH_EVERY_TURNS = 10;
const AUTO_REFRESH_MIN_INTERVAL_MS = 3 * 60 * 1000;
const MAX_STABLE_PREFERENCES = 24;
const MAX_RECENT_EVENTS = 12;
const MAX_PERSONA_OPERATIONS = 100;
const INJECTION_MAX_PREFERENCES = 2;
const INJECTION_MAX_EVENTS = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EMOTION_WINDOW_DAYS = 7;

type PersonaPaths = {
  dir: string;
  jsonPath: string;
  markdownPath: string;
  operationsPath: string;
};

type SectionMap = Record<string, { lines: string[]; startLine: number }>;

type PersonaEntityChange<T> = {
  id: string;
  before: T | null;
  after: T | null;
};

type PersonaOperationRecord = {
  operationId: string;
  observedAt: string;
  createdAt: string;
  preferenceChanges: PersonaEntityChange<PersonaPreference>[];
  eventChanges: PersonaEntityChange<PersonaRecentEvent>[];
};

const nowIso = () => new Date().toISOString();

const toTrimmedText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const clampConfidence = (value: unknown, fallback = 0.5) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
};

const sanitizeDate = (value: string, fallback: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;

const safeDate = (iso: string) => {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
};

const normalizePreferenceId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "pref";

const normalizeEventId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "event";

const toTrendLabel = (trend: PersonaEmotionTrend) => {
  switch (trend) {
    case "stable":
      return "平稳";
    case "positive":
      return "积极";
    case "low":
      return "低落";
    case "volatile":
      return "波动";
    default:
      return "未知";
  }
};

const fromTrendLabel = (raw: string): PersonaEmotionTrend => {
  const value = raw.trim().toLowerCase();
  if (value === "stable" || value === "平稳") {
    return "stable";
  }
  if (value === "positive" || value === "积极") {
    return "positive";
  }
  if (value === "low" || value === "低落") {
    return "low";
  }
  if (value === "volatile" || value === "波动") {
    return "volatile";
  }
  return "unknown";
};

const createDefaultProfile = (): PersonaProfile => ({
  version: 1,
  sourceMode: "soul",
  updatedAt: nowIso(),
  identityHint: "",
  communicationStyle: {
    tone: "",
    length: "",
    taboo: []
  },
  stablePreferences: [],
  emotionTrend7d: {
    trend: "unknown",
    confidence: 0,
    evidenceCount: 0,
    note: ""
  },
  recentEvents: [],
  boundaries: {
    avoidTopics: [],
    sensitiveHandling: "Ask for confirmation before using sensitive inferences."
  },
  manualNotes: "",
  counters: {
    ingestedUserMessages: 0,
    pendingAutoRefresh: false
  },
  emotionSignals: []
});

const normalizePreference = (value: unknown): PersonaPreference | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Partial<PersonaPreference>;
  const text = toTrimmedText(source.text);
  if (!text) {
    return null;
  }
  const id = toTrimmedText(source.id) || normalizePreferenceId(text);
  return {
    id,
    text,
    confidence: clampConfidence(source.confidence, 0.6),
    lastSeen: sanitizeDate(toTrimmedText(source.lastSeen), safeDate(nowIso())),
    evidenceCount:
      typeof source.evidenceCount === "number" && Number.isFinite(source.evidenceCount)
        ? Math.max(1, Math.round(source.evidenceCount))
        : 1
  };
};

const normalizeRecentEvent = (value: unknown): PersonaRecentEvent | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Partial<PersonaRecentEvent>;
  const text = toTrimmedText(source.text);
  if (!text) {
    return null;
  }
  const id = toTrimmedText(source.id) || normalizeEventId(text);
  return {
    id,
    text,
    date: sanitizeDate(toTrimmedText(source.date), safeDate(nowIso())),
    confidence: clampConfidence(source.confidence, 0.58)
  };
};

const normalizeProfile = (candidate: unknown): PersonaProfile => {
  const fallback = createDefaultProfile();
  if (!candidate || typeof candidate !== "object") {
    return fallback;
  }

  const source = candidate as Partial<PersonaProfile>;
  const stablePreferences = Array.isArray(source.stablePreferences)
    ? source.stablePreferences.map(normalizePreference).filter((entry): entry is PersonaPreference => Boolean(entry))
    : [];
  const recentEvents = Array.isArray(source.recentEvents)
    ? source.recentEvents.map(normalizeRecentEvent).filter((entry): entry is PersonaRecentEvent => Boolean(entry))
    : [];

  const emotionSignals = Array.isArray(source.emotionSignals)
    ? source.emotionSignals
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          const signal = entry as { score?: unknown; capturedAt?: unknown };
          const score =
            signal.score === -1 || signal.score === 0 || signal.score === 1 ? signal.score : null;
          if (score === null) {
            return null;
          }
          const capturedAt = toTrimmedText(signal.capturedAt) || nowIso();
          return { score, capturedAt };
        })
        .filter((entry): entry is { score: -1 | 0 | 1; capturedAt: string } => Boolean(entry))
    : [];

  const taboo = Array.isArray(source.communicationStyle?.taboo)
    ? source.communicationStyle.taboo
        .map((entry) => toTrimmedText(entry))
        .filter((entry): entry is string => Boolean(entry))
    : [];
  const avoidTopics = Array.isArray(source.boundaries?.avoidTopics)
    ? source.boundaries.avoidTopics
        .map((entry) => toTrimmedText(entry))
        .filter((entry): entry is string => Boolean(entry))
    : [];

  const trend =
    source.emotionTrend7d?.trend === "stable" ||
    source.emotionTrend7d?.trend === "positive" ||
    source.emotionTrend7d?.trend === "low" ||
    source.emotionTrend7d?.trend === "volatile" ||
    source.emotionTrend7d?.trend === "unknown"
      ? source.emotionTrend7d.trend
      : fallback.emotionTrend7d.trend;

  return {
    version:
      typeof source.version === "number" && Number.isFinite(source.version)
        ? Math.max(1, Math.round(source.version))
        : fallback.version,
    sourceMode: "soul",
    updatedAt: toTrimmedText(source.updatedAt) || fallback.updatedAt,
    identityHint: toTrimmedText(source.identityHint),
    communicationStyle: {
      tone: toTrimmedText(source.communicationStyle?.tone),
      length: toTrimmedText(source.communicationStyle?.length),
      taboo
    },
    stablePreferences: stablePreferences.slice(0, MAX_STABLE_PREFERENCES),
    emotionTrend7d: {
      trend,
      confidence: clampConfidence(source.emotionTrend7d?.confidence, 0),
      evidenceCount:
        typeof source.emotionTrend7d?.evidenceCount === "number" &&
        Number.isFinite(source.emotionTrend7d.evidenceCount)
          ? Math.max(0, Math.round(source.emotionTrend7d.evidenceCount))
          : 0,
      note: toTrimmedText(source.emotionTrend7d?.note)
    },
    recentEvents: recentEvents.slice(0, MAX_RECENT_EVENTS),
    boundaries: {
      avoidTopics,
      sensitiveHandling:
        toTrimmedText(source.boundaries?.sensitiveHandling) || fallback.boundaries.sensitiveHandling
    },
    manualNotes: typeof source.manualNotes === "string" ? source.manualNotes : "",
    counters: {
      ingestedUserMessages:
        typeof source.counters?.ingestedUserMessages === "number" &&
        Number.isFinite(source.counters.ingestedUserMessages)
          ? Math.max(0, Math.round(source.counters.ingestedUserMessages))
          : 0,
      lastAutoRefreshAt: toTrimmedText(source.counters?.lastAutoRefreshAt) || undefined,
      lastIngestedAt: toTrimmedText(source.counters?.lastIngestedAt) || undefined,
      lastMarkdownSyncAt: toTrimmedText(source.counters?.lastMarkdownSyncAt) || undefined,
      pendingAutoRefresh: Boolean(source.counters?.pendingAutoRefresh)
    },
    emotionSignals
  };
};

const splitBySeparators = (raw: string) =>
  raw
    .split(/[;,，；、]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const ensurePersonaPaths = async (): Promise<PersonaPaths> => {
  const preferredDir = path.join(process.cwd(), ...PERSONA_DIR_SEGMENTS);
  try {
    await mkdir(preferredDir, { recursive: true });
    return {
      dir: preferredDir,
      jsonPath: path.join(preferredDir, PERSONA_JSON_FILENAME),
      markdownPath: path.join(preferredDir, PERSONA_MARKDOWN_FILENAME),
      operationsPath: path.join(preferredDir, PERSONA_OPERATIONS_FILENAME)
    };
  } catch {
    const fallbackDir = path.join(app.getPath("userData"), FALLBACK_STORE_DIR, "memory");
    await mkdir(fallbackDir, { recursive: true });
    return {
      dir: fallbackDir,
      jsonPath: path.join(fallbackDir, PERSONA_JSON_FILENAME),
      markdownPath: path.join(fallbackDir, PERSONA_MARKDOWN_FILENAME),
      operationsPath: path.join(fallbackDir, PERSONA_OPERATIONS_FILENAME)
    };
  }
};

const readProfileFromJson = async (jsonPath: string) => {
  try {
    const raw = await readFile(jsonPath, "utf-8");
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return createDefaultProfile();
  }
};

const writeProfileJson = async (jsonPath: string, profile: PersonaProfile) => {
  await writeFile(jsonPath, JSON.stringify(profile, null, 2), "utf-8");
};

const clonePreference = (value: PersonaPreference): PersonaPreference => ({ ...value });
const cloneRecentEvent = (value: PersonaRecentEvent): PersonaRecentEvent => ({ ...value });

const sortAndLimitPreferences = (entries: PersonaPreference[]) =>
  [...entries]
    .sort((left, right) => {
      const confidenceDelta = right.confidence - left.confidence;
      if (confidenceDelta !== 0) {
        return confidenceDelta;
      }
      return right.lastSeen.localeCompare(left.lastSeen);
    })
    .slice(0, MAX_STABLE_PREFERENCES);

const sortAndLimitEvents = (entries: PersonaRecentEvent[]) =>
  [...entries].sort((left, right) => right.date.localeCompare(left.date)).slice(0, MAX_RECENT_EVENTS);

const normalizeOperationRecord = (value: unknown): PersonaOperationRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const source = value as Partial<PersonaOperationRecord>;
  const operationId = toTrimmedText(source.operationId);
  const observedAt = toTrimmedText(source.observedAt);
  const createdAt = toTrimmedText(source.createdAt);
  if (!operationId || !observedAt || !createdAt) {
    return null;
  }
  const preferenceChanges = Array.isArray(source.preferenceChanges)
    ? source.preferenceChanges
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          const candidate = entry as Partial<PersonaEntityChange<PersonaPreference>>;
          const id = toTrimmedText(candidate.id);
          if (!id) {
            return null;
          }
          return {
            id,
            before: candidate.before ? normalizePreference(candidate.before) : null,
            after: candidate.after ? normalizePreference(candidate.after) : null
          };
        })
        .filter((entry): entry is PersonaEntityChange<PersonaPreference> => Boolean(entry))
    : [];
  const eventChanges = Array.isArray(source.eventChanges)
    ? source.eventChanges
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          const candidate = entry as Partial<PersonaEntityChange<PersonaRecentEvent>>;
          const id = toTrimmedText(candidate.id);
          if (!id) {
            return null;
          }
          return {
            id,
            before: candidate.before ? normalizeRecentEvent(candidate.before) : null,
            after: candidate.after ? normalizeRecentEvent(candidate.after) : null
          };
        })
        .filter((entry): entry is PersonaEntityChange<PersonaRecentEvent> => Boolean(entry))
    : [];
  return {
    operationId,
    observedAt,
    createdAt,
    preferenceChanges,
    eventChanges
  };
};

const readOperationRecords = async (operationsPath: string): Promise<PersonaOperationRecord[]> => {
  try {
    const raw = await readFile(operationsPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(normalizeOperationRecord)
      .filter((entry): entry is PersonaOperationRecord => Boolean(entry))
      .slice(0, MAX_PERSONA_OPERATIONS);
  } catch {
    return [];
  }
};

const writeOperationRecords = async (operationsPath: string, records: PersonaOperationRecord[]) => {
  await writeFile(
    operationsPath,
    JSON.stringify(records.slice(0, MAX_PERSONA_OPERATIONS), null, 2),
    "utf-8"
  );
};

const buildPersonaMarkdown = (profile: PersonaProfile) => {
  const lines: string[] = [
    "# Persona Card",
    `- version: ${profile.version}`,
    `- updated_at: ${profile.updatedAt}`,
    `- source_mode: ${profile.sourceMode}`,
    "",
    "## Identity Hint",
    profile.identityHint || "一句话描述用户当前阶段状态（可改写）",
    "",
    "## Communication Style",
    `- 语气偏好：${profile.communicationStyle.tone}`,
    `- 长度偏好：${profile.communicationStyle.length}`,
    `- 禁忌表达：${profile.communicationStyle.taboo.join("、")}`,
    "",
    "## Stable Preferences"
  ];

  if (!profile.stablePreferences.length) {
    lines.push("- [pref_placeholder] 暂无（confidence: 0.00, last_seen: 1970-01-01)");
  } else {
    for (const preference of profile.stablePreferences) {
      lines.push(
        `- [${preference.id}] ${preference.text} (confidence: ${preference.confidence.toFixed(2)}, last_seen: ${preference.lastSeen})`
      );
    }
  }

  lines.push(
    "",
    "## Emotion Trend (7d)",
    `- trend: ${toTrendLabel(profile.emotionTrend7d.trend)}`,
    `- confidence: ${profile.emotionTrend7d.confidence.toFixed(2)}`,
    `- evidence_count: ${profile.emotionTrend7d.evidenceCount}`,
    `- note: ${profile.emotionTrend7d.note}`,
    "",
    "## Recent Events"
  );

  if (!profile.recentEvents.length) {
    lines.push("- [event_placeholder] 暂无（date: 1970-01-01, confidence: 0.00)");
  } else {
    for (const event of profile.recentEvents) {
      lines.push(
        `- [${event.id}] ${event.text} (date: ${event.date}, confidence: ${event.confidence.toFixed(2)})`
      );
    }
  }

  lines.push(
    "",
    "## Boundaries",
    `- 不希望被提及：${profile.boundaries.avoidTopics.join("、")}`,
    `- 敏感话题处理：${profile.boundaries.sensitiveHandling}`,
    "",
    "## Manual Notes",
    profile.manualNotes || "这里内容永不被自动覆盖（用户自由编辑）",
    ""
  );

  return lines.join("\n");
};

const writeProfileMarkdown = async (markdownPath: string, profile: PersonaProfile) => {
  await writeFile(markdownPath, buildPersonaMarkdown(profile), "utf-8");
};

const readMarkdown = async (markdownPath: string) => {
  try {
    return await readFile(markdownPath, "utf-8");
  } catch {
    return null;
  }
};

const buildSections = (markdown: string): SectionMap => {
  const lines = markdown.split(/\r?\n/);
  const sections: SectionMap = { __meta: { lines: [], startLine: 1 } };
  let current = "__meta";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("## ")) {
      current = line.slice(3).trim();
      sections[current] = sections[current] ?? { lines: [], startLine: index + 1 };
      continue;
    }
    sections[current] = sections[current] ?? { lines: [], startLine: index + 1 };
    sections[current].lines.push(line);
  }

  return sections;
};

const toParseWarning = (line: number, message: string): PersonaSyncWarning => ({
  code: "markdown_parse_failed",
  message: `${message} (line ${line})`
});

const parseMarkdownPatch = (
  markdown: string
): { patch: Partial<PersonaProfile> } | { warning: PersonaSyncWarning } => {
  const sections = buildSections(markdown);
  const patch: Partial<PersonaProfile> = {};

  const identity = sections["Identity Hint"];
  if (identity) {
    patch.identityHint = identity.lines.join("\n").trim();
  }

  const communication = sections["Communication Style"];
  if (communication) {
    const next = {
      tone: "",
      length: "",
      taboo: [] as string[]
    };
    communication.lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line.startsWith("- ")) {
        return;
      }
      const payload = line.slice(2);
      const [rawKey, ...rawValue] = payload.split(":");
      const key = rawKey.trim();
      const value = rawValue.join(":").trim();
      if (!key) {
        return;
      }
      if (key === "语气偏好" || key === "tone") {
        next.tone = value;
      } else if (key === "长度偏好" || key === "length") {
        next.length = value;
      } else if (key === "禁忌表达" || key === "taboo") {
        next.taboo = splitBySeparators(value);
      }
    });
    patch.communicationStyle = next;
  }

  const stablePreferenceSection = sections["Stable Preferences"];
  if (stablePreferenceSection) {
    const parsed: PersonaPreference[] = [];
    for (let index = 0; index < stablePreferenceSection.lines.length; index += 1) {
      const rawLine = stablePreferenceSection.lines[index];
      const line = rawLine.trim();
      if (!line || !line.startsWith("- ")) {
        continue;
      }
      if (line.includes("pref_placeholder")) {
        continue;
      }
      const withMetaPattern =
        /^- \[([^\]]+)\]\s+(.+?)\s+\(confidence:\s*([0-9.]+)\s*,\s*last_seen:\s*(\d{4}-\d{2}-\d{2})\)$/;
      const match = withMetaPattern.exec(line);
      const lineNo = stablePreferenceSection.startLine + index + 1;
      if (match) {
        parsed.push({
          id: toTrimmedText(match[1]) || normalizePreferenceId(match[2]),
          text: toTrimmedText(match[2]),
          confidence: clampConfidence(Number(match[3]), 0.6),
          lastSeen: sanitizeDate(match[4], safeDate(nowIso())),
          evidenceCount: 1
        });
        continue;
      }
      if (line.includes("(confidence:")) {
        return {
          warning: toParseWarning(
            lineNo,
            "Failed to parse Stable Preferences entry. Expected format: - [id] text (confidence: 0.00, last_seen: YYYY-MM-DD)"
          )
        };
      }
      parsed.push({
        id: normalizePreferenceId(line.slice(2)),
        text: line.slice(2).trim(),
        confidence: 0.55,
        lastSeen: safeDate(nowIso()),
        evidenceCount: 1
      });
    }
    patch.stablePreferences = parsed;
  }

  const emotionSection = sections["Emotion Trend (7d)"];
  if (emotionSection) {
    const emotionPatch: PersonaProfile["emotionTrend7d"] = {
      trend: "unknown",
      confidence: 0,
      evidenceCount: 0,
      note: ""
    };
    for (let index = 0; index < emotionSection.lines.length; index += 1) {
      const rawLine = emotionSection.lines[index].trim();
      if (!rawLine.startsWith("- ")) {
        continue;
      }
      const payload = rawLine.slice(2);
      const [rawKey, ...rawValue] = payload.split(":");
      const key = rawKey.trim();
      const value = rawValue.join(":").trim();
      if (!key) {
        continue;
      }
      if (key === "trend") {
        emotionPatch.trend = fromTrendLabel(value);
        continue;
      }
      if (key === "confidence") {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          return {
            warning: toParseWarning(
              emotionSection.startLine + index + 1,
              "Emotion confidence must be a number."
            )
          };
        }
        emotionPatch.confidence = clampConfidence(parsed, 0.5);
        continue;
      }
      if (key === "evidence_count") {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          return {
            warning: toParseWarning(
              emotionSection.startLine + index + 1,
              "Emotion evidence_count must be a number."
            )
          };
        }
        emotionPatch.evidenceCount = Math.max(0, Math.round(parsed));
        continue;
      }
      if (key === "note") {
        emotionPatch.note = value;
      }
    }
    patch.emotionTrend7d = emotionPatch;
  }

  const recentEventSection = sections["Recent Events"];
  if (recentEventSection) {
    const parsed: PersonaRecentEvent[] = [];
    for (let index = 0; index < recentEventSection.lines.length; index += 1) {
      const rawLine = recentEventSection.lines[index];
      const line = rawLine.trim();
      if (!line || !line.startsWith("- ")) {
        continue;
      }
      if (line.includes("event_placeholder")) {
        continue;
      }
      const withMetaPattern =
        /^- \[([^\]]+)\]\s+(.+?)\s+\(date:\s*(\d{4}-\d{2}-\d{2})\s*,\s*confidence:\s*([0-9.]+)\)$/;
      const match = withMetaPattern.exec(line);
      const lineNo = recentEventSection.startLine + index + 1;
      if (match) {
        parsed.push({
          id: toTrimmedText(match[1]) || normalizeEventId(match[2]),
          text: toTrimmedText(match[2]),
          date: sanitizeDate(match[3], safeDate(nowIso())),
          confidence: clampConfidence(Number(match[4]), 0.58)
        });
        continue;
      }
      if (line.includes("(date:")) {
        return {
          warning: toParseWarning(
            lineNo,
            "Failed to parse Recent Events entry. Expected format: - [id] text (date: YYYY-MM-DD, confidence: 0.00)"
          )
        };
      }
      parsed.push({
        id: normalizeEventId(line.slice(2)),
        text: line.slice(2).trim(),
        date: safeDate(nowIso()),
        confidence: 0.55
      });
    }
    patch.recentEvents = parsed;
  }

  const boundariesSection = sections["Boundaries"];
  if (boundariesSection) {
    const boundariesPatch: PersonaProfile["boundaries"] = {
      avoidTopics: [],
      sensitiveHandling: ""
    };
    boundariesSection.lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line.startsWith("- ")) {
        return;
      }
      const payload = line.slice(2);
      const [rawKey, ...rawValue] = payload.split(":");
      const key = rawKey.trim();
      const value = rawValue.join(":").trim();
      if (key === "不希望被提及") {
        boundariesPatch.avoidTopics = splitBySeparators(value);
      } else if (key === "敏感话题处理") {
        boundariesPatch.sensitiveHandling = value;
      }
    });
    patch.boundaries = boundariesPatch;
  }

  const manualNotesSection = sections["Manual Notes"];
  if (manualNotesSection) {
    const manualNotes = manualNotesSection.lines.join("\n").trim();
    patch.manualNotes =
      manualNotes === "这里内容永不被自动覆盖（用户自由编辑）" ? "" : manualNotes;
  }

  return { patch };
};

const mergeMarkdownPatch = (profile: PersonaProfile, patch: Partial<PersonaProfile>) =>
  normalizeProfile({
    ...profile,
    ...patch,
    communicationStyle: {
      ...profile.communicationStyle,
      ...(patch.communicationStyle ?? {})
    },
    boundaries: {
      ...profile.boundaries,
      ...(patch.boundaries ?? {})
    },
    emotionTrend7d: {
      ...profile.emotionTrend7d,
      ...(patch.emotionTrend7d ?? {})
    }
  });

const pruneSignals = (signals: PersonaProfile["emotionSignals"]) => {
  const cutoff = Date.now() - EMOTION_WINDOW_DAYS * MS_PER_DAY;
  return signals.filter((signal) => {
    const timestamp = Date.parse(signal.capturedAt);
    if (!Number.isFinite(timestamp)) {
      return false;
    }
    return timestamp >= cutoff;
  });
};

const safeSliceBySentence = (text: string, maxLength = 120) => {
  const firstSentence = text.split(/[。！？.!?]/)[0]?.trim() ?? "";
  const clipped = firstSentence || text.trim();
  if (clipped.length <= maxLength) {
    return clipped;
  }
  return `${clipped.slice(0, maxLength)}...`;
};

const SENSITIVE_KEYWORDS = [
  "抑郁",
  "焦虑症",
  "精神疾病",
  "药物",
  "财务",
  "债务",
  "收入",
  "病",
  "怀孕",
  "depression",
  "anxiety disorder",
  "debt",
  "salary",
  "income",
  "pregnancy",
  "diagnosis"
];

const containsSensitiveKeywords = (text: string) => {
  const lowered = text.toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => lowered.includes(keyword.toLowerCase()));
};

const extractPreferenceCandidates = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) {
    return [] as string[];
  }

  const patterns = [
    /(?:我喜欢|我更喜欢|我偏好)\s*([^。！？\n]{2,48})/g,
    /(?:我不喜欢|我讨厌|我希望你不要|不要)\s*([^。！？\n]{2,48})/g,
    /(?:请用|请尽量|请保持)\s*([^。！？\n]{2,48})/g,
    /(?:prefer|please use|please keep)\s+([^.!?\n]{2,48})/gi
  ];

  const candidates = new Set<string>();
  for (const pattern of patterns) {
    let match = pattern.exec(trimmed);
    while (match) {
      const value = match[1]?.trim().replace(/[，,。.!?！？]$/, "");
      if (value && !containsSensitiveKeywords(value)) {
        candidates.add(safeSliceBySentence(value, 64));
      }
      match = pattern.exec(trimmed);
    }
  }

  return Array.from(candidates);
};

const extractEventCandidate = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed || containsSensitiveKeywords(trimmed)) {
    return null;
  }
  const temporalKeywords = [
    "今天",
    "昨天",
    "最近",
    "这周",
    "刚刚",
    "今晚",
    "today",
    "yesterday",
    "recently",
    "this week",
    "just now"
  ];
  const lowered = trimmed.toLowerCase();
  if (!temporalKeywords.some((keyword) => lowered.includes(keyword.toLowerCase()))) {
    return null;
  }
  const eventText = safeSliceBySentence(trimmed, 96);
  return eventText || null;
};

const POSITIVE_EMOTION_HINTS = [
  "开心",
  "高兴",
  "兴奋",
  "有动力",
  "满意",
  "relaxed",
  "happy",
  "excited",
  "grateful"
];

const NEGATIVE_EMOTION_HINTS = [
  "焦虑",
  "难过",
  "崩溃",
  "烦",
  "低落",
  "stress",
  "stressed",
  "tired",
  "sad",
  "anxious",
  "upset"
];

const extractEmotionScore = (text: string): -1 | 0 | 1 => {
  const lowered = text.toLowerCase();
  const positive = POSITIVE_EMOTION_HINTS.reduce(
    (count, hint) => (lowered.includes(hint.toLowerCase()) ? count + 1 : count),
    0
  );
  const negative = NEGATIVE_EMOTION_HINTS.reduce(
    (count, hint) => (lowered.includes(hint.toLowerCase()) ? count + 1 : count),
    0
  );

  if (positive === negative) {
    return 0;
  }
  return positive > negative ? 1 : -1;
};

const upsertPreference = (
  profile: PersonaProfile,
  text: string,
  observedAt: string
): {
  stablePreferences: PersonaPreference[];
  change:
    | {
        type: "added" | "updated";
        before: PersonaPreference | null;
        after: PersonaPreference;
      }
    | null;
} => {
  const candidateId = normalizePreferenceId(text);
  const date = safeDate(observedAt);
  const next = [...profile.stablePreferences];
  const existingIndex = next.findIndex((entry) => entry.id === candidateId || entry.text === text);
  const before = existingIndex >= 0 ? clonePreference(next[existingIndex]) : null;

  if (existingIndex >= 0) {
    const current = next[existingIndex];
    next[existingIndex] = {
      ...current,
      text,
      lastSeen: date,
      evidenceCount: current.evidenceCount + 1,
      confidence: clampConfidence(current.confidence + 0.04, current.confidence)
    };
  } else {
    next.push({
      id: candidateId,
      text,
      confidence: 0.62,
      lastSeen: date,
      evidenceCount: 1
    });
  }

  const stablePreferences = sortAndLimitPreferences(next);
  const afterEntry =
    stablePreferences.find((entry) => entry.id === candidateId || entry.text === text) ?? null;
  return {
    stablePreferences,
    change: afterEntry
      ? {
          type: before ? "updated" : "added",
          before,
          after: clonePreference(afterEntry)
        }
      : null
  };
};

const upsertEvent = (
  profile: PersonaProfile,
  text: string,
  observedAt: string
): {
  recentEvents: PersonaRecentEvent[];
  change:
    | {
        type: "added" | "updated";
        before: PersonaRecentEvent | null;
        after: PersonaRecentEvent;
      }
    | null;
} => {
  const eventDate = safeDate(observedAt);
  const eventId = normalizeEventId(text);
  const next = [...profile.recentEvents];
  const existingIndex = next.findIndex((entry) => entry.id === eventId || entry.text === text);
  const before = existingIndex >= 0 ? cloneRecentEvent(next[existingIndex]) : null;

  if (existingIndex >= 0) {
    const current = next[existingIndex];
    next[existingIndex] = {
      ...current,
      text,
      date: eventDate,
      confidence: clampConfidence(current.confidence + 0.03, current.confidence)
    };
  } else {
    next.push({
      id: eventId,
      text,
      date: eventDate,
      confidence: 0.58
    });
  }

  const recentEvents = sortAndLimitEvents(next);
  const afterEntry = recentEvents.find((entry) => entry.id === eventId || entry.text === text) ?? null;
  return {
    recentEvents,
    change: afterEntry
      ? {
          type: before ? "updated" : "added",
          before,
          after: cloneRecentEvent(afterEntry)
        }
      : null
  };
};

const deriveCommunicationStyle = (preferences: PersonaPreference[]) => {
  const joined = preferences.map((entry) => entry.text.toLowerCase()).join("\n");
  const tone = joined.includes("温柔") || joined.includes("empathetic")
    ? "warm"
    : joined.includes("直接") || joined.includes("direct")
      ? "direct"
      : "";
  const length = joined.includes("简洁") || joined.includes("short")
    ? "short"
    : joined.includes("详细") || joined.includes("long")
      ? "detailed"
      : "";
  return { tone, length };
};

const refreshDerivedFields = (profile: PersonaProfile): PersonaProfile => {
  const refreshedSignals = pruneSignals(profile.emotionSignals);
  const signalCount = refreshedSignals.length;
  const scoreSum = refreshedSignals.reduce((sum, signal) => sum + signal.score, 0);
  const average = signalCount > 0 ? scoreSum / signalCount : 0;
  const hasPositive = refreshedSignals.some((signal) => signal.score > 0);
  const hasNegative = refreshedSignals.some((signal) => signal.score < 0);

  let trend: PersonaEmotionTrend = "unknown";
  if (signalCount >= 2) {
    if (average >= 0.3) {
      trend = "positive";
    } else if (average <= -0.3) {
      trend = "low";
    } else if (hasPositive && hasNegative) {
      trend = "volatile";
    } else {
      trend = "stable";
    }
  }

  const emotionConfidence =
    signalCount === 0 ? 0 : Math.min(0.95, Number((0.35 + signalCount * 0.07 + Math.abs(average) * 0.2).toFixed(2)));
  const emotionNote =
    trend === "unknown"
      ? "Recent emotion evidence is not enough."
      : trend === "volatile"
        ? "Mixed emotion cues in the last 7 days."
        : "Trend derived from explicit emotional signals in recent user turns.";

  const communication = deriveCommunicationStyle(profile.stablePreferences);
  const identityHint =
    profile.identityHint ||
    profile.stablePreferences[0]?.text ||
    profile.recentEvents[0]?.text ||
    "";

  return normalizeProfile({
    ...profile,
    updatedAt: nowIso(),
    identityHint,
    communicationStyle: {
      ...profile.communicationStyle,
      tone: profile.communicationStyle.tone || communication.tone,
      length: profile.communicationStyle.length || communication.length
    },
    emotionTrend7d: {
      trend,
      confidence: emotionConfidence,
      evidenceCount: signalCount,
      note: emotionNote
    },
    counters: {
      ...profile.counters,
      lastAutoRefreshAt: nowIso(),
      pendingAutoRefresh: false
    },
    emotionSignals: refreshedSignals
  });
};

const ensureInitialFiles = async (paths: PersonaPaths, profile: PersonaProfile) => {
  try {
    await readFile(paths.jsonPath, "utf-8");
  } catch {
    await writeProfileJson(paths.jsonPath, profile);
  }
  try {
    await readFile(paths.markdownPath, "utf-8");
  } catch {
    await writeProfileMarkdown(paths.markdownPath, profile);
  }
  try {
    await readFile(paths.operationsPath, "utf-8");
  } catch {
    await writeOperationRecords(paths.operationsPath, []);
  }
};

const readProfileWithSync = async (): Promise<{
  profile: PersonaProfile;
  paths: PersonaPaths;
  warning?: PersonaSyncWarning;
}> => {
  const paths = await ensurePersonaPaths();
  const current = await readProfileFromJson(paths.jsonPath);
  await ensureInitialFiles(paths, current);
  const markdown = await readMarkdown(paths.markdownPath);

  if (!markdown) {
    return { profile: current, paths };
  }

  const parsed = parseMarkdownPatch(markdown);
  if ("warning" in parsed) {
    return { profile: current, paths, warning: parsed.warning };
  }

  const merged = mergeMarkdownPatch(current, parsed.patch);
  if (JSON.stringify(merged) === JSON.stringify(current)) {
    return { profile: current, paths };
  }

  const updated = normalizeProfile({
    ...merged,
    updatedAt: nowIso(),
    counters: {
      ...merged.counters,
      lastMarkdownSyncAt: nowIso()
    }
  });
  await writeProfileJson(paths.jsonPath, updated);
  return { profile: updated, paths };
};

const shouldRefreshProfile = (profile: PersonaProfile) => {
  const dueByInterval =
    profile.counters.ingestedUserMessages > 0 &&
    profile.counters.ingestedUserMessages % AUTO_REFRESH_EVERY_TURNS === 0;
  const isPending = Boolean(profile.counters.pendingAutoRefresh);
  if (!dueByInterval && !isPending) {
    return false;
  }
  const lastRefreshTime = profile.counters.lastAutoRefreshAt
    ? Date.parse(profile.counters.lastAutoRefreshAt)
    : NaN;
  if (!Number.isFinite(lastRefreshTime)) {
    return true;
  }
  return Date.now() - lastRefreshTime >= AUTO_REFRESH_MIN_INTERVAL_MS;
};

const toInjectionBlock = (profile: PersonaProfile) => {
  const pickedPreferences = profile.stablePreferences.slice(0, INJECTION_MAX_PREFERENCES);
  const pickedEvents = profile.recentEvents.slice(0, INJECTION_MAX_EVENTS);
  const preferenceLines = pickedPreferences.length
    ? pickedPreferences.map(
        (entry) =>
          `  - ${entry.text} (confidence: ${entry.confidence.toFixed(2)}, last_seen: ${entry.lastSeen})`
      )
    : ["  - none"];
  const eventLines = pickedEvents.length
    ? pickedEvents.map(
        (entry) => `  - ${entry.text} (date: ${entry.date}, confidence: ${entry.confidence.toFixed(2)})`
      )
    : ["  - none"];

  const taboo = profile.communicationStyle.taboo.length
    ? profile.communicationStyle.taboo.join(", ")
    : "none";

  return [
    "<user_memory_profile>",
    `profile_version: ${profile.version}`,
    `updated_at: ${profile.updatedAt}`,
    "communication_style:",
    `  tone: ${profile.communicationStyle.tone || "unspecified"}`,
    `  length: ${profile.communicationStyle.length || "unspecified"}`,
    `  taboo: ${taboo}`,
    "stable_preferences:",
    ...preferenceLines,
    "emotion_trend_7d:",
    `  trend: ${profile.emotionTrend7d.trend}`,
    `  confidence: ${profile.emotionTrend7d.confidence.toFixed(2)}`,
    `  note: ${profile.emotionTrend7d.note || "n/a"}`,
    "recent_events:",
    ...eventLines,
    "use_rules:",
    "  - prioritize latest evidence",
    "  - do not overstate uncertain traits",
    "  - avoid sensitive assumptions",
    "</user_memory_profile>"
  ].join("\n");
};

export const getPersonaSnapshot = async (): Promise<PersonaSnapshot> => {
  const { profile, paths, warning } = await readProfileWithSync();
  return {
    profile,
    jsonPath: paths.jsonPath,
    markdownPath: paths.markdownPath,
    warning
  };
};

export const getPersonaMarkdownDocument = async (): Promise<string> => {
  const { profile, paths } = await readProfileWithSync();
  const markdown = await readMarkdown(paths.markdownPath);
  if (typeof markdown === "string") {
    return markdown;
  }
  const generated = buildPersonaMarkdown(profile);
  await writeFile(paths.markdownPath, generated, "utf-8");
  return generated;
};

export const savePersonaMarkdownDocument = async (markdown: string): Promise<PersonaSnapshot> => {
  const { profile: syncedProfile, paths } = await readProfileWithSync();
  const normalizedMarkdown = `${markdown.replace(/\r\n/g, "\n").trimEnd()}\n`;
  await writeFile(paths.markdownPath, normalizedMarkdown, "utf-8");

  const parsed = parseMarkdownPatch(normalizedMarkdown);
  if ("warning" in parsed) {
    return {
      profile: syncedProfile,
      jsonPath: paths.jsonPath,
      markdownPath: paths.markdownPath,
      warning: parsed.warning
    };
  }

  const merged = mergeMarkdownPatch(syncedProfile, parsed.patch);
  const nextProfile = normalizeProfile({
    ...merged,
    updatedAt: nowIso(),
    counters: {
      ...merged.counters,
      lastMarkdownSyncAt: nowIso()
    }
  });
  await writeProfileJson(paths.jsonPath, nextProfile);

  return {
    profile: nextProfile,
    jsonPath: paths.jsonPath,
    markdownPath: paths.markdownPath
  };
};

export const getPersonaInjectionPayload = async (): Promise<PersonaInjectionPayload> => {
  const snapshot = await getPersonaSnapshot();
  return {
    block: toInjectionBlock(snapshot.profile),
    snapshot
  };
};

const createEmptyIngestResult = (
  operationId: string,
  observedAt: string,
  reason: PersonaIngestResult["reason"]
): PersonaIngestResult => ({
  operationId,
  observedAt,
  reason,
  undoable: false,
  extracted: {
    preferencesAdded: [],
    preferencesUpdated: [],
    eventsAdded: [],
    eventsUpdated: []
  }
});

export const ingestPersonaMessage = async (
  payload: PersonaIngestPayload
): Promise<PersonaIngestResult> => {
  const text = toTrimmedText(payload.text);
  const operationId = crypto.randomUUID();
  const observedAt = payload.createdAt?.trim() || nowIso();
  if (!text) {
    return createEmptyIngestResult(operationId, observedAt, "no_match");
  }
  const { profile: syncedProfile, paths } = await readProfileWithSync();

  const preferenceChanges = new Map<string, PersonaEntityChange<PersonaPreference>>();
  const eventChanges = new Map<string, PersonaEntityChange<PersonaRecentEvent>>();
  const preferencesAdded = new Set<string>();
  const preferencesUpdated = new Set<string>();
  const eventsAdded = new Set<string>();
  const eventsUpdated = new Set<string>();

  let nextProfile = normalizeProfile({
    ...syncedProfile,
    counters: {
      ...syncedProfile.counters,
      ingestedUserMessages: syncedProfile.counters.ingestedUserMessages + 1,
      lastIngestedAt: observedAt
    }
  });

  const preferenceCandidates = extractPreferenceCandidates(text);
  for (const candidate of preferenceCandidates) {
    const { stablePreferences, change } = upsertPreference(nextProfile, candidate, observedAt);
    nextProfile = normalizeProfile({
      ...nextProfile,
      stablePreferences
    });
    if (change) {
      preferenceChanges.set(change.after.id, {
        id: change.after.id,
        before: change.before ? clonePreference(change.before) : null,
        after: clonePreference(change.after)
      });
      if (change.type === "added") {
        preferencesAdded.add(change.after.text);
      } else {
        preferencesUpdated.add(change.after.text);
      }
    }
  }

  const eventCandidate = extractEventCandidate(text);
  if (eventCandidate) {
    const { recentEvents, change } = upsertEvent(nextProfile, eventCandidate, observedAt);
    nextProfile = normalizeProfile({
      ...nextProfile,
      recentEvents
    });
    if (change) {
      eventChanges.set(change.after.id, {
        id: change.after.id,
        before: change.before ? cloneRecentEvent(change.before) : null,
        after: cloneRecentEvent(change.after)
      });
      if (change.type === "added") {
        eventsAdded.add(change.after.text);
      } else {
        eventsUpdated.add(change.after.text);
      }
    }
  }

  const emotionScore = extractEmotionScore(text);
  nextProfile = normalizeProfile({
    ...nextProfile,
    emotionSignals: pruneSignals([
      ...nextProfile.emotionSignals,
      { score: emotionScore, capturedAt: observedAt }
    ])
  });

  if (nextProfile.counters.ingestedUserMessages % AUTO_REFRESH_EVERY_TURNS === 0) {
    nextProfile = normalizeProfile({
      ...nextProfile,
      counters: {
        ...nextProfile.counters,
        pendingAutoRefresh: true
      }
    });
  }

  if (shouldRefreshProfile(nextProfile)) {
    nextProfile = refreshDerivedFields(nextProfile);
    await writeProfileJson(paths.jsonPath, nextProfile);
    await writeProfileMarkdown(paths.markdownPath, nextProfile);
  } else {
    await writeProfileJson(paths.jsonPath, nextProfile);
  }

  const extracted: PersonaIngestResult["extracted"] = {
    preferencesAdded: Array.from(preferencesAdded),
    preferencesUpdated: Array.from(preferencesUpdated),
    eventsAdded: Array.from(eventsAdded),
    eventsUpdated: Array.from(eventsUpdated)
  };
  const hasExtracted =
    extracted.preferencesAdded.length > 0 ||
    extracted.preferencesUpdated.length > 0 ||
    extracted.eventsAdded.length > 0 ||
    extracted.eventsUpdated.length > 0;

  if (!hasExtracted) {
    return {
      ...createEmptyIngestResult(operationId, observedAt, "no_match"),
      extracted
    };
  }

  let undoable = false;
  try {
    const operation: PersonaOperationRecord = {
      operationId,
      observedAt,
      createdAt: nowIso(),
      preferenceChanges: Array.from(preferenceChanges.values()),
      eventChanges: Array.from(eventChanges.values())
    };
    const existing = await readOperationRecords(paths.operationsPath);
    const merged = [operation, ...existing.filter((entry) => entry.operationId !== operationId)];
    await writeOperationRecords(paths.operationsPath, merged);
    undoable = true;
  } catch {
    undoable = false;
  }

  return {
    operationId,
    observedAt,
    reason: "extracted",
    undoable,
    extracted
  };
};

export const undoPersonaIngest = async (
  payload: PersonaUndoIngestPayload
): Promise<PersonaUndoIngestResult> => {
  const operationId = payload.operationId.trim();
  if (!operationId) {
    return {
      ok: false,
      reverted: { preferences: 0, events: 0 },
      message: "Missing operation id."
    };
  }

  const { profile: syncedProfile, paths } = await readProfileWithSync();
  const operations = await readOperationRecords(paths.operationsPath);
  const operationIndex = operations.findIndex((entry) => entry.operationId === operationId);
  if (operationIndex < 0) {
    return {
      ok: false,
      reverted: { preferences: 0, events: 0 },
      message: "This ingest operation is no longer available."
    };
  }

  const operation = operations[operationIndex];
  const nextPreferences = [...syncedProfile.stablePreferences];
  const nextEvents = [...syncedProfile.recentEvents];
  let revertedPreferences = 0;
  let revertedEvents = 0;

  for (const change of operation.preferenceChanges) {
    const currentIndex = nextPreferences.findIndex((entry) => entry.id === change.id);
    if (change.before) {
      const restored = clonePreference(change.before);
      if (currentIndex >= 0) {
        nextPreferences[currentIndex] = restored;
      } else {
        nextPreferences.push(restored);
      }
      revertedPreferences += 1;
    } else if (currentIndex >= 0) {
      nextPreferences.splice(currentIndex, 1);
      revertedPreferences += 1;
    }
  }

  for (const change of operation.eventChanges) {
    const currentIndex = nextEvents.findIndex((entry) => entry.id === change.id);
    if (change.before) {
      const restored = cloneRecentEvent(change.before);
      if (currentIndex >= 0) {
        nextEvents[currentIndex] = restored;
      } else {
        nextEvents.push(restored);
      }
      revertedEvents += 1;
    } else if (currentIndex >= 0) {
      nextEvents.splice(currentIndex, 1);
      revertedEvents += 1;
    }
  }

  if (revertedPreferences > 0 || revertedEvents > 0) {
    const nextProfile = normalizeProfile({
      ...syncedProfile,
      updatedAt: nowIso(),
      stablePreferences: sortAndLimitPreferences(nextPreferences),
      recentEvents: sortAndLimitEvents(nextEvents)
    });
    await writeProfileJson(paths.jsonPath, nextProfile);
    await writeProfileMarkdown(paths.markdownPath, nextProfile);
  }

  const remaining = operations.filter((entry) => entry.operationId !== operationId);
  await writeOperationRecords(paths.operationsPath, remaining);

  return {
    ok: revertedPreferences > 0 || revertedEvents > 0,
    reverted: {
      preferences: revertedPreferences,
      events: revertedEvents
    },
    message:
      revertedPreferences > 0 || revertedEvents > 0
        ? "Reverted memory updates from this send."
        : "No memory updates were reverted."
  };
};
