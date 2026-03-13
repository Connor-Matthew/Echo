import type { IpcMain } from "electron";
import type { SoulAutomationState } from "../../src/shared/contracts";

type SoulHandlerDeps = {
  getSoulMarkdownDocument: () => Promise<string>;
  saveSoulMarkdownDocument: (markdown: string) => Promise<void>;
  getSoulMemoryMarkdownDocument: () => Promise<string>;
  saveSoulMemoryMarkdownDocument: (markdown: string) => Promise<void>;
  getSoulAutomationState: () => Promise<SoulAutomationState>;
  saveSoulAutomationState: (state: SoulAutomationState) => Promise<SoulAutomationState>;
  getJournalEntry: (date: string) => Promise<string | null>;
  saveJournalEntry: (date: string, markdown: string) => Promise<void>;
  listJournalDates: () => Promise<string[]>;
};

export const registerSoulHandlers = (ipcMain: IpcMain, deps: SoulHandlerDeps) => {
  ipcMain.handle("soul:getMarkdown", async (): Promise<string> => deps.getSoulMarkdownDocument());

  ipcMain.handle("soul:saveMarkdown", async (_, markdown: string): Promise<void> =>
    deps.saveSoulMarkdownDocument(markdown)
  );

  ipcMain.handle("soul:getMemoryMarkdown", async (): Promise<string> =>
    deps.getSoulMemoryMarkdownDocument()
  );

  ipcMain.handle("soul:saveMemoryMarkdown", async (_, markdown: string): Promise<void> =>
    deps.saveSoulMemoryMarkdownDocument(markdown)
  );

  ipcMain.handle("soul:getAutomationState", async (): Promise<SoulAutomationState> =>
    deps.getSoulAutomationState()
  );

  ipcMain.handle(
    "soul:saveAutomationState",
    async (_, state: SoulAutomationState): Promise<SoulAutomationState> =>
      deps.saveSoulAutomationState(state)
  );

  ipcMain.handle("soul:getJournalEntry", async (_, date: string): Promise<string | null> =>
    deps.getJournalEntry(date)
  );

  ipcMain.handle(
    "soul:saveJournalEntry",
    async (_, date: string, markdown: string): Promise<void> =>
      deps.saveJournalEntry(date, markdown)
  );

  ipcMain.handle("soul:listJournalDates", async (): Promise<string[]> =>
    deps.listJournalDates()
  );
};
