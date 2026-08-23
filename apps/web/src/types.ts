export type Screen =
  | "tracker"
  | "timesheet"
  | "calendar"
  | "reports"
  | "projects"
  | "clients"
  | "tags"
  | "invoices"
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
  tagIds?: string[];
  projectId?: string | null;
  taskId?: string | null;
  start: string;
  end: string;
  startAt?: string;
  endAt?: string | null;
  dur: string;
  durationSeconds?: number;
  billable: boolean;
  approval?: string;
  kind?: string;
}

export interface CalendarBlock {
  id: string;
  desc: string;
  project: string;
  color: string;
  tag?: string;
  startMin: number;
  endMin: number;
  dur: string;
}

export interface CalendarDay {
  key: string;
  label: string;
  weekday: string;
  dateLabel: string;
  totalSeconds: number;
  entries: CalendarBlock[];
}

export interface TaskOption {
  id: string;
  projectId: string;
  name: string;
  billableRate?: string | null;
}

export interface ClientRow {
  id: string;
  name: string;
  projects: number;
  tracked: string;
}

export interface TagRow {
  id: string;
  name: string;
  color: string;
  uses: number;
}

export interface ProjectDraft {
  name: string;
  clientId: string;
  color: string;
  isBillable: boolean;
  billableRate: string;
  estimatedHours: string;
  access: "public" | "private";
  status: "active" | "on_hold" | "archived";
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
  projectId: string | null;
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

export interface InvoiceListRow {
  id: string;
  number: string;
  client: string;
  clientId: string;
  status: "draft" | "sent" | "paid" | "void";
  issueDate: string;
  dueDate: string | null;
  currency: string;
  hours: number;
  amount: number;
  lineCount: number;
}

export interface InvoiceLineRow {
  id: string;
  description: string;
  project: string | null;
  quantityHours: number;
  rate: number;
  amount: number;
  timeEntryId: string | null;
}

export interface InvoiceDetail extends InvoiceListRow {
  notes: string | null;
  lines: InvoiceLineRow[];
  rangeFrom: string | null;
  rangeTo: string | null;
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
  clientId?: string | null;
  tracked: string;
  progress: number | null; // 0..1, or null when no budget
  budget: string;
  rate: string;
  status: ProjectStatus;
  statusColor: string;
  access: ProjectAccess;
  favorite: boolean;
  isBillable?: boolean;
  billableRate?: string | null;
  estimatedHours?: string | null;
  rawStatus?: string;
}
