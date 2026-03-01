import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { createId, nowIso } from "../../../lib/app-chat-utils";
import { createAgentStreamEnvelopeHandler } from "../../../lib/app-agent-stream";
import type { MuApi } from "../../../lib/mu-api";
import type {
  AgentMessage,
  AgentRunSettingsSnapshot,
  AgentSessionMeta,
  AgentStreamEnvelope
} from "../../../shared/agent-contracts";
import type { AppSettings, ChatAttachment, EnvironmentSnapshot } from "../../../shared/contracts";

export type AgentActiveRun = {
  runId: string;
  sessionId: string;
  assistantMessageId: string;
  pollTimerId: number | null;
  unsubscribe: () => void;
};

type RunAgentMessageServiceParams = {
  activeAgentSession: AgentSessionMeta;
  input: string;
  messageAttachments: ChatAttachment[];
  settings: AppSettings;
  baseRunSettings: AgentRunSettingsSnapshot;
  api: MuApi;
  activeAgentRunRef: MutableRefObject<AgentActiveRun | null>;
  refreshAgentEnvironmentSnapshot: () => Promise<EnvironmentSnapshot | null>;
  upsertAgentMessages: (sessionId: string, mutate: (messages: AgentMessage[]) => AgentMessage[]) => void;
  appendAgentSystemEvent: (sessionId: string, text: string) => void;
  finishAgentRun: () => void;
  loadAgentMessages: (sessionId: string) => Promise<void>;
  fetchAndSetAgentMessages: (sessionId: string) => Promise<AgentMessage[]>;
  enqueueAgentPermissionRequest: (payload: AgentStreamEnvelope) => void;
  removeAgentPermissionRequests: (payload: {
    runId?: string;
    sessionId?: string;
    requestId?: string;
  }) => void;
  clearAgentDraftAttachments: () => void;
  setAgentDraft: Dispatch<SetStateAction<string>>;
  setAgentErrorBanner: Dispatch<SetStateAction<string | null>>;
  setIsAgentRunning: Dispatch<SetStateAction<boolean>>;
  setAgentSessions: Dispatch<SetStateAction<AgentSessionMeta[]>>;
};

