import { historicRateAt, pickBillableRate, type HistoricRate } from "../domain/rates";
import {
  breakElapsedSeconds,
  pauseTimer,
  resumeTimer,
  sessionElapsedSeconds,
  splitTimer,
  startBreak,
  startTimer,
  stopTimer,
  endBreak,
  type OpenSession,
  type StartTimerInput,
} from "../domain/timer";
import type {
  ApprovalRow,
  AuditRow,
  CalendarDay,
  ClientRow,
  DayGroup,
  InvoiceDetail,
  InvoiceListRow,
  ProjectDraft,
  ProjectRow,
  ReportDay,
  TagOption,
  TagRow,
  TaskOption,
  TimesheetGrid,
} from "../types";
import {
  addDays,
  addMonths,
  dayLabel,
  durationSeconds,
  formatClock,
  formatDuration,
  formatHours,
  fromDateAndTime,
  localDayKey,
  startOfLocalDay,
  startOfLocalWeek,
  toDateInput,
} from "../domain/duration";
import {
  attendanceStatus,
  convertFromBase,
  entryPolicyErrors,
  isWeekendKey,
  parseTimesheetCsv,
  roundSeconds,
  type RoundingMode,
} from "../domain/policy";
import { billableAmount, formatAmount, formatRate, parseAmount } from "../domain/money";
import { savePersistedDb } from "./persist";
import { seedIfEmpty } from "./seed";
import type { SqlDatabase, SqlParam } from "./sql";
import type { EntryListRow, ProjectListRow, TimerEngineDb } from "../domain/timer";

const themeStatus: Record<string, { label: ProjectRow["status"]; color: string }> = {
  active_billable: { label: "Active", color: "#5bbd7e" },
  active_non: { label: "Non-billable", color: "#7d776e" },
  on_hold: { label: "On hold", color: "#e0b15c" },
  archived: { label: "On hold", color: "#7d776e" },
};

export class ClockinatorStore implements TimerEngineDb {
  revision = 0;
  workspaceId = "";
  userId = "";
  workspaceName = "Clockinator";
  userName = "";

