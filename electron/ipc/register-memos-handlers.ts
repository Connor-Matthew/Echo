import type { IpcMain } from "electron";
import type {
  AppSettings,
  ConnectionTestResult,
  MemosAddPayload,
  MemosAddResult,
  MemosSearchPayload,
  MemosSearchResult
} from "../../src/shared/contracts";

type MemosHandlerDeps = {
  testMemosConnection: (settings: AppSettings) => Promise<ConnectionTestResult>;
  searchMemosMemory: (payload: MemosSearchPayload) => Promise<MemosSearchResult>;
  addMemosMessage: (payload: MemosAddPayload) => Promise<MemosAddResult>;
};

export const registerMemosHandlers = (ipcMain: IpcMain, deps: MemosHandlerDeps) => {
  ipcMain.handle(
    "memos:testConnection",
    async (_, settings: AppSettings): Promise<ConnectionTestResult> => deps.testMemosConnection(settings)
  );

  ipcMain.handle(
    "memos:searchMemory",
    async (_, payload: MemosSearchPayload): Promise<MemosSearchResult> => deps.searchMemosMemory(payload)
  );

  ipcMain.handle(
    "memos:addMessage",
    async (_, payload: MemosAddPayload): Promise<MemosAddResult> => deps.addMemosMessage(payload)
  );
};
