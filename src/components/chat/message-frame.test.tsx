import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { getMessageActionBarClassName } from "./message-action-bar";
import { getMessageSurfaceClassName, MessageFrame } from "./message-frame";
import type { ChatMessage } from "../../shared/contracts";
import type { PermissionRequest } from "./conversation-types";

const createMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "message-1",
  role: "user",
  content: "嘿嘿",
  createdAt: "2026-03-19T00:00:00.000Z",
  ...overrides
});

const createPermissionRequest = (
  overrides: Partial<PermissionRequest> = {}
): PermissionRequest => ({
  runId: "run-1",
  sessionId: "agent-1",
  requestId: "req-1",
  toolName: "Bash",
  reason: "Blocked path: /Users/mac/Desktop",
  blockedPath: "/Users/mac/Desktop",
  supportsAlwaysAllow: true,
  resolving: false,
  ...overrides
});

describe("components/chat/message-frame", () => {
  it("keeps user bubbles visually compact", () => {
    const className = getMessageSurfaceClassName(true);

    assert.match(className, /\bchat-message-surface-user\b/);
    assert.match(className, /\bpx-3\b/);
    assert.match(className, /\bpy-2\b/);
    assert.match(className, /\bsm:px-4\b/);
    assert.doesNotMatch(className, /(?:^|\s)px-4(?:\s|$)/);
    assert.doesNotMatch(className, /(?:^|\s)py-3(?:\s|$)/);
    assert.doesNotMatch(className, /\bsm:px-5\b/);
  });

  it("keeps the action bar tucked closer to the message bubble", () => {
    const userClassName = getMessageActionBarClassName(true);
    const assistantClassName = getMessageActionBarClassName(false);

    assert.match(userClassName, /\bmt-0\.5\b/);
    assert.match(assistantClassName, /\bmt-0\.5\b/);
    assert.doesNotMatch(userClassName, /\bmt-1\b/);
    assert.doesNotMatch(assistantClassName, /\bmt-1\b/);
    assert.match(userClassName, /\bml-auto\b/);
    assert.match(assistantClassName, /\bjustify-start\b/);
  });

  it("uses tighter action buttons for both user and assistant messages", () => {
    const markup = renderToStaticMarkup(
      <>
        <MessageFrame
          message={createMessage()}
          isGenerating={false}
          isTopSnapActive={false}
          activeGeneratingAssistantId={null}
          mode="chat"
          markdownRenderMode="paragraph"
          onEditMessage={() => {}}
          onDeleteMessage={() => {}}
          onResendMessage={() => {}}
        />
        <MessageFrame
          message={createMessage({ id: "message-2", role: "assistant", content: "收到" })}
          isGenerating={false}
          isTopSnapActive={false}
          activeGeneratingAssistantId={null}
          mode="chat"
          markdownRenderMode="paragraph"
          onEditMessage={() => {}}
          onDeleteMessage={() => {}}
          onResendMessage={() => {}}
        />
      </>
    );

    assert.match(markup, /class="[^"]*h-6 gap-1 rounded-full px-2 text-\[10\.5px\] text-muted-foreground[^"]*"/);
    assert.match(markup, /class="[^"]*h-6 gap-1 rounded-full px-2 text-\[10\.5px\] text-destructive\/88[^"]*"/);
  });

  it("renders user messages without the trailing avatar badge", () => {
    const markup = renderToStaticMarkup(
      <MessageFrame
        message={createMessage()}
        isGenerating={false}
        isTopSnapActive={false}
        activeGeneratingAssistantId={null}
        mode="chat"
        markdownRenderMode="paragraph"
        onEditMessage={() => {}}
        onDeleteMessage={() => {}}
        onResendMessage={() => {}}
      />
    );

    assert.match(markup, /嘿嘿/);
    assert.doesNotMatch(markup, />U<\/div>/);
  });

  it("renders agent permission requests only once inside the tool timeline", () => {
    const markup = renderToStaticMarkup(
      <MessageFrame
        message={createMessage({
          id: "message-3",
          role: "assistant",
          content: "我来查看一下桌面的文件。",
          toolCalls: [
            {
              id: "permission:req-1",
              serverName: "PERMISSION",
              toolName: "Bash",
              status: "pending",
              message: "Blocked path: /Users/mac/Desktop\n/Users/mac/Desktop"
            }
          ]
        })}
        isGenerating={true}
        isTopSnapActive={false}
        activeGeneratingAssistantId="message-3"
        mode="agent"
        markdownRenderMode="paragraph"
        permissionRequest={createPermissionRequest()}
        onResolvePermission={() => {}}
        onEditMessage={() => {}}
        onDeleteMessage={() => {}}
        onResendMessage={() => {}}
      />
    );

    assert.equal(markup.match(/权限请求/g)?.length ?? 0, 1);
    assert.match(markup, />允许</);
    assert.match(markup, />始终允许</);
    assert.match(markup, />拒绝</);
  });
});
