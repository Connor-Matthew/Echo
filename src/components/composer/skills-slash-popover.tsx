import type { RefObject } from "react";
import type { Skill } from "../../shared/contracts";

type SkillsSlashPopoverProps = {
  isOpen: boolean;
  popoverRef: RefObject<HTMLDivElement>;
  filteredSkills: Skill[];
  selectedIndex: number;
  onHoverIndex: (index: number) => void;
  onSelectSkill: (skill: Skill) => void;
};

export const SkillsSlashPopover = ({
  isOpen,
  popoverRef,
  filteredSkills,
  selectedIndex,
  onHoverIndex,
  onSelectSkill
}: SkillsSlashPopoverProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={popoverRef}
      className="mb-2 overflow-hidden rounded-md border border-border bg-card shadow-[0_8px_16px_rgba(15,23,42,0.12)]"
    >
      {filteredSkills.map((skill, i) => (
        <button
          key={skill.id}
          type="button"
          className={[
            "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
            i === selectedIndex ? "bg-accent" : "hover:bg-accent/60"
          ].join(" ")}
          onMouseEnter={() => onHoverIndex(i)}
          onClick={() => onSelectSkill(skill)}
        >
          <span className="text-sm">{skill.icon}</span>
          <span className="font-medium text-foreground/80">{skill.name}</span>
          <span className="text-muted-foreground">/{skill.command}</span>
          {skill.description ? (
            <span className="ml-auto text-[11px] text-muted-foreground/70">{skill.description}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
};
