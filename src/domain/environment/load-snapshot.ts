import {
  buildUnavailableWeather,
  collectLocalEnvironmentContext,
  toStaleWeatherFromPrevious
} from "../../lib/environment-context";
import type {
  EnvironmentDeviceStatus,
  EnvironmentSnapshot,
  EnvironmentTemperatureUnit,
  EnvironmentWeatherSnapshot
} from "../../shared/contracts";

type LoadEnvironmentSnapshotOptions = {
  city: string;
  cwd: string;
  temperatureUnit: EnvironmentTemperatureUnit;
  weatherCacheTtlMs: number;
  weatherTimeoutMs: number;
  previousWeather: EnvironmentWeatherSnapshot | null | undefined;
  getWeatherSnapshot: (payload: {
    city: string;
    temperatureUnit: EnvironmentTemperatureUnit;
    cacheTtlMs?: number;
  }) => Promise<EnvironmentWeatherSnapshot>;
  getSystemStatus: () => Promise<EnvironmentDeviceStatus>;
};

export const loadEnvironmentSnapshot = async (
  options: LoadEnvironmentSnapshotOptions
): Promise<EnvironmentSnapshot> => {
  const city = options.city.trim();
  const [local, systemStatus] = await Promise.all([
    collectLocalEnvironmentContext(options.cwd),
    options.getSystemStatus().catch(() => ({} as EnvironmentDeviceStatus))
  ]);

  let weather = buildUnavailableWeather(city ? "weather_lookup_skipped" : "city_not_set");
  if (city) {
    const timeoutMs = Math.min(Math.max(options.weatherTimeoutMs, 100), 2000);
    let timeoutId: number | null = null;
    try {
      const weatherRequest = options.getWeatherSnapshot({
        city,
        temperatureUnit: options.temperatureUnit,
        cacheTtlMs: options.weatherCacheTtlMs
      });
      const timeoutRequest = new Promise<null>((resolve) => {
        timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
      });
      const nextWeather = await Promise.race([weatherRequest, timeoutRequest]);
      weather =
        nextWeather ??
        toStaleWeatherFromPrevious(options.previousWeather, "weather_timeout") ??
        buildUnavailableWeather("weather_timeout");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "weather_lookup_failed";
      weather =
        toStaleWeatherFromPrevious(options.previousWeather, reason) ?? buildUnavailableWeather(reason);
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  return {
    ...local,
    device: {
      ...local.device,
      ...systemStatus
    },
    location: { city },
    weather
  };
};
