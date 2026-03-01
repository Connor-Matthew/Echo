import type {
  AppSettings,
  ChatAttachment,
  ChatMessage,
  ChatSession,
  ChatStreamRequest,
  ChatUsage,
  EnvironmentSnapshot,
  EnvironmentWeatherSnapshot,
  ToolCall
} from "../shared/contracts";

const COMPOSER_MODEL_DELIMITER = "::";
const MODEL_USAGE_KEY_DELIMITER = "::";
export const TEXT_ATTACHMENT_LIMIT = 60000;
export const IMAGE_ATTACHMENT_LIMIT = 5 * 1024 * 1024;
const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".xml",
  ".yaml",
  ".yml",
  ".log"
]);
const TEXT_ATTACHMENT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/x-yaml",
  "text/csv"
]);
const AUDIO_ATTACHMENT_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"]);
const VIDEO_ATTACHMENT_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"]);
export const SIDEBAR_AUTO_HIDE_WIDTH = 800;
export const SIDEBAR_MIN_WIDTH = 248;
export const SIDEBAR_MAX_WIDTH = 292;
export const SIDEBAR_FULL_WIDTH_AT = 1400;

export type StreamUsageSnapshot = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

const toTokenNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export const estimateTokensFromText = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return 0;
  }
  const cjkCount = (normalized.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const nonWhitespaceCount = (normalized.match(/\S/g) ?? []).length;
  const otherCount = Math.max(0, nonWhitespaceCount - cjkCount);
  const estimated = cjkCount * 1.05 + otherCount * 0.3;
  return Math.max(1, Math.ceil(estimated));
};

const estimateTokensFromAttachment = (attachment: ChatAttachment) => {
  if (attachment.kind === "text") {
    return estimateTokensFromText(attachment.textContent ?? attachment.name);
  }
  if (attachment.kind === "image") {
    return 260;
  }
  return 24;
};

const getExtension = (name: string) => {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
};

const formatBytes = (bytes: number | undefined) => {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) {
    return "n/a";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const fixed = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
  return `${fixed}${units[index]}`;
};

export const hasAttachmentPayload = (attachment: ChatAttachment) => {
  if (attachment.kind === "text") {
    return Boolean(attachment.textContent?.trim());
  }
  if (attachment.kind === "image") {
    return Boolean(attachment.imageDataUrl?.trim());
  }
  return true;
};

const normalizeToolCall = (raw: unknown): ToolCall | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.serverName !== "string" || typeof r.toolName !== "string") return null;
  const status = r.status === "pending" || r.status === "success" || r.status === "error" ? r.status : "success";
  const contentOffset =
    typeof r.contentOffset === "number" && Number.isFinite(r.contentOffset)
      ? Math.max(0, Math.floor(r.contentOffset))
      : undefined;
  return {
    id: r.id,
    serverName: r.serverName,
    toolName: r.toolName,
    status,
    message: typeof r.message === "string" ? r.message : "",
    contentOffset
  };
};

const normalizeSession = (session: ChatSession): ChatSession => ({
  ...session,
  isPinned: Boolean(session.isPinned),
  enabledMcpServers: Array.isArray(session.enabledMcpServers)
    ? session.enabledMcpServers.filter((id): id is string => typeof id === "string" && Boolean(id))
    : undefined,
  messages: session.messages.map((message) => ({
    ...message,
    toolCalls: Array.isArray(message.toolCalls)
      ? message.toolCalls.map(normalizeToolCall).filter((t): t is ToolCall => t !== null)
      : undefined
  }))
});

export const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const nowIso = () => new Date().toISOString();

export const getCurrentViewportWidth = () =>
  typeof window === "undefined" ? SIDEBAR_AUTO_HIDE_WIDTH + 1 : window.innerWidth;

export const getResponsiveSidebarWidth = (viewportWidth: number) => {
  const widthRange = SIDEBAR_FULL_WIDTH_AT - SIDEBAR_AUTO_HIDE_WIDTH;
  if (widthRange <= 0) {
    return SIDEBAR_MAX_WIDTH;
  }

  const progress = (viewportWidth - SIDEBAR_AUTO_HIDE_WIDTH) / widthRange;
  const normalizedProgress = Math.min(Math.max(progress, 0), 1);
  return Math.round(
    SIDEBAR_MIN_WIDTH + (SIDEBAR_MAX_WIDTH - SIDEBAR_MIN_WIDTH) * normalizedProgress
  );
};

export const encodeComposerModelOption = (providerId: string, modelId: string) =>
  `${encodeURIComponent(providerId)}${COMPOSER_MODEL_DELIMITER}${encodeURIComponent(modelId)}`;

export const decodeComposerModelOption = (rawValue: string) => {
  const [encodedProviderId, ...encodedModelParts] = rawValue.split(COMPOSER_MODEL_DELIMITER);
  if (!encodedProviderId || !encodedModelParts.length) {
    return null;
  }

  try {
    const providerId = decodeURIComponent(encodedProviderId);
    const modelId = decodeURIComponent(encodedModelParts.join(COMPOSER_MODEL_DELIMITER)).trim();
    if (!providerId || !modelId) {
      return null;
    }
    return { providerId, modelId };
  } catch {
    return null;
  }
};

