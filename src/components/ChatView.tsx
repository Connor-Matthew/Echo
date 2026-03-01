import {
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  FileText,
  ImageIcon,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
  AlertCircle,
  Loader2,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Button } from "./ui/button";
import type { ChatAttachment, ChatMessage } from "../shared/contracts";

type EditAttachment = ChatAttachment & {
  previewUrl?: string;
  error?: string;
};

const cloneMessageAttachments = (attachments?: ChatAttachment[]): EditAttachment[] =>
  (attachments ?? []).map((attachment) => ({ ...attachment }));

type PermissionRequest = {
  runId: string;
  sessionId: string;
  requestId: string;
  toolName?: string;
  reason?: string;
  blockedPath?: string;
  supportsAlwaysAllow?: boolean;
  resolving?: boolean;
};

type ChatViewProps = {
  sessionId: string;
  messages: ChatMessage[];
  isConfigured: boolean;
  isGenerating: boolean;
  mode?: "chat" | "agent";
  permissionRequest?: PermissionRequest | null;
  onResolvePermission?: (
    request: PermissionRequest,
    decision: "approved" | "denied",
    applySuggestions: boolean
  ) => void;
  onEditMessage: (
    message: ChatMessage,
    nextContent: string,
    nextAttachments: ChatAttachment[]
  ) => void;
  onDeleteMessage: (message: ChatMessage) => void;
  onResendMessage: (message: ChatMessage) => void;
};

type MessageBubbleProps = {
  message: ChatMessage;
  isGenerating: boolean;
  activeGeneratingAssistantId?: string | null;
  mode: "chat" | "agent";
  permissionRequest?: PermissionRequest | null;
  onResolvePermission?: (
    request: PermissionRequest,
    decision: "approved" | "denied",
    applySuggestions: boolean
  ) => void;
  onEditMessage: (
    message: ChatMessage,
    nextContent: string,
    nextAttachments: ChatAttachment[]
  ) => void;
  onDeleteMessage: (message: ChatMessage) => void;
  onResendMessage: (message: ChatMessage) => void;
};

const TEXT_ATTACHMENT_LIMIT = 60000;
const IMAGE_ATTACHMENT_LIMIT = 5 * 1024 * 1024;
const AUTO_SCROLL_THRESHOLD = 24;
const STREAM_REVEAL_MAX_STEP = 24;
const STREAM_REVEAL_FAST_CPS = 420;
const STREAM_REVEAL_MEDIUM_CPS = 300;
const STREAM_REVEAL_SLOW_CPS = 170;
const STREAM_REVEAL_COMMIT_INTERVAL_MS = 40;
const STREAM_AUTO_FOLLOW_INTERVAL_MS = 260;
const STREAM_RESIZE_FOLLOW_INTERVAL_MS = 240;
const STREAM_RESIZE_FOLLOW_MIN_DELTA_PX = 16;
const STREAM_FOLLOW_TAIL_MIN_PX = 24;
const STREAM_FOLLOW_TAIL_MAX_PX = 96;
const STREAM_FOLLOW_TAIL_RATIO = 0.42;
const STREAM_FOLLOW_TARGET_STEP_PX = 10;
const STREAM_FOLLOW_MAGNETIC_SNAP_RANGE = 40;
const CINEMATIC_FOLLOW_SPRING_STIFFNESS = 330;
const CINEMATIC_FOLLOW_DAMPING = 38;
const CINEMATIC_FOLLOW_MAX_DT_SECONDS = 1 / 24;
const CINEMATIC_FOLLOW_STOP_DISTANCE_PX = 0.6;
const CINEMATIC_FOLLOW_STOP_VELOCITY = 12;
const MANUAL_SCROLL_LERP_FACTOR = 0.14;
const AGENT_GROUP_DONE_COLLAPSE_DELAY_MS = 700;
const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".csv",
  ".xml",
  ".yaml",
  ".yml",
  ".log"
]);
const TEXT_ATTACHMENT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/x-yaml",
  "text/csv"
]);

const formatBytes = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const formatTokenCount = (value: number) => {
  const formatCompact = (raw: number, suffix: "k" | "m") => {
    const fixed = raw.toFixed(1);
    return `${fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed}${suffix}`;
  };
  if (value >= 1_000_000) {
    return formatCompact(value / 1_000_000, "m");
  }
  if (value >= 1_000) {
    return formatCompact(value / 1_000, "k");
  }
  return `${Math.round(value)}`;
};

const getExtension = (name: string) => {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
};

const isTextAttachment = (file: File) => {
  if (file.type.startsWith("text/") || TEXT_ATTACHMENT_MIME_TYPES.has(file.type)) {
    return true;
  }
  return TEXT_ATTACHMENT_EXTENSIONS.has(getExtension(file.name));
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("Failed to read file as data URL."));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file."));
    };
    reader.readAsDataURL(file);
  });

const toMessageAttachment = (attachment: EditAttachment): ChatAttachment => ({
  id: attachment.id,
  name: attachment.name,
  mimeType: attachment.mimeType,
  size: attachment.size,
  kind: attachment.kind,
  textContent: attachment.kind === "text" ? attachment.textContent : undefined,
  imageDataUrl: attachment.kind === "image" ? attachment.imageDataUrl : undefined
});

const revokeAttachmentPreview = (attachment: EditAttachment) => {
  if (attachment.previewUrl) {
    URL.revokeObjectURL(attachment.previewUrl);
  }
};

const readNodeText = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((item) => readNodeText(item)).join("");
  }
  if (isValidElement(node)) {
    return readNodeText((node.props as { children?: ReactNode }).children);
  }
  return "";
};

const extractCodeBlockMeta = (children: ReactNode): { code: string; language?: string } => {
  const findLanguage = (node: ReactNode): string | undefined => {
    if (!node) {
      return undefined;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const match = findLanguage(item);
        if (match) {
          return match;
        }
      }
      return undefined;
    }
    if (isValidElement(node)) {
      const props = node.props as { className?: string; children?: ReactNode };
      if (props.className?.startsWith("language-")) {
        return props.className.replace("language-", "");
      }
      return findLanguage(props.children);
    }
    return undefined;
  };

  return {
    code: readNodeText(children).replace(/\n$/, ""),
    language: findLanguage(children)
  };
};

