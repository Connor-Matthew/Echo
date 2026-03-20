import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEventHandler,
  type KeyboardEventHandler,
  type ReactNode
} from "react";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Paperclip,
  Plus,
  Server,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import type { ChatContextWindow, ModelCapabilities, Skill, UserMcpServer } from "../shared/contracts";
import { cn } from "../lib/utils";
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
  minimalControls?: boolean;
  minimalQuickToggleLabel?: string;
  minimalQuickToggleActive?: boolean;
  onMinimalQuickToggle?: () => void;
  leadingControl?: ReactNode;
};

export const getComposerChromeVisibility = ({
  minimalControls,
  isToolMenuOpen: _isToolMenuOpen
}: {
  minimalControls: boolean;
  isToolMenuOpen: boolean;
}) => ({
  showExpandedToolbar: !minimalControls,
  showMinimalToolMenuButton: minimalControls,
  showCapabilityIndicators: !minimalControls
});

export const getComposerToolMenuItemLabels = ({
  hasQuickToggle,
  hasSkills,
  hasMcpServers
}: {
  hasQuickToggle: boolean;
  hasSkills: boolean;
  hasMcpServers: boolean;
}) => [
  "Add files or photos",
  ...(hasQuickToggle ? ["SOUL mode"] : []),
  ...(hasSkills ? ["Use style"] : []),
  ...(hasMcpServers ? ["Connectors"] : []),
  "Context window"
];

export const getComposerToolMenuClassNames = () => ({
  trigger:
    "h-9 w-9 rounded-[16px] border border-border/65 bg-background/88 text-foreground/78 hover:bg-accent/45 hover:text-foreground",
  surface:
    "absolute bottom-full left-0 z-[80] mb-3 w-[320px] rounded-[20px] border border-border/70 bg-card/95 p-3 shadow-[0_24px_60px_rgba(42,37,30,0.12)] backdrop-blur-xl",
  section: "flex flex-col gap-0",
  item:
    "flex h-[46px] w-full items-center gap-2.5 rounded-[14px] px-3.5 text-left text-[14px] font-medium tracking-[-0.01em] text-foreground transition-colors hover:bg-accent/30",
  divider: "my-1.5 h-px bg-border/55",
  nestedPanel: "mt-1 mb-1 ml-3 mr-1 rounded-[14px] border border-border/50 bg-background/92 p-1.5",
  nestedItem:
    "flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-[12px] font-medium text-foreground/92 transition-colors hover:bg-accent/35",
  contextChip:
    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
  trailingIcon:
    "ml-auto h-[14px] w-[14px] text-muted-foreground/88 transition-transform duration-200",
  leadingIcon: "h-4 w-4 text-foreground/84",
  checkIcon: "ml-auto h-4 w-4 text-primary/90"
});

export const getComposerFooterClassName = ({
  minimalControls
}: {
  minimalControls: boolean;
}) =>
  minimalControls
    ? "mt-2.5 flex items-center justify-between gap-2.5"
    : "mt-3 flex items-center justify-between gap-3 border-t border-border/55 pt-3";

export const getComposerContainerClassName = ({
  minimalControls
}: {
  minimalControls: boolean;
}) =>
  cn(
    "flex w-full flex-col border transition-[border-color,box-shadow,background-color] duration-200",
    minimalControls
      ? "rounded-[30px] border-border/65 bg-card/95 px-6 py-4 shadow-[0_18px_48px_rgba(42,37,30,0.1)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/82 sm:px-7"
      : "rounded-[26px] border-border/70 bg-card px-5 py-4 shadow-[0_14px_34px_rgba(42,37,30,0.08)] sm:px-7 sm:py-5"
  );

export const getComposerTextareaClassName = ({
  minimalControls
}: {
  minimalControls: boolean;
}) =>
  cn(
    "resize-none border-0 bg-transparent px-0 py-0 text-[16px] text-foreground shadow-none placeholder:text-muted-foreground/68 focus-visible:ring-0",
    minimalControls
      ? "h-[42px] min-h-[42px] leading-[1.72]"
      : "h-[44px] min-h-[44px] leading-[1.85]"
  );

