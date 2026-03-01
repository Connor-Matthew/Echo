export const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, "");

const normalizeApiKeyToken = (value: string) => value.trim().replace(/^['"]|['"]$/g, "");

export const parseApiKeys = (raw: string) =>
  Array.from(
    new Set(
      raw
        .split(/[,\n]/)
        .map((entry) => normalizeApiKeyToken(entry))
        .filter(Boolean)
    )
  );

export const resolveAnthropicEndpoint = (baseUrl: string, resource: "models" | "messages") => {
  const normalized = normalizeBaseUrl(baseUrl);
  const rooted = normalized
    .replace(/\/v1\/(messages|models)$/i, "")
    .replace(/\/(messages|models)$/i, "");
  return rooted.endsWith("/v1") ? `${rooted}/${resource}` : `${rooted}/v1/${resource}`;
};

export const extractModelIds = (payload: unknown): string[] => {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const source = payload as {
    data?: Array<{ id?: string; name?: string }>;
    models?: Array<string | { id?: string; name?: string }>;
    model_ids?: string[];
  };

  const fromData = Array.isArray(source.data)
    ? source.data
        .map((item) => item.id || item.name || "")
        .filter((value): value is string => Boolean(value))
    : [];
  const fromModels = Array.isArray(source.models)
    ? source.models
        .map((item) => (typeof item === "string" ? item : item?.id || item?.name || ""))
        .filter((value): value is string => Boolean(value))
    : [];
  const fromModelIds = Array.isArray(source.model_ids)
    ? source.model_ids.filter((value): value is string => typeof value === "string")
    : [];

  return Array.from(new Set([...fromData, ...fromModels, ...fromModelIds])).sort((a, b) =>
    a.localeCompare(b)
  );
};

export const clampInteger = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
};
