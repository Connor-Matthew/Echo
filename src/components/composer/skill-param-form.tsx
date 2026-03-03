import type { Dispatch, SetStateAction } from "react";
import { Button } from "../ui/button";
import type { SkillParamState } from "./use-composer-skills";

type SkillParamFormProps = {
  skillParamState: Exclude<SkillParamState, null>;
  setSkillParamState: Dispatch<SetStateAction<SkillParamState>>;
  onConfirm: () => void;
};

export const SkillParamForm = ({
  skillParamState,
  setSkillParamState,
  onConfirm
}: SkillParamFormProps) => (
  <div className="mb-2 rounded-md border border-border/70 bg-accent/35 px-3 py-2.5">
    <div className="mb-2 flex items-center gap-2">
      <span className="text-sm">{skillParamState.skill.icon}</span>
      <span className="text-xs font-medium">{skillParamState.skill.name}</span>
    </div>
    <div className="space-y-1.5">
      {skillParamState.skill.params.map((param) => (
        <div key={param.key} className="flex items-center gap-2">
          <label className="w-20 shrink-0 text-[11px] text-muted-foreground">{param.label}</label>
          <input
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
            value={skillParamState.params[param.key] ?? param.defaultValue}
            onChange={(event) =>
              setSkillParamState((prev) =>
                prev
                  ? { ...prev, params: { ...prev.params, [param.key]: event.target.value } }
                  : prev
              )
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onConfirm();
              }
              if (event.key === "Escape") {
                setSkillParamState(null);
              }
            }}
            autoFocus={skillParamState.skill.params[0]?.key === param.key || undefined}
          />
        </div>
      ))}
    </div>
    <div className="mt-2 flex justify-end gap-2">
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSkillParamState(null)}>
        取消
      </Button>
      <Button size="sm" className="h-6 px-2 text-xs" onClick={onConfirm}>
        确认
      </Button>
    </div>
  </div>
);
