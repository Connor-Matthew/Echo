import type { IpcMain } from "electron";
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

type ProfileHandlerDeps = {
  listProfileDailyNotes: () => Promise<UserProfileDailyNote[]>;
  getProfileDailyNote: (date: string) => Promise<UserProfileDailyNote | null>;
  upsertProfileDailyNote: (note: {
    date: string;
    summaryMarkdown: string;
    sourceMessageCount: number;
    source?: "auto" | "manual";
  }) => Promise<UserProfileDailyNote>;
  listProfileItems: (layer?: UserProfileLayer) => Promise<UserProfileItem[]>;
  listProfileEvidence: (profileItemId: string) => Promise<UserProfileEvidence[]>;
  replaceAutoProfile: (payload: {
    items: UserProfileItemDraft[];
    snapshotMarkdown: string;
  }) => Promise<UserProfileItem[]>;
  saveManualProfileItem: (payload: UserProfileManualItemPayload) => Promise<UserProfileItem>;
  updateProfileItemStatus: (payload: {
    itemId: string;
    status: UserProfileItemStatus;
  }) => Promise<UserProfileItem | null>;
  deleteProfileItem: (itemId: string) => Promise<void>;
  getProfileSnapshotMarkdown: () => Promise<string>;
  getProfileAutomationState: () => Promise<UserProfileAutomationState>;
  saveProfileAutomationState: (
    state: UserProfileAutomationState
  ) => Promise<UserProfileAutomationState>;
};

export const registerProfileHandlers = (ipcMain: IpcMain, deps: ProfileHandlerDeps) => {
  ipcMain.handle("profile:listDailyNotes", async () => deps.listProfileDailyNotes());
  ipcMain.handle("profile:getDailyNote", async (_, date: string) => deps.getProfileDailyNote(date));
  ipcMain.handle(
    "profile:upsertDailyNote",
    async (
      _,
      note: {
        date: string;
        summaryMarkdown: string;
        sourceMessageCount: number;
        source?: "auto" | "manual";
      }
    ) => deps.upsertProfileDailyNote(note)
  );
  ipcMain.handle("profile:listItems", async (_, layer?: UserProfileLayer) => deps.listProfileItems(layer));
  ipcMain.handle("profile:listEvidence", async (_, profileItemId: string) =>
    deps.listProfileEvidence(profileItemId)
  );
  ipcMain.handle(
    "profile:replaceAutoProfile",
    async (_, payload: { items: UserProfileItemDraft[]; snapshotMarkdown: string }) =>
      deps.replaceAutoProfile(payload)
  );
  ipcMain.handle("profile:saveManualItem", async (_, payload: UserProfileManualItemPayload) =>
    deps.saveManualProfileItem(payload)
  );
  ipcMain.handle(
    "profile:updateItemStatus",
    async (_, payload: { itemId: string; status: UserProfileItemStatus }) =>
      deps.updateProfileItemStatus(payload)
  );
  ipcMain.handle("profile:deleteItem", async (_, itemId: string) => deps.deleteProfileItem(itemId));
  ipcMain.handle("profile:getSnapshotMarkdown", async () => deps.getProfileSnapshotMarkdown());
  ipcMain.handle("profile:getAutomationState", async () => deps.getProfileAutomationState());
  ipcMain.handle(
    "profile:saveAutomationState",
    async (_, state: UserProfileAutomationState) => deps.saveProfileAutomationState(state)
  );
};
