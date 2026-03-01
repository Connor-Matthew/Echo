import type { IpcMain } from "electron";
import type { EnvironmentDeviceStatus, EnvironmentWeatherRequest, EnvironmentWeatherSnapshot } from "../../src/shared/contracts";

type EnvironmentHandlerDeps = {
  getEnvironmentWeatherSnapshot: (
    payload: EnvironmentWeatherRequest
  ) => Promise<EnvironmentWeatherSnapshot>;
  getEnvironmentDeviceStatus: () => Promise<EnvironmentDeviceStatus>;
};

export const registerEnvironmentHandlers = (ipcMain: IpcMain, deps: EnvironmentHandlerDeps) => {
  ipcMain.handle(
    "env:getWeatherSnapshot",
    async (_, payload: EnvironmentWeatherRequest) => deps.getEnvironmentWeatherSnapshot(payload)
  );

  ipcMain.handle("env:getSystemStatus", async () => deps.getEnvironmentDeviceStatus());
};
