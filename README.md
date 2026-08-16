# Clockinator

Clockinator is a self-hosted time operations starter system for individuals and small teams. It is inspired by broad time-operations workflows—timers, manual entries, projects, timesheets, reporting, approvals, billing, and workforce administration—without copying any vendor UI or implementation.

## Current scope

This repository currently implements the Phase 1 domain core:

- single-workspace bootstrap
- users, clients, projects, tasks, and tags
- auditable timer start/stop
- manual time entries
- billable rate snapshots
- weekly timesheet summaries
- tracker-week, calendar-week, and report-summary DTOs
- monthly income summaries
- CSV export for reports
- timezone-aware entry validation
- timesheet submit/approve/reject/lock state transitions
- repository/store boundary and FastAPI route skeleton
- role-gated manager actions, project progress/favorites, and detailed report/chart DTOs

The **running app** is local-first: Vite + React under `apps/web`, SQLite (`sql.js`) persisted in IndexedDB. Canonical schema: `db/migrations/`. Python `timeops_core` remains an in-memory rules sketch with unit tests.

Contributor / LLM hand-off: [`HANDOFF.md`](./HANDOFF.md). Agent rules: [`AGENTS.md`](./AGENTS.md).

## Repository layout

```txt
db/migrations/          # canonical SQLite schema
apps/web/               # local-first Vite + React app
apps/api/timeops_core/  # Python domain package for the API service
apps/api/timeops_api/   # FastAPI route and schema skeleton
design/                 # UI mockups (Design Canvas) and reference screenshots
infra/docker/           # Container/deployment notes and compose starter
tests/                  # Unit tests for the Python domain core
```

## Quick start

```bash
python -m unittest discover -s tests
cd apps/web && npm install && npm run dev
uvicorn apps.api.main:app --reload
```

## Product analysis

- [Clockify screenshot gap analysis](docs/clockify-image-gap-analysis.md) tracks what is visible in the reference screenshots and what Clockinator still needs to implement.

## Roadmap

1. Timer and manual entry
2. Projects, tasks, and clients
3. Weekly timesheet
4. Reports and CSV export
5. Rates and monthly income
6. Approval, lock, and audit trail
7. Invoicing
8. Scheduling and time off
9. Kiosk
10. GPS/screenshots with privacy controls
11. SSO, SCIM, webhooks, and enterprise administration
