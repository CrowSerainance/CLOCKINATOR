# Clockinator — LLM hand-off

Read this before changing anything. Short rules live in [`AGENTS.md`](./AGENTS.md).

**Workspace:** `C:\Clockify`  
**Git repo:** `C:\Clockify\CLOCKINATOR-main` (branch `main`)  
**Updated:** 10 Oct 2026 — Offline plan-grid features that can run without cloud, mail, or kiosk hardware: required/custom fields, CSV import, rounding, favorite entries, bulk edit, add-time-for-others, hide time/pages, project templates, historic-rate editor, time off, expenses, targets, manager roles, recurring invoices, attendance, schedule + forecast, budgets, multiple currencies, in-app alerts, richer audit. Still skipped: kiosk, QR/photo kiosk, GPS, QuickBooks, scheduled email, data regions, SSO/SCIM/subdomain/control accounts, activity monitoring, cake.com bundle.

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

### Non-goals (cloud / hardware / chrome — do not start)

- Pixel-parity with Clockify; Clockify-identical chrome
- Dashboard, Kiosk, GPS, screenshots, photo kiosk, QR kiosk
- SSO / SCIM / custom subdomain / control accounts / QuickBooks / data regions
- Scheduling, forecasting, time off, expenses (until core local loop is boringly solid)
- Publishing Clockify screenshots (`design/references/` is gitignored)

Invoice **tables** and **UI** exist. Create drafts from billable client time; export PDF uses the shared summary layout.

---

## 2. Repo map

