import { app } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  UserProfileAutomationState,
  UserProfileDailyNote,
  UserProfileEvidence,
  UserProfileItem,
  UserProfileItemDraft,
  UserProfileManualItemPayload,
  UserProfileItemStatus,
  UserProfileLayer
} from "../../src/shared/contracts";

const PROFILE_DIR_NAME = "profile";
const PROFILE_DB_FILENAME = "profile.db";
const PROFILE_SNAPSHOT_FILENAME = "current-profile.md";
const PROFILE_LAYER_LABELS: Record<UserProfileLayer, string> = {
  preferences: "偏好与习惯",
  background: "人生背景与长期状态",
  relationship: "关系画像"
};

type ProfilePaths = {
  dir: string;
  dbPath: string;
  snapshotPath: string;
};

type DailyNoteRow = {
  id: string;
  date: string;
  summary_markdown: string;
  source_message_count: number;
  source?: "auto" | "manual";
  created_at: string;
  updated_at: string;
};

type ProfileItemRow = {
  id: string;
  layer: UserProfileLayer;
  title: string;
  description: string;
  confidence: number;
  status: UserProfileItemStatus;
  source: "auto" | "manual";
  last_confirmed_at: string;
  created_at: string;
  updated_at: string;
};

type EvidenceRow = {
  id: string;
  profile_item_id: string;
  daily_note_date: string;
  excerpt: string;
  weight: number;
  created_at: string;
};

let database: DatabaseSync | null = null;

const nowIso = () => new Date().toISOString();

const createId = () => crypto.randomUUID();

const normalizeMarkdown = (markdown: string) => `${markdown.replace(/\r\n/g, "\n").trimEnd()}\n`;

const renderProfileSnapshotMarkdown = (items: UserProfileItem[]) => {
  const activeItems = items.filter((item) => item.status === "active");
  if (!activeItems.length) {
    return "";
  }
  const updatedAt = nowIso().replace("T", " ").slice(0, 16);
  const sections = (Object.keys(PROFILE_LAYER_LABELS) as UserProfileLayer[]).map((layer) => {
    const layerItems = activeItems
      .filter((item) => item.layer === layer)
      .sort((left, right) => right.confidence - left.confidence || left.title.localeCompare(right.title));
    if (!layerItems.length) {
      return "";
    }

    const lines = layerItems.map((item) => {
      const confidenceLabel = Number.isFinite(item.confidence)
        ? `（置信度 ${Math.round(item.confidence * 100)}%）`
        : "";
      return `- **${item.title}**${confidenceLabel}：${item.description}`;
    });
    return `## ${PROFILE_LAYER_LABELS[layer]}\n\n${lines.join("\n")}`;
  }).filter(Boolean);

  return normalizeMarkdown([`# 用户画像快照`, "", `更新时间：${updatedAt}`, "", ...sections].join("\n"));
};

const resolveProfilePaths = (): ProfilePaths => {
  const dir = path.join(app.getPath("userData"), PROFILE_DIR_NAME);
  return {
    dir,
    dbPath: path.join(dir, PROFILE_DB_FILENAME),
    snapshotPath: path.join(dir, PROFILE_SNAPSHOT_FILENAME)
  };
};

const ensureProfileDir = async () => {
  const paths = resolveProfilePaths();
  await mkdir(paths.dir, { recursive: true });
  return paths;
};