const CodeBlock = ({ code, language }: { code: string; language?: string }) => {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const copyCode = async () => {
    if (!code.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mb-2 overflow-hidden rounded-md border border-border bg-card last:mb-0">
      <div className="flex items-center justify-between border-b border-border/80 bg-accent/55 px-2.5 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {language || "code"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-muted-foreground"
          onClick={() => {
            void copyCode();
          }}
        >
          {copied ? "已复制" : "复制代码"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3">
        <code className="font-mono text-[13px] leading-6 text-foreground">{code}</code>
      </pre>
    </div>
  );
};

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-1 text-[1.2rem] font-semibold leading-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2.5 mt-1 text-[1.1rem] font-semibold leading-tight">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mb-2 mt-1 text-[1rem] font-semibold">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1.5 mt-1 text-[0.95rem] font-semibold">{children}</h4>,
  p: ({ children }) => <p className="mb-2 leading-7 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-5 leading-7 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 leading-7 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  blockquote: ({ children }) => <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-primary underline decoration-border underline-offset-2"
    >
      {children}
    </a>
  ),
  pre: ({ children }) => {
    const { code, language } = extractCodeBlockMeta(children);
    return <CodeBlock code={code} language={language} />;
  },
  code: ({ children, className }) => {
    const isBlock = Boolean(className && className.includes("language-"));
    if (isBlock) {
      return <code className="font-mono text-[13px] leading-6 text-foreground">{children}</code>;
    }
    return (
      <code className="rounded-[3px] bg-accent/70 px-1 py-[1px] font-mono text-[13px] text-foreground">
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-accent/55">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  th: ({ children }) => (
    <th className="border border-border px-2 py-1.5 font-semibold text-foreground">{children}</th>
  ),
  td: ({ children }) => <td className="border border-border px-2 py-1.5">{children}</td>,
  hr: () => <hr className="my-3 border-border" />
};

const MarkdownContent = ({ content, isUser }: { content: string; isUser: boolean }) => (
  <div
    className={[
      "text-[15px] leading-[1.65] break-words",
      isUser ? "text-foreground" : "text-foreground"
    ].join(" ")}
  >
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  </div>
);

type ToolCallItem = {
  id: string;
  serverName: string;
  toolName: string;
  status: "pending" | "success" | "error";
  message: string;
  contentOffset?: number;
};


type AgentToolRenderItem =
  | { kind: "single"; toolCall: ToolCallItem }
  | { kind: "todo_group"; parent: ToolCallItem; steps: ToolCallItem[] };

const isProgressToolCall = (toolCall: ToolCallItem) => toolCall.id.startsWith("progress:");

const hasPendingToolInRenderItems = (items: AgentToolRenderItem[]) =>
  items.some((item) =>
    item.kind === "single"
      ? item.toolCall.status === "pending"
      : item.parent.status === "pending" || item.steps.some((step) => step.status === "pending")
  );

const buildAgentToolRenderItems = (toolCalls: ToolCallItem[]): AgentToolRenderItem[] => {
  const result: AgentToolRenderItem[] = [];

  let index = 0;
  while (index < toolCalls.length) {
    const current = toolCalls[index];
    const isTodoParent = !isProgressToolCall(current) && current.serverName === "TodoWrite";
    if (!isTodoParent) {
      result.push({ kind: "single", toolCall: current });
      index += 1;
      continue;
    }

    const steps: ToolCallItem[] = [];
    let cursor = index + 1;
    while (cursor < toolCalls.length && isProgressToolCall(toolCalls[cursor])) {
      steps.push(toolCalls[cursor]);
      cursor += 1;
    }

    if (!steps.length) {
      result.push({ kind: "single", toolCall: current });
      index += 1;
      continue;
    }

    result.push({ kind: "todo_group", parent: current, steps });
    index = cursor;
  }

  return result;
};

const ToolStatusIcon = ({
  status,
  isActivePending,
}: {
  status: "pending" | "success" | "error";
  isActivePending: boolean;
}) => {
  if (status === "error") {
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center">
        <X className="h-2.5 w-2.5 text-destructive/75" />
      </span>
    );
  }
  if (status === "pending" || isActivePending) {
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center">
        <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground/75" />
      </span>
    );
  }
  return (
    <span className="flex h-3.5 w-3.5 items-center justify-center">
      <Check className="h-2.5 w-2.5 text-foreground/55" />
    </span>
  );
};

