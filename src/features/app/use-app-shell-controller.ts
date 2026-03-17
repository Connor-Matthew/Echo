import type { Dispatch, SetStateAction } from "react";
import type { AppSettings } from "../../shared/contracts";
import { useAppUiState } from "./use-app-ui-state";

const TOP_FRAME_HEIGHT_PX = 12;

type UseAppShellControllerParams = {
  settings: AppSettings;
  isHydrated: boolean;
  errorBanner: string | null;
  setErrorBanner: Dispatch<SetStateAction<string | null>>;
};

export const useAppShellController = ({
  settings,
  isHydrated,
  errorBanner,
  setErrorBanner
}: UseAppShellControllerParams) => {
  const { errorBanner: _ignoredErrorBanner, setErrorBanner: _ignoredSetErrorBanner, ...uiState } =
    useAppUiState({ settings });

  return {
    topFrameHeightPx: TOP_FRAME_HEIGHT_PX,
    isHydrated,
    errorBanner,
    setErrorBanner,
    ...uiState
  };
};
