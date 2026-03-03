import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  Database,
  Eye,
  EyeOff,
  MessageSquare,
  Palette,
  Plus,
  Search,
  Server,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  X
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
  clamp,
  chatContextWindowOptions,
  densityOptions,
  fontScaleOptions,
  getProviderBadgeVisual,
  providerPresets,
  themeOptions
} from "../../lib/settings-center-utils";
import type {
  AppSettings,
  ChatSession,
  ConnectionTestResult,
  ModelListResult,
  McpServerConfig,
  McpServerStatusListResult,
  Skill
} from "../../shared/contracts";
import { useSettingsCenterController } from "./use-settings-center-controller";
import { McpServerList } from "./McpServerList";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { SkillsPanel } from "../SkillsPanel";
import type { SettingsSection } from "../Sidebar";

type SettingsCenterProps = {
  section: SettingsSection;
  userSkills: Skill[];
  onSaveUserSkills: (skills: Skill[]) => void;
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void>;
  onTest: (settings: AppSettings) => Promise<ConnectionTestResult>;
  onTestMemos: (settings: AppSettings) => Promise<ConnectionTestResult>;
  onListModels: (settings: AppSettings) => Promise<ModelListResult>;
  onListMcpServers: (settings: AppSettings) => Promise<{ ok: boolean; message: string; servers: McpServerConfig[] }>;
  onListMcpServerStatus: (settings: AppSettings) => Promise<McpServerStatusListResult>;
  onReloadMcpServers: (settings: AppSettings) => Promise<McpServerStatusListResult>;
  onExportSessions: () => void;
  onImportSessions: (sessions: ChatSession[]) => void;
  onClearSessions: () => void;
  onResetSettings: () => Promise<void>;
};

const SETTINGS_CARD_CLASS = "surface-1 rounded-[24px]";
const SETTINGS_SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SETTINGS_TEXTAREA_CLASS =
  "min-h-[120px] w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SETTINGS_OPTION_BASE = "rounded-xl border px-4 py-3 text-left transition-colors";
const SETTINGS_OPTION_ACTIVE = "border-border bg-accent/55";
const SETTINGS_OPTION_INACTIVE = "border-border/70 bg-card hover:bg-accent/35";
const SETTINGS_TOGGLE_BASE =
  "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors";
const SETTINGS_TOGGLE_ACTIVE = "border-border bg-accent/55";
const SETTINGS_TOGGLE_INACTIVE = "border-border/70 bg-card hover:bg-accent/35";
const STATUS_NOTE_CLASS = "state-note px-3 py-2 text-sm";
const STATUS_SUCCESS_CLASS = "state-success px-3 py-2 text-sm";
const STATUS_ERROR_CLASS = "state-error px-3 py-2 text-sm";

const settingsOptionClass = (active: boolean) =>
  cn(SETTINGS_OPTION_BASE, active ? SETTINGS_OPTION_ACTIVE : SETTINGS_OPTION_INACTIVE);

const settingsToggleClass = (active: boolean) =>
  cn(SETTINGS_TOGGLE_BASE, active ? SETTINGS_TOGGLE_ACTIVE : SETTINGS_TOGGLE_INACTIVE);

