import type { ChatSession } from "../shared/contracts";
import { sessionToMarkdown, toSafeFileNameSegment } from "./app-chat-utils";

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const currentDateSuffix = () => new Date().toISOString().slice(0, 10);

export const exportSessionsAsJson = (sessions: ChatSession[]) => {
  const payload = JSON.stringify(sessions, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  triggerDownload(blob, `mu-sessions-${currentDateSuffix()}.json`);
};

export const exportSessionAsJson = (session: ChatSession) => {
  const payload = JSON.stringify(session, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  triggerDownload(
    blob,
    `mu-session-${toSafeFileNameSegment(session.title)}-${currentDateSuffix()}.json`
  );
};

export const exportSessionAsMarkdown = (session: ChatSession) => {
  const payload = sessionToMarkdown(session);
  const blob = new Blob([payload], { type: "text/markdown;charset=utf-8" });
  triggerDownload(
    blob,
    `mu-session-${toSafeFileNameSegment(session.title)}-${currentDateSuffix()}.md`
  );
};
