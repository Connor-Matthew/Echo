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
  <div className={getMessageActionBarClassName(isUser)}>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={getMessageActionButtonClassName("default")}
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
          className={getMessageActionButtonClassName("default")}
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
          className={getMessageActionButtonClassName("default")}
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
        className={getMessageActionButtonClassName("destructive")}
        onClick={() => onDeleteMessage(message)}
        disabled={isGenerating}
      >
        <Trash2 className="h-3.5 w-3.5" />
        删除
      </Button>
    ) : null}
  </div>
);

export const getMessageActionBarClassName = (isUser: boolean) =>
  [
    "mt-0.5 flex w-fit max-w-full items-center gap-1 text-muted-foreground/88 transition-[opacity,transform] duration-150 md:translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100",
    isUser ? "ml-auto justify-end" : "justify-start"
  ].join(" ");

export const getMessageActionButtonClassName = (tone: "default" | "destructive") =>
  [
    "h-6 gap-1 rounded-full px-2 text-[10.5px]",
    tone === "destructive" ? "text-destructive/88" : "text-muted-foreground"
  ].join(" ");
