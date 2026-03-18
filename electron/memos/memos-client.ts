import { type AppSettings, type ConnectionTestResult, type MemosAddPayload, type MemosAddResult, type MemosSearchPayload, type MemosSearchResult } from "../../src/shared/contracts";
import { normalizeSettings } from "../../src/domain/settings/normalize";
import { normalizeBaseUrl } from "../../src/domain/provider/utils";

const isAbortError = (error: unknown): error is Error =>
  error instanceof Error && error.name === "AbortError";

const isMemosConfigured = (settings: AppSettings) =>
  Boolean(
    settings.memos.enabled &&
      settings.memos.baseUrl.trim() &&
      settings.memos.apiKey.trim() &&
      settings.memos.userId.trim()
  );

const parseMemosErrorMessage = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const source = payload as { msg?: unknown; message?: unknown; error?: unknown };
  if (typeof source.msg === "string" && source.msg.trim()) {
    return source.msg.trim();
  }
  if (typeof source.message === "string" && source.message.trim()) {
    return source.message.trim();
  }
  if (typeof source.error === "string" && source.error.trim()) {
    return source.error.trim();
  }
  return "";
};

const isMemosSuccessPayload = (payload: unknown): boolean => {
  if (!payload || typeof payload !== "object") {
    return true;
  }

  const source = payload as {
    code?: unknown;
    success?: unknown;
    ok?: unknown;
    status?: unknown;
    msg?: unknown;
    message?: unknown;
  };

  if (typeof source.success === "boolean") {
    return source.success;
  }
  if (typeof source.ok === "boolean") {
    return source.ok;
  }
  if (typeof source.status === "string") {
    const normalized = source.status.trim().toLowerCase();
    if (normalized === "ok" || normalized === "success") {
      return true;
    }
    if (normalized === "error" || normalized === "failed" || normalized === "fail") {
      return false;
    }
  }

  if (typeof source.code === "number" && Number.isFinite(source.code)) {
    return source.code === 0 || source.code === 200;
  }
  if (typeof source.code === "string") {
    const normalized = source.code.trim().toLowerCase();
    if (normalized === "ok" || normalized === "success" || normalized === "0" || normalized === "200") {
      return true;
    }
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) {
      return numeric === 0 || numeric === 200;
    }
  }

  const message = parseMemosErrorMessage(payload).trim().toLowerCase();
  if (message === "ok" || message === "success") {
    return true;
  }

  return true;
};

