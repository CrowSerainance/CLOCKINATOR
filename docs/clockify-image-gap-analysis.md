# Clockify Screenshot Gap Analysis

This document translates the supplied Clockify screenshots into an implementation gap list for Clockinator. It is intentionally a product-planning artifact, not a request to copy Clockify's branding or UI.

## What the screenshots show

### Navigation modules visible in the sidebar

The screenshots show a full time-operations suite with these primary modules:

- Timesheet
- Time tracker
- Calendar
- Dashboard
- Reports
- Projects
- Team
- Tags
- Clients
- Kiosks
- Schedule
- Expenses
- Time off
- Activity
- Approvals
- Invoices

### Report screen capabilities

The report screenshot shows:

- Report tabs: summary, detailed, weekly, and shared reports.
- Date-range picker with previous/next navigation.
- Export menu.
- Filter bar for team, client, project, task, tag, and description.
- Apply-filter action.
- Total tracked time for the selected range.
- Stacked bar chart by day.
- Group-by controls, including project and description grouping.
- Optional estimate display toggle.
- Sortable tabular report rows.
- Donut/pie visualization.
- Print, share, rounding, and create-invoice actions.

### Calendar screen capabilities

The calendar screenshot shows:

- Week/day calendar modes.
- Teammate selector.
- Date preset picker and previous/next navigation.
- Settings action.
- Total time per day in the column header.
- Time-grid visualization by hour.
- Positioned entries with title, project/client, color, tag indicator, and duration.
- Zoom controls.

### Projects screen capabilities

The projects screenshot shows:

- Project list with create-project action.
- Filters for active status, client, access, and name search.
- Apply-filter action.
- Export menu.
- Selectable rows.
- Sortable columns for name, client, tracked time, progress, and access.
- Project color dots.
- Public/private access visibility.
- Favorites and row actions.

### Time tracker screen capabilities

The time tracker screenshot shows:

- Running timer entry bar with description, project picker, tag picker, current duration, and start action.
- Week total.
- Entries grouped by day.
- Day totals.
- Manual time ranges.
- Duration per entry.
- Continue/play action.
- Calendar/edit action.
- Tags shown as chips.
- Row action menu.

### Paid-feature matrix shown

The matrix adds many platform capabilities beyond the current domain core:

- Add time for others
- Hide time and pages
- Required fields
- Bulk edit
- Kiosk
- Decimal format
- Time audit
- Custom exports
- Project templates
- Historic rates
- Import timesheets
- Breaks
- Favorite entries
- Split time
- Billability and billable rates
- Export and share data
- Time estimates
- Time off
- Invoicing and recurring invoices
- Approval and lock timesheet
- Targets and reminders
- Manager role
- Task rates
- Rounding
- QuickBooks integration
- Attendance report
- QR-code kiosk
- Scheduling and forecasting
- Expenses
- Labor cost and profit
- Budget and estimates
- Custom fields and user fields
- Scheduled reports and alerts
- Force timer
- GPS tracking
- Screenshots
- Photo-capture kiosk
- Multiple currencies
- Data regions
- SSO, custom subdomain, SCIM, control accounts, and audit log

## Current Clockinator coverage

The current Phase 1 domain core covers only part of the screenshots:

| Area | Current coverage | Gap |
| --- | --- | --- |
| Workspace | Single-workspace domain support | No web workspace switcher/settings/admin UI |
| Users/team | Users exist with workspace roles and manager-gated actions | No invitations, team grouping, member UI, or auth-backed permissions |
| Clients | Clients exist in the domain | No client CRUD UI, archived status, contact/billing metadata, or filters beyond direct IDs |
| Projects | Projects/tasks exist with billable rates, color, status, access, estimates, budgets, templates, favorites, progress, and list projections | No project list UI, row actions, member access rules, or persisted archived-list filtering |
| Time tracker | Start/stop/manual entries, tags, and a tracker-week DTO exist | No web timer bar, continue action, favorites, required fields, breaks, or row menus |
| Calendar | Calendar-week DTOs exist for event projection | Need real week/day UI grid, date navigation, teammate selector UI, positioned layout, drag/drop edits, and settings |
| Reports | Weekly/monthly calculations, CSV export, report query objects, filters, summary grouping, detailed rows, and daily chart buckets exist | Need summary/detailed/weekly/shared UI, sorting, rounding, estimates, share links, print/PDF/XLSX, and invoice handoff |
| Users/team | Users exist in the domain | No invitations, roles, manager permissions, teams, or member UI |
| Clients | Clients exist in the domain | No client CRUD UI, archived status, contact/billing metadata, or filters beyond direct IDs |
| Projects | Projects/tasks exist with billable rates, color, status, access, and estimate metadata | No project list UI, favorites, progress calculations, templates, budgets, or row actions |
| Time tracker | Start/stop/manual entries, tags, and a tracker-week DTO exist | No web timer bar, continue action, favorites, required fields, breaks, or row menus |
| Calendar | Calendar-week DTOs exist for event projection | Need real week/day UI grid, date navigation, teammate selector UI, positioned layout, drag/drop edits, and settings |
| Reports | Weekly/monthly calculations, CSV export, report query objects, filters, and summary grouping exist | Need summary/detailed/weekly/shared UI, sorting, charts, rounding, estimates, share links, print/PDF/XLSX, and invoice handoff |
| Timesheets | Submit/approve/reject/lock exists | Need period listing, withdrawal, manager queues, comments, reminders, attendance/overtime report, and UI |
| Audit | Old/new audit snapshots exist | Need append-only persistence, audit search/export, IP/user agent, actor role, override reasons, and admin audit UI |
| Billing | Billable rates and revenue exist | Need invoices, recurring invoices, invoice PDFs, expenses, tax, payments, multiple currencies, and accounting integrations |
| Workforce operations | Not implemented | Need scheduling, forecasting, time off, holidays, balances, alerts, targets, GPS, screenshots, activity, kiosk, and mobile/desktop clients |
| Enterprise | Not implemented | Need SSO/OIDC/SAML, SCIM, data regions, control accounts, custom domains/subdomains, API keys, and webhooks |

