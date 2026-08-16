import initSqlJs, { type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { wrapSqlJs, type SqlDatabase } from "./sql";
import { loadPersistedDb } from "./persist";

let sqlJs: SqlJsStatic | null = null;

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (sqlJs) return sqlJs;
  sqlJs = await initSqlJs({ locateFile: () => wasmUrl });
  return sqlJs;
}

export async function openSqlite(): Promise<SqlDatabase> {
  const SQL = await loadSqlJs();
  const saved = await loadPersistedDb();
  const db = saved ? new SQL.Database(saved) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  return wrapSqlJs(db);
}

export async function createMemorySqlite(): Promise<SqlDatabase> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  return wrapSqlJs(db);
}
