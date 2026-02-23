import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { registerAgentIpcHandlers } from "./agent/agent-ipc";
import {
  listCodexAcpModels,
  runCodexCommand,
  spawnCodex
} from "./codex/codex-runtime";
import { getEnvironmentDeviceStatus, getEnvironmentWeatherSnapshot } from "./env/env-context-service";
import {
  getPersonaInjectionPayload,
  getPersonaMarkdownDocument,
  getPersonaSnapshot,
  ingestPersonaMessage,
  savePersonaMarkdownDocument
} from "./memory/persona-service";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
  type ChatAttachment,
  type ChatUsage,
  type ChatSession,
  type ChatStreamEvent,
  type ChatStreamRequest,
  type CompletionMessage,
  type ConnectionTestResult,
  type EnvironmentWeatherRequest,
  type PersonaIngestPayload,
  type PersonaInjectionPayload,
  type PersonaSnapshot,
  type ModelListResult,
  type StreamEnvelope
} from "../src/shared/contracts";

const STORE_DIR_NAME = "store";
const SETTINGS_FILE = "settings.json";
const SESSIONS_FILE = "sessions.json";
const STREAM_EVENT_CHANNEL = "chat:stream:event";
const MIN_REQUEST_TIMEOUT_MS = 5000;
const MAX_REQUEST_TIMEOUT_MS = 180000;
const MIN_RETRY_COUNT = 0;
const MAX_RETRY_COUNT = 3;
const APP_ICON_FILE = "tabler_brand-nuxt.png";

const streamControllers = new Map<string, AbortController>();

const createId = () => crypto.randomUUID();

const resolveAppIconPath = () => {
  const candidates = [
    path.join(app.getAppPath(), APP_ICON_FILE),
    path.resolve(__dirname, "..", APP_ICON_FILE),
    path.join(process.cwd(), APP_ICON_FILE)
  ];
  return candidates.find((candidate) => existsSync(candidate));
};

const ensureStoreDir = async () => {
  const storeDir = path.join(app.getPath("userData"), STORE_DIR_NAME);
  await mkdir(storeDir, { recursive: true });
  return storeDir;
};

const readJson = async <T>(filename: string, fallback: T): Promise<T> => {
  try {
    const storeDir = await ensureStoreDir();
    const filePath = path.join(storeDir, filename);
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
};

const writeJson = async (filename: string, value: unknown): Promise<void> => {
  const storeDir = await ensureStoreDir();
  const filePath = path.join(storeDir, filename);
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
};

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");
const normalizeApiKeyToken = (value: string) => value.trim().replace(/^['"]|['"]$/g, "");
const parseApiKeys = (raw: string) =>
  Array.from(
    new Set(
      raw
        .split(/[,\n]/)
        .map((entry) => normalizeApiKeyToken(entry))
        .filter(Boolean)
    )
  );
const resolveAnthropicEndpoint = (baseUrl: string, resource: "models" | "messages") => {
  const normalized = normalizeBaseUrl(baseUrl);
  const rooted = normalized
    .replace(/\/v1\/(messages|models)$/i, "")
    .replace(/\/(messages|models)$/i, "");
  return rooted.endsWith("/v1") ? `${rooted}/${resource}` : `${rooted}/v1/${resource}`;
};
const extractModelIds = (payload: unknown): string[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const source = payload as {
    data?: Array<{ id?: string; name?: string }>;
    models?: Array<string | { id?: string; name?: string }>;
    model_ids?: string[];
  };

  const fromData = Array.isArray(source.data)
    ? source.data
        .map((item) => item.id || item.name || "")
        .filter((value): value is string => Boolean(value))
    : [];

  const fromModels = Array.isArray(source.models)
    ? source.models
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }
          return item?.id || item?.name || "";
        })
        .filter((value): value is string => Boolean(value))
    : [];

  const fromModelIds = Array.isArray(source.model_ids)
    ? source.model_ids.filter((value): value is string => typeof value === "string")
    : [];

  return Array.from(new Set([...fromData, ...fromModels, ...fromModelIds])).sort((a, b) =>
    a.localeCompare(b)
  );
};

const isSettingsConfigured = (settings: AppSettings) => {
  if (settings.providerType === "acp") {
    return true;
  }
  if (settings.providerType === "claude-agent") {
    return Boolean(parseApiKeys(settings.apiKey).length && settings.model.trim());
  }
  return Boolean(settings.baseUrl.trim() && parseApiKeys(settings.apiKey).length && settings.model.trim());
};

const isConnectionConfigured = (settings: AppSettings) => {
  if (settings.providerType === "acp") {
    return true;
  }
  if (settings.providerType === "claude-agent") {
    return Boolean(parseApiKeys(settings.apiKey).length);
  }
  return Boolean(settings.baseUrl.trim() && parseApiKeys(settings.apiKey).length);
};

const clampInteger = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
};

const normalizeRequestTimeoutMs = (value: number) =>
  clampInteger(value, MIN_REQUEST_TIMEOUT_MS, MAX_REQUEST_TIMEOUT_MS, DEFAULT_SETTINGS.requestTimeoutMs);

const normalizeRetryCount = (value: number) =>
  clampInteger(value, MIN_RETRY_COUNT, MAX_RETRY_COUNT, DEFAULT_SETTINGS.retryCount);

