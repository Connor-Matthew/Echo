import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEventHandler,
  type KeyboardEventHandler
} from "react";
import {
  Mic,
  ArrowUp,
  Brain,
  ChevronDown,
  CircleStop,
  ImageIcon,
  Plus,
  Server,
  SlidersHorizontal,
  Sparkles,
  Video
} from "lucide-react";
import type { ChatContextWindow, ModelCapabilities, Skill, UserMcpServer } from "../shared/contracts";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { filterSkills } from "../lib/skills-utils";

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
  mcpServers: UserMcpServer[];
  enabledMcpServers: string[];
  skills: Skill[];
  activeSkill: Skill | null;
  onChangeActiveSkill: (skill: Skill | null) => void;
  onAddFiles: (files: FileList | File[] | null) => void;
  onChangeChatContextWindow: (value: ChatContextWindow) => void;
  onSelectModel: (modelId: string) => void;
  onChangeMcpServers: (enabledIds: string[]) => void;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onApplySkill: (skill: Skill, params: Record<string, string>, input: string) => void;
  onStop: () => void;
  usageLabel?: string | null;
  disabled: boolean;
  disabledPlaceholder?: string;
  isGenerating: boolean;
};

const MIN_TEXTAREA_HEIGHT = 40;
const MAX_TEXTAREA_ROWS = 4;
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
  mcpServers,
  enabledMcpServers,
  skills,
  activeSkill,
  onChangeActiveSkill,
  onAddFiles,
  onChangeChatContextWindow,
  onSelectModel,
  onChangeMcpServers,
  onChange,
  onSubmit,
  onApplySkill,
  onStop,
  usageLabel,
  disabled,
  disabledPlaceholder,
  isGenerating
}: ComposerProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const quickSettingsRef = useRef<HTMLDivElement>(null);
  const mcpPopoverRef = useRef<HTMLDivElement>(null);
  const skillsPopoverRef = useRef<HTMLDivElement>(null);
  const skillsPickerRef = useRef<HTMLDivElement>(null);
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState(false);
  const [isMcpPopoverOpen, setIsMcpPopoverOpen] = useState(false);
  const [isSkillsPickerOpen, setIsSkillsPickerOpen] = useState(false);
  const [skillsQuery, setSkillsQuery] = useState<string | null>(null);
  const [skillParamState, setSkillParamState] = useState<{ skill: Skill; params: Record<string, string> } | null>(null);
  const [skillsSelectedIndex, setSkillsSelectedIndex] = useState(0);

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
    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 24;
    const verticalPadding =
      (Number.parseFloat(computed.paddingTop) || 0) +
      (Number.parseFloat(computed.paddingBottom) || 0) +
      (Number.parseFloat(computed.borderTopWidth) || 0) +
      (Number.parseFloat(computed.borderBottomWidth) || 0);
    const maxHeight = Math.max(MIN_TEXTAREA_HEIGHT, lineHeight * MAX_TEXTAREA_ROWS + verticalPadding);

    textarea.style.height = "0px";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, MIN_TEXTAREA_HEIGHT), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
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

  useEffect(() => {
    if (!isMcpPopoverOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!mcpPopoverRef.current?.contains(event.target as Node)) {
        setIsMcpPopoverOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMcpPopoverOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMcpPopoverOpen]);

  useEffect(() => {
    if (!isSkillsPickerOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!skillsPickerRef.current?.contains(event.target as Node)) {
        setIsSkillsPickerOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSkillsPickerOpen(false);
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSkillsPickerOpen]);

  const toggleMcp = (id: string) => {
    const next = enabledMcpServers.includes(id)
      ? enabledMcpServers.filter((x) => x !== id)
      : [...enabledMcpServers, id];
    onChangeMcpServers(next);
  };

  const activeMcpServers = mcpServers.filter((s) => s.enabled && enabledMcpServers.includes(s.id));
  const activeMcpCount = activeMcpServers.length;

  const filteredSkills = useMemo(
    () => (skillsQuery !== null ? filterSkills(skillsQuery, skills) : []),
    [skillsQuery, skills]
  );

  const isSkillsOpen = skillsQuery !== null && filteredSkills.length > 0 && !skillParamState;

  const selectSkill = (skill: Skill) => {
    if (skill.params.length === 0) {
      const input = value.replace(/^\/\S*\s*/, "").trim();
      onChange("");
      onApplySkill(skill, {}, input);
      setSkillsQuery(null);
    } else {
      const defaults: Record<string, string> = {};
      skill.params.forEach((p) => { defaults[p.key] = p.defaultValue; });
      setSkillParamState({ skill, params: defaults });
      setSkillsQuery(null);
    }
  };

  const confirmSkillParams = () => {
    if (!skillParamState) return;
    const input = value.replace(/^\/\S*\s*/, "").trim();
    onChange("");
    onApplySkill(skillParamState.skill, skillParamState.params, input);
    setSkillParamState(null);
  };

  const submit = () => {
    if (!canSubmit || disabled) {
      return;
    }
    if (activeSkill) {
      onApplySkill(activeSkill, {}, value.trim());
    } else {
      onSubmit(value.trim());
    }
  };

  const onKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }

    // Skills popover navigation
    if (isSkillsOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSkillsSelectedIndex((i) => Math.min(i + 1, filteredSkills.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSkillsSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const skill = filteredSkills[skillsSelectedIndex];
        if (skill) selectSkill(skill);
        return;
      }
      if (event.key === "Escape") {
        setSkillsQuery(null);
        return;
      }
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
      <div className="flex w-full flex-col rounded-[28px] border border-border/80 bg-card px-4 py-3 shadow-[0_6px_22px_rgba(15,23,42,0.06)] transition-[border-color,box-shadow] duration-200 focus-within:border-ring/70 focus-within:shadow-[0_0_0_1px_hsl(var(--ring)/0.16)] sm:px-5">
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
          onChange={(event) => {
            const next = event.target.value;
            onChange(next);
            // Detect slash command
            const slashMatch = next.match(/^\/(\S*)$/);
            if (slashMatch) {
              setSkillsQuery(slashMatch[1]);
              setSkillsSelectedIndex(0);
            } else {
              setSkillsQuery(null);
            }
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={1}
          className="h-[40px] min-h-[40px] resize-none border-0 bg-transparent px-0 py-0 text-[15px] leading-[1.65] text-foreground shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0"
          placeholder={
            disabled
              ? (disabledPlaceholder ?? "请先完成模型配置")
              : "给 Echo 发送消息"
          }
        />

        {/* Skills slash command popover */}
        {isSkillsOpen && (
          <div
            ref={skillsPopoverRef}
            className="mb-2 overflow-hidden rounded-md border border-border bg-card shadow-[0_8px_16px_rgba(15,23,42,0.12)]"
          >
            {filteredSkills.map((skill, i) => (
              <button
                key={skill.id}
                type="button"
                className={[
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                  i === skillsSelectedIndex ? "bg-accent" : "hover:bg-accent/60"
                ].join(" ")}
                onMouseEnter={() => setSkillsSelectedIndex(i)}
                onClick={() => selectSkill(skill)}
              >
                <span className="text-sm">{skill.icon}</span>
                <span className="font-medium text-foreground/80">{skill.name}</span>
                <span className="text-muted-foreground">/{skill.command}</span>
                {skill.description && (
                  <span className="ml-auto text-[11px] text-muted-foreground/70">{skill.description}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Skill param form */}
        {skillParamState && (
          <div className="mb-2 rounded-md border border-border/70 bg-accent/35 px-3 py-2.5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm">{skillParamState.skill.icon}</span>
              <span className="text-xs font-medium">{skillParamState.skill.name}</span>
            </div>
            <div className="space-y-1.5">
              {skillParamState.skill.params.map((param) => (
                <div key={param.key} className="flex items-center gap-2">
                  <label className="w-20 shrink-0 text-[11px] text-muted-foreground">{param.label}</label>
                  <input
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
                    value={skillParamState.params[param.key] ?? param.defaultValue}
                    onChange={(e) =>
                      setSkillParamState((prev) =>
                        prev ? { ...prev, params: { ...prev.params, [param.key]: e.target.value } } : prev
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); confirmSkillParams(); }
                      if (e.key === "Escape") setSkillParamState(null);
                    }}
                    autoFocus={skillParamState.skill.params[0]?.key === param.key || undefined}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSkillParamState(null)}>
                取消
              </Button>
              <Button size="sm" className="h-6 px-2 text-xs" onClick={confirmSkillParams}>
                确认
              </Button>
            </div>
          </div>
        )}

        {activeMcpServers.length > 0 || activeSkill ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {activeSkill ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 py-0.5 pl-2 pr-1 text-[12px] font-medium text-primary">
                <span>{activeSkill.icon}</span>
                {activeSkill.name}
                <button
                  type="button"
                  onClick={() => onChangeActiveSkill(null)}
                  className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm hover:bg-primary/20"
                  aria-label="移除 Skill"
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                    <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </span>
            ) : null}
            {activeMcpServers.map((server) => (
              <span
                key={server.id}
                className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 py-0.5 pl-2 pr-1 text-[12px] font-medium text-primary"
              >
                <span className="h-1.5 w-1.5 rounded-sm bg-primary" />
                {server.name}
                <button
                  type="button"
                  onClick={() => toggleMcp(server.id)}
                  className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm hover:bg-primary/20"
                  aria-label={`移除 ${server.name}`}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
                    <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-2 pt-1">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-visible pb-0.5 text-muted-foreground">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-[32px] w-[32px] rounded-full bg-accent/55 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              aria-label="添加附件"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <div className="relative" ref={quickSettingsRef}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-[32px] w-[32px] rounded-full bg-accent/55 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                onClick={() => setIsQuickSettingsOpen((previous) => !previous)}
                aria-label="上下文窗口设置"
                title="上下文档位"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
              {isQuickSettingsOpen ? (
                <div className="absolute bottom-full left-0 z-[60] mb-2 w-[236px] rounded-md border border-border bg-card p-2.5 shadow-[0_10px_20px_rgba(15,23,42,0.12)]">
                  <p className="mb-1 px-1 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    上下文窗口
                  </p>
                  <input
                    type="range"
                    min={0}
                    max={CONTEXT_WINDOW_OPTIONS.length - 1}
                    step={1}
                    value={contextWindowIndex}
                    className="h-5 w-full accent-primary"
                    aria-label="上下文窗口滑块"
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
            {mcpServers.filter((s) => s.enabled).length > 0 ? (
              <div className="relative" ref={mcpPopoverRef}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={[
                    "relative h-[32px] w-[32px] rounded-full bg-accent/55 hover:bg-accent/80",
                    activeMcpCount > 0 ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  ].join(" ")}
                  onClick={() => setIsMcpPopoverOpen((p) => !p)}
                  aria-label="选择 MCP 工具"
                  title="MCP 工具"
                >
                  <Server className="h-4 w-4" />
                  {activeMcpCount > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-primary text-[9px] font-bold text-primary-foreground">
                      {activeMcpCount}
                    </span>
                  ) : null}
                </Button>
                {isMcpPopoverOpen ? (
                  <div className="absolute bottom-full left-0 z-[60] mb-2 w-[220px] rounded-md border border-border bg-card p-2 shadow-[0_10px_20px_rgba(15,23,42,0.12)]">
                    <p className="mb-1.5 px-1 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                      MCP 工具
                    </p>
                    <div className="space-y-0.5">
                      {mcpServers.filter((s) => s.enabled).map((server) => {
                        const isOn = enabledMcpServers.includes(server.id);
                        return (
                          <button
                            key={server.id}
                            type="button"
                            onClick={() => toggleMcp(server.id)}
                            className={[
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                              isOn ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                            ].join(" ")}
                          >
                            <span className={["flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border", isOn ? "border-primary bg-primary text-primary-foreground" : "border-border"].join(" ")}>
                              {isOn ? <span className="text-[10px] font-bold">✓</span> : null}
                            </span>
                            <span className="truncate">{server.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {skills.length > 0 ? (
              <div className="relative" ref={skillsPickerRef}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={[
                    "relative h-[32px] w-[32px] rounded-full bg-accent/55 hover:bg-accent/80",
                    activeSkill ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  ].join(" ")}
                  onClick={() => setIsSkillsPickerOpen((p) => !p)}
                  aria-label="选择技能"
                  title="技能"
                >
                  <Sparkles className="h-4 w-4" />
                  {activeSkill ? (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-sm bg-primary" />
                  ) : null}
                </Button>
                {isSkillsPickerOpen ? (
                  <div className="absolute bottom-full left-0 z-[60] mb-2 w-[220px] rounded-md border border-border bg-card p-2 shadow-[0_10px_20px_rgba(15,23,42,0.12)]">
                    <p className="mb-1.5 px-1 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                      技能
                    </p>
                    <div className="space-y-0.5">
                      {skills.map((skill) => {
                        const isOn = activeSkill?.id === skill.id;
                        return (
                          <button
                            key={skill.id}
                            type="button"
                            onClick={() => {
                              onChangeActiveSkill(isOn ? null : skill);
                              setIsSkillsPickerOpen(false);
                            }}
                            className={[
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                              isOn ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                            ].join(" ")}
                          >
                            <span className={["flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border", isOn ? "border-primary bg-primary text-primary-foreground" : "border-border"].join(" ")}>
                              {isOn ? <span className="text-[10px] font-bold">✓</span> : null}
                            </span>
                            <span className="text-sm">{skill.icon}</span>
                            <span className="truncate text-xs">{skill.name}</span>
                            <span className="ml-auto text-[10px] text-muted-foreground/60">/{skill.command}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex shrink-0 items-center gap-0.5">
              {[
                {
                  key: "reasoningDisplay",
                  label: "深度思考",
                  Icon: Brain,
                  enabled: modelCapabilities.reasoningDisplay
                },
                {
                  key: "imageInput",
                  label: "图片输入",
                  Icon: ImageIcon,
                  enabled: modelCapabilities.imageInput
                },
                {
                  key: "audioInput",
                  label: "音频输入",
                  Icon: Mic,
                  enabled: modelCapabilities.audioInput
                },
                {
                  key: "videoInput",
                  label: "视频输入",
                  Icon: Video,
                  enabled: modelCapabilities.videoInput
                }
              ]
                .filter(({ key, enabled }) =>
                  key === "audioInput" || key === "videoInput" ? enabled : true
                )
                .map(({ key, label, Icon, enabled }) => (
                  <span
                    key={key}
                    title={`${label}${enabled ? "" : "（当前模型不支持）"}`}
                    aria-label={label}
                    className={[
                      "inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center",
                      enabled
                        ? "rounded-full bg-accent/65 text-foreground"
                        : "text-muted-foreground/65"
                    ].join(" ")}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                ))}
            </div>
            {usageLabel ? (
              <p className="ml-1 max-w-[220px] shrink-0 text-xs font-medium tabular-nums leading-none text-muted-foreground">
                {usageLabel}
              </p>
            ) : null}
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-2">
            <div className="relative w-[148px] shrink-0 sm:w-[172px]">
              <select
                value={hasSelectedModel ? modelValue : ""}
                onChange={(event) => onSelectModel(event.target.value)}
                disabled={!normalizedModelOptions.length}
                aria-label="选择模型"
                className="h-[32px] w-full appearance-none overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-border/75 bg-accent/45 px-3 pr-8 text-xs font-medium text-foreground/80 hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
              >
                {!hasSelectedModel ? (
                  <option value="">{modelLabel || "模型"}</option>
                ) : null}
                {normalizedModelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            {isGenerating ? (
              <Button
                type="button"
                variant="outline"
                className="h-9 w-9 rounded-full border-destructive/60 bg-destructive/10 p-0 text-destructive hover:bg-destructive/15"
                onClick={onStop}
                aria-label="停止生成"
              >
                <CircleStop className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={submit}
                disabled={disabled || !canSubmit}
                className="h-9 w-9 rounded-full p-0 shadow-sm disabled:border-border/40 disabled:bg-secondary disabled:text-muted-foreground"
                aria-label="发送消息"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

      </div>
    </footer>
  );
};
