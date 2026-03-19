import { AttachmentTray } from "../../components/AttachmentTray";
import { Composer } from "../../components/Composer";
import type { AppSettings, ModelCapabilities } from "../../shared/contracts";
import type { DraftAttachment } from "./draft-attachments";

type AgentComposerPanelProps = {
  draft: string;
  setDraft: (value: string) => void;
  draftAttachments: DraftAttachment[];
  removeAttachment: (id: string) => void;
  addFiles: (files: FileList | File[] | null) => void;
  appSettings: AppSettings;
  agentModelLabel: string;
  activeAgentModelValue: string;
  agentModelOptions: Array<{ value: string; label: string }>;
  activeModelCapabilities: ModelCapabilities;
  updateChatContextWindow: (window: AppSettings["chatContextWindow"]) => void;
  selectAgentModel: (value: string) => void;
  sendAgentMessage: (value: string) => Promise<void>;
  stopAgentRun: () => Promise<void>;
  isAgentConfigured: boolean;
  isAgentRunning: boolean;
  containerClassName?: string;
};

export const AgentComposerPanel = ({
  draft,
  setDraft,
  draftAttachments,
  removeAttachment,
  addFiles,
  appSettings,
  agentModelLabel,
  activeAgentModelValue,
  agentModelOptions,
  activeModelCapabilities,
  updateChatContextWindow,
  selectAgentModel,
  sendAgentMessage,
  stopAgentRun,
  isAgentConfigured,
  isAgentRunning,
  containerClassName
}: AgentComposerPanelProps) => {
  return (
    <div
      className={containerClassName}
      data-agent-composer-root="true"
    >
      <AttachmentTray
        attachments={draftAttachments}
        onRemoveAttachment={removeAttachment}
      />
      <Composer
        value={draft}
        modelLabel={agentModelLabel}
        modelValue={activeAgentModelValue}
        modelOptions={agentModelOptions}
        modelCapabilities={activeModelCapabilities}
        sendWithEnter={appSettings.sendWithEnter}
        chatContextWindow={appSettings.chatContextWindow}
        attachmentCount={draftAttachments.length}
        mcpServers={[]}
        enabledMcpServers={[]}
        skills={[]}
        activeSkill={null}
        onChangeActiveSkill={() => {}}
        onAddFiles={addFiles}
        onChangeChatContextWindow={updateChatContextWindow}
        onSelectModel={selectAgentModel}
        onChangeMcpServers={() => {}}
        onChange={setDraft}
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
        minimalControls={true}
      />
    </div>
  );
};