const isAbortError = (error: unknown): error is Error =>
  error instanceof Error && error.name === "AbortError";

const runStreamWithTimeout = async (
  signal: AbortSignal,
  timeoutMs: number,
  execute: (attemptSignal: AbortSignal) => Promise<void>
) => {
  if (timeoutMs <= 0) {
    await execute(signal);
    return;
  }

  const attemptController = new AbortController();
  let didTimeout = false;
  const syncAbortState = () => {
    attemptController.abort();
  };

  if (signal.aborted) {
    attemptController.abort();
  } else {
    signal.addEventListener("abort", syncAbortState, { once: true });
  }

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    attemptController.abort();
  }, timeoutMs);

  try {
    await execute(attemptController.signal);
  } catch (error) {
    if (didTimeout && isAbortError(error)) {
      throw new Error(`Request timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener("abort", syncAbortState);
  }
};

const createSseDebugLogger =
  (enabled: boolean, streamId: string) =>
  (...parts: unknown[]) => {
    if (!enabled) {
      return;
    }
    console.info(`[sse:${streamId}]`, ...parts);
  };

const readString = (value: unknown) => (typeof value === "string" ? value : "");

const extractTextFromUnknown = (value: unknown): string => {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }
        if (entry && typeof entry === "object") {
          const block = entry as { text?: unknown; content?: unknown };
          return readString(block.text) || readString(block.content);
        }
        return "";
      })
      .join("");
  }
  if (typeof value === "object") {
    const block = value as { text?: unknown; content?: unknown };
    return readString(block.text) || readString(block.content);
  }
  return "";
};

const extractOpenAiLikeDeltas = (delta: unknown): { content: string; reasoning: string } => {
  if (!delta || typeof delta !== "object") {
    return { content: "", reasoning: "" };
  }

  const source = delta as {
    content?: unknown;
    reasoning_content?: unknown;
    reasoning?: unknown;
    reasoningContent?: unknown;
    thinking?: unknown;
  };

  return {
    content: extractTextFromUnknown(source.content),
    reasoning:
      extractTextFromUnknown(source.reasoning_content) ||
      extractTextFromUnknown(source.reasoningContent) ||
      extractTextFromUnknown(source.reasoning) ||
      extractTextFromUnknown(source.thinking)
  };
};

const extractAnthropicDeltas = (payload: unknown): { content: string; reasoning: string } => {
  if (!payload || typeof payload !== "object") {
    return { content: "", reasoning: "" };
  }

  const source = payload as {
    delta?: {
      type?: unknown;
      text?: unknown;
      thinking?: unknown;
    };
  };

  const delta = source.delta;
  if (!delta || typeof delta !== "object") {
    return { content: "", reasoning: "" };
  }

  const deltaType = readString((delta as { type?: unknown }).type);
  const text = readString((delta as { text?: unknown }).text);
  const thinking = readString((delta as { thinking?: unknown }).thinking);

  if (deltaType === "thinking_delta") {
    return { content: "", reasoning: thinking };
  }

  return { content: text, reasoning: thinking };
};

const toTokenNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
};

const pickLargestTokenNumber = (...values: unknown[]) => {
  let resolved: number | undefined;
  for (const value of values) {
    const token = toTokenNumber(value);
    if (token === undefined) {
      continue;
    }
    resolved = resolved === undefined ? token : Math.max(resolved, token);
  }
  return resolved;
};

const readNestedTokenNumber = (
  source: Record<string, unknown>,
  key: string,
  nestedKey: string
) => {
  const nested = source[key];
  if (!nested || typeof nested !== "object") {
    return undefined;
  }
  return toTokenNumber((nested as Record<string, unknown>)[nestedKey]);
};

const extractOpenAiUsage = (payload: unknown): ChatUsage | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const source = payload as { usage?: Record<string, unknown> };
  if (!source.usage || typeof source.usage !== "object") {
    return undefined;
  }

  const usage = source.usage;
  const inputTokens = toTokenNumber(usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens);
  const outputTokens = toTokenNumber(
    usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens
  );
  const totalTokens = toTokenNumber(usage.total_tokens ?? usage.totalTokens);
  const cacheReadTokens = pickLargestTokenNumber(
    usage.cached_tokens,
    usage.cache_read_input_tokens,
    readNestedTokenNumber(usage, "prompt_tokens_details", "cached_tokens"),
    readNestedTokenNumber(usage, "input_tokens_details", "cached_tokens")
  );
  const cacheWriteTokens = toTokenNumber(usage.cache_creation_input_tokens);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens,
    cacheWriteTokens
  };
};

const extractAnthropicUsage = (payload: unknown): ChatUsage | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const source = payload as {
    usage?: Record<string, unknown>;
    message?: { usage?: Record<string, unknown> };
    delta?: { usage?: Record<string, unknown> };
  };
  const usageSource = source.usage ?? source.message?.usage ?? source.delta?.usage;
  if (!usageSource || typeof usageSource !== "object") {
    return undefined;
  }

  const inputTokens = toTokenNumber(usageSource.input_tokens ?? usageSource.inputTokens);
  const outputTokens = toTokenNumber(usageSource.output_tokens ?? usageSource.outputTokens);
  const cacheReadTokens = toTokenNumber(
    usageSource.cache_read_input_tokens ?? usageSource.cacheReadTokens
  );
  const cacheWriteTokens = toTokenNumber(
    usageSource.cache_creation_input_tokens ?? usageSource.cacheWriteTokens
  );
  const totalTokens = toTokenNumber(usageSource.total_tokens ?? usageSource.totalTokens);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      totalTokens ??
      (inputTokens !== undefined || outputTokens !== undefined
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined),
    cacheReadTokens,
    cacheWriteTokens
  };
};

const extractGenericUsage = (payload: unknown): ChatUsage | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const source = payload as Record<string, unknown>;
  const usageSource =
    (source.usage && typeof source.usage === "object" ? (source.usage as Record<string, unknown>) : null) ??
    (source.turn && typeof source.turn === "object"
      ? (((source.turn as Record<string, unknown>).usage as Record<string, unknown> | undefined) ?? null)
      : null) ??
    (source.result && typeof source.result === "object"
      ? (((source.result as Record<string, unknown>).usage as Record<string, unknown> | undefined) ?? null)
      : null);

  if (!usageSource) {
    return undefined;
  }

  const inputTokens = toTokenNumber(
    usageSource.input_tokens ??
      usageSource.inputTokens ??
      usageSource.prompt_tokens ??
      usageSource.promptTokens
  );
  const outputTokens = toTokenNumber(
    usageSource.output_tokens ??
      usageSource.outputTokens ??
      usageSource.completion_tokens ??
      usageSource.completionTokens
  );
  const totalTokens = toTokenNumber(usageSource.total_tokens ?? usageSource.totalTokens);
  const cacheReadTokens = pickLargestTokenNumber(
    usageSource.cache_read_input_tokens,
    usageSource.cacheReadTokens,
    usageSource.cached_tokens,
    readNestedTokenNumber(usageSource, "prompt_tokens_details", "cached_tokens"),
    readNestedTokenNumber(usageSource, "input_tokens_details", "cached_tokens")
  );
  const cacheWriteTokens = toTokenNumber(
    usageSource.cache_creation_input_tokens ?? usageSource.cacheWriteTokens
  );

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined &&
    cacheReadTokens === undefined &&
    cacheWriteTokens === undefined
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      totalTokens ??
      (inputTokens !== undefined || outputTokens !== undefined
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : undefined),
    cacheReadTokens,
    cacheWriteTokens
  };
};

const logProviderUsage = (
  streamId: string,
  providerType: AppSettings["providerType"],
  source: string,
  usage: ChatUsage,
  providerPayload: unknown,
  rawData: string
) => {
  console.info("[chat][provider:usage]", {
    streamId,
    providerType,
    source,
    usage,
    providerPayload,
    rawData
  });
};

const logProviderUsageMissing = (
  streamId: string,
  providerType: AppSettings["providerType"],
  source: string,
  reason: string,
  providerPayload: unknown,
  rawData: string
) => {
  console.info("[chat][provider:usage-missing]", {
    streamId,
    providerType,
    source,
    reason,
    providerPayload,
    rawData
  });
};

const REQUEST_LOG_STRING_LIMIT = 1600;
const REQUEST_LOG_ARRAY_LIMIT = 40;
const REQUEST_LOG_OBJECT_KEY_LIMIT = 40;
const REQUEST_LOG_MAX_DEPTH = 8;

const truncateForLog = (value: string) =>
  value.length > REQUEST_LOG_STRING_LIMIT
    ? `${value.slice(0, REQUEST_LOG_STRING_LIMIT)}...[truncated ${
        value.length - REQUEST_LOG_STRING_LIMIT
      } chars]`
    : value;

const toRequestPreview = (value: unknown, depth = 0): unknown => {
  if (typeof value === "string") {
    return truncateForLog(value);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (depth >= REQUEST_LOG_MAX_DEPTH) {
    return "[max-depth]";
  }
  if (Array.isArray(value)) {
    const items = value
      .slice(0, REQUEST_LOG_ARRAY_LIMIT)
      .map((entry) => toRequestPreview(entry, depth + 1));
    if (value.length > REQUEST_LOG_ARRAY_LIMIT) {
      items.push(`[+${value.length - REQUEST_LOG_ARRAY_LIMIT} items omitted]`);
    }
    return items;
  }

  const source = value as Record<string, unknown>;
  const entries = Object.entries(source).slice(0, REQUEST_LOG_OBJECT_KEY_LIMIT);
  const preview = Object.fromEntries(
    entries.map(([key, entry]) => [key, toRequestPreview(entry, depth + 1)] as const)
  );
  if (Object.keys(source).length > REQUEST_LOG_OBJECT_KEY_LIMIT) {
    return {
      ...preview,
      __omittedKeys: Object.keys(source).length - REQUEST_LOG_OBJECT_KEY_LIMIT
    };
  }
  return preview;
};

const logChatRequestPayload = (
  streamId: string,
  providerType: AppSettings["providerType"],
  source: string,
  requestPayload: unknown
) => {
  console.info("[chat][provider:request]", {
    streamId,
    providerType,
    source,
    requestPayload: toRequestPreview(requestPayload)
  });
};

const toAttachmentMetaText = (attachment: ChatAttachment) =>
  `[Attachment: ${attachment.name} | ${attachment.mimeType || "unknown"} | ${attachment.size} bytes]`;

const toTextAttachmentBlock = (attachment: ChatAttachment) =>
  `${toAttachmentMetaText(attachment)}\n${attachment.textContent?.trim() ?? ""}`;

const parseDataUrl = (dataUrl: string) => {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    return null;
  }
  return { mediaType: match[1], data: match[2] };
};

const buildOpenAiMessageContent = (message: CompletionMessage) => {
  const parts: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = [];

  const prompt = message.content.trim();
  if (prompt) {
    parts.push({ type: "text", text: prompt });
  }

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === "text" && attachment.textContent?.trim()) {
      parts.push({ type: "text", text: toTextAttachmentBlock(attachment) });
      continue;
    }

    if (attachment.kind === "image" && attachment.imageDataUrl?.trim()) {
      parts.push({
        type: "image_url",
        image_url: { url: attachment.imageDataUrl.trim() }
      });
      continue;
    }

    parts.push({ type: "text", text: toAttachmentMetaText(attachment) });
  }

  if (!parts.length) {
    return null;
  }
  if (parts.length === 1 && parts[0].type === "text") {
    return parts[0].text;
  }
  return parts;
};

const toOpenAiStreamMessages = (messages: CompletionMessage[]) =>
  messages
    .map((message) => {
      const content = buildOpenAiMessageContent(message);
      if (!content) {
        return null;
      }
      return {
        role: message.role,
        content
      };
    })
    .filter(
      (
        message
      ): message is {
        role: CompletionMessage["role"];
        content:
          | string
          | Array<
              { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
            >;
      } => Boolean(message)
    );

const toAnthropicContentBlocks = (message: CompletionMessage) => {
  const blocks: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  > = [];

  const prompt = message.content.trim();
  if (prompt) {
    blocks.push({ type: "text", text: prompt });
  }

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === "text" && attachment.textContent?.trim()) {
      blocks.push({ type: "text", text: toTextAttachmentBlock(attachment) });
      continue;
    }

    if (attachment.kind === "image" && attachment.imageDataUrl?.trim()) {
      const source = parseDataUrl(attachment.imageDataUrl);
      if (source) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: source.mediaType,
            data: source.data
          }
        });
        continue;
      }
    }

    blocks.push({ type: "text", text: toAttachmentMetaText(attachment) });
  }

  return blocks;
};

const formatMessageForAcpTurn = (message: CompletionMessage) => {
  const blocks: string[] = [];
  if (message.content.trim()) {
    blocks.push(message.content.trim());
  }

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === "text" && attachment.textContent?.trim()) {
      blocks.push(toTextAttachmentBlock(attachment));
      continue;
    }
    blocks.push(toAttachmentMetaText(attachment));
  }

  return blocks.join("\n\n").trim();
};

const formatMessagesForAcpTurn = (payload: ChatStreamRequest) =>
  payload.messages
    .map((message) => ({
      role: message.role.toUpperCase(),
      content: formatMessageForAcpTurn(message)
    }))
    .filter((message) => Boolean(message.content))
    .map((message) => `[${message.role}]\n${message.content}`)
    .join("\n\n");

const fetchModelIds = async (settings: AppSettings): Promise<ModelListResult> => {
  if (settings.providerType === "acp") {
    try {
      const models = await listCodexAcpModels({
        appVersion: app.getVersion(),
        createId
      });
      return {
        ok: true,
        message: models.length
          ? `Fetched ${models.length} ACP model(s).`
          : "ACP runtime is reachable, but no models were returned.",
        models
      };
    } catch (error) {
      return {
        ok: false,
        message: `Failed to fetch ACP models. ${error instanceof Error ? error.message : "Unknown error."}`,
        models: []
      };
    }
  }

  const baseUrl = normalizeBaseUrl(
    settings.baseUrl || (settings.providerType === "claude-agent" ? "https://api.anthropic.com" : "")
  );
  const apiKeys = parseApiKeys(settings.apiKey);
  if (!baseUrl || !apiKeys.length) {
    return settings.providerType === "claude-agent"
      ? { ok: false, message: "Please fill API key.", models: [] }
      : { ok: false, message: "Please fill Base URL and API key.", models: [] };
  }

  const isAnthropic = settings.providerType === "anthropic" || settings.providerType === "claude-agent";
  const attempts: Array<{ endpoint: string; headers: Record<string, string> }> = isAnthropic
    ? apiKeys.flatMap((apiKey) => [
        {
          endpoint: resolveAnthropicEndpoint(baseUrl, "models"),
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } as Record<
            string,
            string
          >
        },
        {
          endpoint: `${baseUrl}/models`,
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } as Record<
            string,
            string
          >
        },
        {
          endpoint: resolveAnthropicEndpoint(baseUrl, "models"),
          headers: { Authorization: `Bearer ${apiKey}` } as Record<string, string>
        },
        {
          endpoint: `${baseUrl}/models`,
          headers: { Authorization: `Bearer ${apiKey}` } as Record<string, string>
        }
      ])
    : apiKeys.map((apiKey) => ({
        endpoint: `${baseUrl}/models`,
        headers: { Authorization: `Bearer ${apiKey}` } as Record<string, string>
      }));

  let lastFailure = "Unknown error.";

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.endpoint, { headers: attempt.headers });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        lastFailure = `HTTP ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`;
        continue;
      }

      const parsed = (await response.json().catch(() => null)) as unknown;
      const models = extractModelIds(parsed);
      return {
        ok: true,
        message: models.length
          ? `Fetched ${models.length} model(s).`
          : "Connected, but provider returned no model list.",
        models
      };
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "Network request failed.";
    }
  }

  return {
    ok: false,
    message: `Failed to fetch models. ${lastFailure}`,
    models: []
  };
};

const sendStreamEvent = (
  sender: IpcMainInvokeEvent["sender"],
  streamId: string,
  event: ChatStreamEvent
) => {
  const payload: StreamEnvelope = { streamId, event };
  sender.send(STREAM_EVENT_CHANNEL, payload);
};

const streamOpenAICompatible = async (
  sender: IpcMainInvokeEvent["sender"],
  streamId: string,
  payload: ChatStreamRequest,
  apiKey: string,
  signal: AbortSignal,
  onDelta?: () => void
) => {
  const baseUrl = normalizeBaseUrl(payload.settings.baseUrl);
  const requestBody = {
    model: payload.settings.model.trim(),
    stream: true,
    stream_options: { include_usage: true },
    messages: toOpenAiStreamMessages(payload.messages)
  };
  logChatRequestPayload(streamId, payload.settings.providerType, "openai-sse", requestBody);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody),
    signal
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Provider returned HTTP ${response.status}${body ? `: ${body}` : ""}`);
  }
  if (!response.body) {
    throw new Error("Provider response has no stream body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneSent = false;
  let sawUsage = false;
  let usageMissingLogged = false;
  let lastProviderPayload: unknown = null;
  let lastRawData = "";

  const reportUsageMissing = (reason: string, providerPayload: unknown, rawData: string) => {
    if (sawUsage || usageMissingLogged) {
      return;
    }
    usageMissingLogged = true;
    logProviderUsageMissing(
      streamId,
      payload.settings.providerType,
      "openai-sse",
      reason,
      providerPayload,
      rawData
    );
  };

  const emitDone = () => {
    if (!doneSent) {
      doneSent = true;
      sendStreamEvent(sender, streamId, { type: "done" });
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      reportUsageMissing("stream-closed", lastProviderPayload, lastRawData);
      emitDone();
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        reportUsageMissing("done-marker", lastProviderPayload, data);
        emitDone();
        return;
      }

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: unknown; finish_reason?: string }>;
          error?: { message?: string };
          usage?: Record<string, unknown>;
        };
        lastProviderPayload = parsed;
        lastRawData = data;

        if (parsed.error?.message) {
          sendStreamEvent(sender, streamId, {
            type: "error",
            message: parsed.error.message
          });
          emitDone();
          return;
        }

        const { content, reasoning } = extractOpenAiLikeDeltas(parsed.choices?.[0]?.delta);
        const usage = extractOpenAiUsage(parsed);
        if (usage) {
          sawUsage = true;
          logProviderUsage(streamId, payload.settings.providerType, "openai-sse", usage, parsed, data);
          sendStreamEvent(sender, streamId, { type: "usage", usage });
        }
        if (content) {
          onDelta?.();
          sendStreamEvent(sender, streamId, { type: "delta", delta: content });
        }
        if (reasoning) {
          onDelta?.();
          sendStreamEvent(sender, streamId, { type: "reasoning", delta: reasoning });
        }

        if (parsed.choices?.[0]?.finish_reason) {
          // OpenAI-compatible providers may send usage in a trailing chunk after finish_reason.
          continue;
        }
      } catch {
        continue;
      }
    }
  }
};

