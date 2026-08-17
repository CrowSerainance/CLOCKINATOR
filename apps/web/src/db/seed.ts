import { addDays, nowIso, startOfLocalDay } from "../domain/duration";
import { IDS } from "./ids";
import type { SqlDatabase, SqlParam } from "./sql";

function run(db: SqlDatabase, sql: string, params: SqlParam[] = []): void {
  db.run(sql, params);
}

function insertRate(
  db: SqlDatabase,
  id: string,
  subjectType: string,
  subjectId: string,
  kind: string,
  amount: string,
  at: string,
): void {
  run(
    db,
    `INSERT INTO rate_history (id, workspace_id, subject_type, subject_id, rate_kind, amount, currency, effective_from, effective_to, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, NULL, ?)`,
    [id, IDS.workspace, subjectType, subjectId, kind, amount, at, at],
  );
}

export function seedIfEmpty(db: SqlDatabase, at: Date = new Date()): { workspaceId: string; userId: string } {
  const existing = db.get<{ id: string; user_id: string }>(
    `SELECT w.id, u.id AS user_id
     FROM workspaces w
     JOIN users u ON u.workspace_id = w.id
     ORDER BY w.created_at
     LIMIT 1`,
  );
  if (existing) {
    ensureDenseDemo(db, at);
    return { workspaceId: existing.id, userId: existing.user_id };
  }

  const created = nowIso(at);
  const ws = IDS.workspace;
  const user = IDS.user;

  run(db, `INSERT INTO workspaces (id, name, default_billable_rate, default_cost_rate, currency, timezone, created_at)
           VALUES (?, 'Northwind Studio', '25.00', '0', 'USD', 'UTC', ?)`, [ws, created]);
  run(db, `INSERT INTO users (id, workspace_id, name, email, default_cost_rate, role, created_at)
           VALUES (?, ?, 'Maya Chen', 'maya@northwind.test', '10.00', 'owner', ?)`, [user, ws, created]);

  const clients: Array<[string, string]> = [
    [IDS.clients.lumen, "Lumen Health"],
    [IDS.clients.acme, "Acme Corp"],
    [IDS.clients.riverside, "Riverside Co"],
    [IDS.clients.internal, "Internal"],
  ];
  for (const [id, name] of clients) {
    run(db, `INSERT INTO clients (id, workspace_id, name, archived, created_at) VALUES (?, ?, ?, 0, ?)`, [id, ws, name, created]);
  }

  const projects: Array<[string, string, string, string, number, string | null, string | null, string, number, number]> = [
    [IDS.projects.mobile, "Mobile App v2", IDS.clients.lumen, "#57b6b0", 1, "160.00", "120", "active", 0, 1],
    [IDS.projects.brand, "Brand Refresh", IDS.clients.acme, "#5bbd7e", 1, "145.00", "60", "active", 0, 0],
    [IDS.projects.marketing, "Marketing Site", IDS.clients.riverside, "#e0b15c", 1, "130.00", "40", "active", 0, 0],
    [IDS.projects.designSystem, "Design System", IDS.clients.internal, "#b58fd6", 0, null, null, "active", 1, 0],
    [IDS.projects.research, "Research & Discovery", IDS.clients.lumen, "#7aa6e0", 1, "120.00", "24", "active", 1, 1],
    [IDS.projects.qa, "QA & Bugfixes", IDS.clients.acme, "#e08585", 1, "110.00", "20", "on_hold", 0, 0],
  ];
  for (const [id, name, clientId, color, billable, rate, estimate, status, accessPrivate, favorite] of projects) {
    run(
      db,
      `INSERT INTO projects (id, workspace_id, client_id, name, color, status, access, is_billable, is_favorite, billable_rate, estimated_hours, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, ws, clientId, name, color, status, accessPrivate ? "private" : "public", billable, favorite, rate, estimate, created],
    );
    if (rate) insertRate(db, `rate_${id}_billable`, "project", id, "billable", rate, created);
  }

  insertRate(db, "rate_ws_billable", "workspace", ws, "billable", "25.00", created);
  insertRate(db, "rate_user_cost", "user", user, "cost", "10.00", created);

  run(
    db,
    `INSERT INTO tasks (id, workspace_id, project_id, name, billable_rate, status, created_at)
     VALUES (?, ?, ?, 'Hi-fi mockups', '175.00', 'active', ?)`,
    [IDS.tasks.hifi, ws, IDS.projects.mobile, created],
  );
  insertRate(db, "rate_task_hifi", "task", IDS.tasks.hifi, "billable", "175.00", created);

  seedTags(db, created);
  ensureDenseDemo(db, at);

  run(
    db,
    `INSERT INTO audit_logs (id, workspace_id, actor_user_id, action, target_type, target_id, reason, metadata_json, created_at)
     VALUES (?, ?, ?, 'workspace.seeded', 'workspace', ?, NULL, '{"source":"demo"}', ?)`,
    ["aud_seed", ws, user, ws, created],
  );

  return { workspaceId: ws, userId: user };
}

function seedTags(db: SqlDatabase, created: string): void {
  const tags: Array<[string, string, string]> = [
    [IDS.tags.design, "Design", "#57b6b0"],
    [IDS.tags.research, "Research", "#b58fd6"],
    [IDS.tags.meeting, "Meeting", "#7aa6e0"],
    [IDS.tags.frontend, "Frontend", "#e0b15c"],
    [IDS.tags.planning, "Planning", "#5bbd7e"],
    [IDS.tags.review, "Review", "#e08585"],
  ];
  for (const [id, name, color] of tags) {
    run(db, `INSERT OR IGNORE INTO tags (id, workspace_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)`, [
      id,
      IDS.workspace,
      name,
      color,
      created,
    ]);
  }
}

type DemoSlot = {
  startH: number;
  startM: number;
  endH: number;
  endM: number;
  projectId: string;
  taskId: string | null;
  tagId: string | null;
  description: string;
  billable: boolean;
  rate: string;
  approval?: "draft" | "submitted" | "approved";
};

const WEEKDAY_SLOTS: Record<number, DemoSlot[]> = {
  1: [
    {
      startH: 9,
      startM: 15,
      endH: 11,
      endM: 42,
      projectId: IDS.projects.mobile,
      taskId: IDS.tasks.hifi,
      tagId: IDS.tags.design,
      description: "Checkout flow hi-fi mockups",
      billable: true,
      rate: "175.00",
    },
    {
      startH: 13,
      startM: 0,
      endH: 16,
      endM: 10,
      projectId: IDS.projects.mobile,
      taskId: null,
      tagId: IDS.tags.frontend,
      description: "Account settings states",
      billable: true,
      rate: "160.00",
      approval: "submitted",
    },
  ],
  2: [
    {
      startH: 9,
      startM: 0,
      endH: 10,
      endM: 0,
      projectId: IDS.projects.qa,
      taskId: null,
      tagId: IDS.tags.review,
      description: "Bug triage",
      billable: true,
      rate: "110.00",
    },
    {
      startH: 10,
      startM: 15,
      endH: 12,
      endM: 0,
      projectId: IDS.projects.mobile,
      taskId: null,
      tagId: IDS.tags.meeting,
      description: "Sprint planning + standup",
      billable: true,
      rate: "160.00",
    },
    {
      startH: 13,
      startM: 30,
      endH: 17,
      endM: 0,
      projectId: IDS.projects.research,
      taskId: null,
      tagId: IDS.tags.research,
      description: "Checkout usability notes",
      billable: true,
      rate: "120.00",
    },
  ],
  3: [
    {
      startH: 9,
      startM: 30,
      endH: 11,
      endM: 45,
      projectId: IDS.projects.designSystem,
      taskId: null,
      tagId: IDS.tags.research,
      description: "Component audit & cleanup",
      billable: false,
      rate: "0",
    },
    {
      startH: 13,
      startM: 0,
      endH: 16,
      endM: 30,
      projectId: IDS.projects.brand,
      taskId: null,
      tagId: IDS.tags.design,
      description: "Brand type ramp + color tokens",
      billable: true,
      rate: "145.00",
    },
  ],
  4: [
    {
      startH: 9,
      startM: 0,
      endH: 12,
      endM: 15,
      projectId: IDS.projects.marketing,
      taskId: null,
      tagId: IDS.tags.frontend,
      description: "Marketing site hero section",
      billable: true,
      rate: "130.00",
    },
    {
      startH: 13,
      startM: 30,
      endH: 16,
      endM: 0,
      projectId: IDS.projects.mobile,
      taskId: IDS.tasks.hifi,
      tagId: IDS.tags.design,
      description: "Payment error empty states",
      billable: true,
      rate: "175.00",
      approval: "approved",
    },
  ],
  5: [
    {
      startH: 9,
      startM: 0,
      endH: 10,
      endM: 30,
      projectId: IDS.projects.mobile,
      taskId: null,
      tagId: IDS.tags.planning,
      description: "Week planning + estimates",
      billable: true,
      rate: "160.00",
    },
    {
      startH: 11,
      startM: 0,
      endH: 15,
      endM: 45,
      projectId: IDS.projects.marketing,
      taskId: null,
      tagId: IDS.tags.frontend,
      description: "Pricing page layout",
      billable: true,
      rate: "130.00",
    },
  ],
  6: [
    {
      startH: 10,
      startM: 0,
      endH: 12,
      endM: 20,
      projectId: IDS.projects.research,
      taskId: null,
      tagId: IDS.tags.research,
      description: "Interview synthesis",
      billable: true,
      rate: "120.00",
    },
  ],
};

/** Fill ~4 weeks of weekday history so Tracker / Reports / Timesheet are not empty. Safe on existing DBs. */
export function ensureDenseDemo(db: SqlDatabase, at: Date = new Date()): void {
  seedTags(db, nowIso(at));
  const today = startOfLocalDay(at);
  for (let offset = 0; offset < 28; offset++) {
    const day = addDays(today, -offset);
    const slots = WEEKDAY_SLOTS[day.getDay()] ?? [];
    slots.forEach((slot, index) => {
      const start = atOffset(day, slot.startH, slot.startM);
      const end = atOffset(day, slot.endH, slot.endM);
      const id = `demo_${ymd(day)}_${index}`;
      seedEntry(db, id, slot.projectId, slot.taskId, slot.tagId, slot.description, slot.billable, slot.rate, start, end, undefined, slot.approval ?? "draft");
    });
  }
}

function ymd(day: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${day.getFullYear()}${pad(day.getMonth() + 1)}${pad(day.getDate())}`;
}

function atOffset(day: Date, hours: number, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
}

function seedEntry(
  db: SqlDatabase,
  id: string,
  projectId: string,
  taskId: string | null,
  tagId: string | null,
  description: string,
  billable: boolean,
  rate: string,
  start: Date,
  end: Date,
  durationOverride?: number,
  approval: string = "draft",
): void {
  const startIso = nowIso(start);
  const endIso = nowIso(end);
  const duration = durationOverride ?? Math.floor((end.getTime() - start.getTime()) / 1000);
  run(
    db,
    `INSERT OR IGNORE INTO time_entries (
       id, workspace_id, user_id, created_by_user_id, session_id, parent_entry_id, project_id, task_id,
       kind, source, description, start_at, end_at, duration_seconds, is_billable, billable_rate_snapshot,
       cost_rate_snapshot, approval_status, timezone, deleted_at, created_at
     ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 'work', 'web', ?, ?, ?, ?, ?, ?, '10.00', ?, 'UTC', NULL, ?)`,
    [
      id,
      IDS.workspace,
      IDS.user,
      IDS.user,
      projectId,
      taskId,
      description,
      startIso,
      endIso,
      duration,
      billable ? 1 : 0,
      rate,
      approval,
      startIso,
    ],
  );
  if (tagId) {
    run(db, `INSERT OR IGNORE INTO time_entry_tags (time_entry_id, tag_id) VALUES (?, ?)`, [id, tagId]);
  }
}
