import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type ClaudeSkill = {
  name: string;
  command: string;
  description: string;
  content: string;
};

export const scanClaudeSkills = async (): Promise<ClaudeSkill[]> => {
  const skillsDir = path.join(os.homedir(), ".claude", "skills");
  if (!existsSync(skillsDir)) {
    return [];
  }
  const entries = await readdir(skillsDir);
  const results: ClaudeSkill[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) {
      continue;
    }
    const entryPath = path.join(skillsDir, entry);
    try {
      const entryStats = await stat(entryPath);
      if (!entryStats.isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }
    const skillFile = path.join(entryPath, "SKILL.md");
    if (!existsSync(skillFile)) {
      continue;
    }
    try {
      const raw = await readFile(skillFile, "utf-8");
      const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (!fmMatch) {
        continue;
      }
      const fm = fmMatch[1];
      const body = fmMatch[2].trim();
      const nameMatch = fm.match(/^name:\s*(.+)$/m);
      const descMatch = fm.match(/^description:\s*["']?([\s\S]*?)["']?\s*$/m);
      const name = nameMatch?.[1]?.trim() ?? entry;
      const description = descMatch?.[1]?.replace(/^["']|["']$/g, "").trim() ?? "";
      results.push({ name, command: entry, description, content: body });
    } catch {
      // Skip unreadable files.
    }
  }
  return results;
};
