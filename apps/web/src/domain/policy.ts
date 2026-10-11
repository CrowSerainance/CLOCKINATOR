export type RoundingMode = "nearest" | "up" | "down";

export interface EntryPolicy {
  requireDescription: boolean;
  requireProject: boolean;
  requireTask: boolean;
  requireTag: boolean;
  requiredCustom: Array<{ fieldId: string; name: string }>;
}

export interface EntryPolicyInput {
  description: string;
  projectId: string | null;
  taskId: string | null;
  tagIds: string[];
  customFields?: Array<{ fieldId: string; value: string }>;
}

/** Round a duration to a minute grid. A zero minute size leaves the duration unchanged. */
export function roundSeconds(seconds: number, minutes: number, mode: RoundingMode = "nearest"): number {
  const safe = Math.max(0, Math.floor(seconds));
  if (!minutes || minutes <= 0) return safe;
  const unit = minutes * 60;
  if (mode === "up") return Math.ceil(safe / unit) * unit;
  if (mode === "down") return Math.floor(safe / unit) * unit;
  return Math.round(safe / unit) * unit;
}

export function entryPolicyErrors(policy: EntryPolicy, input: EntryPolicyInput): string[] {
  const errors: string[] = [];
  const description = input.description.trim();
  if (policy.requireDescription && (!description || description === "No description")) {
    errors.push("Description is required");
  }
  if (policy.requireProject && !input.projectId) errors.push("Project is required");
  if (policy.requireTask && !input.taskId) errors.push("Task is required");
  if (policy.requireTag && input.tagIds.length === 0) errors.push("A tag is required");
  const values = new Map((input.customFields ?? []).map((field) => [field.fieldId, field.value.trim()]));
  for (const field of policy.requiredCustom) {
    if (!values.get(field.fieldId)) errors.push(`${field.name} is required`);
  }
  return errors;
}

export interface CsvTimeRow {
  date: string;
  start: string;
  end: string;
  description: string;
  project: string;
  task: string;
  billable: boolean;
  tags: string[];
}

/** Parse a timesheet CSV. Header must include date, start, and end. */
export function parseTimesheetCsv(text: string): { rows: CsvTimeRow[]; errors: string[] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return { rows: [], errors: ["CSV is empty"] };
  const header = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const index = (name: string) => header.indexOf(name);
  const dateIdx = index("date");
  const startIdx = index("start");
  const endIdx = index("end");
  if (dateIdx < 0 || startIdx < 0 || endIdx < 0) {
    return { rows: [], errors: ["CSV needs date, start, and end columns"] };
  }
  const descIdx = index("description");
  const projectIdx = index("project");
  const taskIdx = index("task");
  const billIdx = index("billable");
  const tagIdx = index("tags");
  const rows: CsvTimeRow[] = [];
  const errors: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const date = cells[dateIdx] ?? "";
    const start = cells[startIdx] ?? "";
    const end = cells[endIdx] ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
      errors.push(`Row ${i + 1}: date must be YYYY-MM-DD and times HH:MM`);
      continue;
    }
    const billRaw = (billIdx >= 0 ? cells[billIdx] : "yes").toLowerCase();
    const billable = !["no", "false", "0", "n"].includes(billRaw);
    const tags = (tagIdx >= 0 ? cells[tagIdx] : "")
      .split(/[|;]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    rows.push({
      date,
      start,
      end,
      description: descIdx >= 0 ? cells[descIdx] ?? "" : "",
      project: projectIdx >= 0 ? cells[projectIdx] ?? "" : "",
      task: taskIdx >= 0 ? cells[taskIdx] ?? "" : "",
      billable,
      tags,
    });
  }
  return { rows, errors };
}

export function forecastUtilization(scheduledHours: number, capacityHours: number): number {
  if (capacityHours <= 0) return 0;
  return scheduledHours / capacityHours;
}

/** Convert a workspace-currency amount into a client currency. rateToBase is workspace units per 1 foreign unit. */
export function convertFromBase(amount: number, rateToBase: number): number {
  if (!rateToBase || rateToBase === 1) return amount;
  return amount / rateToBase;
}

export interface AttendanceInputRow {
  userId: string;
  user: string;
  day: string;
  start: string | null;
  end: string | null;
  seconds: number;
  off: boolean;
}

export function attendanceStatus(seconds: number, off: boolean): "present" | "off" | "absent" {
  if (seconds > 0) return "present";
  if (off) return "off";
  return "absent";
}

export function isWeekendKey(day: string): boolean {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}
