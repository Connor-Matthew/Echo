import type { EnvironmentSnapshot } from "./contracts";

export type EnvironmentAwareness = {
  localTimePeriod: "late_night" | "morning" | "afternoon" | "evening";
  networkCondition: "online" | "offline" | "limited" | "unknown";
  batteryCondition: "normal" | "low" | "critical" | "charging" | "unknown";
  weatherReliability: "high" | "medium" | "low";
  weatherImpact: "neutral" | "visibility_or_precipitation" | "storm" | "temperature_extreme" | "unknown";
  workspaceContext: "project" | "general";
};

const ENVIRONMENT_USAGE_GUIDANCE_LINES = [
  "Reference environment context only when it materially improves the answer.",
  "Do not fabricate missing environment fields; treat missing values as unknown.",
  "If weather status is stale/unavailable, explicitly state uncertainty before using it."
];

export const ENVIRONMENT_USAGE_GUIDANCE = ENVIRONMENT_USAGE_GUIDANCE_LINES.join("\n");

const resolveHour = (snapshot: EnvironmentSnapshot) => {
  const parsed = new Date(snapshot.time.iso);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.getHours();
  }

  const fallback = Number.parseInt(snapshot.time.time.slice(0, 2), 10);
  if (Number.isFinite(fallback) && fallback >= 0 && fallback <= 23) {
    return fallback;
  }

  return 12;
};

const toLocalTimePeriod = (hour: number): EnvironmentAwareness["localTimePeriod"] => {
  if (hour < 6) {
    return "late_night";
  }
  if (hour < 12) {
    return "morning";
  }
  if (hour < 18) {
    return "afternoon";
  }
  return "evening";
};

const toNetworkCondition = (
  network: EnvironmentSnapshot["device"]["network"] | undefined
): EnvironmentAwareness["networkCondition"] => {
  if (!network) {
    return "unknown";
  }
  if (!network.online) {
    return "offline";
  }
  const effectiveType = (network.effectiveType || "").toLowerCase();
  if (effectiveType === "slow-2g" || effectiveType === "2g") {
    return "limited";
  }
  return "online";
};

const toBatteryCondition = (
  battery: EnvironmentSnapshot["device"]["battery"] | undefined
): EnvironmentAwareness["batteryCondition"] => {
  if (!battery) {
    return "unknown";
  }
  if (battery.charging) {
    return "charging";
  }
  const level = typeof battery.level === "number" ? battery.level : undefined;
  if (level === undefined) {
    return "unknown";
  }
  if (level <= 10) {
    return "critical";
  }
  if (level <= 20) {
    return "low";
  }
  return "normal";
};

const toWeatherReliability = (
  weatherStatus: EnvironmentSnapshot["weather"]["status"]
): EnvironmentAwareness["weatherReliability"] => {
  if (weatherStatus === "ok") {
    return "high";
  }
  if (weatherStatus === "stale") {
    return "medium";
  }
  return "low";
};

const toWeatherImpact = (snapshot: EnvironmentSnapshot): EnvironmentAwareness["weatherImpact"] => {
  if (snapshot.weather.status === "unavailable") {
    return "unknown";
  }

  const summary = (snapshot.weather.summary || "").toLowerCase();
  if (summary.includes("thunderstorm")) {
    return "storm";
  }
  if (summary.includes("rain") || summary.includes("snow") || summary.includes("fog")) {
    return "visibility_or_precipitation";
  }

  const temp = snapshot.weather.temp;
  if (typeof temp === "number" && (temp >= 33 || temp <= 0)) {
    return "temperature_extreme";
  }
  return "neutral";
};

export const deriveEnvironmentAwareness = (snapshot: EnvironmentSnapshot): EnvironmentAwareness => ({
  localTimePeriod: toLocalTimePeriod(resolveHour(snapshot)),
  networkCondition: toNetworkCondition(snapshot.device.network),
  batteryCondition: toBatteryCondition(snapshot.device.battery),
  weatherReliability: toWeatherReliability(snapshot.weather.status),
  weatherImpact: toWeatherImpact(snapshot),
  workspaceContext: snapshot.cwd.trim() ? "project" : "general"
});

export const formatEnvironmentAwarenessBlock = (snapshot: EnvironmentSnapshot) => {
  const awareness = deriveEnvironmentAwareness(snapshot);
  return [
    "environment_awareness:",
    `  local_time_period: ${awareness.localTimePeriod}`,
    `  workspace_context: ${awareness.workspaceContext}`,
    `  network_condition: ${awareness.networkCondition}`,
    `  battery_condition: ${awareness.batteryCondition}`,
    `  weather_reliability: ${awareness.weatherReliability}`,
    `  weather_impact: ${awareness.weatherImpact}`
  ].join("\n");
};

export const formatEnvironmentUsageGuidanceBlock = () =>
  [
    "environment_usage_guidance:",
    ...ENVIRONMENT_USAGE_GUIDANCE_LINES.map((line) => `  - ${line}`)
  ].join("\n");
