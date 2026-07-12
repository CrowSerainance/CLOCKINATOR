# Clockinator Web

The frontend shell for Clockinator — a Vite + React + TypeScript app that
implements the UI prototyped in [`design/Clockinator.html`](../../design/Clockinator.html).

## Status

- **Time Tracker** — implemented (running timer + day-grouped entries).
- Timesheet, Reports, Projects, Approvals, Audit — navigable placeholders.

Data is currently sample data in `src/data/`. It will be wired to the
`apps/api` domain core once that exposes an HTTP API.

## Develop

```bash
cd apps/web
npm install
npm run dev      # http://localhost:5173
```

## Build

```bash
npm run build    # type-check + production build to dist/
```

## Layout

```txt
src/
  main.tsx           # entry
  App.tsx            # layout shell + screen routing
  theme.ts           # design tokens (colors) from the mockup
  types.ts           # shared types
  components/        # Sidebar, shared UI
  screens/           # one file per screen
  data/              # sample data (placeholder for the API)
```