const AgentToolCallRow = ({
  toolCall,
  isActivePending,
  isDetailExpanded,
  onToggleDetail,
  permissionRequest,
  onResolvePermission,
  isLast,
}: {
  toolCall: ToolCallItem;
  isActivePending: boolean;
  isDetailExpanded: boolean;
  onToggleDetail: () => void;
  permissionRequest?: PermissionRequest | null;
  onResolvePermission?: (
    request: PermissionRequest,
    decision: "approved" | "denied",
    applySuggestions: boolean
  ) => void;
  isLast?: boolean;
}) => {
  const isProgress = toolCall.id.startsWith("progress:");
  const { status } = toolCall;
  const detailText = toolCall.message.trim();
  const canShowDetail = Boolean(detailText);
  const hasError = status === "error";
  const isPending = status === "pending";
  const displayName = toolCall.toolName.trim() || toolCall.serverName.trim() || "Tool";
  const serverLabel = toolCall.serverName.trim();

  const isThisPermission =
    permissionRequest && toolCall.id === `permission:${permissionRequest.requestId}`;

  const rowOpacity =
    status === "success" && !isProgress ? "opacity-60" : "opacity-100";

  return (
    <div className={`relative flex gap-3 transition-opacity duration-300 ${rowOpacity}`} data-agent-tool-call-id={toolCall.id}>
      {/* timeline spine */}
      <div className="flex flex-col items-center">
        <ToolStatusIcon status={status} isActivePending={isActivePending} />
        {!isLast && (
          <div className="mt-1 w-px flex-1 bg-border/50" style={{ minHeight: "12px" }} />
        )}
      </div>

      {/* content */}
      <div className="min-w-0 flex-1 pb-3">
        <button
          type="button"
          className={[
            "group/row flex w-full items-center gap-2 px-0.5 py-0.5 text-left transition-colors",
            canShowDetail ? "cursor-pointer hover:text-foreground/90" : "cursor-default",
            hasError ? "text-destructive/90" : "",
          ].join(" ")}
          onClick={canShowDetail ? onToggleDetail : undefined}
          aria-expanded={canShowDetail ? isDetailExpanded : undefined}
          disabled={!canShowDetail}
        >
          <span className={[
            "truncate text-[13px] font-medium leading-5",
            hasError ? "text-destructive" : isPending || isActivePending ? "text-foreground/90" : "text-foreground/70",
          ].join(" ")}>
            {displayName}
          </span>
          {serverLabel ? (
            <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground/55">
              {serverLabel}
            </span>
          ) : null}
          {canShowDetail && (
            <span className="ml-auto shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100">
              {isDetailExpanded
                ? <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
                : <ChevronRight className="h-3 w-3 text-muted-foreground/60" />}
            </span>
          )}
        </button>

        {canShowDetail && isDetailExpanded ? (
          <div className="ml-2 mt-0.5 border-l border-border/35 pl-2">
            <pre className="overflow-x-auto">
              <code className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.6] text-foreground/80">
                {detailText}
              </code>
            </pre>
          </div>
        ) : null}

        {isThisPermission && permissionRequest && onResolvePermission ? (
          <div className="ml-2 mt-1.5 border-l border-amber-500/35 pl-2">
            <p className="text-[12px] font-medium text-amber-800/90 dark:text-amber-300/85">
              权限请求 · {permissionRequest.toolName ?? "tool"}
            </p>
            {permissionRequest.reason ? (
              <p className="mt-0.5 text-[12px] text-amber-800/80 dark:text-amber-300/75">
                {permissionRequest.reason}
              </p>
            ) : null}
            {permissionRequest.blockedPath ? (
              <p className="mt-0.5 font-mono text-[11.5px] text-amber-700/75 dark:text-amber-400/65">
                {permissionRequest.blockedPath}
              </p>
            ) : null}
            <div className="mt-1.5 flex items-center gap-3">
              <button
                type="button"
                className="text-[12px] font-medium text-foreground/85 underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-45"
                disabled={permissionRequest.resolving}
                onClick={() => onResolvePermission(permissionRequest, "approved", false)}
              >
                允许
              </button>
              <button
                type="button"
                className="text-[12px] font-medium text-foreground/80 underline-offset-2 transition-colors hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-45"
                disabled={permissionRequest.resolving || !permissionRequest.supportsAlwaysAllow}
                onClick={() => onResolvePermission(permissionRequest, "approved", true)}
              >
                始终允许
              </button>
              <button
                type="button"
                className="text-[12px] font-medium text-destructive/85 underline-offset-2 transition-colors hover:text-destructive hover:underline disabled:cursor-not-allowed disabled:opacity-45"
                disabled={permissionRequest.resolving}
                onClick={() => onResolvePermission(permissionRequest, "denied", false)}
              >
                拒绝
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const AgentTodoProgressGroup = ({
  parent,
  steps,
  isParentPending,
  activePendingProgressId,
  isParentDetailExpanded,
  onToggleParentDetail,
  isLast,
}: {
  parent: ToolCallItem;
  steps: ToolCallItem[];
  isParentPending: boolean;
  activePendingProgressId?: string;
  isParentDetailExpanded: boolean;
  onToggleParentDetail: () => void;
  isLast?: boolean;
}) => {
  const allDone = steps.every((s) => s.status !== "pending");
  const doneCount = steps.filter((s) => s.status === "success").length;

  return (
    <div className="relative flex gap-3">
      {/* timeline spine */}
      <div className="flex flex-col items-center">
        <ToolStatusIcon status={parent.status} isActivePending={isParentPending} />
        {!isLast && (
          <div className="mt-1 w-px flex-1 bg-border/50" style={{ minHeight: "12px" }} />
        )}
      </div>

      {/* content */}
      <div className="min-w-0 flex-1 pb-3">
        {/* parent row */}
        <button
          type="button"
          className={[
            "group/row flex w-full items-center gap-2 px-0.5 py-0.5 text-left transition-colors",
            isParentDetailExpanded || Boolean(parent.message.trim())
              ? "cursor-pointer hover:text-foreground/90"
              : "cursor-default",
          ].join(" ")}
          onClick={Boolean(parent.message.trim()) ? onToggleParentDetail : undefined}
          aria-expanded={Boolean(parent.message.trim()) ? isParentDetailExpanded : undefined}
          disabled={!Boolean(parent.message.trim())}
        >
          <span className="truncate text-[13px] font-medium leading-5 text-foreground/75">
            {parent.toolName.trim() || parent.serverName.trim() || "TodoWrite"}
          </span>
          {steps.length > 0 && (
            <span className="shrink-0 text-[10px] text-muted-foreground/55">
              {allDone ? `${doneCount}/${steps.length}` : `${doneCount}/${steps.length}`}
            </span>
          )}
          {Boolean(parent.message.trim()) && (
            <span className="ml-auto shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100">
              {isParentDetailExpanded
                ? <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
                : <ChevronRight className="h-3 w-3 text-muted-foreground/60" />}
            </span>
          )}
        </button>

        {/* parent detail */}
        {isParentDetailExpanded && parent.message.trim() ? (
          <div className="ml-2 mt-0.5 border-l border-border/35 pl-2">
            <pre className="overflow-x-auto">
              <code className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.6] text-foreground/80">
                {parent.message.trim()}
              </code>
            </pre>
          </div>
        ) : null}

        {/* steps */}
        {steps.length > 0 && (
          <div className="ml-2 mt-1 space-y-0.5 border-l border-border/30 pl-2">
            {steps.map((step) => {
              const isPending = step.status === "pending";
              const isError = step.status === "error";
              const isSuccess = step.status === "success";
              const isActivePending = Boolean(activePendingProgressId && step.id === activePendingProgressId);

              return (
                <div key={step.id} className="flex items-center gap-2 py-[2px]">
                  <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {isActivePending || isPending ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground/75" />
                    ) : isError ? (
                      <AlertCircle className="h-2.5 w-2.5 text-destructive/75" />
                    ) : (
                      <Check className="h-2.5 w-2.5 text-foreground/55" />
                    )}
                  </span>
                  <span className={[
                    "text-[11.5px] leading-5",
                    isSuccess
                      ? "text-foreground/45 line-through decoration-foreground/25 decoration-[1px]"
                      : isError
                        ? "text-destructive/80"
                        : isActivePending
                          ? "text-foreground/85"
                          : "text-foreground/60",
                  ].join(" ")}>
                    {step.toolName || step.message || "未命名步骤"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const MessageBubble = ({
  message,
  isGenerating,
  activeGeneratingAssistantId,
  mode,
  permissionRequest,
  onResolvePermission,
  onEditMessage,
  onDeleteMessage,
  onResendMessage
}: MessageBubbleProps) => {
  const isUser = message.role === "user";
  const isAgentMode = mode === "agent";
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [editAttachments, setEditAttachments] = useState<EditAttachment[]>(
    cloneMessageAttachments(message.attachments)
  );
  const [isDragOverEdit, setIsDragOverEdit] = useState(false);
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(false);
  const [isMcpEventsExpanded, setIsMcpEventsExpanded] = useState(true);
  const [expandedAgentResultIds, setExpandedAgentResultIds] = useState<Record<string, boolean>>({});
  const [expandedAgentGroupIds, setExpandedAgentGroupIds] = useState<Record<string, boolean>>({});
  const [displayedContent, setDisplayedContent] = useState(message.content);
  const displayedContentRef = useRef(message.content);
  const targetContentRef = useRef(message.content);
  const editAttachmentsRef = useRef<EditAttachment[]>(editAttachments);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousGroupPendingMapRef = useRef<Record<string, boolean>>({});
  const agentGroupCollapseTimersRef = useRef<Record<string, number>>({});

  const clearAgentGroupCollapseTimer = (groupId: string) => {
    const timerId = agentGroupCollapseTimersRef.current[groupId];
    if (typeof timerId === "number") {
      window.clearTimeout(timerId);
      delete agentGroupCollapseTimersRef.current[groupId];
    }
  };

  const scheduleAgentGroupCollapse = (groupId: string) => {
    clearAgentGroupCollapseTimer(groupId);
    agentGroupCollapseTimersRef.current[groupId] = window.setTimeout(() => {
      setExpandedAgentGroupIds((current) => {
        if (!(groupId in current) || current[groupId] === false) {
          return current;
        }
        return {
          ...current,
          [groupId]: false
        };
      });
      delete agentGroupCollapseTimersRef.current[groupId];
    }, AGENT_GROUP_DONE_COLLAPSE_DELAY_MS);
  };

  useEffect(() => {
    editAttachmentsRef.current = editAttachments;
  }, [editAttachments]);

  const resetEditState = () => {
    setIsDragOverEdit(false);
    setEditDraft(message.content);
    setEditAttachments((previous) => {
      previous.forEach(revokeAttachmentPreview);
      return cloneMessageAttachments(message.attachments);
    });
  };

  useEffect(() => {
    if (!isEditing) {
      resetEditState();
    }
  }, [message.content, message.attachments, isEditing]);

  useEffect(() => {
    setExpandedAgentResultIds({});
    setExpandedAgentGroupIds({});
    previousGroupPendingMapRef.current = {};
    Object.values(agentGroupCollapseTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
    agentGroupCollapseTimersRef.current = {};
  }, [message.id]);

  useEffect(() => {
    return () => {
      editAttachmentsRef.current.forEach(revokeAttachmentPreview);
      Object.values(agentGroupCollapseTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      agentGroupCollapseTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    targetContentRef.current = message.content;

    if (message.role !== "assistant") {
      displayedContentRef.current = message.content;
      setDisplayedContent(message.content);
      return;
    }

    if (message.content.length <= displayedContentRef.current.length) {
      displayedContentRef.current = message.content;
      setDisplayedContent(message.content);
      return;
    }

    let frameId: number | null = null;
    let carry = 0;
    let virtualLength = displayedContentRef.current.length;
    let lastTimestamp = window.performance.now();
    let lastCommitAt = lastTimestamp;

    const animate = (timestamp: number) => {
      const target = targetContentRef.current;

      if (virtualLength >= target.length) {
        frameId = null;
        return;
      }

      const elapsed = Math.max(0, timestamp - lastTimestamp);
      lastTimestamp = timestamp;
      const remaining = target.length - virtualLength;
      const charsPerSecond =
        remaining > 600
          ? STREAM_REVEAL_FAST_CPS
          : remaining > 240
            ? STREAM_REVEAL_MEDIUM_CPS
            : STREAM_REVEAL_SLOW_CPS;
      carry += (elapsed / 1000) * charsPerSecond;
      let step = Math.floor(carry);
      if (step > 0) {
        carry -= step;
        step = Math.min(step, STREAM_REVEAL_MAX_STEP, remaining);
        virtualLength += step;
      }

      const shouldCommit =
        timestamp - lastCommitAt >= STREAM_REVEAL_COMMIT_INTERVAL_MS || virtualLength >= target.length;
      if (shouldCommit && virtualLength > displayedContentRef.current.length) {
        const next = target.slice(0, virtualLength);
        displayedContentRef.current = next;
        setDisplayedContent(next);
        lastCommitAt = timestamp;
      }

      if (virtualLength >= target.length) {
        if (displayedContentRef.current.length < target.length) {
          displayedContentRef.current = target;
          setDisplayedContent(target);
        }
        frameId = null;
        return;
      }

      frameId = window.requestAnimationFrame(animate);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [message.content, message.role]);

  const copyMessage = async () => {
    const content = isUser ? message.content : displayedContent;
    if (!content.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      setCopied(false);
    }
  };

  const saveEdit = () => {
    const next = editDraft.trim();
    const hasAnyAttachmentPayload = editAttachments.some((attachment) => {
      if (attachment.kind === "text") {
        return Boolean(attachment.textContent?.trim());
      }
      if (attachment.kind === "image") {
        return Boolean(attachment.imageDataUrl?.trim());
      }
      return true;
    });
    const currentAttachments = message.attachments ?? [];
    const nextMessageAttachments = editAttachments.map(toMessageAttachment);
    const attachmentsChanged =
      JSON.stringify(nextMessageAttachments) !== JSON.stringify(currentAttachments);

    if (!next && !hasAnyAttachmentPayload) {
      setIsEditing(false);
      resetEditState();
      return;
    }

    if (next === message.content && !attachmentsChanged) {
      setIsEditing(false);
      resetEditState();
      return;
    }
    editAttachments.forEach(revokeAttachmentPreview);
    setIsDragOverEdit(false);
    onEditMessage(message, next, nextMessageAttachments);
    setIsEditing(false);
  };

  const attachments = message.attachments ?? [];
  const hasReasoning = !isUser && Boolean(message.reasoningContent?.trim());
  const hasMcpEvents = !isUser && Boolean(message.toolCalls?.length);
  const agentToolCalls = isAgentMode && !isUser ? message.toolCalls ?? [] : [];
  const agentProgressCalls = agentToolCalls.filter((toolCall) => toolCall.id.startsWith("progress:"));
  const agentExecutionCalls = agentToolCalls.filter((toolCall) => !toolCall.id.startsWith("progress:"));
  const agentToolRenderItems = buildAgentToolRenderItems(agentToolCalls);
  const activePendingExecutionCall = [...agentExecutionCalls]
    .reverse()
    .find((toolCall) => toolCall.status === "pending");
  const activePendingProgressCall = [...agentProgressCalls]
    .reverse()
    .find((toolCall) => toolCall.status === "pending");
  const isCurrentGeneratingAssistant = Boolean(
    !isUser && isGenerating && activeGeneratingAssistantId === message.id
  );
  const shouldShowAgentToolSection = isAgentMode && !isUser && hasMcpEvents;
  const assistantVisibleContent = isUser ? message.content : displayedContent;

  // Build anchor groups: each group has a contentOffset and the render items that belong there.
  // Items without a contentOffset (or with the same offset as the previous group) are appended
  // to the most recent group.
  type AnchorGroup = { key: string; offset: number; items: AgentToolRenderItem[] };
  const anchorGroups: AnchorGroup[] = [];
  if (shouldShowAgentToolSection) {
    for (const item of agentToolRenderItems) {
      const rawOffset =
        item.kind === "single"
          ? item.toolCall.contentOffset
          : item.parent.contentOffset;
      const hasOffset = typeof rawOffset === "number" && Number.isFinite(rawOffset);
      if (hasOffset && rawOffset !== anchorGroups[anchorGroups.length - 1]?.offset) {
        anchorGroups.push({
          key: `offset:${Math.floor(rawOffset as number)}:${anchorGroups.length}`,
          offset: rawOffset as number,
          items: [item]
        });
      } else if (anchorGroups.length > 0) {
        anchorGroups[anchorGroups.length - 1].items.push(item);
      } else {
        // No offset at all — put at position 0
        anchorGroups.push({ key: `offset:0:${anchorGroups.length}`, offset: 0, items: [item] });
      }
    }
  }

  // Clamp offsets to visible content length
  const clampedGroups = anchorGroups.map((g) => ({
    ...g,
    offset: Math.max(0, Math.min(assistantVisibleContent.length, Math.floor(g.offset)))
  }));

  const shouldRenderAgentToolInline = clampedGroups.length > 0;
  const nonInlineGroupId = "standalone";
  const groupPendingMap = useMemo<Record<string, boolean>>(() => {
    if (!shouldShowAgentToolSection) {
      return {};
    }
    if (shouldRenderAgentToolInline) {
      return clampedGroups.reduce<Record<string, boolean>>((acc, group) => {
        acc[group.key] = hasPendingToolInRenderItems(group.items);
        return acc;
      }, {});
    }
    return {
      [nonInlineGroupId]: hasPendingToolInRenderItems(agentToolRenderItems)
    };
  }, [agentToolRenderItems, clampedGroups, shouldRenderAgentToolInline, shouldShowAgentToolSection]);

  const toggleAgentResultDetail = (toolCallId: string) => {
    setExpandedAgentResultIds((previous) => ({
      ...previous,
      [toolCallId]: !previous[toolCallId]
    }));
  };

  const toggleAgentGroupDetail = (groupId: string) => {
    setExpandedAgentGroupIds((previous) => ({
      ...previous,
      [groupId]: !(previous[groupId] ?? false)
    }));
  };

  const renderAgentToolItems = (items: AgentToolRenderItem[], groupId: string, isLastGroup = true) => {
    const groupExecutionCount = items.filter(
      (item) => item.kind === "single"
        ? !item.toolCall.id.startsWith("progress:")
        : true
    ).length;
    const hasPendingGroupItem = hasPendingToolInRenderItems(items);
    const isGroupExpanded =
      expandedAgentGroupIds[groupId] ?? (isCurrentGeneratingAssistant && hasPendingGroupItem);

    const statusLabel = isCurrentGeneratingAssistant && hasPendingGroupItem && isLastGroup
      ? "执行中"
      : "执行记录";

    return (
      <div className="mt-1.5">
        <button
          type="button"
          className="group/hdr mb-1 flex items-center gap-1.5 px-0.5 py-0.5 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground/75"
          onClick={() => toggleAgentGroupDetail(groupId)}
          aria-expanded={isGroupExpanded}
        >
          {isGroupExpanded
            ? <ChevronDown className="h-3 w-3" />
            : <ChevronRight className="h-3 w-3" />}
          <span>{statusLabel}</span>
          <span className="text-[10px] text-muted-foreground/55">
            {Math.max(groupExecutionCount, 1)} 步
          </span>
        </button>

        {isGroupExpanded ? (
          <div className="pl-1">
            {items.map((item, idx) => {

              const isLastItem = idx === items.length - 1;

              if (item.kind === "single") {
                const toolCall = item.toolCall;
                const isProgress = toolCall.id.startsWith("progress:");
                const isActivePending = isCurrentGeneratingAssistant &&
                  (isProgress
                    ? activePendingProgressCall?.id === toolCall.id
                    : activePendingExecutionCall?.id === toolCall.id) &&
                  toolCall.status === "pending";
                return (
                  <AgentToolCallRow
                    key={toolCall.id}
                    toolCall={toolCall}
                    isActivePending={isActivePending}
                    isDetailExpanded={Boolean(expandedAgentResultIds[toolCall.id])}
                    onToggleDetail={() => toggleAgentResultDetail(toolCall.id)}
                    permissionRequest={permissionRequest}
                    onResolvePermission={onResolvePermission}
                    isLast={isLastItem}
                  />
                );
              }

              const parent = item.parent;
              const isParentPending = isCurrentGeneratingAssistant &&
                activePendingExecutionCall?.id === parent.id &&
                parent.status === "pending";

              return (
                <AgentTodoProgressGroup
                  key={parent.id}
                  parent={parent}
                  steps={item.steps}
                  isParentPending={isParentPending}
                  activePendingProgressId={activePendingProgressCall?.id}
                  isParentDetailExpanded={Boolean(expandedAgentResultIds[parent.id])}
                  onToggleParentDetail={() => toggleAgentResultDetail(parent.id)}
                  isLast={isLastItem}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  useEffect(() => {
    if (!isAgentMode && isCurrentGeneratingAssistant && hasMcpEvents) {
      setIsMcpEventsExpanded(true);
    }
  }, [hasMcpEvents, isAgentMode, isCurrentGeneratingAssistant]);

  useEffect(() => {
    if (!shouldShowAgentToolSection) {
      previousGroupPendingMapRef.current = {};
      Object.values(agentGroupCollapseTimersRef.current).forEach((timerId) => window.clearTimeout(timerId));
      agentGroupCollapseTimersRef.current = {};
      return;
    }

    const previousPendingMap = previousGroupPendingMapRef.current;
    const justCompletedGroupIds: string[] = [];
    setExpandedAgentGroupIds((current) => {
      let changed = false;
      const next = { ...current };

      for (const [groupId, isPending] of Object.entries(groupPendingMap)) {
        const wasPending = previousPendingMap[groupId];
        if (isPending && wasPending !== true && next[groupId] !== true) {
          clearAgentGroupCollapseTimer(groupId);
          next[groupId] = true;
          changed = true;
        }
        if (!isPending && wasPending === true) {
          justCompletedGroupIds.push(groupId);
          if (next[groupId] !== true) {
            next[groupId] = true;
            changed = true;
          }
        }
        if (isPending) {
          clearAgentGroupCollapseTimer(groupId);
        }
      }

      for (const groupId of Object.keys(next)) {
        if (!(groupId in groupPendingMap)) {
          clearAgentGroupCollapseTimer(groupId);
          delete next[groupId];
          changed = true;
        }
      }

      return changed ? next : current;
    });
    justCompletedGroupIds.forEach((groupId) => scheduleAgentGroupCollapse(groupId));
    previousGroupPendingMapRef.current = groupPendingMap;
  }, [groupPendingMap, shouldShowAgentToolSection]);

  const assistantUsage =
    !isCurrentGeneratingAssistant &&
    !isUser &&
    message.usage &&
    ((message.usage.inputTokens ?? 0) > 0 ||
      (message.usage.outputTokens ?? 0) > 0 ||
      (message.usage.cacheReadTokens ?? 0) > 0 ||
      (message.usage.cacheWriteTokens ?? 0) > 0)
      ? message.usage
      : null;
  const assistantInputTokens = assistantUsage?.inputTokens ?? 0;
  const assistantOutputTokens = assistantUsage?.outputTokens ?? 0;
  const assistantCacheReadTokens = assistantUsage?.cacheReadTokens ?? 0;
  const assistantCacheWriteTokens = assistantUsage?.cacheWriteTokens ?? 0;

  const addEditFiles = (files: FileList | null) => {
    if (!files?.length) {
      return;
    }
    void (async () => {
      const next = await Promise.all(
        Array.from(files).map(async (file): Promise<EditAttachment> => {
          const base: EditAttachment = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
            kind: "file"
          };

          if (file.type.startsWith("image/")) {
            const previewUrl = URL.createObjectURL(file);
            if (file.size > IMAGE_ATTACHMENT_LIMIT) {
              return {
                ...base,
                kind: "image",
                previewUrl,
                error: `图片超过 ${(IMAGE_ATTACHMENT_LIMIT / (1024 * 1024)).toFixed(0)}MB，无法发送给模型。`
              };
            }

            try {
              const imageDataUrl = await readFileAsDataUrl(file);
              return {
                ...base,
                kind: "image",
                previewUrl,
                imageDataUrl
              };
            } catch {
              return {
                ...base,
                kind: "image",
                previewUrl,
                error: "图片读取失败，无法发送给模型。"
              };
            }
          }

          if (isTextAttachment(file)) {
            try {
              const content = await file.text();
              const isTrimmed = content.length > TEXT_ATTACHMENT_LIMIT;
              return {
                ...base,
                kind: "text",
                textContent: content.slice(0, TEXT_ATTACHMENT_LIMIT),
                error: isTrimmed ? `文本已截断到前 ${TEXT_ATTACHMENT_LIMIT} 个字符。` : undefined
              };
            } catch {
              return {
                ...base,
                kind: "text",
                error: "文件读取失败，无法注入到消息上下文。"
              };
            }
          }

          return base;
        })
      );
      setEditAttachments((previous) => [...previous, ...next]);
    })();
  };

  const removeEditAttachment = (attachmentId: string) => {
    setEditAttachments((previous) => {
      const target = previous.find((attachment) => attachment.id === attachmentId);
      if (target) {
        revokeAttachmentPreview(target);
      }
      return previous.filter((attachment) => attachment.id !== attachmentId);
    });
  };

  return (
    <div className={`group paper-message-enter flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex flex-none flex-col ${
          isUser ? "max-w-[78%] items-end sm:max-w-[70%] lg:max-w-[62%]" : "w-full max-w-[620px] items-start"
        }`}
      >
        {isUser && isEditing ? (
          <div
            className={[
              "rounded-md border bg-card px-3 py-2.5 transition-colors",
              isDragOverEdit
                ? "border-primary bg-accent/65"
                : "border-border"
            ].join(" ")}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setIsDragOverEdit(true);
            }}
            onDragLeave={() => setIsDragOverEdit(false)}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsDragOverEdit(false);
              addEditFiles(event.dataTransfer.files);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept="*/*"
              onChange={(event) => {
                addEditFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <textarea
              value={editDraft}
              onChange={(event) => setEditDraft(event.target.value)}
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
                        onClick={() => removeEditAttachment(attachment.id)}
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
                {isDragOverEdit ? "松开鼠标即可添加附件" : "支持拖拽文件到这里上传。"}
              </p>
            )}
            <div className="mt-2 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => fileInputRef.current?.click()}
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
                onClick={() => {
                  setIsEditing(false);
                  resetEditState();
                }}
              >
                <X className="h-3.5 w-3.5" />
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={saveEdit}
                disabled={isGenerating}
              >
                保存并重生成
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={[
              "inline-block w-fit max-w-full break-words transition-opacity duration-150",
              isUser
                ? "rounded-md border border-border/80 bg-secondary px-3 py-2 sm:px-3.5"
                : "rounded-md border border-transparent bg-transparent px-1 py-1"
            ].join(" ")}
          >
            {!isUser && message.appliedSkill ? (
              <div className="mb-1.5 flex items-center gap-1.5">
                <span className="text-sm leading-none">{message.appliedSkill.icon}</span>
                <span className="text-[11px] font-medium text-primary/80">{message.appliedSkill.name}</span>
                <span className="text-[11px] text-muted-foreground">/{message.appliedSkill.command}</span>
              </div>
            ) : null}
            {!isAgentMode && isCurrentGeneratingAssistant && (() => {
              const pendingTool = [...(message.toolCalls ?? [])].reverse().find((tc) => tc.status === "pending");
              return pendingTool ? (
                <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex gap-[3px]">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="inline-block h-1 w-1 rounded-full bg-muted-foreground/60"
                        style={{ animation: `mcpDot 1.2s ease-in-out ${i * 0.2}s infinite` }}
                      />
                    ))}
                  </span>
                  <span>
                    [{pendingTool.serverName}] {pendingTool.toolName}
                  </span>
                </div>
              ) : null;
            })()}
            {hasMcpEvents ? (
              !isAgentMode ? (
                <div className="mb-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                    onClick={() => setIsMcpEventsExpanded((previous) => !previous)}
                  >
                    {isMcpEventsExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    工具调用 ({message.toolCalls?.length ?? 0})
                  </Button>
                  {isMcpEventsExpanded ? (
                    <div className="mt-1.5 max-h-48 space-y-1 overflow-auto rounded-md border border-border bg-accent/35 px-3 py-2">
                      {(message.toolCalls ?? []).map((tc) => (
                        <div key={tc.id} className="flex items-start gap-1.5 text-xs leading-5">
                          <span
                            className={
                              tc.status === "error"
                                ? "text-destructive"
                                : tc.status === "pending"
                                  ? "text-muted-foreground"
                                  : "text-green-500"
                            }
                          >
                            {tc.status === "error" ? "✗" : tc.status === "pending" ? "…" : "✓"}
                          </span>
                          <span className="text-muted-foreground">[{tc.serverName}]</span>
                          <span className="font-medium text-foreground/80">{tc.toolName}</span>
                          {tc.message ? <span className="text-muted-foreground">{tc.message}</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null
            ) : null}
            {hasReasoning ? (
              <div className="mb-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[11px] text-muted-foreground"
                  onClick={() => setIsReasoningExpanded((previous) => !previous)}
                >
                  {isReasoningExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  思维链
                </Button>
                {isReasoningExpanded ? (
                  <div className="mt-1.5 rounded-md border border-border bg-accent/42 px-3 py-2">
                    <MarkdownContent content={message.reasoningContent ?? ""} isUser={false} />
                  </div>
                ) : null}
              </div>
            ) : null}
            <div>
              {assistantVisibleContent ? (
                shouldRenderAgentToolInline ? (
                  <>
                    {(() => {
                      const segments: ReactNode[] = [];
                      let cursor = 0;
                      for (let i = 0; i < clampedGroups.length; i++) {
                        const group = clampedGroups[i];
                        const textSlice = assistantVisibleContent.slice(cursor, group.offset);
                        if (textSlice) {
                          segments.push(
                            <MarkdownContent key={`text-${i}`} content={textSlice} isUser={isUser} />
                          );
                        }
                        segments.push(
                          <div key={`tools-${i}`} className={i > 0 ? "mt-1" : ""}>
                            {renderAgentToolItems(group.items, group.key, i === clampedGroups.length - 1)}
                          </div>
                        );
                        cursor = group.offset;
                      }
                      const tail = assistantVisibleContent.slice(cursor);
                      if (tail) {
                        segments.push(
                          <div key="text-tail" className="mt-1">
                            <MarkdownContent content={tail} isUser={isUser} />
                          </div>
                        );
                      }
                      return segments;
                    })()}
                  </>
                ) : (
                  <MarkdownContent content={assistantVisibleContent} isUser={isUser} />
                )
              ) : (
                <span className="text-muted-foreground">Generating...</span>
              )}
            </div>
            {shouldShowAgentToolSection && !shouldRenderAgentToolInline
              ? renderAgentToolItems(agentToolRenderItems, nonInlineGroupId)
              : null}
          </div>
        )}

        {attachments.length ? (
          <div className={isUser ? "mt-1.5 flex flex-wrap justify-end gap-1.5" : "mt-1.5 flex flex-wrap gap-1.5"}>
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[12px] text-muted-foreground"
              >
                {attachment.name}
              </span>
            ))}
          </div>
        ) : null}

        {assistantUsage ? (
          <div
            className={[
              "mt-1 inline-flex items-center gap-2 text-[13px] font-medium tabular-nums",
              assistantUsage.source === "provider"
                ? "text-muted-foreground"
                : "text-muted-foreground/80"
            ].join(" ")}
            title={assistantUsage.source === "provider" ? "Provider usage" : "Estimated usage"}
          >
            <span className="inline-flex items-center gap-1">
              <ArrowUp className="h-3 w-3" />
              {formatTokenCount(assistantInputTokens)}
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowDown className="h-3 w-3" />
              {formatTokenCount(assistantOutputTokens)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="text-[11px] font-semibold tracking-wide">cache</span>
              {formatTokenCount(assistantCacheReadTokens)}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide">CW</span>
              {formatTokenCount(assistantCacheWriteTokens)}
            </span>
          </div>
        ) : null}

        <div
          className={[
            "mt-1.5 flex w-fit max-w-full items-center gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
            isUser ? "ml-auto justify-end" : "justify-start"
          ].join(" ")}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => {
              void copyMessage();
            }}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "已复制" : "复制"}
          </Button>
          {isUser && !isAgentMode ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() => setIsEditing(true)}
                disabled={isGenerating}
              >
                <Pencil className="h-3.5 w-3.5" />
                编辑
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                onClick={() => onResendMessage(message)}
                disabled={isGenerating}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                重发
              </Button>
            </>
          ) : null}
          {!isAgentMode ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-destructive"
              onClick={() => onDeleteMessage(message)}
              disabled={isGenerating}
            >
              <Trash2 className="h-3.5 w-3.5" />
              删除
            </Button>
          ) : null}
        </div>
      </div>
      {isUser ? (
        <div className="grid h-7 w-7 place-content-center rounded-md border border-border/80 bg-accent/55 text-[10px] font-semibold tracking-wide text-foreground">
          U
        </div>
      ) : null}
    </div>
  );
};

export const ChatView = ({
  sessionId,
  messages,
  isConfigured,
  isGenerating,
  mode = "chat",
  permissionRequest,
  onResolvePermission,
  onEditMessage,
  onDeleteMessage,
  onResendMessage
}: ChatViewProps) => {
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const scrollContentRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const pendingScrollFrameRef = useRef<number | null>(null);
  const smoothScrollFrameRef = useRef<number | null>(null);
  const manualScrollFrameRef = useRef<number | null>(null);
  const manualScrollTargetRef = useRef<number | null>(null);
  const cinematicFollowVelocityRef = useRef(0);
  const cinematicFollowLastTimestampRef = useRef<number | null>(null);
  const cinematicFollowStreamingRef = useRef(false);
  const streamResizeLastFollowAtRef = useRef(0);
  const streamResizeLastHeightRef = useRef(0);
  const isProgrammaticScrollRef = useRef(false);
  const lastStreamFollowAtRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const previousMessageCountRef = useRef(messages.length);
  const setProgrammaticScrollTop = (container: HTMLElement, nextTop: number) => {
    if (Math.abs(container.scrollTop - nextTop) <= 0.5) {
      return;
    }
    isProgrammaticScrollRef.current = true;
    container.scrollTop = nextTop;
  };
  const stopCinematicFollow = () => {
    if (smoothScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(smoothScrollFrameRef.current);
      smoothScrollFrameRef.current = null;
    }
    cinematicFollowVelocityRef.current = 0;
    cinematicFollowLastTimestampRef.current = null;
  };
  const getFollowTargetTop = (container: HTMLElement, streaming: boolean) => {
    const bottomTop = Math.max(0, container.scrollHeight - container.clientHeight);
    if (!streaming) {
      return bottomTop;
    }
    const distanceToBottom = Math.max(0, bottomTop - container.scrollTop);
    if (distanceToBottom <= STREAM_FOLLOW_MAGNETIC_SNAP_RANGE) {
      return bottomTop;
    }
    const tailDistance = Math.min(
      STREAM_FOLLOW_TAIL_MAX_PX,
      Math.max(STREAM_FOLLOW_TAIL_MIN_PX, distanceToBottom * STREAM_FOLLOW_TAIL_RATIO)
    );
    const rawTarget = Math.max(0, bottomTop - tailDistance);
    const steppedTarget =
      Math.floor(rawTarget / STREAM_FOLLOW_TARGET_STEP_PX) * STREAM_FOLLOW_TARGET_STEP_PX;
    return Math.max(0, Math.min(bottomTop, steppedTarget));
  };
  const requestCinematicFollow = (streaming: boolean) => {
    cinematicFollowStreamingRef.current = streaming;
    if (!shouldAutoScrollRef.current) {
      return;
    }
    if (smoothScrollFrameRef.current !== null) {
      return;
    }
    cinematicFollowLastTimestampRef.current = null;

    const animate = (timestamp: number) => {
      const container = scrollContainerRef.current;
      if (!container || !shouldAutoScrollRef.current) {
        stopCinematicFollow();
        return;
      }

      const bottomTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const targetTop = getFollowTargetTop(container, cinematicFollowStreamingRef.current);
      const currentTop = container.scrollTop;
      const delta = targetTop - currentTop;
      const previousTimestamp = cinematicFollowLastTimestampRef.current;
      const dt =
        previousTimestamp === null
          ? 1 / 60
          : Math.min(
              CINEMATIC_FOLLOW_MAX_DT_SECONDS,
              Math.max(1 / 240, (timestamp - previousTimestamp) / 1000)
            );
      cinematicFollowLastTimestampRef.current = timestamp;

      const acceleration =
        delta * CINEMATIC_FOLLOW_SPRING_STIFFNESS -
        cinematicFollowVelocityRef.current * CINEMATIC_FOLLOW_DAMPING;
      cinematicFollowVelocityRef.current += acceleration * dt;
      const nextTop = Math.max(
        0,
        Math.min(bottomTop, currentTop + cinematicFollowVelocityRef.current * dt)
      );
      setProgrammaticScrollTop(container, nextTop);

      const distanceToTarget = targetTop - container.scrollTop;
      const distanceToBottom = bottomTop - container.scrollTop;
      const shouldMagneticSnap =
        cinematicFollowStreamingRef.current &&
        distanceToBottom <= STREAM_FOLLOW_MAGNETIC_SNAP_RANGE &&
        cinematicFollowVelocityRef.current > -10;
      if (shouldMagneticSnap) {
        setProgrammaticScrollTop(container, bottomTop);
        stopCinematicFollow();
        return;
      }
      if (
        Math.abs(distanceToTarget) <= CINEMATIC_FOLLOW_STOP_DISTANCE_PX &&
        Math.abs(cinematicFollowVelocityRef.current) <= CINEMATIC_FOLLOW_STOP_VELOCITY
      ) {
        setProgrammaticScrollTop(container, targetTop);
        stopCinematicFollow();
        return;
      }
      smoothScrollFrameRef.current = window.requestAnimationFrame(animate);
    };

    smoothScrollFrameRef.current = window.requestAnimationFrame(animate);
  };
  const latestMessage = messages[messages.length - 1];
  const activeGeneratingAssistantId = useMemo(() => {
    if (!isGenerating) {
      return null;
    }
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === "assistant") {
        return messages[index].id;
      }
    }
    return null;
  }, [isGenerating, messages]);
  const hasGeneratingAssistant = isGenerating && Boolean(activeGeneratingAssistantId);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    const isNearBottom = () =>
      container.scrollHeight - container.scrollTop - container.clientHeight <= AUTO_SCROLL_THRESHOLD;

    const onWheel = (event: WheelEvent) => {
      let deltaY = event.deltaY;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        deltaY *= 16;
      } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
        deltaY *= container.clientHeight;
      }

      if (Math.abs(deltaY) < 0.1) {
        return;
      }

      event.preventDefault();
      const nearBottomBeforeScroll = isNearBottom();
      if (deltaY < 0 || !nearBottomBeforeScroll) {
        // Scrolling up means user wants to browse history, so pause auto-follow immediately.
        shouldAutoScrollRef.current = false;
      }

      stopCinematicFollow();

      const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
      const baseTarget = manualScrollTargetRef.current ?? container.scrollTop;
      manualScrollTargetRef.current = Math.max(0, Math.min(maxTop, baseTarget + deltaY));

      if (manualScrollFrameRef.current !== null) {
        return;
      }

      const animateManualScroll = () => {
        const target = manualScrollTargetRef.current;
        if (target === null) {
          manualScrollFrameRef.current = null;
          return;
        }
        const current = container.scrollTop;
        const delta = target - current;
        if (Math.abs(delta) <= 0.6) {
          setProgrammaticScrollTop(container, target);
          lastScrollTopRef.current = target;
          manualScrollTargetRef.current = null;
          manualScrollFrameRef.current = null;
          return;
        }

        setProgrammaticScrollTop(container, current + delta * MANUAL_SCROLL_LERP_FACTOR);
        lastScrollTopRef.current = container.scrollTop;
        manualScrollFrameRef.current = window.requestAnimationFrame(animateManualScroll);
      };

      manualScrollFrameRef.current = window.requestAnimationFrame(animateManualScroll);
    };

    const onScroll = () => {
      const currentTop = container.scrollTop;

      if (isProgrammaticScrollRef.current) {
        isProgrammaticScrollRef.current = false;
        lastScrollTopRef.current = currentTop;
        return;
      }

      stopCinematicFollow();
      if (manualScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(manualScrollFrameRef.current);
        manualScrollFrameRef.current = null;
      }
      manualScrollTargetRef.current = null;
      const nearBottom = isNearBottom();

      shouldAutoScrollRef.current = nearBottom;

      lastScrollTopRef.current = currentTop;
    };

    lastScrollTopRef.current = container.scrollTop;
    shouldAutoScrollRef.current = isNearBottom();
    container.addEventListener("wheel", onWheel, { passive: false });
    container.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("scroll", onScroll);
    };
  }, [isConfigured]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const content = scrollContentRef.current;
    if (!container || !content || typeof ResizeObserver === "undefined") {
      return;
    }

    let frameId: number | null = null;
    const queueCinematicFollow = () => {
      frameId = null;
      if (!shouldAutoScrollRef.current) {
        return;
      }
      requestCinematicFollow(hasGeneratingAssistant);
    };

    const observer = new ResizeObserver(() => {
      if (!shouldAutoScrollRef.current) {
        return;
      }
      if (hasGeneratingAssistant) {
        const now = window.performance.now();
        const currentHeight = content.scrollHeight;
        const heightDelta = Math.abs(currentHeight - streamResizeLastHeightRef.current);
        const intervalElapsed = now - streamResizeLastFollowAtRef.current;
        if (
          heightDelta < STREAM_RESIZE_FOLLOW_MIN_DELTA_PX &&
          intervalElapsed < STREAM_RESIZE_FOLLOW_INTERVAL_MS
        ) {
          return;
        }
        streamResizeLastHeightRef.current = currentHeight;
        streamResizeLastFollowAtRef.current = now;
      }
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(queueCinematicFollow);
    });
    observer.observe(content);
    streamResizeLastHeightRef.current = content.scrollHeight;
    streamResizeLastFollowAtRef.current = window.performance.now();

    return () => {
      observer.disconnect();
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [hasGeneratingAssistant, isConfigured, messages.length, sessionId]);

  useEffect(() => {
    return () => {
      if (pendingScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingScrollFrameRef.current);
      }
      stopCinematicFollow();
      if (manualScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(manualScrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
    }
    stopCinematicFollow();
    if (manualScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(manualScrollFrameRef.current);
      manualScrollFrameRef.current = null;
    }
    manualScrollTargetRef.current = null;
    lastStreamFollowAtRef.current = 0;
    cinematicFollowStreamingRef.current = false;
    streamResizeLastFollowAtRef.current = 0;
    streamResizeLastHeightRef.current = 0;
    shouldAutoScrollRef.current = true;
    previousMessageCountRef.current = messages.length;
    pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingScrollFrameRef.current = null;
      const nextContainer = scrollContainerRef.current;
      if (!nextContainer) {
        return;
      }
      setProgrammaticScrollTop(nextContainer, nextContainer.scrollHeight);
      lastScrollTopRef.current = nextContainer.scrollTop;
    });
  }, [sessionId]);

  useEffect(() => {
    if (!messages.length) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    const previousMessageCount = previousMessageCountRef.current;
    const hasNewMessage = messages.length > previousMessageCount;
    const shouldForceScroll = latestMessage?.role === "user";
    const isStreamingAssistantUpdate = Boolean(
      hasGeneratingAssistant &&
      latestMessage?.role === "assistant" &&
      latestMessage?.id === activeGeneratingAssistantId &&
      !hasNewMessage &&
      !shouldForceScroll
    );
    const shouldFollow = shouldAutoScrollRef.current || shouldForceScroll;
    if (!shouldFollow) {
      previousMessageCountRef.current = messages.length;
      return;
    }

    if (isStreamingAssistantUpdate) {
      const now = window.performance.now();
      if (now - lastStreamFollowAtRef.current < STREAM_AUTO_FOLLOW_INTERVAL_MS) {
        previousMessageCountRef.current = messages.length;
        return;
      }
      lastStreamFollowAtRef.current = now;
    }

    if (pendingScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingScrollFrameRef.current);
    }
    pendingScrollFrameRef.current = window.requestAnimationFrame(() => {
      pendingScrollFrameRef.current = null;
      if (manualScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(manualScrollFrameRef.current);
        manualScrollFrameRef.current = null;
      }
      manualScrollTargetRef.current = null;
      const shouldUseStreamingTail = isStreamingAssistantUpdate && !shouldForceScroll && !hasNewMessage;
      if (shouldForceScroll) {
        cinematicFollowVelocityRef.current = Math.max(cinematicFollowVelocityRef.current, 380);
      }
      requestCinematicFollow(shouldUseStreamingTail);
      shouldAutoScrollRef.current = true;
    });
    previousMessageCountRef.current = messages.length;
  }, [
    messages.length,
    activeGeneratingAssistantId,
    hasGeneratingAssistant,
    latestMessage?.id,
    latestMessage?.content,
    latestMessage?.reasoningContent,
    latestMessage?.toolCalls?.length,
    latestMessage?.toolCalls?.[latestMessage.toolCalls.length - 1]?.status
  ]);

  if (!isConfigured) {
    return (
      <section className="paper-conversation-stage mx-auto flex h-full w-full items-center justify-center px-4 py-6 sm:px-5 sm:py-7 md:px-6 md:py-8">
        <div className="rounded-lg border border-border/75 bg-card px-6 py-6 text-center sm:px-8 sm:py-7 md:px-10 md:py-8">
          <h2 className="text-[28px] font-semibold leading-none text-foreground sm:text-[36px] md:text-[42px]">
            Hello, Echo
          </h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            请在左下角 Settings 完成渠道配置
          </p>
        </div>
      </section>
    );
  }

  if (!messages.length) {
    return (
      <section className="paper-conversation-stage mx-auto flex h-full w-full items-center justify-center px-4 py-6 text-center sm:px-5 sm:py-7 md:px-6 md:py-8">
        <div>
          <p className="mb-4 inline-flex items-center rounded-md border border-border/70 bg-card px-3 py-1 text-xs text-muted-foreground">
            New conversation
          </p>
          <h2 className="text-[28px] font-semibold leading-[1.2] text-foreground sm:text-[34px] md:text-[38px]">
            Start with a clear prompt
          </h2>
          <p className="mx-auto mt-3 max-w-[520px] text-sm text-muted-foreground sm:text-base">
            提问越具体，结果越稳定。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={scrollContainerRef}
      className="paper-conversation-stage mx-auto h-full w-full max-w-[760px] overflow-auto px-4 py-5 sm:px-5 sm:py-6 md:px-6 md:py-7"
    >
      <div ref={scrollContentRef} className="grid gap-3.5 sm:gap-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isGenerating={isGenerating}
            activeGeneratingAssistantId={activeGeneratingAssistantId}
            mode={mode}
            permissionRequest={permissionRequest}
            onResolvePermission={onResolvePermission}
            onEditMessage={onEditMessage}
            onDeleteMessage={onDeleteMessage}
            onResendMessage={onResendMessage}
          />
        ))}
      </div>
    </section>
  );
};
