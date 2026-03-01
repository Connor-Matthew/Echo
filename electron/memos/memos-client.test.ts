import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from "../../src/shared/contracts";
import { addMemosMessage, searchMemosMemory, testMemosConnection } from "./memos-client";

const createSettings = (overrides?: Partial<AppSettings>): AppSettings =>
  normalizeSettings({
    ...DEFAULT_SETTINGS,
    ...overrides,
    memos: {
      ...DEFAULT_SETTINGS.memos,
      ...(overrides?.memos ?? {})
    }
  });

describe("memos-client", () => {
  it("returns disabled result when memos is off", async () => {
    const result = await searchMemosMemory({
      settings: createSettings({ memos: { ...DEFAULT_SETTINGS.memos, enabled: false } }),
      query: "hello",
      conversationId: "c1"
    });

    assert.equal(result.ok, false);
    assert.equal(result.message, "MemOS is disabled.");
    assert.deepEqual(result.memories, []);
  });

  it("skips empty search query without calling fetch", async () => {
    const settings = createSettings({
      memos: {
        ...DEFAULT_SETTINGS.memos,
        enabled: true,
        apiKey: "k",
        userId: "u"
      }
    });
    const originalFetch = globalThis.fetch;
    let called = 0;
    globalThis.fetch = (async () => {
      called += 1;
      return new Response("{}");
    }) as typeof fetch;

    try {
      const result = await searchMemosMemory({
        settings,
        query: "   ",
        conversationId: "c2"
      });

      assert.equal(result.ok, true);
      assert.equal(result.message, "Skipped empty query.");
      assert.equal(called, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("parses memory list from successful memos search response", async () => {
    const settings = createSettings({
      memos: {
        ...DEFAULT_SETTINGS.memos,
        enabled: true,
        apiKey: "k",
        userId: "u"
      }
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            memory_detail_list: [{ memory_key: "name", memory_value: "Echo" }],
            preference_detail_list: [{ preference: "likes coffee", reasoning: "morning routine" }]
          }
        }),
        { status: 200 }
      )) as typeof fetch;

    try {
      const result = await searchMemosMemory({
        settings,
        query: "profile",
        conversationId: "c3"
      });

      assert.equal(result.ok, true);
      assert.equal(result.memories.length, 2);
      assert.ok(result.memories.includes("name: Echo"));
      assert.ok(result.memories.includes("likes coffee (morning routine)"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns skip message when add payload is missing user or assistant content", async () => {
    const settings = createSettings({
      memos: {
        ...DEFAULT_SETTINGS.memos,
        enabled: true,
        apiKey: "k",
        userId: "u"
      }
    });
    const result = await addMemosMessage({
      settings,
      conversationId: "c4",
      userMessage: "   ",
      assistantMessage: "reply"
    });

    assert.equal(result.ok, false);
    assert.equal(result.message, "Skipping MemOS add because user/assistant content is empty.");
  });

  it("fails memos connection test when memos is not enabled", async () => {
    const result = await testMemosConnection(createSettings());
    assert.equal(result.ok, false);
    assert.equal(result.message, "Please enable MemOS first.");
  });
});
