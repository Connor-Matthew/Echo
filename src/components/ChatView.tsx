import {
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
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
  X
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

type ChatViewProps = {
  messages: ChatMessage[];
  isConfigured: boolean;
  isGenerating: boolean;
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
    <div className="mb-2 overflow-hidden rounded-[4px] border border-border bg-card/90 shadow-[2px_2px_0_hsl(var(--border))] last:mb-0">
      <div className="flex items-center justify-between border-b border-border/80 bg-accent/50 px-2.5 py-1.5">
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
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>,
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

const MessageBubble = ({
  message,
  isGenerating,
  onEditMessage,
  onDeleteMessage,
  onResendMessage
}: MessageBubbleProps) => {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [editAttachments, setEditAttachments] = useState<EditAttachment[]>(
    cloneMessageAttachments(message.attachments)
  );
  const [isDragOverEdit, setIsDragOverEdit] = useState(false);
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(false);
  const [displayedContent, setDisplayedContent] = useState(message.content);
  const displayedContentRef = useRef(message.content);
  const targetContentRef = useRef(message.content);
  const editAttachmentsRef = useRef<EditAttachment[]>(editAttachments);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    return () => {
      editAttachmentsRef.current.forEach(revokeAttachmentPreview);
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

    const timerId = window.setInterval(() => {
      const current = displayedContentRef.current;
      const target = targetContentRef.current;

      if (current.length >= target.length) {
        window.clearInterval(timerId);
        return;
      }

      const remaining = target.length - current.length;
      const step = remaining > 40 ? 6 : remaining > 20 ? 4 : remaining > 10 ? 2 : 1;
      const next = target.slice(0, current.length + step);

      displayedContentRef.current = next;
      setDisplayedContent(next);

      if (next.length >= target.length) {
        window.clearInterval(timerId);
      }
    }, 16);

    return () => {
      window.clearInterval(timerId);
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
    <div className={`group flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser ? (
        <div className="grid h-8 w-8 place-content-center rounded-[4px] border border-border bg-accent/50 text-[10px] font-semibold tracking-wide text-foreground shadow-[2px_2px_0_hsl(var(--border))]">
          AI
        </div>
      ) : null}
      <div className={`flex max-w-[72%] flex-none flex-col ${isUser ? "items-end" : "items-start"}`}>
        {isUser && isEditing ? (
          <div
            className={[
              "rounded-[6px] border bg-card px-3 py-2.5 shadow-[2px_2px_0_hsl(var(--border))] transition-colors",
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
              className="min-h-[80px] w-full resize-y rounded-[4px] border border-input bg-card p-2 text-[14px] leading-6 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {editAttachments.length ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {editAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="rounded-[4px] border border-border bg-card/80 px-2.5 py-2"
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
                ? "rounded-[6px] border border-border bg-secondary/65 px-3.5 py-2.5 shadow-[2px_2px_0_hsl(var(--border))]"
                : "pt-1"
            ].join(" ")}
          >
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
                  <div className="mt-1.5 rounded-[6px] border border-border bg-accent/45 px-3 py-2">
                    <MarkdownContent content={message.reasoningContent ?? ""} isUser={false} />
                  </div>
                ) : null}
              </div>
            ) : null}
            {(isUser ? message.content : displayedContent) ? (
              <MarkdownContent content={isUser ? message.content : displayedContent} isUser={isUser} />
            ) : (
              <span className="text-muted-foreground">Generating...</span>
            )}
          </div>
        )}

        {attachments.length ? (
          <div className={isUser ? "mt-1.5 flex flex-wrap justify-end gap-1.5" : "mt-1.5 flex flex-wrap gap-1.5"}>
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex items-center rounded-[4px] border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {attachment.name}
              </span>
            ))}
          </div>
        ) : null}

        <div
          className={[
            "mt-1.5 flex w-fit max-w-full items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
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
          {isUser ? (
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
        </div>
      </div>
      {isUser ? (
        <div className="grid h-8 w-8 place-content-center rounded-[4px] border border-border bg-accent/50 text-[10px] font-semibold tracking-wide text-foreground shadow-[2px_2px_0_hsl(var(--border))]">
          U
        </div>
      ) : null}
    </div>
  );
};

export const ChatView = ({
  messages,
  isConfigured,
  isGenerating,
  onEditMessage,
  onDeleteMessage,
  onResendMessage
}: ChatViewProps) => {
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const latestMessage = messages[messages.length - 1];

  useEffect(() => {
    if (!messages.length) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: "auto"
    });
  }, [
    messages.length,
    latestMessage?.id,
    latestMessage?.content,
    latestMessage?.reasoningContent
  ]);

  if (!isConfigured) {
    return (
      <section className="mx-auto flex h-full w-full max-w-[980px] items-center justify-center px-3 py-3 sm:px-5 sm:py-5 md:px-7 md:py-7">
        <div className="rounded-[8px] border border-border bg-card/70 px-4 py-4 text-center shadow-[4px_4px_0_hsl(var(--border))] sm:px-6 sm:py-6 md:px-8 md:py-7">
          <h2 className="sketch-title text-[34px] font-semibold uppercase leading-none text-primary sm:text-[48px] md:text-[68px]">
            Hello, 用户名
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
      <section className="mx-auto flex h-full w-full max-w-[980px] items-center justify-center px-3 py-3 text-center sm:px-5 sm:py-5 md:px-7 md:py-7">
        <h2 className="sketch-title text-[40px] font-semibold uppercase leading-none text-primary sm:text-[56px] md:text-[72px]">
          LET&apos;S CHAT
        </h2>
      </section>
    );
  }

  return (
    <section
      ref={scrollContainerRef}
      className="mx-auto h-full w-full max-w-[980px] overflow-auto px-3 py-3 sm:px-5 sm:py-5 md:px-7 md:py-7"
    >
      <div className="grid gap-3 sm:gap-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isGenerating={isGenerating}
            onEditMessage={onEditMessage}
            onDeleteMessage={onDeleteMessage}
            onResendMessage={onResendMessage}
          />
        ))}
      </div>
    </section>
  );
};
