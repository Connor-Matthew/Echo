import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS } from "../../src/domain/settings/normalize";
import type { AppSettings, ChatStreamEvent, ChatStreamRequest } from "../../src/shared/contracts";
import { registerChatHandlers } from "./register-chat-handlers";

const createSettings = (overrides?: Partial<AppSettings>): AppSettings =>
  ({
    ...DEFAULT_SETTINGS,
    baseUrl: "https://example.com/v1",
    apiKey: "key-1,key-2",
    model: "gpt-test",
    ...overrides,
    providers: overrides?.providers ?? DEFAULT_SETTINGS.providers,
    environment: {
      ...DEFAULT_SETTINGS.environment,
      ...(overrides?.environment ?? {})
    },
    memos: {
      ...DEFAULT_SETTINGS.memos,
      ...(overrides?.memos ?? {})
    },
    soulEvolution: {
      ...DEFAULT_SETTINGS.soulEvolution,
      ...(overrides?.soulEvolution ?? {})
    },
    mcpServers: overrides?.mcpServers ?? DEFAULT_SETTINGS.mcpServers
  }) satisfies AppSettings;

const createRequest = (settings?: AppSettings): ChatStreamRequest => ({
  settings: settings ?? createSettings(),
  messages: [{ role: "user", content: "hello" }]
});

const waitFor = async (check: () => boolean, timeoutMs = 1000) => {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const createHarness = () => {
  const handlers = new Map<string, (...args: any[]) => any>();
  const sentEvents: Array<{ streamId: string; event: ChatStreamEvent }> = [];
  const streamControllers = new Map<string, AbortController>();
  const debugMessages: string[] = [];

  const ipcMain = {
    handle(channel: string, handler: (...args: any[]) => any) {
      handlers.set(channel, handler);
    }
  };

  const sender = { id: "sender-1" };
  const event = { sender };

  return {
    ipcMain,
    sender,
    event,
    streamControllers,
    sentEvents,
    debugMessages,
    invoke: async (channel: string, ...args: any[]) => {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`Missing handler for ${channel}`);
      }
      return handler(event, ...args);
    }
  };
};

describe("electron/ipc/register-chat-handlers", () => {
  it("retries with the next API key when a stream attempt fails before any delta", async () => {
    const harness = createHarness();
    const usedApiKeys: string[] = [];
    let attempts = 0;

    registerChatHandlers(harness.ipcMain as any, {
      isSettingsConfigured: () => true,
      createId: () => "stream-1",
      streamControllers: harness.streamControllers,
      streamOpenAICompatible: async (_sender, _streamId, _payload, apiKey) => {
        usedApiKeys.push(apiKey);
        attempts += 1;
        if (attempts === 1) {
          throw new Error("first failure");
        }
      },
      streamAnthropic: async () => {},
      streamCodexAcp: async () => {},
      normalizeRequestTimeoutMs: (value) => value,
      normalizeRetryCount: (value) => value,
      parseApiKeys: (raw) => raw.split(","),
      createSseDebugLogger: () => (...parts) => {
        harness.debugMessages.push(parts.map(String).join(" "));
      },
      runStreamWithTimeout: async (_signal, _timeoutMs, execute) => execute(new AbortController().signal),
      isAbortError: (_error): _error is Error => false,
      sendStreamEvent: (_sender, streamId, event) => {
        harness.sentEvents.push({ streamId, event });
      }
    });

    const result = await harness.invoke("chat:startStream", createRequest());
    assert.equal(result.streamId, "stream-1");

    await waitFor(() => attempts === 2 && harness.streamControllers.size === 0);

    assert.deepEqual(usedApiKeys, ["key-1", "key-2"]);
    assert.deepEqual(harness.sentEvents, []);
  });

  it("stops retrying and emits an error once content has already streamed", async () => {
    const harness = createHarness();
    let attempts = 0;

    registerChatHandlers(harness.ipcMain as any, {
      isSettingsConfigured: () => true,
      createId: () => "stream-2",
      streamControllers: harness.streamControllers,
      streamOpenAICompatible: async (_sender, _streamId, _payload, _apiKey, _signal, onDelta) => {
        attempts += 1;
        onDelta?.();
        throw new Error("failed after delta");
      },
      streamAnthropic: async () => {},
      streamCodexAcp: async () => {},
      normalizeRequestTimeoutMs: (value) => value,
      normalizeRetryCount: (value) => value,
      parseApiKeys: (raw) => raw.split(","),
      createSseDebugLogger: () => () => {},
      runStreamWithTimeout: async (_signal, _timeoutMs, execute) => execute(new AbortController().signal),
      isAbortError: (_error): _error is Error => false,
      sendStreamEvent: (_sender, streamId, event) => {
        harness.sentEvents.push({ streamId, event });
      }
    });

    await harness.invoke("chat:startStream", createRequest(createSettings({ retryCount: 3 })));
    await waitFor(() => harness.sentEvents.length === 1 && harness.streamControllers.size === 0);

    assert.equal(attempts, 1);
    assert.deepEqual(harness.sentEvents, [
      {
        streamId: "stream-2",
        event: { type: "error", message: "failed after delta" }
      }
    ]);
  });

  it("emits done instead of error when the user aborts an in-flight stream", async () => {
    const harness = createHarness();
    let abortError: Error | null = null;

    registerChatHandlers(harness.ipcMain as any, {
      isSettingsConfigured: () => true,
      createId: () => "stream-3",
      streamControllers: harness.streamControllers,
      streamOpenAICompatible: async (_sender, _streamId, _payload, _apiKey, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
            reject(abortError);
          });
        }),
      streamAnthropic: async () => {},
      streamCodexAcp: async () => {},
      normalizeRequestTimeoutMs: (value) => value,
      normalizeRetryCount: (value) => value,
      parseApiKeys: (raw) => raw.split(","),
      createSseDebugLogger: () => () => {},
      runStreamWithTimeout: async (signal, _timeoutMs, execute) => execute(signal),
      isAbortError: (error): error is Error =>
        error instanceof Error && error.name === "AbortError",
      sendStreamEvent: (_sender, streamId, event) => {
        harness.sentEvents.push({ streamId, event });
      }
    });

    const result = await harness.invoke("chat:startStream", createRequest());
    await harness.invoke("chat:stopStream", result.streamId);
    await waitFor(() => harness.sentEvents.length === 1 && harness.streamControllers.size === 0);

    assert.ok(abortError);
    assert.deepEqual(harness.sentEvents, [
      {
        streamId: "stream-3",
        event: { type: "done" }
      }
    ]);
  });
});
