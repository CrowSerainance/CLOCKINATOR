import type { Database, SqlJsStatic } from "sql.js";
import { wrapSqlJs, type SqlDatabase } from "./sql";
import { loadPersistedDb } from "./persist";

let sqlJs: SqlJsStatic | null = null;

function resolveInit(mod: unknown): (config?: object) => Promise<SqlJsStatic> {
  if (typeof mod === "function") return mod as (config?: object) => Promise<SqlJsStatic>;
  if (mod && typeof mod === "object" && "default" in mod && typeof (mod as { default: unknown }).default === "function") {
    return (mod as { default: (config?: object) => Promise<SqlJsStatic> }).default;
  }
  throw new Error("sql.js did not export an initializer");
}

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (sqlJs) return sqlJs;
  // sql-asm.js is CJS and needs no WASM file. The package "browser" export
  // (sql-wasm-browser.js) has no ESM default and blanks the page on import.
  const mod = await import("sql.js/dist/sql-asm.js");
  sqlJs = await resolveInit(mod)();
  return sqlJs;
}

export async function openSqlite(): Promise<SqlDatabase> {
  const SQL = await loadSqlJs();
  const saved = await loadPersistedDb();
  const db = saved ? new SQL.Database(saved) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  return wrapSqlJs(db as Database);
}

export async function createMemorySqlite(): Promise<SqlDatabase> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  return wrapSqlJs(db as Database);
}
