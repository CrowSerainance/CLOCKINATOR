# Clockinator — agent instructions

Full context: [`HANDOFF.md`](./HANDOFF.md). Read it before implementing. **Keep HANDOFF.md updated** when you change architecture, schema, or stream status.

## Product

Self-hosted / **local-first** time operations. Inspired by Clockify **workflows**, not its UI. App name is **Clockinator**. Fonts: Hanken Grotesk + JetBrains Mono. Accent `#5bbd7e` on warm dark. Tokens: `apps/web/src/theme.ts`.

**Do not** copy Clockify layout, chrome, marketing buttons, or screenshots. Visual target: `design/Clockinator.html`.

## Stack

- **Running product:** Vite + React + TS (`apps/web`). SQLite via `sql.js`, persisted to IndexedDB. Schema: `db/migrations/001_init.sql`.
- **Timer:** `src/domain/timer.ts` + `src/hooks/useTimer.ts` (start/pause/resume/stop/split/break).
- **Python** `apps/api/timeops_core` is an in-memory sketch. Keep `python -m unittest discover -s tests` green. Do not wire the UI to it.
- Timesheet / Approvals / Audit are live lists from SQLite. Calendar is still out of scope.

## Rules

1. Claim **one** open stream from HANDOFF.md §6. Do not start Calendar, kiosk, GPS, SSO, or invoicing UI.
2. Schema changes = new `db/migrations/00N_*.sql` + register in `src/db/migrate.ts`. Snapshot rates at write time. One open timer session per user.
3. Pause = untracked gap. Break = `time_entries.kind='break'`.
4. No Tailwind/MUI unless a human asks. Do not commit `.env` or `design/references/`.
5. New timer/rate behavior: vitest under `apps/web/src/domain/*.test.ts`.

## First commands

Double-click `Start Clockinator.bat` (repo root or `C:\Clockify`). Or:

```bash
cd C:\Clockify\CLOCKINATOR-main
python -m unittest discover -s tests
cd apps/web && npm test && npm run start
```
