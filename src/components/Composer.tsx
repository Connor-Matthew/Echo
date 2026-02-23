import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEventHandler,
  type KeyboardEventHandler
} from "react";
import {
  ArrowUp,
  Brain,
  ChevronDown,
  CircleStop,
  ImageIcon,
  Mic,
  Plus,
  SlidersHorizontal
} from "lucide-react";
import type { ChatContextWindow, ModelCapabilities } from "../shared/contracts";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export type ComposerAttachment = {
  id: string;
  name: string;
  size: number;
  kind: "text" | "image" | "file";
  textContent?: string;
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
  modelCapabilities: ModelCapabilities;
  sendWithEnter: boolean;
  chatContextWindow: ChatContextWindow;
  attachmentCount: number;
  onAddFiles: (files: FileList | File[] | null) => void;
  onChangeChatContextWindow: (value: ChatContextWindow) => void;
  onSelectModel: (modelId: string) => void;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop: () => void;
  usageLabel?: string | null;
  disabled: boolean;
  isGenerating: boolean;
};

const MAX_TEXTAREA_HEIGHT = 24 * 4;
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
const CONTEXT_WINDOW_OPTIONS: Array<{ value: ChatContextWindow; label: string }> = [
  { value: 5, label: "5" },
  { value: 20, label: "20" },
  { value: 50, label: "50" },
  { value: "infinite", label: "无限" }
];
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
const findContextWindowIndex = (value: ChatContextWindow) => {
  const index = CONTEXT_WINDOW_OPTIONS.findIndex((option) => option.value === value);
  return index >= 0 ? index : 0;
};

const getLineCount = (text: string) => text.split(/\r?\n/).length;

const shouldConvertPastedTextToFile = (rawText: string) => {
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

const inferPastedFileExtension = (rawText: string) => {
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

const toPastedTextFile = (content: string) => {
  const extension = inferPastedFileExtension(content);
  const isoTimestamp = new Date().toISOString();
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

export const Composer = ({
  value,
  modelLabel,
  modelValue,
  modelOptions,
  modelCapabilities,
  sendWithEnter,
  chatContextWindow,
  attachmentCount,
  onAddFiles,
  onChangeChatContextWindow,
  onSelectModel,
  onChange,
  onSubmit,
  onStop,
  usageLabel,
  disabled,
  isGenerating
}: ComposerProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickSettingsRef = useRef<HTMLDivElement>(null);
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(value.trim() || attachmentCount),
    [value, attachmentCount]
  );
  const contextWindowIndex = useMemo(
    () => findContextWindowIndex(chatContextWindow),
    [chatContextWindow]
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

  useEffect(() => {
    if (!isQuickSettingsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!quickSettingsRef.current?.contains(event.target as Node)) {
        setIsQuickSettingsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsQuickSettingsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isQuickSettingsOpen]);

  const submit = () => {
    if (!canSubmit || disabled) {
      return;
    }
    onSubmit(value.trim());
  };

  const onKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }

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

  const onPaste: ClipboardEventHandler<HTMLTextAreaElement> = (event) => {
    const files = event.clipboardData?.files;
    if (files?.length) {
      event.preventDefault();
      onAddFiles(files);
      return;
    }

    const fallbackFiles = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((item): item is File => Boolean(item));

    if (!fallbackFiles.length) {
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!shouldConvertPastedTextToFile(text)) {
        return;
      }
      event.preventDefault();
      onAddFiles([toPastedTextFile(text)]);
      return;
    }

    event.preventDefault();
    onAddFiles(fallbackFiles);
  };

  return (
    <footer className="w-full">
      <div className="w-full rounded-[8px] border border-border bg-card/95 px-3 py-2.5 shadow-[4px_4px_0_hsl(var(--border))] sm:px-4 sm:py-3 md:px-5 md:py-3.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="*/*"
          onChange={(event) => {
            onAddFiles(event.target.files);
            event.target.value = "";
          }}
        />

        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
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
              className="h-7 w-7 rounded-[4px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Add attachment"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <div className="relative" ref={quickSettingsRef}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-[4px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                onClick={() => setIsQuickSettingsOpen((previous) => !previous)}
                aria-label="Open quick settings"
                title="上下文档位"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
              {isQuickSettingsOpen ? (
                <div className="absolute bottom-full left-0 z-40 mb-2 w-[236px] rounded-[6px] border border-border bg-card p-2.5 shadow-[4px_4px_0_hsl(var(--border))]">
                  <p className="mb-1 px-1 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    Context Window
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={CONTEXT_WINDOW_OPTIONS.length - 1}
                    step={1}
                    value={contextWindowIndex}
                    className="h-5 w-full accent-primary"
                    aria-label="Context window slider"
                    onChange={(event) => {
                      const nextIndex = Number.parseInt(event.target.value, 10);
                      if (!Number.isFinite(nextIndex)) {
                        return;
                      }
                      const clampedIndex = Math.max(
                        0,
                        Math.min(CONTEXT_WINDOW_OPTIONS.length - 1, nextIndex)
                      );
                      const nextOption = CONTEXT_WINDOW_OPTIONS[clampedIndex];
                      if (nextOption) {
                        onChangeChatContextWindow(nextOption.value);
                      }
                    }}
                  />
                  <div className="mt-1 flex items-center justify-between px-0.5 text-[11px] text-muted-foreground">
                    {CONTEXT_WINDOW_OPTIONS.map((option, index) => (
                      <span
                        key={String(option.value)}
                        className={index === contextWindowIndex ? "font-semibold text-foreground" : ""}
                      >
                        {option.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
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
            <div className="ml-0.5 flex items-center gap-1">
              {[
                {
                  key: "imageInput",
                  label: "图片输入",
                  Icon: ImageIcon,
                  enabled: modelCapabilities.imageInput
                },
                {
                  key: "reasoningDisplay",
                  label: "思维链",
                  Icon: Brain,
                  enabled: modelCapabilities.reasoningDisplay
                }
              ].map(({ key, label, Icon, enabled }) => (
                <span
                  key={key}
                  title={`${label}${enabled ? "" : "（当前模型不支持）"}`}
                  className={[
                    "inline-flex h-6 w-6 items-center justify-center rounded-[4px] border transition-colors",
                    enabled
                      ? "border-border bg-accent/70 text-foreground"
                      : "border-border/60 bg-card text-muted-foreground/55"
                  ].join(" ")}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
              ))}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {usageLabel ? (
              <p className="text-[15px] font-medium tabular-nums leading-none text-muted-foreground">
                {usageLabel}
              </p>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-[4px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              aria-label="Voice input"
            >
              <Mic className="h-4 w-4" />
            </Button>
            {isGenerating ? (
              <Button
                type="button"
                variant="outline"
                className="h-9 w-9 rounded-[4px] border-destructive/60 bg-destructive/10 p-0 text-destructive hover:bg-destructive/15"
                onClick={onStop}
                aria-label="Stop generating"
              >
                <CircleStop className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={submit}
                disabled={disabled || !canSubmit}
                className="h-9 w-9 rounded-[4px] border border-border bg-primary p-0 text-primary-foreground hover:bg-primary/90 disabled:border-border/40 disabled:bg-secondary disabled:text-muted-foreground"
                aria-label="Send message"
              >
                <ArrowUp className="h-4.5 w-4.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};