const ensureDatabase = async () => {
  const paths = await ensureProfileDir();
  if (!database) {
    database = new DatabaseSync(paths.dbPath);
    database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS daily_user_notes (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL UNIQUE,
        summary_markdown TEXT NOT NULL,
        source_message_count INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'auto',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profile_items (
        id TEXT PRIMARY KEY,
        layer TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        confidence REAL NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        last_confirmed_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profile_evidence (
        id TEXT PRIMARY KEY,
        profile_item_id TEXT NOT NULL,
        daily_note_date TEXT NOT NULL,
        excerpt TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        FOREIGN KEY(profile_item_id) REFERENCES profile_items(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS profile_snapshots (
        id TEXT PRIMARY KEY,
        markdown TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profile_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    try {
      database.exec(`ALTER TABLE daily_user_notes ADD COLUMN source TEXT NOT NULL DEFAULT 'auto'`);
    } catch {
      // existing databases may already have the column
    }
  }
  return { db: database, paths };
};

const mapDailyNoteRow = (row: DailyNoteRow): UserProfileDailyNote => ({
  id: row.id,
  date: row.date,
  summaryMarkdown: row.summary_markdown,
  sourceMessageCount: row.source_message_count,
  source: row.source === "manual" ? "manual" : "auto",
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapProfileItemRow = (row: ProfileItemRow): UserProfileItem => ({
  id: row.id,
  layer: row.layer,
  title: row.title,
  description: row.description,
  confidence: row.confidence,
  status: row.status,
  source: row.source,
  lastConfirmedAt: row.last_confirmed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapEvidenceRow = (row: EvidenceRow): UserProfileEvidence => ({
  id: row.id,
  profileItemId: row.profile_item_id,
  dailyNoteDate: row.daily_note_date,
  excerpt: row.excerpt,
  weight: row.weight,
  createdAt: row.created_at
});

const listItemsInternal = (db: DatabaseSync, layer?: UserProfileLayer): UserProfileItem[] => {
  const statement = layer
    ? db.prepare(
        `SELECT * FROM profile_items WHERE layer = ? ORDER BY status = 'active' DESC, confidence DESC, updated_at DESC`
      )
    : db.prepare(
        `SELECT * FROM profile_items ORDER BY layer ASC, status = 'active' DESC, confidence DESC, updated_at DESC`
      );
  const rows = (layer ? statement.all(layer) : statement.all()) as ProfileItemRow[];
  return rows.map(mapProfileItemRow);
};

const persistSnapshot = async (db: DatabaseSync, snapshotPath: string, markdown?: string) => {
  const content = markdown || renderProfileSnapshotMarkdown(listItemsInternal(db));
  db.prepare(`INSERT INTO profile_snapshots (id, markdown, created_at) VALUES (?, ?, ?)`).run(
    createId(),
    content,
    nowIso()
  );
  await writeFile(snapshotPath, content, "utf-8");
  return content;
};

const upsertProfileItemRecord = (
  db: DatabaseSync,
  payload: UserProfileManualItemPayload,
  source: "manual" | "auto",
  now: string
) => {
  const itemId = payload.itemId?.trim() || createId();
  const status = payload.status ?? "active";
  const existing = db.prepare(`SELECT id FROM profile_items WHERE id = ? LIMIT 1`).get(itemId) as
    | { id: string }
    | undefined;

  if (existing) {
    db.prepare(
      `UPDATE profile_items
       SET layer = ?, title = ?, description = ?, confidence = ?, status = ?, source = ?, last_confirmed_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      payload.layer,
      payload.title.trim(),
      payload.description.trim(),
      payload.confidence,
      status,
      source,
      now,
      now,
      itemId
    );
    db.prepare(`DELETE FROM profile_evidence WHERE profile_item_id = ?`).run(itemId);
  } else {
    db.prepare(
      `INSERT INTO profile_items (
        id, layer, title, description, confidence, status, source, last_confirmed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      itemId,
      payload.layer,
      payload.title.trim(),
      payload.description.trim(),
      payload.confidence,
      status,
      source,
      now,
      now,
      now
    );
  }

  const insertEvidence = db.prepare(
    `INSERT INTO profile_evidence (
      id, profile_item_id, daily_note_date, excerpt, weight, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`
  );
  payload.evidence.forEach((evidence) => {
    const date = evidence.dailyNoteDate.trim();
    const excerpt = evidence.excerpt.trim();
    if (!date || !excerpt) {
      return;
    }
    insertEvidence.run(createId(), itemId, date, excerpt, evidence.weight ?? 1, now);
  });

  return itemId;
};

export const listProfileDailyNotes = async (): Promise<UserProfileDailyNote[]> => {
  const { db } = await ensureDatabase();
  const rows = db.prepare(`SELECT * FROM daily_user_notes ORDER BY date DESC`).all() as DailyNoteRow[];
  return rows.map(mapDailyNoteRow);
};

export const getProfileDailyNote = async (date: string): Promise<UserProfileDailyNote | null> => {
  const { db } = await ensureDatabase();
  const row = db.prepare(`SELECT * FROM daily_user_notes WHERE date = ? LIMIT 1`).get(date) as
    | DailyNoteRow
    | undefined;
  return row ? mapDailyNoteRow(row) : null;
};

export const upsertProfileDailyNote = async (note: {
  date: string;
  summaryMarkdown: string;
  sourceMessageCount: number;
  source?: "auto" | "manual";
}): Promise<UserProfileDailyNote> => {
  const { db } = await ensureDatabase();
  const now = nowIso();
  const source = note.source ?? "auto";
  const existing = db.prepare(`SELECT * FROM daily_user_notes WHERE date = ? LIMIT 1`).get(note.date) as
    | DailyNoteRow
    | undefined;

  if (existing?.source === "manual" && source === "auto") {
    return mapDailyNoteRow(existing);
  }

  if (existing) {
    db.prepare(
      `UPDATE daily_user_notes
       SET summary_markdown = ?, source_message_count = ?, source = ?, updated_at = ?
       WHERE date = ?`
    ).run(normalizeMarkdown(note.summaryMarkdown), note.sourceMessageCount, source, now, note.date);
  } else {
    db.prepare(
      `INSERT INTO daily_user_notes (
        id, date, summary_markdown, source_message_count, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      createId(),
      note.date,
      normalizeMarkdown(note.summaryMarkdown),
      note.sourceMessageCount,
      source,
      now,
      now
    );
  }

  return (await getProfileDailyNote(note.date)) as UserProfileDailyNote;
};

export const listProfileItems = async (layer?: UserProfileLayer): Promise<UserProfileItem[]> => {
  const { db } = await ensureDatabase();
  return listItemsInternal(db, layer);
};

export const listProfileEvidence = async (profileItemId: string): Promise<UserProfileEvidence[]> => {
  const { db } = await ensureDatabase();
  const rows = db
    .prepare(
      `SELECT * FROM profile_evidence WHERE profile_item_id = ? ORDER BY daily_note_date DESC, created_at DESC`
    )
    .all(profileItemId) as EvidenceRow[];
  return rows.map(mapEvidenceRow);
};

export const replaceAutoProfile = async (payload: {
  items: UserProfileItemDraft[];
  snapshotMarkdown: string;
}): Promise<UserProfileItem[]> => {
  const { db, paths } = await ensureDatabase();
  const now = nowIso();

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`DELETE FROM profile_evidence WHERE profile_item_id IN (
      SELECT id FROM profile_items WHERE source = 'auto'
    )`).run();
    db.prepare(`DELETE FROM profile_items WHERE source = 'auto'`).run();

    for (const item of payload.items) {
      upsertProfileItemRecord(
        db,
        {
          layer: item.layer,
          title: item.title,
          description: item.description,
          confidence: item.confidence,
          status: "active",
          evidence: item.evidence
        },
        "auto",
        now
      );
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  await persistSnapshot(db, paths.snapshotPath);
  return listItemsInternal(db);
};

export const saveManualProfileItem = async (
  payload: UserProfileManualItemPayload
): Promise<UserProfileItem> => {
  const { db, paths } = await ensureDatabase();
  const now = nowIso();
  let itemId = payload.itemId?.trim() || "";

  db.exec("BEGIN IMMEDIATE");
  try {
    itemId = upsertProfileItemRecord(
      db,
      {
        ...payload,
        title: payload.title.trim(),
        description: payload.description.trim()
      },
      "manual",
      now
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  await persistSnapshot(db, paths.snapshotPath);
  const row = db.prepare(`SELECT * FROM profile_items WHERE id = ? LIMIT 1`).get(itemId) as
    | ProfileItemRow
    | undefined;
  if (!row) {
    throw new Error("Failed to save profile item.");
  }
  return mapProfileItemRow(row);
};

export const updateProfileItemStatus = async (payload: {
  itemId: string;
  status: UserProfileItemStatus;
}): Promise<UserProfileItem | null> => {
  const { db, paths } = await ensureDatabase();
  const now = nowIso();
  db.prepare(`UPDATE profile_items SET status = ?, updated_at = ? WHERE id = ?`).run(
    payload.status,
    now,
    payload.itemId
  );
  await persistSnapshot(db, paths.snapshotPath);
  const row = db.prepare(`SELECT * FROM profile_items WHERE id = ? LIMIT 1`).get(payload.itemId) as
    | ProfileItemRow
    | undefined;
  return row ? mapProfileItemRow(row) : null;
};

export const deleteProfileItem = async (itemId: string): Promise<void> => {
  const { db, paths } = await ensureDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`DELETE FROM profile_evidence WHERE profile_item_id = ?`).run(itemId);
    db.prepare(`DELETE FROM profile_items WHERE id = ?`).run(itemId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  await persistSnapshot(db, paths.snapshotPath);
};

export const getProfileSnapshotMarkdown = async (): Promise<string> => {
  const { db, paths } = await ensureDatabase();
  const row = db.prepare(`SELECT markdown FROM profile_snapshots ORDER BY created_at DESC LIMIT 1`).get() as
    | { markdown: string }
    | undefined;
  if (row?.markdown?.trim()) {
    return row.markdown;
  }
  return persistSnapshot(db, paths.snapshotPath);
};

export const getProfileAutomationState = async (): Promise<UserProfileAutomationState> => {
  const { db } = await ensureDatabase();
  const row = db.prepare(`SELECT value FROM profile_state WHERE key = 'state' LIMIT 1`).get() as
    | { value: string }
    | undefined;
  if (!row?.value) {
    return {};
  }
  try {
    const parsed = JSON.parse(row.value) as UserProfileAutomationState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const saveProfileAutomationState = async (
  state: UserProfileAutomationState
): Promise<UserProfileAutomationState> => {
  const { db } = await ensureDatabase();
  const normalized: UserProfileAutomationState = {
    lastProcessedUserMessageId: state.lastProcessedUserMessageId?.trim() || undefined,
    lastProcessedUserMessageCreatedAt: state.lastProcessedUserMessageCreatedAt?.trim() || undefined,
    lastProfileUpdatedAt: state.lastProfileUpdatedAt?.trim() || undefined,
    lastDailyNoteDate: state.lastDailyNoteDate?.trim() || undefined
  };
  db.prepare(
    `INSERT INTO profile_state (key, value) VALUES ('state', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(JSON.stringify(normalized, null, 2));
  return normalized;
};
