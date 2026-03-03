import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampInteger,
  extractModelIds,
  normalizeBaseUrl,
  parseApiKeys,
  resolveAnthropicEndpoint
} from "./utils";

describe("domain/provider/utils", () => {
  it("normalizes base url by trimming and removing trailing slashes", () => {
    assert.equal(normalizeBaseUrl("  https://api.example.com/v1/// "), "https://api.example.com/v1");
  });

  it("parses api keys with trimming, quote stripping and dedupe", () => {
    const parsed = parseApiKeys(' "k1",k2,\n"k1"\n\nk3 ');
    assert.deepEqual(parsed, ["k1", "k2", "k3"]);
  });

  it("resolves anthropic endpoints for models/messages consistently", () => {
    assert.equal(
      resolveAnthropicEndpoint("https://api.anthropic.com/v1/messages", "models"),
      "https://api.anthropic.com/v1/models"
    );
    assert.equal(
      resolveAnthropicEndpoint("https://api.anthropic.com/messages", "messages"),
      "https://api.anthropic.com/v1/messages"
    );
  });

  it("extracts and sorts model ids from mixed payload shapes", () => {
    const models = extractModelIds({
      data: [{ id: "claude-3" }, { name: "gpt-4o" }],
      models: ["gpt-4.1", { id: "claude-3" }, { name: "o3-mini" }],
      model_ids: ["gpt-4.1-mini", "gpt-4o"]
    });

    assert.deepEqual(models, ["claude-3", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "o3-mini"]);
  });

  it("clamps integer with rounding and fallback for non-finite values", () => {
    assert.equal(clampInteger(8.6, 1, 8, 3), 8);
    assert.equal(clampInteger(-2, 1, 8, 3), 1);
    assert.equal(clampInteger(Number.NaN, 1, 8, 3), 3);
  });
});
