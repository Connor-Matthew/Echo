import type { AgentMessage } from "../shared/agent-contracts";

type AgentViewProps = {
  messages: AgentMessage[];
  isRunning: boolean;
};

const roleLabelByType: Record<AgentMessage["role"], string> = {
  user: "USER",
  assistant: "AGENT",
  system: "SYSTEM"
};

export const AgentView = ({ messages, isRunning }: AgentViewProps) => {
  if (!messages.length) {
    return (
      <div className="grid h-full place-content-center px-6 text-center">
        <div className="max-w-xl rounded-[8px] border border-border/80 bg-card/75 px-6 py-5 shadow-[3px_3px_0_hsl(var(--border))]">
          <p className="sketch-title text-[24px] uppercase leading-none text-primary">Agent Desk</p>
          <p className="mt-2 text-sm text-muted-foreground">
            这里会显示 Claude Agent SDK 的执行过程与回复。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-3 py-3 sm:px-5 sm:py-4">
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-3 pb-4">
        {messages.map((message) => (
          <article
            key={message.id}
            className="rounded-[8px] border border-border/85 bg-card/80 px-3 py-2.5 shadow-[2px_2px_0_hsl(var(--border))]"
          >
            <div className="mb-1 flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              <span>{roleLabelByType[message.role]}</span>
              <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
            </div>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">
              {message.content}
            </pre>
          </article>
        ))}

        {isRunning ? (
          <div className="rounded-[8px] border border-border/70 bg-accent/40 px-3 py-2 text-xs text-muted-foreground">
            Agent 正在执行...
          </div>
        ) : null}
      </div>
    </div>
  );
};
