import type { Skill, UserMcpServer } from "../../shared/contracts";

type ActiveContextBadgesProps = {
  activeSkill: Skill | null;
  activeMcpServers: UserMcpServer[];
  onChangeActiveSkill: (skill: Skill | null) => void;
  onToggleMcp: (id: string) => void;
};

export const ActiveContextBadges = ({
  activeSkill,
  activeMcpServers,
  onChangeActiveSkill,
  onToggleMcp
}: ActiveContextBadgesProps) => {
  if (activeMcpServers.length === 0 && !activeSkill) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {activeSkill ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 py-0.5 pl-2 pr-1 text-[12px] font-medium text-primary">
          <span>{activeSkill.icon}</span>
          {activeSkill.name}
          <button
            type="button"
            onClick={() => onChangeActiveSkill(null)}
            className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm hover:bg-primary/20"
            aria-label="移除 Skill"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
              <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </span>
      ) : null}
      {activeMcpServers.map((server) => (
        <span
          key={server.id}
          className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 py-0.5 pl-2 pr-1 text-[12px] font-medium text-primary"
        >
          <span className="h-1.5 w-1.5 rounded-sm bg-primary" />
          {server.name}
          <button
            type="button"
            onClick={() => onToggleMcp(server.id)}
            className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm hover:bg-primary/20"
            aria-label={`移除 ${server.name}`}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor">
              <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </span>
      ))}
    </div>
  );
};