export const toModelUsageKey = (providerId: string, modelId: string) =>
  `${providerId}${MODEL_USAGE_KEY_DELIMITER}${modelId.trim().toLowerCase()}`;

export const EMPTY_STREAM_USAGE_SNAPSHOT: StreamUsageSnapshot = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0
};

export const mergeUsageSnapshot = (previous: StreamUsageSnapshot, incoming: ChatUsage) => {
  const nextInputTokens = toTokenNumber(incoming.inputTokens);
  const nextOutputTokens = toTokenNumber(incoming.outputTokens);
  const nextCacheReadTokens = toTokenNumber(incoming.cacheReadTokens);
  const nextCacheWriteTokens = toTokenNumber(incoming.cacheWriteTokens);
  const nextTotalTokens = toTokenNumber(incoming.totalTokens);

  let resolvedInputTokens = nextInputTokens ?? previous.inputTokens;
  let resolvedOutputTokens = nextOutputTokens ?? previous.outputTokens;
  let resolvedTotalTokens = nextTotalTokens ?? previous.totalTokens;

  if (nextTotalTokens !== null) {
    if (nextOutputTokens === null) {
      resolvedOutputTokens = Math.max(0, nextTotalTokens - resolvedInputTokens);
    }
    if (nextInputTokens === null) {
      resolvedInputTokens = Math.max(0, nextTotalTokens - resolvedOutputTokens);
    }
  }

  const next: StreamUsageSnapshot = {
    inputTokens: resolvedInputTokens,
    outputTokens: resolvedOutputTokens,
    cacheReadTokens: nextCacheReadTokens ?? previous.cacheReadTokens,
    cacheWriteTokens: nextCacheWriteTokens ?? previous.cacheWriteTokens,
    totalTokens: resolvedTotalTokens
  };

  next.totalTokens = Math.max(next.totalTokens, next.inputTokens + next.outputTokens);

  const delta: StreamUsageSnapshot = {
    inputTokens: Math.max(0, next.inputTokens - previous.inputTokens),
    outputTokens: Math.max(0, next.outputTokens - previous.outputTokens),
    totalTokens: Math.max(0, next.totalTokens - previous.totalTokens),
    cacheReadTokens: Math.max(0, next.cacheReadTokens - previous.cacheReadTokens),
    cacheWriteTokens: Math.max(0, next.cacheWriteTokens - previous.cacheWriteTokens)
  };

  return { next, delta };
};

export const formatTokenCount = (value: number) => {
  const formatCompact = (raw: number, suffix: "k" | "m") => {
    const fixed = raw.toFixed(1);
    return `${fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed}${suffix}`;
  };
  if (value >= 1_000_000) {
    return formatCompact(value / 1_000_000, "m");
  }
  if (value >= 1_000) {
    return formatCompact(value / 1_000, "k");
  }
  return `${Math.round(value)}`;
};

export const estimateTokensFromCompletionMessages = (messages: ChatStreamRequest["messages"]) =>
  messages.reduce((total, message) => {
    const contentTokens = estimateTokensFromText(message.content);
    const attachmentTokens = (message.attachments ?? []).reduce(
      (attachmentTotal, attachment) => attachmentTotal + estimateTokensFromAttachment(attachment),
      0
    );
    // Include rough per-message protocol overhead.
    return total + contentTokens + attachmentTokens + 8;
  }, 0);

export const toProviderInputTokens = (usage?: ChatMessage["usage"]) => {
  if (!usage || usage.source !== "provider") {
    return 0;
  }
  return Math.max(0, usage.inputTokens);
};

export const formatEnvironmentWeatherLabel = (
  weather: EnvironmentWeatherSnapshot | undefined,
  temperatureUnit: AppSettings["environment"]["temperatureUnit"]
) => {
  if (!weather || weather.status === "unavailable") {
    return weather?.reason ? `Unavailable (${weather.reason})` : "Unavailable";
  }
  const metric = weather.temp === undefined ? "" : ` ${weather.temp}°${temperatureUnit.toUpperCase()}`;
  const staleLabel = weather.status === "stale" ? " (stale)" : "";
  return `${weather.summary ?? "Unknown"}${metric}${staleLabel}`.trim();
};

export const formatEnvironmentBatteryLabel = (snapshot: EnvironmentSnapshot | null) => {
  const battery = snapshot?.device.battery;
  if (!battery) {
    return "n/a";
  }
  const level = typeof battery.level === "number" ? `${battery.level}%` : "unknown";
  return `${level}, ${battery.charging ? "charging" : "discharging"}`;
};

export const formatEnvironmentMemoryLabel = (snapshot: EnvironmentSnapshot | null) => {
  const physicalMemory = snapshot?.device.system?.physicalMemory?.trim();
  if (physicalMemory) {
    return physicalMemory;
  }
  const memory = snapshot?.device.memory;
  if (!memory) {
    return "n/a";
  }
  return `${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}`;
};

