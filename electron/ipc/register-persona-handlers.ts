import type { IpcMain } from "electron";
import type {
  PersonaIngestPayload,
  PersonaIngestResult,
  PersonaInjectionPayload,
  PersonaSnapshot,
  PersonaUndoIngestPayload,
  PersonaUndoIngestResult
} from "../../src/shared/contracts";

type PersonaHandlerDeps = {
  getPersonaSnapshot: () => Promise<PersonaSnapshot>;
  getPersonaMarkdownDocument: () => Promise<string>;
  savePersonaMarkdownDocument: (markdown: string) => Promise<PersonaSnapshot>;
  getPersonaInjectionPayload: () => Promise<PersonaInjectionPayload>;
  ingestPersonaMessage: (payload: PersonaIngestPayload) => Promise<PersonaIngestResult>;
  undoPersonaIngest: (payload: PersonaUndoIngestPayload) => Promise<PersonaUndoIngestResult>;
};

export const registerPersonaHandlers = (ipcMain: IpcMain, deps: PersonaHandlerDeps) => {
  ipcMain.handle("persona:getSnapshot", async (): Promise<PersonaSnapshot> => deps.getPersonaSnapshot());

  ipcMain.handle("persona:getMarkdown", async (): Promise<string> => deps.getPersonaMarkdownDocument());

  ipcMain.handle(
    "persona:saveMarkdown",
    async (_, markdown: string): Promise<PersonaSnapshot> => deps.savePersonaMarkdownDocument(markdown)
  );

  ipcMain.handle(
    "persona:getInjectionPayload",
    async (): Promise<PersonaInjectionPayload> => deps.getPersonaInjectionPayload()
  );

  ipcMain.handle(
    "persona:ingestMessage",
    async (_, payload: PersonaIngestPayload): Promise<PersonaIngestResult> =>
      deps.ingestPersonaMessage(payload)
  );

  ipcMain.handle(
    "persona:undoIngest",
    async (_, payload: PersonaUndoIngestPayload): Promise<PersonaUndoIngestResult> =>
      deps.undoPersonaIngest(payload)
  );
};
