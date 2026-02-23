import { execFile } from "node:child_process";
import { statfs } from "node:fs/promises";
import os from "node:os";
import type { EnvironmentWeatherRequest, EnvironmentWeatherSnapshot } from "../../src/shared/contracts";
import type { EnvironmentDeviceStatus } from "../../src/shared/contracts";

const GEO_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const NETWORK_TIMEOUT_MS = 5000;

type WeatherCacheEntry = {
  expiresAt: number;
  value: EnvironmentWeatherSnapshot;
};

const weatherCache = new Map<string, WeatherCacheEntry>();
type HardwareSnapshot = Partial<NonNullable<EnvironmentDeviceStatus["system"]>>;
let cachedHardwareSnapshot: HardwareSnapshot | null = null;

const fetchJson = async <T>(url: string): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  const response = await fetch(url, { signal: controller.signal }).finally(() => {
    clearTimeout(timeoutId);
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`http_${response.status}${detail ? `:${detail.slice(0, 120)}` : ""}`);
  }
  return (await response.json()) as T;
};

const normalizeCity = (value: string) => value.trim();
const toCacheKey = (city: string, temperatureUnit: EnvironmentWeatherRequest["temperatureUnit"]) =>
  `${city.toLowerCase()}::${temperatureUnit}`;

const weatherCodeToSummary = (code: number) => {
  if (code === 0) {
    return "Clear";
  }
  if (code === 1 || code === 2 || code === 3) {
    return "Partly cloudy";
  }
  if (code === 45 || code === 48) {
    return "Fog";
  }
  if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return "Rain";
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return "Snow";
  }
  if (code >= 95) {
    return "Thunderstorm";
  }
  return "Unknown";
};

const toUnavailable = (reason: string): EnvironmentWeatherSnapshot => ({
  status: "unavailable",
  source: "open-meteo",
  reason
});

const toSafeBytes = (value: unknown): number => {
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    return Number.isFinite(asNumber) && asNumber > 0 ? asNumber : 0;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return 0;
};

const execFileAsync = (file: string, args: string[], timeoutMs: number) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(file, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });

type SystemProfilerHardwarePayload = {
  SPHardwareDataType?: Array<{
    chip_type?: string;
    machine_model?: string;
    machine_name?: string;
    physical_memory?: string;
  }>;
};

const loadMacHardwareSnapshot = async (): Promise<HardwareSnapshot> => {
  if (cachedHardwareSnapshot) {
    return cachedHardwareSnapshot;
  }

  if (process.platform !== "darwin") {
    cachedHardwareSnapshot = {};
    return cachedHardwareSnapshot;
  }

  try {
    const { stdout } = await execFileAsync(
      "system_profiler",
      ["SPHardwareDataType", "-json"],
      2500
    );
    const parsed = JSON.parse(stdout) as SystemProfilerHardwarePayload;
    const first = parsed.SPHardwareDataType?.[0];
    cachedHardwareSnapshot = {
      machineName: first?.machine_name?.trim() || undefined,
      machineModel: first?.machine_model?.trim() || undefined,
      chip: first?.chip_type?.trim() || undefined,
      physicalMemory: first?.physical_memory?.trim() || undefined
    };
    return cachedHardwareSnapshot;
  } catch {
    cachedHardwareSnapshot = {};
    return cachedHardwareSnapshot;
  }
};

type GeocodingResponse = {
  results?: Array<{
    name?: string;
    latitude?: number;
    longitude?: number;
  }>;
};

type ForecastResponse = {
  current?: {
    weather_code?: number;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
  };
};

