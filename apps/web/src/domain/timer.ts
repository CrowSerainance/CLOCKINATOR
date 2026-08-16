import type { SqlParam } from "../db/sql";

export type SessionStatus = "running" | "paused" | "on_break" | "stopped";
export type EntryKind = "work" | "break";

export interface StartTimerInput {
  description: string;
  projectId?: string | null;
  taskId?: string | null;
  tagIds?: string[];
  isBillable?: boolean;
  at?: Date;
}

export interface OpenSession {
  id: string;
  status: Exclude<SessionStatus, "stopped">;
  description: string;
  projectId: string | null;
  taskId: string | null;
  projectName: string | null;
  clientName: string | null;
  projectColor: string | null;
  isBillable: boolean;
  billableRateSnapshot: string;
  startedAt: string;
}

export interface EntryListRow {
  id: string;
  kind: EntryKind;
  description: string;
  project_name: string | null;
  client_name: string | null;
  project_color: string | null;
  tag_name: string | null;
  start_at: string;
  end_at: string | null;
  duration_seconds: number;
  is_billable: number;
  project_id: string | null;
  task_id: string | null;
}

export interface ProjectListRow {
  id: string;
  name: string;
  color: string | null;
  client_name: string | null;
  tracked_seconds: number;
  estimated_hours: string | null;
  billable_rate: string | null;
  is_billable: number;
  status: string;
  access: string;
  is_favorite: number;
}

export interface TimerEngineDb {
  workspaceId: string;
  userId: string;
  now(): Date;
  newId(): string;
  run(sql: string, params?: SqlParam[]): void;
  all<T>(sql: string, params?: SqlParam[]): T[];
  get<T>(sql: string, params?: SqlParam[]): T | undefined;
  audit(action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>): void;
  resolveBillableRate(projectId: string | null, taskId: string | null, at: Date): string;
  resolveCostRate(at: Date): string;
}

export function requireOpenSession(db: TimerEngineDb): {
  id: string;
  status: Exclude<SessionStatus, "stopped">;
  description: string;
  project_id: string | null;
  task_id: string | null;
  is_billable: number;
  billable_rate_snapshot: string;
  cost_rate_snapshot: string;
} {
  const session = db.get<{
    id: string;
    status: Exclude<SessionStatus, "stopped">;
    description: string;
    project_id: string | null;
    task_id: string | null;
    is_billable: number;
    billable_rate_snapshot: string;
    cost_rate_snapshot: string;
  }>(
    `SELECT id, status, description, project_id, task_id, is_billable, billable_rate_snapshot, cost_rate_snapshot
     FROM timer_sessions
     WHERE workspace_id = ? AND user_id = ? AND status IN ('running', 'paused', 'on_break')`,
    [db.workspaceId, db.userId],
  );
  if (!session) throw new Error("No open timer session");
  return session;
}

export function runningEntry(
  db: TimerEngineDb,
  sessionId: string,
): { id: string; kind: EntryKind; start_at: string } | undefined {
  return db.get<{ id: string; kind: EntryKind; start_at: string }>(
    `SELECT id, kind, start_at FROM time_entries
     WHERE session_id = ? AND end_at IS NULL AND deleted_at IS NULL`,
    [sessionId],
  );
}

function closeEntry(db: TimerEngineDb, entryId: string, startAt: string, atIso: string): number {
  const duration = Math.max(0, Math.floor((Date.parse(atIso) - Date.parse(startAt)) / 1000));
  db.run(`UPDATE time_entries SET end_at = ?, duration_seconds = ? WHERE id = ?`, [atIso, duration, entryId]);
  return duration;
}

