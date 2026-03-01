import type { ChatAttachment, ChatStreamRequest, CompletionMessage } from "../../src/shared/contracts";

const toAttachmentMetaText = (attachment: ChatAttachment) =>
  `[Attachment: ${attachment.name} | ${attachment.mimeType || "unknown"} | ${attachment.size} bytes]`;

const toTextAttachmentBlock = (attachment: ChatAttachment) =>
  `${toAttachmentMetaText(attachment)}\n${attachment.textContent?.trim() ?? ""}`;

const parseDataUrl = (dataUrl: string) => {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    return null;
  }
  return { mediaType: match[1], data: match[2] };
};

const buildOpenAiMessageContent = (message: CompletionMessage) => {
  const parts: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = [];

  const prompt = message.content.trim();
  if (prompt) {
    parts.push({ type: "text", text: prompt });
  }

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === "text" && attachment.textContent?.trim()) {
      parts.push({ type: "text", text: toTextAttachmentBlock(attachment) });
      continue;
    }

    if (attachment.kind === "image" && attachment.imageDataUrl?.trim()) {
      parts.push({
        type: "image_url",
        image_url: { url: attachment.imageDataUrl.trim() }
      });
      continue;
    }

    parts.push({ type: "text", text: toAttachmentMetaText(attachment) });
  }

  if (!parts.length) {
    return null;
  }
  if (parts.length === 1 && parts[0].type === "text") {
    return parts[0].text;
  }
  return parts;
};

export const toOpenAiStreamMessages = (messages: CompletionMessage[]) =>
  messages
    .map((message) => {
      const content = buildOpenAiMessageContent(message);
      if (!content) {
        return null;
      }
      return {
        role: message.role,
        content
      };
    })
    .filter(
      (
        message
      ): message is {
        role: CompletionMessage["role"];
        content:
          | string
          | Array<
              { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
            >;
      } => Boolean(message)
    );

export const toAnthropicContentBlocks = (message: CompletionMessage) => {
  const blocks: Array<
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  > = [];

  const prompt = message.content.trim();
  if (prompt) {
    blocks.push({ type: "text", text: prompt });
  }

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === "text" && attachment.textContent?.trim()) {
      blocks.push({ type: "text", text: toTextAttachmentBlock(attachment) });
      continue;
    }

    if (attachment.kind === "image" && attachment.imageDataUrl?.trim()) {
      const source = parseDataUrl(attachment.imageDataUrl);
      if (source) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: source.mediaType,
            data: source.data
          }
        });
        continue;
      }
    }

    blocks.push({ type: "text", text: toAttachmentMetaText(attachment) });
  }

  return blocks;
};

const formatMessageForAcpTurn = (message: CompletionMessage) => {
  const blocks: string[] = [];
  if (message.content.trim()) {
    blocks.push(message.content.trim());
  }

  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === "text" && attachment.textContent?.trim()) {
      blocks.push(toTextAttachmentBlock(attachment));
      continue;
    }
    blocks.push(toAttachmentMetaText(attachment));
  }

  return blocks.join("\n\n").trim();
};

export const formatMessagesForAcpTurn = (payload: ChatStreamRequest) =>
  payload.messages
    .map((message) => ({
      role: message.role.toUpperCase(),
      content: formatMessageForAcpTurn(message)
    }))
    .filter((message) => Boolean(message.content))
    .map((message) => `[${message.role}]\n${message.content}`)
    .join("\n\n");
