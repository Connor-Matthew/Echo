import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { MuApi } from "../../lib/mu-api";
import { normalizeSkills } from "../../lib/skills-utils";
import { type AppSettings, type ConnectionTestResult, type McpServerListResult, type McpServerStatusListResult, type Skill } from "../../shared/contracts";
import { DEFAULT_SETTINGS, normalizeSettings } from "../../domain/settings/normalize";
import { withPersistedAutoDetectedCapabilities } from "./controller-helpers";

type UseSettingsControllerParams = {
  api: MuApi;
  isHydrated: boolean;
  setErrorBanner: Dispatch<SetStateAction<string | null>>;
};

export const useSettingsController = ({
  api,
  isHydrated,
  setErrorBanner
}: UseSettingsControllerParams) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [userSkills, setUserSkills] = useState<Skill[]>([]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const nextSettings = withPersistedAutoDetectedCapabilities(settings);
    if (nextSettings === settings) {
      return;
    }

    setSettings(nextSettings);
    void api.settings.save(nextSettings).catch((error) => {
      setErrorBanner(
        error instanceof Error ? error.message : "Failed to persist auto-detected model capabilities."
      );
    });
  }, [api.settings, isHydrated, setErrorBanner, settings]);

  const hydrateSettings = (nextSettings: AppSettings, savedSkills: Skill[]) => {
    setSettings(nextSettings);
    setUserSkills(normalizeSkills(savedSkills));
  };

  const saveUserSkills = (skills: Skill[]) => {
    setUserSkills(skills);
    void api.skills.save(skills).catch((error) => {
      console.warn("[skills][save] failed", error instanceof Error ? error.message : "unknown");
    });
  };

  const saveSettings = async (next: AppSettings) => {
    const normalized = withPersistedAutoDetectedCapabilities(normalizeSettings(next));
    await api.settings.save(normalized);
    setSettings(normalized);
    setErrorBanner(null);
  };

  const testConnection = async (next: AppSettings): Promise<ConnectionTestResult> =>
    api.settings.testConnection(next);
  const testMemosConnection = async (next: AppSettings): Promise<ConnectionTestResult> =>
    api.memos.testConnection(next);
  const listModels = async (next: AppSettings) => api.settings.listModels(next);
  const listMcpServers = async (next: AppSettings): Promise<McpServerListResult> =>
    api.settings.listMcpServers(next);
  const listMcpServerStatus = async (next: AppSettings): Promise<McpServerStatusListResult> =>
    api.settings.listMcpServerStatus(next);
  const reloadMcpServers = async (next: AppSettings): Promise<McpServerStatusListResult> =>
    api.settings.reloadMcpServers(next);

  const resetSettings = async () => {
    await saveSettings(DEFAULT_SETTINGS);
  };

  return {
    settings,
    setSettings,
    userSkills,
    hydrateSettings,
    saveUserSkills,
    saveSettings,
    testConnection,
    testMemosConnection,
    listModels,
    listMcpServers,
    listMcpServerStatus,
    reloadMcpServers,
    resetSettings
  };
};
