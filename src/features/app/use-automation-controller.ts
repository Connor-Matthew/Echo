import type { Dispatch, SetStateAction } from "react";
import { useProfileAutomation } from "../automation/use-profile-automation";
import { useSoulAutomation } from "../automation/use-soul-automation";
import type { MuApi } from "../../lib/mu-api";
import type { AppSettings, ChatSession } from "../../shared/contracts";

type UseAutomationControllerParams = {
  api: MuApi;
  sessions: ChatSession[];
  settings: AppSettings;
  isHydrated: boolean;
  isConfigured: boolean;
  isGenerating: boolean;
  setErrorBanner: Dispatch<SetStateAction<string | null>>;
  showSoulStatus: (message: string) => void;
};

export const useAutomationController = ({
  api,
  sessions,
  settings,
  isHydrated,
  isConfigured,
  isGenerating,
  setErrorBanner,
  showSoulStatus
}: UseAutomationControllerParams) => {
  const {
    isJournalGenerating,
    generateTodayJournal
  } = useSoulAutomation({
    api,
    sessions,
    settings,
    isHydrated,
    isConfigured,
    isGenerating,
    setErrorBanner,
    showSoulStatus
  });

  const { refreshUserProfile, isUserProfileRefreshing } = useProfileAutomation({
    api,
    sessions,
    settings,
    isHydrated,
    isConfigured,
    isGenerating,
    setErrorBanner
  });

  return {
    isJournalGenerating,
    generateTodayJournal,
    isUserProfileRefreshing,
    refreshUserProfile
  };
};
