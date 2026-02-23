import { FileText, ImageIcon, X } from "lucide-react";
import { type ComposerAttachment } from "./Composer";
import { Button } from "./ui/button";

type AttachmentTrayProps = {
  attachments: ComposerAttachment[];
  onRemoveAttachment: (attachmentId: string) => void;
};

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

  return (
    <div className="mb-2.5 flex flex-wrap gap-2 sm:mb-3">
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="w-[168px] rounded-[6px] border border-border bg-card px-2 py-1.5 sm:w-[180px]"
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
              className="h-5 w-5 shrink-0 rounded-md"
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
              className="mt-1.5 h-12 w-full rounded-md border border-border object-cover"
            />
          ) : null}
          {attachment.kind === "text" ? (
            <div className="mt-1.5 rounded-md border border-border/80 bg-accent/30 px-1.5 py-1">
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
