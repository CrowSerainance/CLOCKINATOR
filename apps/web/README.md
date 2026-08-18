# Clockinator Web

Local-first Vite + React + TypeScript app. Visual target: [`design/Clockinator.html`](../../design/Clockinator.html). Data: SQLite (`sql.js`) + IndexedDB. Schema: [`db/migrations`](../../db/migrations).

## Status

- **Time Tracker** — composer, live timer, pause / resume / split / break / stop. Week list from SQLite.
- **Projects** — live table, favorite, prompt-create.
- **Reports** — date range, group-by project, CSV + PDF download.
- Timesheet, Approvals, Audit — placeholders.

See [`HANDOFF.md`](../../HANDOFF.md).

## Launch

Double-click **Start Clockinator.bat** in the repo root (or `C:\Clockify`). First run installs packages; then it opens http://localhost:5173.

```bash
cd apps/web
npm install
npm run start    # opens the browser
npm run dev      # server only
npm test
```

Reset DB: delete IndexedDB database `clockinator` in DevTools.

## Layout

```txt
src/
  db/            # sqlite client, migrations runner, seed, store
  domain/        # timer engine, rates, reports
  hooks/         # StoreProvider, useTimer
  screens/
  components/
```
