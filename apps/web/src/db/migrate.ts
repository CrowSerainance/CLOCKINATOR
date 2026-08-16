import migration001 from "@schema/migrations/001_init.sql?raw";
import type { SqlDatabase } from "./sql";

const MIGRATIONS: Array<{ version: number; name: string; sql: string }> = [
  { version: 1, name: "001_init", sql: migration001 },
];

export function applyMigrations(db: SqlDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db.all<{ version: number }>("SELECT version FROM schema_migrations").map((row) => row.version),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN;");
    try {
      db.exec(migration.sql);
      db.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", [
        migration.version,
        migration.name,
        new Date().toISOString(),
      ]);
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  }
}
