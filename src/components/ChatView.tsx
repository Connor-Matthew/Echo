import { isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import {
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
  suggestionPrompts: string[];
  onSelectSuggestion: (text: string) => void;
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
const TEXT_ATTACHMENT_EXTENSIONS = new Set([".md", ".txt"]);

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
  if (file.type === "text/plain" || file.type === "text/markdown") {
    return true;
  }
  return TEXT_ATTACHMENT_EXTENSIONS.has(getExtension(file.name));
};

const toMessageAttachment = (attachment: EditAttachment): ChatAttachment => ({
  id: attachment.id,
  name: attachment.name,
  mimeType: attachment.mimeType,
  size: attachment.size,
  kind: attachment.kind,
  textContent: attachment.kind === "text" ? attachment.textContent : undefined
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
    <div className="mb-2 overflow-hidden rounded-lg border border-[#d6e1ec] bg-[#f6f9fd] last:mb-0 dark:border-[#355073] dark:bg-[#172844]">
      <div className="flex items-center justify-between border-b border-[#dfe7f1] bg-[#eef4fb] px-2.5 py-1.5 dark:border-[#304867] dark:bg-[#1c3151]">
        <span className="text-[11px] font-medium uppercase tracking-wide text-[#5a7289] dark:text-[#a9c0da]">
          {language || "code"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px] text-[#4f6478] dark:text-[#adc3dc]"
          onClick={() => {
            void copyCode();
          }}
        >
          {copied ? "已复制" : "复制代码"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3">
        <code className="font-mono text-[13px] leading-6 text-[#203347] dark:text-[#d6e5f8]">{code}</code>
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
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-[#b8cce1] pl-3 text-[#324a63] dark:border-[#416185] dark:text-[#bfd1e7]">
      {children}
    </blockquote>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[#346b9c] underline decoration-[#8fb4d2] underline-offset-2 dark:text-[#79b4ed] dark:decoration-[#4f80ae]"
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
      return <code className="font-mono text-[13px] leading-6 text-[#203347] dark:text-[#d6e5f8]">{children}</code>;
    }
    return (
      <code className="rounded bg-[#e4edf7] px-1 py-[1px] font-mono text-[13px] text-[#2e4a66] dark:bg-[#243957] dark:text-[#d1e2f7]">
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#e9f1f8] dark:bg-[#1f3352]">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  th: ({ children }) => (
    <th className="border border-[#d2deea] px-2 py-1.5 font-semibold text-[#304960] dark:border-[#355073] dark:text-[#caddf4]">{children}</th>
  ),
  td: ({ children }) => <td className="border border-[#d2deea] px-2 py-1.5 dark:border-[#355073]">{children}</td>,
  hr: () => <hr className="my-3 border-[#d4e0ec] dark:border-[#355073]" />
};

const MarkdownContent = ({ content, isUser }: { content: string; isUser: boolean }) => (
  <div
    className={[
      "text-[15px] leading-[1.65] break-words",
      isUser ? "text-[#18222c] dark:text-[#dbe8f8]" : "text-[#18222c] dark:text-[#d3e2f4]"
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
    const hasTextAttachmentPayload = editAttachments.some(
      (attachment) => attachment.kind === "text" && Boolean(attachment.textContent?.trim())
    );
    const currentAttachments = message.attachments ?? [];
    const nextMessageAttachments = editAttachments.map(toMessageAttachment);
    const attachmentsChanged =
      JSON.stringify(nextMessageAttachments) !== JSON.stringify(currentAttachments);

    if (!next && !hasTextAttachmentPayload) {
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
            return {
              ...base,
              kind: "image",
              previewUrl: URL.createObjectURL(file),
              error: "图片当前仅预览和存档，不会发送给模型。"
            };
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

          return {
            ...base,
            error: "当前先支持 md/txt 解析；该文件不会发送给模型。"
          };
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
        <div className="grid h-8 w-8 place-content-center rounded-xl border border-[#d8e4f1] bg-[#ebf1f8] text-[10px] font-semibold tracking-wide text-[#3e536a] dark:border-[#355073] dark:bg-[#1a2d49] dark:text-[#b6cde6]">
          AI
        </div>
      ) : null}
      <div className={`flex max-w-[72%] flex-none flex-col ${isUser ? "items-end" : "items-start"}`}>
        {isUser && isEditing ? (
          <div
            className={[
              "rounded-[14px] border bg-[#eef3f8] px-3 py-2.5 transition-colors dark:border-[#355073] dark:bg-[#1a2d49]",
              isDragOverEdit
                ? "border-[#8bb0d4] bg-[#e7f0f9] dark:border-[#5b88b8] dark:bg-[#223a5e]"
                : "border-[#dce8f5] dark:border-[#355073]"
            ].join(" ")}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setIsDragOverEdit(true);
            }}
            onDragLeave={() => setIsDragOverEdit(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragOverEdit(false);
              addEditFiles(event.dataTransfer.files);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".md,.txt,text/markdown,text/plain,image/*,.pdf,.doc,.docx"
              onChange={(event) => {
                addEditFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <textarea
              value={editDraft}
              onChange={(event) => setEditDraft(event.target.value)}
              className="min-h-[80px] w-full resize-y rounded-md border border-[#c8d7e7] bg-white p-2 text-[14px] leading-6 text-[#243447] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-[#355073] dark:bg-[#122038] dark:text-[#d5e3f6]"
            />
            {editAttachments.length ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {editAttachments.map((attachment) => (
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
                        <p className="mt-0.5 text-[11px] text-[#6d7f93] dark:text-[#9ab0c8]">
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
                      <p className="mt-1 text-[11px] text-[#8a5a32] dark:text-[#f2b982]">{attachment.error}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-[#6d7f93] dark:text-[#9ab0c8]">
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
                ? "rounded-[14px] border border-[#dce8f5] bg-[#eef3f8] px-3.5 py-2.5 dark:border-[#355073] dark:bg-[#1a2d49]"
                : "pt-1"
            ].join(" ")}
          >
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
                className="inline-flex items-center rounded-md border border-[#d8e4f1] bg-[#f4f8fc] px-2 py-0.5 text-[11px] text-[#425a72] dark:border-[#355073] dark:bg-[#1b2f4d] dark:text-[#c2d6ed]"
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
            className="h-7 gap-1 px-2 text-xs text-[#5b6b7d] dark:text-[#9db2cb]"
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
                className="h-7 gap-1 px-2 text-xs text-[#5b6b7d] dark:text-[#9db2cb]"
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
                className="h-7 gap-1 px-2 text-xs text-[#5b6b7d] dark:text-[#9db2cb]"
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
            className="h-7 gap-1 px-2 text-xs text-[#8a4a4a]"
            onClick={() => onDeleteMessage(message)}
            disabled={isGenerating}
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除
          </Button>
        </div>
      </div>
      {isUser ? (
        <div className="grid h-8 w-8 place-content-center rounded-xl border border-[#d8e4f1] bg-[#ebf1f8] text-[10px] font-semibold tracking-wide text-[#3e536a] dark:border-[#355073] dark:bg-[#1a2d49] dark:text-[#b6cde6]">
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
  suggestionPrompts,
  onSelectSuggestion,
  onEditMessage,
  onDeleteMessage,
  onResendMessage
}: ChatViewProps) => {
  if (!isConfigured) {
    return (
      <section className="mx-auto flex h-full w-full max-w-[980px] items-center justify-center px-7 py-7">
        <div className="text-center">
          <h2 className="text-6xl font-semibold leading-none tracking-tight text-foreground">
            Hello, 用户名
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            请在左下角 Settings 完成渠道配置
          </p>
        </div>
      </section>
    );
  }

  if (!messages.length) {
    return (
      <section className="mx-auto flex h-full w-full max-w-[980px] flex-col px-7 pb-5 pt-7">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-16 text-center">
          <div className="mx-auto grid h-[54px] w-[54px] place-content-center rounded-[20px] border border-[#dce4ed] bg-[#f8fbff] font-mono text-sm text-[#3c4f64] dark:border-[#355073] dark:bg-[#1b2f4d] dark:text-[#c4d8ee]">
            {"{}"}
          </div>
          <h2 className="text-6xl font-semibold leading-none tracking-tight text-foreground">
            Let&apos;s build
          </h2>
          <p className="text-4xl text-muted-foreground">Mu</p>
        </div>

        <div className="mb-3 text-right text-[34px] text-[#7e8792] dark:text-[#91a6be]">Explore more</div>
        <div className="grid gap-3 md:grid-cols-3">
          {suggestionPrompts.map((prompt, index) => (
            <Button
              key={prompt}
              type="button"
              variant="outline"
              className="h-auto min-h-[114px] justify-start whitespace-normal rounded-[22px] border-[#dfe5ec] bg-[#f8fafc] px-4 py-4 text-left text-base font-normal text-[#2b3949] hover:bg-[#f3f7fb] dark:border-[#355073] dark:bg-[#162742] dark:text-[#d6e4f6] dark:hover:bg-[#1b3150]"
              onClick={() => onSelectSuggestion(prompt)}
            >
              <span className="mr-2 inline-grid h-6 w-6 place-content-center rounded-md border border-[#d5dde6] bg-white text-xs text-[#5d6a79] dark:border-[#355073] dark:bg-[#1f3352] dark:text-[#b4c9e0]">
                {index === 0 ? "G" : index === 1 ? "P" : "L"}
              </span>
              <span>{prompt}</span>
            </Button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto h-full w-full max-w-[980px] overflow-auto px-7 py-7">
      <div className="grid gap-4">
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
