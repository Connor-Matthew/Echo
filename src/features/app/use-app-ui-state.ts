import { useCallback, useEffect, useRef, useState } from "react";
import type { SettingsSection } from "../../components/Sidebar";
import {
  SIDEBAR_AUTO_HIDE_WIDTH,
  getCurrentViewportWidth,
  getResponsiveSidebarWidth
} from "../chat/utils/chat-utils";
import type { AppSettings } from "../../shared/contracts";

export type AppView = "chat" | "agent" | "settings";

const SOUL_TOAST_DURATION_MS = 2000;

type UseAppUiStateParams = {
  settings: AppSettings;
};

export const useAppUiState = ({ settings }: UseAppUiStateParams) => {
  const [activeView, setActiveView] = useState<AppView>("chat");
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSection>("provider");
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [soulStatusToast, setSoulStatusToast] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(getCurrentViewportWidth);
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    () => getCurrentViewportWidth() >= SIDEBAR_AUTO_HIDE_WIDTH
  );

  const soulToastTimeoutRef = useRef<number | null>(null);
  const wasCompactLayoutRef = useRef(getCurrentViewportWidth() < SIDEBAR_AUTO_HIDE_WIDTH);
  const isCompactLayout = viewportWidth < SIDEBAR_AUTO_HIDE_WIDTH;

  const showSoulStatus = useCallback((message: string) => {
    if (soulToastTimeoutRef.current !== null) {
      window.clearTimeout(soulToastTimeoutRef.current);
    }
    setSoulStatusToast(message);
    soulToastTimeoutRef.current = window.setTimeout(() => {
      setSoulStatusToast(null);
      soulToastTimeoutRef.current = null;
    }, SOUL_TOAST_DURATION_MS);
  }, []);

  const closeSidebarIfCompact = useCallback(() => {
    if (isCompactLayout) {
      setIsSidebarOpen(false);
    }
  }, [isCompactLayout]);

  const openSettings = useCallback(
    (section: SettingsSection = "provider") => {
      setActiveSettingsSection(section);
      setActiveView("settings");
      closeSidebarIfCompact();
    },
    [closeSidebarIfCompact]
  );

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const wasCompact = wasCompactLayoutRef.current;
    if (!wasCompact && isCompactLayout) {
      setIsSidebarOpen(false);
    }
    if (wasCompact && !isCompactLayout) {
      setIsSidebarOpen(true);
    }
    wasCompactLayoutRef.current = isCompactLayout;
  }, [isCompactLayout]);

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolvedTheme =
        settings.theme === "system" ? (mediaQuery.matches ? "dark" : "light") : settings.theme;
      root.classList.toggle("dark", resolvedTheme === "dark");
      root.style.colorScheme = resolvedTheme;
    };

    applyTheme();

    if (settings.theme !== "system") {
      return;
    }

    const handleChange = () => {
      applyTheme();
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [settings.theme]);

  useEffect(() => {
    return () => {
      if (soulToastTimeoutRef.current !== null) {
        window.clearTimeout(soulToastTimeoutRef.current);
      }
    };
  }, []);

  const sidebarWidth = isSidebarOpen ? getResponsiveSidebarWidth(viewportWidth) : 0;
  const showFloatingSidebarToggle = isCompactLayout || !isSidebarOpen;

  return {
    activeView,
    setActiveView,
    activeSettingsSection,
    setActiveSettingsSection,
    errorBanner,
    setErrorBanner,
    soulStatusToast,
    showSoulStatus,
    viewportWidth,
    isCompactLayout,
    isSidebarOpen,
    setIsSidebarOpen,
    sidebarWidth,
    showFloatingSidebarToggle,
    closeSidebarIfCompact,
    openSettings
  };
};
