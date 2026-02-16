import { contextBridge, ipcRenderer } from "electron";
import type { MuApi } from "../src/lib/mu-api";
import type { StreamEnvelope } from "../src/shared/contracts";

const STREAM_EVENT_CHANNEL = "chat:stream:event";

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
  }
};

contextBridge.exposeInMainWorld("muApi", api);
