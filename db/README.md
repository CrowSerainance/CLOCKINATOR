# Clockinator data layer

Canonical SQLite schema for the local-first app. The same `.sql` files run in:

1. **Browser** — `sql.js` (WASM) with the full database persisted to IndexedDB (`apps/web/src/db`).
2. **Desktop (later)** — Tauri or Electron with `better-sqlite3` / `rusqlite`, pointing at a file under the user data dir. Do not fork this schema; add a new adapter that executes these migrations.

## Migrations

| File | What it adds |
|---|---|
| `migrations/001_init.sql` | Workspaces, users, clients, projects, tasks, tags, historic rates, timer sessions, time entries (work + break), invoices, custom fields, audit |

Apply in filename order. The web runner records versions in `schema_migrations`.

## Rules encoded in the schema

- **Rate hierarchy** (resolved in TypeScript, snapshotted onto each entry): task → project → workspace. `rate_history` is the time-varying source of truth; entity `billable_rate` / `default_*_rate` columns are the *current* value.
- **Never reprice history.** Changing a project rate closes the open `rate_history` row and inserts a new one. Existing `time_entries.billable_rate_snapshot` stay as they were.
- **One open timer session per user** (`running` | `paused` | `on_break`) via a partial unique index.
- **Pause** closes the running work entry and leaves the session paused (untracked gap).
- **Break** is a `time_entries` row with `kind = 'break'` (not billable).
- **Split** closes the current work entry and opens a new one (`source = 'split'`, `parent_entry_id` set).
