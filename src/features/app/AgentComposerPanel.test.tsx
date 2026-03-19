import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Composer } from "../../components/Composer";
import type { AppSettings } from "../../shared/contracts";
import { AgentComposerPanel } from "./AgentComposerPanel";

describe("features/app/AgentComposerPanel", () => {
  it("puts the agent composer in the same minimal-controls shell used by chat mode", () => {
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
        model: ""
      },
      mcpServers: []
    };

    const element = AgentComposerPanel({
      draft: "",
      setDraft: () => {},
      draftAttachments: [],
      removeAttachment: () => {},
      addFiles: () => {},
      appSettings,
      agentModelLabel: "Claude Sonnet 4",
      activeAgentModelValue: "claude-sonnet-4",
      agentModelOptions: [{ value: "claude-sonnet-4", label: "Claude Sonnet 4" }],
      activeModelCapabilities: {
        textInput: true,
        reasoningDisplay: true,
        imageInput: true,
        audioInput: false,
        videoInput: false
      },
      updateChatContextWindow: () => {},
      selectAgentModel: () => {},
      sendAgentMessage: async () => {},
      stopAgentRun: async () => {},
      isAgentConfigured: true,
      isAgentRunning: false,
      containerClassName: "chat-reading-stage"
    });

    assert.ok(isValidElement(element));
    const panel = element as ReactElement<{
      children: ReactNode;
      "data-agent-composer-root"?: string;
    }>;
    const children = Children.toArray(panel.props.children);
    assert.equal(children.length, 2);
    assert.equal(panel.props["data-agent-composer-root"], "true");

    const composerElement = children[1] as ReactElement<{ minimalControls?: boolean }>;
    assert.equal(composerElement.type, Composer);
    assert.equal(composerElement.props.minimalControls, true);
  });
});