export const getComposerMinimalControlClassNames = () => ({
  trigger:
    "inline-flex h-auto w-auto items-center justify-center border-0 bg-transparent p-0 text-foreground/72 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-45",
  modelWrap: "relative shrink-0 pr-4",
  modelSelect:
    "h-auto w-auto max-w-[220px] appearance-none border-0 bg-transparent px-0 pr-4 text-[14px] font-medium text-foreground/82 focus-visible:outline-none focus-visible:ring-0 disabled:opacity-70",
  modelChevron:
    "pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/88",
  actionButton:
    "inline-flex h-10 w-10 items-center justify-center rounded-full border-0 bg-primary text-primary-foreground shadow-[0_12px_24px_hsl(var(--primary)/0.28)] transition-all hover:translate-y-[-1px] hover:bg-primary/92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:bg-secondary disabled:text-muted-foreground/70 disabled:shadow-none",
  stopButton:
    "inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/55 bg-card/88 text-destructive shadow-[0_10px_24px_rgba(42,37,30,0.08)] transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45"
});

const DEFAULT_MIN_TEXTAREA_HEIGHT = 40;
const MINIMAL_MIN_TEXTAREA_HEIGHT = 38;
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
  minimalControls = false,
  minimalQuickToggleLabel,
  minimalQuickToggleActive = false,
  onMinimalQuickToggle,
  leadingControl
}: ComposerProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skillsPopoverRef = useRef<HTMLDivElement>(null);
  const minimalToolMenuRef = useRef<HTMLDivElement>(null);
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
  const [expandedMinimalPanel, setExpandedMinimalPanel] = useState<"skills" | "mcp" | "context" | null>(null);
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
  const containerClassName = getComposerContainerClassName({ minimalControls });
  const footerClassName = getComposerFooterClassName({ minimalControls });
  const textareaClassName = getComposerTextareaClassName({ minimalControls });
  const minTextareaHeight = minimalControls ? MINIMAL_MIN_TEXTAREA_HEIGHT : DEFAULT_MIN_TEXTAREA_HEIGHT;

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
    const maxHeight = Math.max(minTextareaHeight, lineHeight * MAX_TEXTAREA_ROWS + verticalPadding);

    textarea.style.height = "0px";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, minTextareaHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [minTextareaHeight, value]);

  const toggleMcp = (id: string) => {
    const next = enabledMcpServers.includes(id)
      ? enabledMcpServers.filter((x) => x !== id)
      : [...enabledMcpServers, id];
    onChangeMcpServers(next);
  };

  const activeMcpServers = mcpServers.filter((s) => s.enabled && enabledMcpServers.includes(s.id));
  const activeMcpCount = activeMcpServers.length;
  const availableMcpServers = mcpServers.filter((server) => server.enabled);
  const chromeVisibility = getComposerChromeVisibility({
    minimalControls,
    isToolMenuOpen
  });
  const toolMenuLabels = getComposerToolMenuItemLabels({
    hasQuickToggle: Boolean(minimalQuickToggleLabel && onMinimalQuickToggle),
    hasSkills: skills.length > 0,
    hasMcpServers: availableMcpServers.length > 0
  });
  const toolMenuClassNames = getComposerToolMenuClassNames();
  const minimalControlClassNames = getComposerMinimalControlClassNames();

  useEffect(() => {
    if (!minimalControls) {
      setIsToolMenuOpen(false);
      setExpandedMinimalPanel(null);
      return;
    }
    if (!isToolMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!minimalToolMenuRef.current?.contains(event.target as Node)) {
        setIsToolMenuOpen(false);
        setExpandedMinimalPanel(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsToolMenuOpen(false);
        setExpandedMinimalPanel(null);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isToolMenuOpen, minimalControls]);

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

  const toggleMinimalPanel = (panel: "skills" | "mcp" | "context") => {
    setExpandedMinimalPanel((current) => (current === panel ? null : panel));
  };

  const closeMinimalToolMenu = () => {
    setIsToolMenuOpen(false);
    setExpandedMinimalPanel(null);
  };

  return (
    <footer className="w-full">
      <div className={containerClassName}>
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
          className={textareaClassName}
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

        {chromeVisibility.showExpandedToolbar ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-[34px] w-[34px] rounded-[14px] border border-border/60 bg-background text-muted-foreground hover:bg-accent/45 hover:text-foreground"
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
          </div>
        ) : null}

        <div className={footerClassName}>
          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 overflow-visible text-muted-foreground",
              minimalControls ? "pb-0" : "pb-0.5"
            )}
          >
            {chromeVisibility.showMinimalToolMenuButton ? (
              <div className="relative" ref={minimalToolMenuRef}>
                {minimalControls ? (
                  <button
                    type="button"
                    className={minimalControlClassNames.trigger}
                    onClick={() => setIsToolMenuOpen((previous) => !previous)}
                    aria-label={toolMenuLabels.join(", ")}
                    aria-expanded={isToolMenuOpen}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={toolMenuClassNames.trigger}
                    onClick={() => setIsToolMenuOpen((previous) => !previous)}
                    aria-label={toolMenuLabels.join(", ")}
                    aria-expanded={isToolMenuOpen}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                )}

                {isToolMenuOpen ? (
                  <div className={toolMenuClassNames.surface}>
                    <div className={toolMenuClassNames.section}>
                      <button
                        type="button"
                        className={toolMenuClassNames.item}
                        onClick={() => {
                          fileInputRef.current?.click();
                          closeMinimalToolMenu();
                        }}
                      >
                        <Paperclip className={toolMenuClassNames.leadingIcon} />
                        <span>Add files or photos</span>
                      </button>

                      <div className={toolMenuClassNames.divider} />

                      {minimalQuickToggleLabel && onMinimalQuickToggle ? (
                        <button
                          type="button"
                          className={toolMenuClassNames.item}
                          onClick={() => {
                            onMinimalQuickToggle();
                            closeMinimalToolMenu();
                          }}
                        >
                          <Bot className={toolMenuClassNames.leadingIcon} />
                          <span>{minimalQuickToggleLabel}</span>
                          {minimalQuickToggleActive ? (
                            <Check className={toolMenuClassNames.checkIcon} />
                          ) : null}
                        </button>
                      ) : null}

                      {skills.length > 0 ? (
                        <>
                          <button
                            type="button"
                            className={toolMenuClassNames.item}
                            onClick={() => toggleMinimalPanel("skills")}
                          >
                            <Sparkles className={toolMenuClassNames.leadingIcon} />
                            <span>Use style</span>
                            <ChevronRight
                              className={cn(
                                toolMenuClassNames.trailingIcon,
                                expandedMinimalPanel === "skills" ? "rotate-90" : ""
                              )}
                            />
                          </button>
                          {expandedMinimalPanel === "skills" ? (
                            <div className={toolMenuClassNames.nestedPanel}>
                              <div className="space-y-1">
                                {skills.map((skill) => {
                                  const isActive = activeSkill?.id === skill.id;
                                  return (
                                    <button
                                      key={skill.id}
                                      type="button"
                                      className={toolMenuClassNames.nestedItem}
                                      onClick={() => {
                                        onChangeActiveSkill(isActive ? null : skill);
                                        closeMinimalToolMenu();
                                      }}
                                    >
                                      <span className="text-sm">{skill.icon}</span>
                                      <span className="min-w-0 flex-1 truncate">{skill.name}</span>
                                      {isActive ? <Check className={toolMenuClassNames.checkIcon} /> : null}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : null}

                      {availableMcpServers.length > 0 ? (
                        <>
                          <button
                            type="button"
                            className={toolMenuClassNames.item}
                            onClick={() => toggleMinimalPanel("mcp")}
                          >
                            <Server className={toolMenuClassNames.leadingIcon} />
                            <span>Connectors</span>
                            <ChevronRight
                              className={cn(
                                toolMenuClassNames.trailingIcon,
                                expandedMinimalPanel === "mcp" ? "rotate-90" : ""
                              )}
                            />
                          </button>
                          {expandedMinimalPanel === "mcp" ? (
                            <div className={toolMenuClassNames.nestedPanel}>
                              <div className="space-y-1">
                                {availableMcpServers.map((server) => {
                                  const isOn = enabledMcpServers.includes(server.id);
                                  return (
                                    <button
                                      key={server.id}
                                      type="button"
                                      className={toolMenuClassNames.nestedItem}
                                      onClick={() => toggleMcp(server.id)}
                                    >
                                      <span className="min-w-0 flex-1 truncate">{server.name}</span>
                                      {isOn ? <Check className={toolMenuClassNames.checkIcon} /> : null}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : null}

                      <>
                        <button
                          type="button"
                          className={toolMenuClassNames.item}
                          onClick={() => toggleMinimalPanel("context")}
                        >
                          <SlidersHorizontal className={toolMenuClassNames.leadingIcon} />
                          <span>Context window</span>
                          <ChevronRight
                            className={cn(
                              toolMenuClassNames.trailingIcon,
                              expandedMinimalPanel === "context" ? "rotate-90" : ""
                            )}
                          />
                        </button>
                        {expandedMinimalPanel === "context" ? (
                          <div className={cn(toolMenuClassNames.nestedPanel, "flex flex-wrap gap-2")}>
                            {CONTEXT_WINDOW_OPTIONS.map((option) => {
                              const isSelected = option.value === chatContextWindow;
                              return (
                                <button
                                  key={String(option.value)}
                                  type="button"
                                  className={cn(
                                    toolMenuClassNames.contextChip,
                                    isSelected
                                      ? "border-primary/45 bg-primary/12 text-primary"
                                      : "border-border/55 bg-background/75 text-muted-foreground hover:bg-background"
                                  )}
                                  onClick={() => {
                                    onChangeChatContextWindow(option.value);
                                    closeMinimalToolMenu();
                                  }}
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {chromeVisibility.showCapabilityIndicators ? (
              <CapabilityIndicators modelCapabilities={modelCapabilities} usageLabel={usageLabel} />
            ) : null}
          </div>
          <div className={cn("flex shrink-0 items-center", minimalControls ? "ml-1.5 gap-1.5" : "ml-2 gap-2")}>
            <div
              className={cn(
                "relative shrink-0",
                minimalControls ? minimalControlClassNames.modelWrap : "w-[156px] sm:w-[184px]"
              )}
            >
              <select
                value={hasSelectedModel ? modelValue : ""}
                onChange={(event) => onSelectModel(event.target.value)}
                disabled={!normalizedModelOptions.length}
                aria-label="选择模型"
                className={
                  minimalControls
                    ? minimalControlClassNames.modelSelect
                    : "h-10 w-full appearance-none overflow-hidden text-ellipsis whitespace-nowrap rounded-[14px] border border-border/70 bg-background px-4 pr-9 text-[12px] font-medium text-foreground/78 hover:bg-accent/28 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
                }
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
              <ChevronDown
                className={
                  minimalControls
                    ? minimalControlClassNames.modelChevron
                    : "pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                }
              />
            </div>
            {isGenerating ? (
              minimalControls ? (
                <button
                  type="button"
                  className={minimalControlClassNames.stopButton}
                  onClick={onStop}
                  aria-label="停止生成"
                >
                  <CircleStop className="h-5 w-5" />
                </button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-10 rounded-[14px] border-destructive/35 bg-transparent p-0 text-destructive hover:bg-destructive/8"
                  onClick={onStop}
                  aria-label="停止生成"
                >
                  <CircleStop className="h-4 w-4" />
                </Button>
              )
            ) : (
              minimalControls ? (
                <button
                  type="button"
                  onClick={submit}
                  disabled={disabled || !canSubmit}
                  className={minimalControlClassNames.actionButton}
                  aria-label="发送消息"
                >
                  <ArrowUp className="h-5 w-5" />
                </button>
              ) : (
                <Button
                  type="button"
                  onClick={submit}
                  disabled={disabled || !canSubmit}
                  className="h-10 w-10 rounded-[14px] p-0 disabled:border-border/40 disabled:bg-secondary disabled:text-muted-foreground"
                  aria-label="发送消息"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              )
            )}
          </div>
        </div>

      </div>
    </footer>
  );
};
