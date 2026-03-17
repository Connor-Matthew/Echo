import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUserDailyNoteMessages,
  buildUserProfileRewriteMessages,
  buildUserProfileSystemMessage,
  getNextUserProfileRefreshDelayMs,
  parseUserProfileRewriteResponse
} from "./profile-automation";

describe("features/profile/services/profile-automation", () => {
  it("builds daily note prompts with factual user-summary framing", () => {
    const messages = buildUserDailyNoteMessages("2026-03-17", [
      {
        id: "user-1",
        sessionId: "chat-1",
        content: "今天主要在整理新的用户画像方案，还在想要不要上数据库。",
        createdAt: "2026-03-17T09:00:00.000Z"
      }
    ]);

    const systemMessage = messages[0];
    const userMessage = messages[1];
    assert.ok(systemMessage);
    assert.ok(userMessage);
    assert.match(systemMessage.content, /local daily note about the user/i);
    assert.match(systemMessage.content, /Do not write as the AI/i);
    assert.match(systemMessage.content, /Do not turn one day into a stable personality judgment/i);
    assert.match(systemMessage.content, /# 用户日摘要 · 2026-03-17/);
    assert.match(userMessage.content, /今天主要在整理新的用户画像方案/);
  });

  it("builds rewrite prompts that enforce the three profile layers", () => {
    const messages = buildUserProfileRewriteMessages("# 用户画像快照", [
      {
        id: "note-1",
        date: "2026-03-17",
        summaryMarkdown: "# 用户日摘要 · 2026-03-17\n## 今日在做什么\n- 继续整理产品结构。",
        sourceMessageCount: 3,
        source: "auto",
        createdAt: "2026-03-17T22:00:00.000Z",
        updatedAt: "2026-03-17T22:00:00.000Z"
      }
    ]);

    const systemMessage = messages[0];
    assert.ok(systemMessage);
    assert.match(systemMessage.content, /exactly three layers: preferences, background, relationship/i);
    assert.match(systemMessage.content, /Do not invent dramatic intimacy/i);
    assert.match(systemMessage.content, /strict JSON only/i);
    assert.match(messages[1].content, /<recent_daily_notes>/);
    assert.match(messages[1].content, /继续整理产品结构/);
  });

  it("parses strict JSON profile rewrites into item drafts", () => {
    const items = parseUserProfileRewriteResponse(`{
      "preferences": [
        {
          "title": "偏好直接推进",
          "description": "更喜欢把讨论尽快推进到可执行方案。",
          "confidence": 0.82,
          "evidence_dates": ["2026-03-16", "2026-03-17"],
          "evidence_summary": "连续两天都在把讨论收束到执行路径。"
        }
      ],
      "background": [],
      "relationship": [
        {
          "title": "希望协作式讨论",
          "description": "更接受一起推敲方向，而不是被单方面主导。",
          "confidence": 0.76,
          "evidence_dates": ["2026-03-17"],
          "evidence_summary": "在讨论设计时持续要求先对齐。"
        }
      ]
    }`);

    assert.equal(items.length, 2);
    assert.equal(items[0].layer, "preferences");
    assert.equal(items[0].evidence.length, 2);
    assert.equal(items[1].layer, "relationship");
  });

  it("wraps the current snapshot as a cautious system block", () => {
    const message = buildUserProfileSystemMessage("# 用户画像快照\n- 偏好克制表达");
    assert.match(message, /保守的理解辅助/);
    assert.match(message, /<user_profile>/);
    assert.match(message, /偏好克制表达/);
  });

  it("schedules the next profile refresh at the nightly slot", () => {
    const evening = new Date(2026, 2, 17, 22, 30, 0, 0);
    const afterSlot = new Date(2026, 2, 17, 23, 15, 0, 0);

    assert.equal(getNextUserProfileRefreshDelayMs(evening), 30 * 60 * 1000);
    assert.equal(getNextUserProfileRefreshDelayMs(afterSlot), 23 * 60 * 60 * 1000 + 45 * 60 * 1000);
  });
});
