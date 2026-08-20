import { formatDuration, formatHours } from "./duration";

const DURATION_KEY = "clockinator.durationFormat";

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

/** Display duration as h:mm:ss or decimal hours per user preference. */
export function formatDisplayDuration(totalSeconds: number, format: DurationFormat = getDurationFormat()): string {
  if (format === "decimal") return `${formatHours(totalSeconds)}h`;
  return formatDuration(totalSeconds);
}
