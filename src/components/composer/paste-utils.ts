const PASTE_AS_FILE_CHAR_THRESHOLD = 1500;
const PASTE_AS_FILE_LINE_THRESHOLD = 28;
const CODE_PASTE_MIN_LINE_THRESHOLD = 10;
const CODE_FENCE_REGEX = /```[\s\S]*?```/;
const CODE_HINT_REGEX =
  /(^\s*(import|export|from|const|let|var|function|class|interface|type|def|if|for|while|switch|return)\b|=>|[{}()[\];<>])/gm;
const FENCED_CODE_LANGUAGE_REGEX = /^\s*```([a-z0-9_+-]+)/im;
const PASTED_TEXT_MIME_BY_EXTENSION: Record<string, string> = {
  json: "application/json",
  xml: "application/xml",
  md: "text/markdown",
  txt: "text/plain"
};
const CODE_LANGUAGE_TO_EXTENSION: Record<string, string> = {
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  css: "css",
  go: "go",
  html: "html",
  java: "java",
  javascript: "js",
  js: "js",
  json: "json",
  jsx: "jsx",
  kotlin: "kt",
  markdown: "md",
  md: "md",
  php: "php",
  py: "py",
  python: "py",
  ruby: "rb",
  rs: "rs",
  rust: "rs",
  sh: "sh",
  sql: "sql",
  swift: "swift",
  ts: "ts",
  tsx: "tsx",
  typescript: "ts",
  xml: "xml",
  yaml: "yaml",
  yml: "yml"
};

const getLineCount = (text: string) => text.split(/\r?\n/).length;

export const shouldConvertPastedTextToFile = (rawText: string) => {
  const text = rawText.trim();
  if (!text) {
    return false;
  }

  const lineCount = getLineCount(text);
  if (text.length >= PASTE_AS_FILE_CHAR_THRESHOLD || lineCount >= PASTE_AS_FILE_LINE_THRESHOLD) {
    return true;
  }

  if (CODE_FENCE_REGEX.test(text)) {
    return true;
  }

  if (lineCount < CODE_PASTE_MIN_LINE_THRESHOLD) {
    return false;
  }

  const codeHintCount = text.match(CODE_HINT_REGEX)?.length ?? 0;
  return codeHintCount >= 5;
};

export const inferPastedFileExtension = (rawText: string) => {
  const text = rawText.trim();
  if (!text) {
    return "txt";
  }

  const fencedLanguage = text.match(FENCED_CODE_LANGUAGE_REGEX)?.[1]?.toLowerCase();
  if (fencedLanguage && CODE_LANGUAGE_TO_EXTENSION[fencedLanguage]) {
    return CODE_LANGUAGE_TO_EXTENSION[fencedLanguage];
  }

  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    return "json";
  }

  if (text.startsWith("<?xml") || /^<[a-z][\w-]*[\s>]/i.test(text)) {
    return "xml";
  }

  if (/^#{1,6}\s/m.test(text) || /^[-*]\s/m.test(text)) {
    return "md";
  }

  return "txt";
};

export const toPastedTextFile = (content: string, timestamp = new Date()) => {
  const extension = inferPastedFileExtension(content);
  const isoTimestamp = timestamp.toISOString();
  const stamp = [
    isoTimestamp.slice(0, 4),
    isoTimestamp.slice(5, 7),
    isoTimestamp.slice(8, 10),
    isoTimestamp.slice(11, 13),
    isoTimestamp.slice(14, 16),
    isoTimestamp.slice(17, 19)
  ].join("");
  const mimeType = PASTED_TEXT_MIME_BY_EXTENSION[extension] ?? "text/plain";
  return new File([content], `pasted-${stamp}.${extension}`, { type: mimeType });
};