const resolveForecast = async (city: string, temperatureUnit: EnvironmentWeatherRequest["temperatureUnit"]) => {
  const geocodeUrl = new URL(GEO_ENDPOINT);
  geocodeUrl.searchParams.set("name", city);
  geocodeUrl.searchParams.set("count", "1");
  geocodeUrl.searchParams.set("language", "en");
  geocodeUrl.searchParams.set("format", "json");
  const geocode = await fetchJson<GeocodingResponse>(geocodeUrl.toString());
  const match = geocode.results?.[0];

  if (
    !match ||
    typeof match.latitude !== "number" ||
    typeof match.longitude !== "number"
  ) {
    throw new Error("city_not_found");
  }

  const forecastUrl = new URL(WEATHER_ENDPOINT);
  forecastUrl.searchParams.set("latitude", String(match.latitude));
  forecastUrl.searchParams.set("longitude", String(match.longitude));
  forecastUrl.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code"
  );
  forecastUrl.searchParams.set("temperature_unit", temperatureUnit === "f" ? "fahrenheit" : "celsius");
  forecastUrl.searchParams.set("wind_speed_unit", "kmh");
  const forecast = await fetchJson<ForecastResponse>(forecastUrl.toString());
  const current = forecast.current;

  if (!current) {
    throw new Error("missing_current_weather");
  }

  return {
    city: match.name ?? city,
    weatherCode: typeof current.weather_code === "number" ? current.weather_code : -1,
    temp: typeof current.temperature_2m === "number" ? current.temperature_2m : undefined,
    feelsLike:
      typeof current.apparent_temperature === "number" ? current.apparent_temperature : undefined,
    humidity:
      typeof current.relative_humidity_2m === "number" ? current.relative_humidity_2m : undefined,
    windKph: typeof current.wind_speed_10m === "number" ? current.wind_speed_10m : undefined
  };
};

export const getEnvironmentWeatherSnapshot = async (
  payload: EnvironmentWeatherRequest
): Promise<EnvironmentWeatherSnapshot> => {
  const city = normalizeCity(payload.city);
  if (!city) {
    return toUnavailable("city_not_set");
  }

  const cacheTtlMs =
    typeof payload.cacheTtlMs === "number" && Number.isFinite(payload.cacheTtlMs)
      ? Math.min(Math.max(Math.round(payload.cacheTtlMs), 60000), 3600000)
      : 600000;

  const cacheKey = toCacheKey(city, payload.temperatureUnit);
  const now = Date.now();
  const cached = weatherCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return { ...cached.value, status: "ok" };
  }

  try {
    const forecast = await resolveForecast(city, payload.temperatureUnit);
    const fresh: EnvironmentWeatherSnapshot = {
      status: "ok",
      source: "open-meteo",
      fetchedAt: new Date().toISOString(),
      city: forecast.city,
      summary: weatherCodeToSummary(forecast.weatherCode),
      temp: forecast.temp,
      feelsLike: forecast.feelsLike,
      humidity: forecast.humidity,
      windKph: forecast.windKph
    };

    weatherCache.set(cacheKey, {
      value: fresh,
      expiresAt: now + cacheTtlMs
    });

    return fresh;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "weather_lookup_failed";
    if (cached) {
      return {
        ...cached.value,
        status: "stale",
        reason
      };
    }
    return toUnavailable(reason);
  }
};

export const getEnvironmentDeviceStatus = async (): Promise<EnvironmentDeviceStatus> => {
  const hardware = await loadMacHardwareSnapshot();
  const totalMemoryBytes = toSafeBytes(os.totalmem());
  const freeMemoryBytes = toSafeBytes(os.freemem());
  const usedMemoryBytes = Math.max(0, totalMemoryBytes - freeMemoryBytes);

  const status: EnvironmentDeviceStatus = {
    system: {
      platform: os.platform(),
      release: os.release(),
      version: typeof os.version === "function" ? os.version() : undefined,
      arch: os.arch(),
      hostname: os.hostname(),
      machineName: hardware.machineName,
      machineModel: hardware.machineModel,
      chip: hardware.chip,
      physicalMemory: hardware.physicalMemory
    },
    memory: {
      totalBytes: totalMemoryBytes,
      freeBytes: freeMemoryBytes,
      usedBytes: usedMemoryBytes
    }
  };

  try {
    const fsStats = await statfs("/");
    const blockSize = toSafeBytes(fsStats.bsize);
    const totalBytes = blockSize * toSafeBytes(fsStats.blocks);
    const freeBlocks = toSafeBytes(
      typeof fsStats.bavail === "number" || typeof fsStats.bavail === "bigint"
        ? fsStats.bavail
        : fsStats.bfree
    );
    const freeBytes = blockSize * freeBlocks;
    const usedBytes = Math.max(0, totalBytes - freeBytes);

    status.storage = {
      mountPath: "/",
      totalBytes,
      freeBytes,
      usedBytes
    };
  } catch {
    status.storage = undefined;
  }

  return status;
};
