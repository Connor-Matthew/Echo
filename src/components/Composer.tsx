import {
  useEffect,
  useMemo,
  useRef,
  type ClipboardEventHandler,
  type KeyboardEventHandler,
  type ReactNode
} from "react";
import {
  ArrowUp,
  ChevronDown,
  CircleStop,
  Plus,
} from "lucide-react";
import type { ChatContextWindow, ModelCapabilities, Skill, UserMcpServer } from "../shared/contracts";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import {
  shouldConvertPastedTextToFile,
  toPastedTextFile
} from "./composer/paste-utils";
import { ActiveContextBadges } from "./composer/active-context-badges";
import { CapabilityIndicators } from "./composer/capability-indicators";
import { ContextWindowPopover } from "./composer/context-window-popover";
import { McpPickerPopover } from "./composer/mcp-picker-popover";
import { SkillParamForm } from "./composer/skill-param-form";
import { SkillsPickerPopover } from "./composer/skills-picker-popover";
import { SkillsSlashPopover } from "./composer/skills-slash-popover";
import { useComposerPanels } from "./composer/use-composer-panels";
import { useComposerSkills } from "./composer/use-composer-skills";

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
  leadingControl?: ReactNode;
};

const MIN_TEXTAREA_HEIGHT = 40;
const MAX_TEXTAREA_ROWS = 4;
const CONTEXT_WINDOW_OPTIONS: Array<{ value: ChatContextWindow; label: string }> = [
  { value: 5, label: "5" },
  { value: 20, label: "20" },
  { value: 50, label: "50" },
  { value: "infinite", label: "无限" }
];
const findContextWindowIndex = (value: ChatContextWindow) => {
  const index = CONTEXT_WINDOW_OPTIONS.findIndex((option) => option.value === value);
  return index >= 0 ? index : 0;
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
  isGenerating,
  leadingControl
}: ComposerProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skillsPopoverRef = useRef<HTMLDivElement>(null);
  const {
    quickSettingsRef,
    mcpPopoverRef,
    skillsPickerRef,
    isQuickSettingsOpen,
    setIsQuickSettingsOpen,
    isMcpPopoverOpen,
    setIsMcpPopoverOpen,
    isSkillsPickerOpen,
    setIsSkillsPickerOpen
  } = useComposerPanels();
  const {
    skillsSelectedIndex,
    setSkillsSelectedIndex,
    skillParamState,
    setSkillParamState,
    filteredSkills,
    isSkillsOpen,
    updateSkillsQueryFromInput,
    selectSkill,
    confirmSkillParams,
    handleSkillsNavigationKeyDown
  } = useComposerSkills({ value, skills, onChange, onApplySkill });

  const canSubmit = useMemo(
    () => Boolean(value.trim() || attachmentCount),
    [value, attachmentCount]
  );
  const enableSkills = skills.length > 0;
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

  const toggleMcp = (id: string) => {
    const next = enabledMcpServers.includes(id)
      ? enabledMcpServers.filter((x) => x !== id)
      : [...enabledMcpServers, id];
    onChangeMcpServers(next);
  };

  const activeMcpServers = mcpServers.filter((s) => s.enabled && enabledMcpServers.includes(s.id));
  const activeMcpCount = activeMcpServers.length;

  const submit = () => {
    if (!canSubmit || disabled) {
      return;
    }
    if (enableSkills && activeSkill) {
      onApplySkill(activeSkill, {}, value.trim());
    } else {
      onSubmit(value.trim());
    }
  };

  const onKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }

    if (enableSkills && handleSkillsNavigationKeyDown(event)) {
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
            if (enableSkills) {
              updateSkillsQueryFromInput(next);
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

        {enableSkills ? (
          <SkillsSlashPopover
            isOpen={isSkillsOpen}
            popoverRef={skillsPopoverRef}
            filteredSkills={filteredSkills}
            selectedIndex={skillsSelectedIndex}
            onHoverIndex={setSkillsSelectedIndex}
            onSelectSkill={selectSkill}
          />
        ) : null}

        {enableSkills && skillParamState ? (
          <SkillParamForm
            skillParamState={skillParamState}
            setSkillParamState={setSkillParamState}
            onConfirm={confirmSkillParams}
          />
        ) : null}

        <ActiveContextBadges
          activeSkill={activeSkill}
          activeMcpServers={activeMcpServers}
          onChangeActiveSkill={onChangeActiveSkill}
          onToggleMcp={toggleMcp}
        />

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
            <ContextWindowPopover
              quickSettingsRef={quickSettingsRef}
              isOpen={isQuickSettingsOpen}
              setIsOpen={setIsQuickSettingsOpen}
              options={CONTEXT_WINDOW_OPTIONS}
              selectedIndex={contextWindowIndex}
              onChangeChatContextWindow={onChangeChatContextWindow}
            />
            <McpPickerPopover
              mcpServers={mcpServers}
              enabledMcpServers={enabledMcpServers}
              activeMcpCount={activeMcpCount}
              isOpen={isMcpPopoverOpen}
              setIsOpen={setIsMcpPopoverOpen}
              popoverRef={mcpPopoverRef}
              onToggleMcp={toggleMcp}
            />
            {leadingControl ? leadingControl : null}
            <SkillsPickerPopover
              skills={skills}
              activeSkill={activeSkill}
              isOpen={isSkillsPickerOpen}
              setIsOpen={setIsSkillsPickerOpen}
              pickerRef={skillsPickerRef}
              onChangeActiveSkill={onChangeActiveSkill}
            />
            <CapabilityIndicators modelCapabilities={modelCapabilities} usageLabel={usageLabel} />
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
