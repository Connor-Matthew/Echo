import { app } from "electron";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentMessage, AgentSessionMeta } from "../../src/shared/agent-contracts";
import type { ChatAttachment, ToolCall } from "../../src/shared/contracts";

const STORE_DIR_NAME = "store";
const AGENT_SESSIONS_INDEX_FILE = "agent-sessions.json";
const AGENT_SESSIONS_DIR = "agent-sessions";

const nowIso = () => new Date().toISOString();

const ensureStoreDir = async () => {
  const storeDir = path.join(app.getPath("userData"), STORE_DIR_NAME);
  await mkdir(storeDir, { recursive: true });
  return storeDir;
};

const ensureAgentSessionsDir = async () => {
  const storeDir = await ensureStoreDir();
  const sessionsDir = path.join(storeDir, AGENT_SESSIONS_DIR);
  await mkdir(sessionsDir, { recursive: true });
  return sessionsDir;
};

const readJson = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = async (filePath: string, value: unknown) => {
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
};

const sanitizeSessionMeta = (value: Partial<AgentSessionMeta> | undefined): AgentSessionMeta | null => {
  if (!value?.id || !value?.title || !value?.createdAt || !value?.updatedAt) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    sdkSessionId: typeof value.sdkSessionId === "string" ? value.sdkSessionId : undefined,
    lastCwd: typeof value.lastCwd === "string" ? value.lastCwd : undefined,
    lastModel: typeof value.lastModel === "string" ? value.lastModel : undefined,
    lastProviderId: typeof value.lastProviderId === "string" ? value.lastProviderId : undefined
  };
};

const sanitizeAgentMessage = (value: unknown): AgentMessage | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<AgentMessage>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.sessionId !== "string" ||
    typeof candidate.role !== "string" ||
    typeof candidate.content !== "string" ||
    typeof candidate.createdAt !== "string"
  ) {
    return null;
  }

  if (candidate.role !== "system" && candidate.role !== "user" && candidate.role !== "assistant") {
    return null;
  }

  const sanitizeAttachment = (raw: unknown): ChatAttachment | null => {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const candidateAttachment = raw as Partial<ChatAttachment>;
    const kind = candidateAttachment.kind;
    if (
      typeof candidateAttachment.id !== "string" ||
      typeof candidateAttachment.name !== "string" ||
      typeof candidateAttachment.mimeType !== "string" ||
      typeof candidateAttachment.size !== "number" ||
      !Number.isFinite(candidateAttachment.size) ||
      candidateAttachment.size < 0
    ) {
      return null;
    }
    if (kind !== "text" && kind !== "image" && kind !== "file") {
      return null;
    }

    return {
      id: candidateAttachment.id,
      name: candidateAttachment.name,
      mimeType: candidateAttachment.mimeType,
      size: candidateAttachment.size,
      kind,
      textContent:
        kind === "text" && typeof candidateAttachment.textContent === "string"
          ? candidateAttachment.textContent
          : undefined,
      imageDataUrl:
        kind === "image" && typeof candidateAttachment.imageDataUrl === "string"
          ? candidateAttachment.imageDataUrl
          : undefined
    };
  };

  const attachments = Array.isArray(candidate.attachments)
    ? candidate.attachments
        .map((attachment) => sanitizeAttachment(attachment))
        .filter((attachment): attachment is ChatAttachment => Boolean(attachment))
    : [];

  const sanitizeToolCall = (raw: unknown): ToolCall | null => {
    if (!raw || typeof raw !== "object") {
      return null;
    }
    const candidateToolCall = raw as Partial<ToolCall>;
    if (
      typeof candidateToolCall.id !== "string" ||
      typeof candidateToolCall.serverName !== "string" ||
      typeof candidateToolCall.toolName !== "string"
    ) {
      return null;
    }

    const status =
      candidateToolCall.status === "pending" ||
      candidateToolCall.status === "success" ||
      candidateToolCall.status === "error"
        ? candidateToolCall.status
        : "success";
    const contentOffset =
      typeof candidateToolCall.contentOffset === "number" && Number.isFinite(candidateToolCall.contentOffset)
        ? Math.max(0, Math.floor(candidateToolCall.contentOffset))
        : undefined;

    return {
      id: candidateToolCall.id,
      serverName: candidateToolCall.serverName,
      toolName: candidateToolCall.toolName,
      status,
      message: typeof candidateToolCall.message === "string" ? candidateToolCall.message : "",
      contentOffset
    };
  };

  const toolCalls = Array.isArray(candidate.toolCalls)
    ? candidate.toolCalls
        .map((toolCall) => sanitizeToolCall(toolCall))
        .filter((toolCall): toolCall is ToolCall => Boolean(toolCall))
    : [];

  return {
    id: candidate.id,
    sessionId: candidate.sessionId,
    role: candidate.role,
    content: candidate.content,
    createdAt: candidate.createdAt,
    attachments: attachments.length ? attachments : undefined,
    toolCalls: toolCalls.length ? toolCalls : undefined,
    runId: typeof candidate.runId === "string" ? candidate.runId : undefined,
    status:
      candidate.status === "completed" || candidate.status === "error" || candidate.status === "stopped"
        ? candidate.status
        : undefined
  };
};

