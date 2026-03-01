import { ipcMain } from "electron";
import type {
  AgentMessage,
  AgentResolvePermissionRequest,
  AgentResolvePermissionResult,
  AgentSendMessageRequest,
  AgentSendMessageResult,
  AgentSessionMeta
} from "../../src/shared/agent-contracts";
import { agentOrchestrator } from "./agent-orchestrator";
import { agentSessionManager } from "./agent-session-manager";

export const AGENT_STREAM_EVENT_CHANNEL = "agent:stream:event";

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
    async (event, request: AgentSendMessageRequest): Promise<AgentSendMessageResult> =>
      agentOrchestrator.startRun({
        request,
        emitEnvelope: (envelope) => {
          event.sender.send(AGENT_STREAM_EVENT_CHANNEL, envelope);
        }
      })
  );

  ipcMain.handle(
    "agent:stop",
    async (_event, payload: { runId?: string; sessionId?: string }): Promise<void> =>
      agentOrchestrator.stopRun(payload)
  );

  ipcMain.handle(
    "agent:resolvePermission",
    async (_event, payload: AgentResolvePermissionRequest): Promise<AgentResolvePermissionResult> =>
      agentOrchestrator.resolvePermission(payload)
  );
};
