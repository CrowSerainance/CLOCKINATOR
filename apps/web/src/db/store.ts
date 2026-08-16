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
import type { DayGroup, ProjectRow } from "../types";
import { addDays, dayLabel, formatClock, formatDuration, localDayKey, startOfLocalWeek } from "../domain/duration";
import { formatRate } from "../domain/money";
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
    const rows = this.all<ProjectListRow>(
      `SELECT p.id, p.name, p.color, c.name AS client_name,
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
        tracked: `${trackedHours.toFixed(1)}h`,
        progress,
        budget: estimate ? `${Math.round(trackedHours)} / ${estimate}h` : "No budget",
        rate: row.is_billable ? formatRate(row.billable_rate) : "—",
        status: status.label,
        statusColor: status.color,
        access: row.access as ProjectRow["access"],
        favorite: row.is_favorite === 1,
      };
    });
  }

  setProjectFavorite(projectId: string, favorite: boolean): void {
    this.run(`UPDATE projects SET is_favorite = ? WHERE id = ?`, [favorite ? 1 : 0, projectId]);
    this.touch();
  }

  createProject(name: string): void {
    const id = this.newId();
    const at = this.now().toISOString();
    this.run(
      `INSERT INTO projects (id, workspace_id, client_id, name, color, status, access, is_billable, is_favorite, billable_rate, estimated_hours, created_at)
       VALUES (?, ?, NULL, ?, '#5bbd7e', 'active', 'public', 1, 0, NULL, NULL, ?)`,
      [id, this.workspaceId, name.trim(), at],
    );
    this.audit("project.created", "project", id, { name: name.trim() });
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

  listWeekGroups(at = this.now()): { groups: DayGroup[]; weekTotal: string } {
    const weekStart = startOfLocalWeek(at);
    const weekEnd = addDays(weekStart, 7);
    const rows = this.all<EntryListRow>(
      `SELECT e.id, e.kind, e.description, p.name AS project_name, c.name AS client_name, p.color AS project_color,
              (SELECT t.name FROM time_entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.time_entry_id = e.id LIMIT 1) AS tag_name,
              e.start_at, e.end_at, e.duration_seconds, e.is_billable, e.project_id, e.task_id
       FROM time_entries e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN clients c ON c.id = p.client_id
       WHERE e.workspace_id = ? AND e.user_id = ? AND e.deleted_at IS NULL AND e.kind = 'work' AND e.end_at IS NOT NULL
         AND e.start_at >= ? AND e.start_at < ?
       ORDER BY e.start_at DESC`,
      [this.workspaceId, this.userId, weekStart.toISOString(), weekEnd.toISOString()],
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
      weekSeconds += duration;
      byDay.get(key)!.entries.push({
        id: row.id,
        desc: row.description || "(no description)",
        project: row.project_name ?? "No project",
        color: row.project_color ?? "#7d776e",
        client: row.client_name ?? "",
        tag: row.tag_name ?? undefined,
        start: formatClock(row.start_at),
        end: row.end_at ? formatClock(row.end_at) : "…",
        dur: formatDuration(duration),
        billable: row.is_billable === 1,
      });
    }
    const groups = [...byDay.values()].map((g) => ({
      ...g,
      total: formatDuration(g.entries.reduce((sum, e) => sum + parseDuration(e.dur), 0)),
    }));
    return { groups, weekTotal: formatDuration(weekSeconds) };
  }

  report(fromIso: string, toIso: string) {
    const rows = this.all<{
      project_name: string | null;
      description: string;
      duration_seconds: number;
      is_billable: number;
      billable_rate_snapshot: string;
      kind: string;
    }>(
      `SELECT p.name AS project_name, e.description, e.duration_seconds, e.is_billable, e.billable_rate_snapshot, e.kind
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
    const byProject = new Map<string, { title: string; seconds: number }>();
    for (const row of work) {
      const title = row.project_name ?? "No project";
      const current = byProject.get(title) ?? { title, seconds: 0 };
      current.seconds += Number(row.duration_seconds);
      byProject.set(title, current);
    }
    return {
      totalSeconds,
      billableSeconds,
      amount,
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
        kind: string;
      }>(
        `SELECT e.id AS entry_id, u.email AS user_email, p.name AS project, t.name AS task,
                (SELECT GROUP_CONCAT(tg.name, ', ') FROM time_entry_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.time_entry_id = e.id) AS tags,
                e.description, e.start_at, e.end_at, e.duration_seconds / 3600.0 AS duration_hours,
                e.is_billable AS billable, e.billable_rate_snapshot AS billable_rate, e.kind
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

function parseDuration(value: string): number {
  const [h, m, s] = value.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}
