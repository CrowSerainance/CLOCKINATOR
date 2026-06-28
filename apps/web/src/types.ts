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
