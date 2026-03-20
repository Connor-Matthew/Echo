import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownContent } from "./message-markdown-content";

describe("components/chat/message-markdown-content", () => {
  it("renders LaTeX delimiters instead of leaving them as plain text", () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content={[
          "如果我们有一个函数 \\( f(x, y) \\)，那么它的梯度写作：",
          "",
          "\\[",
          "\\nabla f = \\left( \\frac{\\partial f}{\\partial x}, \\frac{\\partial f}{\\partial y} \\right)",
          "\\]",
          "",
          "注：\\( \\frac{\\partial f}{\\partial x} \\) 是偏导数。"
        ].join("\n")}
        isUser={false}
      />
    );

    assert.match(markup, /katex/);
    assert.doesNotMatch(markup, /\\\[/);
    assert.doesNotMatch(markup, /\\\]/);
    assert.doesNotMatch(markup, /\\\(/);
    assert.doesNotMatch(markup, /\\\)/);
  });

  it("keeps LaTeX delimiters literal inside fenced code blocks", () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content={["```tex", "\\[", "\\nabla f", "\\]", "```"].join("\n")}
        isUser={false}
      />
    );

    assert.match(markup, /\\\[/);
    assert.match(markup, /\\nabla f/);
    assert.match(markup, /\\\]/);
    assert.doesNotMatch(markup, /katex-display/);
  });

  it("renders plain text as separate blocks in line mode", () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent content={["第一行", "第二行"].join("\n")} isUser={false} renderMode="line" />
    );

    assert.match(markup, /第一行/);
    assert.match(markup, /第二行/);
    assert.match(markup, /data-render-mode="line"/);
    assert.match(markup, /<p class="mb-2\.5 last:mb-0">第一行<\/p><p class="mb-2\.5 last:mb-0">第二行<\/p>/);
  });

  it("uses smaller spacer blocks in line mode to keep chat rendering compact", () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent content={["第一段", "", "第二段"].join("\n")} isUser={false} renderMode="line" />
    );

    assert.match(markup, /class="h-2"/);
  });

  it("keeps block formulas intact in line mode", () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content={["说明文字", "\\[", "\\nabla f = x + y", "\\]", "收尾文字"].join("\n")}
        isUser={false}
        renderMode="line"
      />
    );

    assert.match(markup, /data-render-mode="line"/);
    assert.match(markup, /katex-display/);
    assert.match(markup, /说明文字/);
    assert.match(markup, /收尾文字/);
    assert.doesNotMatch(markup, /\\\[/);
    assert.doesNotMatch(markup, /\\\]/);
  });

  it("renders completed markdown blocks while keeping the unfinished streaming tail as plain text", () => {
    const markup = renderToStaticMarkup(
      <MarkdownContent
        content={
          [
            "## 已完成标题",
            "",
            "- 第一项",
            "- 第二项",
            "",
            "```ts",
            "const answer = 42;",
            "```",
            "",
            "未完成的 **粗体"
          ].join("\n")
        }
        isUser={false}
        streaming
        renderMode="line"
      />
    );

    assert.match(markup, /<h2 class="[^"]*">已完成标题<\/h2>/);
    assert.match(markup, /<ul class="[^"]*">/);
    assert.match(markup, /const answer = 42;/);
    assert.match(markup, /未完成的 \*\*粗体/);
    assert.doesNotMatch(markup, /<strong>粗体<\/strong>/);
  });
});
