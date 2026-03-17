import type { AppSettings } from "../../src/shared/contracts";

const getActiveProviderFromSettings = (settings: AppSettings) =>
  settings.providers.find((provider) => provider.id === settings.activeProviderId) ??
  settings.providers[0];

export const buildAcpMcpConfigOverrides = (
  settings: AppSettings,
  enabledMcpServerIds?: string[]
) => {
  const activeProvider = getActiveProviderFromSettings(settings);
  if (!activeProvider || activeProvider.providerType !== "acp") {
    return null;
  }

  const overrideMap = new Map<string, { enabled: boolean }>();

  for (const [name, override] of Object.entries(activeProvider.mcpServerOverrides ?? {})) {
    const key = name.trim();
    if (!key || !override || typeof override.enabled !== "boolean") {
      continue;
    }
    overrideMap.set(key, { enabled: override.enabled });
  }

  if (Array.isArray(enabledMcpServerIds)) {
    const enabledIdSet = new Set(
      enabledMcpServerIds
        .map((id) => id.trim())
        .filter(Boolean)
    );
    for (const server of settings.mcpServers ?? []) {
      const name = server.name.trim();
      if (!name) {
        continue;
      }
      overrideMap.set(name, { enabled: server.enabled && enabledIdSet.has(server.id) });
    }
  }

  if (!overrideMap.size) {
    return null;
  }

  return {
    mcp_servers: Object.fromEntries(overrideMap.entries())
  };
};
