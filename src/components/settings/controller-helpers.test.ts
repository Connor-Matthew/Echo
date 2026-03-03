import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  combineStatusMessages,
  toMcpStatusMap,
  toProviderTypeValue
} from "./controller-helpers";

describe("components/settings/controller-helpers", () => {
  it("maps provider type values with openai fallback", () => {
    assert.equal(toProviderTypeValue("anthropic"), "anthropic");
    assert.equal(toProviderTypeValue("acp"), "acp");
    assert.equal(toProviderTypeValue("claude-agent"), "claude-agent");
    assert.equal(toProviderTypeValue("unknown-provider"), "openai");
  });

  it("converts mcp status list into keyed map", () => {
    const map = toMcpStatusMap([
      {
        name: "local-fs",
        authStatus: "unsupported",
        toolCount: 3,
        resourceCount: 1,
        resourceTemplateCount: 0
      }
    ]);

    assert.equal(Object.keys(map).length, 1);
    assert.equal(map["local-fs"]?.toolCount, 3);
  });

  it("combines status messages while trimming empty entries", () => {
    assert.equal(
      combineStatusMessages("  config refreshed ", "", " status synced  "),
      "config refreshed status synced"
    );
  });
});
