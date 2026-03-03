import type { DragEvent, RefObject } from "react";
import { FileText, ImageIcon, Plus, X } from "lucide-react";
import type { ChatAttachment } from "../../shared/contracts";
import { Button } from "../ui/button";

type EditAttachment = ChatAttachment & {
  previewUrl?: string;
  error?: string;
};

type MessageEditPanelProps = {
  isDragOver: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  fileInputRef: RefObject<HTMLInputElement>;
  onFileInputChange: (files: FileList | null) => void;
  editDraft: string;
  onChangeDraft: (value: string) => void;
  editAttachments: EditAttachment[];
  formatBytes: (size: number) => string;
  onRemoveAttachment: (attachmentId: string) => void;
  onOpenFilePicker: () => void;
  onCancel: () => void;
  onSave: () => void;
  isGenerating: boolean;
};

export const MessageEditPanel = ({
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  fileInputRef,
  onFileInputChange,
  editDraft,
  onChangeDraft,
  editAttachments,
  formatBytes,
  onRemoveAttachment,
  onOpenFilePicker,
  onCancel,
  onSave,
  isGenerating
}: MessageEditPanelProps) => (
  <div
    className={[
      "rounded-md border bg-card px-3 py-2.5 transition-colors",
      isDragOver ? "border-primary bg-accent/65" : "border-border"
    ].join(" ")}
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
  >
    <input
      ref={fileInputRef}
      type="file"
      multiple
      className="hidden"
      accept="*/*"
      onChange={(event) => {
        onFileInputChange(event.target.files);
        event.target.value = "";
      }}
    />
    <textarea
      value={editDraft}
      onChange={(event) => onChangeDraft(event.target.value)}
      className="min-h-[80px] w-full resize-y rounded-xl border border-input bg-card p-2 text-[14px] leading-6 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
    {editAttachments.length ? (
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {editAttachments.map((attachment) => (
          <div
            key={attachment.id}
            className="rounded-md border border-border bg-card px-2.5 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {attachment.kind === "image" ? (
                    <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <p className="truncate text-xs font-medium text-foreground">{attachment.name}</p>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatBytes(attachment.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 rounded-md"
                onClick={() => onRemoveAttachment(attachment.id)}
                aria-label="Remove attachment"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            {attachment.previewUrl ? (
              <img
                src={attachment.previewUrl}
                alt={attachment.name}
                className="mt-2 h-16 w-full rounded-md object-cover"
              />
            ) : null}
            {attachment.error ? (
              <p className="mt-1 text-[11px] text-destructive/80">{attachment.error}</p>
            ) : null}
          </div>
        ))}
      </div>
    ) : (
      <p className="mt-2 text-[11px] text-muted-foreground">
        {isDragOver ? "松开鼠标即可添加附件" : "支持拖拽文件到这里上传。"}
      </p>
    )}
    <div className="mt-2 flex items-center justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={onOpenFilePicker}
        disabled={isGenerating}
      >
        <Plus className="h-3.5 w-3.5" />
        添加附件
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={onCancel}
      >
        <X className="h-3.5 w-3.5" />
        取消
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={onSave}
        disabled={isGenerating}
      >
        保存并重生成
      </Button>
    </div>
  </div>
);
