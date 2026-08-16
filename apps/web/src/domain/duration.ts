export function nowIso(at: Date = new Date()): string {
  return at.toISOString();
}

export function durationSeconds(startIso: string, endIso: string): number {
  return Math.max(0, Math.floor((Date.parse(endIso) - Date.parse(startIso)) / 1000));
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}`;
}

export function formatHours(totalSeconds: number, digits = 2): string {
  return (totalSeconds / 3600).toFixed(digits);
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localDayKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfLocalWeek(d: Date): Date {
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = startOfLocalDay(d);
  start.setDate(start.getDate() + mondayOffset);
  return start;
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function dayLabel(dayKey: string, todayKey: string, yesterdayKey: string): string {
  if (dayKey === todayKey) return "Today";
  if (dayKey === yesterdayKey) return "Yesterday";
  const [y, m, dd] = dayKey.split("-").map(Number);
  const date = new Date(y, m - 1, dd);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
