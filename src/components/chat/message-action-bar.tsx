import { Check, Copy, Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { ChatMessage } from "../../shared/contracts";
import { Button } from "../ui/button";

type MessageActionBarProps = {
  isUser: boolean;
  isAgentMode: boolean;
  isGenerating: boolean;
  copied: boolean;
  message: ChatMessage;
  onCopy: () => void;
  onStartEditing: () => void;
  onResendMessage: (message: ChatMessage) => void;
  onDeleteMessage: (message: ChatMessage) => void;
};

export const MessageActionBar = ({
  isUser,
  isAgentMode,
  isGenerating,
  copied,
  message,
  onCopy,
  onStartEditing,
  onResendMessage,
  onDeleteMessage
}: MessageActionBarProps) => (
  <div
    className={[
      "mt-1.5 flex w-fit max-w-full items-center gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100",
      isUser ? "ml-auto justify-end" : "justify-start"
    ].join(" ")}
  >
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2 text-xs text-muted-foreground"
      onClick={onCopy}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "已复制" : "复制"}
    </Button>
    {isUser && !isAgentMode ? (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={onStartEditing}
          disabled={isGenerating}
        >
          <Pencil className="h-3.5 w-3.5" />
          编辑
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={() => onResendMessage(message)}
          disabled={isGenerating}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          重发
        </Button>
      </>
    ) : null}
    {!isAgentMode ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-destructive"
        onClick={() => onDeleteMessage(message)}
        disabled={isGenerating}
      >
        <Trash2 className="h-3.5 w-3.5" />
        删除
      </Button>
    ) : null}
  </div>
);