export const runAgentMessageService = async ({
  activeAgentSession,
  input,
  messageAttachments,
  settings,
  baseRunSettings,
  api,
  activeAgentRunRef,
  refreshAgentEnvironmentSnapshot,
  upsertAgentMessages,
  appendAgentSystemEvent,
  finishAgentRun,
  loadAgentMessages,
  fetchAndSetAgentMessages,
  enqueueAgentPermissionRequest,
  removeAgentPermissionRequests,
  clearAgentDraftAttachments,
  setAgentDraft,
  setAgentErrorBanner,
  setIsAgentRunning,
  setAgentSessions
}: RunAgentMessageServiceParams) => {
  const sessionId = activeAgentSession.id;
  let runSettings = baseRunSettings;

  let environmentSnapshot: EnvironmentSnapshot | undefined;
  if (settings.environment.enabled) {
    try {
      environmentSnapshot = (await refreshAgentEnvironmentSnapshot()) ?? undefined;
    } catch {
      environmentSnapshot = undefined;
    }
  }

  if (settings.memos.enabled && input) {
    try {
      const result = await api.memos.searchMemory({
        settings,
        query: input,
        conversationId: "echo-global-memory"
      });
      if (result.ok && result.memories.length) {
        const memosMemoryBlock = [
          "<memos_memory>",
          ...result.memories.slice(0, settings.memos.topK).map((item) => `- ${item}`),
          "</memos_memory>"
        ].join("\n");
        runSettings = {
          ...baseRunSettings,
          systemPrompt: [baseRunSettings.systemPrompt.trim(), memosMemoryBlock]
            .filter(Boolean)
            .join("\n\n")
        };
      } else if (!result.ok) {
        console.warn("[memos][search][agent] failed", result.message);
      }
    } catch (error) {
      console.warn(
        "[memos][search][agent] failed",
        error instanceof Error ? error.message : "unknown_error"
      );
    }
  }

  setAgentErrorBanner(null);

  const userMessage: AgentMessage = {
    id: createId(),
    sessionId,
    role: "user",
    content: input,
    createdAt: nowIso(),
    attachments: messageAttachments.length ? messageAttachments : undefined
  };
  const assistantMessage: AgentMessage = {
    id: createId(),
    sessionId,
    role: "assistant",
    content: "",
    createdAt: nowIso()
  };

  upsertAgentMessages(sessionId, (messages) => [...messages, userMessage, assistantMessage]);
  if (activeAgentSession.title === "New Agent Session") {
    const titleSeed = input || messageAttachments[0]?.name || "";
    if (titleSeed) {
      const nextTitle = titleSeed.length > 40 ? `${titleSeed.slice(0, 40)}...` : titleSeed;
      setAgentSessions((previous) =>
        previous.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                title: nextTitle,
                updatedAt: nowIso()
              }
            : session
        )
      );
    }
  }
  removeAgentPermissionRequests({ sessionId });
  setIsAgentRunning(true);

  try {
    let streamedAssistantText = "";
    let stoppedByUser = false;
    let runId = "";
    const bufferedEnvelopes: AgentStreamEnvelope[] = [];

    const baseHandleEnvelope = createAgentStreamEnvelopeHandler({
      sessionId,
      assistantMessageId: assistantMessage.id,
      upsertAgentMessages,
      appendAgentSystemEvent,
      setAgentErrorBanner,
      finishAgentRun,
      loadAgentMessages,
      onPermissionRequest: (permissionPayload) => {
        enqueueAgentPermissionRequest(permissionPayload);
      },
      onPermissionResolved: (permissionPayload) => {
        const permissionEvent = permissionPayload.event;
        if (permissionEvent.type === "permission_resolved") {
          removeAgentPermissionRequests({
            runId: permissionPayload.runId,
            requestId: permissionEvent.requestId
          });
        }
      }
    });
    const handleEnvelope = (payload: AgentStreamEnvelope) => {
      const streamEvent = payload.event;
      if (streamEvent.type === "text_delta") {
        streamedAssistantText = `${streamedAssistantText}${streamEvent.text}`;
      } else if (streamEvent.type === "text_complete") {
        if (!streamedAssistantText.endsWith(streamEvent.text)) {
          streamedAssistantText = `${streamedAssistantText}${streamEvent.text}`;
        }
      } else if (
        streamEvent.type === "task_progress" &&
        streamEvent.message.toLowerCase().includes("stopped by user")
      ) {
        stoppedByUser = true;
      } else if (streamEvent.type === "complete") {
        removeAgentPermissionRequests({ runId: payload.runId });
        if (settings.memos.enabled && !stoppedByUser && input) {
          const assistantText = streamedAssistantText.trim();
          if (assistantText) {
            void api.memos
              .addMessage({
                settings,
                conversationId: "echo-global-memory",
                userMessage: input,
                assistantMessage: assistantText
              })
              .then((result) => {
                if (!result.ok) {
                  console.warn("[memos][add][agent] failed", result.message);
                }
              })
              .catch((error) => {
                console.warn(
                  "[memos][add][agent] failed",
                  error instanceof Error ? error.message : "unknown_error"
                );
              });
          }
        }
      } else if (streamEvent.type === "error") {
        removeAgentPermissionRequests({ runId: payload.runId });
      }
      baseHandleEnvelope(payload);
    };

    const unsubscribe = api.agent.onStreamEvent("*", (payload) => {
      if (payload.sessionId !== sessionId) {
        return;
      }
      if (!runId) {
        bufferedEnvelopes.push(payload);
        return;
      }
      if (payload.runId !== runId) {
        return;
      }
      handleEnvelope(payload);
    });

    try {
      const response = await api.agent.sendMessage({
        sessionId,
        input,
        attachments: messageAttachments.length ? messageAttachments : undefined,
        settings: runSettings,
        environmentSnapshot
      });
      runId = response.runId;
      upsertAgentMessages(sessionId, (messages) =>
        messages.map((message) =>
          message.id === assistantMessage.id || message.id === userMessage.id
            ? {
                ...message,
                runId
              }
            : message
        )
      );
    } catch (error) {
      unsubscribe();
      throw error;
    }

    const hasRunTerminalAssistantMessage = (messages: AgentMessage[]) =>
      messages.some(
        (message) =>
          message.runId === runId &&
          message.role === "assistant" &&
          (message.status === "completed" || message.status === "error" || message.status === "stopped")
      );

    const pollTimerId = window.setInterval(() => {
      const activeRun = activeAgentRunRef.current;
      if (!activeRun || activeRun.runId !== runId) {
        return;
      }
      void api.agent
        .getMessages(sessionId)
        .then((messages) => {
          if (!hasRunTerminalAssistantMessage(messages)) {
            return;
          }
          void fetchAndSetAgentMessages(sessionId)
            .catch(() => {})
            .finally(() => {
              if (activeAgentRunRef.current?.runId === runId) {
                finishAgentRun();
              }
            });
        })
        .catch(() => {});
    }, 1000);

    activeAgentRunRef.current = {
      runId,
      sessionId,
      assistantMessageId: assistantMessage.id,
      pollTimerId,
      unsubscribe
    };

    setAgentDraft("");
    clearAgentDraftAttachments();
    bufferedEnvelopes
      .filter((payload) => payload.runId === runId)
      .forEach((payload) => {
        handleEnvelope(payload);
      });
  } catch (error) {
    setIsAgentRunning(false);
    setAgentErrorBanner(error instanceof Error ? error.message : "Failed to start agent run.");
    void loadAgentMessages(sessionId).catch(() => {});
  }
};
