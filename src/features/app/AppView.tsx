import { useEffect, useMemo, useState } from "react";
import { PanelLeft } from "lucide-react";
import { AgentView } from "../../components/AgentView";
import { ChatView } from "../../components/ChatView";
import { CommandPalette } from "../../components/CommandPalette";
import {
  detectIsMacPlatform,
  isEditableEventTarget,
  matchesShortcut
} from "../../components/command-palette/shortcut-utils";
import { SettingsCenter } from "../../components/SettingsCenter";
import { Sidebar } from "../../components/Sidebar";
import { Button } from "../../components/ui/button";
import { AgentComposerPanel } from "./AgentComposerPanel";
import { buildCommandPaletteCommands } from "./build-command-palette-commands";
import { ChatSessionHeader } from "./chat-session-header";
import { useAppController } from "./use-app-controller";
import { ChatComposerPanel } from "./ChatComposerPanel";

export const getFloatingSidebarToggleContainerClassName = (isMacPlatform: boolean) =>
  isMacPlatform ? "absolute left-[96px] top-2 z-20" : "absolute left-3 top-3 z-20";

export const getChatHeaderClassNameForFloatingToggle = (
  showFloatingSidebarToggle: boolean,
  isMacPlatform: boolean
) => {
  if (!showFloatingSidebarToggle) {
    return undefined;
  }

  if (isMacPlatform) {
    return "pl-[144px] sm:pl-[148px]";
  }

  return "pl-[132px] sm:pl-[136px]";
};

export const getCenteredLandingComposerClassName = () =>
  "chat-reading-stage mx-auto w-full min-w-0";

export const CENTERED_LANDING_HEADING_TEXT = "Welcome back.";

export const getCenteredLandingHeadingClassName = () =>
  "landing-title-hero mb-10 text-center text-[36px] font-semibold leading-tight text-foreground sm:mb-12 sm:text-[44px] md:mb-14";

