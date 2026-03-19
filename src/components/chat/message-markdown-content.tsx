import { isValidElement, memo, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { MarkdownRenderMode } from "../../shared/contracts";
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

const countRepeatedChar = (value: string, char: string, startIndex: number) => {
  let index = startIndex;
  while (value[index] === char) {
    index += 1;
  }
  return index - startIndex;
};

const normalizeInlineMathDelimiters = (line: string) => {
  let normalized = "";
  let index = 0;
  let activeCodeDelimiterLength = 0;

  while (index < line.length) {
    if (line[index] === "`") {
      const delimiterLength = countRepeatedChar(line, "`", index);
      normalized += line.slice(index, index + delimiterLength);
      if (activeCodeDelimiterLength === 0) {
        activeCodeDelimiterLength = delimiterLength;
      } else if (activeCodeDelimiterLength === delimiterLength) {
        activeCodeDelimiterLength = 0;
      }
      index += delimiterLength;
      continue;
    }

    if (activeCodeDelimiterLength === 0 && line.startsWith("\\(", index)) {
      const closingIndex = line.indexOf("\\)", index + 2);
      if (closingIndex !== -1) {
        const expression = line.slice(index + 2, closingIndex).trim();
        normalized += expression ? `$${expression}$` : "\\(\\)";
        index = closingIndex + 2;
        continue;
      }
    }

    normalized += line[index];
    index += 1;
  }

  return normalized;
};

const normalizeMathMarkdown = (content: string) => {
  const lines = content.split("\n");
  const normalizedLines: string[] = [];
  let inFencedCodeBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trimStart();

    if (trimmed.startsWith("```")) {
      inFencedCodeBlock = !inFencedCodeBlock;
      normalizedLines.push(line);
      continue;
    }

    if (inFencedCodeBlock) {
      normalizedLines.push(line);
      continue;
    }

    if (line.trim() === "\\[") {
      const blockLines: string[] = [];
      let closingIndex = index + 1;

      while (closingIndex < lines.length && (lines[closingIndex] ?? "").trim() !== "\\]") {
        blockLines.push(lines[closingIndex] ?? "");
        closingIndex += 1;
      }

      if (closingIndex < lines.length) {
        normalizedLines.push("$$");
        normalizedLines.push(...blockLines);
        normalizedLines.push("$$");
        index = closingIndex;
        continue;
      }
    }

    normalizedLines.push(normalizeInlineMathDelimiters(line));
  }

  return normalizedLines.join("\n");
};

type MarkdownSegment =
  | {
      kind: "spacer";
      key: string;
    }
  | {
      kind: "markdown";
      key: string;
      content: string;
    };

const splitMarkdownIntoLineSegments = (content: string): MarkdownSegment[] => {
  const lines = content.split("\n");
  const segments: MarkdownSegment[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trimStart();

    if (!line.trim()) {
      segments.push({ kind: "spacer", key: `spacer-${index}` });
      continue;
    }

    if (trimmed.startsWith("```")) {
      const blockLines = [line];
      let closingIndex = index + 1;

      while (closingIndex < lines.length) {
        const candidate = lines[closingIndex] ?? "";
        blockLines.push(candidate);
        if (candidate.trimStart().startsWith("```")) {
          break;
        }
        closingIndex += 1;
      }

      segments.push({
        kind: "markdown",
        key: `code-${index}`,
        content: blockLines.join("\n")
      });
      index = Math.min(closingIndex, lines.length - 1);
      continue;
    }

    if (line.trim() === "$$") {
      const blockLines = [line];
      let closingIndex = index + 1;

      while (closingIndex < lines.length) {
        const candidate = lines[closingIndex] ?? "";
        blockLines.push(candidate);
        if (candidate.trim() === "$$") {
          break;
        }
        closingIndex += 1;
      }

      segments.push({
        kind: "markdown",
        key: `math-${index}`,
        content: blockLines.join("\n")
      });
      index = Math.min(closingIndex, lines.length - 1);
      continue;
    }

    segments.push({
      kind: "markdown",
      key: `line-${index}`,
      content: line
    });
  }

  return segments;
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
    <div className="chat-code-block mb-3 overflow-hidden last:mb-0">
      <div className="chat-code-block-header flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {language || "code"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-full px-2.5 text-[11px] text-muted-foreground"
          onClick={() => {
            void copyCode();
          }}
        >
          {copied ? "已复制" : "复制代码"}
        </Button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5">
        <code className="font-mono text-[13px] leading-6 text-foreground">{code}</code>
      </pre>
    </div>
  );
};

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-4 mt-1.5 text-[1.34rem] font-semibold leading-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3.5 mt-1.5 text-[1.16rem] font-semibold leading-tight">{children}</h2>
  ),
  h3: ({ children }) => <h3 className="mb-2.5 mt-1.5 text-[1rem] font-semibold">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-2 mt-1.5 text-[0.95rem] font-semibold">{children}</h4>,
  p: ({ children }) => <p className="mb-3.5 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3.5 list-disc pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3.5 list-decimal pl-5 last:mb-0">{children}</ol>,
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

const MarkdownContentInner = ({
  content,
  isUser,
  streaming = false,
  renderMode = "paragraph"
}: {
  content: string;
  isUser: boolean;
  streaming?: boolean;
  renderMode?: MarkdownRenderMode;
}) => {
  const rootClassName = [
    "chat-markdown-root break-words text-[15px]",
    streaming ? "chat-streaming-markdown whitespace-pre-wrap" : "",
    isUser ? "text-foreground" : "text-foreground"
  ]
    .filter(Boolean)
    .join(" ");

  if (streaming) {
    return (
      <div className={rootClassName} data-render-mode={renderMode}>
        {content}
      </div>
    );
  }

  const normalizedContent = normalizeMathMarkdown(content);
  const renderMarkdown = (markdown: string, key?: string) => (
    <ReactMarkdown
      key={key}
      remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={markdownComponents}
    >
      {markdown}
    </ReactMarkdown>
  );

  const lineSegments = renderMode === "line" ? splitMarkdownIntoLineSegments(normalizedContent) : [];

  return (
    <div className={rootClassName} data-render-mode={renderMode}>
      {renderMode === "line"
        ? lineSegments.map((segment) =>
            segment.kind === "spacer" ? (
              <div key={segment.key} aria-hidden="true" className="h-3" />
            ) : (
              renderMarkdown(segment.content, segment.key)
            )
          )
        : renderMarkdown(normalizedContent)}
    </div>
  );
};

export const MarkdownContent = memo(
  MarkdownContentInner,
  (prev, next) =>
    prev.content === next.content &&
    prev.isUser === next.isUser &&
    Boolean(prev.streaming) === Boolean(next.streaming) &&
    prev.renderMode === next.renderMode
);

MarkdownContent.displayName = "MarkdownContent";
