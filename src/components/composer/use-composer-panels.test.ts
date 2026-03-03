import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractSlashCommandQuery } from "./use-composer-panels";

describe("components/composer/use-composer-panels helpers", () => {
  it("extracts slash command query from pure command input", () => {
    assert.equal(extractSlashCommandQuery("/"), "");
    assert.equal(extractSlashCommandQuery("/plan"), "plan");
    assert.equal(extractSlashCommandQuery("/plan_fast"), "plan_fast");
  });

  it("returns null for non-slash-command input", () => {
    assert.equal(extractSlashCommandQuery(" /plan"), null);
    assert.equal(extractSlashCommandQuery("/plan now"), null);
    assert.equal(extractSlashCommandQuery("hello"), null);
  });
});
