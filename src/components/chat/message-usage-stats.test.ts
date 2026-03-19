import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  getMessageUsageItemClassName,
  getMessageUsageLabelClassName,
  getMessageUsageStatsClassName,
  MessageUsageStats
} from "./message-usage-stats";

describe("components/chat/message-usage-stats", () => {
  it("keeps token stats quiet until the message is hovered", () => {
    const className = getMessageUsageStatsClassName("provider");

    assert.match(className, /\bmd:opacity-0\b/);
    assert.match(className, /\bmd:group-hover:opacity-100\b/);
    assert.match(className, /\btext-muted-foreground\b/);
    assert.match(className, /\bmt-1\.5\b/);
    assert.doesNotMatch(className, /\bmt-2\.5\b/);
    assert.match(className, /\bgap-1\.5\b/);
    assert.doesNotMatch(className, /\bgap-2\b/);
  });

  it("uses tighter spacing for each usage item and label", () => {
    assert.match(getMessageUsageItemClassName(), /\bgap-0\.5\b/);
    assert.doesNotMatch(getMessageUsageItemClassName(), /\bgap-1\b/);

    assert.match(getMessageUsageLabelClassName(), /tracking-\[0\.01em\]/);
    assert.doesNotMatch(getMessageUsageLabelClassName(), /\btracking-wide\b/);
  });

  it("renders compact usage stats markup", () => {
    const markup = renderToStaticMarkup(
      createElement(MessageUsageStats, {
        usage: {
          inputTokens: 952,
          outputTokens: 32,
          totalTokens: 984,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          source: "provider"
        },
        formatTokenCount: (value: number) => String(value)
      })
    );

    assert.match(markup, /class="[^"]*\bgap-1\.5\b[^"]*"/);
    assert.match(markup, /class="[^"]*\bgap-0\.5\b[^"]*"/);
    assert.match(markup, /class="[^"]*tracking-\[0\.01em\][^"]*">cache</);
    assert.match(markup, /class="[^"]*tracking-\[0\.01em\][^"]*">CW</);
  });
});