function insertEntry(
  db: TimerEngineDb,
  args: {
    sessionId: string;
    kind: EntryKind;
    source: string;
    description: string;
    projectId: string | null;
    taskId: string | null;
    isBillable: boolean;
    billableRate: string;
    costRate: string;
    startAt: string;
    parentId?: string | null;
    tagIds?: string[];
  },
): string {
  const id = db.newId();
  db.run(
    `INSERT INTO time_entries (
       id, workspace_id, user_id, created_by_user_id, session_id, parent_entry_id, project_id, task_id,
       kind, source, description, start_at, end_at, duration_seconds, is_billable, billable_rate_snapshot,
       cost_rate_snapshot, approval_status, timezone, deleted_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, ?, 'draft', 'UTC', NULL, ?)`,
    [
      id,
      db.workspaceId,
      db.userId,
      db.userId,
      args.sessionId,
      args.parentId ?? null,
      args.projectId,
      args.taskId,
      args.kind,
      args.source,
      args.description,
      args.startAt,
      args.isBillable ? 1 : 0,
      args.billableRate,
      args.costRate,
      args.startAt,
    ],
  );
  for (const tagId of args.tagIds ?? []) {
    db.run(`INSERT INTO time_entry_tags (time_entry_id, tag_id) VALUES (?, ?)`, [id, tagId]);
  }
  return id;
}

function copyTags(db: TimerEngineDb, fromEntryId: string, toEntryId: string): void {
  db.run(
    `INSERT INTO time_entry_tags (time_entry_id, tag_id)
     SELECT ?, tag_id FROM time_entry_tags WHERE time_entry_id = ?`,
    [toEntryId, fromEntryId],
  );
}

export function startTimer(db: TimerEngineDb, input: StartTimerInput): string {
  const existing = db.get<{ id: string }>(
    `SELECT id FROM timer_sessions
     WHERE workspace_id = ? AND user_id = ? AND status IN ('running', 'paused', 'on_break')`,
    [db.workspaceId, db.userId],
  );
  if (existing) throw new Error("User already has an open timer");

  const at = input.at ?? db.now();
  const atIso = at.toISOString();
  const billable = input.isBillable ?? true;
  const billableRate = billable ? db.resolveBillableRate(input.projectId ?? null, input.taskId ?? null, at) : "0";
  const costRate = db.resolveCostRate(at);
  const sessionId = db.newId();

  db.run(
    `INSERT INTO timer_sessions (
       id, workspace_id, user_id, status, description, project_id, task_id, is_billable,
       billable_rate_snapshot, cost_rate_snapshot, timezone, started_at, stopped_at, created_at
     ) VALUES (?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, 'UTC', ?, NULL, ?)`,
    [
      sessionId,
      db.workspaceId,
      db.userId,
      input.description.trim(),
      input.projectId ?? null,
      input.taskId ?? null,
      billable ? 1 : 0,
      billableRate,
      costRate,
      atIso,
      atIso,
    ],
  );

  insertEntry(db, {
    sessionId,
    kind: "work",
    source: "timer",
    description: input.description.trim(),
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
    isBillable: billable,
    billableRate,
    costRate,
    startAt: atIso,
    tagIds: input.tagIds,
  });

  db.audit("time_entry.started", "timer_session", sessionId, { description: input.description.trim() });
  return sessionId;
}

export function pauseTimer(db: TimerEngineDb, at: Date = db.now()): void {
  const session = requireOpenSession(db);
  if (session.status === "paused") return;
  const atIso = at.toISOString();
  const live = runningEntry(db, session.id);
  if (live) closeEntry(db, live.id, live.start_at, atIso);
  db.run(`UPDATE timer_sessions SET status = 'paused' WHERE id = ?`, [session.id]);
  db.audit("timer.paused", "timer_session", session.id);
}

export function resumeTimer(db: TimerEngineDb, at: Date = db.now()): void {
  const session = requireOpenSession(db);
  if (session.status === "running") return;
  if (session.status === "on_break") throw new Error("End the break before resuming work");
  const atIso = at.toISOString();
  db.run(`UPDATE timer_sessions SET status = 'running' WHERE id = ?`, [session.id]);
  insertEntry(db, {
    sessionId: session.id,
    kind: "work",
    source: "timer",
    description: session.description,
    projectId: session.project_id,
    taskId: session.task_id,
    isBillable: session.is_billable === 1,
    billableRate: session.billable_rate_snapshot,
    costRate: session.cost_rate_snapshot,
    startAt: atIso,
  });
  db.audit("timer.resumed", "timer_session", session.id);
}

