import type { ProviderType, StoredProvider } from "../../shared/contracts";

const DEFAULT_CONTEXT_WINDOW = 200_000;

const toLower = (value: string) => value.trim().toLowerCase();

export const toModelContextWindowKey = (modelId: string) => toLower(modelId);

export const inferModelContextWindow = (
  providerType: ProviderType,
  modelId: string
): number => {
  const probe = toLower(modelId);
  if (!probe) {
    return DEFAULT_CONTEXT_WINDOW;
  }

  if (probe.includes("gemini-1.5") || probe.includes("gemini-2")) {
    return 1_000_000;
  }

  if (probe.includes("gpt-4o") || probe.includes("gpt-4.1")) {
    return 128_000;
  }

  if (
    probe.includes("gpt-5") ||
    probe.includes("o1") ||
    probe.includes("o3") ||
    probe.includes("o4") ||
    probe.includes("claude") ||
    probe.includes("sonnet") ||
    probe.includes("opus")
  ) {
    return 200_000;
  }

  if (probe.includes("deepseek") || probe.includes("qwen") || probe.includes("llama")) {
    return 128_000;
  }

  if (providerType === "acp") {
    return 200_000;
  }

  return DEFAULT_CONTEXT_WINDOW;
};

export const resolveProviderModelContextWindow = (
  provider: StoredProvider,
  modelId: string
): number => {
  const inferred = inferModelContextWindow(provider.providerType, modelId);
  const key = toModelContextWindowKey(modelId);
  if (!key) {
    return inferred;
  }
  const stored = provider.modelContextWindows?.[key];
  if (typeof stored !== "number" || !Number.isFinite(stored)) {
    return inferred;
  }
  return Math.round(stored);
};
