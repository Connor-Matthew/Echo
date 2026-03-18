import { Bot } from "lucide-react";
import { AttachmentTray } from "../../components/AttachmentTray";
import { Composer } from "../../components/Composer";
import { Button } from "../../components/ui/button";
import type { AppSettings, Skill, ModelCapabilities } from "../../shared/contracts";
import type { DraftAttachment } from "./draft-attachments";

type ChatComposerPanelProps = {
  draft: string;
  setDraft: (value: string) => void;
  draftAttachments: DraftAttachment[];
  removeAttachment: (id: string) => void;
  addFiles: (files: FileList | File[] | null) => void;
  appSettings: AppSettings;
  activeComposerModelValue: string;
  composerModelOptions: Array<{ value: string; label: string }>;
  activeModelCapabilities: ModelCapabilities;
  activeEnabledMcpServers: string[];
  userSkills: Skill[];
  activeSkill: Skill | null;
  setActiveSkill: (skill: Skill | null) => void;
  updateChatContextWindow: (window: AppSettings["chatContextWindow"]) => void;
  selectComposerModel: (value: string) => void;
  updateSessionMcpServers: (serverIds: string[]) => void;
  sendMessage: (value: string) => Promise<void>;
  handleApplySkill: (skill: Skill, params: Record<string, string>, input: string) => void;
  stopGenerating: () => Promise<void>;
  composerUsageLabel: string | null;
  isConfigured: boolean;
  isGenerating: boolean;
  isSoulModeEnabled: boolean;
  toggleSoulMode: () => void;
  containerClassName?: string;
};

export const ChatComposerPanel = ({
  draft,
  setDraft,
  draftAttachments,
  removeAttachment,
  addFiles,
  appSettings,
  activeComposerModelValue,
  composerModelOptions,
  activeModelCapabilities,
  activeEnabledMcpServers,
  userSkills,
  activeSkill,
  setActiveSkill,
  updateChatContextWindow,
  selectComposerModel,
  updateSessionMcpServers,
  sendMessage,
  handleApplySkill,
  stopGenerating,
  composerUsageLabel,
  isConfigured,
  isGenerating,
  isSoulModeEnabled,
  toggleSoulMode,
  containerClassName
}: ChatComposerPanelProps) => {
  return (
    <div className={containerClassName} data-chat-composer-root="true">
      <AttachmentTray
        attachments={draftAttachments}
        onRemoveAttachment={removeAttachment}
      />
      <Composer
        value={draft}
        modelLabel={appSettings.model || "模型"}
        modelValue={activeComposerModelValue}
        modelOptions={composerModelOptions}
        modelCapabilities={activeModelCapabilities}
        sendWithEnter={appSettings.sendWithEnter}
        chatContextWindow={appSettings.chatContextWindow}
        attachmentCount={draftAttachments.length}
        mcpServers={appSettings.mcpServers ?? []}
        enabledMcpServers={activeEnabledMcpServers}
        skills={userSkills}
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
        onApplySkill={handleApplySkill}
        onStop={() => {
          void stopGenerating();
        }}
        usageLabel={composerUsageLabel}
        disabled={!isConfigured}
        isGenerating={isGenerating}
        leadingControl={
          <Button
            type="button"
            variant={isSoulModeEnabled ? "default" : "outline"}
            className="h-[32px] rounded-full px-3 text-xs"
            onClick={toggleSoulMode}
            aria-pressed={isSoulModeEnabled}
            title={isSoulModeEnabled ? "当前为 SOUL 模式" : "当前为系统提示词模式"}
          >
            <Bot className="mr-1.5 h-3.5 w-3.5" />
            SOUL
          </Button>
        }
      />
    </div>
  );
};