const streamAnthropic = async (
  sender: IpcMainInvokeEvent["sender"],
  streamId: string,
  payload: ChatStreamRequest,
  apiKey: string,
  signal: AbortSignal,
  onDelta?: () => void
) => {
  const endpoint = resolveAnthropicEndpoint(payload.settings.baseUrl, "messages");
  const systemPrompt = payload.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join("\n\n");
  const anthropicMessages = payload.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: toAnthropicContentBlocks(message)
    }));
  const normalizedAnthropicMessages = anthropicMessages.filter((message) => message.content.length);
  const requestBody = {
    model: payload.settings.model.trim(),
    stream: true,
    max_tokens: payload.settings.maxTokens,
    temperature: payload.settings.temperature,
    system: systemPrompt || undefined,
    messages: normalizedAnthropicMessages
  };
  logChatRequestPayload(streamId, payload.settings.providerType, "anthropic-sse", requestBody);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(requestBody),
    signal
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Provider returned HTTP ${response.status}${body ? `: ${body}` : ""}`);
  }
  if (!response.body) {
    throw new Error("Provider response has no stream body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneSent = false;
  let sawUsage = false;
  let usageMissingLogged = false;
  let lastProviderPayload: unknown = null;
  let lastRawData = "";

  const reportUsageMissing = (reason: string, providerPayload: unknown, rawData: string) => {
    if (sawUsage || usageMissingLogged) {
      return;
    }
    usageMissingLogged = true;
    logProviderUsageMissing(
      streamId,
      payload.settings.providerType,
      "anthropic-sse",
      reason,
      providerPayload,
      rawData
    );
  };

  const emitDone = () => {
    if (!doneSent) {
      doneSent = true;
      sendStreamEvent(sender, streamId, { type: "done" });
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      reportUsageMissing("stream-closed", lastProviderPayload, lastRawData);
      emitDone();
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") {
        reportUsageMissing("done-marker", lastProviderPayload, data || "[EMPTY]");
        emitDone();
        return;
      }

      try {
        const parsed = JSON.parse(data) as {
          type?: string;
          usage?: Record<string, unknown>;
          message?: { usage?: Record<string, unknown> };
          delta?: {
            usage?: Record<string, unknown>;
            type?: string;
            text?: string;
            thinking?: string;
          };
          error?: { message?: string };
        };
        lastProviderPayload = parsed;
        lastRawData = data;

        if (parsed.type === "error") {
          sendStreamEvent(sender, streamId, {
            type: "error",
            message: parsed.error?.message || "Streaming failed."
          });
          emitDone();
          return;
        }

        const { content, reasoning } = extractAnthropicDeltas(parsed);
        const usage = extractAnthropicUsage(parsed);
        if (usage) {
          sawUsage = true;
          logProviderUsage(streamId, payload.settings.providerType, "anthropic-sse", usage, parsed, data);
          sendStreamEvent(sender, streamId, { type: "usage", usage });
        }
        if (content) {
          onDelta?.();
          sendStreamEvent(sender, streamId, { type: "delta", delta: content });
        }
        if (reasoning) {
          onDelta?.();
          sendStreamEvent(sender, streamId, { type: "reasoning", delta: reasoning });
        }

        if (parsed.type === "message_stop") {
          reportUsageMissing("message-stop-without-usage", parsed, data);
          emitDone();
          return;
        }
      } catch {
        continue;
      }
    }
  }
};

const streamCodexAcp = async (
  sender: IpcMainInvokeEvent["sender"],
  streamId: string,
  payload: ChatStreamRequest,
  _apiKey: string,
  signal: AbortSignal,
  onDelta?: () => void
) => {
  const turnInput = formatMessagesForAcpTurn(payload);
  if (!turnInput) {
    throw new Error("No message content to send.");
  }

  const child = spawnCodex(["app-server", "--listen", "stdio://"]);

  let stderr = "";
  let stdoutBuffer = "";
  let doneSent = false;
  let settled = false;
  let emittedAnyDelta = false;
  let sawUsage = false;
  let usageMissingLogged = false;

  const reportUsageMissing = (reason: string, providerPayload: unknown, rawData: string) => {
    if (sawUsage || usageMissingLogged) {
      return;
    }
    usageMissingLogged = true;
    logProviderUsageMissing(
      streamId,
      payload.settings.providerType,
      "acp-rpc",
      reason,
      providerPayload,
      rawData
    );
  };

  const emitDone = () => {
    if (!doneSent) {
      doneSent = true;
      sendStreamEvent(sender, streamId, { type: "done" });
    }
  };

  const emitError = (message: string) => {
    sendStreamEvent(sender, streamId, { type: "error", message });
  };

  const initializeId = createId();
  const chatStartId = createId();
  const turnStartId = createId();

  const writeRpc = (envelope: unknown) => {
    if (!child.stdin.writable) {
      return;
    }
    try {
      child.stdin.write(`${JSON.stringify(envelope)}\n`);
    } catch {
      // Ignore write errors; process close/error handlers surface the final status.
    }
  };

  const cleanup = () => {
    signal.removeEventListener("abort", onAbort);
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  };

  const settleResolve = (resolve: () => void) => {
    if (settled) {
      return;
    }
    settled = true;
    cleanup();
    resolve();
  };

  const settleReject = (reject: (error: Error) => void, error: Error) => {
    if (settled) {
      return;
    }
    settled = true;
    cleanup();
    reject(error);
  };

  const onAbort = () => {
    if (child.killed) {
      return;
    }
    child.kill("SIGTERM");
  };

  if (signal.aborted) {
    child.kill("SIGTERM");
    throw Object.assign(new Error("Aborted"), { name: "AbortError" });
  }
  signal.addEventListener("abort", onAbort, { once: true });

  await new Promise<void>((resolve, reject) => {
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf-8")}`.slice(-4000);
    });

    child.on("error", (error) => {
      settleReject(reject, new Error(`Failed to start codex ACP runtime: ${error.message}`));
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      if (signal.aborted) {
        settleReject(reject, Object.assign(new Error("Aborted"), { name: "AbortError" }));
        return;
      }
      const detail = stderr.trim().slice(0, 240);
      const suffix = detail ? `: ${detail}` : "";
      settleReject(reject, new Error(`Codex ACP process exited (${code ?? "unknown"})${suffix}`));
    });

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString("utf-8");
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        let parsed: {
          id?: string;
          method?: string;
          params?: Record<string, unknown>;
          result?: Record<string, unknown>;
          error?: { message?: string };
        };

        try {
          parsed = JSON.parse(trimmed) as typeof parsed;
        } catch {
          continue;
        }

        if (parsed.error?.message) {
          settleReject(reject, new Error(parsed.error.message));
          return;
        }

        if (parsed.id === initializeId) {
          writeRpc({ method: "initialized" });
          writeRpc({
            method: "thread/start",
            id: chatStartId,
            params: {
              model: payload.settings.model.trim() || null,
              modelProvider: null,
              cwd: process.cwd(),
              approvalPolicy: null,
              sandbox: null,
              config: null,
              baseInstructions: null,
              developerInstructions: null,
              personality: null,
              ephemeral: true,
              experimentalRawEvents: false,
              persistExtendedHistory: false
            }
          });
          continue;
        }

        if (parsed.id === chatStartId) {
          const chatId = parsed.result?.thread && typeof parsed.result.thread === "object"
            ? (parsed.result.thread as { id?: string }).id
            : null;
          if (!chatId) {
            settleReject(reject, new Error("ACP start did not return a chat id."));
            return;
          }
          const turnStartParams = {
            threadId: chatId,
            input: [{ type: "text", text: turnInput, text_elements: [] }],
            cwd: process.cwd(),
            approvalPolicy: null,
            sandboxPolicy: null,
            model: payload.settings.model.trim() || null,
            effort: null,
            summary: null,
            personality: null,
            outputSchema: null,
            collaborationMode: null
          };
          logChatRequestPayload(streamId, payload.settings.providerType, "acp:turn/start", turnStartParams);
          writeRpc({
            method: "turn/start",
            id: turnStartId,
            params: turnStartParams
          });
          continue;
        }

        if (parsed.id === turnStartId) {
          continue;
        }

        if (parsed.method === "item/agentMessage/delta") {
          const delta = parsed.params?.delta;
          if (typeof delta === "string" && delta) {
            emittedAnyDelta = true;
            onDelta?.();
            sendStreamEvent(sender, streamId, { type: "delta", delta });
          }
          continue;
        }

        if (
          typeof parsed.method === "string" &&
          parsed.method.endsWith("/delta") &&
          (parsed.method.includes("reason") || parsed.method.includes("thinking"))
        ) {
          const delta = parsed.params?.delta;
          if (typeof delta === "string" && delta) {
            emittedAnyDelta = true;
            onDelta?.();
            sendStreamEvent(sender, streamId, { type: "reasoning", delta });
          }
          continue;
        }

        if (parsed.method === "item/completed") {
          const item = parsed.params?.item as
            | { type?: string; content?: Array<{ type?: string; text?: string }> }
            | undefined;
          if (!emittedAnyDelta && item?.type === "agentMessage" && Array.isArray(item.content)) {
            const text = item.content
              .filter((part) => part?.type === "text" && typeof part.text === "string")
              .map((part) => part.text ?? "")
              .join("");
            if (text) {
              emittedAnyDelta = true;
              onDelta?.();
              sendStreamEvent(sender, streamId, { type: "delta", delta: text });
            }
          }
          continue;
        }

        if (parsed.method && parsed.method.toLowerCase().includes("usage")) {
          const usage = extractGenericUsage(parsed.params ?? parsed.result);
          if (usage) {
            sawUsage = true;
            logProviderUsage(
              streamId,
              payload.settings.providerType,
              `acp:${parsed.method}`,
              usage,
              parsed,
              trimmed
            );
            sendStreamEvent(sender, streamId, { type: "usage", usage });
          }
          continue;
        }

        if (parsed.method === "error") {
          const errorPayload = parsed.params?.error as { message?: string } | undefined;
          const retrying = parsed.params?.willRetry === true;
          if (!retrying) {
            emitError(errorPayload?.message || "ACP streaming failed.");
            emitDone();
            settleResolve(resolve);
            return;
          }
          continue;
        }

        if (parsed.method === "turn/completed") {
          const turn = parsed.params?.turn as
            | { status?: string; error?: { message?: string } | null; usage?: Record<string, unknown> }
            | undefined;
          const usage = extractGenericUsage(turn ?? parsed.params);
          if (usage) {
            sawUsage = true;
            logProviderUsage(
              streamId,
              payload.settings.providerType,
              "acp:turn/completed",
              usage,
              parsed,
              trimmed
            );
            sendStreamEvent(sender, streamId, { type: "usage", usage });
          } else {
            reportUsageMissing("turn-completed-without-usage", parsed, trimmed);
          }
          const status = turn?.status;
          if (status && status !== "completed") {
            emitError(turn?.error?.message || "ACP turn failed.");
          }
          emitDone();
          settleResolve(resolve);
          return;
        }
      }
    });

    writeRpc({
      method: "initialize",
      id: initializeId,
      params: {
        clientInfo: {
          name: "echo-desktop",
          title: "Echo Desktop",
          version: app.getVersion()
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: null
        }
      }
    });
  });
};

