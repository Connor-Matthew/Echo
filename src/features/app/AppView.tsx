import { PanelLeft } from "lucide-react";
import { AgentView } from "../../components/AgentView";
import { AttachmentTray } from "../../components/AttachmentTray";
import { ChatView } from "../../components/ChatView";
import { Composer } from "../../components/Composer";
import { SettingsCenter } from "../../components/SettingsCenter";
import { Sidebar } from "../../components/Sidebar";
import { Button } from "../../components/ui/button";
import { mergeSkills } from "../../lib/skills-utils";
import { useAppController } from "./use-app-controller";

export const AppView = () => {
  const controller = useAppController();
  const {
    TOP_FRAME_HEIGHT_PX,
    activeView,
    setActiveView,
    activeSettingsSection,
    setActiveSettingsSection,
    activeSession,
    activeSessionId,
    setActiveSessionId,
    orderedChatSessions,
    userSkills,
    saveUserSkills,
    activeSkill,
    setActiveSkill,
    activeEnabledMcpServers,
    updateSessionMcpServers,
    settings,
    isConfigured,
    composerModelOptions,
    activeComposerModelValue,
    activeModelCapabilities,
    composerUsageLabel,
    selectComposerModel,
    updateChatContextWindow,
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
    errorBanner,
    undoDelete,
    createNewChat,
    renameChat,
    deleteChat,
    toggleChatPin,
    exportSession,
    exportSessionMarkdown,
    exportSessions,
    importSessions,
    clearAllSessions,
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
    deleteAgentSession,
    isHydrated,
    isSidebarOpen,
    setIsSidebarOpen,
    isChatDragOver,
    sidebarWidth,
    showFloatingSidebarToggle,
    showCenteredChatLanding,
    activeChatMessageCount,
    closeSidebarIfCompact,
    openSettings,
    handleChatDragEnter,
    handleChatDragOver,
    handleChatDragLeave,
    handleChatDrop,
    saveSettings,
    testConnection,
    testMemosConnection,
    listModels,
    listMcpServers,
    listMcpServerStatus,
    reloadMcpServers,
    resetSettings
  } = controller;

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
        <div className="sketch-panel rounded-lg px-6 py-5 text-center">
          <p className="sketch-title text-[24px] leading-none text-foreground sm:text-[28px]">Echo</p>
          <p className="mt-2 text-sm">正在加载工作区...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="app-shell relative h-screen min-w-0 overflow-hidden bg-background"
      data-file-dragging={activeView === "chat" && isChatDragOver ? "true" : "false"}
    >
      <div className="app-window-drag-layer" style={{ left: 0, height: TOP_FRAME_HEIGHT_PX }} aria-hidden />

      <div
        className="relative grid h-full gap-0 transition-[grid-template-columns] duration-300 ease-out"
        style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0, 1fr)` }}
      >
        <div
          className={`sketch-panel overflow-hidden rounded-none border-r transition-[transform,opacity] duration-250 ease-out ${
            !isSidebarOpen
              ? "-translate-x-[110%] opacity-0 pointer-events-none"
              : "translate-x-0 opacity-100"
          }`}
        >
          {sidebarContent}
        </div>

        <main
          className={[
            "sketch-panel relative flex min-h-0 flex-col overflow-hidden rounded-none border transition-colors",
            isSidebarOpen ? "border-l-0" : "",
            activeView === "chat" && isChatDragOver
              ? "border-primary bg-accent/30"
              : "border-border/70"
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
          {showFloatingSidebarToggle ? (
            <div className="absolute left-[92px] top-0 z-20">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 rounded-none bg-transparent p-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                onClick={() => setIsSidebarOpen((previous) => !previous)}
                aria-label="展开侧边栏"
                title="展开侧边栏"
              >
                <PanelLeft className="h-4 w-4" />
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
                <section className="flex h-full w-full items-center justify-center px-4 py-6 sm:px-6">
                  <div className="w-full max-w-[920px]">
                    <h2 className="mb-14 text-center text-[36px] font-semibold leading-tight text-foreground sm:mb-16 sm:text-[44px] md:mb-20">
                      今天有什么可以帮到你？
                    </h2>
                    <div className="mx-auto w-full max-w-[720px]">
                      <AttachmentTray
                        attachments={draftAttachments}
                        onRemoveAttachment={removeAttachment}
                      />
                      <Composer
                        value={draft}
                        modelLabel={settings.model || "模型"}
                        modelValue={activeComposerModelValue}
                        modelOptions={composerModelOptions}
                        modelCapabilities={activeModelCapabilities}
                        sendWithEnter={settings.sendWithEnter}
                        chatContextWindow={settings.chatContextWindow}
                        attachmentCount={draftAttachments.length}
                        mcpServers={settings.mcpServers ?? []}
                        enabledMcpServers={activeEnabledMcpServers}
                        skills={mergeSkills(userSkills)}
                        activeSkill={activeSkill}
                        onChangeActiveSkill={setActiveSkill}
                        onAddFiles={addFiles}
                        onChangeChatContextWindow={updateChatContextWindow}
                        onSelectModel={selectComposerModel}
                        onChangeMcpServers={updateSessionMcpServers}
                        onChange={setDraft}
                        onSubmit={(value) => {
                          void sendMessage(value);
                        }}
                        onApplySkill={(skill, params, input) => {
                          handleApplySkill(skill, params, input);
                        }}
                        onStop={() => {
                          void stopGenerating();
                        }}
                        usageLabel={composerUsageLabel}
                        disabled={!isConfigured}
                        isGenerating={isGenerating}
                      />
                    </div>
                  </div>
                </section>
              ) : (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex min-h-0 flex-1 flex-col bg-transparent">
                    <div
                      className={[
                        "paper-conversation-stage mx-auto mt-0 flex h-8 w-full items-center justify-between px-3 text-[12px] text-muted-foreground sm:px-4",
                        showFloatingSidebarToggle ? "pl-[132px] sm:pl-[136px]" : ""
                      ].join(" ")}
                    >
                      <span />
                      <span className="leading-none">
                        消息 {activeChatMessageCount}
                      </span>
                    </div>
                    <div className="min-h-0 flex-1">
                      <ChatView
                        sessionId={activeSessionId}
                        messages={activeSession?.messages ?? []}
                        isConfigured={isConfigured}
                        isGenerating={isGenerating}
                        onEditMessage={editMessage}
                        onDeleteMessage={deleteMessage}
                        onResendMessage={resendMessage}
                      />
                    </div>
                  </div>

                  <div className="px-2 pb-2 pt-0 sm:px-3 sm:pb-3 md:px-4 md:pb-4">
                    <div className="paper-conversation-stage mx-auto w-full max-w-[720px] min-w-0">
                      <AttachmentTray
                        attachments={draftAttachments}
                        onRemoveAttachment={removeAttachment}
                      />
                      <Composer
                        value={draft}
                        modelLabel={settings.model || "模型"}
                        modelValue={activeComposerModelValue}
                        modelOptions={composerModelOptions}
                        modelCapabilities={activeModelCapabilities}
                        sendWithEnter={settings.sendWithEnter}
                        chatContextWindow={settings.chatContextWindow}
                        attachmentCount={draftAttachments.length}
                        mcpServers={settings.mcpServers ?? []}
                        enabledMcpServers={activeEnabledMcpServers}
                        skills={mergeSkills(userSkills)}
                        activeSkill={activeSkill}
                        onChangeActiveSkill={setActiveSkill}
                        onAddFiles={addFiles}
                        onChangeChatContextWindow={updateChatContextWindow}
                        onSelectModel={selectComposerModel}
                        onChangeMcpServers={updateSessionMcpServers}
                        onChange={setDraft}
                        onSubmit={(value) => {
                          void sendMessage(value);
                        }}
                        onApplySkill={(skill, params, input) => {
                          handleApplySkill(skill, params, input);
                        }}
                        onStop={() => {
                          void stopGenerating();
                        }}
                        usageLabel={composerUsageLabel}
                        disabled={!isConfigured}
                        isGenerating={isGenerating}
                      />
                    </div>
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
                      permissionRequest={activeAgentPermissionRequest}
                      onResolvePermission={resolveAgentPermissionRequest}
                    />
                  </div>
                )}
              </div>

              <div
                className="px-2 pb-2 pt-0 sm:px-3 sm:pb-3 md:px-4 md:pb-4"
                data-agent-composer-root="true"
              >
                <div className="paper-conversation-stage mx-auto w-full min-w-0">
                  <AttachmentTray
                    attachments={agentDraftAttachments}
                    onRemoveAttachment={removeAgentAttachment}
                  />
                  <Composer
                    value={agentDraft}
                    modelLabel={agentSettingsSnapshot?.model || "Agent 模型"}
                    modelValue={activeAgentModelValue}
                    modelOptions={agentModelOptions}
                    modelCapabilities={activeModelCapabilities}
                    sendWithEnter={settings.sendWithEnter}
                    chatContextWindow={settings.chatContextWindow}
                    attachmentCount={agentDraftAttachments.length}
                    mcpServers={[]}
                    enabledMcpServers={[]}
                    skills={[]}
                    activeSkill={null}
                    onChangeActiveSkill={() => {}}
                    onAddFiles={addAgentFiles}
                    onChangeChatContextWindow={updateChatContextWindow}
                    onSelectModel={selectAgentModel}
                    onChangeMcpServers={() => {}}
                    onChange={setAgentDraft}
                    onSubmit={(value) => {
                      void sendAgentMessage(value);
                    }}
                    onApplySkill={() => {}}
                    onStop={() => {
                      void stopAgentRun();
                    }}
                    usageLabel={null}
                    disabled={!isAgentConfigured || isAgentRunning}
                    disabledPlaceholder={isAgentRunning ? "Agent 正在运行..." : "请先完成模型配置"}
                    isGenerating={isAgentRunning}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <header className="border-b border-border/70 bg-card px-3 py-2.5 sm:px-4">
                <div className="flex items-start gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      工作区
                    </p>
                    <p className="text-[17px] font-semibold leading-none text-foreground sm:text-[19px]">
                      设置
                    </p>
                  </div>
                </div>
              </header>
              <SettingsCenter
                section={activeSettingsSection}
                userSkills={userSkills}
                onSaveUserSkills={saveUserSkills}
                settings={settings}
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
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
};
