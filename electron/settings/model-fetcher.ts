import { app } from "electron";
import { listCodexAcpModels } from "../codex/codex-runtime";
import {
  type AppSettings,
  type ModelListResult
} from "../../src/shared/contracts";
import {
  extractModelIds,
  normalizeBaseUrl,
  parseApiKeys,
  resolveAnthropicEndpoint
} from "../../src/domain/provider/utils";

type FetchModelIdsDeps = {
  createId: () => string;
};

export const createFetchModelIds =
  ({ createId }: FetchModelIdsDeps) =>
  async (settings: AppSettings): Promise<ModelListResult> => {
    if (settings.providerType === "acp") {
      try {
        const models = await listCodexAcpModels({
          appVersion: app.getVersion(),
          createId
        });
        return {
          ok: true,
          message: models.length
            ? `Fetched ${models.length} ACP model(s).`
            : "ACP runtime is reachable, but no models were returned.",
          models
        };
      } catch (error) {
        return {
          ok: false,
          message: `Failed to fetch ACP models. ${error instanceof Error ? error.message : "Unknown error."}`,
          models: []
        };
      }
    }

    const baseUrl = normalizeBaseUrl(
      settings.baseUrl || (settings.providerType === "claude-agent" ? "https://api.anthropic.com" : "")
    );
    const apiKeys = parseApiKeys(settings.apiKey);
    if (!baseUrl || !apiKeys.length) {
      return settings.providerType === "claude-agent"
        ? { ok: false, message: "Please fill API key.", models: [] }
        : { ok: false, message: "Please fill Base URL and API key.", models: [] };
    }

    const isAnthropic = settings.providerType === "anthropic" || settings.providerType === "claude-agent";
    const attempts: Array<{ endpoint: string; headers: Record<string, string> }> = isAnthropic
      ? apiKeys.flatMap((apiKey) => [
          {
            endpoint: resolveAnthropicEndpoint(baseUrl, "models"),
            headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } as Record<
              string,
              string
            >
          },
          {
            endpoint: `${baseUrl}/models`,
            headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } as Record<
              string,
              string
            >
          },
          {
            endpoint: resolveAnthropicEndpoint(baseUrl, "models"),
            headers: { Authorization: `Bearer ${apiKey}` } as Record<string, string>
          },
          {
            endpoint: `${baseUrl}/models`,
            headers: { Authorization: `Bearer ${apiKey}` } as Record<string, string>
          }
        ])
      : apiKeys.map((apiKey) => ({
          endpoint: `${baseUrl}/models`,
          headers: { Authorization: `Bearer ${apiKey}` } as Record<string, string>
        }));

    let lastFailure = "Unknown error.";

    for (const attempt of attempts) {
      try {
        const response = await fetch(attempt.endpoint, { headers: attempt.headers });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          lastFailure = `HTTP ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`;
          continue;
        }

        const parsed = (await response.json().catch(() => null)) as unknown;
        const models = extractModelIds(parsed);
        return {
          ok: true,
          message: models.length
            ? `Fetched ${models.length} model(s).`
            : "Connected, but provider returned no model list.",
          models
        };
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : "Network request failed.";
      }
    }

    return {
      ok: false,
      message: `Failed to fetch models. ${lastFailure}`,
      models: []
    };
  };