const registerIpcHandlers = () => {
  ipcMain.handle("settings:get", async () => {
    const saved = await readJson<Partial<AppSettings>>(SETTINGS_FILE, {});
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...saved });
  });

  ipcMain.handle("settings:save", async (_, settings: AppSettings) => {
    await writeJson(SETTINGS_FILE, normalizeSettings(settings));
  });

  ipcMain.handle(
    "settings:testConnection",
    async (_, settings: AppSettings): Promise<ConnectionTestResult> => {
      if (settings.providerType === "acp") {
        const result = await runCodexCommand(["--version"]);
        return {
          ok: result.ok,
          message: result.ok ? `Codex runtime is available (${result.message}).` : result.message
        };
      }

      if (!isConnectionConfigured(settings)) {
        return settings.providerType === "claude-agent"
          ? { ok: false, message: "Please fill API key for Claude Agent provider." }
          : { ok: false, message: "Please fill Base URL and API key." };
      }
      const result = await fetchModelIds(settings);
      if (!result.ok) {
        return { ok: false, message: result.message };
      }
      return { ok: true, message: "Connection succeeded." };
    }
  );

  ipcMain.handle("settings:listModels", async (_, settings: AppSettings): Promise<ModelListResult> =>
    fetchModelIds(settings)
  );

  ipcMain.handle(
    "env:getWeatherSnapshot",
    async (_, payload: EnvironmentWeatherRequest) => getEnvironmentWeatherSnapshot(payload)
  );

  ipcMain.handle("env:getSystemStatus", async () => getEnvironmentDeviceStatus());

  ipcMain.handle("sessions:get", async () => readJson<ChatSession[]>(SESSIONS_FILE, []));

  ipcMain.handle("sessions:save", async (_, sessions: ChatSession[]) => {
    await writeJson(SESSIONS_FILE, sessions);
  });

  ipcMain.handle("persona:getSnapshot", async (): Promise<PersonaSnapshot> => getPersonaSnapshot());

  ipcMain.handle("persona:getMarkdown", async (): Promise<string> => getPersonaMarkdownDocument());

  ipcMain.handle(
    "persona:saveMarkdown",
    async (_, markdown: string): Promise<PersonaSnapshot> => savePersonaMarkdownDocument(markdown)
  );

  ipcMain.handle(
    "persona:getInjectionPayload",
    async (): Promise<PersonaInjectionPayload> => getPersonaInjectionPayload()
  );

  ipcMain.handle("persona:ingestMessage", async (_, payload: PersonaIngestPayload) => {
    await ingestPersonaMessage(payload);
  });

  ipcMain.handle(
    "chat:startStream",
    async (event, payload: ChatStreamRequest): Promise<{ streamId: string }> => {
      if (payload.settings.providerType === "claude-agent") {
        throw new Error("Claude Agent provider is only available in Agent mode.");
      }
      if (!isSettingsConfigured(payload.settings)) {
        throw new Error("Provider settings are incomplete.");
      }
      const streamId = createId();
      const controller = new AbortController();
      streamControllers.set(streamId, controller);

      const stream =
        payload.settings.providerType === "acp"
          ? streamCodexAcp
          : payload.settings.providerType === "anthropic"
            ? streamAnthropic
            : streamOpenAICompatible;
      const timeoutMs = normalizeRequestTimeoutMs(payload.settings.requestTimeoutMs);
      const retryCount = normalizeRetryCount(payload.settings.retryCount);
      const apiKeys =
        payload.settings.providerType === "acp" ? ["__acp__"] : parseApiKeys(payload.settings.apiKey);
      const maxAttempts =
        payload.settings.providerType === "acp" ? 1 : Math.max(retryCount + 1, apiKeys.length);
      const debug = createSseDebugLogger(Boolean(payload.settings.sseDebug), streamId);

      void (async () => {
        let attempt = 0;

        while (attempt < maxAttempts) {
          let emittedDelta = false;
          const attemptNumber = attempt + 1;
          const apiKey = apiKeys[attempt % apiKeys.length];
          debug(`attempt ${attemptNumber}/${maxAttempts} started`, {
            apiKeySlot:
              payload.settings.providerType === "acp"
                ? "ACP"
                : `${(attempt % apiKeys.length) + 1}/${apiKeys.length}`
          });

          try {
            await runStreamWithTimeout(controller.signal, timeoutMs, (attemptSignal) =>
              stream(event.sender, streamId, payload, apiKey, attemptSignal, () => {
                emittedDelta = true;
              })
            );
            debug(`attempt ${attemptNumber} completed`, { emittedDelta });
            return;
          } catch (error) {
            if (controller.signal.aborted && isAbortError(error)) {
              debug("aborted by user");
              sendStreamEvent(event.sender, streamId, { type: "done" });
              return;
            }

            const message = error instanceof Error ? error.message : "Streaming failed.";
            const shouldRetry = attempt + 1 < maxAttempts && !emittedDelta;
            debug(`attempt ${attemptNumber} failed`, { message, emittedDelta, shouldRetry });
            if (shouldRetry) {
              attempt += 1;
              continue;
            }

            sendStreamEvent(event.sender, streamId, { type: "error", message });
            return;
          }
        }
      })()
        .finally(() => {
          streamControllers.delete(streamId);
        });

      return { streamId };
    }
  );

  ipcMain.handle("chat:stopStream", async (_, streamId: string) => {
    const controller = streamControllers.get(streamId);
    if (controller) {
      controller.abort();
      streamControllers.delete(streamId);
    }
  });
};

const createMainWindow = () => {
  const preloadPath = path.join(__dirname, "preload.cjs");
  const iconPath = resolveAppIconPath();
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 680,
    minHeight: 450,
    backgroundColor: "#f3f5f8",
    titleBarStyle: "hiddenInset",
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    return;
  }

  const rendererPath = path.join(app.getAppPath(), "dist", "index.html");
  void mainWindow.loadFile(rendererPath);
};

app.whenReady().then(() => {
  const iconPath = resolveAppIconPath();
  if (iconPath && process.platform === "darwin") {
    app.dock?.setIcon(iconPath);
  }

  registerIpcHandlers();
  registerAgentIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
