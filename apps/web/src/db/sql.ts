import type { BindParams, Database, SqlValue } from "sql.js";

export type SqlParam = string | number | null;

export interface SqlDatabase {
  run(sql: string, params?: SqlParam[]): void;
  all<T = Record<string, SqlValue>>(sql: string, params?: SqlParam[]): T[];
  get<T = Record<string, SqlValue>>(sql: string, params?: SqlParam[]): T | undefined;
  exec(sql: string): void;
  export(): Uint8Array;
}

export function wrapSqlJs(db: Database): SqlDatabase {
  const api: SqlDatabase = {
    run(sql, params) {
      db.run(sql, (params ?? []) as BindParams);
    },
    all(sql, params) {
      const stmt = db.prepare(sql);
      try {
        if (params) stmt.bind(params as BindParams);
        const rows: Record<string, SqlValue>[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows as never;
      } finally {
        stmt.free();
      }
    },
    get(sql, params) {
      return api.all(sql, params)[0] as never;
    },
    exec(sql) {
      db.exec(sql);
    },
    export() {
      return db.export();
    },
  };
  return api;
}
