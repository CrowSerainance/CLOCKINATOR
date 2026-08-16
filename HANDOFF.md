# Clockinator — LLM hand-off

Read this before changing anything. Short rules live in [`AGENTS.md`](./AGENTS.md).

**Workspace:** `C:\Clockify`  
**Git repo:** `C:\Clockify\CLOCKINATOR-main` (branch `main`)  
**Updated:** 16 Aug 2026 — local-first SQLite data layer, timer engine (pause/split/breaks), Reports CSV/PDF.

This is a **Clockify-inspired self-hosted / local-first time-ops product**, not a Clockify clone. Do not copy vendor UI, chrome, copy, or implementation. Match *capabilities* using Clockinator’s own design.

---

## 1. What this product is

Clockinator: timers, manual entries, projects/clients/tasks/tags, timesheets, reports, approvals, billing-oriented rates. Branding is original:

| Token | Value |
|---|---|
| App name | Clockinator |
| Fonts | Hanken Grotesk + JetBrains Mono |
| Accent | `#5bbd7e` on warm dark (`#1c1a18`) |
| Tokens | `apps/web/src/theme.ts` and `apps/web/src/styles.css` |

Visual target for the **six designed screens** is `design/Clockinator.html`. Clockify screenshots are **behavior references only**.

### Architecture (current)

**Local-first.** The web app is the running product:

- SQLite in the browser via `sql.js` (WASM)
- Full DB bytes persisted to IndexedDB (`clockinator` / store `sqlite` / key `main`)
- Canonical schema in `db/migrations/*.sql` (same files a future Tauri/`better-sqlite3` adapter must run)
- Timer rules live in TypeScript (`apps/web/src/domain/timer.ts`) on top of that schema

Python `apps/api/timeops_core` is the original in-memory rules sketch. Keep its 10 tests green. Do **not** add a second competing timer implementation there unless you are porting a rule that the TS engine is missing. HTTP sync is later; do not block UI on FastAPI.

Desktop path (not scaffolded): Tauri or Electron wrapping this renderer, swapping `apps/web/src/db/client.ts` for a native SQLite file adapter that executes the same migrations.

### Non-goals (until the core loop is solid)

- Pixel-parity with Clockify
- Calendar, Dashboard, Kiosk, GPS, screenshots, SSO/SCIM, scheduling, time off, expenses
- Publishing Clockify screenshots (`design/references/` is gitignored)

Invoice **tables** exist in SQLite. Invoice **UI** is not started.

---

## 2. Repo map

```txt
CLOCKINATOR-main/
  db/migrations/001_init.sql   # canonical SQLite schema
  db/README.md
  apps/web/                    # Vite + React + TS, local-first
    src/db/                    # sql.js client, migrate, seed, store
    src/domain/                # timer, rates, duration, reports
    src/hooks/useTimer.ts      # React timer hook
    src/hooks/useClockinator.tsx
    src/screens/TimeTracker.tsx
    src/screens/Projects.tsx
    src/screens/Reports.tsx
  apps/api/timeops_core/       # Python in-memory domain (tests only for now)
  design/Clockinator.html
  tests/test_timeops_core.py
```

---

## 3. What already works vs what does not

### Local-first web (source of truth)

| Capability | Status |
|---|---|
| SQLite schema + migrations | Yes — `db/migrations/001_init.sql` |
| Persist across refresh | Yes — IndexedDB dump of the sqlite file |
| Timer start / stop | Yes |
| Pause / resume | Yes — closes/opens work segments on one session |
| Split | Yes — `source='split'`, `parent_entry_id` |
| Breaks | Yes — `time_entries.kind='break'`, session `on_break` |
| One open session per user | Yes — partial unique index |
| Rate hierarchy task → project → workspace | Yes — snapshotted on the session/entry |
| Historic rates | Yes — `rate_history`; used for backdated resolve |
| Time Tracker composer + live bar | Yes |
| Projects list / favorite / create (prompt) | Yes — live tracked hours from entries |
| Reports range + group-by project | Yes |
| CSV export | Yes — local download |
| PDF export | Yes — minimal Helvetica text PDF (no PDF kit) |
| Invoices / custom fields | Schema only |
| Timesheet / Approvals / Audit screens | Placeholders |
| Tag picker on composer | Missing (tags exist; seed uses them on sample entries) |
| Native desktop SQLite | Not started |

### Python domain — still tested, not wired to the UI

`TimeOpsService`: start/stop (no pause/split/break), manual entries, weekly summary, monthly income, CSV, project summaries, audit for timer + project status. **10 tests passing.** In-memory only.

### Clockify reference → Clockinator

| Reference | Clockinator now | Next |
|---|---|---|
| Time Tracker composer + START | Wired | Tag picker, manual entry editor |
| Pause / split / breaks | Wired | Show break rows in the week list (currently work-only) |
| Projects table | Live from SQLite | Filters, search, edit modal (create is `prompt`) |
| Reports summary | Totals + group table + CSV/PDF | Charts, group-by description |
| Calendar | Absent | After Timesheet |
| Paid 49-feature grid | Schema footholds: historic rates, invoices, custom fields, audit | Do not start SSO/GPS/kiosk |

---

## 4. How to run

```bash
cd C:\Clockify\CLOCKINATOR-main
python -m unittest discover -s tests

cd apps/web
npm install
npm run dev      # http://localhost:5173
npm test         # vitest: rates + timer engine
npm run build
```

