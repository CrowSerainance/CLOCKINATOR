export type Screen =
  | "tracker"
  | "timesheet"
  | "reports"
  | "projects"
  | "approvals"
  | "audit";

export interface TimeEntry {
  desc: string;
  project: string;
  color: string;
  client: string;
  tag?: string;
  start: string;
  end: string;
  dur: string;
  billable: boolean;
}

export interface DayGroup {
  label: string;
  total: string;
  entries: TimeEntry[];
}

export type ProjectAccess = "public" | "private";
export type ProjectStatus = "Active" | "On hold" | "Non-billable";

export interface ProjectRow {
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
