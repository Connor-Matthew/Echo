import type { IpcMain } from "electron";
import type { ChatSession } from "../../src/shared/contracts";

type ClaudeSkill = {
  name: string;
  command: string;
  description: string;
  content: string;
};

type StorageHandlerDeps = {
  sessionsFile: string;
  skillsFile: string;
  readJson: <T>(filename: string, fallback: T) => Promise<T>;
  writeJson: (filename: string, value: unknown) => Promise<void>;
  scanClaudeSkills: () => Promise<ClaudeSkill[]>;
};

export const registerStorageHandlers = (ipcMain: IpcMain, deps: StorageHandlerDeps) => {
  ipcMain.handle("sessions:get", async () => deps.readJson<ChatSession[]>(deps.sessionsFile, []));

  ipcMain.handle("sessions:save", async (_, sessions: ChatSession[]) => {
    await deps.writeJson(deps.sessionsFile, sessions);
  });

  ipcMain.handle("skills:get", async () => deps.readJson<unknown[]>(deps.skillsFile, []));

  ipcMain.handle("skills:save", async (_, skills: unknown[]) => {
    await deps.writeJson(deps.skillsFile, skills);
  });

  ipcMain.handle("skills:scanClaude", async () => deps.scanClaudeSkills());
};
