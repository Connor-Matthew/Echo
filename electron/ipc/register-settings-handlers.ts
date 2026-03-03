import type { IpcMain } from "electron";
import {
  normalizeSettings,
  type AppSettings,
  type ConnectionTestResult,
  type McpServerListResult,
  type McpServerStatusListResult,
  type ModelListResult,
  type UserMcpServer
} from "../../src/shared/contracts";

type SettingsHandlerDeps = {
  settingsFile: string;
  readJson: <T>(filename: string, fallback: T) => Promise<T>;
  writeJson: (filename: string, value: unknown) => Promise<void>;
  mcpManager: {
    syncFromUserServers: (servers: UserMcpServer[]) => Promise<unknown>;
  };
  runCodexCommand: (args: string[]) => Promise<{ ok: boolean; message: string }>;
  isConnectionConfigured: (settings: AppSettings) => boolean;
  fetchModelIds: (settings: AppSettings) => Promise<ModelListResult>;
  fetchMcpServers: () => McpServerListResult;
  fetchMcpServerStatuses: (reload: boolean) => Promise<McpServerStatusListResult>;
};

export const registerSettingsHandlers = (ipcMain: IpcMain, deps: SettingsHandlerDeps) => {
  ipcMain.handle("settings:get", async () => {
    const saved = await deps.readJson<Partial<AppSettings>>(deps.settingsFile, {});
    return normalizeSettings(saved);
  });

  ipcMain.handle("settings:save", async (_, settings: AppSettings) => {
    const normalized = normalizeSettings(settings);
    await deps.writeJson(deps.settingsFile, normalized);
    void deps.mcpManager.syncFromUserServers(normalized.mcpServers);
  });

  ipcMain.handle(
    "settings:testConnection",
    async (_, settings: AppSettings): Promise<ConnectionTestResult> => {
      if (settings.providerType === "acp") {
        const result = await deps.runCodexCommand(["--version"]);
        return {
          ok: result.ok,
          message: result.ok ? `Codex runtime is available (${result.message}).` : result.message
        };
      }

      if (!deps.isConnectionConfigured(settings)) {
        return settings.providerType === "claude-agent"
          ? { ok: false, message: "Please fill API key for Claude Agent provider." }
          : { ok: false, message: "Please fill Base URL and API key." };
      }
      const result = await deps.fetchModelIds(settings);
      if (!result.ok) {
        return { ok: false, message: result.message };
      }
      return { ok: true, message: "Connection succeeded." };
    }
  );

  ipcMain.handle("settings:listModels", async (_, settings: AppSettings): Promise<ModelListResult> =>
    deps.fetchModelIds(settings)
  );

  ipcMain.handle(
    "settings:listMcpServers",
    async (_event, _settings: AppSettings): Promise<McpServerListResult> => deps.fetchMcpServers()
  );

  ipcMain.handle(
    "settings:listMcpServerStatus",
    async (_event, _settings: AppSettings): Promise<McpServerStatusListResult> =>
      deps.fetchMcpServerStatuses(false)
  );

  ipcMain.handle(
    "settings:reloadMcpServers",
    async (_event, _settings: AppSettings): Promise<McpServerStatusListResult> =>
      deps.fetchMcpServerStatuses(true)
  );
};
