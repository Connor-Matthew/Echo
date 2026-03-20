import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { ChatSessionHeader, getChatSessionHeaderClassName } from "./chat-session-header";

describe("features/app/chat-session-header", () => {
  it("renders a quiet single-column header that centers on the reading stage", () => {
    const element = ChatSessionHeader({ title: "你好" });

    assert.ok(isValidElement(element));
    const header = element as ReactElement<{ className?: string; children: ReactNode }>;
    assert.match(String(header.props.className), /\bchat-reading-stage\b/);

    const children = Children.toArray(header.props.children);
    assert.equal(children.length, 1);
  });

  it("uses a more compact header height and title scale", () => {
    const className = getChatSessionHeaderClassName();
    assert.ok(className.includes("min-h-14"));
    assert.ok(className.includes("border-border/45"));
    assert.ok(className.includes("pt-2"));
    assert.ok(className.includes("pb-3"));

    const element = ChatSessionHeader({ title: "你好" });
    assert.ok(isValidElement(element));

    const header = element as ReactElement<{ children: ReactNode }>;
    const titleWrapper = Children.only(header.props.children) as ReactElement<{ children: ReactNode }>;
    const title = Children.only(titleWrapper.props.children) as ReactElement<{ className?: string }>;

    assert.ok(String(title.props.className).includes("text-[15px]"));
    assert.ok(String(title.props.className).includes("tracking-[-0.01em]"));
    assert.ok(String(title.props.className).includes("text-foreground/94"));
  });
});
