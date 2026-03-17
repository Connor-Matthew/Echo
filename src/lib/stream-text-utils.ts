const HARD_BOUNDARY_CHARS = new Set(["\n", "\r"]);
const SOFT_BOUNDARY_CHARS = new Set([" ", "\t", "\u3000"]);
const PUNCTUATION_BOUNDARY_CHARS = new Set([
  ",",
  ".",
  "!",
  "?",
  ";",
  ":",
  "，",
  "。",
  "！",
  "？",
  "；",
  "：",
  "、",
  ")",
  "]",
  "}",
  ">",
  "）",
  "】",
  "》"
]);

const STREAM_MIN_SEMANTIC_CHUNK = 20;
const STREAM_FORCED_REMAINDER = 18;
const STREAM_MIN_EAGER_BOUNDARY_CHUNK = 10;

const isHardBoundary = (char: string) => HARD_BOUNDARY_CHARS.has(char);

const isSoftBoundary = (char: string) => SOFT_BOUNDARY_CHARS.has(char);

const isPunctuationBoundary = (char: string) => PUNCTUATION_BOUNDARY_CHARS.has(char);

const clampIndex = (text: string, index: number) => Math.max(0, Math.min(text.length, index));

const resolveBackwardBoundaryIndex = (text: string, floor: number, ceiling: number) => {
  const start = clampIndex(text, floor);
  const end = clampIndex(text, ceiling);

  for (let index = end - 1; index >= start; index -= 1) {
    if (isHardBoundary(text[index])) {
      return index + 1;
    }
  }

  for (let index = end - 1; index >= start; index -= 1) {
    if (isPunctuationBoundary(text[index])) {
      return index + 1;
    }
  }

  for (let index = end - 1; index >= start; index -= 1) {
    if (isSoftBoundary(text[index])) {
      return index + 1;
    }
  }

  return -1;
};

export const splitStreamBufferForCommit = (
  buffer: string,
  {
    force = false,
    minChunkLength = STREAM_MIN_SEMANTIC_CHUNK
  }: {
    force?: boolean;
    minChunkLength?: number;
  } = {}
) => {
  if (!buffer) {
    return {
      commit: "",
      remainder: ""
    };
  }

  if (force || buffer.length <= minChunkLength) {
    const eagerBoundary = force
      ? -1
      : resolveBackwardBoundaryIndex(buffer, STREAM_MIN_EAGER_BOUNDARY_CHUNK, buffer.length);
    return {
      commit: force ? buffer : eagerBoundary >= STREAM_MIN_EAGER_BOUNDARY_CHUNK ? buffer.slice(0, eagerBoundary) : "",
      remainder:
        force ? "" : eagerBoundary >= STREAM_MIN_EAGER_BOUNDARY_CHUNK ? buffer.slice(eagerBoundary) : buffer
    };
  }

  const boundary = resolveBackwardBoundaryIndex(buffer, minChunkLength, buffer.length);
  if (boundary >= minChunkLength) {
    return {
      commit: buffer.slice(0, boundary),
      remainder: buffer.slice(boundary)
    };
  }

  if (buffer.length <= minChunkLength + STREAM_FORCED_REMAINDER) {
    return {
      commit: "",
      remainder: buffer
    };
  }

  const fallbackBoundary = buffer.length - STREAM_FORCED_REMAINDER;
  return {
    commit: buffer.slice(0, fallbackBoundary),
    remainder: buffer.slice(fallbackBoundary)
  };
};
