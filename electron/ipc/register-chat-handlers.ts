import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { AppSettings, ChatStreamEvent, ChatStreamRequest } from "../../src/shared/contracts";

type StreamSender = IpcMainInvokeEvent["sender"];

type ChatStreamRunner = (
  sender: StreamSender,
  streamId: string,
  payload: ChatStreamRequest,
  apiKey: string,
  signal: AbortSignal,
  onDelta?: () => void
) => Promise<void>;

type ChatHandlerDeps = {
  isSettingsConfigured: (settings: AppSettings) => boolean;
  createId: () => string;
  streamControllers: Map<string, AbortController>;
  streamOpenAICompatible: ChatStreamRunner;
  streamAnthropic: ChatStreamRunner;
  streamCodexAcp: ChatStreamRunner;
  normalizeRequestTimeoutMs: (value: number) => number;
  normalizeRetryCount: (value: number) => number;
  parseApiKeys: (raw: string) => string[];
  createSseDebugLogger: (enabled: boolean, streamId: string) => (...parts: unknown[]) => void;
  runStreamWithTimeout: (
    signal: AbortSignal,
    timeoutMs: number,
    execute: (attemptSignal: AbortSignal) => Promise<void>
  ) => Promise<void>;
  isAbortError: (error: unknown) => error is Error;
  sendStreamEvent: (sender: StreamSender, streamId: string, event: ChatStreamEvent) => void;
};

export const registerChatHandlers = (ipcMain: IpcMain, deps: ChatHandlerDeps) => {
  ipcMain.handle(
    "chat:startStream",
    async (event, payload: ChatStreamRequest): Promise<{ streamId: string }> => {
      if (payload.settings.providerType === "claude-agent") {
        throw new Error("Claude Agent provider is only available in Agent mode.");
      }
      if (!deps.isSettingsConfigured(payload.settings)) {
        throw new Error("Provider settings are incomplete.");
      }
      const streamId = deps.createId();
      const controller = new AbortController();
      deps.streamControllers.set(streamId, controller);

      const stream =
        payload.settings.providerType === "acp"
          ? deps.streamCodexAcp
          : payload.settings.providerType === "anthropic"
            ? deps.streamAnthropic
            : deps.streamOpenAICompatible;
      const timeoutMs = deps.normalizeRequestTimeoutMs(payload.settings.requestTimeoutMs);
      const retryCount = deps.normalizeRetryCount(payload.settings.retryCount);
      const apiKeys =
        payload.settings.providerType === "acp" ? ["__acp__"] : deps.parseApiKeys(payload.settings.apiKey);
      const maxAttempts =
        payload.settings.providerType === "acp" ? 1 : Math.max(retryCount + 1, apiKeys.length);
      const debug = deps.createSseDebugLogger(Boolean(payload.settings.sseDebug), streamId);

      void (async () => {
        let attempt = 0;

        while (attempt < maxAttempts) {
          let emittedDelta = false;
          const attemptNumber = attempt + 1;
          const apiKey = apiKeys[attempt % apiKeys.length];
          debug(`attempt ${attemptNumber}/${maxAttempts} started`, {
            apiKeySlot:
              payload.settings.providerType === "acp"
                ? "ACP"
                : `${(attempt % apiKeys.length) + 1}/${apiKeys.length}`
          });

          try {
            await deps.runStreamWithTimeout(controller.signal, timeoutMs, (attemptSignal) =>
              stream(event.sender, streamId, payload, apiKey, attemptSignal, () => {
                emittedDelta = true;
              })
            );
            debug(`attempt ${attemptNumber} completed`, { emittedDelta });
            return;
          } catch (error) {
            if (controller.signal.aborted && deps.isAbortError(error)) {
              debug("aborted by user");
              deps.sendStreamEvent(event.sender, streamId, { type: "done" });
              return;
            }

            const message = error instanceof Error ? error.message : "Streaming failed.";
            const shouldRetry = attempt + 1 < maxAttempts && !emittedDelta;
            debug(`attempt ${attemptNumber} failed`, { message, emittedDelta, shouldRetry });
            if (shouldRetry) {
              attempt += 1;
              continue;
            }

            deps.sendStreamEvent(event.sender, streamId, { type: "error", message });
            return;
          }
        }
      })()
        .finally(() => {
          deps.streamControllers.delete(streamId);
        });

      return { streamId };
    }
  );

  ipcMain.handle("chat:stopStream", async (_, streamId: string) => {
    const controller = deps.streamControllers.get(streamId);
    if (controller) {
      controller.abort();
      deps.streamControllers.delete(streamId);
    }
  });
};
