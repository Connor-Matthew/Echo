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

const MAX_TEXTAREA_HEIGHT = 24 * 7;

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
      <div className="w-full rounded-[24px] border border-[#dce2e8] bg-[#f9fafb] px-5 py-4 shadow-[0_2px_8px_rgba(15,23,42,0.06)] dark:border-[#2b3f5d] dark:bg-[#122038] dark:shadow-[0_2px_10px_rgba(2,8,23,0.45)]">
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
                className="rounded-xl border border-[#d8e1ea] bg-white px-2.5 py-2 dark:border-[#314969] dark:bg-[#162742]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {attachment.kind === "image" ? (
                        <ImageIcon className="h-3.5 w-3.5 text-[#5d6e81] dark:text-[#9fb3cd]" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-[#5d6e81] dark:text-[#9fb3cd]" />
                      )}
                      <p className="truncate text-xs font-medium text-[#31465d] dark:text-[#d5e3f6]">{attachment.name}</p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#6d7f93] dark:text-[#9ab0c8]">{formatBytes(attachment.size)}</p>
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
                  <p className="mt-1 text-[11px] text-[#8a5a32] dark:text-[#f2b982]">{attachment.error}</p>
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
          className="max-h-[168px] min-h-[52px] resize-none border-0 bg-transparent p-0 text-[18px] leading-7 text-[#4f5861] shadow-none placeholder:text-[#a1a8af] focus-visible:ring-0 dark:text-[#d2deed] dark:placeholder:text-[#7f92aa]"
          placeholder={
            disabled
              ? "Configure provider settings to start chatting"
              : "Ask Codex anything, @ to add files, / for commands"
          }
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[#74787d] dark:text-[#9cafc5]">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-[#878b90] hover:bg-[#eceef1] hover:text-[#6b7075] dark:text-[#9cafc5] dark:hover:bg-[#223554] dark:hover:text-[#d7e6f8]"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="h-4.5 w-4.5" />
            </Button>
            <div className="relative">
              <select
                value={hasSelectedModel ? modelValue : ""}
                onChange={(event) => onSelectModel(event.target.value)}
                disabled={!normalizedModelOptions.length}
                className="h-8 min-w-[160px] appearance-none rounded-lg border border-transparent bg-transparent px-2.5 pr-7 text-sm font-medium text-[#777b80] hover:bg-[#eceef1] hover:text-[#64696f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70 dark:text-[#a4b8cf] dark:hover:bg-[#223554] dark:hover:text-[#e0ebfa]"
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
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#777b80] dark:text-[#a4b8cf]" />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="h-8 gap-1.5 rounded-lg px-2.5 text-sm font-medium text-[#777b80] hover:bg-[#eceef1] hover:text-[#64696f] dark:text-[#a4b8cf] dark:hover:bg-[#223554] dark:hover:text-[#e0ebfa]"
            >
              <span>High</span>
              <ChevronDown className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-[#8c9095] hover:bg-[#eceef1] hover:text-[#6f7479] dark:text-[#9fb3cb] dark:hover:bg-[#223554] dark:hover:text-[#e0ebfa]"
              aria-label="Voice input"
            >
              <Mic className="h-4.5 w-4.5" />
            </Button>
            {isGenerating ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 w-10 rounded-full border-[#bc8f8f] bg-[#f8ecec] p-0 text-[#8f3333] hover:bg-[#f5dede] hover:text-[#7e2929] dark:border-[#874444] dark:bg-[#3b1f27] dark:text-[#ff9ea3] dark:hover:bg-[#4b2530]"
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
                className="h-10 w-10 rounded-full border border-[#888c91] bg-[#90959a] p-0 text-[#f5f6f7] hover:bg-[#7e8389] disabled:border-[#cfd3d7] disabled:bg-[#e8eaec] disabled:text-[#b1b5b9] dark:border-[#3d5575] dark:bg-[#2f4767] dark:text-[#deebfb] dark:hover:bg-[#3b5a82] dark:disabled:border-[#334865] dark:disabled:bg-[#22334d] dark:disabled:text-[#6f87a4]"
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
