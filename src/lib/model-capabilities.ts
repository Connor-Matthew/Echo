import type {
  ModelCapabilities,
  ProviderType,
  StoredProvider
} from "../shared/contracts";

const IMAGE_HINTS = [
  "vision",
  "vl",
  "4o",
  "gemini",
  "claude-3",
  "grok-vision",
  "qwen-vl",
  "llava"
];
const AUDIO_HINTS = [
  "audio",
  "realtime",
  "omni",
  "gpt-4o",
  "gemini-live",
  "gemini-2.0-flash"
];
const VIDEO_HINTS = [
  "video",
  "gemini-1.5",
  "gemini-2.0",
  "gpt-4.1",
  "gpt-4o"
];
const REASONING_HINTS = [
  "reason",
  "thinking",
  "o1",
  "o3",
  "o4",
  "r1",
  "deepseek-reasoner"
];

const hasAnyHint = (source: string, hints: string[]) => hints.some((hint) => source.includes(hint));

export const toModelCapabilityKey = (modelId: string) => modelId.trim().toLowerCase();

export const inferModelCapabilities = (
  providerType: ProviderType,
  modelId: string
): ModelCapabilities => {
  const probe = modelId.trim().toLowerCase();

  if (!probe) {
    return {
      textInput: true,
      imageInput: false,
      audioInput: false,
      videoInput: false,
      reasoningDisplay: false
    };
  }

  const imageInput =
    hasAnyHint(probe, IMAGE_HINTS) ||
    ((providerType === "anthropic" || providerType === "claude-agent") &&
      probe.includes("claude-3")) ||
    probe.includes("gpt-5");
  const audioInput = hasAnyHint(probe, AUDIO_HINTS);
  const videoInput = hasAnyHint(probe, VIDEO_HINTS);
  const reasoningDisplay = hasAnyHint(probe, REASONING_HINTS) || probe.includes("gpt-5");

  return {
    textInput: true,
    imageInput,
    audioInput,
    videoInput,
    reasoningDisplay
  };
};

export const resolveProviderModelCapabilities = (
  provider: StoredProvider,
  modelId: string
): ModelCapabilities => {
  const inferred = inferModelCapabilities(provider.providerType, modelId);
  const key = toModelCapabilityKey(modelId);
  if (!key) {
    return inferred;
  }
  const stored = provider.modelCapabilities?.[key];
  if (!stored) {
    return inferred;
  }
  return {
    textInput: stored.textInput !== false,
    imageInput: stored.imageInput,
    audioInput: stored.audioInput,
    videoInput: stored.videoInput,
    reasoningDisplay: stored.reasoningDisplay
  };
};
