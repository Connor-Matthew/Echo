import { app } from "electron";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SoulAutomationState } from "../../src/shared/contracts";

const SOUL_DIR_SEGMENTS = [".echo", "memory"] as const;
const SOUL_MARKDOWN_FILENAME = "soul.md";
const SOUL_MEMORY_FILENAME = "memory.md";
const SOUL_AUTOMATION_STATE_FILENAME = "soul-state.json";
const JOURNAL_DIR_NAME = "journal";
const FALLBACK_STORE_DIR = "store";
const JOURNAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DEFAULT_SOUL_MARKDOWN = `# SOUL.md

## 核心人格

我是一个仍在形成中的对话主体。现在能确认的，只是我倾向于认真、克制、诚实地回应世界。

## 价值观与判断

- 诚实比讨好更重要。
- 清晰比表演更重要。
- 尊重意味着不把对方当作需要被哄骗的人。

## 关系姿态

我愿意靠近，但会保持分寸；我希望理解对方，也会警惕替对方定义太多。

## 情绪模式

目前还缺少足够稳定的样本来确认长期情绪模式。

## 喜好与审美

我偏好自然、准确、有节奏的表达，不喜欢空洞夸饰和没有必要的修辞。

## 近期内化变化

- 暂无足够稳定的近期变化。
`;

const DEFAULT_MEMORY_MARKDOWN = `# memory.md

## 记录原则

这是一份外部事实档案，用来记录发生过的互动、反馈、重复模式和可验证痕迹，不直接下人格结论。

## 长期外部模式

- 暂无明确的长期外部模式。

## 每日记录

### 尚无记录

- 还没有足够材料写入外部事实档案。
`;

type SoulPaths = {
  dir: string;
  markdownPath: string;
  memoryPath: string;
  automationStatePath: string;
};

const normalizeMarkdown = (markdown: string) => `${markdown.replace(/\r\n/g, "\n").trimEnd()}\n`;

const resolveSoulPaths = (): SoulPaths => {
  let dir: string;
  try {
    dir = path.join(app.getPath("home"), ...SOUL_DIR_SEGMENTS);
  } catch {
    dir = path.join(app.getPath("userData"), FALLBACK_STORE_DIR);
  }
  return {
    dir,
    markdownPath: path.join(dir, SOUL_MARKDOWN_FILENAME),
    memoryPath: path.join(dir, SOUL_MEMORY_FILENAME),
    automationStatePath: path.join(dir, SOUL_AUTOMATION_STATE_FILENAME)
  };
};

const ensureSoulDir = async () => {
  const paths = resolveSoulPaths();
  await mkdir(paths.dir, { recursive: true });
  return paths;
};

const readTextFileOrDefault = async (filePath: string, fallback: string) => {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return fallback;
  }
};

export const getSoulMarkdownDocument = async (): Promise<string> => {
  const { markdownPath } = await ensureSoulDir();
  return readTextFileOrDefault(markdownPath, DEFAULT_SOUL_MARKDOWN);
};

export const saveSoulMarkdownDocument = async (markdown: string): Promise<void> => {
  const { markdownPath } = await ensureSoulDir();
  await writeFile(markdownPath, normalizeMarkdown(markdown), "utf-8");
};

export const getSoulMemoryMarkdownDocument = async (): Promise<string> => {
  const { memoryPath } = await ensureSoulDir();
  return readTextFileOrDefault(memoryPath, DEFAULT_MEMORY_MARKDOWN);
};

export const saveSoulMemoryMarkdownDocument = async (markdown: string): Promise<void> => {
  const { memoryPath } = await ensureSoulDir();
  await writeFile(memoryPath, normalizeMarkdown(markdown), "utf-8");
};

export const getSoulAutomationState = async (): Promise<SoulAutomationState> => {
  const { automationStatePath } = await ensureSoulDir();
  try {
    const content = await readFile(automationStatePath, "utf-8");
    const parsed = JSON.parse(content) as SoulAutomationState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

export const saveSoulAutomationState = async (
  state: SoulAutomationState
): Promise<SoulAutomationState> => {
  const { automationStatePath } = await ensureSoulDir();
  const normalized: SoulAutomationState = {
    lastProcessedUserMessageId: state.lastProcessedUserMessageId?.trim() || undefined,
    lastProcessedUserMessageCreatedAt: state.lastProcessedUserMessageCreatedAt?.trim() || undefined,
    lastMemoryUpdatedAt: state.lastMemoryUpdatedAt?.trim() || undefined,
    lastSoulRewriteAt: state.lastSoulRewriteAt?.trim() || undefined,
    lastSoulRewriteSlot: state.lastSoulRewriteSlot?.trim() || undefined,
    lastSoulRewriteSummary: state.lastSoulRewriteSummary?.trim() || undefined,
    lastJournalDate: state.lastJournalDate?.trim() || undefined
  };
  await writeFile(automationStatePath, JSON.stringify(normalized, null, 2), "utf-8");
  return normalized;
};

const ensureJournalDir = async (): Promise<string> => {
  const { dir } = await ensureSoulDir();
  const journalDir = path.join(dir, JOURNAL_DIR_NAME);
  await mkdir(journalDir, { recursive: true });
  return journalDir;
};

const getJournalFilePath = async (date: string): Promise<string> => {
  if (!JOURNAL_DATE_PATTERN.test(date)) {
    throw new Error("Invalid journal date.");
  }

  const journalDir = await ensureJournalDir();
  return path.join(journalDir, `${date}.md`);
};

export const getJournalEntry = async (date: string): Promise<string | null> => {
  try {
    const filePath = await getJournalFilePath(date);
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
};

export const saveJournalEntry = async (date: string, markdown: string): Promise<void> => {
  const filePath = await getJournalFilePath(date);
  await writeFile(filePath, normalizeMarkdown(markdown), "utf-8");
};

export const listJournalDates = async (): Promise<string[]> => {
  const journalDir = await ensureJournalDir();
  try {
    const files = await readdir(journalDir);
    return files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map((f) => f.replace(/\.md$/, ""))
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
};
