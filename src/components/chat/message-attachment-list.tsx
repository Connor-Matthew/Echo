import type { ChatAttachment } from "../../shared/contracts";

type MessageAttachmentListProps = {
  attachments: ChatAttachment[];
  isUser: boolean;
};

export const getMessageAttachmentListWrapClassName = (isUser: boolean) =>
  isUser ? "mt-3 flex flex-wrap justify-end gap-2.5" : "mt-3 flex flex-wrap gap-2.5";

export const getMessageAttachmentListCardClassName = () =>
  "min-w-[220px] max-w-[280px] rounded-[22px] border border-border/50 bg-card/82 p-3 shadow-[0_16px_36px_rgba(79,60,35,0.08)] backdrop-blur-xl";

const formatAttachmentBytes = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const toAttachmentLabel = (mimeType: string) => {
  if (mimeType.includes("pdf")) {
    return "PDF";
  }
  if (mimeType.startsWith("image/")) {
    return "Image";
  }
  if (mimeType.startsWith("text/")) {
    return "Text";
  }
  return "File";
};

const toTextPreview = (textContent?: string) => {
  if (!textContent) {
    return "";
  }
  const normalized = textContent.replace(/\s+/g, " ").trim();
  if (normalized.length <= 84) {
    return normalized;
  }
  return `${normalized.slice(0, 84)}...`;
};

export const MessageAttachmentList = ({ attachments, isUser }: MessageAttachmentListProps) => {
  if (!attachments.length) {
    return null;
  }

  return (
    <div className={getMessageAttachmentListWrapClassName(isUser)}>
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className={getMessageAttachmentListCardClassName()}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium tracking-[-0.01em] text-foreground">
                {attachment.name}
              </p>
              <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80">
                <span>{toAttachmentLabel(attachment.mimeType)}</span>
                <span className="h-1 w-1 rounded-full bg-muted-foreground/45" />
                <span>{formatAttachmentBytes(attachment.size)}</span>
              </div>
            </div>
          </div>
          {attachment.imageDataUrl ? (
            <img
              src={attachment.imageDataUrl}
              alt={attachment.name}
              className="mt-3 h-28 w-full rounded-[18px] border border-border/45 object-cover"
            />
          ) : null}
          {attachment.kind === "text" && attachment.textContent ? (
            <div className="mt-3 rounded-[18px] border border-border/45 bg-background/70 px-3 py-2.5 text-[12px] leading-5 text-muted-foreground">
              {toTextPreview(attachment.textContent)}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
};
