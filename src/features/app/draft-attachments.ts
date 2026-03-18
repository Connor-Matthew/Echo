import type { ModelCapabilities } from "../../shared/contracts";
import {
  IMAGE_ATTACHMENT_LIMIT,
  TEXT_ATTACHMENT_LIMIT,
  isAudioAttachment,
  isTextAttachment,
  isVideoAttachment,
  readFileAsDataUrl
} from "../chat/utils/chat-utils";

export type DraftAttachment = {
  id: string;
  name: string;
  size: number;
  kind: "text" | "image" | "file";
  mimeType: string;
  textContent?: string;
  imageDataUrl?: string;
  previewUrl?: string;
  error?: string;
};

type BuildDraftAttachmentsOptions = {
  files: File[];
  createId: () => string;
  modelId: string;
  modelCapabilities: ModelCapabilities;
};

export const buildDraftAttachments = async ({
  files,
  createId,
  modelId,
  modelCapabilities
}: BuildDraftAttachmentsOptions): Promise<{
  accepted: DraftAttachment[];
  blockedMessages: string[];
}> => {
  const blockedMessages: string[] = [];
  const nextAttachments = await Promise.all(
    files.map(async (file): Promise<DraftAttachment | null> => {
      const base: DraftAttachment = {
        id: createId(),
        name: file.name,
        size: file.size,
        kind: "file",
        mimeType: file.type || "application/octet-stream"
      };

      if (file.type.startsWith("image/")) {
        if (!modelCapabilities.imageInput) {
          blockedMessages.push(`模型 "${modelId}" 不支持图片输入：${file.name}`);
          return null;
        }
        const previewUrl = URL.createObjectURL(file);
        if (file.size > IMAGE_ATTACHMENT_LIMIT) {
          return {
            ...base,
            kind: "image",
            previewUrl,
            error: `图片超过 ${(IMAGE_ATTACHMENT_LIMIT / (1024 * 1024)).toFixed(0)}MB，无法发送给模型。`
          };
        }

        try {
          const imageDataUrl = await readFileAsDataUrl(file);
          return {
            ...base,
            kind: "image",
            previewUrl,
            imageDataUrl
          };
        } catch {
          return {
            ...base,
            kind: "image",
            previewUrl,
            error: "图片读取失败，无法发送给模型。"
          };
        }
      }

      if (isAudioAttachment(file)) {
        if (!modelCapabilities.audioInput) {
          blockedMessages.push(`模型 "${modelId}" 不支持音频输入：${file.name}`);
          return null;
        }
        return base;
      }

      if (isVideoAttachment(file)) {
        if (!modelCapabilities.videoInput) {
          blockedMessages.push(`模型 "${modelId}" 不支持视频输入：${file.name}`);
          return null;
        }
        return base;
      }

      if (isTextAttachment(file)) {
        try {
          const content = await file.text();
          const isTrimmed = content.length > TEXT_ATTACHMENT_LIMIT;
          return {
            ...base,
            kind: "text",
            textContent: content.slice(0, TEXT_ATTACHMENT_LIMIT),
            error: isTrimmed ? `文本已截断到前 ${TEXT_ATTACHMENT_LIMIT} 个字符。` : undefined
          };
        } catch {
          return {
            ...base,
            kind: "text",
            error: "文件读取失败，无法注入到消息上下文。"
          };
        }
      }

      return base;
    })
  );

  return {
    accepted: nextAttachments.filter((attachment): attachment is DraftAttachment => Boolean(attachment)),
    blockedMessages
  };
};