const getIndexFilePath = async () => {
  const storeDir = await ensureStoreDir();
  return path.join(storeDir, AGENT_SESSIONS_INDEX_FILE);
};

const getSessionFilePath = async (sessionId: string) => {
  const sessionsDir = await ensureAgentSessionsDir();
  return path.join(sessionsDir, `${sessionId}.jsonl`);
};

const readSessionIndex = async (): Promise<AgentSessionMeta[]> => {
  const filePath = await getIndexFilePath();
  const raw = await readJson<unknown[]>(filePath, []);
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => sanitizeSessionMeta(entry as Partial<AgentSessionMeta>))
    .filter((entry): entry is AgentSessionMeta => Boolean(entry))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
};

const writeSessionIndex = async (sessions: AgentSessionMeta[]) => {
  const filePath = await getIndexFilePath();
  await writeJson(filePath, sessions);
};

const createId = () => crypto.randomUUID();

export const agentSessionManager = {
  listSessions: async (): Promise<AgentSessionMeta[]> => readSessionIndex(),

  createSession: async (title?: string): Promise<AgentSessionMeta> => {
    const now = nowIso();
    const nextSession: AgentSessionMeta = {
      id: createId(),
      title: title?.trim() || "New Agent Session",
      createdAt: now,
      updatedAt: now
    };

    const sessions = await readSessionIndex();
    await writeSessionIndex([nextSession, ...sessions]);
    return nextSession;
  },

  updateSessionMeta: async (
    sessionId: string,
    updates: Partial<Omit<AgentSessionMeta, "id" | "createdAt">>
  ): Promise<AgentSessionMeta> => {
    const sessions = await readSessionIndex();
    const targetIndex = sessions.findIndex((session) => session.id === sessionId);
    if (targetIndex < 0) {
      throw new Error("Agent session not found.");
    }

    const target = sessions[targetIndex];
    const next: AgentSessionMeta = {
      ...target,
      ...updates,
      id: target.id,
      createdAt: target.createdAt,
      updatedAt: typeof updates.updatedAt === "string" ? updates.updatedAt : nowIso()
    };

    sessions.splice(targetIndex, 1);
    await writeSessionIndex([next, ...sessions]);
    return next;
  },

  deleteSession: async (sessionId: string): Promise<void> => {
    const sessions = await readSessionIndex();
    const nextSessions = sessions.filter((session) => session.id !== sessionId);
    await writeSessionIndex(nextSessions);

    const filePath = await getSessionFilePath(sessionId);
    await rm(filePath, { force: true });
  },

  getMessages: async (sessionId: string): Promise<AgentMessage[]> => {
    const filePath = await getSessionFilePath(sessionId);
    const raw = await readFile(filePath, "utf-8").catch(() => "");
    if (!raw.trim()) {
      return [];
    }

    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return sanitizeAgentMessage(JSON.parse(line));
        } catch {
          return null;
        }
      })
      .filter((message): message is AgentMessage => Boolean(message));
  },

  appendMessage: async (sessionId: string, message: AgentMessage): Promise<void> => {
    const filePath = await getSessionFilePath(sessionId);
    const existing = await readFile(filePath, "utf-8").catch(() => "");
    const prefix = existing.endsWith("\n") || !existing.length ? existing : `${existing}\n`;
    await writeFile(filePath, `${prefix}${JSON.stringify(message)}\n`, "utf-8");
    await agentSessionManager.updateSessionMeta(sessionId, {
      updatedAt: message.createdAt
    });
  }
};