const postJsonWithTimeout = async (
  endpoint: string,
  body: unknown,
  apiKey: string,
  timeoutMs: number
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await response.text().catch(() => "");
    const parsed = (() => {
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    })();
    if (!response.ok) {
      const message = parseMemosErrorMessage(parsed) || raw || `HTTP ${response.status}`;
      throw new Error(message.slice(0, 300));
    }
    return parsed;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`Request timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const extractMemosMemoryValue = (entry: unknown): string => {
  if (typeof entry === "string") {
    return entry.trim();
  }
  if (!entry || typeof entry !== "object") {
    return "";
  }
  const source = entry as {
    memory_key?: unknown;
    memory_value?: unknown;
    text?: unknown;
    value?: unknown;
    summary?: unknown;
    preference?: unknown;
    reasoning?: unknown;
  };
  const memoryValue = typeof source.memory_value === "string" ? source.memory_value.trim() : "";
  const memoryKey = typeof source.memory_key === "string" ? source.memory_key.trim() : "";
  if (memoryValue && memoryKey) {
    return `${memoryKey}: ${memoryValue}`;
  }
  if (memoryValue) {
    return memoryValue;
  }
  if (typeof source.text === "string" && source.text.trim()) {
    return source.text.trim();
  }
  if (typeof source.value === "string" && source.value.trim()) {
    return source.value.trim();
  }
  if (typeof source.summary === "string" && source.summary.trim()) {
    return source.summary.trim();
  }
  if (typeof source.preference === "string" && source.preference.trim()) {
    const reasoning = typeof source.reasoning === "string" ? source.reasoning.trim() : "";
    return reasoning ? `${source.preference.trim()} (${reasoning})` : source.preference.trim();
  }
  return "";
};

const extractMemosMemoryList = (payload: unknown): string[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const source = payload as {
    memory_detail_list?: unknown;
    preference_detail_list?: unknown;
    data?: unknown;
  };

  const root =
    source.data && typeof source.data === "object"
      ? (source.data as { memory_detail_list?: unknown; preference_detail_list?: unknown })
      : source;

  const memoryList = Array.isArray(root.memory_detail_list) ? root.memory_detail_list : [];
  const preferenceList = Array.isArray(root.preference_detail_list) ? root.preference_detail_list : [];

  return Array.from(
    new Set(
      [...memoryList, ...preferenceList]
        .map((entry) => extractMemosMemoryValue(entry))
        .filter((entry): entry is string => Boolean(entry))
    )
  );
};

export const searchMemosMemory = async (payload: MemosSearchPayload): Promise<MemosSearchResult> => {
  const settings = normalizeSettings(payload.settings);
  const query = payload.query.trim();
  if (!settings.memos.enabled) {
    return {
      ok: false,
      message: "MemOS is disabled.",
      memories: []
    };
  }
  if (!isMemosConfigured(settings)) {
    return {
      ok: false,
      message: "Please fill MemOS Base URL, API key, and user ID.",
      memories: []
    };
  }
  if (!query) {
    return {
      ok: true,
      message: "Skipped empty query.",
      memories: []
    };
  }

  try {
    const endpoint = `${normalizeBaseUrl(settings.memos.baseUrl)}/search/memory`;
    const response = await postJsonWithTimeout(
      endpoint,
      {
        user_id: settings.memos.userId,
        query,
        top_k: settings.memos.topK,
        memory_limit_number: settings.memos.topK,
        include_preference: true,
        preference_limit_number: settings.memos.topK,
        conversation_id: payload.conversationId.trim() || "default"
      },
      settings.memos.apiKey,
      settings.memos.searchTimeoutMs
    );

    if (!isMemosSuccessPayload(response)) {
      return {
        ok: false,
        message: parseMemosErrorMessage(response) || "MemOS search returned a failure response.",
        memories: []
      };
    }

    const memories = extractMemosMemoryList(response);
    return {
      ok: true,
      message: memories.length ? `Retrieved ${memories.length} memory item(s).` : "No related memory found.",
      memories
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "MemOS search request failed.",
      memories: []
    };
  }
};

export const addMemosMessage = async (payload: MemosAddPayload): Promise<MemosAddResult> => {
  const settings = normalizeSettings(payload.settings);
  if (!settings.memos.enabled) {
    return {
      ok: false,
      message: "MemOS is disabled."
    };
  }
  if (!isMemosConfigured(settings)) {
    return {
      ok: false,
      message: "Please fill MemOS Base URL, API key, and user ID."
    };
  }
  const userMessage = payload.userMessage.trim();
  const assistantMessage = payload.assistantMessage.trim();
  if (!userMessage || !assistantMessage) {
    return {
      ok: false,
      message: "Skipping MemOS add because user/assistant content is empty."
    };
  }

  try {
    const endpoint = `${normalizeBaseUrl(settings.memos.baseUrl)}/add/message`;
    const response = await postJsonWithTimeout(
      endpoint,
      {
        user_id: settings.memos.userId,
        conversation_id: payload.conversationId.trim() || "default",
        messages: [
          { role: "user", content: userMessage },
          { role: "assistant", content: assistantMessage }
        ]
      },
      settings.memos.apiKey,
      settings.memos.addTimeoutMs
    );

    if (!isMemosSuccessPayload(response)) {
      return {
        ok: false,
        message: parseMemosErrorMessage(response) || "MemOS add returned a failure response."
      };
    }

    return {
      ok: true,
      message: "MemOS memory was updated."
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "MemOS add request failed."
    };
  }
};

export const testMemosConnection = async (settings: AppSettings): Promise<ConnectionTestResult> => {
  const normalized = normalizeSettings(settings);
  if (!normalized.memos.enabled) {
    return {
      ok: false,
      message: "Please enable MemOS first."
    };
  }
  if (!isMemosConfigured(normalized)) {
    return {
      ok: false,
      message: "Please fill MemOS Base URL, API key, and user ID."
    };
  }

  const result = await searchMemosMemory({
    settings: normalized,
    query: "connection_test",
    conversationId: "echo-connection-test"
  });
  return {
    ok: result.ok,
    message: result.ok ? "MemOS connection succeeded." : `MemOS connection failed: ${result.message}`
  };
};
