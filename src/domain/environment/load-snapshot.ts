import {
  buildUnavailableWeather,
  collectLocalEnvironmentContext,
  toStaleWeatherFromPrevious
} from "./environment-context";
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
  collectLocalContext?: typeof collectLocalEnvironmentContext;
  buildUnavailable?: typeof buildUnavailableWeather;
  toStaleFromPrevious?: typeof toStaleWeatherFromPrevious;
  setTimeoutFn?: (handler: () => void, timeoutMs: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
};

export const loadEnvironmentSnapshot = async (
  options: LoadEnvironmentSnapshotOptions
): Promise<EnvironmentSnapshot> => {
  const city = options.city.trim();
  const collectLocalContext = options.collectLocalContext ?? collectLocalEnvironmentContext;
  const buildUnavailable = options.buildUnavailable ?? buildUnavailableWeather;
  const toStaleFromPrevious = options.toStaleFromPrevious ?? toStaleWeatherFromPrevious;
  const setTimeoutFn = options.setTimeoutFn ?? ((handler, timeoutMs) => setTimeout(handler, timeoutMs));
  const clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle));

  const [local, systemStatus] = await Promise.all([
    collectLocalContext(options.cwd),
    options.getSystemStatus().catch(() => ({} as EnvironmentDeviceStatus))
  ]);

  let weather = buildUnavailable(city ? "weather_lookup_skipped" : "city_not_set");
  if (city) {
    const timeoutMs = Math.min(Math.max(options.weatherTimeoutMs, 100), 2000);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const weatherRequest = options.getWeatherSnapshot({
        city,
        temperatureUnit: options.temperatureUnit,
        cacheTtlMs: options.weatherCacheTtlMs
      });
      const timeoutRequest = new Promise<null>((resolve) => {
        timeoutId = setTimeoutFn(() => resolve(null), timeoutMs);
      });
      const nextWeather = await Promise.race([weatherRequest, timeoutRequest]);
      weather =
        nextWeather ??
        toStaleFromPrevious(options.previousWeather, "weather_timeout") ??
        buildUnavailable("weather_timeout");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "weather_lookup_failed";
      weather =
        toStaleFromPrevious(options.previousWeather, reason) ?? buildUnavailable(reason);
    } finally {
      if (timeoutId !== null) {
        clearTimeoutFn(timeoutId);
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