export const SettingsCenterView = (props: SettingsCenterProps) => {
  const {
    section,
    userSkills,
    onSaveUserSkills,
    onExportSessions,
    draft,
    setDraft,
    isSaving,
    isTesting,
    testResult,
    isTestingMemos,
    memosTestResult,
    saveError,
    dataMessage,
    providerMessage,
    isFetchingModels,
    mcpServers,
    mcpServerStatuses,
    isFetchingMcp,
    isReloadingMcp,
    mcpMessage,
    providerSearch,
    setProviderSearch,
    modelSearch,
    setModelSearch,
    collapsedModelGroups,
    isApiKeyVisible,
    setIsApiKeyVisible,
    isApiKeyCopied,
    modelContextWindowDraft,
    setModelContextWindowDraft,
    isResetting,
    fileInputRef,
    isDirty,
    activeProvider,
    isAcpProvider,
    isClaudeAgentProvider,
    activeProviderPreset,
    activeSavedModels,
    activeModelCapabilities,
    hasActiveModelCapabilityOverride,
    activeModelContextWindow,
    hasActiveModelContextWindowOverride,
    activeProviderEndpoints,
    filteredProviders,
    filteredModelOptions,
    groupedModelOptions,
    updateField,
    updateEnvironmentField,
    updateMemosField,
    updateActiveProviderField,
    updateActiveProviderMcpOverride,
    setActiveProviderModel,
    toggleSavedModelSelection,
    addCurrentModelToSavedModels,
    removeSavedModel,
    updateActiveModelCapability,
    resetActiveModelCapabilities,
    setActiveModelContextWindow,
    resetActiveModelContextWindow,
    switchActiveProvider,
    addProvider,
    toggleProviderEnabled,
    removeActiveProvider,
    save,
    testConnection,
    testMemosConnection,
    applyProviderPreset,
    toggleModelGroup,
    fetchModels,
    refreshMcpServers,
    reloadMcpServerConfig,
    copyApiKey,
    importSessionsFromFile,
    triggerImport,
    clearSessions,
    resetSettings
  } = useSettingsCenterController(props);
  return (
    <section className="h-full overflow-auto bg-background px-4 py-5 sm:px-5 sm:py-6 md:px-6 md:py-7">
      <div className="paper-conversation-stage mx-auto w-full">
        {section === "provider" ? (
          <Card className={SETTINGS_CARD_CLASS}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Server className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-[0.16em]">渠道</span>
                  </div>
                  <CardTitle className="mt-2 text-2xl">渠道配置</CardTitle>
                  <CardDescription className="mt-1">
                    管理可用渠道，点击后可编辑详细配置。
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="surface-3 grid gap-2 rounded-xl p-3 md:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">步骤 1</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">选择渠道</p>
                  <p className="mt-1 text-xs text-muted-foreground">先启用可用渠道并填入密钥。</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">步骤 2</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">测试连接</p>
                  <p className="mt-1 text-xs text-muted-foreground">确认接口可达，避免对话时报错。</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">步骤 3</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">保存模型</p>
                  <p className="mt-1 text-xs text-muted-foreground">把常用模型加入列表，减少切换成本。</p>
                </div>
              </div>
              <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm text-muted-foreground">渠道列表</label>
                    <Button type="button" variant="outline" onClick={addProvider}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      新增渠道
                    </Button>
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={providerSearch}
                      onChange={(event) => setProviderSearch(event.target.value)}
                      placeholder="搜索渠道..."
                      className="pl-9"
                    />
                  </div>
                  <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
                    {filteredProviders.length ? (
                      filteredProviders.map((provider) => {
                        const isActive = provider.id === activeProvider.id;
                        const badgeVisual = getProviderBadgeVisual(provider);
                        return (
                          <div
                            key={provider.id}
                            className={cn(
                              "flex items-center justify-between rounded-xl border px-3 py-2 transition-colors",
                              isActive
                                ? "border-border bg-accent/55"
                                : "border-border/70 bg-card hover:bg-accent/35"
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => switchActiveProvider(provider.id)}
                              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                            >
                              <span
                                className={cn(
                                  "grid h-8 w-8 shrink-0 place-content-center rounded-[4px] text-xs font-semibold",
                                  badgeVisual.bgClass,
                                  badgeVisual.textClass
                                )}
                              >
                                {badgeVisual.token}
                              </span>
                              <span className="truncate text-sm font-medium text-foreground">
                                {provider.name}
                              </span>
                            </button>
                            <Button
                              type="button"
                              variant="ghost"
                              className={cn(
                                "h-7 rounded-full border px-2.5 text-xs",
                                provider.enabled
                                  ? "border-border bg-accent/55 text-foreground"
                                  : "border-border/70 bg-card text-muted-foreground"
                              )}
                              onClick={() => toggleProviderEnabled(provider.id)}
                            >
                              {provider.enabled ? "ON" : "OFF"}
                            </Button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-sm text-muted-foreground">
                        没有匹配的渠道。
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">渠道详情</p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={removeActiveProvider}
                        disabled={draft.providers.length <= 1}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        删除渠道
                      </Button>
                      <Button onClick={save} disabled={isSaving || !isDirty}>
                        {isSaving ? "保存中..." : "保存"}
                      </Button>
                    </div>
                  </div>

                  {!activeProvider.enabled ? (
                    <p className="rounded-lg border border-border bg-accent/25 px-3 py-2 text-sm text-muted-foreground">
                      当前渠道已关闭。开启后才能在对话中发送消息。
                    </p>
                  ) : null}

                  <div className="space-y-1.5">
                    <label htmlFor="providerName" className="text-sm text-muted-foreground">
                      渠道名称
                    </label>
                    <Input
                      id="providerName"
                      placeholder="e.g. OpenAI Work"
                      value={activeProvider.name}
                      onChange={(event) => updateActiveProviderField("name", event.target.value)}
                    />
                  </div>

                  {!isAcpProvider ? (
                    <div className="space-y-1.5">
                      <label htmlFor="apiKey" className="text-sm text-muted-foreground">
                        API Key
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id="apiKey"
                          type={isApiKeyVisible ? "text" : "password"}
                          placeholder="sk-..."
                          value={activeProvider.apiKey}
                          onChange={(event) => updateActiveProviderField("apiKey", event.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="px-2"
                          onClick={() => setIsApiKeyVisible((previous) => !previous)}
                          aria-label={isApiKeyVisible ? "Hide API key" : "Show API key"}
                        >
                          {isApiKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="px-2"
                          onClick={copyApiKey}
                          disabled={!activeProvider.apiKey.trim()}
                          aria-label="Copy API key"
                        >
                          {isApiKeyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                        <Button type="button" variant="outline" onClick={testConnection} disabled={isTesting}>
                          {isTesting ? "测试中..." : "测试连接"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">多个 API Key 可用英文逗号分隔。</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border bg-accent/20 p-3 text-sm text-muted-foreground">
                      <p>ACP 使用本地 Codex CLI 登录态与配置。</p>
                      <div className="mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={testConnection}
                          disabled={isTesting}
                        >
                          {isTesting ? "检测中..." : "检测 Codex 运行时"}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="providerPreset" className="text-sm text-muted-foreground">
                        预设模板
                      </label>
                      <select
                        id="providerPreset"
                        value={activeProviderPreset}
                        onChange={(event) => applyProviderPreset(event.target.value)}
                        className={SETTINGS_SELECT_CLASS}
                      >
                        <option value="custom">Custom</option>
                        {providerPresets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="providerType" className="text-sm text-muted-foreground">
                        接口格式
                      </label>
                      <select
                        id="providerType"
                        value={activeProvider.providerType}
                        onChange={(event) => updateActiveProviderField("providerType", event.target.value)}
                        className={SETTINGS_SELECT_CLASS}
                      >
                        <option value="openai">OpenAI 兼容</option>
                        <option value="anthropic">Anthropic Messages API</option>
                        <option value="claude-agent">Claude Agent SDK</option>
                        <option value="acp">Codex CLI ACP</option>
                      </select>
                    </div>
                  </div>

                  {!isAcpProvider ? (
                    <div className="space-y-1.5">
                      <label htmlFor="baseUrl" className="text-sm text-muted-foreground">
                        {isClaudeAgentProvider ? "Anthropic Base URL (optional)" : "API URL"}
                      </label>
                      <Input
                        id="baseUrl"
                        placeholder={
                          isClaudeAgentProvider
                            ? "https://api.anthropic.com"
                            : "https://api.openai.com/v1"
                        }
                        value={activeProvider.baseUrl}
                        onChange={(event) => updateActiveProviderField("baseUrl", event.target.value)}
                      />
                      {activeProviderEndpoints ? (
                        <div className="rounded-lg border border-border bg-accent/20 p-2.5 text-xs text-muted-foreground">
                          <p>
                            预览地址：{" "}
                            <span className="font-mono text-foreground">
                              {activeProviderEndpoints.chat}
                            </span>
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-sm text-muted-foreground">运行时</label>
                      <div className="rounded-lg border border-border bg-accent/20 p-2.5 text-xs text-muted-foreground">
                        <p>
                          传输方式：{" "}
                          <span className="font-mono text-foreground">
                            {activeProviderEndpoints?.chat ?? "codex app-server --listen stdio://"}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}

                  {isAcpProvider ? (
                    <div className="space-y-2 rounded-xl border border-border bg-accent/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">MCP Servers</p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={refreshMcpServers}
                            disabled={isFetchingMcp}
                          >
                            {isFetchingMcp ? "Refreshing..." : "Refresh"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={reloadMcpServerConfig}
                            disabled={isReloadingMcp}
                          >
                            {isReloadingMcp ? "Reloading..." : "Reload config"}
                          </Button>
                        </div>
                      </div>
                      {mcpServers.length ? (
                        <div className="space-y-2">
                          {mcpServers.map((server) => {
                            const status = mcpServerStatuses[server.name];
                            const override = activeProvider.mcpServerOverrides?.[server.name];
                            const overrideMode = override
                              ? override.enabled
                                ? "enabled"
                                : "disabled"
                              : "default";
                            const effectiveAuthStatus = status?.authStatus ?? server.authStatus;

                            return (
                              <div
                                key={server.name}
                                className="rounded-xl border border-border/70 bg-card px-3 py-2"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-foreground">{server.name}</p>
                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                      {server.transportType}: {server.endpoint || "(no endpoint)"}
                                    </p>
                                  </div>
                                  <select
                                    value={overrideMode}
                                    onChange={(event) =>
                                      updateActiveProviderMcpOverride(
                                        server.name,
                                        event.target.value as "default" | "enabled" | "disabled"
                                      )
                                    }
                                    className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  >
                                    <option value="default">Default</option>
                                    <option value="enabled">Force ON</option>
                                    <option value="disabled">Force OFF</option>
                                  </select>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                  <span className="rounded-[4px] border border-border px-1.5 py-0.5">
                                    auth: {effectiveAuthStatus}
                                  </span>
                                  <span className="rounded-[4px] border border-border px-1.5 py-0.5">
                                    tools: {status?.toolCount ?? 0}
                                  </span>
                                  <span className="rounded-[4px] border border-border px-1.5 py-0.5">
                                    resources: {status?.resourceCount ?? 0}
                                  </span>
                                  <span className="rounded-[4px] border border-border px-1.5 py-0.5">
                                    templates: {status?.resourceTemplateCount ?? 0}
                                  </span>
                                  {!server.enabled ? (
                                    <span className="rounded-[4px] border border-border px-1.5 py-0.5">
                                      disabled in codex config
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="rounded-md border border-dashed border-border/70 bg-card/70 px-2.5 py-2 text-xs text-muted-foreground">
                          尚未配置 MCP 服务器。可先执行 `codex mcp add ...`，再点击刷新。
                        </p>
                      )}
                      {mcpMessage ? (
                        <p className="text-xs text-muted-foreground">{mcpMessage}</p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="model" className="text-sm text-muted-foreground">
                        模型
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="rounded-[4px] bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                          {filteredModelOptions.length}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addCurrentModelToSavedModels}
                          disabled={!activeProvider.model.trim()}
                        >
                          保存当前模型
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={fetchModels}
                          disabled={isFetchingModels}
                        >
                          {isFetchingModels
                            ? isAcpProvider
                              ? "Checking..."
                              : "Fetching..."
                            : isAcpProvider
                              ? "Check models"
                              : "Fetch models"}
                        </Button>
                      </div>
                    </div>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={modelSearch}
                        onChange={(event) => setModelSearch(event.target.value)}
                        placeholder="Search models..."
                        className="pl-9"
                      />
                    </div>
                    <Input
                      id="model"
                      placeholder={isAcpProvider ? "gpt-5-codex (optional)" : "gpt-4.1-mini"}
                      value={activeProvider.model}
                      onChange={(event) => setActiveProviderModel(event.target.value, false)}
                    />
                    <div className="space-y-1.5 rounded-xl border border-border bg-accent/20 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                          模型能力
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={resetActiveModelCapabilities}
                          disabled={!activeProvider.model.trim() || !hasActiveModelCapabilityOverride}
                        >
                          自动识别
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          className={cn(
                            "rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                            activeModelCapabilities.imageInput
                              ? "border-border bg-accent/55 text-foreground"
                              : "border-border/70 bg-card text-muted-foreground hover:bg-accent/35"
                          )}
                          onClick={() =>
                            updateActiveModelCapability("imageInput", !activeModelCapabilities.imageInput)
                          }
                        >
                          图片输入
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                            activeModelCapabilities.audioInput
                              ? "border-border bg-accent/55 text-foreground"
                              : "border-border/70 bg-card text-muted-foreground hover:bg-accent/35"
                          )}
                          onClick={() =>
                            updateActiveModelCapability("audioInput", !activeModelCapabilities.audioInput)
                          }
                        >
                          音频输入
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                            activeModelCapabilities.videoInput
                              ? "border-border bg-accent/55 text-foreground"
                              : "border-border/70 bg-card text-muted-foreground hover:bg-accent/35"
                          )}
                          onClick={() =>
                            updateActiveModelCapability("videoInput", !activeModelCapabilities.videoInput)
                          }
                        >
                          视频输入
                        </button>
                        <button
                          type="button"
                          className={cn(
                            "rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                            activeModelCapabilities.reasoningDisplay
                              ? "border-border bg-accent/55 text-foreground"
                              : "border-border/70 bg-card text-muted-foreground hover:bg-accent/35"
                          )}
                          onClick={() =>
                            updateActiveModelCapability(
                              "reasoningDisplay",
                              !activeModelCapabilities.reasoningDisplay
                            )
                          }
                        >
                          思维链显示
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        默认按模型名自动推断；你可以手动覆盖。输入窗口会按这些能力限制附件并给出提示。
                      </p>
                    </div>
                    <div className="space-y-1.5 rounded-xl border border-border bg-accent/20 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                          上下文窗口（tokens）
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={resetActiveModelContextWindow}
                          disabled={!activeProvider.model.trim() || !hasActiveModelContextWindowOverride}
                        >
                          自动识别
                        </Button>
                      </div>
                      <Input
                        value={modelContextWindowDraft}
                        onChange={(event) => setModelContextWindowDraft(event.target.value)}
                        onBlur={() => {
                          const parsed = Number.parseInt(modelContextWindowDraft, 10);
                          if (!Number.isFinite(parsed)) {
                            setModelContextWindowDraft(String(activeModelContextWindow));
                            return;
                          }
                          setActiveModelContextWindow(parsed);
                        }}
                        type="number"
                        min={1024}
                        max={2_000_000}
                        step={1}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        这里是模型可用上下文窗口。输入框右下角的 usage 监控会显示“已用 / 这个上限”。
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                        此渠道已保存模型
                      </p>
                      {activeSavedModels.length ? (
                        <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-accent/20 p-2">
                          {activeSavedModels.map((modelId) => {
                            const isActiveModel = activeProvider.model.trim() === modelId;
                            return (
                              <span
                                key={modelId}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                                  isActiveModel
                                    ? "border-border bg-accent/55 text-foreground"
                                    : "border-border/80 bg-card text-foreground"
                                )}
                              >
                                <button
                                  type="button"
                                  className="max-w-[220px] truncate text-left"
                                  onClick={() => setActiveProviderModel(modelId, false)}
                                  aria-label={`Select saved model ${modelId}`}
                                  aria-pressed={isActiveModel}
                                  title={modelId}
                                >
                                  {modelId}
                                </button>
                                <button
                                  type="button"
                                  className="rounded p-0.5 text-muted-foreground hover:bg-accent/55 hover:text-foreground"
                                  onClick={() => removeSavedModel(modelId)}
                                  aria-label={`Remove saved model ${modelId}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="rounded-md border border-dashed border-border/70 bg-card/70 px-2.5 py-2 text-xs text-muted-foreground">
                          暂无已保存模型。可从下方选择，或手动输入后点击“保存当前模型”。
                        </p>
                      )}
                    </div>
                    {groupedModelOptions.length ? (
                      <div className="max-h-[300px] space-y-2 overflow-auto rounded-xl border border-border bg-accent/20 p-2">
                        {groupedModelOptions.map(([groupName, models]) => {
                          const isCollapsed = Boolean(collapsedModelGroups[groupName]);
                          return (
                            <div key={groupName} className="rounded-xl border border-border bg-card">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm font-medium text-foreground"
                                onClick={() => toggleModelGroup(groupName)}
                              >
                                {isCollapsed ? (
                                  <ChevronRight className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                                <span>{groupName}</span>
                              </button>
                              {!isCollapsed ? (
                                <div className="space-y-1 border-t border-border/55 px-2 py-2">
                                  {models.map((modelId) => (
                                    <button
                                      key={modelId}
                                      type="button"
                                      data-no-drag="true"
                                      className={cn(
                                        "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm",
                                        activeSavedModels.includes(modelId)
                                          ? "bg-accent/55 text-foreground"
                                          : "hover:bg-accent/35"
                                      )}
                                      onClick={() => toggleSavedModelSelection(modelId)}
                                      aria-label={`Select model ${modelId}`}
                                    >
                                      <span className="truncate">{modelId}</span>
                                      <span
                                        className={cn(
                                          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                                          activeSavedModels.includes(modelId)
                                            ? "border-border bg-accent/70 text-foreground"
                                            : "border-border/70 bg-card text-transparent"
                                        )}
                                      >
                                        <Check className="h-3 w-3" />
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {testResult ? (
                <p className={testResult.ok ? STATUS_SUCCESS_CLASS : STATUS_ERROR_CLASS}>
                  {testResult.message}
                </p>
              ) : null}
              {providerMessage ? <p className={STATUS_NOTE_CLASS}>{providerMessage}</p> : null}
              {saveError ? <p className={STATUS_ERROR_CLASS}>{saveError}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        {section === "mcp" ? (
          <Card className={SETTINGS_CARD_CLASS}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Server className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-[0.16em]">MCP</span>
                  </div>
                  <CardTitle className="mt-2 text-2xl">MCP 服务器</CardTitle>
                  <CardDescription className="mt-1">
                    添加和管理 MCP 服务器，在每个对话中自由选择启用哪些工具。
                  </CardDescription>
                </div>
                <Button onClick={save} disabled={isSaving || !isDirty}>
                  {isSaving ? "保存中..." : "保存"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <McpServerList
                servers={draft.mcpServers ?? []}
                onChange={(servers) => setDraft((prev) => ({ ...prev, mcpServers: servers }))}
              />
              {saveError ? <p className={STATUS_ERROR_CLASS}>{saveError}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        {section === "chat" ? (
          <Card className={SETTINGS_CARD_CLASS}>
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">对话</span>
              </div>
              <CardTitle className="text-2xl">对话行为</CardTitle>
              <CardDescription>调整回复策略和输入框快捷方式。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="systemPrompt" className="text-sm text-muted-foreground">
                  Chat 系统提示词
                </label>
                <textarea
                  id="systemPrompt"
                  className={SETTINGS_TEXTAREA_CLASS}
                  placeholder="You are a precise and pragmatic coding assistant."
                  value={draft.systemPrompt}
                  onChange={(event) => updateField("systemPrompt", event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="agentSystemPrompt" className="text-sm text-muted-foreground">
                  Agent 系统提示词
                </label>
                <textarea
                  id="agentSystemPrompt"
                  className={SETTINGS_TEXTAREA_CLASS}
                  placeholder="You are a precise and pragmatic coding assistant."
                  value={draft.agentSystemPrompt}
                  onChange={(event) => updateField("agentSystemPrompt", event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  仅作用于 Agent 模式；Chat 与 Agent 现在是独立提示词。
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="temperature" className="text-sm text-muted-foreground">
                    温度（0 - 2）
                  </label>
                  <Input
                    id="temperature"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={draft.temperature}
                    onChange={(event) =>
                      updateField("temperature", Number.parseFloat(event.target.value) || 0)
                    }
                    onBlur={() => updateField("temperature", clamp(draft.temperature, 0, 2))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="maxTokens" className="text-sm text-muted-foreground">
                    最大 Tokens（64 - 8192）
                  </label>
                  <Input
                    id="maxTokens"
                    type="number"
                    min={64}
                    max={8192}
                    step={1}
                    value={draft.maxTokens}
                    onChange={(event) =>
                      updateField("maxTokens", Number.parseInt(event.target.value, 10) || 64)
                    }
                    onBlur={() =>
                      updateField("maxTokens", Math.round(clamp(draft.maxTokens, 64, 8192)))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">上下文窗口</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {chatContextWindowOptions.map((option) => {
                    const active = draft.chatContextWindow === option.value;
                    return (
                      <button
                        key={String(option.value)}
                        type="button"
                        className={settingsOptionClass(active)}
                        onClick={() => updateField("chatContextWindow", option.value)}
                      >
                        <p className="text-sm font-semibold text-foreground">{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  仅作用于 Chat 模式，系统提示词始终会附带。
                </p>
              </div>

              <button
                type="button"
                className={settingsToggleClass(draft.sendWithEnter)}
                onClick={() => updateField("sendWithEnter", !draft.sendWithEnter)}
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">回车发送消息</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {draft.sendWithEnter
                      ? "已开启：Enter 发送，Shift+Enter 换行。"
                      : "已关闭：Enter 换行，Cmd/Ctrl+Enter 发送。"}
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {draft.sendWithEnter ? "On" : "Off"}
                </span>
              </button>

              {saveError ? <p className={STATUS_ERROR_CLASS}>{saveError}</p> : null}
              <div className="flex items-center justify-end">
                <Button onClick={save} disabled={isSaving || !isDirty}>
                  {isSaving ? "保存中..." : "保存"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === "memory" ? (
          <Card className={SETTINGS_CARD_CLASS}>
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Database className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">Memory</span>
              </div>
              <CardTitle className="text-2xl">记忆</CardTitle>
              <CardDescription>
                启用后 Chat 和 Agent 模式都会跨会话记住重要信息。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <button
                type="button"
                className={settingsToggleClass(draft.memos.enabled)}
                onClick={() => updateMemosField("enabled", !draft.memos.enabled)}
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">启用记忆功能</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    开启后将自动检索相关记忆并在回复完成后写回记忆库。
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {draft.memos.enabled ? "On" : "Off"}
                </span>
              </button>

              <div className="rounded-xl border border-border/70 bg-accent/20 px-4 py-4">
                <p className="text-sm leading-7 text-muted-foreground">
                  记忆功能由 <span className="font-semibold text-foreground">MemOS Cloud</span>{" "}
                  提供，启用后可跨会话保存偏好、决策和项目上下文。
                </p>
                <p className="mt-3 text-sm font-semibold text-foreground">配置步骤：</p>
                <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>
                    1. 访问{" "}
                    <a
                      href="https://memos-dashboard.openmem.net/cn/quickstart/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground underline underline-offset-4"
                    >
                      MemOS Cloud 控制台
                    </a>{" "}
                    注册账号
                  </li>
                  <li>2. 在 API Keys 页面生成一个 API Key</li>
                  <li>3. 填入下方配置并点击测试连接</li>
                </ol>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="memosBaseUrl" className="text-sm text-muted-foreground">
                    Base URL
                  </label>
                  <Input
                    id="memosBaseUrl"
                    value={draft.memos.baseUrl}
                    onChange={(event) => updateMemosField("baseUrl", event.target.value)}
                    placeholder="https://memos.memtensor.cn/api/openmem/v1"
                    disabled={!draft.memos.enabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="memosUserId" className="text-sm text-muted-foreground">
                    User ID
                  </label>
                  <Input
                    id="memosUserId"
                    value={draft.memos.userId}
                    onChange={(event) => updateMemosField("userId", event.target.value)}
                    placeholder="echo-user-001"
                    disabled={!draft.memos.enabled}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="memosApiKey" className="text-sm text-muted-foreground">
                  API Key
                </label>
                <Input
                  id="memosApiKey"
                  type="password"
                  value={draft.memos.apiKey}
                  onChange={(event) => updateMemosField("apiKey", event.target.value)}
                  placeholder="sk-..."
                  disabled={!draft.memos.enabled}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="memosTopK" className="text-sm text-muted-foreground">
                    Top K (1 - 20)
                  </label>
                  <Input
                    id="memosTopK"
                    type="number"
                    min={1}
                    max={20}
                    step={1}
                    value={draft.memos.topK}
                    onChange={(event) =>
                      updateMemosField("topK", Number.parseInt(event.target.value, 10) || 1)
                    }
                    onBlur={() => updateMemosField("topK", Math.round(clamp(draft.memos.topK, 1, 20)))}
                    disabled={!draft.memos.enabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="memosSearchTimeoutMs" className="text-sm text-muted-foreground">
                    Search timeout (ms)
                  </label>
                  <Input
                    id="memosSearchTimeoutMs"
                    type="number"
                    min={1000}
                    max={15000}
                    step={100}
                    value={draft.memos.searchTimeoutMs}
                    onChange={(event) =>
                      updateMemosField("searchTimeoutMs", Number.parseInt(event.target.value, 10) || 1000)
                    }
                    onBlur={() =>
                      updateMemosField(
                        "searchTimeoutMs",
                        Math.round(clamp(draft.memos.searchTimeoutMs, 1000, 15000))
                      )
                    }
                    disabled={!draft.memos.enabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="memosAddTimeoutMs" className="text-sm text-muted-foreground">
                    Add timeout (ms)
                  </label>
                  <Input
                    id="memosAddTimeoutMs"
                    type="number"
                    min={1000}
                    max={15000}
                    step={100}
                    value={draft.memos.addTimeoutMs}
                    onChange={(event) =>
                      updateMemosField("addTimeoutMs", Number.parseInt(event.target.value, 10) || 1000)
                    }
                    onBlur={() =>
                      updateMemosField(
                        "addTimeoutMs",
                        Math.round(clamp(draft.memos.addTimeoutMs, 1000, 15000))
                      )
                    }
                    disabled={!draft.memos.enabled}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                {memosTestResult ? (
                  <p className={memosTestResult.ok ? STATUS_SUCCESS_CLASS : STATUS_ERROR_CLASS}>
                    {memosTestResult.message}
                  </p>
                ) : (
                  <p className={STATUS_NOTE_CLASS}>
                    点击测试连接来验证当前记忆配置是否可用。
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void testMemosConnection();
                  }}
                  disabled={isTestingMemos || !draft.memos.enabled}
                >
                  {isTestingMemos ? "Testing..." : "测试连接"}
                </Button>
              </div>

              {saveError ? <p className={STATUS_ERROR_CLASS}>{saveError}</p> : null}
              <div className="flex items-center justify-end">
                <Button onClick={save} disabled={isSaving || !isDirty}>
                  {isSaving ? "保存中..." : "保存"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === "environment" ? (
          <Card className={SETTINGS_CARD_CLASS}>
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Cpu className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">环境</span>
              </div>
                  <CardTitle className="text-2xl">环境注入</CardTitle>
              <CardDescription>为 Chat 与 Agent 注入运行环境上下文。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 rounded-xl border border-border/70 bg-card px-4 py-3">
                <button
                  type="button"
                  className={settingsToggleClass(draft.environment.enabled)}
                  onClick={() => updateEnvironmentField("enabled", !draft.environment.enabled)}
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">Inject environment context</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Adds date, time, city weather, network, battery, and device hints to runtime context.
                    </p>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {draft.environment.enabled ? "On" : "Off"}
                  </span>
                </button>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="environmentCity" className="text-sm text-muted-foreground">
                      City (manual)
                    </label>
                    <Input
                      id="environmentCity"
                      value={draft.environment.city}
                      onChange={(event) => updateEnvironmentField("city", event.target.value)}
                      placeholder="e.g. San Francisco"
                      disabled={!draft.environment.enabled}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">温度单位</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["c", "f"] as const).map((unit) => (
                        <button
                          key={unit}
                          type="button"
                          className={cn(
                            "rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                            draft.environment.temperatureUnit === unit
                              ? SETTINGS_OPTION_ACTIVE
                              : SETTINGS_OPTION_INACTIVE
                          )}
                          onClick={() => updateEnvironmentField("temperatureUnit", unit)}
                          disabled={!draft.environment.enabled}
                        >
                          {unit === "c" ? "Celsius (C)" : "Fahrenheit (F)"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="weatherCacheTtlMs" className="text-sm text-muted-foreground">
                      Weather cache TTL (60000 - 3600000 ms)
                    </label>
                    <Input
                      id="weatherCacheTtlMs"
                      type="number"
                      min={60000}
                      max={3600000}
                      step={1000}
                      value={draft.environment.weatherCacheTtlMs}
                      onChange={(event) =>
                        updateEnvironmentField(
                          "weatherCacheTtlMs",
                          Number.parseInt(event.target.value, 10) || 60000
                        )
                      }
                      onBlur={() =>
                        updateEnvironmentField(
                          "weatherCacheTtlMs",
                          Math.round(clamp(draft.environment.weatherCacheTtlMs, 60000, 3600000))
                        )
                      }
                      disabled={!draft.environment.enabled}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="environmentSendTimeoutMs" className="text-sm text-muted-foreground">
                      Send-time wait limit (100 - 2000 ms)
                    </label>
                    <Input
                      id="environmentSendTimeoutMs"
                      type="number"
                      min={100}
                      max={2000}
                      step={50}
                      value={draft.environment.sendTimeoutMs}
                      onChange={(event) =>
                        updateEnvironmentField(
                          "sendTimeoutMs",
                          Number.parseInt(event.target.value, 10) || 100
                        )
                      }
                      onBlur={() =>
                        updateEnvironmentField(
                          "sendTimeoutMs",
                          Math.round(clamp(draft.environment.sendTimeoutMs, 100, 2000))
                        )
                      }
                      disabled={!draft.environment.enabled}
                    />
                  </div>
                </div>
              </div>

              {saveError ? <p className={STATUS_ERROR_CLASS}>{saveError}</p> : null}
              <div className="flex items-center justify-end">
                <Button onClick={save} disabled={isSaving || !isDirty}>
                  {isSaving ? "保存中..." : "保存"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === "theme" ? (
          <Card className={SETTINGS_CARD_CLASS}>
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Palette className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">主题</span>
              </div>
              <CardTitle className="text-2xl">主题偏好</CardTitle>
              <CardDescription>选择工作区内应用的显示方式。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                {themeOptions.map((option) => {
                  const active = draft.theme === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={settingsOptionClass(active)}
                      onClick={() => updateField("theme", option.value)}
                    >
                      <p className="text-sm font-semibold text-foreground">{option.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">字号大小</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {fontScaleOptions.map((option) => {
                    const active = draft.fontScale === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={settingsOptionClass(active)}
                        onClick={() => updateField("fontScale", option.value)}
                      >
                        <p className="text-sm font-semibold text-foreground">{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">消息密度</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {densityOptions.map((option) => {
                    const active = draft.messageDensity === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={settingsOptionClass(active)}
                        onClick={() => updateField("messageDensity", option.value)}
                      >
                        <p className="text-sm font-semibold text-foreground">{option.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {saveError ? <p className={STATUS_ERROR_CLASS}>{saveError}</p> : null}
              <div className="flex items-center justify-end">
                <Button onClick={save} disabled={isSaving || !isDirty}>
                  {isSaving ? "保存中..." : "保存"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {section === "skills" ? (
          <Card className={SETTINGS_CARD_CLASS}>
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">技能</span>
              </div>
              <CardTitle className="text-2xl">技能</CardTitle>
              <CardDescription>管理由斜杠命令触发的提示词模板。</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <SkillsPanel
                userSkills={userSkills}
                onSave={onSaveUserSkills}
                onClose={() => {}}
              />
            </CardContent>
          </Card>
        ) : null}

        {section === "data" ? (
          <Card className={SETTINGS_CARD_CLASS}>
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Database className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">数据</span>
              </div>
              <CardTitle className="text-2xl">数据管理</CardTitle>
              <CardDescription>导出、导入和重置本地应用数据。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={importSessionsFromFile}
              />
              <div className="grid gap-2 md:grid-cols-2">
                <Button variant="outline" onClick={onExportSessions}>
                  导出会话（.json）
                </Button>
                <Button variant="outline" onClick={triggerImport}>
                  导入会话（.json）
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <Button variant="outline" onClick={clearSessions}>
                  清空所有会话
                </Button>
                <Button variant="outline" onClick={resetSettings} disabled={isResetting}>
                  {isResetting ? "重置中..." : "重置设置"}
                </Button>
              </div>
              {dataMessage ? <p className={STATUS_NOTE_CLASS}>{dataMessage}</p> : null}
            </CardContent>
          </Card>
        ) : null}

        {section === "advanced" ? (
          <Card className={SETTINGS_CARD_CLASS}>
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                <SlidersHorizontal className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-[0.16em]">高级</span>
              </div>
              <CardTitle className="text-2xl">高级行为</CardTitle>
              <CardDescription>配置请求超时、重试策略和调试日志。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="requestTimeoutMs" className="text-sm text-muted-foreground">
                    请求超时（ms）
                  </label>
                  <Input
                    id="requestTimeoutMs"
                    type="number"
                    min={5000}
                    max={180000}
                    step={1000}
                    value={draft.requestTimeoutMs}
                    onChange={(event) =>
                      updateField("requestTimeoutMs", Number.parseInt(event.target.value, 10) || 5000)
                    }
                    onBlur={() =>
                      updateField(
                        "requestTimeoutMs",
                        Math.round(clamp(draft.requestTimeoutMs, 5000, 180000))
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="retryCount" className="text-sm text-muted-foreground">
                    重试次数
                  </label>
                  <Input
                    id="retryCount"
                    type="number"
                    min={0}
                    max={3}
                    step={1}
                    value={draft.retryCount}
                    onChange={(event) =>
                      updateField("retryCount", Number.parseInt(event.target.value, 10) || 0)
                    }
                    onBlur={() => updateField("retryCount", Math.round(clamp(draft.retryCount, 0, 3)))}
                  />
                </div>
              </div>

              <button
                type="button"
                className={settingsToggleClass(draft.sseDebug)}
                onClick={() => updateField("sseDebug", !draft.sseDebug)}
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">SSE 调试日志</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    在 DevTools 控制台打印流式事件，便于排查问题。
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {draft.sseDebug ? "On" : "Off"}
                </span>
              </button>

              {saveError ? <p className={STATUS_ERROR_CLASS}>{saveError}</p> : null}
              <div className="flex items-center justify-end">
                <Button onClick={save} disabled={isSaving || !isDirty}>
                  {isSaving ? "保存中..." : "保存"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
};
