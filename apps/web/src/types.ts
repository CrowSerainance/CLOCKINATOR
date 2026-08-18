export type Screen =
  | "tracker"
  | "timesheet"
  | "reports"
  | "projects"
  | "approvals"
  | "audit";

export interface TimeEntry {
  id?: string;
  desc: string;
  project: string;
  color: string;
  client: string;
  tag?: string;
  tags: string[];
  start: string;
  end: string;
  dur: string;
  billable: boolean;
  approval?: string;
}

export interface TagOption {
  id: string;
  name: string;
  color: string;
}

export interface TimesheetCell {
  seconds: number;
  label: string;
}

export interface TimesheetRow {
  project: string;
  color: string;
  cells: TimesheetCell[];
  totalSeconds: number;
}

export interface TimesheetGrid {
  days: Array<{ key: string; label: string; totalSeconds: number }>;
  rows: TimesheetRow[];
  weekTotal: number;
}

export interface ReportDay {
  key: string;
  label: string;
  seconds: number;
  stacks: Array<{ title: string; color: string; seconds: number }>;
}

export interface ApprovalRow {
  id: string;
  desc: string;
  project: string;
  color: string;
  day: string;
  dur: string;
  status: string;
}

export interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  actor: string;
  createdAt: string;
}

export interface DayGroup {
  label: string;
  total: string;
  dayKey?: string;
  entries: TimeEntry[];
}

export type ProjectAccess = "public" | "private";
export type ProjectStatus = "Active" | "On hold" | "Non-billable";

export interface ProjectRow {
  id?: string;
  name: string;
  color: string;
  client: string;
  tracked: string;
  progress: number | null; // 0..1, or null when no budget
  budget: string;
  rate: string;
  status: ProjectStatus;
  statusColor: string;
  access: ProjectAccess;
  favorite: boolean;
}
