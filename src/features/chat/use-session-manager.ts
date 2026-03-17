import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { MuApi } from "../../lib/mu-api";
import type { ChatSession } from "../../shared/contracts";
import {
  createSession,
  ensureSessions,
  nowIso
} from "./utils/chat-utils";
import {
  exportSessionAsJson,
  exportSessionAsMarkdown,
  exportSessionsAsJson
} from "./utils/session-transfer";
import { upsertSessionById } from "./utils/session-mutations";

type RemovedSession = {
  session: ChatSession;
  index: number;
  timeoutId: number;
};

type UseSessionManagerParams = {
  api: MuApi;
  isHydrated: boolean;
  setErrorBanner: Dispatch<SetStateAction<string | null>>;
  onResetDraft: () => void;
};

export const useSessionManager = ({
  api,
  isHydrated,
  setErrorBanner,
  onResetDraft
}: UseSessionManagerParams) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [removedSession, setRemovedSession] = useState<RemovedSession | null>(null);

  const removedTimeoutRef = useRef<number | null>(null);

  const upsertSession = (sessionId: string, mutate: (session: ChatSession) => ChatSession) => {
    setSessions((previous) => upsertSessionById(previous, sessionId, mutate));
  };

  const createNewChat = () => {
    const session = createSession("New Chat");
    setSessions((previous) => [session, ...previous]);
    setActiveSessionId(session.id);
    onResetDraft();
  };

  const applyChatTitle = (sessionId: string, nextTitle: string) => {
    const title = nextTitle.trim();
    if (!title) {
      return;
    }
    upsertSession(sessionId, (session) =>
      session.title === title ? session : { ...session, title, updatedAt: nowIso() }
    );
  };

  const renameChat = (sessionId: string, overrideTitle?: string) => {
    if (typeof overrideTitle === "string") {
      applyChatTitle(sessionId, overrideTitle);
      return;
    }

    const target = sessions.find((session) => session.id === sessionId);
    if (!target) {
      return;
    }
    const input = window.prompt("Rename Chat", target.title);
    if (!input) {
      return;
    }
    applyChatTitle(sessionId, input);
  };

  const toggleChatPin = (sessionId: string) => {
    upsertSession(sessionId, (session) => ({ ...session, isPinned: !Boolean(session.isPinned) }));
  };

  const deleteChat = (sessionId: string) => {
    if (removedSession) {
      window.clearTimeout(removedSession.timeoutId);
      removedTimeoutRef.current = null;
      setRemovedSession(null);
    }

    const currentIndex = sessions.findIndex((session) => session.id === sessionId);
    if (currentIndex < 0) {
      return;
    }

    const sessionToDelete = sessions[currentIndex];
    const remaining = sessions.filter((session) => session.id !== sessionId);
    const mergedSessions = remaining.length ? remaining : [createSession("New Chat")];
    setSessions(mergedSessions);

    if (activeSessionId === sessionId) {
      setActiveSessionId(mergedSessions[0].id);
    }

    const timeoutId = window.setTimeout(() => {
      setRemovedSession(null);
      removedTimeoutRef.current = null;
    }, 2000);
    removedTimeoutRef.current = timeoutId;

    setRemovedSession({
      session: sessionToDelete,
      index: currentIndex,
      timeoutId
    });
  };

  const undoDelete = () => {
    if (!removedSession) {
      return;
    }
    window.clearTimeout(removedSession.timeoutId);
    removedTimeoutRef.current = null;
    setSessions((previous) => {
      const next = [...previous];
      next.splice(removedSession.index, 0, removedSession.session);
      return next;
    });
    setActiveSessionId(removedSession.session.id);
    setRemovedSession(null);
  };

  const exportSessions = () => {
    try {
      exportSessionsAsJson(sessions);
    } catch (error) {
      setErrorBanner(error instanceof Error ? error.message : "Failed to export sessions.");
    }
  };

  const exportSession = (sessionId: string) => {
    const target = sessions.find((session) => session.id === sessionId);
    if (!target) {
      return;
    }

    try {
      exportSessionAsJson(target);
    } catch (error) {
      setErrorBanner(error instanceof Error ? error.message : "Failed to export session.");
    }
  };

  const exportSessionMarkdown = (sessionId: string) => {
    const target = sessions.find((session) => session.id === sessionId);
    if (!target) {
      return;
    }

    try {
      exportSessionAsMarkdown(target);
    } catch (error) {
      setErrorBanner(error instanceof Error ? error.message : "Failed to export session markdown.");
    }
  };

  const importSessions = (importedSessions: ChatSession[]) => {
    const nextSessions = ensureSessions(importedSessions);
    setSessions(nextSessions);
    setActiveSessionId(nextSessions[0].id);
    setErrorBanner(null);
    onResetDraft();
  };

  const clearAllSessions = () => {
    const nextSessions = [createSession("New Chat")];
    setSessions(nextSessions);
    setActiveSessionId(nextSessions[0].id);
    setErrorBanner(null);
    onResetDraft();
  };

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void api.sessions.save(sessions).catch((error) => {
        setErrorBanner(error instanceof Error ? error.message : "Failed to persist sessions.");
      });
    }, 350);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [api.sessions, isHydrated, sessions, setErrorBanner]);

  useEffect(() => {
    return () => {
      if (removedTimeoutRef.current !== null) {
        window.clearTimeout(removedTimeoutRef.current);
      }
    };
  }, []);

  return {
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId,
    removedSession,
    upsertSession,
    createNewChat,
    renameChat,
    toggleChatPin,
    deleteChat,
    undoDelete,
    exportSessions,
    exportSession,
    exportSessionMarkdown,
    importSessions,
    clearAllSessions
  };
};
