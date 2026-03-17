import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { MuApi } from "../../lib/mu-api";
import type { AppSettings, ChatSession } from "../../shared/contracts";
import {
  SOUL_REWRITE_JOURNAL_LIMIT,
  buildJournalMessages,
  buildMemoryRewriteMessages,
  buildSoulRewriteMessages,
  buildSoulRewriteSummaryMessages,
  getLatestDueSoulRewriteSlot,
  getNextJournalDelayMs,
  getNextMemoryRewriteDelayMs,
  getNextSoulRewriteDelayMs,
  getPendingSoulMemoryMessages,
  getTodayDateString,
  isSoulMemoryRewriteDue,
  JOURNAL_UPDATED_EVENT,
  runBackgroundChatCompletion,
  getDateStringForTimestamp
} from "../chat/services/soul-automation";

type UseSoulAutomationParams = {
  api: MuApi;
  sessions: ChatSession[];
  settings: AppSettings;
  isHydrated: boolean;
  isConfigured: boolean;
  isGenerating: boolean;
  setErrorBanner: Dispatch<SetStateAction<string | null>>;
  showSoulStatus: (message: string) => void;
};

export const useSoulAutomation = ({
  api,
  sessions,
  settings,
  isHydrated,
  isConfigured,
  isGenerating,
  setErrorBanner,
  showSoulStatus
}: UseSoulAutomationParams) => {
  const [isJournalGenerating, setIsJournalGenerating] = useState(false);
  const soulMemoryTaskRef = useRef(false);
  const soulMemoryTimerRef = useRef<number | null>(null);
  const soulRewriteTaskRef = useRef(false);
  const soulRewriteTimerRef = useRef<number | null>(null);
  const journalTaskRef = useRef(false);
  const journalTimerRef = useRef<number | null>(null);

  const runSoulMemoryCompaction = useCallback(async (): Promise<boolean> => {
    if (!isHydrated || !isConfigured || isGenerating || soulMemoryTaskRef.current) {
      return false;
    }

    soulMemoryTaskRef.current = true;
    try {
      const automationState = await api.soul.getAutomationState();
      const pendingMessages = getPendingSoulMemoryMessages(sessions, automationState);
      if (pendingMessages.length === 0) {
        return false;
      }
      if (!isSoulMemoryRewriteDue(new Date(), automationState.lastMemoryUpdatedAt)) {
        return false;
      }

      const currentMemory = await api.soul.getMemoryMarkdown();
      const nextMemory = await runBackgroundChatCompletion({
        api,
        settings,
        messages: buildMemoryRewriteMessages(currentMemory, pendingMessages)
      });
      if (!nextMemory.trim()) {
        return false;
      }

      const lastMessage = pendingMessages[pendingMessages.length - 1];
      await api.soul.saveMemoryMarkdown(nextMemory);
      await api.soul.saveAutomationState({
        ...automationState,
        lastProcessedUserMessageId: lastMessage.id,
        lastProcessedUserMessageCreatedAt: lastMessage.createdAt,
        lastMemoryUpdatedAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.warn("[soul][memory] failed", error instanceof Error ? error.message : "unknown_error");
      return false;
    } finally {
      soulMemoryTaskRef.current = false;
    }
  }, [api, isConfigured, isGenerating, isHydrated, sessions, settings]);

  const loadRecentJournalEntries = useCallback(async (limit = SOUL_REWRITE_JOURNAL_LIMIT) => {
    const dates = (await api.soul.listJournalDates()).slice(0, limit);
    const entries = await Promise.all(
      dates.map(async (date) => ({
        date,
        content: (await api.soul.getJournalEntry(date)) ?? ""
      }))
    );
    return entries.filter((entry) => entry.content.trim());
  }, [api.soul]);

  const runSoulRewriteIfDue = useCallback(async (options?: { force?: boolean }): Promise<boolean> => {
    if (!isHydrated || !isConfigured || isGenerating || soulRewriteTaskRef.current) {
      return false;
    }

    const dueSlot = getLatestDueSoulRewriteSlot(new Date());
    if (!options?.force && !dueSlot) {
      return false;
    }

    soulRewriteTaskRef.current = true;
    try {
      const automationState = await api.soul.getAutomationState();
      if (!options?.force && automationState.lastSoulRewriteSlot === dueSlot) {
        return false;
      }

      const recentJournalEntries = await loadRecentJournalEntries();
      if (recentJournalEntries.length === 0) {
        return false;
      }

      const [currentSoul, memoryMarkdown] = await Promise.all([
        api.soul.getMarkdown(),
        api.soul.getMemoryMarkdown()
      ]);
      const nextSoul = await runBackgroundChatCompletion({
        api,
        settings,
        messages: buildSoulRewriteMessages(currentSoul, memoryMarkdown, recentJournalEntries)
      });
      if (!nextSoul.trim()) {
        return false;
      }

      const rewriteSummary = await runBackgroundChatCompletion({
        api,
        settings,
        messages: buildSoulRewriteSummaryMessages(
          currentSoul,
          nextSoul,
          memoryMarkdown,
          recentJournalEntries
        )
      }).catch((error) => {
        console.warn(
          "[soul][rewrite-summary] failed",
          error instanceof Error ? error.message : "unknown_error"
        );
        return "";
      });

      await api.soul.saveMarkdown(nextSoul);
      await api.soul.saveAutomationState({
        ...automationState,
        lastSoulRewriteAt: new Date().toISOString(),
        lastSoulRewriteSlot: dueSlot ?? automationState.lastSoulRewriteSlot,
        lastSoulRewriteSummary: rewriteSummary.trim() || undefined
      });
      showSoulStatus(rewriteSummary.trim() ? `SOUL 已更新\n${rewriteSummary.trim()}` : "SOUL 已更新");
      return true;
    } catch (error) {
      console.warn("[soul][rewrite] failed", error instanceof Error ? error.message : "unknown_error");
      return false;
    } finally {
      soulRewriteTaskRef.current = false;
    }
  }, [api, isConfigured, isGenerating, isHydrated, loadRecentJournalEntries, settings, showSoulStatus]);

  const runJournalGeneration = useCallback(
    async ({
      force = false,
      silent = false
    }: { force?: boolean; silent?: boolean } = {}): Promise<boolean> => {
      if (!isHydrated || !isConfigured) {
        if (!silent) {
          setErrorBanner("请先完成模型配置后再生成今日手记。");
        }
        return false;
      }
      if (journalTaskRef.current) {
        if (!silent) {
          setErrorBanner("今日手记正在生成中，请稍候。");
        }
        return false;
      }

      const today = getTodayDateString(new Date());
      const now = new Date();
      if (!force && now.getHours() < 22) {
        return false;
      }

      const todayMessages = sessions
        .flatMap((session) =>
          session.messages
            .filter(
              (message) =>
                message.role === "user" &&
                message.content.trim() &&
                getDateStringForTimestamp(message.createdAt) === today
            )
            .map((message) => ({
              id: message.id,
              sessionId: session.id,
              content: message.content,
              createdAt: message.createdAt
            }))
        );

      if (todayMessages.length === 0) {
        if (!silent) {
          setErrorBanner("今天还没有可用于生成手记的用户消息。");
        }
        return false;
      }

      journalTaskRef.current = true;
      setIsJournalGenerating(true);
      try {
        const automationState = await api.soul.getAutomationState();
        if (!force && automationState.lastJournalDate === today) {
          return false;
        }

        const [soulMarkdown, memoryMarkdown] = await Promise.all([
          api.soul.getMarkdown(),
          api.soul.getMemoryMarkdown()
        ]);

        const journalText = await runBackgroundChatCompletion({
          api,
          settings,
          messages: buildJournalMessages(todayMessages, memoryMarkdown, soulMarkdown)
        });

        if (!journalText.trim()) {
          if (!silent) {
            setErrorBanner("模型没有返回可用的手记内容。");
          }
          return false;
        }

        await api.soul.saveJournalEntry(today, journalText);
        await api.soul.saveAutomationState({ ...automationState, lastJournalDate: today });
        window.dispatchEvent(new CustomEvent(JOURNAL_UPDATED_EVENT, { detail: { date: today } }));
        const soulUpdated = await runSoulRewriteIfDue({ force: true });
        if (!silent && !soulUpdated) {
          showSoulStatus(automationState.lastJournalDate === today ? "今日手记已更新" : "今日手记已生成");
        }
        return true;
      } catch (error) {
        console.warn("[soul][journal] failed", error instanceof Error ? error.message : "unknown_error");
        if (!silent) {
          setErrorBanner(error instanceof Error ? error.message : "今日手记生成失败。");
        }
        return false;
      } finally {
        journalTaskRef.current = false;
        setIsJournalGenerating(false);
      }
    },
    [api, isConfigured, isHydrated, runSoulRewriteIfDue, sessions, setErrorBanner, settings, showSoulStatus]
  );

  const runJournalIfDue = useCallback(async (): Promise<boolean> => {
    return runJournalGeneration({ silent: true });
  }, [runJournalGeneration]);

  const generateTodayJournal = useCallback(async (): Promise<boolean> => {
    setErrorBanner(null);
    return runJournalGeneration({ force: true });
  }, [runJournalGeneration, setErrorBanner]);

  const scheduleNextSoulMemoryCheck = useCallback(() => {
    if (soulMemoryTimerRef.current !== null) {
      window.clearTimeout(soulMemoryTimerRef.current);
    }
    soulMemoryTimerRef.current = window.setTimeout(() => {
      void runSoulMemoryCompaction().finally(() => {
        scheduleNextSoulMemoryCheck();
      });
    }, getNextMemoryRewriteDelayMs(new Date()));
  }, [runSoulMemoryCompaction]);

  const scheduleNextSoulRewriteCheck = useCallback(() => {
    if (soulRewriteTimerRef.current !== null) {
      window.clearTimeout(soulRewriteTimerRef.current);
    }
    soulRewriteTimerRef.current = window.setTimeout(() => {
      void runSoulRewriteIfDue().finally(() => {
        scheduleNextSoulRewriteCheck();
      });
    }, getNextSoulRewriteDelayMs(new Date()));
  }, [runSoulRewriteIfDue]);

  const scheduleNextJournalCheck = useCallback(() => {
    if (journalTimerRef.current !== null) {
      window.clearTimeout(journalTimerRef.current);
    }
    journalTimerRef.current = window.setTimeout(() => {
      void runJournalIfDue().finally(() => {
        scheduleNextJournalCheck();
      });
    }, getNextJournalDelayMs(new Date()));
  }, [runJournalIfDue]);

  useEffect(() => {
    if (!isHydrated || !isConfigured || isGenerating) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          while (!cancelled && (await runSoulMemoryCompaction())) {
          }
          if (!cancelled) {
            await runSoulRewriteIfDue();
          }
        } catch (error) {
          console.warn(
            "[soul][maintenance] failed",
            error instanceof Error ? error.message : "unknown_error"
          );
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isConfigured, isGenerating, isHydrated, runSoulMemoryCompaction, runSoulRewriteIfDue, sessions]);

  useEffect(() => {
    if (!isHydrated || !isConfigured) {
      return;
    }

    scheduleNextSoulMemoryCheck();
    return () => {
      if (soulMemoryTimerRef.current !== null) {
        window.clearTimeout(soulMemoryTimerRef.current);
        soulMemoryTimerRef.current = null;
      }
    };
  }, [isConfigured, isHydrated, scheduleNextSoulMemoryCheck]);

  useEffect(() => {
    if (!isHydrated || !isConfigured) {
      return;
    }

    scheduleNextSoulRewriteCheck();
    return () => {
      if (soulRewriteTimerRef.current !== null) {
        window.clearTimeout(soulRewriteTimerRef.current);
        soulRewriteTimerRef.current = null;
      }
    };
  }, [isConfigured, isHydrated, scheduleNextSoulRewriteCheck]);

  useEffect(() => {
    if (!isHydrated || !isConfigured) {
      return;
    }

    void runJournalIfDue();
    scheduleNextJournalCheck();
    return () => {
      if (journalTimerRef.current !== null) {
        window.clearTimeout(journalTimerRef.current);
        journalTimerRef.current = null;
      }
    };
  }, [isConfigured, isHydrated, runJournalIfDue, scheduleNextJournalCheck]);

  useEffect(() => {
    return () => {
      if (soulMemoryTimerRef.current !== null) {
        window.clearTimeout(soulMemoryTimerRef.current);
      }
      if (soulRewriteTimerRef.current !== null) {
        window.clearTimeout(soulRewriteTimerRef.current);
      }
      if (journalTimerRef.current !== null) {
        window.clearTimeout(journalTimerRef.current);
      }
    };
  }, []);

  return {
    isJournalGenerating,
    generateTodayJournal,
    runSoulRewriteIfDue
  };
};
