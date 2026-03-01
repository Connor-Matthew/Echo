import type { Skill, CompletionMessage } from "../shared/contracts";
import { BUILTIN_SKILLS } from "./skills-builtin";

export const renderSkillPrompt = (
  template: string,
  params: Record<string, string>,
  input: string
): string => {
  let result = template;
  result = result.replace(/\{\{input\}\}/g, input);
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
};

export const applySkillToMessages = (
  messages: CompletionMessage[],
  skill: Skill,
  params: Record<string, string>,
  input: string
): CompletionMessage[] => {
  const renderedUserPrompt = renderSkillPrompt(skill.userPromptTemplate, params, input);

  // Replace last user message content with rendered prompt
  const lastUserIdx = [...messages].map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === "user")?.i ?? -1;

  let result = messages.map((msg, i) =>
    i === lastUserIdx ? { ...msg, content: renderedUserPrompt } : msg
  );

  // Temporarily override system prompt if skill defines one
  if (skill.systemPromptOverride) {
    const hasSystem = result.some((m) => m.role === "system");
    if (hasSystem) {
      result = result.map((m) => m.role === "system" ? { ...m, content: skill.systemPromptOverride! } : m);
    } else {
      result = [{ role: "system", content: skill.systemPromptOverride }, ...result];
    }
  }

  return result;
};

export const matchSkillByCommand = (command: string, skills: Skill[]): Skill | null =>
  skills.find((s) => s.command.toLowerCase() === command.toLowerCase()) ?? null;

export const filterSkills = (query: string, skills: Skill[]): Skill[] => {
  const q = query.toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) =>
      s.command.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
  );
};

export const mergeSkills = (userSkills: Skill[]): Skill[] => {
  const userIds = new Set(userSkills.map((s) => s.id));
  const builtins = BUILTIN_SKILLS.filter((s) => !userIds.has(s.id));
  return [...builtins, ...userSkills];
};

export const normalizeSkills = (raw: unknown): Skill[] => {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is Skill => {
    if (!item || typeof item !== "object") return false;
    const s = item as Record<string, unknown>;
    return (
      typeof s.id === "string" &&
      typeof s.name === "string" &&
      typeof s.command === "string" &&
      !s.isBuiltin
    );
  });
};