export function startBreak(db: TimerEngineDb, at: Date = db.now()): void {
  const session = requireOpenSession(db);
  if (session.status === "on_break") return;
  const atIso = at.toISOString();
  const live = runningEntry(db, session.id);
  if (live) closeEntry(db, live.id, live.start_at, atIso);
  db.run(`UPDATE timer_sessions SET status = 'on_break' WHERE id = ?`, [session.id]);
  insertEntry(db, {
    sessionId: session.id,
    kind: "break",
    source: "timer",
    description: "Break",
    projectId: session.project_id,
    taskId: session.task_id,
    isBillable: false,
    billableRate: "0",
    costRate: session.cost_rate_snapshot,
    startAt: atIso,
  });
  db.audit("timer.break_started", "timer_session", session.id);
}

export function endBreak(db: TimerEngineDb, at: Date = db.now()): void {
  const session = requireOpenSession(db);
  if (session.status !== "on_break") throw new Error("Timer is not on a break");
  const atIso = at.toISOString();
  const live = runningEntry(db, session.id);
  if (live) closeEntry(db, live.id, live.start_at, atIso);
  db.run(`UPDATE timer_sessions SET status = 'running' WHERE id = ?`, [session.id]);
  insertEntry(db, {
    sessionId: session.id,
    kind: "work",
    source: "timer",
    description: session.description,
    projectId: session.project_id,
    taskId: session.task_id,
    isBillable: session.is_billable === 1,
    billableRate: session.billable_rate_snapshot,
    costRate: session.cost_rate_snapshot,
    startAt: atIso,
  });
  db.audit("timer.break_ended", "timer_session", session.id);
}

export function stopTimer(db: TimerEngineDb, at: Date = db.now()): void {
  const session = requireOpenSession(db);
  const atIso = at.toISOString();
  const live = runningEntry(db, session.id);
  if (live) closeEntry(db, live.id, live.start_at, atIso);
  db.run(`UPDATE timer_sessions SET status = 'stopped', stopped_at = ? WHERE id = ?`, [atIso, session.id]);
  db.audit("time_entry.stopped", "timer_session", session.id);
}

export function splitTimer(db: TimerEngineDb, at: Date = db.now()): string {
  const session = requireOpenSession(db);
  if (session.status !== "running") throw new Error("Split requires a running work timer");
  const live = runningEntry(db, session.id);
  if (!live || live.kind !== "work") throw new Error("Split requires a running work entry");
  const atIso = at.toISOString();
  if (Date.parse(atIso) <= Date.parse(live.start_at)) throw new Error("Split time must be after the entry start");
  closeEntry(db, live.id, live.start_at, atIso);
  const nextId = insertEntry(db, {
    sessionId: session.id,
    kind: "work",
    source: "split",
    description: session.description,
    projectId: session.project_id,
    taskId: session.task_id,
    isBillable: session.is_billable === 1,
    billableRate: session.billable_rate_snapshot,
    costRate: session.cost_rate_snapshot,
    startAt: atIso,
    parentId: live.id,
  });
  copyTags(db, live.id, nextId);
  db.audit("time_entry.split", "time_entry", live.id, { next_id: nextId });
  return nextId;
}

export function sessionElapsedSeconds(db: TimerEngineDb, sessionId: string, at: Date = db.now()): number {
  const completed = db.get<{ total: number }>(
    `SELECT COALESCE(SUM(duration_seconds), 0) AS total
     FROM time_entries
     WHERE session_id = ? AND kind = 'work' AND end_at IS NOT NULL AND deleted_at IS NULL`,
    [sessionId],
  );
  const live = db.get<{ start_at: string; kind: EntryKind }>(
    `SELECT start_at, kind FROM time_entries
     WHERE session_id = ? AND end_at IS NULL AND deleted_at IS NULL`,
    [sessionId],
  );
  let total = Number(completed?.total ?? 0);
  if (live?.kind === "work") {
    total += Math.max(0, Math.floor((at.getTime() - Date.parse(live.start_at)) / 1000));
  }
  return total;
}

export function breakElapsedSeconds(db: TimerEngineDb, sessionId: string, at: Date = db.now()): number {
  const live = db.get<{ start_at: string; kind: EntryKind }>(
    `SELECT start_at, kind FROM time_entries
     WHERE session_id = ? AND end_at IS NULL AND deleted_at IS NULL`,
    [sessionId],
  );
  if (live?.kind !== "break") return 0;
  return Math.max(0, Math.floor((at.getTime() - Date.parse(live.start_at)) / 1000));
}
