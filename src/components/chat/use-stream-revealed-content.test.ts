import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveStreamRevealCommitLength,
  resolveStreamRevealCharsPerSecond,
  resolveStreamRevealStep
} from "./use-stream-revealed-content";

describe("components/chat/use-stream-revealed-content", () => {
  it("selects reveal speed by remaining content length", () => {
    assert.equal(resolveStreamRevealCharsPerSecond(900), 6400);
    assert.equal(resolveStreamRevealCharsPerSecond(400), 5200);
    assert.equal(resolveStreamRevealCharsPerSecond(120), 4200);
  });

  it("computes reveal step with max-step and carry behavior", () => {
    const near = (actual: number, expected: number) => {
      assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} not near ${expected}`);
    };

    const first = resolveStreamRevealStep(0.6, 100);
    assert.equal(first.step, 0);
    near(first.nextCarry, 0.6);

    const second = resolveStreamRevealStep(10.9, 100);
    assert.equal(second.step, 10);
    near(second.nextCarry, 0.9);

    const third = resolveStreamRevealStep(99.2, 100);
    assert.equal(third.step, 99);
    near(third.nextCarry, 0.2);

    const fourth = resolveStreamRevealStep(10.1, 3);
    assert.equal(fourth.step, 3);
    near(fourth.nextCarry, 0.1);
  });

  it("commits the full buffered burst without stretching the tail", () => {
    const target = "Hello world, this lands cleanly";
    assert.equal(resolveStreamRevealCommitLength(target, 0, 5), 5);
    assert.equal(resolveStreamRevealCommitLength(target, 6, 12), 12);
  });
});
