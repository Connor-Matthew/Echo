import type { ChatAttachment } from "../../shared/contracts";

type MessageAttachmentListProps = {
  attachments: ChatAttachment[];
  isUser: boolean;
};

export const MessageAttachmentList = ({ attachments, isUser }: MessageAttachmentListProps) => {
  if (!attachments.length) {
    return null;
  }

  return (
    <div className={isUser ? "mt-1.5 flex flex-wrap justify-end gap-1.5" : "mt-1.5 flex flex-wrap gap-1.5"}>
      {attachments.map((attachment) => (
        <span
          key={attachment.id}
          className="inline-flex items-center rounded-full border border-border/75 bg-background px-2.5 py-1 text-[12px] text-muted-foreground"
        >
          {attachment.name}
        </span>
      ))}
    </div>
  );
};
