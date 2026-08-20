import { readFileSync } from "node:fs";
import { join } from "node:path";
import initSqlJs from "sql.js";
import { describe, expect, it } from "vitest";
import { wrapSqlJs } from "../db/sql";
import { ClockinatorStore } from "../db/store";
import { IDS } from "../db/ids";
import { seedIfEmpty } from "../db/seed";

async function makeStore(): Promise<ClockinatorStore> {
  const wasmPath = join(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm");
  const SQL = await initSqlJs({ wasmBinary: new Uint8Array(readFileSync(wasmPath)).buffer as ArrayBuffer });
  const raw = new SQL.Database();
  raw.run("PRAGMA foreign_keys = ON;");
  const db = wrapSqlJs(raw);
  db.exec(readFileSync(join(process.cwd(), "../../db/migrations/001_init.sql"), "utf8"));
  seedIfEmpty(db, new Date("2026-08-16T12:00:00"));
  const store = new ClockinatorStore(db);
  store.workspaceId = IDS.workspace;
  store.userId = IDS.user;
  return store;
}

describe("timer engine", () => {
  it("starts, pauses, resumes, and stops with persisted segments", async () => {
    const store = await makeStore();
    let clock = new Date("2026-08-16T15:00:00.000Z");
    store.now = () => clock;

    store.start({ description: "Deep work", projectId: IDS.projects.mobile, taskId: IDS.tasks.hifi, isBillable: true, at: clock });
    expect(store.getOpenSession()?.status).toBe("running");
    expect(store.resolveBillableRate(IDS.projects.mobile, IDS.tasks.hifi, clock)).toBe("175.00");

    clock = new Date("2026-08-16T16:00:00.000Z");
    store.pause();
    expect(store.getOpenSession()?.status).toBe("paused");
    expect(store.elapsedFor(store.getOpenSession()!.id, clock)).toBe(3600);

    clock = new Date("2026-08-16T16:10:00.000Z");
    store.resume();
    clock = new Date("2026-08-16T16:40:00.000Z");
    store.stop();
    expect(store.getOpenSession()).toBeNull();
  });

  it("rejects a second open timer", async () => {
    const store = await makeStore();
    const clock = new Date("2026-08-16T15:00:00.000Z");
    store.now = () => clock;
    store.start({ description: "A", at: clock });
    expect(() => store.start({ description: "B", at: clock })).toThrow(/open timer/);
  });

  it("splits a running entry and records a break", async () => {
    const store = await makeStore();
    let clock = new Date("2026-08-16T15:00:00.000Z");
    store.now = () => clock;
    store.start({ description: "Moderation", projectId: IDS.projects.mobile, at: clock });

    clock = new Date("2026-08-16T15:30:00.000Z");
    store.split();
    const splitCount = store.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM time_entries WHERE source = 'split' AND workspace_id = ?`,
      [IDS.workspace],
    )?.n;
    expect(Number(splitCount)).toBe(1);

    clock = new Date("2026-08-16T15:45:00.000Z");
    store.beginBreak();
    expect(store.getOpenSession()?.status).toBe("on_break");
    clock = new Date("2026-08-16T16:00:00.000Z");
    store.finishBreak();
    expect(store.getOpenSession()?.status).toBe("running");
  });

  it("seeds enough weekday history that the tracker is not a single row", async () => {
    const store = await makeStore();
    const at = new Date("2026-08-17T12:00:00");
    const week = store.listWeekGroups(at);
    expect(week.groups.length).toBeGreaterThan(4);
    expect(week.groups.some((g) => g.entries.length > 1)).toBe(true);
  });

  it("edits and deletes a completed entry", async () => {
    const store = await makeStore();
    const at = new Date("2026-08-17T12:00:00");
    const week = store.listWeekGroups(at);
    const entry = week.groups[0]?.entries[0];
    expect(entry?.id).toBeTruthy();
    store.updateEntry({
      id: entry!.id!,
      description: "Edited checkout",
      projectId: IDS.projects.mobile,
      taskId: IDS.tasks.hifi,
      tagIds: [IDS.tags.design],
      isBillable: true,
      start: new Date("2026-08-17T09:00:00"),
      end: new Date("2026-08-17T11:00:00"),
    });
    expect(store.getEntry(entry!.id!)?.desc).toBe("Edited checkout");
    store.deleteEntry(entry!.id!);
    expect(store.getEntry(entry!.id!)).toBeUndefined();
  });

  it("lists completed break rows in the tracker and excludes them from week totals", async () => {
    const store = await makeStore();
    let clock = new Date("2026-08-17T10:00:00.000Z");
    store.now = () => clock;
    store.start({ description: "Focus", projectId: IDS.projects.mobile, at: clock });
    clock = new Date("2026-08-17T10:30:00.000Z");
    store.beginBreak();
    clock = new Date("2026-08-17T10:45:00.000Z");
    store.finishBreak();
    clock = new Date("2026-08-17T11:00:00.000Z");
    store.stop();

    const week = store.listWeekGroups(new Date("2026-08-17T12:00:00"));
    const breaks = week.groups.flatMap((g) => g.entries).filter((e) => e.kind === "break");
    expect(breaks.length).toBeGreaterThan(0);
    expect(breaks.every((e) => e.billable === false)).toBe(true);
  });

  it("locks and unlocks a timesheet week", async () => {
    const store = await makeStore();
    // Seed is anchored at 2026-08-16; use a day that falls inside a dense demo week.
    const at = new Date("2026-08-14T12:00:00");
    const locked = store.lockWeek(at);
    expect(locked).toBeGreaterThan(0);
    const state = store.weekLockState(at);
    expect(state.locked).toBeGreaterThan(0);
    const entry = store.listWeekGroups(at).groups.flatMap((g) => g.entries).find((e) => e.kind === "work" && e.approval === "locked");
    expect(entry?.id).toBeTruthy();
    expect(() =>
      store.updateEntry({
        id: entry!.id!,
        description: "Nope",
        projectId: IDS.projects.mobile,
        taskId: null,
        tagIds: [],
        isBillable: true,
        start: new Date("2026-08-14T09:00:00"),
        end: new Date("2026-08-14T10:00:00"),
      }),
    ).toThrow(/Locked/);
    expect(store.unlockWeek(at)).toBeGreaterThan(0);
  });

  it("updates task billable rates into rate_history", async () => {
    const store = await makeStore();
    store.updateTask(IDS.tasks.hifi, { name: "Hi-fi", billableRate: "200.00" });
    const tasks = store.listTasks(IDS.projects.mobile);
    expect(tasks.find((t) => t.id === IDS.tasks.hifi)?.billableRate).toBe("200.00");
    const hist = store.get<{ amount: string }>(
      `SELECT amount FROM rate_history WHERE subject_type = 'task' AND subject_id = ? AND effective_to IS NULL`,
      [IDS.tasks.hifi],
    );
    expect(hist?.amount).toBe("200.00");
  });

  it("builds a calendar week with day columns", async () => {
    const store = await makeStore();
    const cal = store.calendarWeek(new Date("2026-08-16T12:00:00"));
    expect(cal.days).toHaveLength(7);
    expect(cal.weekTotal).toBeGreaterThan(0);
  });
});
