import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import {
  Composer,
  getComposerContainerClassName,
  getComposerFooterClassName,
  getComposerMinimalControlClassNames,
  getComposerTextareaClassName
} from "../../components/Composer";
import type { AppSettings } from "../../shared/contracts";
import { ChatComposerPanel } from "./ChatComposerPanel";

describe("features/app/ChatComposerPanel", () => {
  it("puts the chat composer in minimal-controls mode by default", () => {
    const appSettings: AppSettings = {
      baseUrl: "https://example.com/v1",
      apiKey: "test",
      model: "test-model",
      providerType: "openai",
      providers: [],
      activeProviderId: "provider-1",
      theme: "system",
      systemPrompt: "",
      agentSystemPrompt: "",
      temperature: 0.7,
      maxTokens: 4096,
      chatContextWindow: 20,
      sendWithEnter: true,
      fontScale: "md",
      messageDensity: "comfortable",
      markdownRenderMode: "paragraph",
      requestTimeoutMs: 30000,
      retryCount: 2,
      sseDebug: false,
      environment: {
        enabled: false,
        city: "",
        temperatureUnit: "c",
        weatherCacheTtlMs: 600000,
        sendTimeoutMs: 5000
      },
      memos: {
        enabled: false,
        baseUrl: "",
        apiKey: "",
        userId: "",
        topK: 10,
        searchTimeoutMs: 5000,
        addTimeoutMs: 5000
      },
      soulEvolution: {
        providerId: "",
        model: "",
      },
      mcpServers: []
    };

    const element = ChatComposerPanel({
      draft: "",
      setDraft: () => {},
      draftAttachments: [],
      removeAttachment: () => {},
      addFiles: () => {},
      appSettings,
      activeComposerModelValue: "test-model",
      composerModelOptions: [{ value: "test-model", label: "Test Model" }],
      activeModelCapabilities: {
        textInput: true,
        reasoningDisplay: true,
        imageInput: true,
        audioInput: false,
        videoInput: false
      },
      activeEnabledMcpServers: [],
      userSkills: [],
      activeSkill: null,
      setActiveSkill: () => {},
      updateChatContextWindow: () => {},
      selectComposerModel: () => {},
      updateSessionMcpServers: () => {},
      sendMessage: async () => {},
      handleApplySkill: () => {},
      stopGenerating: async () => {},
      composerUsageLabel: "2.2k / 128k",
      isConfigured: true,
      isGenerating: false,
      isSoulModeEnabled: true,
      toggleSoulMode: () => {},
      containerClassName: "chat-reading-stage"
    });

    assert.ok(isValidElement(element));
    const panel = element as ReactElement<{ children: ReactNode; className?: string }>;
    assert.equal(panel.props.className, "chat-reading-stage");
    const children = Children.toArray(panel.props.children);
    assert.equal(children.length, 2);

    const composerElement = children[1] as ReactElement<{ minimalControls?: boolean }>;
    assert.equal(composerElement.type, Composer);
    assert.equal(composerElement.props.minimalControls, true);
  });

  it("uses a borderless footer in minimal-controls mode", () => {
    const footerClassName = getComposerFooterClassName({ minimalControls: true });

    assert.ok(!footerClassName.includes("border-t"));
    assert.ok(!footerClassName.includes("pt-3"));
  });

  it("uses softer utility controls in minimal-controls mode", () => {
    const classNames = getComposerMinimalControlClassNames();

    assert.ok(classNames.trigger.includes("rounded-full"));
    assert.ok(classNames.trigger.includes("h-10"));
    assert.ok(!classNames.modelSelect.includes("rounded-full"));
    assert.ok(classNames.modelSelect.includes("border-0"));
    assert.ok(classNames.actionButton.includes("rounded-full"));
    assert.ok(classNames.actionButton.includes("bg-primary"));
    assert.ok(classNames.stopButton.includes("rounded-full"));
  });

  it("uses a larger hero shell in minimal-controls mode", () => {
    const containerClassName = getComposerContainerClassName({ minimalControls: true });
    const footerClassName = getComposerFooterClassName({ minimalControls: true });
    const textareaClassName = getComposerTextareaClassName({ minimalControls: true });

    assert.ok(containerClassName.includes("rounded-[38px]"));
    assert.ok(containerClassName.includes("py-4"));
    assert.ok(!containerClassName.includes("rounded-[24px]"));
    assert.ok(footerClassName.includes("mt-3"));
    assert.ok(textareaClassName.includes("h-[40px]"));
    assert.ok(textareaClassName.includes("min-h-[40px]"));
  });
});
