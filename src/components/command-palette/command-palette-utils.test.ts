import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCommandHighlightParts,
  filterCommandPaletteItems,
  formatCommandShortcut,
  groupCommandPaletteItems,
  sortCommandPaletteItemsByRecent,
  type CommandPaletteSearchItem
} from "./command-palette-utils";

const sampleCommands: CommandPaletteSearchItem[] = [
  { id: "chat", title: "切换到 Chat", keywords: ["聊天", "chat"] },
  { id: "agent", title: "切换到 Agent", keywords: ["agent", "代理"] },
  { id: "new", title: "新建聊天", keywords: ["new", "create"] },
  { id: "settings", title: "打开设置", keywords: ["settings"], aliases: ["shezhi", "sz"] }
];

describe("components/command-palette/command-palette-utils", () => {
  it("prioritizes title prefix matches over contains matches", () => {
    const items = filterCommandPaletteItems(sampleCommands, "切换");
    assert.equal(items[0]?.id, "chat");
    assert.equal(items[1]?.id, "agent");
  });

  it("matches commands by keywords", () => {
    const items = filterCommandPaletteItems(sampleCommands, "create");
    assert.equal(items.length, 1);
    assert.equal(items[0]?.id, "new");
  });

  it("matches commands by aliases and english subsequence fuzzy query", () => {
    const aliasMatched = filterCommandPaletteItems(sampleCommands, "shezhi");
    assert.equal(aliasMatched[0]?.id, "settings");

    const fuzzyMatched = filterCommandPaletteItems(sampleCommands, "stngs");
    assert.equal(fuzzyMatched[0]?.id, "settings");
  });

  it("builds highlighted parts for first match", () => {
    const parts = buildCommandHighlightParts("切换到 Chat", "chat");
    assert.equal(parts.length, 2);
    assert.equal(parts[1]?.text, "Chat");
    assert.equal(parts[1]?.matched, true);
  });

  it("formats shortcuts for mac and non-mac platforms", () => {
    assert.equal(formatCommandShortcut("mod+k", true), "⌘K");
    assert.equal(formatCommandShortcut("mod+shift+k", true), "⌘⇧K");
    assert.equal(formatCommandShortcut("mod+k", false), "Ctrl+K");
  });

  it("sorts commands by recent command ids while keeping others stable", () => {
    const sorted = sortCommandPaletteItemsByRecent(sampleCommands, ["new", "chat"]);
    assert.equal(sorted[0]?.id, "new");
    assert.equal(sorted[1]?.id, "chat");
    assert.equal(sorted[2]?.id, "agent");
  });

  it("groups commands by group name while preserving order", () => {
    const grouped = groupCommandPaletteItems([
      { id: "1", title: "A", group: "导航" },
      { id: "2", title: "B", group: "操作" },
      { id: "3", title: "C", group: "导航" },
      { id: "4", title: "D" }
    ]);

    assert.equal(grouped.length, 3);
    assert.equal(grouped[0]?.group, "导航");
    assert.equal(grouped[0]?.items.length, 2);
    assert.equal(grouped[1]?.group, "操作");
    assert.equal(grouped[2]?.group, "其他");
  });
});
