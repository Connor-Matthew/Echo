import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitStreamBufferForCommit } from "./stream-text-utils";

describe("lib/stream-text-utils", () => {
  it("holds short trailing fragments until a semantic boundary appears", () => {
    assert.deepEqual(splitStreamBufferForCommit("Hello wor"), {
      commit: "",
      remainder: "Hello wor"
    });

    assert.deepEqual(splitStreamBufferForCommit("Hello world, this keeps flowing"), {
      commit: "Hello world, this keeps ",
      remainder: "flowing"
    });
  });

  it("flushes the entire remainder when forced", () => {
    assert.deepEqual(splitStreamBufferForCommit("final tail", { force: true }), {
      commit: "final tail",
      remainder: ""
    });
  });
});