export const AppView = () => {
  const controller = useAppController();
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const {
    shell,
    chat,
    agent,
    settings,
    automation
  } = controller;
  const {
    topFrameHeightPx,
    activeView,
    setActiveView,
    activeSettingsSection,
    setActiveSettingsSection,
    errorBanner,
    soulStatusToast,
    isHydrated,
    isSidebarOpen,
    setIsSidebarOpen,
    sidebarWidth,
    showFloatingSidebarToggle,
    closeSidebarIfCompact,
    openSettings
  } = shell;
  const {
    activeSession,
    activeSessionId,
    setActiveSessionId,
    orderedChatSessions,
    activeEnabledMcpServers,
    isConfigured,
    composerModelOptions,
    activeComposerModelValue,
    activeModelCapabilities,
    composerUsageLabel,
    selectComposerModel,
    updateChatContextWindow,
    updateSessionMcpServers,
    isGenerating,
    draft,
    setDraft,
    draftAttachments,
    addFiles,
    removeAttachment,
    sendMessage,
    resendMessage,
    editMessage,
    deleteMessage,
    handleApplySkill,
    stopGenerating,
    removedSession,
    undoDelete,
    createNewChat,
    renameChat,
    deleteChat,
    toggleChatPin,
    updateSessionSoulMode,
    exportSession,
    exportSessionMarkdown,
    exportSessions,
    importSessions,
    clearAllSessions,
    isChatDragOver,
    showCenteredChatLanding,
    handleChatDragEnter,
    handleChatDragOver,
    handleChatDragLeave,
    handleChatDrop,
    activeSkill,
    setActiveSkill
  } = chat;
  const {
    agentSessions,
    activeAgentSessionId,
    setActiveAgentSessionId,
    activeAgentMessages,
    activeAgentPermissionRequest,
    resolveAgentPermissionRequest,
    agentSettingsSnapshot,
    isAgentConfigured,
    agentModelOptions,
    activeAgentModelValue,
    selectAgentModel,
    agentDraft,
    setAgentDraft,
    agentDraftAttachments,
    addAgentFiles,
    removeAgentAttachment,
    sendAgentMessage,
    isAgentRunning,
    stopAgentRun,
    agentErrorBanner,
    createNewAgentSession,
    renameAgentSession,
    deleteAgentSession
  } = agent;
  const {
    userSkills,
    saveUserSkills,
    settings: appSettings,
    saveSettings,
    testConnection,
    testMemosConnection,
    listModels,
    listMcpServers,
    listMcpServerStatus,
    reloadMcpServers,
    resetSettings
  } = settings;
  const {
    isJournalGenerating,
    generateTodayJournal,
    isUserProfileRefreshing,
    refreshUserProfile
  } = automation;

  const focusComposerInView = (view: "chat" | "agent") => {
    window.requestAnimationFrame(() => {
      const selector =
        view === "agent"
          ? "[data-agent-composer-root='true'] textarea"
          : "[data-chat-composer-root='true'] textarea";
      document.querySelector<HTMLTextAreaElement>(selector)?.focus();
    });
  };

  const isSoulModeEnabled = activeSession?.soulModeEnabled !== false;
  const toggleSoulMode = () => {
    if (!activeSession) {
      return;
    }
    updateSessionSoulMode(activeSession.id, activeSession.soulModeEnabled === false);
  };
  const isMacPlatform = useMemo(() => detectIsMacPlatform(), []);

  const commandPaletteCommands = useMemo(
    () =>
      buildCommandPaletteCommands({
        shell,
        chat,
        agent,
        settings,
        focusComposerInView,
      }),
    [
      agent,
      chat,
      settings,
      shell
    ]
  );

  const shortcutCommands = useMemo(
    () => commandPaletteCommands.filter((command) => Boolean(command.shortcut)),
    [commandPaletteCommands]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isPaletteToggle = matchesShortcut(event, "mod+k", isMacPlatform);
      if (isPaletteToggle) {
        event.preventDefault();
        setIsCommandPaletteOpen((previous) => !previous);
        return;
      }

      if (isEditableEventTarget(event.target)) {
        return;
      }

      if (isCommandPaletteOpen) {
        return;
      }

      const matchedCommand = shortcutCommands.find(
        (command) =>
          typeof command.shortcut === "string" &&
          matchesShortcut(event, command.shortcut, isMacPlatform)
      );
      if (!matchedCommand) {
        return;
      }
      event.preventDefault();
      matchedCommand.onSelect();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCommandPaletteOpen, isMacPlatform, shortcutCommands]);

  const sidebarContent =
    activeView === "chat" ? (
      <Sidebar
        mode="chat"
        sessions={orderedChatSessions}
        activeSessionId={activeSessionId}
        userSkills={userSkills}
        onSelectSession={(sessionId) => {
          setActiveSessionId(sessionId);
          closeSidebarIfCompact();
        }}
        onCreateSession={() => {
          createNewChat();
          closeSidebarIfCompact();
        }}
        onRenameSession={(sessionId, title) => renameChat(sessionId, title)}
        onDeleteSession={deleteChat}
        onTogglePinSession={toggleChatPin}
        onExportSession={exportSession}
        onExportSessionMarkdown={exportSessionMarkdown}
        onEnterAgent={() => {
          setActiveView("agent");
          closeSidebarIfCompact();
        }}
        onEnterSettings={(section) => openSettings(section ?? "provider")}
        onSaveUserSkills={saveUserSkills}
        onToggleSidebar={() => setIsSidebarOpen(false)}
      />
    ) : activeView === "agent" ? (
      <Sidebar
        mode="agent"
        sessions={agentSessions}
        activeSessionId={activeAgentSessionId}
        onSelectSession={(sessionId) => {
          setActiveAgentSessionId(sessionId);
          closeSidebarIfCompact();
        }}
        onCreateSession={() => {
          void createNewAgentSession();
          closeSidebarIfCompact();
        }}
        onRenameSession={(sessionId, title) => {
          void renameAgentSession(sessionId, title);
        }}
        onDeleteSession={(sessionId) => {
          void deleteAgentSession(sessionId);
        }}
        onEnterChat={() => {
          setActiveView("chat");
          closeSidebarIfCompact();
        }}
        onEnterSettings={(section) => openSettings(section ?? "provider")}
        onToggleSidebar={() => setIsSidebarOpen(false)}
      />
    ) : (
      <Sidebar
        mode="settings"
        settingsSection={activeSettingsSection}
        onSelectSettingsSection={(section) => {
          setActiveSettingsSection(section);
          closeSidebarIfCompact();
        }}
        onExitSettings={() => {
          setActiveView("chat");
          closeSidebarIfCompact();
        }}
        onToggleSidebar={() => setIsSidebarOpen(false)}
      />
    );

  if (!isHydrated) {
    return (
      <div className="grid h-screen place-content-center bg-background text-muted-foreground">
        <div className="sketch-panel rounded-[24px] px-8 py-7 text-center">
          <p className="sketch-title text-[24px] leading-none text-foreground sm:text-[28px]">Echo</p>
          <p className="mt-2 text-sm">正在加载工作区...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="app-shell relative h-screen min-w-0 overflow-hidden bg-background p-0"
      data-file-dragging={activeView === "chat" && isChatDragOver ? "true" : "false"}
    >
      <div className="app-window-drag-layer" style={{ left: 0, height: topFrameHeightPx }} aria-hidden />

      <div
        className="app-shell-frame relative grid h-full transition-[grid-template-columns,column-gap] duration-300 ease-out"
        style={{
          gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)`,
          columnGap: isSidebarOpen ? "var(--echo-shell-column-gap-open)" : "0rem"
        }}
      >
        <div
          className={`app-shell-panel app-shell-panel-sidebar overflow-hidden transition-[transform,opacity] duration-250 ease-out ${
            !isSidebarOpen
              ? "-translate-x-[110%] opacity-0 pointer-events-none"
              : "translate-x-0 opacity-100"
          }`}
        >
          {sidebarContent}
        </div>

        <main
          className={[
            "app-shell-panel relative flex min-h-0 flex-col overflow-hidden transition-colors",
            activeView === "chat" && isChatDragOver
              ? "border-primary bg-accent/30"
              : ""
          ].join(" ")}
          onDragEnter={handleChatDragEnter}
          onDragOver={handleChatDragOver}
          onDragLeave={handleChatDragLeave}
          onDrop={handleChatDrop}
        >
          {activeView === "chat" && isChatDragOver ? (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/40">
              <div className="rounded-md border border-primary/55 bg-card px-4 py-2 text-sm font-medium text-primary">
                松开鼠标即可添加附件
              </div>
            </div>
          ) : null}
          {activeView === "chat" && soulStatusToast ? (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4">
              <div className="state-note min-w-[220px] max-w-[420px] whitespace-pre-line rounded-full px-4 py-2 text-center text-sm">
                {soulStatusToast}
              </div>
            </div>
          ) : null}
          {showFloatingSidebarToggle ? (
            <div className={getFloatingSidebarToggleContainerClassName(isMacPlatform)}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={[
                  "floating-sidebar-toggle rounded-full p-0 text-muted-foreground hover:text-foreground",
                  isMacPlatform ? "h-8 w-8" : "h-9 w-9"
                ].join(" ")}
                onClick={() => setIsSidebarOpen((previous) => !previous)}
                aria-label="展开侧边栏"
                title="展开侧边栏"
              >
                <PanelLeft className={isMacPlatform ? "h-[18px] w-[18px]" : "h-4 w-4"} />
              </Button>
            </div>
          ) : null}
          {activeView === "chat" ? (
            <>
              {removedSession || errorBanner ? (
                <div className="mx-auto mt-2 grid w-[min(920px,calc(100%-40px))] gap-2">
                  {removedSession ? (
                    <div className="state-note flex items-center justify-between px-3 py-2">
                      <span>会话已删除。</span>
                      <Button
                        variant="ghost"
                        className="h-auto px-1 py-0.5 text-primary"
                        onClick={undoDelete}
                      >
                        撤销
                      </Button>
                    </div>
                  ) : null}

                  {errorBanner ? (
                    <div className="state-error px-3 py-2 text-sm">
                      {errorBanner}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {showCenteredChatLanding ? (
                <section className="flex h-full w-full flex-col px-4 py-6 sm:px-6">
                  <div className="w-full max-w-[920px] self-center">
                    <ChatSessionHeader
                      className="mb-10 border-b-0"
                      title={activeSession?.title ?? "New Chat"}
                    />
                  </div>
                  <div className="flex min-h-0 flex-1 items-center justify-center">
                    <div className="w-full max-w-[920px]">
                      <h2 className={getCenteredLandingHeadingClassName()}>
                        {CENTERED_LANDING_HEADING_TEXT}
                      </h2>
                      <ChatComposerPanel
                        draft={draft}
                        setDraft={setDraft}
                        draftAttachments={draftAttachments}
                        removeAttachment={removeAttachment}
                        addFiles={addFiles}
                        appSettings={appSettings}
                        activeComposerModelValue={activeComposerModelValue}
                        composerModelOptions={composerModelOptions}
                        activeModelCapabilities={activeModelCapabilities}
                        activeEnabledMcpServers={activeEnabledMcpServers}
                        userSkills={userSkills}
                        activeSkill={activeSkill}
                        setActiveSkill={setActiveSkill}
                        updateChatContextWindow={updateChatContextWindow}
                        selectComposerModel={selectComposerModel}
                        updateSessionMcpServers={updateSessionMcpServers}
                        sendMessage={sendMessage}
                        handleApplySkill={handleApplySkill}
                        stopGenerating={stopGenerating}
                        composerUsageLabel={composerUsageLabel}
                        isConfigured={isConfigured}
                        isGenerating={isGenerating}
                        isSoulModeEnabled={isSoulModeEnabled}
                        toggleSoulMode={toggleSoulMode}
                        containerClassName={getCenteredLandingComposerClassName()}
                      />
                    </div>
                  </div>
                </section>
              ) : (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex min-h-0 flex-1 flex-col bg-transparent">
                    <ChatSessionHeader
                      className={getChatHeaderClassNameForFloatingToggle(
                        showFloatingSidebarToggle,
                        isMacPlatform
                      )}
                      title={activeSession?.title ?? "New Chat"}
                    />
                    <div className="min-h-0 flex-1">
                      <ChatView
                        sessionId={activeSessionId}
                        messages={activeSession?.messages ?? []}
                        isConfigured={isConfigured}
                        isGenerating={isGenerating}
                        markdownRenderMode={appSettings.markdownRenderMode}
                        onEditMessage={editMessage}
                        onDeleteMessage={deleteMessage}
                        onResendMessage={resendMessage}
                      />
                    </div>
                  </div>

                  <div className="px-2 pb-2 pt-0 sm:px-3 sm:pb-3 md:px-4 md:pb-4">
                    <ChatComposerPanel
                      draft={draft}
                      setDraft={setDraft}
                      draftAttachments={draftAttachments}
                      removeAttachment={removeAttachment}
                      addFiles={addFiles}
                      appSettings={appSettings}
                      activeComposerModelValue={activeComposerModelValue}
                      composerModelOptions={composerModelOptions}
                      activeModelCapabilities={activeModelCapabilities}
                      activeEnabledMcpServers={activeEnabledMcpServers}
                      userSkills={userSkills}
                      activeSkill={activeSkill}
                      setActiveSkill={setActiveSkill}
                      updateChatContextWindow={updateChatContextWindow}
                      selectComposerModel={selectComposerModel}
                      updateSessionMcpServers={updateSessionMcpServers}
                      sendMessage={sendMessage}
                      handleApplySkill={handleApplySkill}
                      stopGenerating={stopGenerating}
                      composerUsageLabel={composerUsageLabel}
                      isConfigured={isConfigured}
                      isGenerating={isGenerating}
                      isSoulModeEnabled={isSoulModeEnabled}
                      toggleSoulMode={toggleSoulMode}
                      containerClassName={getCenteredLandingComposerClassName()}
                    />
                  </div>
                </div>
              )}
            </>
          ) : activeView === "agent" ? (
            <div className="flex h-full min-h-0 flex-col">
              {agentErrorBanner ? (
                <div className="mx-auto mt-2 w-[min(920px,calc(100%-40px))]">
                  <div className="state-error px-3 py-2 text-sm">
                    {agentErrorBanner}
                  </div>
                </div>
              ) : null}

              {!isAgentConfigured ? (
                <div className="mx-auto mt-2 w-[min(920px,calc(100%-40px))]">
                  <div className="state-warning px-3 py-2 text-sm">
                    请在设置中选择 `Claude Agent SDK` 或 `Anthropic` 兼容渠道，并配置 API Key / Model。
                    例如：`https://api.siliconflow.cn/v1/messages` 这类 Anthropic 兼容地址。
                  </div>
                </div>
              ) : null}

              <div className="min-h-0 flex-1">
                {activeAgentMessages.length === 0 && isAgentConfigured ? (
                  <section className="flex h-full w-full items-center justify-center px-4 py-6 sm:px-6">
                    <div className="w-full max-w-[920px]">
                      <h2 className="mb-4 text-center text-[34px] font-semibold leading-tight text-foreground sm:text-[40px]">
                        Agent 模式，直接下达任务
                      </h2>
                      <p className="text-center text-sm text-muted-foreground sm:text-base">
                        例如：重构设置页并补充测试，最后给出变更摘要。
                      </p>
                    </div>
                  </section>
                ) : (
                  <div className="h-full min-h-0 bg-transparent">
                    <AgentView
                      sessionId={activeAgentSessionId}
                      messages={activeAgentMessages}
                      isRunning={isAgentRunning}
                      markdownRenderMode={appSettings.markdownRenderMode}
                      permissionRequest={activeAgentPermissionRequest}
                      onResolvePermission={resolveAgentPermissionRequest}
                    />
                  </div>
                )}
              </div>

              <div
                className="px-2 pb-2 pt-0 sm:px-3 sm:pb-3 md:px-4 md:pb-4"
              >
                <AgentComposerPanel
                  draft={agentDraft}
                  setDraft={setAgentDraft}
                  draftAttachments={agentDraftAttachments}
                  removeAttachment={removeAgentAttachment}
                  addFiles={addAgentFiles}
                  appSettings={appSettings}
                  agentModelLabel={agentSettingsSnapshot?.model || "Agent 模型"}
                  activeAgentModelValue={activeAgentModelValue}
                  agentModelOptions={agentModelOptions}
                  activeModelCapabilities={activeModelCapabilities}
                  updateChatContextWindow={updateChatContextWindow}
                  selectAgentModel={selectAgentModel}
                  sendAgentMessage={sendAgentMessage}
                  stopAgentRun={stopAgentRun}
                  isAgentConfigured={isAgentConfigured}
                  isAgentRunning={isAgentRunning}
                  containerClassName={getCenteredLandingComposerClassName()}
                />
              </div>
            </div>
          ) : (
            <>
              <header className="border-b border-border/70 bg-card px-5 py-3 sm:px-6">
                <div className="flex items-start gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      工作区
                    </p>
                    <p className="text-[16px] font-semibold leading-none text-foreground sm:text-[18px]">
                      设置
                    </p>
                  </div>
                </div>
              </header>
              <SettingsCenter
                section={activeSettingsSection}
                userSkills={userSkills}
                onSaveUserSkills={saveUserSkills}
                settings={appSettings}
                onSave={saveSettings}
                onTest={testConnection}
                onTestMemos={testMemosConnection}
                onListModels={listModels}
                onListMcpServers={listMcpServers}
                onListMcpServerStatus={listMcpServerStatus}
                onReloadMcpServers={reloadMcpServers}
                onExportSessions={exportSessions}
                onImportSessions={importSessions}
                onClearSessions={clearAllSessions}
                onResetSettings={resetSettings}
                onGenerateTodayJournal={generateTodayJournal}
                isJournalGenerating={isJournalGenerating}
                onRefreshUserProfile={refreshUserProfile}
                isUserProfileRefreshing={isUserProfileRefreshing}
              />
            </>
          )}
        </main>
      </div>

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        commands={commandPaletteCommands}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </div>
  );
};
