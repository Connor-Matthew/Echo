import { useEffect, useRef, useState, type RefObject } from "react";

export const extractSlashCommandQuery = (value: string): string | null => {
  const match = value.match(/^\/(\S*)$/);
  return match ? match[1] : null;
};

const useDismissOnOutside = (
  isOpen: boolean,
  setIsOpen: (next: boolean) => void,
  rootRef: RefObject<HTMLDivElement>
) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, rootRef, setIsOpen]);
};

export const useComposerPanels = () => {
  const quickSettingsRef = useRef<HTMLDivElement>(null);
  const mcpPopoverRef = useRef<HTMLDivElement>(null);
  const skillsPickerRef = useRef<HTMLDivElement>(null);

  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState(false);
  const [isMcpPopoverOpen, setIsMcpPopoverOpen] = useState(false);
  const [isSkillsPickerOpen, setIsSkillsPickerOpen] = useState(false);

  useDismissOnOutside(isQuickSettingsOpen, setIsQuickSettingsOpen, quickSettingsRef);
  useDismissOnOutside(isMcpPopoverOpen, setIsMcpPopoverOpen, mcpPopoverRef);
  useDismissOnOutside(isSkillsPickerOpen, setIsSkillsPickerOpen, skillsPickerRef);

  return {
    quickSettingsRef,
    mcpPopoverRef,
    skillsPickerRef,
    isQuickSettingsOpen,
    setIsQuickSettingsOpen,
    isMcpPopoverOpen,
    setIsMcpPopoverOpen,
    isSkillsPickerOpen,
    setIsSkillsPickerOpen
  };
};