Reset local data: DevTools → Application → IndexedDB → delete `clockinator`. Next load re-seeds Northwind Studio.

Python **3.12+**. Web: React 18, Vite 5, TypeScript, sql.js, **no router, no UI kit, inline styles**.

---

## 5. Conventions (do not regress)

1. **Original UI.** Warm dark + green. No Clockify blue chrome, no “UPGRADE” / “Book a demo”.
2. **Schema is canonical.** New tables/columns = a new file in `db/migrations/` (002_….sql) and an entry in `apps/web/src/db/migrate.ts`. Do not invent a parallel IndexedDB object-store model.
3. **Rates snapshot at write time.** Never reprice historical `time_entries` when a project rate changes. Close the open `rate_history` row and insert a new one.
4. **One open timer session per user** (`running` | `paused` | `on_break`).
5. **Pause vs break.** Pause = untracked gap. Break = `kind='break'` row (not billable).
6. **Do not commit `design/references/`** or `.env`.
7. **Inline styles + existing tokens.** No Tailwind/MUI unless a human asks.
8. **Do not reintroduce `src/data/sample.ts` as live data.** Seed lives in `src/db/seed.ts`.
9. **Screen switch** is `useState<Screen>` in `App.tsx`.
10. **Tests:** Python unittest stays green. New timer/rate behavior gets a vitest in `apps/web/src/domain/*.test.ts`.

---

## 6. Parallel work streams (claim one)

### Done (do not redo)

- Local SQLite + IndexedDB persist (`src/db/*`, `db/migrations/001_init.sql`)
- `useTimer` + Time Tracker start/pause/resume/stop/split/break
- Reports v1 + CSV/PDF
- Projects read from SQLite (favorite + prompt-create)

### Stream C — Timesheet

Week grid from completed `time_entries`. Follow `design/Clockinator.html`.  
**Touch:** new `screens/Timesheet.tsx`, `App.tsx`. Reuse `listWeekGroups` / `report()`.

### Stream E2 — Projects CRUD (real form)

Replace `window.prompt`. Fields: name, client, color, billable rate (writes `rate_history`), estimate, access.  
**Touch:** `screens/Projects.tsx`, `store.ts`.

### Stream G — Approvals + Audit UI

`submit` / `approve` / `reject` / `lock` on `time_entries.approval_status` + `audit_logs` screen. Schema already has the columns.

### Stream H — Tag picker + entry edit

Composer tag multi-select; edit description/project on completed rows; show break segments in the tracker list.

### Stream I — Native desktop adapter

Tauri (preferred) or Electron. Implement `SqliteAdapter` against a file; run `db/migrations`. Do not fork the schema.

### Stream A — HTTP / sync (later)

Only after local-first is boringly solid. Optional FastAPI wrapping Python or a sync dump of SQLite. Do not make the web depend on it.

### Do not start

Calendar, kiosk, GPS, SSO, invoicing UI, Clockify-identical chrome.

---

## 7. Timer engine contract

`apps/web/src/domain/timer.ts` + `hooks/useTimer.ts`

| Action | Effect |
|---|---|
| `start` | Insert `timer_sessions` (`running`) + open `kind=work` entry (`end_at` NULL). Snapshot rates. |
| `pause` | Close running entry. Session `paused`. |
| `resume` | New work entry. Session `running`. Illegal while `on_break`. |
| `beginBreak` | Close work. Open `kind=break`. Session `on_break`. |
| `finishBreak` | Close break. Open work. Session `running`. |
| `split` | Close work at now, open new work (`source=split`). Requires `running`. |
| `stop` | Close live entry. Session `stopped`. |

Elapsed work = sum of completed work durations + live work period. Break clock is separate.

---

## 8. Definition of done for a stream

- Tests for new domain behavior (vitest and/or Python)
- UI uses Clockinator tokens
- New SQL in `db/migrations/` if the schema changes
- Update this file when architecture or stream status changes
- Do not commit `design/references/` or secrets

---

## 9. Known landmines

- IndexedDB holds the whole sqlite file. Single-tab assumed; no `navigator.locks` yet.
- `sql.js` WASM is ~650KB. Keep it the only native-ish dep until a desktop adapter exists.
- Reports PDF is a hand-rolled one-page Helvetica file — fine for local totals, not for branded invoices.
- Python domain has **no** pause/split/break. TS is ahead. Do not “fix” the UI by calling Python.
- `RunningBar` demo (`useState(2537)`) was removed; do not bring it back.
- Project tracked hours are **real sums**, not the old mockup’s 68.2h fixtures.
- `window.prompt` for new projects is a stopgap.

---

## 10. Quick file index

| Need | File |
|---|---|
| Schema | `db/migrations/001_init.sql` |
| DB open / persist | `apps/web/src/db/open.ts`, `client.ts`, `persist.ts` |
| Queries + lists | `apps/web/src/db/store.ts` |
| Timer rules | `apps/web/src/domain/timer.ts` |
| Rate hierarchy | `apps/web/src/domain/rates.ts` |
| CSV/PDF | `apps/web/src/domain/reports.ts` |
| Hook | `apps/web/src/hooks/useTimer.ts` |
| Time Tracker | `apps/web/src/screens/TimeTracker.tsx` |
| Reports | `apps/web/src/screens/Reports.tsx` |
| Projects | `apps/web/src/screens/Projects.tsx` |
| Seed | `apps/web/src/db/seed.ts` |
| Python sketch | `apps/api/timeops_core/service.py` |
| Mockup | `design/Clockinator.html` |
