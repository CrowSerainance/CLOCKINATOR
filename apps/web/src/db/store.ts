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
  dayLabel,
  durationSeconds,
  formatClock,
  formatDuration,
  localDayKey,
  startOfLocalDay,
  startOfLocalWeek,
} from "../domain/duration";
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
    this.userId = ids.userId;
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
    const atIso = at.toISOString();
    const history = this.all<HistoricRate>(
      `SELECT subject_type, subject_id, rate_kind, amount, effective_from, effective_to
       FROM rate_history
       WHERE workspace_id = ? AND rate_kind = 'cost' AND subject_type = 'user' AND subject_id = ?`,
      [this.workspaceId, this.userId],
    );
    const historic = historicRateAt(history, "cost", atIso, [{ type: "user", id: this.userId }]);
    if (historic) return historic;
    return this.get<{ default_cost_rate: string }>(`SELECT default_cost_rate FROM users WHERE id = ?`, [this.userId])?.default_cost_rate ?? "0";
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

  start(input: StartTimerInput): void {
    startTimer(this, input);
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
    const rows = this.all<ProjectListRow & { client_id: string | null }>(
      `SELECT p.id, p.name, p.color, c.name AS client_name, p.client_id,
              COALESCE(SUM(CASE WHEN e.kind = 'work' AND e.end_at IS NOT NULL AND e.deleted_at IS NULL THEN e.duration_seconds ELSE 0 END), 0) AS tracked_seconds,
              p.estimated_hours, p.billable_rate, p.is_billable, p.status, p.access, p.is_favorite
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
        budget: estimate ? `${Math.round(trackedHours)} / ${estimate}h` : "No budget",
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
      `INSERT INTO projects (id, workspace_id, client_id, name, color, status, access, is_billable, is_favorite, billable_rate, estimated_hours, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
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
      `UPDATE projects SET name = ?, client_id = ?, color = ?, status = ?, access = ?, is_billable = ?, billable_rate = ?, estimated_hours = ?
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
    return this.all<{ id: string; name: string; projects: number; tracked_seconds: number }>(
      `SELECT c.id, c.name,
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
  }): void {
    const start = input.start;
    const end = input.end;
    if (end.getTime() <= start.getTime()) throw new Error("End time must be after start time");
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const duration = durationSeconds(startIso, endIso);
    const billableRate = input.isBillable ? this.resolveBillableRate(input.projectId, null, start) : "0";
    const costRate = this.resolveCostRate(start);
    const id = this.newId();
    this.run(
      `INSERT INTO time_entries (
         id, workspace_id, user_id, created_by_user_id, session_id, parent_entry_id, project_id, task_id,
         kind, source, description, start_at, end_at, duration_seconds, is_billable, billable_rate_snapshot,
         cost_rate_snapshot, approval_status, timezone, deleted_at, created_at
       )        VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 'work', 'web', ?, ?, ?, ?, ?, ?, ?, 'draft', 'UTC', NULL, ?)`,
      [
        id,
        this.workspaceId,
        this.userId,
        this.userId,
        input.projectId,
        input.taskId ?? null,
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
    this.audit("time_entry.created", "time_entry", id, { source: "manual" });
    this.touch();
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
    this.run(`UPDATE time_entries SET approval_status = ? WHERE id = ?`, [status, entryId]);
    this.audit(`time_entry.${status}`, "time_entry", entryId);
    this.touch();
  }

  lockWeek(at = this.now()): number {
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
    return this.all<{
      id: string;
      description: string;
      project: string | null;
      color: string | null;
      start_at: string;
      duration_seconds: number;
      approval_status: string;
    }>(
      `SELECT e.id, e.description, p.name AS project, p.color, e.start_at, e.duration_seconds, e.approval_status
       FROM time_entries e
       LEFT JOIN projects p ON p.id = e.project_id
       WHERE e.workspace_id = ? AND e.deleted_at IS NULL AND e.kind = 'work' AND e.end_at IS NOT NULL
       ORDER BY CASE e.approval_status WHEN 'submitted' THEN 0 WHEN 'draft' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END, e.start_at DESC
       LIMIT 80`,
      [this.workspaceId],
    ).map((row) => ({
      id: row.id,
      desc: row.description || "(no description)",
      project: row.project ?? "No project",
      color: row.color ?? "#7d776e",
      day: dayLabel(localDayKey(row.start_at), todayKey, yesterdayKey),
      dur: formatDuration(Number(row.duration_seconds)),
      status: row.approval_status,
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
    }>(
      `SELECT a.id, a.action, a.target_type, a.target_id, u.name AS actor, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.workspace_id = ?
       ORDER BY a.created_at DESC
       LIMIT 80`,
      [this.workspaceId],
    ).map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      actor: row.actor ?? "System",
      createdAt: new Date(row.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    }));
  }

  report(fromIso: string, toIso: string) {
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
       ORDER BY e.start_at`,
      [this.workspaceId, fromIso, toIso],
    );
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
    const profit = amount - laborCost;
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
      profit,
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
         ORDER BY e.start_at`,
        [this.workspaceId, fromIso, toIso],
      ),
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
  }): void {
    const current = this.get<{ approval_status: string }>(`SELECT approval_status FROM time_entries WHERE id = ? AND deleted_at IS NULL`, [input.id]);
    if (!current) throw new Error("Unknown time entry");
    if (current.approval_status === "locked") throw new Error("Locked entries cannot be edited");
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
    this.audit("time_entry.updated", "time_entry", input.id);
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
    const current = this.get<{ approval_status: string }>(`SELECT approval_status FROM time_entries WHERE id = ?`, [entryId]);
    if (!current) return;
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
    const client = this.get<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE id = ? AND workspace_id = ?`,
      [input.clientId, this.workspaceId],
    );
    if (!client) throw new Error("Unknown client");

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
    const currency =
      this.get<{ currency: string }>(`SELECT currency FROM workspaces WHERE id = ?`, [this.workspaceId])?.currency ?? "USD";

    this.run(
      `INSERT INTO invoices (id, workspace_id, client_id, number, status, issue_date, due_date, currency, notes, created_at)
       VALUES (?, ?, ?, ?, 'draft', ?, NULL, ?, ?, ?)`,
      [invoiceId, this.workspaceId, input.clientId, number, issueDate, currency, input.notes?.trim() || null, at],
    );

    let sort = 0;
    for (const entry of entries) {
      const project = entry.project_name ?? "No project";
      const desc = entry.description.trim() || "(no description)";
      const hours = Number(entry.duration_seconds) / 3600;
      const rate = entry.billable_rate_snapshot || "0";
      const amount = billableAmount(Number(entry.duration_seconds), rate);
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
