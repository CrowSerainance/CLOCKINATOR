import { formatDuration, formatHours } from "./duration";
import {
  DEFAULT_ROUNDING,
  type RoundingIncrement,
  type RoundingMode,
  type RoundingSettings,
} from "./rounding";

const DURATION_KEY = "clockinator.durationFormat";
const REPORT_ROUNDING_KEY = "clockinator.reportRounding";

export type DurationFormat = "clock" | "decimal";

export function getDurationFormat(): DurationFormat {
  if (typeof localStorage === "undefined") return "clock";
  return localStorage.getItem(DURATION_KEY) === "decimal" ? "decimal" : "clock";
}

export function setDurationFormat(format: DurationFormat): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(DURATION_KEY, format);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("clockinator:prefs"));
  }
}

const ROUNDING_MODES: RoundingMode[] = ["none", "nearest", "up", "down"];
const ROUNDING_INCREMENTS: RoundingIncrement[] = [5, 6, 10, 15, 30, 60];

export function getReportRounding(): RoundingSettings {
  if (typeof localStorage === "undefined") return DEFAULT_ROUNDING;
  try {
    const stored = JSON.parse(localStorage.getItem(REPORT_ROUNDING_KEY) ?? "null") as Partial<RoundingSettings> | null;
    const mode = ROUNDING_MODES.includes(stored?.mode as RoundingMode) ? (stored!.mode as RoundingMode) : DEFAULT_ROUNDING.mode;
    const incrementMinutes = ROUNDING_INCREMENTS.includes(stored?.incrementMinutes as RoundingIncrement)
      ? (stored!.incrementMinutes as RoundingIncrement)
      : DEFAULT_ROUNDING.incrementMinutes;
    return { mode, incrementMinutes };
  } catch {
    return DEFAULT_ROUNDING;
  }
}

export function setReportRounding(settings: RoundingSettings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(REPORT_ROUNDING_KEY, JSON.stringify(settings));
  if (typeof window !== "undefined") window.dispatchEvent(new Event("clockinator:prefs"));
}

/** Display duration as h:mm:ss or decimal hours per user preference. */
export function formatDisplayDuration(totalSeconds: number, format: DurationFormat = getDurationFormat()): string {
  if (format === "decimal") return `${formatHours(totalSeconds)}h`;
  return formatDuration(totalSeconds);
}

export type { RoundingSettings } from "./rounding";
