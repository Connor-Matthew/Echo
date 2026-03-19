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
    assert.ok(className.includes("min-h-11"));
    assert.ok(className.includes("py-0"));

    const element = ChatSessionHeader({ title: "你好" });
    assert.ok(isValidElement(element));

    const header = element as ReactElement<{ children: ReactNode }>;
    const titleWrapper = Children.only(header.props.children) as ReactElement<{ children: ReactNode }>;
    const title = Children.only(titleWrapper.props.children) as ReactElement<{ className?: string }>;

    assert.ok(String(title.props.className).includes("text-[14px]"));
    assert.ok(String(title.props.className).includes("leading-none"));
  });
});
