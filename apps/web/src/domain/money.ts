/** Decimal strings with 2 fraction digits. */

export function parseAmount(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatAmount(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function billableAmount(durationSeconds: number, hourlyRate: string): string {
  const hours = durationSeconds / 3600;
  return formatAmount(hours * parseAmount(hourlyRate));
}

export function formatRate(value: string | null | undefined): string {
  if (value == null || value === "" || parseAmount(value) === 0) return "—";
  return `$${parseAmount(value).toFixed(0)}/h`;
}
