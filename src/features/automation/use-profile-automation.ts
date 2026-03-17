import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { MuApi } from "../../lib/mu-api";
import type {
  AppSettings,
  ChatSession,
  UserProfileDailyNote,
  UserProfileItem
} from "../../shared/contracts";
import {
  USER_PROFILE_RECENT_NOTES_LIMIT,
  USER_PROFILE_UPDATED_EVENT,
  buildUserDailyNoteMessages,
  buildUserProfileRewriteMessages,
  buildUserProfileSnapshotMarkdown,
  collectProfileTrackedUserMessages,
  getDateStringForTimestamp,
  getNextUserProfileRefreshDelayMs,
  getPendingProfileMessages,
  parseUserProfileRewriteResponse
} from "../profile/services/profile-automation";
import { getTodayDateString, runBackgroundChatCompletion } from "../chat/services/soul-automation";
import { nowIso } from "../chat/utils/chat-utils";

type UseProfileAutomationParams = {
  api: MuApi;
  sessions: ChatSession[];
  settings: AppSettings;
  isHydrated: boolean;
  isConfigured: boolean;
  isGenerating: boolean;
  setErrorBanner: Dispatch<SetStateAction<string | null>>;
};

export const useProfileAutomation = ({
  api,
  sessions,
  settings,
  isHydrated,
  isConfigured,
  isGenerating,
  setErrorBanner
}: UseProfileAutomationParams) => {
  const [isUserProfileRefreshing, setIsUserProfileRefreshing] = useState(false);
  const userProfileTaskRef = useRef(false);
  const userProfileTimerRef = useRef<number | null>(null);

  const loadRecentUserProfileDailyNotes = useCallback(
    async (limit = USER_PROFILE_RECENT_NOTES_LIMIT): Promise<UserProfileDailyNote[]> => {
      const notes = await api.profile.listDailyNotes();
      return notes
        .slice()
        .sort((left, right) => right.date.localeCompare(left.date))
        .slice(0, limit);
    },
    [api.profile]
  );

  const refreshUserProfile = useCallback(
    async (options?: { force?: boolean; silent?: boolean }): Promise<boolean> => {
      if (!isHydrated || !isConfigured || isGenerating || userProfileTaskRef.current) {
        return false;
      }

      userProfileTaskRef.current = true;
      setIsUserProfileRefreshing(true);
      try {
        const automationState = await api.profile.getAutomationState();
        const allTrackedMessages = collectProfileTrackedUserMessages(sessions);
        const pendingMessages = getPendingProfileMessages(sessions, automationState);
        const today = getTodayDateString(new Date());
        const forcedTodayMessages = options?.force
          ? allTrackedMessages.filter((message) => getDateStringForTimestamp(message.createdAt) === today)
          : [];
        const messagesNeedingDailyNote = [...pendingMessages, ...forcedTodayMessages];
        const affectedDates = Array.from(
          new Set(
            messagesNeedingDailyNote
              .map((message) => getDateStringForTimestamp(message.createdAt))
              .filter((value): value is string => Boolean(value))
          )
        ).sort();

        for (const date of affectedDates) {
          const dayMessages = allTrackedMessages.filter(
            (message) => getDateStringForTimestamp(message.createdAt) === date
          );
          if (!dayMessages.length) {
            continue;
          }
          const currentNote = await api.profile.getDailyNote(date);
          const nextNote = await runBackgroundChatCompletion({
            api,
            settings,
            messages: buildUserDailyNoteMessages(date, dayMessages, currentNote?.summaryMarkdown)
          });
          if (!nextNote.trim()) {
            continue;
          }
          await api.profile.upsertDailyNote({
            date,
            summaryMarkdown: nextNote,
            sourceMessageCount: dayMessages.length,
            source: "auto"
          });
        }

        const recentNotes = await loadRecentUserProfileDailyNotes();
        if (!recentNotes.length) {
          return false;
        }

        if (!options?.force && pendingMessages.length === 0 && affectedDates.length === 0) {
          return false;
        }

        const currentSnapshot = await api.profile.getSnapshotMarkdown();
        const rewrittenProfile = await runBackgroundChatCompletion({
          api,
          settings,
          messages: buildUserProfileRewriteMessages(currentSnapshot, recentNotes)
        });
        const nextItemDrafts = parseUserProfileRewriteResponse(rewrittenProfile);
        const timestamp = nowIso();
        const nextSnapshot = buildUserProfileSnapshotMarkdown(
          nextItemDrafts.map(
            (item, index): UserProfileItem => ({
              id: `draft-${index}`,
              layer: item.layer,
              title: item.title,
              description: item.description,
              confidence: item.confidence,
              status: "active",
              source: "auto",
              lastConfirmedAt: timestamp,
              createdAt: timestamp,
              updatedAt: timestamp
            })
          )
        );
        await api.profile.replaceAutoProfile({
          items: nextItemDrafts,
          snapshotMarkdown: nextSnapshot
        });

        const lastMessage = pendingMessages[pendingMessages.length - 1];
        await api.profile.saveAutomationState({
          ...automationState,
          lastProcessedUserMessageId: lastMessage?.id || automationState.lastProcessedUserMessageId,
          lastProcessedUserMessageCreatedAt:
            lastMessage?.createdAt || automationState.lastProcessedUserMessageCreatedAt,
          lastProfileUpdatedAt: timestamp,
          lastDailyNoteDate:
            affectedDates[affectedDates.length - 1] || recentNotes[0]?.date || automationState.lastDailyNoteDate
        });
        window.dispatchEvent(new CustomEvent(USER_PROFILE_UPDATED_EVENT));
        return true;
      } catch (error) {
        console.warn(
          "[profile][refresh] failed",
          error instanceof Error ? error.message : "unknown_error"
        );
        if (!options?.silent) {
          setErrorBanner(error instanceof Error ? error.message : "用户画像更新失败。");
        }
        return false;
      } finally {
        userProfileTaskRef.current = false;
        setIsUserProfileRefreshing(false);
      }
    },
    [api, isConfigured, isGenerating, isHydrated, loadRecentUserProfileDailyNotes, sessions, setErrorBanner, settings]
  );

  const scheduleNextUserProfileRefresh = useCallback(() => {
    if (userProfileTimerRef.current !== null) {
      window.clearTimeout(userProfileTimerRef.current);
    }
    userProfileTimerRef.current = window.setTimeout(() => {
      void refreshUserProfile({ force: true, silent: true }).finally(() => {
        scheduleNextUserProfileRefresh();
      });
    }, getNextUserProfileRefreshDelayMs(new Date()));
  }, [refreshUserProfile]);

  useEffect(() => {
    if (!isHydrated || !isConfigured || isGenerating) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void refreshUserProfile({ silent: true });
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isConfigured, isGenerating, isHydrated, refreshUserProfile, sessions]);

  useEffect(() => {
    if (!isHydrated || !isConfigured) {
      return;
    }

    scheduleNextUserProfileRefresh();
    return () => {
      if (userProfileTimerRef.current !== null) {
        window.clearTimeout(userProfileTimerRef.current);
        userProfileTimerRef.current = null;
      }
    };
  }, [isConfigured, isHydrated, scheduleNextUserProfileRefresh]);

  useEffect(() => {
    return () => {
      if (userProfileTimerRef.current !== null) {
        window.clearTimeout(userProfileTimerRef.current);
      }
    };
  }, []);

  return {
    refreshUserProfile,
    isUserProfileRefreshing
  };
};