  private listeners = new Set<() => void>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly db: SqlDatabase) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  now(): Date {
    return new Date();
  }

  newId(): string {
    return crypto.randomUUID();
  }

  run(sql: string, params: SqlParam[] = []): void {
    this.db.run(sql, params);
  }

  all<T>(sql: string, params: SqlParam[] = []): T[] {
    return this.db.all(sql, params) as T[];
  }

  get<T>(sql: string, params: SqlParam[] = []): T | undefined {
    return this.db.get(sql, params) as T | undefined;
  }

  bootstrap(): void {
    const ids = seedIfEmpty(this.db);
    this.workspaceId = ids.workspaceId;
    const preferred = typeof localStorage !== "undefined" ? localStorage.getItem("clockinator.actingUserId") : null;
    const preferredOk = preferred
      ? this.get<{ id: string }>(`SELECT id FROM users WHERE id = ? AND workspace_id = ?`, [preferred, ids.workspaceId])
      : undefined;
    this.userId = preferredOk ? preferred! : ids.userId;
    this.workspaceName = this.get<{ name: string }>(`SELECT name FROM workspaces WHERE id = ?`, [this.workspaceId])?.name ?? "Clockinator";
    this.userName = this.get<{ name: string }>(`SELECT name FROM users WHERE id = ?`, [this.userId])?.name ?? "";
  }

  audit(action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>): void {
    this.run(
      `INSERT INTO audit_logs (id, workspace_id, actor_user_id, action, target_type, target_id, reason, metadata_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      [this.newId(), this.workspaceId, this.userId, action, targetType, targetId, metadata ? JSON.stringify(metadata) : null, this.now().toISOString()],
    );
  }

  resolveBillableRate(projectId: string | null, taskId: string | null, at: Date): string {
    const atIso = at.toISOString();
    const history = this.all<HistoricRate>(
      `SELECT subject_type, subject_id, rate_kind, amount, effective_from, effective_to
       FROM rate_history
       WHERE workspace_id = ? AND rate_kind = 'billable'`,
      [this.workspaceId],
    );
    const historic = historicRateAt(history, "billable", atIso, [
      { type: "task", id: taskId },
      { type: "project", id: projectId },
      { type: "workspace", id: this.workspaceId },
    ]);
    if (historic) return historic;

    const task = taskId
      ? this.get<{ billable_rate: string | null }>(`SELECT billable_rate FROM tasks WHERE id = ?`, [taskId])
      : undefined;
    const project = projectId
      ? this.get<{ billable_rate: string | null }>(`SELECT billable_rate FROM projects WHERE id = ?`, [projectId])
      : undefined;
    const workspace = this.get<{ default_billable_rate: string }>(
      `SELECT default_billable_rate FROM workspaces WHERE id = ?`,
      [this.workspaceId],
    );
    return pickBillableRate({
      task: task?.billable_rate ?? null,
      project: project?.billable_rate ?? null,
      workspace: workspace?.default_billable_rate ?? "0",
    });
  }

  resolveCostRate(at: Date): string {
    return this.resolveCostRateFor(this.userId, at);
  }

  resolveCostRateFor(userId: string, at: Date): string {
    const atIso = at.toISOString();
    const history = this.all<HistoricRate>(
      `SELECT subject_type, subject_id, rate_kind, amount, effective_from, effective_to
       FROM rate_history
       WHERE workspace_id = ? AND rate_kind = 'cost' AND subject_type = 'user' AND subject_id = ?`,
      [this.workspaceId, userId],
    );
    const historic = historicRateAt(history, "cost", atIso, [{ type: "user", id: userId }]);
    if (historic) return historic;
    return this.get<{ default_cost_rate: string }>(`SELECT default_cost_rate FROM users WHERE id = ?`, [userId])?.default_cost_rate ?? "0";
  }

  getOpenSession(): OpenSession | null {
    const row = this.get<{
      id: string;
      status: OpenSession["status"];
      description: string;
      project_id: string | null;
      task_id: string | null;
      is_billable: number;
      billable_rate_snapshot: string;
      started_at: string;
      project_name: string | null;
      client_name: string | null;
      project_color: string | null;
    }>(
      `SELECT s.id, s.status, s.description, s.project_id, s.task_id, s.is_billable, s.billable_rate_snapshot, s.started_at,
              p.name AS project_name, c.name AS client_name, p.color AS project_color
       FROM timer_sessions s
       LEFT JOIN projects p ON p.id = s.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE s.workspace_id = ? AND s.user_id = ? AND s.status IN ('running', 'paused', 'on_break')`,
      [this.workspaceId, this.userId],
    );
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      description: row.description,
      projectId: row.project_id,
      taskId: row.task_id,
      projectName: row.project_name,
      clientName: row.client_name,
      projectColor: row.project_color,
      isBillable: row.is_billable === 1,
      billableRateSnapshot: row.billable_rate_snapshot,
      startedAt: row.started_at,
    };
  }

  elapsedFor(sessionId: string, at = this.now()): number {
    return sessionElapsedSeconds(this, sessionId, at);
  }

  breakElapsedFor(sessionId: string, at = this.now()): number {
    return breakElapsedSeconds(this, sessionId, at);
  }

  start(input: StartTimerInput & { customFields?: Array<{ fieldId: string; value: string }> }): void {
    this.assertEntryAllowed({
      description: input.description,
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      tagIds: input.tagIds ?? [],
      customFields: input.customFields,
    });
    startTimer(this, input);
    const session = this.getOpenSession();
    if (session) {
      const entry = this.get<{ id: string }>(
        `SELECT id FROM time_entries WHERE session_id = ? AND end_at IS NULL AND deleted_at IS NULL`,
        [session.id],
      );
      if (entry) this.writeCustomFields(entry.id, input.customFields ?? []);
    }
    this.touch();
  }

  pause(): void {
    pauseTimer(this);
    this.touch();
  }

  resume(): void {
    resumeTimer(this);
    this.touch();
  }

  stop(): void {
    stopTimer(this);
    this.touch();
  }

  split(): void {
    splitTimer(this);
    this.touch();
  }

  beginBreak(): void {
    startBreak(this);
    this.touch();
  }

  finishBreak(): void {
    endBreak(this);
    this.touch();
  }

  restartFrom(entryId: string): void {
    const row = this.get<{
      description: string;
      project_id: string | null;
      task_id: string | null;
      is_billable: number;
    }>(`SELECT description, project_id, task_id, is_billable FROM time_entries WHERE id = ? AND deleted_at IS NULL`, [entryId]);
    if (!row) throw new Error("Unknown time entry");
    const tags = this.all<{ tag_id: string }>(`SELECT tag_id FROM time_entry_tags WHERE time_entry_id = ?`, [entryId]).map((t) => t.tag_id);
    this.start({
      description: row.description,
      projectId: row.project_id,
      taskId: row.task_id,
      isBillable: row.is_billable === 1,
      tagIds: tags,
    });
  }

  listProjects(): ProjectRow[] {
    const rows = this.all<ProjectListRow & { client_id: string | null; budget_amount: string | null; billed_amount: number }>(
      `SELECT p.id, p.name, p.color, c.name AS client_name, p.client_id,
              COALESCE(SUM(CASE WHEN e.kind = 'work' AND e.end_at IS NOT NULL AND e.deleted_at IS NULL THEN e.duration_seconds ELSE 0 END), 0) AS tracked_seconds,
              COALESCE(SUM(CASE WHEN e.kind = 'work' AND e.is_billable = 1 AND e.end_at IS NOT NULL AND e.deleted_at IS NULL THEN (e.duration_seconds / 3600.0) * CAST(e.billable_rate_snapshot AS REAL) ELSE 0 END), 0) AS billed_amount,
              p.estimated_hours, p.budget_amount, p.billable_rate, p.is_billable, p.status, p.access, p.is_favorite
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN time_entries e ON e.project_id = p.id
       WHERE p.workspace_id = ?
       GROUP BY p.id
       ORDER BY p.name COLLATE NOCASE`,
      [this.workspaceId],
    );
    return rows.map((row) => {
      const trackedHours = Number(row.tracked_seconds) / 3600;
      const estimate = row.estimated_hours ? Number(row.estimated_hours) : null;
      const progress = estimate && estimate > 0 ? trackedHours / estimate : null;
      const billed = Number(row.billed_amount) || 0;
      const hoursLabel = estimate && estimate > 0 ? `${Math.round(trackedHours)} / ${estimate}h` : null;
      const moneyLabel = row.budget_amount ? `$${Math.round(billed)} / $${Number(row.budget_amount)}` : null;
      const key = row.status === "on_hold" || row.status === "archived" ? "on_hold" : row.is_billable ? "active_billable" : "active_non";
      const status = themeStatus[key];
      return {
        id: row.id,
        name: row.name,
        color: row.color ?? "#7d776e",
        client: row.client_name ?? "—",
        clientId: row.client_id,
        tracked: `${trackedHours.toFixed(1)}h`,
        progress,
        budget: hoursLabel && moneyLabel ? `${hoursLabel} · ${moneyLabel}` : hoursLabel ?? moneyLabel ?? "No budget",
        budgetAmount: row.budget_amount,
        billedAmount: billed,
        rate: row.is_billable ? formatRate(row.billable_rate) : "—",
        status: status.label,
        statusColor: status.color,
        access: row.access as ProjectRow["access"],
        favorite: row.is_favorite === 1,
        isBillable: row.is_billable === 1,
        billableRate: row.billable_rate,
        estimatedHours: row.estimated_hours,
        rawStatus: row.status,
      };
    });
  }

  setProjectFavorite(projectId: string, favorite: boolean): void {
    this.run(`UPDATE projects SET is_favorite = ? WHERE id = ?`, [favorite ? 1 : 0, projectId]);
    this.touch();
  }

  createProject(input: ProjectDraft): void {
    const id = this.newId();
    const at = this.now().toISOString();
    const name = input.name.trim();
    const rate = input.isBillable && input.billableRate.trim() ? input.billableRate.trim() : null;
    this.run(
      `INSERT INTO projects (id, workspace_id, client_id, name, color, status, access, is_billable, is_favorite, billable_rate, estimated_hours, budget_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        id,
        this.workspaceId,
        input.clientId || null,
        name,
        input.color,
        input.status,
        input.access,
        input.isBillable ? 1 : 0,
        rate,
        input.estimatedHours.trim() || null,
        (input.budgetAmount ?? "").trim() || null,
        at,
      ],
    );
    if (rate) {
      this.run(
        `INSERT INTO rate_history (id, workspace_id, subject_type, subject_id, rate_kind, amount, currency, effective_from, effective_to, created_at)
         VALUES (?, ?, 'project', ?, 'billable', ?, 'USD', ?, NULL, ?)`,
        [this.newId(), this.workspaceId, id, rate, at, at],
      );
    }
    this.audit("project.created", "project", id, { name });
    this.touch();
  }

  updateProject(projectId: string, input: ProjectDraft): void {
    const at = this.now().toISOString();
    const current = this.get<{ billable_rate: string | null }>(`SELECT billable_rate FROM projects WHERE id = ?`, [projectId]);
    const rate = input.isBillable && input.billableRate.trim() ? input.billableRate.trim() : null;
    this.run(
      `UPDATE projects SET name = ?, client_id = ?, color = ?, status = ?, access = ?, is_billable = ?, billable_rate = ?, estimated_hours = ?, budget_amount = ?
       WHERE id = ?`,
      [
        input.name.trim(),
        input.clientId || null,
        input.color,
        input.status,
        input.access,
        input.isBillable ? 1 : 0,
        rate,
        input.estimatedHours.trim() || null,
        (input.budgetAmount ?? "").trim() || null,
        projectId,
      ],
    );
    if (rate && rate !== (current?.billable_rate ?? null)) {
      this.run(
        `UPDATE rate_history SET effective_to = ? WHERE subject_type = 'project' AND subject_id = ? AND rate_kind = 'billable' AND effective_to IS NULL`,
        [at, projectId],
      );
      this.run(
        `INSERT INTO rate_history (id, workspace_id, subject_type, subject_id, rate_kind, amount, currency, effective_from, effective_to, created_at)
         VALUES (?, ?, 'project', ?, 'billable', ?, 'USD', ?, NULL, ?)`,
        [this.newId(), this.workspaceId, projectId, rate, at, at],
      );
    }
    this.audit("project.updated", "project", projectId, { name: input.name.trim() });
    this.touch();
  }

  listActiveProjects(): Array<{ id: string; name: string; color: string | null; clientName: string | null; isBillable: boolean }> {
    return this.all<{ id: string; name: string; color: string | null; client_name: string | null; is_billable: number }>(
      `SELECT p.id, p.name, p.color, c.name AS client_name, p.is_billable
       FROM projects p
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE p.workspace_id = ? AND p.status = 'active'
       ORDER BY p.name COLLATE NOCASE`,
      [this.workspaceId],
    ).map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      clientName: row.client_name,
      isBillable: row.is_billable === 1,
    }));
  }

  listTags(): TagOption[] {
    return this.all<{ id: string; name: string; color: string | null }>(
      `SELECT id, name, color FROM tags WHERE workspace_id = ? ORDER BY name COLLATE NOCASE`,
      [this.workspaceId],
    ).map((row) => ({ id: row.id, name: row.name, color: row.color ?? "#7d776e" }));
  }

  listClients(): Array<{ id: string; name: string }> {
    return this.all<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE workspace_id = ? AND archived = 0 ORDER BY name COLLATE NOCASE`,
      [this.workspaceId],
    );
  }

  listClientRows(): ClientRow[] {
    return this.all<{ id: string; name: string; currency: string; projects: number; tracked_seconds: number }>(
      `SELECT c.id, c.name, c.currency,
              COUNT(DISTINCT p.id) AS projects,
              COALESCE(SUM(CASE WHEN e.kind = 'work' AND e.end_at IS NOT NULL AND e.deleted_at IS NULL THEN e.duration_seconds ELSE 0 END), 0) AS tracked_seconds
       FROM clients c
       LEFT JOIN projects p ON p.client_id = c.id
       LEFT JOIN time_entries e ON e.project_id = p.id
       WHERE c.workspace_id = ? AND c.archived = 0
       GROUP BY c.id
       ORDER BY c.name COLLATE NOCASE`,
      [this.workspaceId],
    ).map((row) => ({
      id: row.id,
      name: row.name,
      currency: row.currency || "USD",
      projects: Number(row.projects),
      tracked: `${(Number(row.tracked_seconds) / 3600).toFixed(1)}h`,
    }));
  }

  createClient(name: string): void {
    const id = this.newId();
    this.run(`INSERT INTO clients (id, workspace_id, name, archived, created_at) VALUES (?, ?, ?, 0, ?)`, [
      id,
      this.workspaceId,
      name.trim(),
      this.now().toISOString(),
    ]);
    this.audit("client.created", "client", id, { name: name.trim() });
    this.touch();
  }

  listTagRows(): TagRow[] {
    return this.all<{ id: string; name: string; color: string | null; uses: number }>(
      `SELECT t.id, t.name, t.color, COUNT(et.time_entry_id) AS uses
       FROM tags t
       LEFT JOIN time_entry_tags et ON et.tag_id = t.id
       WHERE t.workspace_id = ?
       GROUP BY t.id
       ORDER BY t.name COLLATE NOCASE`,
      [this.workspaceId],
    ).map((row) => ({ id: row.id, name: row.name, color: row.color ?? "#7d776e", uses: Number(row.uses) }));
  }

  createTag(name: string, color: string): void {
    const id = this.newId();
    this.run(`INSERT INTO tags (id, workspace_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)`, [
      id,
      this.workspaceId,
      name.trim(),
      color,
      this.now().toISOString(),
    ]);
    this.audit("tag.created", "tag", id, { name: name.trim() });
    this.touch();
  }

  listTasks(projectId?: string | null): TaskOption[] {
    const sql = projectId
      ? `SELECT id, project_id, name, billable_rate FROM tasks WHERE workspace_id = ? AND project_id = ? AND status = 'active' ORDER BY name COLLATE NOCASE`
      : `SELECT id, project_id, name, billable_rate FROM tasks WHERE workspace_id = ? AND status = 'active' ORDER BY name COLLATE NOCASE`;
    const params = projectId ? [this.workspaceId, projectId] : [this.workspaceId];
    return this.all<{ id: string; project_id: string; name: string; billable_rate: string | null }>(sql, params).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      billableRate: row.billable_rate,
    }));
  }

  createTask(projectId: string, name: string, billableRate?: string | null): void {
    const id = this.newId();
    const at = this.now().toISOString();
    const rate = billableRate?.trim() ? billableRate.trim() : null;
    this.run(
      `INSERT INTO tasks (id, workspace_id, project_id, name, billable_rate, status, created_at) VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [id, this.workspaceId, projectId, name.trim(), rate, at],
    );
    if (rate) {
      this.run(
        `INSERT INTO rate_history (id, workspace_id, subject_type, subject_id, rate_kind, amount, currency, effective_from, effective_to, created_at)
         VALUES (?, ?, 'task', ?, 'billable', ?, 'USD', ?, NULL, ?)`,
        [this.newId(), this.workspaceId, id, rate, at, at],
      );
    }
    this.audit("task.created", "task", id, { name: name.trim() });
    this.touch();
  }

  updateTask(taskId: string, input: { name: string; billableRate: string }): void {
    const at = this.now().toISOString();
    const current = this.get<{ billable_rate: string | null }>(`SELECT billable_rate FROM tasks WHERE id = ?`, [taskId]);
    if (!current) throw new Error("Unknown task");
    const rate = input.billableRate.trim() ? input.billableRate.trim() : null;
    this.run(`UPDATE tasks SET name = ?, billable_rate = ? WHERE id = ?`, [input.name.trim(), rate, taskId]);
    if (rate !== (current.billable_rate ?? null)) {
      this.run(
        `UPDATE rate_history SET effective_to = ? WHERE subject_type = 'task' AND subject_id = ? AND rate_kind = 'billable' AND effective_to IS NULL`,
        [at, taskId],
      );
      if (rate) {
        this.run(
          `INSERT INTO rate_history (id, workspace_id, subject_type, subject_id, rate_kind, amount, currency, effective_from, effective_to, created_at)
           VALUES (?, ?, 'task', ?, 'billable', ?, 'USD', ?, NULL, ?)`,
          [this.newId(), this.workspaceId, taskId, rate, at, at],
        );
      }
    }
    this.audit("task.updated", "task", taskId, { name: input.name.trim() });
    this.touch();
  }

  createManualEntry(input: {
    description: string;
    projectId: string | null;
    taskId?: string | null;
    tagIds: string[];
    isBillable: boolean;
    start: Date;
    end: Date;
    forUserId?: string | null;
    customFields?: Array<{ fieldId: string; value: string }>;
    source?: "web" | "import" | "manager_manual";
  }): string {
    const policy = this.workspacePolicy();
    if (policy.forceTimer && !this.canManage()) {
      throw new Error("Force timer is on. Start the timer instead of adding time manually.");
    }
    this.assertEntryAllowed(input);
    const targetUser = input.forUserId && input.forUserId !== this.userId ? input.forUserId : this.userId;
    if (targetUser !== this.userId && !this.canManage()) throw new Error("Only a manager can add time for someone else");
    const start = input.start;
    const end = input.end;
    if (end.getTime() <= start.getTime()) throw new Error("End time must be after start time");
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const duration = durationSeconds(startIso, endIso);
    const billableRate = input.isBillable ? this.resolveBillableRate(input.projectId, input.taskId ?? null, start) : "0";
    const costRate = this.resolveCostRateFor(targetUser, start);
    const id = this.newId();
    const source = input.source ?? (targetUser === this.userId ? "web" : "manager_manual");
    this.run(
      `INSERT INTO time_entries (
         id, workspace_id, user_id, created_by_user_id, session_id, parent_entry_id, project_id, task_id,
         kind, source, description, start_at, end_at, duration_seconds, is_billable, billable_rate_snapshot,
         cost_rate_snapshot, approval_status, timezone, deleted_at, created_at
       )        VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 'work', ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'UTC', NULL, ?)`,
      [
        id,
        this.workspaceId,
        targetUser,
        this.userId,
        input.projectId,
        input.taskId ?? null,
        source,
        input.description.trim() || "No description",
        startIso,
        endIso,
        duration,
        input.isBillable ? 1 : 0,
        billableRate,
        costRate,
        startIso,
      ],
    );
    for (const tagId of input.tagIds) {
      this.run(`INSERT INTO time_entry_tags (time_entry_id, tag_id) VALUES (?, ?)`, [id, tagId]);
    }
    this.writeCustomFields(id, input.customFields ?? []);
    this.audit("time_entry.created", "time_entry", id, { source, forUserId: targetUser });
    this.touch();
    return id;
  }

  listWeekGroups(at = this.now()): { groups: DayGroup[]; weekTotal: string; weekTotalSeconds: number } {
    const from = addDays(startOfLocalDay(at), -13);
    const to = addDays(startOfLocalDay(at), 1);
    const weekStart = startOfLocalWeek(at);
    const weekEnd = addDays(weekStart, 7);
    const rows = this.all<EntryListRow & { tags: string | null; tag_ids: string | null; approval_status: string }>(
      `SELECT e.id, e.kind, e.description, p.name AS project_name, c.name AS client_name, p.color AS project_color,
              (SELECT GROUP_CONCAT(t.name, ', ') FROM time_entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.time_entry_id = e.id) AS tags,
              (SELECT GROUP_CONCAT(et.tag_id) FROM time_entry_tags et WHERE et.time_entry_id = e.id) AS tag_ids,
              e.start_at, e.end_at, e.duration_seconds, e.is_billable, e.project_id, e.task_id, e.approval_status
       FROM time_entries e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE e.workspace_id = ? AND e.user_id = ? AND e.deleted_at IS NULL AND e.kind IN ('work', 'break') AND e.end_at IS NOT NULL
         AND e.start_at >= ? AND e.start_at < ?
       ORDER BY e.start_at DESC`,
      [this.workspaceId, this.userId, from.toISOString(), to.toISOString()],
    );

    const todayKey = localDayKey(at.toISOString());
    const yesterdayKey = localDayKey(addDays(at, -1).toISOString());
    const byDay = new Map<string, DayGroup>();
    let weekSeconds = 0;
    for (const row of rows) {
      const key = localDayKey(row.start_at);
      if (!byDay.has(key)) {
        byDay.set(key, { label: dayLabel(key, todayKey, yesterdayKey), total: "", entries: [], dayKey: key });
      }
      const duration = Number(row.duration_seconds);
      const isWork = row.kind === "work";
      const startMs = Date.parse(row.start_at);
      if (isWork && startMs >= weekStart.getTime() && startMs < weekEnd.getTime()) weekSeconds += duration;
      const tags = (row.tags ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const tagIds = (row.tag_ids ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      byDay.get(key)!.entries.push({
        id: row.id,
        desc: isWork ? row.description || "(no description)" : row.description?.trim() || "Break",
        project: isWork ? row.project_name ?? "No project" : "Break",
        color: isWork ? row.project_color ?? "#7d776e" : "#e08585",
        client: isWork ? row.client_name ?? "" : "",
        tag: tags[0],
        tags,
        tagIds,
        projectId: row.project_id,
        taskId: row.task_id,
        start: formatClock(row.start_at),
        end: row.end_at ? formatClock(row.end_at) : "…",
        startAt: row.start_at,
        endAt: row.end_at,
        dur: formatDuration(duration),
        durationSeconds: duration,
        billable: isWork && row.is_billable === 1,
        approval: row.approval_status,
        kind: row.kind,
      });
    }
    const groups = [...byDay.values()].map((g) => ({
      ...g,
      total: formatDuration(
        g.entries.filter((e) => e.kind !== "break").reduce((sum, e) => sum + (e.durationSeconds ?? 0), 0),
      ),
    }));
    return { groups, weekTotal: formatDuration(weekSeconds), weekTotalSeconds: weekSeconds };
  }

  timesheetWeek(at = this.now()): TimesheetGrid {
    const weekStart = startOfLocalWeek(at);
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(weekStart, i);
      const key = localDayKey(day.toISOString());
      return {
        key,
        label: day.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
        totalSeconds: 0,
      };
    });
    const rows = this.all<{ project_id: string | null; project: string | null; color: string | null; start_at: string; duration_seconds: number }>(
      `SELECT p.id AS project_id, p.name AS project, p.color, e.start_at, e.duration_seconds
       FROM time_entries e
       LEFT JOIN projects p ON p.id = e.project_id
       WHERE e.workspace_id = ? AND e.user_id = ? AND e.deleted_at IS NULL AND e.kind = 'work' AND e.end_at IS NOT NULL
         AND e.start_at >= ? AND e.start_at < ?`,
      [this.workspaceId, this.userId, weekStart.toISOString(), addDays(weekStart, 7).toISOString()],
    );
    const byProject = new Map<string, TimesheetGrid["rows"][number]>();
    for (const row of rows) {
      const mapKey = row.project_id ?? "none";
      const title = row.project ?? "No project";
      if (!byProject.has(mapKey)) {
        byProject.set(mapKey, {
          projectId: row.project_id,
          project: title,
          color: row.color ?? "#7d776e",
          cells: days.map(() => ({ seconds: 0, label: "—" })),
          totalSeconds: 0,
        });
      }
      const key = localDayKey(row.start_at);
      const dayIndex = days.findIndex((d) => d.key === key);
      if (dayIndex < 0) continue;
      const seconds = Number(row.duration_seconds);
      const projectRow = byProject.get(mapKey)!;
      projectRow.cells[dayIndex].seconds += seconds;
      projectRow.totalSeconds += seconds;
      days[dayIndex].totalSeconds += seconds;
    }
    for (const projectRow of byProject.values()) {
      projectRow.cells = projectRow.cells.map((cell) => ({
        ...cell,
        label: cell.seconds ? formatDuration(cell.seconds) : "—",
      }));
    }
    return {
      days,
      rows: [...byProject.values()].sort((a, b) => b.totalSeconds - a.totalSeconds),
      weekTotal: days.reduce((sum, d) => sum + d.totalSeconds, 0),
    };
  }

  setApprovalStatus(entryId: string, status: "draft" | "submitted" | "approved" | "rejected" | "locked"): void {
    const row = this.get<{ user_id: string; approval_status: string }>(
      `SELECT user_id, approval_status FROM time_entries WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`,
      [entryId, this.workspaceId],
    );
    if (!row) throw new Error("Unknown time entry");
    const managing = this.canManage();
    const own = row.user_id === this.userId;
    if ((status === "approved" || status === "rejected" || status === "locked") && !managing) {
      throw new Error("Only a manager can approve, reject, or lock time");
    }
    if (!own && !managing) throw new Error("You can only change your own time");
    if (status === "draft" && row.approval_status !== "submitted" && row.approval_status !== "rejected" && !managing) {
      throw new Error("Withdraw a submitted entry back to draft");
    }
    this.run(`UPDATE time_entries SET approval_status = ? WHERE id = ?`, [status, entryId]);
    this.audit(`time_entry.${status}`, "time_entry", entryId);
    this.touch();
  }

  lockWeek(at = this.now()): number {
    if (!this.canManage()) throw new Error("Only a manager can lock a timesheet");
    const weekStart = startOfLocalWeek(at);
    const weekEnd = addDays(weekStart, 7);
    const rows = this.all<{ id: string }>(
      `SELECT id FROM time_entries
       WHERE workspace_id = ? AND user_id = ? AND deleted_at IS NULL AND kind = 'work' AND end_at IS NOT NULL
         AND approval_status != 'locked' AND start_at >= ? AND start_at < ?`,
      [this.workspaceId, this.userId, weekStart.toISOString(), weekEnd.toISOString()],
    );
    for (const row of rows) this.setApprovalStatus(row.id, "locked");
    return rows.length;
  }

  unlockWeek(at = this.now()): number {
    if (!this.canManage()) throw new Error("Only a manager can unlock a timesheet");
    const weekStart = startOfLocalWeek(at);
    const weekEnd = addDays(weekStart, 7);
    const rows = this.all<{ id: string }>(
      `SELECT id FROM time_entries
       WHERE workspace_id = ? AND user_id = ? AND deleted_at IS NULL AND kind = 'work' AND end_at IS NOT NULL
         AND approval_status = 'locked' AND start_at >= ? AND start_at < ?`,
      [this.workspaceId, this.userId, weekStart.toISOString(), weekEnd.toISOString()],
    );
    for (const row of rows) {
      this.run(`UPDATE time_entries SET approval_status = 'approved' WHERE id = ?`, [row.id]);
      this.audit("time_entry.unlocked", "time_entry", row.id);
    }
    if (rows.length) this.touch();
    return rows.length;
  }

  weekLockState(at = this.now()): { locked: number; unlocked: number } {
    const weekStart = startOfLocalWeek(at);
    const weekEnd = addDays(weekStart, 7);
    const rows = this.all<{ approval_status: string }>(
      `SELECT approval_status FROM time_entries
       WHERE workspace_id = ? AND user_id = ? AND deleted_at IS NULL AND kind = 'work' AND end_at IS NOT NULL
         AND start_at >= ? AND start_at < ?`,
      [this.workspaceId, this.userId, weekStart.toISOString(), weekEnd.toISOString()],
    );
    let locked = 0;
    let unlocked = 0;
    for (const row of rows) {
      if (row.approval_status === "locked") locked += 1;
      else unlocked += 1;
    }
    return { locked, unlocked };
  }

  listApprovals(): ApprovalRow[] {
    const todayKey = localDayKey(this.now().toISOString());
    const yesterdayKey = localDayKey(addDays(this.now(), -1).toISOString());
    const managing = this.canManage();
    return this.all<{
      id: string;
      description: string;
      project: string | null;
      color: string | null;
      start_at: string;
      duration_seconds: number;
      approval_status: string;
      user_id: string;
      user_name: string | null;
      note_count: number;
    }>(
      `SELECT e.id, e.description, p.name AS project, p.color, e.start_at, e.duration_seconds, e.approval_status,
              e.user_id, u.name AS user_name,
              (SELECT COUNT(*) FROM approval_notes n WHERE n.time_entry_id = e.id) AS note_count
       FROM time_entries e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.workspace_id = ? AND e.deleted_at IS NULL AND e.kind = 'work' AND e.end_at IS NOT NULL
         AND (? = 1 OR e.user_id = ?)
       ORDER BY CASE e.approval_status WHEN 'submitted' THEN 0 WHEN 'draft' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END, e.start_at DESC
       LIMIT 80`,
      [this.workspaceId, managing ? 1 : 0, this.userId],
    ).map((row) => ({
      id: row.id,
      desc: row.description || "(no description)",
      project: row.project ?? "No project",
      color: row.color ?? "#7d776e",
      day: dayLabel(localDayKey(row.start_at), todayKey, yesterdayKey),
      dur: formatDuration(Number(row.duration_seconds)),
      status: row.approval_status,
      userId: row.user_id,
      user: row.user_name ?? "Unknown",
      noteCount: Number(row.note_count),
    }));
  }

  listAudit(): AuditRow[] {
    return this.all<{
      id: string;
      action: string;
      target_type: string;
      target_id: string;
      actor: string | null;
      created_at: string;
      metadata_json: string | null;
    }>(
      `SELECT a.id, a.action, a.target_type, a.target_id, u.name AS actor, a.created_at, a.metadata_json
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.workspace_id = ?
       ORDER BY a.created_at DESC
       LIMIT 200`,
      [this.workspaceId],
    ).map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      actor: row.actor ?? "System",
      createdAt: new Date(row.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      detail: row.metadata_json ?? "",
    }));
  }

  report(fromIso: string, toIso: string) {
    const policy = this.workspacePolicy();
    const seeAll = !policy.hideOthersTime || this.canManage();
    const round = (seconds: number) => roundSeconds(seconds, policy.roundingMinutes, policy.roundingMode);
    const rows = this.all<{
      project_name: string | null;
      project_color: string | null;
      description: string;
      duration_seconds: number;
      is_billable: number;
      billable_rate_snapshot: string;
      cost_rate_snapshot: string;
      kind: string;
      start_at: string;
    }>(
      `SELECT p.name AS project_name, p.color AS project_color, e.description, e.duration_seconds, e.is_billable,
              e.billable_rate_snapshot, e.cost_rate_snapshot, e.kind, e.start_at
       FROM time_entries e
       LEFT JOIN projects p ON p.id = e.project_id
       WHERE e.workspace_id = ? AND e.deleted_at IS NULL AND e.end_at IS NOT NULL
         AND e.start_at >= ? AND e.start_at < ?
         AND (? = 1 OR e.user_id = ?)
       ORDER BY e.start_at`,
      [this.workspaceId, fromIso, toIso, seeAll ? 1 : 0, this.userId],
    ).map((row) => ({ ...row, duration_seconds: round(Number(row.duration_seconds)) }));
    const work = rows.filter((r) => r.kind === "work");
    const totalSeconds = work.reduce((s, r) => s + Number(r.duration_seconds), 0);
    const billableSeconds = work.filter((r) => r.is_billable === 1).reduce((s, r) => s + Number(r.duration_seconds), 0);
    const amount = work
      .filter((r) => r.is_billable === 1)
      .reduce((s, r) => s + (Number(r.duration_seconds) / 3600) * Number(r.billable_rate_snapshot || 0), 0);
    const laborCost = work.reduce(
      (s, r) => s + (Number(r.duration_seconds) / 3600) * Number(r.cost_rate_snapshot || 0),
      0,
    );
    const expenseTotal = this.expenseTotalBetween(fromIso, toIso, seeAll);
    const profit = amount - laborCost - expenseTotal;
    const byProject = new Map<string, { title: string; color: string; seconds: number }>();
    const byDay = new Map<string, ReportDay>();
    for (const row of work) {
      const title = row.project_name ?? "No project";
      const color = row.project_color ?? "#7d776e";
      const current = byProject.get(title) ?? { title, color, seconds: 0 };
      current.seconds += Number(row.duration_seconds);
      byProject.set(title, current);

      const key = localDayKey(row.start_at);
      if (!byDay.has(key)) {
        const [y, m, dd] = key.split("-").map(Number);
        const date = new Date(y, m - 1, dd);
        byDay.set(key, {
          key,
          label: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
          seconds: 0,
          stacks: [],
        });
      }
      const day = byDay.get(key)!;
      day.seconds += Number(row.duration_seconds);
      const stack = day.stacks.find((s) => s.title === title);
      if (stack) stack.seconds += Number(row.duration_seconds);
      else day.stacks.push({ title, color, seconds: Number(row.duration_seconds) });
    }
    return {
      totalSeconds,
      billableSeconds,
      amount,
      laborCost,
      expenseTotal,
      profit,
      roundingMinutes: policy.roundingMinutes,
      roundingMode: policy.roundingMode,
      daily: [...byDay.values()],
      groups: [...byProject.values()].sort((a, b) => b.seconds - a.seconds),
      csvRows: this.all<{
        entry_id: string;
        user_email: string;
        project: string | null;
        task: string | null;
        tags: string | null;
        description: string;
        start_at: string;
        end_at: string | null;
        duration_hours: number;
        billable: number;
        billable_rate: string;
        cost_rate: string;
        kind: string;
      }>(
        `SELECT e.id AS entry_id, u.email AS user_email, p.name AS project, t.name AS task,
                (SELECT GROUP_CONCAT(tg.name, ', ') FROM time_entry_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.time_entry_id = e.id) AS tags,
                e.description, e.start_at, e.end_at, e.duration_seconds / 3600.0 AS duration_hours,
                e.is_billable AS billable, e.billable_rate_snapshot AS billable_rate, e.cost_rate_snapshot AS cost_rate, e.kind
         FROM time_entries e
         JOIN users u ON u.id = e.user_id
         LEFT JOIN projects p ON p.id = e.project_id
         LEFT JOIN tasks t ON t.id = e.task_id
         WHERE e.workspace_id = ? AND e.deleted_at IS NULL AND e.end_at IS NOT NULL
           AND e.start_at >= ? AND e.start_at < ?
           AND (? = 1 OR e.user_id = ?)
         ORDER BY e.start_at`,
        [this.workspaceId, fromIso, toIso, seeAll ? 1 : 0, this.userId],
      ).map((row) => ({
        ...row,
        duration_hours: round(Math.round(Number(row.duration_hours) * 3600)) / 3600,
      })),
    };
  }

  updateEntry(input: {
    id: string;
    description: string;
    projectId: string | null;
    taskId: string | null;
    tagIds: string[];
    isBillable: boolean;
    start: Date;
    end: Date;
    customFields?: Array<{ fieldId: string; value: string }>;
  }): void {
    const current = this.get<{ approval_status: string; user_id: string; duration_seconds: number }>(
      `SELECT approval_status, user_id, duration_seconds FROM time_entries WHERE id = ? AND deleted_at IS NULL`,
      [input.id],
    );
    if (!current) throw new Error("Unknown time entry");
    if (current.user_id !== this.userId && !this.canManage()) throw new Error("You can only edit your own time");
    if (current.approval_status === "locked") throw new Error("Locked entries cannot be edited");
    this.assertEntryAllowed(input);
    if (input.end.getTime() <= input.start.getTime()) throw new Error("End time must be after start time");
    const startIso = input.start.toISOString();
    const endIso = input.end.toISOString();
    const duration = durationSeconds(startIso, endIso);
    const billableRate = input.isBillable ? this.resolveBillableRate(input.projectId, input.taskId, input.start) : "0";
    this.run(
      `UPDATE time_entries SET description = ?, project_id = ?, task_id = ?, is_billable = ?, billable_rate_snapshot = ?, start_at = ?, end_at = ?, duration_seconds = ?
       WHERE id = ?`,
      [
        input.description.trim() || "No description",
        input.projectId,
        input.taskId,
        input.isBillable ? 1 : 0,
        billableRate,
        startIso,
        endIso,
        duration,
        input.id,
      ],
    );
    this.run(`DELETE FROM time_entry_tags WHERE time_entry_id = ?`, [input.id]);
    for (const tagId of input.tagIds) {
      this.run(`INSERT INTO time_entry_tags (time_entry_id, tag_id) VALUES (?, ?)`, [input.id, tagId]);
    }
    if (input.customFields) this.writeCustomFields(input.id, input.customFields);
    this.audit("time_entry.updated", "time_entry", input.id, {
      durationSeconds: duration,
      previousSeconds: Number(current.duration_seconds),
    });
    this.touch();
  }

  getEntry(entryId: string) {
    const row = this.get<EntryListRow & { tags: string | null; tag_ids: string | null; approval_status: string }>(
      `SELECT e.id, e.kind, e.description, p.name AS project_name, c.name AS client_name, p.color AS project_color,
              (SELECT GROUP_CONCAT(t.name, ', ') FROM time_entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.time_entry_id = e.id) AS tags,
              (SELECT GROUP_CONCAT(et.tag_id) FROM time_entry_tags et WHERE et.time_entry_id = e.id) AS tag_ids,
              e.start_at, e.end_at, e.duration_seconds, e.is_billable, e.project_id, e.task_id, e.approval_status
       FROM time_entries e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE e.id = ? AND e.deleted_at IS NULL`,
      [entryId],
    );
    if (!row) return undefined;
    const tags = (row.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const tagIds = (row.tag_ids ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return {
      id: row.id,
      desc: row.description || "(no description)",
      project: row.project_name ?? "No project",
      color: row.project_color ?? "#7d776e",
      client: row.client_name ?? "",
      tag: tags[0],
      tags,
      tagIds,
      projectId: row.project_id,
      taskId: row.task_id,
      start: formatClock(row.start_at),
      end: row.end_at ? formatClock(row.end_at) : "…",
      startAt: row.start_at,
      endAt: row.end_at,
      dur: formatDuration(Number(row.duration_seconds)),
      durationSeconds: Number(row.duration_seconds),
      billable: row.is_billable === 1,
      approval: row.approval_status,
      kind: row.kind,
    };
  }

  deleteEntry(entryId: string): void {
    const current = this.get<{ approval_status: string; user_id: string }>(
      `SELECT approval_status, user_id FROM time_entries WHERE id = ?`,
      [entryId],
    );
    if (!current) return;
    if (current.user_id !== this.userId && !this.canManage()) throw new Error("You can only delete your own time");
    if (current.approval_status === "locked") throw new Error("Locked entries cannot be deleted");
    this.run(`UPDATE time_entries SET deleted_at = ? WHERE id = ?`, [this.now().toISOString(), entryId]);
    this.audit("time_entry.deleted", "time_entry", entryId);
    this.touch();
  }

  submitWeek(at = this.now()): number {
    const weekStart = startOfLocalWeek(at);
    const weekEnd = addDays(weekStart, 7);
    const rows = this.all<{ id: string }>(
      `SELECT id FROM time_entries
       WHERE workspace_id = ? AND user_id = ? AND deleted_at IS NULL AND kind = 'work' AND end_at IS NOT NULL
         AND approval_status = 'draft' AND start_at >= ? AND start_at < ?`,
      [this.workspaceId, this.userId, weekStart.toISOString(), weekEnd.toISOString()],
    );
    for (const row of rows) this.setApprovalStatus(row.id, "submitted");
    return rows.length;
  }

  listInvoices(): InvoiceListRow[] {
    return this.all<{
      id: string;
      number: string;
      client: string;
      client_id: string;
      status: InvoiceListRow["status"];
      issue_date: string;
      due_date: string | null;
      currency: string;
      hours: number | null;
      amount: number | null;
      line_count: number;
    }>(
      `SELECT i.id, i.number, c.name AS client, i.client_id, i.status, i.issue_date, i.due_date, i.currency,
              COALESCE(SUM(CAST(l.quantity_hours AS REAL)), 0) AS hours,
              COALESCE(SUM(CAST(l.amount AS REAL)), 0) AS amount,
              COUNT(l.id) AS line_count
       FROM invoices i
       JOIN clients c ON c.id = i.client_id
       LEFT JOIN invoice_lines l ON l.invoice_id = i.id
       WHERE i.workspace_id = ?
       GROUP BY i.id
       ORDER BY i.issue_date DESC, i.number DESC`,
      [this.workspaceId],
    ).map((row) => ({
      id: row.id,
      number: row.number,
      client: row.client,
      clientId: row.client_id,
      status: row.status,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      currency: row.currency,
      hours: Number(row.hours ?? 0),
      amount: Number(row.amount ?? 0),
      lineCount: Number(row.line_count),
    }));
  }

  getInvoice(invoiceId: string): InvoiceDetail | undefined {
    const inv = this.get<{
      id: string;
      number: string;
      client: string;
      client_id: string;
      status: InvoiceListRow["status"];
      issue_date: string;
      due_date: string | null;
      currency: string;
      notes: string | null;
    }>(
      `SELECT i.id, i.number, c.name AS client, i.client_id, i.status, i.issue_date, i.due_date, i.currency, i.notes
       FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = ? AND i.workspace_id = ?`,
      [invoiceId, this.workspaceId],
    );
    if (!inv) return undefined;
    const lines = this.all<{
      id: string;
      description: string;
      project: string | null;
      quantity_hours: string;
      rate: string;
      amount: string;
      time_entry_id: string | null;
    }>(
      `SELECT l.id, l.description, p.name AS project, l.quantity_hours, l.rate, l.amount, l.time_entry_id
       FROM invoice_lines l
       LEFT JOIN time_entries e ON e.id = l.time_entry_id
       LEFT JOIN projects p ON p.id = e.project_id
       WHERE l.invoice_id = ?
       ORDER BY l.sort_order, l.id`,
      [invoiceId],
    ).map((row) => ({
      id: row.id,
      description: row.description,
      project: row.project,
      quantityHours: parseAmount(row.quantity_hours),
      rate: parseAmount(row.rate),
      amount: parseAmount(row.amount),
      timeEntryId: row.time_entry_id,
    }));
    const hours = lines.reduce((s, l) => s + l.quantityHours, 0);
    const amount = lines.reduce((s, l) => s + l.amount, 0);
    const entryBounds = this.get<{ min_start: string | null; max_end: string | null }>(
      `SELECT MIN(e.start_at) AS min_start, MAX(e.end_at) AS max_end
       FROM invoice_lines l JOIN time_entries e ON e.id = l.time_entry_id
       WHERE l.invoice_id = ?`,
      [invoiceId],
    );
    return {
      id: inv.id,
      number: inv.number,
      client: inv.client,
      clientId: inv.client_id,
      status: inv.status,
      issueDate: inv.issue_date,
      dueDate: inv.due_date,
      currency: inv.currency,
      notes: inv.notes,
      hours,
      amount,
      lineCount: lines.length,
      lines,
      rangeFrom: entryBounds?.min_start ?? null,
      rangeTo: entryBounds?.max_end ?? null,
    };
  }

  /** Draft invoice from approved/locked billable entries for a client in [from, toExclusive). */
  createInvoiceFromRange(input: { clientId: string; from: Date; toExclusive: Date; notes?: string }): string {
    if (!this.canManage()) throw new Error("Only a manager can create invoices");
    const client = this.get<{ id: string; name: string; currency: string }>(
      `SELECT id, name, currency FROM clients WHERE id = ? AND workspace_id = ?`,
      [input.clientId, this.workspaceId],
    );
    if (!client) throw new Error("Unknown client");
    const policy = this.workspacePolicy();
    const fx = this.rateToBase(client.currency || policy.currency);

    const entries = this.all<{
      id: string;
      description: string;
      project_name: string | null;
      duration_seconds: number;
      billable_rate_snapshot: string;
      start_at: string;
    }>(
      `SELECT e.id, e.description, p.name AS project_name, e.duration_seconds, e.billable_rate_snapshot, e.start_at
       FROM time_entries e
       JOIN projects p ON p.id = e.project_id
       WHERE e.workspace_id = ? AND e.deleted_at IS NULL AND e.kind = 'work' AND e.end_at IS NOT NULL
         AND e.is_billable = 1 AND e.approval_status != 'rejected'
         AND p.client_id = ?
         AND e.start_at >= ? AND e.start_at < ?
         AND e.id NOT IN (SELECT time_entry_id FROM invoice_lines WHERE time_entry_id IS NOT NULL)
       ORDER BY e.start_at`,
      [this.workspaceId, input.clientId, input.from.toISOString(), input.toExclusive.toISOString()],
    );
    if (entries.length === 0) {
      throw new Error("No billable entries for this client in range (or they are already invoiced).");
    }

    const at = this.now().toISOString();
    const issueDate = at.slice(0, 10);
    const seq =
      (this.get<{ n: number }>(`SELECT COUNT(*) AS n FROM invoices WHERE workspace_id = ?`, [this.workspaceId])?.n ?? 0) + 1;
    const number = `INV-${String(seq).padStart(4, "0")}`;
    const invoiceId = this.newId();
    const currency = client.currency || policy.currency;

    this.run(
      `INSERT INTO invoices (id, workspace_id, client_id, number, status, issue_date, due_date, currency, notes, created_at)
       VALUES (?, ?, ?, ?, 'draft', ?, NULL, ?, ?, ?)`,
      [invoiceId, this.workspaceId, input.clientId, number, issueDate, currency, input.notes?.trim() || null, at],
    );

    let sort = 0;
    for (const entry of entries) {
      const project = entry.project_name ?? "No project";
      const desc = entry.description.trim() || "(no description)";
      const seconds = roundSeconds(Number(entry.duration_seconds), policy.roundingMinutes, policy.roundingMode);
      const hours = seconds / 3600;
      const rate = formatAmount(convertFromBase(parseAmount(entry.billable_rate_snapshot), fx));
      const amount = billableAmount(seconds, rate);
      this.run(
        `INSERT INTO invoice_lines (id, invoice_id, time_entry_id, description, quantity_hours, rate, amount, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.newId(),
          invoiceId,
          entry.id,
          `${project} — ${desc}`,
          formatAmount(hours),
          formatAmount(parseAmount(rate)),
          amount,
          sort++,
        ],
      );
    }

    this.audit("invoice.created", "invoice", invoiceId, { number, client: client.name, lines: entries.length });
    this.touch();
    return invoiceId;
  }

  setInvoiceStatus(invoiceId: string, status: InvoiceListRow["status"]): void {
    this.run(`UPDATE invoices SET status = ? WHERE id = ? AND workspace_id = ?`, [status, invoiceId, this.workspaceId]);
    this.audit(`invoice.${status}`, "invoice", invoiceId);
    this.touch();
  }

  /** Billable approved entries available to invoice for a client/range (count). */
  countInvoiceableEntries(clientId: string, from: Date, toExclusive: Date): number {
    return (
      this.get<{ n: number }>(
        `SELECT COUNT(*) AS n
         FROM time_entries e
         JOIN projects p ON p.id = e.project_id
         WHERE e.workspace_id = ? AND e.deleted_at IS NULL AND e.kind = 'work' AND e.end_at IS NOT NULL
           AND e.is_billable = 1 AND e.approval_status != 'rejected'
           AND p.client_id = ?
           AND e.start_at >= ? AND e.start_at < ?
           AND e.id NOT IN (SELECT time_entry_id FROM invoice_lines WHERE time_entry_id IS NOT NULL)`,
        [this.workspaceId, clientId, from.toISOString(), toExclusive.toISOString()],
      )?.n ?? 0
    );
  }

  calendarWeek(at = this.now()): { days: CalendarDay[]; weekTotal: number } {
    const weekStart = startOfLocalWeek(at);
    const rows = this.all<{
      id: string;
      description: string;
      project_name: string | null;
      color: string | null;
      tag_name: string | null;
      start_at: string;
      end_at: string | null;
      duration_seconds: number;
    }>(
      `SELECT e.id, e.description, p.name AS project_name, p.color, 
              (SELECT t.name FROM time_entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.time_entry_id = e.id LIMIT 1) AS tag_name,
              e.start_at, e.end_at, e.duration_seconds
       FROM time_entries e
       LEFT JOIN projects p ON p.id = e.project_id
       WHERE e.workspace_id = ? AND e.user_id = ? AND e.deleted_at IS NULL AND e.kind = 'work' AND e.end_at IS NOT NULL
         AND e.start_at >= ? AND e.start_at < ?
       ORDER BY e.start_at`,
      [this.workspaceId, this.userId, weekStart.toISOString(), addDays(weekStart, 7).toISOString()],
    );
    const days: CalendarDay[] = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(weekStart, i);
      const key = localDayKey(day.toISOString());
      return {
        key,
        label: day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        weekday: day.toLocaleDateString(undefined, { weekday: "short" }),
        dateLabel: day.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        totalSeconds: 0,
        entries: [],
      };
    });
    for (const row of rows) {
      const key = localDayKey(row.start_at);
      const day = days.find((d) => d.key === key);
      if (!day) continue;
      const start = new Date(row.start_at);
      const end = new Date(row.end_at ?? row.start_at);
      const startMin = start.getHours() * 60 + start.getMinutes();
      const endMin = Math.max(startMin + 15, end.getHours() * 60 + end.getMinutes());
      const duration = Number(row.duration_seconds);
      day.totalSeconds += duration;
      day.entries.push({
        id: row.id,
        desc: row.description || "(no description)",
        project: row.project_name ?? "No project",
        color: row.color ?? "#7d776e",
        tag: row.tag_name ?? undefined,
        startMin,
        endMin,
        dur: formatDuration(duration),
      });
    }
    return { days, weekTotal: days.reduce((s, d) => s + d.totalSeconds, 0) };
  }

  currentRole(): "owner" | "manager" | "member" {
    const role = this.get<{ role: string }>(`SELECT role FROM users WHERE id = ?`, [this.userId])?.role;
    if (role === "manager" || role === "member") return role;
    return "owner";
  }

  canManage(): boolean {
    const role = this.currentRole();
    return role === "owner" || role === "manager";
  }

  canSeeMoney(): boolean {
    return this.canManage() || !this.workspacePolicy().hideRates;
  }

  hiddenPageIds(): string[] {
    if (this.canManage()) return [];
    return [...new Set([...this.workspacePolicy().hideMemberPages, "workspace", "team"])];
  }

  switchUser(userId: string): void {
    const user = this.get<{ id: string; name: string }>(
      `SELECT id, name FROM users WHERE id = ? AND workspace_id = ?`,
      [userId, this.workspaceId],
    );
    if (!user) throw new Error("Unknown teammate");
    this.userId = user.id;
    this.userName = user.name;
    if (typeof localStorage !== "undefined") localStorage.setItem("clockinator.actingUserId", user.id);
    this.touch();
  }

  listUsers(): Array<{ id: string; name: string; email: string; role: string; costRate: string }> {
    return this.all<{ id: string; name: string; email: string; role: string; default_cost_rate: string }>(
      `SELECT id, name, email, role, default_cost_rate FROM users WHERE workspace_id = ? ORDER BY name COLLATE NOCASE`,
      [this.workspaceId],
    ).map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      costRate: row.default_cost_rate,
    }));
  }

  createUser(input: { name: string; email: string; role: "manager" | "member"; costRate: string }): void {
    if (!this.canManage()) throw new Error("Only a manager can add teammates");
    const id = this.newId();
    this.run(
      `INSERT INTO users (id, workspace_id, name, email, default_cost_rate, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, this.workspaceId, input.name.trim(), input.email.trim(), input.costRate.trim() || "0", input.role, this.now().toISOString()],
    );
    this.audit("user.created", "user", id, { name: input.name.trim(), role: input.role });
    this.touch();
  }

  updateUser(userId: string, input: { role: "owner" | "manager" | "member"; costRate: string; name: string }): void {
    if (!this.canManage()) throw new Error("Only a manager can edit teammates");
    if (input.role !== "owner") {
      const owners = this.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM users WHERE workspace_id = ? AND role = 'owner' AND id != ?`,
        [this.workspaceId, userId],
      )?.n;
      const current = this.get<{ role: string }>(`SELECT role FROM users WHERE id = ?`, [userId])?.role;
      if (current === "owner" && Number(owners) === 0) throw new Error("The workspace needs one owner");
    }
    this.run(`UPDATE users SET name = ?, role = ?, default_cost_rate = ? WHERE id = ? AND workspace_id = ?`, [
      input.name.trim(),
      input.role,
      input.costRate.trim() || "0",
      userId,
      this.workspaceId,
    ]);
    this.setSubjectRate("user", userId, "cost", input.costRate.trim() || "0", this.now().toISOString());
    this.audit("user.updated", "user", userId, { role: input.role });
    this.touch();
  }

  workspacePolicy() {
    const row = this.get<{
      rounding_minutes: number;
      rounding_mode: string;
      require_description: number;
      require_project: number;
      require_task: number;
      require_tag: number;
      weekly_target_seconds: number;
      force_timer: number;
      hide_member_pages: string;
      hide_others_time: number;
      hide_rates: number;
      currency: string;
    }>(
      `SELECT rounding_minutes, rounding_mode, require_description, require_project, require_task, require_tag,
              weekly_target_seconds, force_timer, hide_member_pages, hide_others_time, hide_rates, currency
       FROM workspaces WHERE id = ?`,
      [this.workspaceId],
    );
    const mode: RoundingMode = row?.rounding_mode === "up" || row?.rounding_mode === "down" ? row.rounding_mode : "nearest";
    return {
      roundingMinutes: Number(row?.rounding_minutes ?? 0),
      roundingMode: mode,
      requireDescription: row?.require_description === 1,
      requireProject: row?.require_project === 1,
      requireTask: row?.require_task === 1,
      requireTag: row?.require_tag === 1,
      weeklyTargetSeconds: Number(row?.weekly_target_seconds ?? 0),
      forceTimer: row?.force_timer === 1,
      hideMemberPages: (row?.hide_member_pages ?? "")
        .split(",")
        .map((page) => page.trim())
        .filter(Boolean),
      hideOthersTime: (row?.hide_others_time ?? 1) !== 0,
      hideRates: row?.hide_rates === 1,
      currency: row?.currency || "USD",
    };
  }

  saveWorkspacePolicy(input: {
    roundingMinutes: number;
    roundingMode: RoundingMode;
    requireDescription: boolean;
    requireProject: boolean;
    requireTask: boolean;
    requireTag: boolean;
    weeklyTargetHours: number;
    forceTimer: boolean;
    hideMemberPages: string[];
    hideOthersTime: boolean;
    hideRates: boolean;
  }): void {
    if (!this.canManage()) throw new Error("Only a manager can change workspace settings");
    this.run(
      `UPDATE workspaces SET rounding_minutes = ?, rounding_mode = ?, require_description = ?, require_project = ?,
         require_task = ?, require_tag = ?, weekly_target_seconds = ?, force_timer = ?, hide_member_pages = ?,
         hide_others_time = ?, hide_rates = ?
       WHERE id = ?`,
      [
        Math.max(0, Math.round(input.roundingMinutes)),
        input.roundingMode,
        input.requireDescription ? 1 : 0,
        input.requireProject ? 1 : 0,
        input.requireTask ? 1 : 0,
        input.requireTag ? 1 : 0,
        Math.max(0, Math.round(input.weeklyTargetHours * 3600)),
        input.forceTimer ? 1 : 0,
        input.hideMemberPages.join(","),
        input.hideOthersTime ? 1 : 0,
        input.hideRates ? 1 : 0,
        this.workspaceId,
      ],
    );
    this.audit("workspace.policy", "workspace", this.workspaceId, { roundingMinutes: input.roundingMinutes });
    this.touch();
  }

  listFavorites(): Array<{
    id: string;
    description: string;
    projectId: string | null;
    taskId: string | null;
    isBillable: boolean;
    tagIds: string[];
    project: string;
  }> {
    return this.all<{
      id: string;
      description: string;
      project_id: string | null;
      task_id: string | null;
      is_billable: number;
      tag_ids: string | null;
      project_name: string | null;
    }>(
      `SELECT f.id, f.description, f.project_id, f.task_id, f.is_billable,
              (SELECT GROUP_CONCAT(tag_id) FROM favorite_entry_tags WHERE favorite_id = f.id) AS tag_ids,
              p.name AS project_name
       FROM favorite_entries f
       LEFT JOIN projects p ON p.id = f.project_id
       WHERE f.workspace_id = ? AND f.user_id = ?
       ORDER BY f.created_at DESC`,
      [this.workspaceId, this.userId],
    ).map((row) => ({
      id: row.id,
      description: row.description,
      projectId: row.project_id,
      taskId: row.task_id,
      isBillable: row.is_billable === 1,
      tagIds: (row.tag_ids ?? "").split(",").map((id) => id.trim()).filter(Boolean),
      project: row.project_name ?? "No project",
    }));
  }

  saveFavorite(input: {
    description: string;
    projectId: string | null;
    taskId: string | null;
    isBillable: boolean;
    tagIds: string[];
  }): void {
    const id = this.newId();
    this.run(
      `INSERT INTO favorite_entries (id, workspace_id, user_id, description, project_id, task_id, is_billable, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        this.workspaceId,
        this.userId,
        input.description.trim() || "No description",
        input.projectId,
        input.taskId,
        input.isBillable ? 1 : 0,
        this.now().toISOString(),
      ],
    );
    for (const tagId of input.tagIds) {
      this.run(`INSERT INTO favorite_entry_tags (favorite_id, tag_id) VALUES (?, ?)`, [id, tagId]);
    }
    this.touch();
  }

  deleteFavorite(favoriteId: string): void {
    this.run(`DELETE FROM favorite_entries WHERE id = ? AND user_id = ?`, [favoriteId, this.userId]);
    this.touch();
  }

  importTimesheetCsv(text: string, forUserId?: string | null): { created: number; errors: string[] } {
    const parsed = parseTimesheetCsv(text);
    const errors = [...parsed.errors];
    let created = 0;
    for (const row of parsed.rows) {
      try {
        const projects = this.listActiveProjects();
        const project = row.project ? projects.find((item) => item.name.toLowerCase() === row.project.toLowerCase()) : undefined;
        if (row.project && !project) throw new Error(`Unknown project "${row.project}"`);
        const task =
          row.task && project
            ? this.listTasks(project.id).find((item) => item.name.toLowerCase() === row.task.toLowerCase())
            : undefined;
        if (row.task && !task) throw new Error(`Unknown task "${row.task}"`);
        const tagIds: string[] = [];
        for (const name of row.tags) {
          let tag = this.listTags().find((item) => item.name.toLowerCase() === name.toLowerCase());
          if (!tag) {
            this.createTag(name, "#7d776e");
            tag = this.listTags().find((item) => item.name.toLowerCase() === name.toLowerCase());
          }
          if (tag) tagIds.push(tag.id);
        }
        this.createManualEntry({
          description: row.description,
          projectId: project?.id ?? null,
          taskId: task?.id ?? null,
          tagIds,
          isBillable: row.billable,
          start: fromDateAndTime(row.date, row.start),
          end: fromDateAndTime(row.date, row.end),
          forUserId,
          source: "import",
        });
        created += 1;
      } catch (error) {
        errors.push(`${row.date} ${row.start}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { created, errors };
  }

  bulkUpdateEntries(
    ids: string[],
    patch: { projectId?: string | null; isBillable?: boolean; addTagId?: string | null; description?: string },
  ): number {
    let updated = 0;
    for (const id of ids) {
      const row = this.get<{
        approval_status: string;
        user_id: string;
        description: string;
        project_id: string | null;
        task_id: string | null;
        is_billable: number;
        start_at: string;
        end_at: string | null;
      }>(
        `SELECT approval_status, user_id, description, project_id, task_id, is_billable, start_at, end_at
         FROM time_entries WHERE id = ? AND deleted_at IS NULL`,
        [id],
      );
      if (!row?.end_at || row.approval_status === "locked") continue;
      if (row.user_id !== this.userId && !this.canManage()) continue;
      const tagIds = this.all<{ tag_id: string }>(`SELECT tag_id FROM time_entry_tags WHERE time_entry_id = ?`, [id]).map((tag) => tag.tag_id);
      if (patch.addTagId && !tagIds.includes(patch.addTagId)) tagIds.push(patch.addTagId);
      try {
        this.updateEntry({
          id,
          description: patch.description ?? row.description,
          projectId: patch.projectId !== undefined ? patch.projectId : row.project_id,
          taskId: row.task_id,
          tagIds,
          isBillable: patch.isBillable ?? row.is_billable === 1,
          start: new Date(row.start_at),
          end: new Date(row.end_at),
        });
        updated += 1;
      } catch {
        continue;
      }
    }
    return updated;
  }

  listFieldDefs(target?: string): Array<{
    id: string;
    target: string;
    name: string;
    fieldType: string;
    required: boolean;
    options: string[];
  }> {
    const rows = this.all<{
      id: string;
      target: string;
      name: string;
      field_type: string;
      required: number;
      options_json: string | null;
    }>(
      target
        ? `SELECT id, target, name, field_type, required, options_json FROM custom_field_definitions WHERE workspace_id = ? AND target = ? ORDER BY sort_order, name`
        : `SELECT id, target, name, field_type, required, options_json FROM custom_field_definitions WHERE workspace_id = ? ORDER BY target, sort_order, name`,
      target ? [this.workspaceId, target] : [this.workspaceId],
    );
    return rows.map((row) => ({
      id: row.id,
      target: row.target,
      name: row.name,
      fieldType: row.field_type,
      required: row.required === 1,
      options: row.options_json ? (JSON.parse(row.options_json) as string[]) : [],
    }));
  }

  saveFieldDef(input: { target: string; name: string; fieldType: string; required: boolean; options: string }): void {
    if (!this.canManage()) throw new Error("Only a manager can edit custom fields");
    const options = input.options
      .split(",")
      .map((option) => option.trim())
      .filter(Boolean);
    this.run(
      `INSERT INTO custom_field_definitions (id, workspace_id, target, name, field_type, required, options_json, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        this.newId(),
        this.workspaceId,
        input.target,
        input.name.trim(),
        input.fieldType,
        input.required ? 1 : 0,
        options.length ? JSON.stringify(options) : null,
        this.now().toISOString(),
      ],
    );
    this.touch();
  }

  deleteFieldDef(fieldId: string): void {
    if (!this.canManage()) throw new Error("Only a manager can edit custom fields");
    this.run(`DELETE FROM custom_field_definitions WHERE id = ? AND workspace_id = ?`, [fieldId, this.workspaceId]);
    this.touch();
  }

  fieldValues(targetId: string, target: string): Array<{ fieldId: string; name: string; fieldType: string; required: boolean; options: string[]; value: string }> {
    return this.listFieldDefs(target).map((field) => {
      const row = this.get<{ value_json: string }>(
        `SELECT value_json FROM custom_field_values WHERE field_id = ? AND target_id = ?`,
        [field.id, targetId],
      );
      let value = "";
      if (row?.value_json) {
        try {
          value = String(JSON.parse(row.value_json) ?? "");
        } catch {
          value = row.value_json;
        }
      }
      return { ...field, fieldId: field.id, value };
    });
  }

  setFieldValue(fieldId: string, targetId: string, value: string): void {
    this.writeCustomFields(targetId, [{ fieldId, value }]);
    this.touch();
  }

  listTemplates(): Array<{ id: string; name: string; tasks: number }> {
    return this.all<{ id: string; name: string; tasks: number }>(
      `SELECT t.id, t.name, COUNT(k.id) AS tasks
       FROM project_templates t
       LEFT JOIN project_template_tasks k ON k.template_id = t.id
       WHERE t.workspace_id = ?
       GROUP BY t.id
       ORDER BY t.name COLLATE NOCASE`,
      [this.workspaceId],
    ).map((row) => ({ id: row.id, name: row.name, tasks: Number(row.tasks) }));
  }

  saveProjectTemplate(projectId: string, name: string): void {
    const project = this.get<{
      color: string | null;
      is_billable: number;
      billable_rate: string | null;
      estimated_hours: string | null;
      budget_amount: string | null;
    }>(`SELECT color, is_billable, billable_rate, estimated_hours, budget_amount FROM projects WHERE id = ?`, [projectId]);
    if (!project) throw new Error("Unknown project");
    const id = this.newId();
    const at = this.now().toISOString();
    this.run(
      `INSERT INTO project_templates (id, workspace_id, name, color, is_billable, billable_rate, estimated_hours, budget_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, this.workspaceId, name.trim(), project.color, project.is_billable, project.billable_rate, project.estimated_hours, project.budget_amount, at],
    );
    for (const task of this.listTasks(projectId)) {
      this.run(`INSERT INTO project_template_tasks (id, template_id, name, billable_rate) VALUES (?, ?, ?, ?)`, [
        this.newId(),
        id,
        task.name,
        task.billableRate ?? null,
      ]);
    }
    this.audit("template.saved", "project_template", id, { name: name.trim() });
    this.touch();
  }

  createProjectFromTemplate(templateId: string, name: string, clientId: string): void {
    const template = this.get<{
      color: string | null;
      is_billable: number;
      billable_rate: string | null;
      estimated_hours: string | null;
      budget_amount: string | null;
    }>(
      `SELECT color, is_billable, billable_rate, estimated_hours, budget_amount FROM project_templates WHERE id = ? AND workspace_id = ?`,
      [templateId, this.workspaceId],
    );
    if (!template) throw new Error("Unknown template");
    this.createProject({
      name,
      clientId,
      color: template.color ?? "#5bbd7e",
      isBillable: template.is_billable === 1,
      billableRate: template.billable_rate ?? "",
      estimatedHours: template.estimated_hours ?? "",
      budgetAmount: template.budget_amount ?? "",
      access: "public",
      status: "active",
    });
    const created = this.get<{ id: string }>(
      `SELECT id FROM projects WHERE workspace_id = ? AND name = ? ORDER BY created_at DESC LIMIT 1`,
      [this.workspaceId, name.trim()],
    );
    if (!created) return;
    const tasks = this.all<{ name: string; billable_rate: string | null }>(
      `SELECT name, billable_rate FROM project_template_tasks WHERE template_id = ?`,
      [templateId],
    );
    for (const task of tasks) this.createTask(created.id, task.name, task.billable_rate);
  }

  listRateHistory(subjectType: string, subjectId: string): Array<{ amount: string; kind: string; from: string; to: string | null }> {
    return this.all<{ amount: string; rate_kind: string; effective_from: string; effective_to: string | null }>(
      `SELECT amount, rate_kind, effective_from, effective_to FROM rate_history
       WHERE workspace_id = ? AND subject_type = ? AND subject_id = ?
       ORDER BY effective_from DESC`,
      [this.workspaceId, subjectType, subjectId],
    ).map((row) => ({
      amount: row.amount,
      kind: row.rate_kind,
      from: row.effective_from.slice(0, 10),
      to: row.effective_to ? row.effective_to.slice(0, 10) : null,
    }));
  }

  setSubjectRate(subjectType: "workspace" | "project" | "task" | "user", subjectId: string, kind: "billable" | "cost", amount: string, effectiveFromIso: string): void {
    const open = this.get<{ amount: string }>(
      `SELECT amount FROM rate_history
       WHERE workspace_id = ? AND subject_type = ? AND subject_id = ? AND rate_kind = ? AND effective_to IS NULL`,
      [this.workspaceId, subjectType, subjectId, kind],
    );
    if (open?.amount === amount) return;
    this.run(
      `UPDATE rate_history SET effective_to = ? WHERE workspace_id = ? AND subject_type = ? AND subject_id = ? AND rate_kind = ? AND effective_to IS NULL`,
      [effectiveFromIso, this.workspaceId, subjectType, subjectId, kind],
    );
    const currency = this.workspacePolicy().currency;
    this.run(
      `INSERT INTO rate_history (id, workspace_id, subject_type, subject_id, rate_kind, amount, currency, effective_from, effective_to, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [this.newId(), this.workspaceId, subjectType, subjectId, kind, amount, currency, effectiveFromIso, this.now().toISOString()],
    );
    if (subjectType === "project" && kind === "billable") {
      this.run(`UPDATE projects SET billable_rate = ? WHERE id = ?`, [amount, subjectId]);
    }
    if (subjectType === "task" && kind === "billable") {
      this.run(`UPDATE tasks SET billable_rate = ? WHERE id = ?`, [amount, subjectId]);
    }
    if (subjectType === "user" && kind === "cost") {
      this.run(`UPDATE users SET default_cost_rate = ? WHERE id = ?`, [amount, subjectId]);
    }
    this.audit("rate.updated", subjectType, subjectId, { kind, amount, effectiveFrom: effectiveFromIso });
    this.touch();
  }

  listTimeOff(): Array<{
    id: string;
    userId: string;
    user: string;
    policy: string;
    startDate: string;
    endDate: string;
    hoursPerDay: string;
    status: string;
    note: string;
  }> {
    const managing = this.canManage();
    return this.all<{
      id: string;
      user_id: string;
      user_name: string;
      policy: string;
      start_date: string;
      end_date: string;
      hours_per_day: string;
      status: string;
      note: string | null;
    }>(
      `SELECT t.id, t.user_id, u.name AS user_name, t.policy, t.start_date, t.end_date, t.hours_per_day, t.status, t.note
       FROM time_off t JOIN users u ON u.id = t.user_id
       WHERE t.workspace_id = ? AND (? = 1 OR t.user_id = ?)
       ORDER BY t.start_date DESC`,
      [this.workspaceId, managing ? 1 : 0, this.userId],
    ).map((row) => ({
      id: row.id,
      userId: row.user_id,
      user: row.user_name,
      policy: row.policy,
      startDate: row.start_date,
      endDate: row.end_date,
      hoursPerDay: row.hours_per_day,
      status: row.status,
      note: row.note ?? "",
    }));
  }

  requestTimeOff(input: { userId?: string; policy: string; startDate: string; endDate: string; hoursPerDay: string; note: string }): void {
    const userId = input.userId && this.canManage() ? input.userId : this.userId;
    if (input.endDate < input.startDate) throw new Error("End date is before the start date");
    const id = this.newId();
    this.run(
      `INSERT INTO time_off (id, workspace_id, user_id, policy, start_date, end_date, hours_per_day, status, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'requested', ?, ?)`,
      [id, this.workspaceId, userId, input.policy, input.startDate, input.endDate, input.hoursPerDay || "8", input.note.trim() || null, this.now().toISOString()],
    );
    this.audit("time_off.requested", "time_off", id, { policy: input.policy });
    this.touch();
  }

  setTimeOffStatus(id: string, status: "approved" | "rejected" | "requested"): void {
    if (status !== "requested" && !this.canManage()) throw new Error("Only a manager can approve time off");
    this.run(`UPDATE time_off SET status = ? WHERE id = ? AND workspace_id = ?`, [status, id, this.workspaceId]);
    this.audit(`time_off.${status}`, "time_off", id);
    this.touch();
  }

  listExpenses(): Array<{
    id: string;
    user: string;
    project: string;
    category: string;
    amount: string;
    currency: string;
    spentOn: string;
    note: string;
    billable: boolean;
  }> {
    const managing = this.canManage();
    return this.all<{
      id: string;
      user_name: string;
      project_name: string | null;
      category: string;
      amount: string;
      currency: string;
      spent_on: string;
      note: string | null;
      is_billable: number;
    }>(
      `SELECT e.id, u.name AS user_name, p.name AS project_name, e.category, e.amount, e.currency, e.spent_on, e.note, e.is_billable
       FROM expenses e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN projects p ON p.id = e.project_id
       WHERE e.workspace_id = ? AND (? = 1 OR e.user_id = ?)
       ORDER BY e.spent_on DESC`,
      [this.workspaceId, managing ? 1 : 0, this.userId],
    ).map((row) => ({
      id: row.id,
      user: row.user_name,
      project: row.project_name ?? "—",
      category: row.category,
      amount: row.amount,
      currency: row.currency,
      spentOn: row.spent_on,
      note: row.note ?? "",
      billable: row.is_billable === 1,
    }));
  }

  createExpense(input: { projectId: string | null; category: string; amount: string; currency: string; spentOn: string; note: string; billable: boolean }): void {
    const project = input.projectId
      ? this.get<{ client_id: string | null }>(`SELECT client_id FROM projects WHERE id = ?`, [input.projectId])
      : undefined;
    const id = this.newId();
    this.run(
      `INSERT INTO expenses (id, workspace_id, user_id, project_id, client_id, category, amount, currency, spent_on, note, is_billable, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        this.workspaceId,
        this.userId,
        input.projectId,
        project?.client_id ?? null,
        input.category.trim(),
        input.amount.trim(),
        (input.currency || this.workspacePolicy().currency).toUpperCase(),
        input.spentOn,
        input.note.trim() || null,
        input.billable ? 1 : 0,
        this.now().toISOString(),
      ],
    );
    this.audit("expense.created", "expense", id, { amount: input.amount, category: input.category });
    this.touch();
  }

  deleteExpense(expenseId: string): void {
    this.run(`DELETE FROM expenses WHERE id = ? AND workspace_id = ? AND (? = 1 OR user_id = ?)`, [
      expenseId,
      this.workspaceId,
      this.canManage() ? 1 : 0,
      this.userId,
    ]);
    this.touch();
  }

  listCurrencies(): Array<{ currency: string; rateToBase: string }> {
    return this.all<{ currency: string; rate_to_base: string }>(
      `SELECT currency, rate_to_base FROM currency_rates WHERE workspace_id = ? ORDER BY currency`,
      [this.workspaceId],
    ).map((row) => ({ currency: row.currency, rateToBase: row.rate_to_base }));
  }

  setCurrencyRate(currency: string, rateToBase: string): void {
    if (!this.canManage()) throw new Error("Only a manager can edit exchange rates");
    const code = currency.trim().toUpperCase();
    const existing = this.get<{ id: string }>(`SELECT id FROM currency_rates WHERE workspace_id = ? AND currency = ?`, [this.workspaceId, code]);
    if (existing) {
      this.run(`UPDATE currency_rates SET rate_to_base = ? WHERE id = ?`, [rateToBase.trim(), existing.id]);
    } else {
      this.run(`INSERT INTO currency_rates (id, workspace_id, currency, rate_to_base) VALUES (?, ?, ?, ?)`, [
        this.newId(),
        this.workspaceId,
        code,
        rateToBase.trim(),
      ]);
    }
    this.touch();
  }

  setClientCurrency(clientId: string, currency: string): void {
    if (!this.canManage()) throw new Error("Only a manager can edit client currency");
    this.run(`UPDATE clients SET currency = ? WHERE id = ? AND workspace_id = ?`, [currency.trim().toUpperCase(), clientId, this.workspaceId]);
    this.touch();
  }

  listRecurring(): Array<{ id: string; client: string; clientId: string; interval: string; nextIssueDate: string; notes: string; active: boolean }> {
    return this.all<{
      id: string;
      client: string;
      client_id: string;
      interval_unit: string;
      next_issue_date: string;
      notes: string | null;
      active: number;
    }>(
      `SELECT r.id, c.name AS client, r.client_id, r.interval_unit, r.next_issue_date, r.notes, r.active
       FROM recurring_invoices r JOIN clients c ON c.id = r.client_id
       WHERE r.workspace_id = ?
       ORDER BY r.next_issue_date`,
      [this.workspaceId],
    ).map((row) => ({
      id: row.id,
      client: row.client,
      clientId: row.client_id,
      interval: row.interval_unit,
      nextIssueDate: row.next_issue_date,
      notes: row.notes ?? "",
      active: row.active === 1,
    }));
  }

  createRecurring(input: { clientId: string; interval: "weekly" | "monthly"; nextIssueDate: string; notes: string }): void {
    if (!this.canManage()) throw new Error("Only a manager can schedule invoices");
    const id = this.newId();
    this.run(
      `INSERT INTO recurring_invoices (id, workspace_id, client_id, interval_unit, next_issue_date, notes, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [id, this.workspaceId, input.clientId, input.interval, input.nextIssueDate, input.notes.trim() || null, this.now().toISOString()],
    );
    this.touch();
  }

  generateDueRecurring(): { created: number; skipped: string[] } {
    if (!this.canManage()) throw new Error("Only a manager can generate invoices");
    const today = toDateInput(this.now());
    const due = this.all<{ id: string; client_id: string; interval_unit: "weekly" | "monthly"; next_issue_date: string; notes: string | null }>(
      `SELECT id, client_id, interval_unit, next_issue_date, notes FROM recurring_invoices
       WHERE workspace_id = ? AND active = 1 AND next_issue_date <= ?`,
      [this.workspaceId, today],
    );
    let created = 0;
    const skipped: string[] = [];
    for (const row of due) {
      const end = fromDateAndTime(row.next_issue_date, "00:00");
      const start = row.interval_unit === "weekly" ? addDays(end, -7) : addMonths(end, -1);
      try {
        this.createInvoiceFromRange({ clientId: row.client_id, from: start, toExclusive: end, notes: row.notes ?? undefined });
        const next = row.interval_unit === "weekly" ? addDays(end, 7) : addMonths(end, 1);
        this.run(`UPDATE recurring_invoices SET next_issue_date = ? WHERE id = ?`, [toDateInput(next), row.id]);
        created += 1;
      } catch (error) {
        skipped.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (created) this.touch();
    return { created, skipped };
  }

  listSchedule(weekStart: Date): Array<{ id: string; userId: string; user: string; projectId: string; project: string; day: string; hours: string; note: string }> {
    const start = toDateInput(startOfLocalWeek(weekStart));
    const end = toDateInput(addDays(startOfLocalWeek(weekStart), 7));
    return this.all<{
      id: string;
      user_id: string;
      user_name: string;
      project_id: string;
      project_name: string;
      day: string;
      hours: string;
      note: string | null;
    }>(
      `SELECT s.id, s.user_id, u.name AS user_name, s.project_id, p.name AS project_name, s.day, s.hours, s.note
       FROM schedule_blocks s
       JOIN users u ON u.id = s.user_id
       JOIN projects p ON p.id = s.project_id
       WHERE s.workspace_id = ? AND s.day >= ? AND s.day < ?
       ORDER BY s.day, u.name, p.name`,
      [this.workspaceId, start, end],
    ).map((row) => ({
      id: row.id,
      userId: row.user_id,
      user: row.user_name,
      projectId: row.project_id,
      project: row.project_name,
      day: row.day,
      hours: row.hours,
      note: row.note ?? "",
    }));
  }

  setScheduleBlock(input: { userId: string; projectId: string; day: string; hours: string; note: string }): void {
    if (!this.canManage()) throw new Error("Only a manager can edit the schedule");
    const hours = input.hours.trim();
    if (!hours || Number(hours) <= 0) {
      this.run(`DELETE FROM schedule_blocks WHERE workspace_id = ? AND user_id = ? AND project_id = ? AND day = ?`, [
        this.workspaceId,
        input.userId,
        input.projectId,
        input.day,
      ]);
      this.touch();
      return;
    }
    this.run(
      `INSERT INTO schedule_blocks (id, workspace_id, user_id, project_id, day, hours, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, user_id, project_id, day) DO UPDATE SET hours = excluded.hours, note = excluded.note`,
      [this.newId(), this.workspaceId, input.userId, input.projectId, input.day, hours, input.note.trim() || null, this.now().toISOString()],
    );
    this.touch();
  }

  forecastWeek(weekStart: Date): Array<{ userId: string; user: string; scheduled: number; capacity: number; utilization: number }> {
    const blocks = this.listSchedule(weekStart);
    const capacity = this.workspacePolicy().weeklyTargetSeconds / 3600 || 40;
    return this.listUsers().map((user) => {
      const scheduled = blocks.filter((block) => block.userId === user.id).reduce((sum, block) => sum + Number(block.hours || 0), 0);
      return { userId: user.id, user: user.name, scheduled, capacity, utilization: capacity > 0 ? scheduled / capacity : 0 };
    });
  }

  attendance(fromIso: string, toIso: string): Array<{ user: string; day: string; first: string; last: string; seconds: number; status: "present" | "off" | "absent" }> {
    const policy = this.workspacePolicy();
    const seeAll = !policy.hideOthersTime || this.canManage();
    const users = this.listUsers().filter((user) => seeAll || user.id === this.userId);
    const entries = this.all<{ user_id: string; start_at: string; end_at: string | null; duration_seconds: number }>(
      `SELECT user_id, start_at, end_at, duration_seconds FROM time_entries
       WHERE workspace_id = ? AND deleted_at IS NULL AND kind = 'work' AND end_at IS NOT NULL
         AND start_at >= ? AND start_at < ?`,
      [this.workspaceId, fromIso, toIso],
    );
    const off = this.all<{ user_id: string; start_date: string; end_date: string }>(
      `SELECT user_id, start_date, end_date FROM time_off WHERE workspace_id = ? AND status != 'rejected'`,
      [this.workspaceId],
    );
    const rows: Array<{ user: string; day: string; first: string; last: string; seconds: number; status: "present" | "off" | "absent" }> = [];
    for (const user of users) {
      for (const day of this.dayKeys(fromIso, toIso)) {
        const mine = entries.filter((entry) => entry.user_id === user.id && localDayKey(entry.start_at) === day);
        const seconds = mine.reduce((sum, entry) => sum + Number(entry.duration_seconds), 0);
        const offToday = off.some((item) => item.user_id === user.id && item.start_date <= day && item.end_date >= day);
        const status = attendanceStatus(seconds, offToday);
        if (status === "absent" && isWeekendKey(day)) continue;
        const first = mine.length ? formatClock(mine.map((entry) => entry.start_at).sort()[0]) : "—";
        const last = mine.length ? formatClock(mine.map((entry) => entry.end_at ?? entry.start_at).sort().at(-1) ?? "") : "—";
        rows.push({ user: user.name, day, first, last, seconds, status });
      }
    }
    return rows;
  }

  addApprovalNote(entryId: string, body: string): void {
    const note = body.trim();
    if (!note) return;
    this.run(
      `INSERT INTO approval_notes (id, workspace_id, time_entry_id, author_user_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [this.newId(), this.workspaceId, entryId, this.userId, note, this.now().toISOString()],
    );
    this.touch();
  }

  listApprovalNotes(entryId: string): Array<{ author: string; body: string; createdAt: string }> {
    return this.all<{ author: string | null; body: string; created_at: string }>(
      `SELECT u.name AS author, n.body, n.created_at FROM approval_notes n
       LEFT JOIN users u ON u.id = n.author_user_id
       WHERE n.time_entry_id = ? ORDER BY n.created_at`,
      [entryId],
    ).map((row) => ({
      author: row.author ?? "Unknown",
      body: row.body,
      createdAt: new Date(row.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    }));
  }

  listAlerts(): string[] {
    const policy = this.workspacePolicy();
    const alerts: string[] = [];
    if (policy.weeklyTargetSeconds > 0) {
      const week = this.listWeekGroups().weekTotalSeconds;
      const tracked = formatHours(week);
      const target = formatHours(policy.weeklyTargetSeconds);
      const day = this.now().getDay();
      if (week < policy.weeklyTargetSeconds && (day === 0 || day === 5 || day === 6)) {
        alerts.push(`Reminder: ${tracked}h tracked toward a ${target}h weekly target`);
      } else {
        alerts.push(`This week ${tracked}h / ${target}h target`);
      }
    }
    if (policy.forceTimer && !this.canManage() && !this.getOpenSession()) {
      alerts.push("Force timer is on — start the timer to record time");
    }
    if (this.canSeeMoney()) {
      for (const project of this.listProjects()) {
        if (project.budgetAmount && (project.billedAmount ?? 0) > Number(project.budgetAmount)) {
          alerts.push(`${project.name} is over its $${Number(project.budgetAmount).toFixed(0)} budget`);
        }
      }
    }
    if (this.canManage()) {
      const pending = this.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM time_entries WHERE workspace_id = ? AND approval_status = 'submitted' AND deleted_at IS NULL`,
        [this.workspaceId],
      )?.n;
      if (Number(pending) > 0) alerts.push(`${pending} submitted entries waiting for approval`);
      const requests = this.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM time_off WHERE workspace_id = ? AND status = 'requested'`,
        [this.workspaceId],
      )?.n;
      if (Number(requests) > 0) alerts.push(`${requests} time-off requests waiting`);
      const due = this.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM recurring_invoices WHERE workspace_id = ? AND active = 1 AND next_issue_date <= ?`,
        [this.workspaceId, toDateInput(this.now())],
      )?.n;
      if (Number(due) > 0) alerts.push(`${due} recurring invoices are due`);
    }
    return alerts;
  }

  private assertEntryAllowed(input: {
    description: string;
    projectId?: string | null;
    taskId?: string | null;
    tagIds?: string[];
    customFields?: Array<{ fieldId: string; value: string }>;
  }): void {
    const policy = this.workspacePolicy();
    const errors = entryPolicyErrors(
      {
        requireDescription: policy.requireDescription,
        requireProject: policy.requireProject,
        requireTask: policy.requireTask,
        requireTag: policy.requireTag,
        requiredCustom: this.listFieldDefs("time_entry")
          .filter((field) => field.required)
          .map((field) => ({ fieldId: field.id, name: field.name })),
      },
      {
        description: input.description,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        tagIds: input.tagIds ?? [],
        customFields: input.customFields,
      },
    );
    if (errors.length) throw new Error(errors.join(". "));
  }

  private writeCustomFields(targetId: string, fields: Array<{ fieldId: string; value: string }>): void {
    const at = this.now().toISOString();
    for (const field of fields) {
      this.run(
        `INSERT INTO custom_field_values (id, field_id, target_id, value_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(field_id, target_id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        [this.newId(), field.fieldId, targetId, JSON.stringify(field.value), at],
      );
    }
  }

  private expenseTotalBetween(fromIso: string, toIso: string, seeAll: boolean): number {
    const rows = this.all<{ amount: string; currency: string }>(
      `SELECT amount, currency FROM expenses
       WHERE workspace_id = ? AND spent_on >= ? AND spent_on < ? AND (? = 1 OR user_id = ?)`,
      [this.workspaceId, toDateInput(new Date(fromIso)), toDateInput(new Date(toIso)), seeAll ? 1 : 0, this.userId],
    );
    return rows.reduce((sum, row) => {
      try {
        return sum + parseAmount(row.amount) * this.rateToBase(row.currency);
      } catch {
        return sum + parseAmount(row.amount);
      }
    }, 0);
  }

  private rateToBase(currency: string): number {
    const base = this.workspacePolicy().currency;
    const code = (currency || base).toUpperCase();
    if (code === base.toUpperCase()) return 1;
    const row = this.get<{ rate_to_base: string }>(
      `SELECT rate_to_base FROM currency_rates WHERE workspace_id = ? AND currency = ?`,
      [this.workspaceId, code],
    );
    if (!row) throw new Error(`Add an exchange rate for ${code} in Workspace settings.`);
    const rate = parseAmount(row.rate_to_base);
    if (rate <= 0) throw new Error(`Exchange rate for ${code} must be greater than zero.`);
    return rate;
  }

  private dayKeys(fromIso: string, toIso: string): string[] {
    const keys: string[] = [];
    let cursor = startOfLocalDay(new Date(fromIso));
    const end = startOfLocalDay(new Date(toIso));
    while (cursor.getTime() < end.getTime() && keys.length < 120) {
      keys.push(toDateInput(cursor));
      cursor = addDays(cursor, 1);
    }
    return keys;
  }

  private touch(): void {
    this.revision += 1;
    for (const listener of this.listeners) listener();
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (typeof indexedDB === "undefined") return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      void savePersistedDb(this.db.export());
    }, 40);
  }

  async flush(): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    await savePersistedDb(this.db.export());
  }
}
