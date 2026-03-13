import { isValidElement, memo, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { Button } from "../ui/button";

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
    <div className="chat-code-block mb-2 overflow-hidden rounded-md last:mb-0">
      <div className="chat-code-block-header flex items-center justify-between px-2.5 py-1.5">
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
      <pre className="overflow-x-auto p-3.5">
        <code className="font-mono text-[13px] leading-6 text-foreground">{code}</code>
      </pre>
    </div>
  );
};

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3.5 mt-1.5 text-[1.24rem] font-semibold leading-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-1.5 text-[1.12rem] font-semibold leading-tight">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mb-2.5 mt-1.5 text-[1rem] font-semibold">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-2 mt-1.5 text-[0.95rem] font-semibold">{children}</h4>,
  p: ({ children }) => <p className="mb-2.5 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2.5 list-disc pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2.5 list-decimal pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2.5 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
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
      <code className="chat-inline-code rounded-[3px] px-1 py-[1px] font-mono text-[13px] text-foreground">
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

const MarkdownContentInner = ({ content, isUser }: { content: string; isUser: boolean }) => (
  <div
    className={[
      "chat-markdown-root break-words text-[15px]",
      isUser ? "text-foreground" : "text-foreground"
    ].join(" ")}
  >
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  </div>
);

export const MarkdownContent = memo(
  MarkdownContentInner,
  (prev, next) => prev.content === next.content && prev.isUser === next.isUser
);

MarkdownContent.displayName = "MarkdownContent";
