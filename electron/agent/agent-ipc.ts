import { ipcMain, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import {
  type AgentMessage,
  type AgentSendMessageRequest,
  type AgentSendMessageResult,
  type AgentSessionMeta,
  type AgentStreamEnvelope,
  type AgentStreamEvent
} from "../../src/shared/agent-contracts";
import { agentSessionManager } from "./agent-session-manager";
import { runClaudeAgentQuery } from "./agent-service";

export const AGENT_STREAM_EVENT_CHANNEL = "agent:stream:event";

type ActiveRunState = {
  controller: AbortController;
  sessionId: string;
  seq: number;
};

const activeRuns = new Map<string, ActiveRunState>();

const createId = () => crypto.randomUUID();

const nowIso = () => new Date().toISOString();

const finalizeTitleFromPrompt = (prompt: string) => {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return "New Agent Session";
  }
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed;
};

const sendAgentEvent = (
  sender: IpcMainInvokeEvent["sender"],
  sessionId: string,
  runId: string,
  state: ActiveRunState,
  event: AgentStreamEvent
) => {
  state.seq += 1;
  const envelope: AgentStreamEnvelope = {
    sessionId,
    runId,
    seq: state.seq,
    timestamp: nowIso(),
    event
  };
  sender.send(AGENT_STREAM_EVENT_CHANNEL, envelope);
};

const resolveRunCwd = (requestCwd?: string) => {
  const raw = requestCwd?.trim();
  if (!raw) {
    return process.cwd();
  }
  return path.isAbsolute(raw) ? raw : process.cwd();
};

const appendAgentMessage = (
  sessionId: string,
  role: AgentMessage["role"],
  content: string,
  runId: string | undefined,
  status: AgentMessage["status"]
): AgentMessage => ({
  id: createId(),
  sessionId,
  role,
  content,
  createdAt: nowIso(),
  runId,
  status
});

export const registerAgentIpcHandlers = () => {
  ipcMain.handle("agent:listSessions", async (): Promise<AgentSessionMeta[]> =>
    agentSessionManager.listSessions()
  );

  ipcMain.handle("agent:createSession", async (_event, title?: string): Promise<AgentSessionMeta> =>
    agentSessionManager.createSession(title)
  );

  ipcMain.handle("agent:deleteSession", async (_event, sessionId: string): Promise<void> => {
    await agentSessionManager.deleteSession(sessionId);
  });

  ipcMain.handle(
    "agent:updateSessionTitle",
    async (_event, payload: { sessionId: string; title: string }): Promise<AgentSessionMeta> => {
      const title = payload.title.trim();
      if (!title) {
        throw new Error("Session title cannot be empty.");
      }
      return agentSessionManager.updateSessionMeta(payload.sessionId, { title });
    }
  );

  ipcMain.handle("agent:getMessages", async (_event, sessionId: string): Promise<AgentMessage[]> =>
    agentSessionManager.getMessages(sessionId)
  );

  ipcMain.handle(
    "agent:sendMessage",
    async (event, request: AgentSendMessageRequest): Promise<AgentSendMessageResult> => {
      if (request.settings.providerType !== "claude-agent") {
        throw new Error("Selected provider is not Claude Agent.");
      }

      const sessions = await agentSessionManager.listSessions();
      const session = sessions.find((entry) => entry.id === request.sessionId);
      if (!session) {
        throw new Error("Agent session not found.");
      }

      const input = request.input.trim();
      if (!input) {
        throw new Error("Message content is empty.");
      }

      const runId = createId();
      const controller = new AbortController();
      const runState: ActiveRunState = {
        controller,
        sessionId: request.sessionId,
        seq: 0
      };
      activeRuns.set(runId, runState);

      const userMessage = appendAgentMessage(request.sessionId, "user", input, runId, "completed");
      await agentSessionManager.appendMessage(request.sessionId, userMessage);

      if (session.title === "New Agent Session") {
        await agentSessionManager.updateSessionMeta(request.sessionId, {
          title: finalizeTitleFromPrompt(input)
        });
      }

      const cwd = resolveRunCwd(request.cwd);
      await agentSessionManager.updateSessionMeta(request.sessionId, {
        lastCwd: cwd,
        lastModel: request.settings.model,
        lastProviderId: request.settings.providerId
      });

      void (async () => {
        let streamedAssistantText = "";
        try {
          const history = await agentSessionManager.getMessages(request.sessionId);
          const result = await runClaudeAgentQuery({
            request,
            history,
            signal: controller.signal,
            cwd,
            resumeSessionId: session.sdkSessionId,
            onEvent: (streamEvent) => {
              if (streamEvent.type === "text_delta") {
                streamedAssistantText = `${streamedAssistantText}${streamEvent.text}`;
              }
              if (
                streamEvent.type === "text_complete" &&
                streamEvent.text &&
                !streamedAssistantText.endsWith(streamEvent.text)
              ) {
                streamedAssistantText = `${streamedAssistantText}${streamEvent.text}`;
              }
              sendAgentEvent(event.sender, request.sessionId, runId, runState, streamEvent);
            }
          });

          const assistantText = result.assistantText || streamedAssistantText.trim();
          if (assistantText) {
            await agentSessionManager.appendMessage(
              request.sessionId,
              appendAgentMessage(request.sessionId, "assistant", assistantText, runId, "completed")
            );
          }

          await agentSessionManager.updateSessionMeta(request.sessionId, {
            sdkSessionId: result.sdkSessionId ?? session.sdkSessionId,
            lastCwd: cwd,
            lastModel: request.settings.model,
            lastProviderId: request.settings.providerId
          });

          sendAgentEvent(event.sender, request.sessionId, runId, runState, {
            type: "complete",
            usage: result.usage
          });
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            if (streamedAssistantText.trim()) {
              await agentSessionManager.appendMessage(
                request.sessionId,
                appendAgentMessage(
                  request.sessionId,
                  "assistant",
                  streamedAssistantText.trim(),
                  runId,
                  "stopped"
                )
              );
            }
            sendAgentEvent(event.sender, request.sessionId, runId, runState, {
              type: "task_progress",
              message: "Stopped by user."
            });
            sendAgentEvent(event.sender, request.sessionId, runId, runState, {
              type: "complete"
            });
            return;
          }

          const message = error instanceof Error ? error.message : "Agent execution failed.";
          sendAgentEvent(event.sender, request.sessionId, runId, runState, {
            type: "error",
            message
          });
        } finally {
          activeRuns.delete(runId);
        }
      })();

      return { runId };
    }
  );

  ipcMain.handle(
    "agent:stop",
    async (_event, payload: { runId?: string; sessionId?: string }): Promise<void> => {
      const { runId, sessionId } = payload;
      if (runId) {
        const active = activeRuns.get(runId);
        if (active) {
          active.controller.abort();
          activeRuns.delete(runId);
        }
        return;
      }

      if (!sessionId) {
        return;
      }

      for (const [currentRunId, active] of activeRuns.entries()) {
        if (active.sessionId === sessionId) {
          active.controller.abort();
          activeRuns.delete(currentRunId);
        }
      }
    }
  );
};
