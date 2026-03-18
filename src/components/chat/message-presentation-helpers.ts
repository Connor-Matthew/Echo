import type { ChatAttachment, ChatMessageUsage } from "../../shared/contracts";
import type { EditAttachment } from "./conversation-types";

export const TEXT_ATTACHMENT_LIMIT = 60000;
export const IMAGE_ATTACHMENT_LIMIT = 5 * 1024 * 1024;
export const AGENT_GROUP_DONE_COLLAPSE_DELAY_MS = 700;

const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".xml",
  ".yaml",
  ".yml",
  ".log"
]);

const TEXT_ATTACHMENT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/x-yaml",
  "text/csv"
]);

export const cloneMessageAttachments = (attachments?: ChatAttachment[]): EditAttachment[] =>
  (attachments ?? []).map((attachment) => ({ ...attachment }));

export const formatBytes = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatTokenCount = (value: number) => {
  const formatCompact = (raw: number, suffix: "k" | "m") => {
    const fixed = raw.toFixed(1);
    return `${fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed}${suffix}`;
  };
  if (value >= 1_000_000) {
    return formatCompact(value / 1_000_000, "m");
  }
  if (value >= 1_000) {
    return formatCompact(value / 1_000, "k");
  }
  return `${Math.round(value)}`;
};

const getExtension = (name: string) => {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
};

export const isTextAttachment = (file: File) => {
  if (file.type.startsWith("text/") || TEXT_ATTACHMENT_MIME_TYPES.has(file.type)) {
    return true;
  }
  return TEXT_ATTACHMENT_EXTENSIONS.has(getExtension(file.name));
};

export const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("Failed to read file as data URL."));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file."));
    };
    reader.readAsDataURL(file);
  });

export const toMessageAttachment = (attachment: EditAttachment): ChatAttachment => ({
  id: attachment.id,
  name: attachment.name,
  mimeType: attachment.mimeType,
  size: attachment.size,
  kind: attachment.kind,
  textContent: attachment.kind === "text" ? attachment.textContent : undefined,
  imageDataUrl: attachment.kind === "image" ? attachment.imageDataUrl : undefined
});

export const revokeAttachmentPreview = (attachment: EditAttachment) => {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
};

export const hasUsage = (usage?: ChatMessageUsage | null) =>
  Boolean(
    usage &&
      ((usage.inputTokens ?? 0) > 0 ||
        (usage.outputTokens ?? 0) > 0 ||
        (usage.cacheReadTokens ?? 0) > 0 ||
        (usage.cacheWriteTokens ?? 0) > 0)
  );
