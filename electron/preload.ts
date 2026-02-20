import { contextBridge, ipcRenderer } from "electron";
import type { MuApi } from "../src/lib/mu-api";
import type { StreamEnvelope } from "../src/shared/contracts";
import type { AgentStreamEnvelope } from "../src/shared/agent-contracts";

const STREAM_EVENT_CHANNEL = "chat:stream:event";
const AGENT_STREAM_EVENT_CHANNEL = "agent:stream:event";

const api: MuApi = {
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    save: (settings) => ipcRenderer.invoke("settings:save", settings),
    testConnection: (settings) => ipcRenderer.invoke("settings:testConnection", settings),
    listModels: (settings) => ipcRenderer.invoke("settings:listModels", settings)
  },
  sessions: {
    get: () => ipcRenderer.invoke("sessions:get"),
    save: (sessions) => ipcRenderer.invoke("sessions:save", sessions)
  },
  chat: {
    startStream: (payload) => ipcRenderer.invoke("chat:startStream", payload),
    stopStream: (streamId) => ipcRenderer.invoke("chat:stopStream", streamId),
    onStreamEvent: (streamId, listener) => {
      const handler = (_event: unknown, payload: StreamEnvelope) => {
        if (payload.streamId === streamId) {
          listener(payload.event);
        }
      };
      ipcRenderer.on(STREAM_EVENT_CHANNEL, handler);
      return () => {
        ipcRenderer.off(STREAM_EVENT_CHANNEL, handler);
      };
    }
  },
  agent: {
    listSessions: () => ipcRenderer.invoke("agent:listSessions"),
    createSession: (title) => ipcRenderer.invoke("agent:createSession", title),
    deleteSession: (sessionId) => ipcRenderer.invoke("agent:deleteSession", sessionId),
    updateSessionTitle: (payload) => ipcRenderer.invoke("agent:updateSessionTitle", payload),
    getMessages: (sessionId) => ipcRenderer.invoke("agent:getMessages", sessionId),
    sendMessage: (payload) => ipcRenderer.invoke("agent:sendMessage", payload),
    stop: (payload) => ipcRenderer.invoke("agent:stop", payload),
    onStreamEvent: (runId, listener) => {
      const handler = (_event: unknown, payload: AgentStreamEnvelope) => {
        if (payload.runId === runId) {
          listener(payload);
        }
      };
      ipcRenderer.on(AGENT_STREAM_EVENT_CHANNEL, handler);
      return () => {
        ipcRenderer.off(AGENT_STREAM_EVENT_CHANNEL, handler);
      };
    }
  }
};

contextBridge.exposeInMainWorld("muApi", api);
