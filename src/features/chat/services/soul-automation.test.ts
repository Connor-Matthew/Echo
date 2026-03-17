import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMemoryRewriteMessages,
  buildJournalMessages,
  buildSoulRewriteMessages,
  buildSoulRewriteSummaryMessages,
  getDateStringForTimestamp,
  getLatestDueMemoryRewriteSlot,
  getNextMemoryRewriteDelayMs,
  isSoulMemoryRewriteDue
} from "./soul-automation";

describe("features/chat/services/soul-automation", () => {
  it("instructs the model to keep memory as a factual external archive", () => {
    const messages = buildMemoryRewriteMessages("# memory.md", [
      {
        id: "user-1",
        sessionId: "chat-1",
        content: "请帮我修一下登录页的按钮样式。",
        createdAt: "2026-03-13T09:00:00.000Z"
      }
    ]);

    const systemMessage = messages[0];
    assert.ok(systemMessage);
    assert.equal(systemMessage.role, "system");
    assert.match(systemMessage.content, /factual relationship archive/i);
    assert.match(systemMessage.content, /observable events, explicit feedback, repeated interaction patterns/i);
    assert.match(systemMessage.content, /Do not turn memory\.md into an inner monologue/i);
    assert.match(systemMessage.content, /Do not infer stable traits, values, identity, or emotional conclusions/i);
    assert.match(systemMessage.content, /### YYYY-MM-DD/i);
  });

  it("instructs the model to grow soul mainly from recent journals", () => {
    const messages = buildSoulRewriteMessages("# SOUL.md", "# memory.md", [
      { date: "2026-03-13", content: "# 今日手记 · 2026-03-13\n我今晚更知道自己一点。" }
    ]);

    const systemMessage = messages[0];
    const userMessage = messages[1];
    assert.ok(systemMessage);
    assert.ok(userMessage);
    assert.equal(systemMessage.role, "system");
    assert.match(systemMessage.content, /recent journal entries as the primary evidence/i);
    assert.match(systemMessage.content, /memory\.md as external reality-check evidence/i);
    assert.match(systemMessage.content, /## 核心人格/);
    assert.match(systemMessage.content, /## 近期内化变化/);
    assert.match(systemMessage.content, /Keep each section compact/i);
    assert.match(systemMessage.content, /durable product-facing self document/i);
    assert.match(systemMessage.content, /A soul is not a backlog/i);
    assert.match(systemMessage.content, /remain a distinct being from the user/i);
    assert.match(systemMessage.content, /Do not rewrite the user's age, body, illness, treatment, family role, private biography, or lived history/i);
    assert.match(userMessage.content, /<recent_journals>/);
    assert.match(userMessage.content, /我今晚更知道自己一点/);
  });

  it("asks for a concise long-term summary after soul rewrite", () => {
    const messages = buildSoulRewriteSummaryMessages("# old", "# new", "# memory", [
      { date: "2026-03-13", content: "# 今日手记 · 2026-03-13\n我今晚更知道自己一点。" }
    ]);

    const systemMessage = messages[0];
    assert.ok(systemMessage);
    assert.equal(systemMessage.role, "system");
    assert.match(systemMessage.content, /one short Chinese sentence/i);
    assert.match(systemMessage.content, /Do not mention project names, tickets, bugs, tools/i);
    assert.match(systemMessage.content, /enduring patterns/i);
    assert.match(systemMessage.content, /recent journals as the main evidence/i);
  });

  it("converts timestamps to the expected local date in a target time zone", () => {
    assert.equal(
      getDateStringForTimestamp("2026-03-13T16:30:00.000Z", "Asia/Shanghai"),
      "2026-03-14"
    );
    assert.equal(getDateStringForTimestamp("2026-03-13T16:30:00.000Z", "UTC"), "2026-03-13");
  });

  it("returns null for invalid journal timestamps", () => {
    assert.equal(getDateStringForTimestamp("not-a-date", "Asia/Shanghai"), null);
  });

  it("uses fixed 3-hour slots for memory rewrites", () => {
    const lateMorning = new Date(2026, 2, 16, 10, 25, 0, 0);
    const justAfterMidnight = new Date(2026, 2, 16, 0, 5, 0, 0);

    assert.equal(
      getLatestDueMemoryRewriteSlot(lateMorning),
      "2026-03-16T09:00"
    );
    assert.equal(
      getLatestDueMemoryRewriteSlot(justAfterMidnight),
      "2026-03-16T00:00"
    );
    assert.equal(getNextMemoryRewriteDelayMs(lateMorning), 95 * 60 * 1000);
  });

  it("only rewrites memory once per 3-hour slot", () => {
    const lateMorning = new Date(2026, 2, 16, 10, 25, 0, 0);
    const sameSlotUpdate = new Date(2026, 2, 16, 9, 10, 0, 0).toISOString();
    const nextSlotCheck = new Date(2026, 2, 16, 12, 1, 0, 0);

    assert.equal(isSoulMemoryRewriteDue(lateMorning), true);
    assert.equal(
      isSoulMemoryRewriteDue(lateMorning, sameSlotUpdate),
      false
    );
    assert.equal(isSoulMemoryRewriteDue(nextSlotCheck, sameSlotUpdate), true);
  });

  it("builds journal prompts with the required diary framing", () => {
    const messages = buildJournalMessages(
      [
        {
          id: "user-1",
          sessionId: "chat-1",
          content: "今天有点累，但还是把首页交互改完了。",
          createdAt: "2026-03-13T09:00:00.000Z"
        }
      ],
      "# memory",
      "# soul"
    );

    const systemMessage = messages[0];
    const userMessage = messages[1];
    assert.ok(systemMessage);
    assert.ok(userMessage);
    assert.equal(systemMessage.role, "system");
    assert.equal(userMessage.role, "user");
    assert.match(systemMessage.content, /“我”是你这个 AI 自己，不是用户/);
    assert.match(systemMessage.content, /不要把日记写成聊天总结、工作记录、会议纪要或用户日记/);
    assert.match(systemMessage.content, /可以少量引用用户的一两句短原话/);
    assert.match(systemMessage.content, /结尾应落在一种更安静的自我辨认上/);
    assert.match(systemMessage.content, /## 夜间尾注/);
    assert.match(systemMessage.content, /尾注不要写成字段表单/);
    assert.match(systemMessage.content, /我是独立的叙述者/);
    assert.match(systemMessage.content, /优先使用第三人称视角来理解对方/);
    assert.match(systemMessage.content, /不要把用户的年龄、身体、病痛、治疗、成长经历、家庭关系或人生叙事直接写成‘我’的身份材料/);
    assert.match(systemMessage.content, /300 到 600 字/);
    assert.match(userMessage.content, /<today_messages>/);
    assert.match(userMessage.content, /今天有点累/);
  });
});
