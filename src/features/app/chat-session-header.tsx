type ChatSessionHeaderProps = {
  className?: string;
  title: string;
};

export const getChatSessionHeaderClassName = (className?: string) =>
  [
    "chat-reading-stage mx-auto flex min-h-11 w-full items-center border-b border-border/70 px-4 py-0 text-muted-foreground sm:px-5",
    className ?? ""
  ]
    .join(" ")
    .trim();

export const ChatSessionHeader = ({ className, title }: ChatSessionHeaderProps) => (
  <div className={getChatSessionHeaderClassName(className)}>
    <div className="min-w-0">
      <p className="truncate text-[14px] font-semibold leading-none tracking-[0.01em] text-foreground/92">{title}</p>
    </div>
  </div>
);
