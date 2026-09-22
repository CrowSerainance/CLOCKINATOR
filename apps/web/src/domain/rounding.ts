export type RoundingMode = "none" | "nearest" | "up" | "down";
export type RoundingIncrement = 5 | 6 | 10 | 15 | 30 | 60;

export interface RoundingSettings {
  mode: RoundingMode;
  incrementMinutes: RoundingIncrement;
}

export const DEFAULT_ROUNDING: RoundingSettings = {
  mode: "none",
  incrementMinutes: 15,
};

/**
 * Round one completed entry for report presentation and exports.
 * Stored time is never changed; rounding is applied per entry so totals match CSV/PDF rows.
 */
export function roundDurationSeconds(totalSeconds: number, settings: RoundingSettings): number {
  const seconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.round(totalSeconds)) : 0;
  if (settings.mode === "none") return seconds;

  const incrementSeconds = settings.incrementMinutes * 60;
  const units = seconds / incrementSeconds;
  if (settings.mode === "up") return Math.ceil(units) * incrementSeconds;
  if (settings.mode === "down") return Math.floor(units) * incrementSeconds;
  return Math.round(units) * incrementSeconds;
}

export function roundingLabel(settings: RoundingSettings): string {
  if (settings.mode === "none") return "No rounding";
  const action = settings.mode === "nearest" ? "Nearest" : settings.mode === "up" ? "Round up" : "Round down";
  return `${action} ${settings.incrementMinutes}m per entry`;
}
