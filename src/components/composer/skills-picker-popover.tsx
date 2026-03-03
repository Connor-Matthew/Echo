import type { Dispatch, RefObject, SetStateAction } from "react";
import { Sparkles } from "lucide-react";
import type { Skill } from "../../shared/contracts";
import { Button } from "../ui/button";

type SkillsPickerPopoverProps = {
  skills: Skill[];
  activeSkill: Skill | null;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  pickerRef: RefObject<HTMLDivElement>;
  onChangeActiveSkill: (skill: Skill | null) => void;
};

export const SkillsPickerPopover = ({
  skills,
  activeSkill,
  isOpen,
  setIsOpen,
  pickerRef,
  onChangeActiveSkill
}: SkillsPickerPopoverProps) => {
  if (skills.length === 0) {
    return null;
  }

  return (
    <div className="relative" ref={pickerRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={[
          "relative h-[32px] w-[32px] rounded-full bg-accent/55 hover:bg-accent/80",
          activeSkill ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        ].join(" ")}
        onClick={() => setIsOpen((previous) => !previous)}
        aria-label="选择技能"
        title="技能"
      >
        <Sparkles className="h-4 w-4" />
        {activeSkill ? (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-sm bg-primary" />
        ) : null}
      </Button>
      {isOpen ? (
        <div className="absolute bottom-full left-0 z-[60] mb-2 w-[220px] rounded-md border border-border bg-card p-2 shadow-[0_10px_20px_rgba(15,23,42,0.12)]">
          <p className="mb-1.5 px-1 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            技能
          </p>
          <div className="space-y-0.5">
            {skills.map((skill) => {
              const isOn = activeSkill?.id === skill.id;
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => {
                    onChangeActiveSkill(isOn ? null : skill);
                    setIsOpen(false);
                  }}
                  className={[
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    isOn ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  ].join(" ")}
                >
                  <span className={["flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border", isOn ? "border-primary bg-primary text-primary-foreground" : "border-border"].join(" ")}>
                    {isOn ? <span className="text-[10px] font-bold">✓</span> : null}
                  </span>
                  <span className="text-sm">{skill.icon}</span>
                  <span className="truncate text-xs">{skill.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/60">/{skill.command}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