```txt
CLOCKINATOR-main/
  Start Clockinator.bat        # one-click launcher
  scripts/start-clockinator.ps1
  db/migrations/001_init.sql   # canonical SQLite schema
  db/README.md
  apps/web/                    # Vite + React + TS, local-first
    src/db/                    # sql.js client, migrate, seed, store
    src/domain/                # timer, rates, duration, reports
    src/hooks/useTimer.ts      # React timer hook
    src/hooks/useClockinator.tsx
    src/screens/TimeTracker.tsx
    src/screens/Timesheet.tsx
    src/screens/Calendar.tsx
    src/screens/Reports.tsx
    src/screens/Projects.tsx
    src/screens/Clients.tsx
    src/screens/Tags.tsx
    src/screens/Invoices.tsx
    src/screens/Approvals.tsx
    src/screens/AuditLog.tsx
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
| Breaks | Yes — timer + listed on tracker; day/week totals are work-only |
| One open session per user | Yes — partial unique index |
| Rate hierarchy task → project → workspace | Yes — snapshotted on the session/entry |
| Historic rates | Yes — `rate_history`; used for backdated resolve |
| Task rate editor | Yes — project form |
| Decimal duration toggle | Yes — localStorage preference |
| Time Tracker composer + live bar | Yes — tags, tasks, manual add, 14-day history, row edit, breaks |
| Projects list / favorite / create | Yes — form (client, color, rate, estimate, access, tasks) + filters + CSV |
| Clients / Tags | Yes — list + create |
| Reports range + group-by | Yes — Summary + Detailed, labor/profit, project/description grouping, bars + donut |
| CSV / PDF export | Yes — shared multi-page summary PDF (Reports + Invoices) |
| Timesheet week grid | Yes — click empty cell to add; submit week; lock/unlock week |
| Calendar week grid | Yes — positioned blocks 07:00–20:00, add/edit |
| Approvals | Yes — submit / approve / reject on `approval_status` |
| Invoices | Yes — draft from billable client time; status; PDF export |
| Audit log screen | Yes — recent `audit_logs` |
| Custom fields | Schema only |
| Tag picker on composer | Yes |
| Native desktop SQLite | Not started |

### Python domain — still tested, not wired to the UI

`TimeOpsService`: start/stop (no pause/split/break), manual entries, weekly summary, monthly income, CSV, project summaries, audit for timer + project status. **10 tests passing.** In-memory only.

### Clockify screen reference → Clockinator

| Reference | Clockinator now | Next |
|---|---|---|
| Time Tracker composer + START | Wired + tags + tasks + manual + row edit + break rows | — |
| Day groups + week total | Rolling 14 days; week total is Mon–Sun (work only) | — |
| Pause / split / breaks | Wired; completed breaks listed on tracker | — |
| Projects table + filters | Live form + task rates + filter bar + export | Member access rules |
| Clients / Tags | Live list + create | Archive / merge |
| Reports summary | Totals + labor/profit + From/To range + decimal toggle + charts + Detailed | Rounding |
| Timesheet week grid | Live + submit week + lock/unlock week | — |
| Approvals queue | Live | Comments |
| Calendar | Week grid + jump-to-date + month/week nav + today highlight | Day view, drag/drop |

### Clockify paid 49-feature grid → Clockinator (offline audit)

**Offline executable** = capability that can run entirely in the local-first web app (`apps/web` + IndexedDB SQLite). Source of truth is the **web SQLite UI**, not Python `TimeOpsService`.

Legend: **Done** = usable in UI · **Engine** = rules/snapshots work, thin or no admin UI · **Schema** = tables/columns exist, no UI/enforcement · **Partial** = some UI but not the Clockify-shaped feature · **No** = absent · **Skip** = cloud/hardware/enterprise — not a local-first goal

Rough count excluding Skip: offline rows are Done in the web UI. Skip stays the cloud/hardware set (kiosk, QR/photo kiosk, GPS, screenshots, QuickBooks, emailed schedules, data regions, SSO, SCIM, subdomain, control accounts, activity monitoring).

#### FREE (17)

| Feature | Status | Notes |
|---|---|---|
| Add time for others | Done | Manager/owner “Add for” on manual entry; `source='manager_manual'`. Header **Acting as** switches the local user |
| Hide time and pages | Done | Workspace: hide teammates’ time, hide rates, hide sidebar pages from members |
| Required fields | Done | Workspace toggles + required custom fields enforced on start/save |
| Bulk edit | Done | Tracker multi-select: project, tag, billable |
| Kiosk | Skip | Shared hardware terminal |
| Decimal format | Done | Toggle `h:mm:ss` / `0.00h` |
| Time audit | Done | Audit log search, “Time changes” filter, CSV export, edit metadata. No IP/user-agent (no accounts) |
| Customize exports | Done | Report column picker for CSV. No XLSX |
| Export & share data | Partial | Local CSV + summary PDF. Share links need a server |
| Project templates | Done | Save a project as a template; create from template |
| Historic rates | Done | Project form lists `rate_history` and sets a rate from a date |
| Import timesheets | Done | Tracker **Import** CSV (`date,start,end,description,project,task,tags,billable`) |
| Break | Done | Timer bar; breaks excluded from work totals |
| Favorite entries | Done | Star an entry; chips above the tracker fill the composer |
| Split time | Done | Running session Split |
| Billability & billable rates | Done | `$` toggle; task → project → workspace |
| Time estimates | Done | Project hours + report “Estimates on” overlay |

#### BASIC (12)

| Feature | Status | Notes |
|---|---|---|
| Time off | Done | Request / approve vacation, sick, personal. Shown on the timesheet week |
| Invoicing | Done | Draft from billable time; sent/paid; PDF |
| Approval | Done | Submit / withdraw / approve / reject plus notes. Managers approve |
| Lock timesheet | Done | Managers lock/unlock the week |
| Targets & reminders | Done | Weekly hour target. In-app reminder Fri–Sun when behind |
| Manager role | Done | Team screen: owner / manager / member. Jonah (manager) and Priya (member) are seeded |
| Task rates | Done | Project form |
| Rounding | Done | Workspace minute grid (nearest/up/down) applied to reports and invoices |
| QuickBooks | Skip | Cloud integration |
| Recurring invoices | Done | Schedule weekly/monthly; **Generate due** creates the local draft |
| Attendance report | Done | Reports → Attendance (first/last, present/off/absent) |
| QR code (kiosk) | Skip | Kiosk hardware |

#### STANDARD (15)

| Feature | Status | Notes |
|---|---|---|
| Scheduling | Done | Week assignments of hours to a person and project |
| Forecasting | Done | Scheduled hours vs weekly capacity on the Schedule screen |
| Expenses | Done | Expenses screen; subtracted from report profit via local FX |
| Labor cost & profit | Done | Reports labor, expenses, profit |
| Budget & estimates | Done | Project budget amount; header alert when billed amount exceeds it |
| Custom fields | Done | Workspace definitions; values on the time entry editor and composer |
| User fields | Done | Same definitions with target `user`, edited on Team |
| Scheduled reports | Skip | Email delivery needs a mail server |
| Alerts | Done | In-app only: target, budget, approvals, time off, due invoices. No email/push |
| Force timer | Done | Members cannot add manual time while the workspace toggle is on |
| GPS tracking | Skip | Device location |
| Screenshots | Skip | Desktop capture |
| Photo capture (kiosk) | Skip | Kiosk camera |
| Multiple currencies | Done | Client currency + workspace exchange rates. Acme is seeded as EUR at 1.08 |
| Data regions | Skip | Cloud hosting |

#### PRO (5)

| Feature | Status | Notes |
|---|---|---|
| Single sign-on (SSO) | Skip | |
| Custom subdomain | Skip | |
| SCIM | Skip | |
| Control accounts | Skip | Multi-workspace cloud admin |
| Audit log | Done | Search, time-change filter, CSV export |

---

## 4. How to run

**One click:** double-click `Start Clockinator.bat` in the repo root, or `C:\Clockify\Start Clockinator.bat`. That installs npm packages on first run, starts Vite, and opens http://localhost:5173. Leave the console open; close it (or Ctrl+C) to stop. If the app is already running, the launcher just opens the browser.

```bash
cd C:\Clockify\CLOCKINATOR-main
python -m unittest discover -s tests

