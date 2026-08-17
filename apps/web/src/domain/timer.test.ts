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
});