## Highest-priority missing MVP work

To match the core visible screenshots without overbuilding enterprise features, implement in this order:

1. **API transport layer**
   - FastAPI route and schema skeleton exists for core tracker, calendar, project, tag, and report flows.
   - Next: add error mapping, auth dependencies, response models, and integration tests once dependencies are installed.

2. **Persistence**
   - Replace or wrap the in-memory dictionaries with PostgreSQL-backed repositories.
   - Add migrations for workspaces, users, clients, projects, tasks, tags, time entries, timesheet periods, approvals, and audit logs.

3. **Web shell and navigation**
   - Add a self-branded web app shell with sidebar modules: time tracker, calendar, reports, projects, clients, tags, team, approvals, and invoices.
   - Do not copy Clockify branding, colors, icons, layout proportions, or text styling directly.

4. **Time tracker UI/API**
   - Implement the running timer bar, manual entry editing, day grouping, week totals, continue/play, project/task/tag selectors, row actions, and entry validation.

5. **Projects/clients/tags UI/API**
   - Add searchable project list with client, tracked time, status, access, and export.
   - Add tags as first-class domain objects because tags are visible in the screenshots and missing from the current model.

6. **Reports engine**
   - Implement report filters, grouping, sorting, date navigation, summary/detailed/weekly views, charts, rounding, CSV/XLSX/PDF exports, and shared report links.

7. **Calendar view**
   - Add week/day time-grid view with daily totals, teammate filter, and drag/drop or modal editing.

8. **Approval workflows**
   - Add approval queues, comments, withdrawal, lock policies, reminders, attendance/overtime summaries, and manager role permissions.

9. **Billing and profitability**
   - Add expenses, invoices, invoice lines, PDF generation, recurring invoices, payments, multiple currencies, budgets, estimates, labor cost, and profit dashboards.

10. **Later workforce/enterprise modules**
    - Kiosk, QR/PIN, breaks, scheduling, time off, GPS, screenshots, force timer, SSO, SCIM, control accounts, audit-log UI, API keys, and webhooks should come after the core timer/report/project product is reliable.

## Immediate code gaps to address next

These are the smallest useful code changes that should come before building the UI:

- Add PostgreSQL repository implementations and migrations behind the new store boundary.
- Add auth-backed permission dependencies and team/member invitation flows.
- Add persisted project member access rules, row actions, and archived-list API filters.
- Add shared report links, rounding, estimate overlays, and PDF/XLSX export adapters.
- Harden HTTP API schemas/routes with response models, error mapping, auth dependencies, and API tests.
- Add permission checks for manager actions, including add-time-for-others and approve/lock timesheets.
- Add project progress calculations, favorites, templates, budgets, and archived-list filtering.
- Add detailed report rows, shared report links, rounding, chart-ready buckets, and PDF/XLSX export adapters.
- Harden HTTP API schemas/routes with response models, error mapping, auth dependencies, and API tests.
- Add repository interfaces so the domain can move from in-memory storage to PostgreSQL without rewriting business rules.
- Add permission checks for manager actions, including add-time-for-others and approve/lock timesheets.
- Add project progress calculations, favorites, templates, budgets, and archived-list filtering.
- Add detailed report rows, shared report links, rounding, chart-ready buckets, and PDF/XLSX export adapters.
- Add HTTP API schemas/routes for the tracker week, calendar week, project list, and report summary DTOs.