cd apps/web
npm install
npm run start    # vite --open → http://localhost:5173
npm run dev      # same server, no browser auto-open
npm test         # vitest: rates + timer engine
npm run build
```

Reset local data: DevTools → Application → IndexedDB → delete `clockinator`. Next load re-seeds Northwind Studio **and** ~4 weeks of weekday demo entries (`ensureDenseDemo` in `src/db/seed.ts`). Existing IndexedDB workspaces also get those demo rows on next boot (`INSERT OR IGNORE`), so you do **not** need to wipe the DB just to fill an empty tracker.

`design/references/` holds Clockify screenshots (behavior/density only). They are gitignored. Do not copy that chrome. Visual target remains `design/Clockinator.html`.

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
- Dense demo history + rolling 14-day tracker list, tag picker, manual add, row edit
- Break rows on Time Tracker (work totals exclude breaks)
- Reports Summary + Detailed + group-by + stacked day chart + donut + CSV/PDF + labor/profit
- Decimal duration toggle (`h:mm:ss` / `0.00h`) on Tracker / Timesheet / Reports
- Projects form (client/color/rate/estimate/access) + **task rate editor** + filters + CSV
- Clients + Tags screens
- Timesheet week grid + submit week + **lock/unlock week**
- Invoices list + draft from billable client time + shared summary PDF export
- Calendar week grid
- Approvals submit/approve/reject + Audit log list

### Stream J — Local grid gaps

Shipped: break rows, lock week, task rates, decimal format, labor/profit, invoice UI + shared PDF, and the rest of the offline plan grid (custom/required fields, CSV import, rounding, favorite entries, bulk edit, templates, historic rates, time off, expenses, schedule/forecast, attendance, recurring invoices, currencies, targets, manager role, hide time/pages, audit search/export).

Still skipped (not offline): kiosk, QR/photo kiosk, GPS, QuickBooks, emailed scheduled reports, data regions, SSO, SCIM, custom subdomain, control accounts, activity monitoring, cake.com bundle.

### Stream I — Native desktop adapter

Tauri (preferred) or Electron. Implement `SqliteAdapter` against a file; run `db/migrations`. Do not fork the schema.

### Stream A — HTTP / sync (later)

Only after local-first is boringly solid. Optional FastAPI wrapping Python or a sync dump of SQLite. Do not make the web depend on it.

### Do not start

Dashboard, kiosk, GPS, screenshots, SSO/SCIM, QuickBooks, data regions, Clockify-identical chrome.

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
- **sql.js browser ESM has no default export.** Load `sql.js/dist/sql-asm.js` after React paints (`src/db/client.ts` + dynamic import in `useClockinator.tsx`). Do not `import initSqlJs from "sql.js"` in the renderer — that whitescreens `#root`.
- `sql.js` WASM is ~650KB. Keep it the only native-ish dep until a desktop adapter exists.
- PDF exports use a multi-page Helvetica summary layout (`domain/pdf.ts`) with accent bar, Overview donut + daily stacked bars, bold headings, column headers, zebra rows, and right-aligned Duration/Share/Amount — Clockify-shaped, Clockinator-branded.
- Python domain has **no** pause/split/break. TS is ahead. Do not “fix” the UI by calling Python.
- `RunningBar` demo (`useState(2537)`) was removed; do not bring it back.
- Project tracked hours are **real sums**, not the old mockup’s 68.2h fixtures.
- `window.prompt` for new projects is gone; use the project form.
- Time Tracker lists the **last 14 days**, not only Mon–Sun. Week total is still the current calendar week. The empty-looking tracker was this filter plus a 5-row seed.
- `ensureDenseDemo` inserts weekday history with `INSERT OR IGNORE` on every boot. Do not treat those `demo_YYYYMMDD_*` ids as user data when writing migrations.

---

## 10. Quick file index

| Need | File |
|---|---|
| Schema | `db/migrations/001_init.sql` |
| DB open / persist | `apps/web/src/db/open.ts`, `client.ts`, `persist.ts` |
| Queries + lists | `apps/web/src/db/store.ts` |
| Timer rules | `apps/web/src/domain/timer.ts` |
| Rate hierarchy | `apps/web/src/domain/rates.ts` |
| CSV/PDF | `apps/web/src/domain/reports.ts`, `domain/pdf.ts` |
| Duration display prefs | `apps/web/src/domain/preferences.ts`, `hooks/useDurationFormat.ts` |
| Hook | `apps/web/src/hooks/useTimer.ts` |
| Time Tracker | `apps/web/src/screens/TimeTracker.tsx` |
| Timesheet | `apps/web/src/screens/Timesheet.tsx` |
| Calendar | `apps/web/src/screens/Calendar.tsx` |
| Reports | `apps/web/src/screens/Reports.tsx` |
| Projects | `apps/web/src/screens/Projects.tsx` |
| Clients | `apps/web/src/screens/Clients.tsx` |
| Tags | `apps/web/src/screens/Tags.tsx` |
| Invoices | `apps/web/src/screens/Invoices.tsx` |
| Approvals | `apps/web/src/screens/Approvals.tsx` |
| Audit | `apps/web/src/screens/AuditLog.tsx` |
| Seed / demo week | `apps/web/src/db/seed.ts` (`ensureDenseDemo`) |
| Python sketch | `apps/api/timeops_core/service.py` |
| Mockup | `design/Clockinator.html` |
| Clockify screenshots (local only) | `design/references/` (gitignored) |