export const formatEnvironmentStorageLabel = (snapshot: EnvironmentSnapshot | null) => {
  const storage = snapshot?.device.storage;
  if (!storage) {
    return "n/a";
  }
  return `${formatBytes(storage.usedBytes)} / ${formatBytes(storage.totalBytes)} (${storage.mountPath})`;
};

export const formatEnvironmentSystemLabel = (snapshot: EnvironmentSnapshot | null) => {
  const system = snapshot?.device.system;
  if (!system) {
    return "n/a";
  }
  const machine = system.machineName || system.machineModel || system.platform;
  return `${machine} ${system.version || system.release} (${system.arch})`;
};

export const formatEnvironmentChipLabel = (snapshot: EnvironmentSnapshot | null) => {
  const chip = snapshot?.device.system?.chip?.trim();
  return chip || "n/a";
};

export const isTextAttachment = (file: File) => {
  if (file.type.startsWith("text/") || TEXT_ATTACHMENT_MIME_TYPES.has(file.type)) {
    return true;
  }
  return TEXT_ATTACHMENT_EXTENSIONS.has(getExtension(file.name));
};

export const isAudioAttachment = (file: File) =>
  file.type.startsWith("audio/") || AUDIO_ATTACHMENT_EXTENSIONS.has(getExtension(file.name));

export const isVideoAttachment = (file: File) =>
  file.type.startsWith("video/") || VIDEO_ATTACHMENT_EXTENSIONS.has(getExtension(file.name));

export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("Failed to read file as data URL."));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file."));
    };
    reader.readAsDataURL(file);
  });

export const revokeAttachmentPreview = (attachment: { previewUrl?: string }) => {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
};

export const createSession = (title = "New Chat"): ChatSession => {
  const now = nowIso();
  return {
    id: createId(),
    title,
    createdAt: now,
    updatedAt: now,
    isPinned: false,
    messages: [],
    usageByModel: {}
  };
};

export const sessionToCompletionMessages = (
  messages: ChatMessage[]
): ChatStreamRequest["messages"] =>
  messages
    .map((message) => {
      const attachments = (message.attachments ?? []).filter(hasAttachmentPayload);
      return {
        role: message.role,
        content: message.content,
        attachments: attachments.length ? attachments : undefined
      };
    })
    .filter((message) => Boolean(message.content.trim()) || Boolean(message.attachments?.length));

export const limitCompletionMessagesByTurns = (
  messages: ChatStreamRequest["messages"],
  contextWindow: AppSettings["chatContextWindow"]
): ChatStreamRequest["messages"] => {
  if (contextWindow === "infinite") {
    return messages;
  }

  let userTurnCount = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role !== "user") {
      continue;
    }
    userTurnCount += 1;
    if (userTurnCount === contextWindow) {
      return messages.slice(index);
    }
  }

  return messages;
};

export const finalizeTitleFromPrompt = (prompt: string) => {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "New Chat";
  }
  return trimmed.length > 34 ? `${trimmed.slice(0, 34)}...` : trimmed;
};

export const ensureSessions = (value: ChatSession[]) => {
  const normalized = value.map(normalizeSession);
  return normalized.length ? normalized : [createSession()];
};

export const toSafeFileNameSegment = (value: string) => {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "chat-session";
};

export const sessionToMarkdown = (session: ChatSession) => {
  const createdAt = new Date(session.createdAt).toLocaleString();
  const updatedAt = new Date(session.updatedAt).toLocaleString();
  const lines: string[] = [
    `# ${session.title || "未命名会话"}`,
    "",
    `- 会话 ID: ${session.id}`,
    `- 创建时间: ${createdAt}`,
    `- 更新时间: ${updatedAt}`,
    "",
    "## 对话记录",
    ""
  ];

  if (!session.messages.length) {
    lines.push("_暂无消息_");
    lines.push("");
    return lines.join("\n");
  }

  session.messages.forEach((message, index) => {
    const roleLabel =
      message.role === "user" ? "用户" : message.role === "assistant" ? "助手" : "系统";
    lines.push(`### ${index + 1}. ${roleLabel} (${new Date(message.createdAt).toLocaleString()})`);
    lines.push("");
    lines.push(message.content.trim() ? message.content : "_空内容_");
    lines.push("");

    if (message.reasoningContent?.trim()) {
      lines.push("#### 推理内容");
      lines.push("");
      lines.push(message.reasoningContent);
      lines.push("");
    }

    if (message.toolCalls?.length) {
      lines.push("#### 工具调用");
      lines.push("");
      message.toolCalls.forEach((tc) => {
        const statusLabel = tc.status === "success" ? "✓" : tc.status === "error" ? "✗" : "…";
        lines.push(`- ${statusLabel} [${tc.serverName}] ${tc.toolName}${tc.message ? `: ${tc.message}` : ""}`);
      });
      lines.push("");
    }

    if (message.attachments?.length) {
      lines.push("#### 附件");
      message.attachments.forEach((attachment) => {
        lines.push(
          `- ${attachment.name} (${attachment.kind}, ${Math.max(
            0,
            Math.round(attachment.size / 1024)
          )}KB)`
        );
      });
      lines.push("");
    }
  });

  return lines.join("\n");
};
