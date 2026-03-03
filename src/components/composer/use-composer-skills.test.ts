import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Skill } from "../../shared/contracts";
import {
  createSkillParamDefaults,
  stripSlashCommandInput
} from "./use-composer-skills";

const createSkill = (overrides?: Partial<Skill>): Skill => ({
  id: "skill-1",
  name: "Planner",
  command: "plan",
  description: "Create a plan",
  icon: "🧭",
  userPromptTemplate: "template",
  params: [
    { key: "style", label: "Style", defaultValue: "concise" },
    { key: "lang", label: "Language", defaultValue: "zh-CN" }
  ],
  isBuiltin: false,
  createdAt: "2026-03-02T00:00:00.000Z",
  updatedAt: "2026-03-02T00:00:00.000Z",
  ...overrides
});

describe("components/composer/use-composer-skills helpers", () => {
  it("strips slash command prefix from user input", () => {
    assert.equal(stripSlashCommandInput("/plan"), "");
    assert.equal(stripSlashCommandInput("/plan build agent ui"), "build agent ui");
    assert.equal(stripSlashCommandInput("hello world"), "hello world");
  });

  it("creates default param map from skill definition", () => {
    const skill = createSkill();
    const defaults = createSkillParamDefaults(skill);

    assert.deepEqual(defaults, {
      style: "concise",
      lang: "zh-CN"
    });
  });
});
