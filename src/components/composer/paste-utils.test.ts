import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferPastedFileExtension,
  shouldConvertPastedTextToFile,
  toPastedTextFile
} from "./paste-utils";

describe("components/composer/paste-utils", () => {
  it("detects long plain text as file-worthy paste", () => {
    const longText = "a".repeat(1500);
    assert.equal(shouldConvertPastedTextToFile(longText), true);
  });

  it("keeps short plain text as normal paste", () => {
    assert.equal(shouldConvertPastedTextToFile("hello world"), false);
  });

  it("infers extension from fenced language and structured text", () => {
    assert.equal(inferPastedFileExtension("```ts\nconst a = 1;\n```"), "ts");
    assert.equal(inferPastedFileExtension('{"ok":true}'), "json");
    assert.equal(inferPastedFileExtension("# title\n- item"), "md");
  });

  it("creates timestamped file with inferred mime type", async () => {
    const file = toPastedTextFile('{"hello":"world"}', new Date("2026-03-02T01:02:03.000Z"));
    assert.equal(file.name, "pasted-20260302010203.json");
    assert.ok(file.type.startsWith("application/json"));
    assert.equal(await file.text(), '{"hello":"world"}');
  });
});
