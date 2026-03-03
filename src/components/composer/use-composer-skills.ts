import { useMemo, useState, type KeyboardEvent } from "react";
import type { Skill } from "../../shared/contracts";
import { filterSkills } from "../../lib/skills-utils";
import { extractSlashCommandQuery } from "./use-composer-panels";

export type SkillParamState = { skill: Skill; params: Record<string, string> } | null;

export const stripSlashCommandInput = (value: string) => value.replace(/^\/\S*\s*/, "").trim();

export const createSkillParamDefaults = (skill: Skill) => {
  const defaults: Record<string, string> = {};
  skill.params.forEach((param) => {
    defaults[param.key] = param.defaultValue;
  });
  return defaults;
};

type UseComposerSkillsParams = {
  value: string;
  skills: Skill[];
  onChange: (value: string) => void;
  onApplySkill: (skill: Skill, params: Record<string, string>, input: string) => void;
};

export const useComposerSkills = ({
  value,
  skills,
  onChange,
  onApplySkill
}: UseComposerSkillsParams) => {
  const [skillsQuery, setSkillsQuery] = useState<string | null>(null);
  const [skillsSelectedIndex, setSkillsSelectedIndex] = useState(0);
  const [skillParamState, setSkillParamState] = useState<SkillParamState>(null);

  const filteredSkills = useMemo(
    () => (skillsQuery !== null ? filterSkills(skillsQuery, skills) : []),
    [skillsQuery, skills]
  );
  const isSkillsOpen = skillsQuery !== null && filteredSkills.length > 0 && !skillParamState;

  const updateSkillsQueryFromInput = (nextValue: string) => {
    const query = extractSlashCommandQuery(nextValue);
    setSkillsQuery(query);
    if (query !== null) {
      setSkillsSelectedIndex(0);
    }
  };

  const selectSkill = (skill: Skill) => {
    if (skill.params.length === 0) {
      const input = stripSlashCommandInput(value);
      onChange("");
      onApplySkill(skill, {}, input);
      setSkillsQuery(null);
      return;
    }
    setSkillParamState({ skill, params: createSkillParamDefaults(skill) });
    setSkillsQuery(null);
  };

  const confirmSkillParams = () => {
    if (!skillParamState) {
      return;
    }
    const input = stripSlashCommandInput(value);
    onChange("");
    onApplySkill(skillParamState.skill, skillParamState.params, input);
    setSkillParamState(null);
  };

  const handleSkillsNavigationKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>
  ): boolean => {
    if (!isSkillsOpen) {
      return false;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSkillsSelectedIndex((index) => Math.min(index + 1, filteredSkills.length - 1));
      return true;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSkillsSelectedIndex((index) => Math.max(index - 1, 0));
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const skill = filteredSkills[skillsSelectedIndex];
      if (skill) {
        selectSkill(skill);
      }
      return true;
    }
    if (event.key === "Escape") {
      setSkillsQuery(null);
      return true;
    }

    return false;
  };

  return {
    skillsQuery,
    setSkillsQuery,
    skillsSelectedIndex,
    setSkillsSelectedIndex,
    skillParamState,
    setSkillParamState,
    filteredSkills,
    isSkillsOpen,
    updateSkillsQueryFromInput,
    selectSkill,
    confirmSkillParams,
    handleSkillsNavigationKeyDown
  };
};
