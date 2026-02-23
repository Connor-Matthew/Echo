import type { EnvironmentSnapshot, EnvironmentWeatherSnapshot } from "../shared/contracts";

type BatteryManagerLike = {
  level: number;
  charging: boolean;
};

type NetworkInformationLike = {
  effectiveType?: string;
};

type NavigatorWithContext = Navigator & {
  connection?: NetworkInformationLike;
  mozConnection?: NetworkInformationLike;
  webkitConnection?: NetworkInformationLike;
  getBattery?: () => Promise<BatteryManagerLike>;
};

const readBattery = async (): Promise<EnvironmentSnapshot["device"]["battery"] | undefined> => {
  const nav = navigator as NavigatorWithContext;
  if (typeof nav.getBattery !== "function") {
    return undefined;
  }

  try {
    const battery = (await Promise.race([
      nav.getBattery(),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 220))
    ])) as BatteryManagerLike | null;

    if (!battery) {
      return undefined;
    }

    const level =
      typeof battery.level === "number" && Number.isFinite(battery.level)
        ? Math.min(100, Math.max(0, Math.round(battery.level * 100)))
        : undefined;

    return {
      level,
      charging: Boolean(battery.charging)
    };
  } catch {
    return undefined;
  }
};

export const buildUnavailableWeather = (reason: string): EnvironmentWeatherSnapshot => ({
  status: "unavailable",
  source: "open-meteo",
  reason
});

export const toStaleWeatherFromPrevious = (
  previous: EnvironmentWeatherSnapshot | null | undefined,
  reason: string
): EnvironmentWeatherSnapshot | null => {
  if (!previous || (previous.status === "unavailable" && !previous.summary && previous.temp === undefined)) {
    return null;
  }

  return {
    ...previous,
    status: "stale",
    reason
  };
};

export const collectLocalEnvironmentContext = async (
  cwd: string
): Promise<Omit<EnvironmentSnapshot, "location" | "weather">> => {
  const now = new Date();
  const locale =
    Intl.DateTimeFormat().resolvedOptions().locale || navigator.language || "en-US";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const nav = navigator as NavigatorWithContext;
  const connection = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  const battery = await readBattery();

  return {
    capturedAt: now.toISOString(),
    cwd: cwd.trim(),
    time: {
      iso: now.toISOString(),
      date: now.toLocaleDateString(locale),
      time: now.toLocaleTimeString(locale),
      timezone,
      locale
    },
    device: {
      type: battery ? "laptop" : "desktop",
      network: {
        online: navigator.onLine,
        effectiveType: connection?.effectiveType
      },
      battery
    }
  };
};
