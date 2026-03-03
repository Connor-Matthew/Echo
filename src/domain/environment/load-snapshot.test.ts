import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EnvironmentSnapshot, EnvironmentWeatherSnapshot } from "../../shared/contracts";
import { loadEnvironmentSnapshot } from "./load-snapshot";

const createLocalContext = (cwd: string): Omit<EnvironmentSnapshot, "location" | "weather"> => ({
  capturedAt: "2026-03-02T00:00:00.000Z",
  cwd,
  time: {
    iso: "2026-03-02T00:00:00.000Z",
    date: "3/2/2026",
    time: "12:00:00 AM",
    timezone: "UTC",
    locale: "en-US"
  },
  device: {
    type: "desktop",
    network: {
      online: true,
      effectiveType: "wifi"
    }
  }
});

describe("domain/environment/load-snapshot", () => {
  it("skips weather lookup when city is empty and merges system status", async () => {
    let weatherCalls = 0;
    const snapshot = await loadEnvironmentSnapshot({
      city: "   ",
      cwd: "/workspace",
      temperatureUnit: "c",
      weatherCacheTtlMs: 30_000,
      weatherTimeoutMs: 5000,
      previousWeather: null,
      collectLocalContext: async (cwd) => createLocalContext(cwd),
      getWeatherSnapshot: async () => {
        weatherCalls += 1;
        return { status: "ok", source: "open-meteo", city: "ignored" };
      },
      getSystemStatus: async () => ({
        system: {
          platform: "darwin",
          release: "24.0.0",
          arch: "arm64"
        }
      })
    });

    assert.equal(weatherCalls, 0);
    assert.equal(snapshot.location.city, "");
    assert.equal(snapshot.weather.status, "unavailable");
    assert.equal(snapshot.weather.reason, "city_not_set");
    assert.equal(snapshot.device.system?.platform, "darwin");
  });

  it("uses stale previous weather on timeout", async () => {
    const previousWeather: EnvironmentWeatherSnapshot = {
      status: "ok",
      source: "open-meteo",
      city: "Paris",
      summary: "Sunny",
      temp: 24
    };
    let clearCalls = 0;

    const snapshot = await loadEnvironmentSnapshot({
      city: "Paris",
      cwd: "/workspace",
      temperatureUnit: "c",
      weatherCacheTtlMs: 30_000,
      weatherTimeoutMs: 1000,
      previousWeather,
      collectLocalContext: async (cwd) => createLocalContext(cwd),
      getWeatherSnapshot: async () => new Promise<EnvironmentWeatherSnapshot>(() => {}),
      getSystemStatus: async () => ({}),
      setTimeoutFn: (handler) => {
        handler();
        return setTimeout(() => {}, 0);
      },
      clearTimeoutFn: () => {
        clearCalls += 1;
      }
    });

    assert.equal(snapshot.weather.status, "stale");
    assert.equal(snapshot.weather.reason, "weather_timeout");
    assert.equal(snapshot.weather.summary, "Sunny");
    assert.equal(clearCalls, 1);
  });

  it("falls back to unavailable weather when lookup throws without previous cache", async () => {
    const snapshot = await loadEnvironmentSnapshot({
      city: "London",
      cwd: "/workspace",
      temperatureUnit: "c",
      weatherCacheTtlMs: 30_000,
      weatherTimeoutMs: 1000,
      previousWeather: null,
      collectLocalContext: async (cwd) => createLocalContext(cwd),
      getWeatherSnapshot: async () => {
        throw new Error("service_down");
      },
      getSystemStatus: async () => ({})
    });

    assert.equal(snapshot.weather.status, "unavailable");
    assert.equal(snapshot.weather.reason, "service_down");
  });
});
