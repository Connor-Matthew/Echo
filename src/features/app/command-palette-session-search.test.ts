import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSessionSearchMetadata } from "./command-palette-session-search";
import type { ChatSession } from "../../shared/contracts";

const createSession = (messages: Array<{ role: "user" | "assistant"; content: string }>): ChatSession => ({
  id: "session-1",
  title: "测试会话",
  createdAt: "2026-03-02T00:00:00.000Z",
  updatedAt: "2026-03-02T00:00:00.000Z",
  messages: messages.map((message, index) => ({
    id: `m-${index}`,
    role: message.role,
    content: message.content,
    createdAt: "2026-03-02T00:00:00.000Z"
  }))
});

describe("features/app/command-palette-session-search", () => {
  it("builds preview from latest non-empty conversational message", () => {
    const metadata = buildSessionSearchMetadata(
      createSession([
        { role: "user", content: "" },
        { role: "assistant", content: "这是最后一条有效消息，用于预览展示。" }
      ])
    );

    assert.equal(metadata.preview, "这是最后一条有效消息，用于预览展示。");
  });

  it("extracts mixed chinese and english searchable keywords", () => {
    const metadata = buildSessionSearchMetadata(
      createSession([
        { role: "user", content: "请帮我定位支付回调 timeout bug" },
        { role: "assistant", content: "我们可以先检查 webhook retry 配置和日志。" }
      ])
    );

    assert.equal(metadata.keywords.includes("timeout"), true);
    assert.equal(metadata.keywords.includes("webhook"), true);
    assert.equal(metadata.keywords.includes("支付回调"), true);
  });

  it("returns fallback preview when all messages are empty", () => {
    const metadata = buildSessionSearchMetadata(
      createSession([
        { role: "user", content: "   " },
        { role: "assistant", content: "" }
      ])
    );

    assert.equal(metadata.preview, "暂无消息内容");
  });
});
