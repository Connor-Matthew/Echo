import { FileText, ImageIcon, X } from "lucide-react";
import { type ComposerAttachment } from "./Composer";
import { Button } from "./ui/button";

type AttachmentTrayProps = {
  attachments: ComposerAttachment[];
  onRemoveAttachment: (attachmentId: string) => void;
};

export const getAttachmentTrayClassNames = () => ({
  tray: "composer-attachment-tray mb-3 flex flex-wrap gap-3",
  item:
    "w-[196px] rounded-[24px] border border-border/50 bg-card/78 px-3.5 py-3 text-left backdrop-blur-xl",
  preview: "mt-2 h-14 w-full rounded-[18px] border border-border/50 object-cover",
  textPreview: "mt-2 rounded-[18px] border border-border/50 bg-accent/22 px-2.5 py-2",
  removeButton:
    "h-6 w-6 shrink-0 rounded-full text-muted-foreground hover:bg-accent/60 hover:text-foreground"
});

const TEXT_PREVIEW_MAX_CHARS = 300;

const formatBytes = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const toTextPreview = (textContent?: string) => {
  if (!textContent) {
    return "";
  }
  const normalized = textContent.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= TEXT_PREVIEW_MAX_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, TEXT_PREVIEW_MAX_CHARS)}...`;
};

export const AttachmentTray = ({ attachments, onRemoveAttachment }: AttachmentTrayProps) => {
  if (!attachments.length) {
    return null;
  }

  const classNames = getAttachmentTrayClassNames();

  return (
    <div className={classNames.tray}>
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className={classNames.item}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {attachment.kind === "image" ? (
                  <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <p className="truncate text-xs font-medium text-foreground">{attachment.name}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">{formatBytes(attachment.size)}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={classNames.removeButton}
              onClick={() => onRemoveAttachment(attachment.id)}
              aria-label="Remove attachment"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          {attachment.previewUrl ? (
            <img
              src={attachment.previewUrl}
              alt={attachment.name}
              className={classNames.preview}
            />
          ) : null}
          {attachment.kind === "text" ? (
            <div className={classNames.textPreview}>
              <pre className="max-h-16 overflow-hidden whitespace-pre-wrap break-all font-mono text-[10px] leading-4 text-muted-foreground">
                {toTextPreview(attachment.textContent)}
              </pre>
            </div>
          ) : null}
          {attachment.error ? (
            <p className="mt-1 text-[11px] text-destructive/80">{attachment.error}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
};
