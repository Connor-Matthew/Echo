import { useEffect, useMemo, useRef, type KeyboardEventHandler } from "react";
import { ArrowUp, ChevronDown, CircleStop, FileText, ImageIcon, Mic, Plus, X } from "lucide-react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export type ComposerAttachment = {
  id: string;
  name: string;
  size: number;
  kind: "text" | "image" | "file";
  previewUrl?: string;
  error?: string;
};

export type ComposerModelOption = {
  value: string;
  label: string;
};

type ComposerProps = {
  value: string;
  modelLabel: string;
  modelValue: string;
  modelOptions: ComposerModelOption[];
  sendWithEnter: boolean;
  attachments: ComposerAttachment[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onSelectModel: (modelId: string) => void;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop: () => void;
  disabled: boolean;
  isGenerating: boolean;
};

const MAX_TEXTAREA_HEIGHT = 24 * 4;

const formatBytes = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const Composer = ({
  value,
  modelLabel,
  modelValue,
  modelOptions,
  sendWithEnter,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  onSelectModel,
  onChange,
  onSubmit,
  onStop,
  disabled,
  isGenerating
}: ComposerProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = useMemo(
    () => Boolean(value.trim() || attachments.length),
    [value, attachments.length]
  );
  const normalizedModelOptions = useMemo(() => {
    const deduped = new Map<string, ComposerModelOption>();
    modelOptions.forEach((option) => {
      const value = option.value.trim();
      const label = option.label.trim();
      if (!value || !label || deduped.has(value)) {
        return;
      }
      deduped.set(value, { value, label });
    });
    return Array.from(deduped.values());
  }, [modelOptions]);
  const hasSelectedModel = normalizedModelOptions.some((option) => option.value === modelValue);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
  }, [value]);

  const submit = () => {
    if (!canSubmit || disabled) {
      return;
    }
    onSubmit(value.trim());
  };

  const onKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.key !== "Enter") {
      return;
    }

    if (sendWithEnter) {
      if (!event.shiftKey) {
        event.preventDefault();
        submit();
      }
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <footer className="w-full">
      <div className="w-full rounded-[8px] border border-border bg-card/95 px-3 py-2.5 shadow-[4px_4px_0_hsl(var(--border))] sm:px-4 sm:py-3 md:px-5 md:py-3.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".md,.txt,text/markdown,text/plain,image/*,.pdf,.doc,.docx"
          onChange={(event) => {
            onAddFiles(event.target.files);
            event.target.value = "";
          }}
        />

        {attachments.length ? (
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="rounded-[4px] border border-border bg-secondary/35 px-2.5 py-2"
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
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{formatBytes(attachment.size)}</p>
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
        ) : null}

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          className="max-h-[96px] min-h-[38px] resize-none border-0 bg-transparent p-0 text-[16px] leading-6 text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0"
          placeholder={
            disabled
              ? "Configure provider settings to start chatting"
              : "How can I help?"
          }
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 sm:mt-2.5 sm:gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-muted-foreground sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-[4px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="h-4.5 w-4.5" />
            </Button>
            <div className="relative w-[118px] shrink-0 sm:w-[180px] md:w-[200px]">
              <select
                value={hasSelectedModel ? modelValue : ""}
                onChange={(event) => onSelectModel(event.target.value)}
                disabled={!normalizedModelOptions.length}
                className="h-8 w-full appearance-none overflow-hidden text-ellipsis whitespace-nowrap rounded-[4px] border border-transparent bg-transparent px-2.5 pr-7 text-sm font-medium text-muted-foreground hover:border-border/70 hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
              >
                {!hasSelectedModel ? (
                  <option value="">{modelLabel || "Model"}</option>
                ) : null}
                {normalizedModelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-8 gap-1 rounded-[4px] px-2 text-sm font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground sm:gap-1.5 sm:px-2.5"
            >
              <span>High</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-[4px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              aria-label="Voice input"
            >
              <Mic className="h-4.5 w-4.5" />
            </Button>
            {isGenerating ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 w-10 rounded-[4px] border-destructive/60 bg-destructive/10 p-0 text-destructive hover:bg-destructive/15"
                onClick={onStop}
                aria-label="Stop generating"
              >
                <CircleStop className="h-4.5 w-4.5" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={submit}
                disabled={disabled || !canSubmit}
                className="h-10 w-10 rounded-[4px] border border-border bg-primary p-0 text-primary-foreground hover:bg-primary/90 disabled:border-border/40 disabled:bg-secondary disabled:text-muted-foreground"
                aria-label="Send message"
              >
                <ArrowUp className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};
