# Design

UI design exploration for Clockinator. These are **mockups**, not the shipped frontend.

## Files

- `Clockinator.html` — the design mockup, a self-contained standalone export from
  Claude Design (runtime + React inlined). Just open it in a browser; no server or
  other files needed. Covers six screens: Time Tracker, Timesheet, Reports,
  Projects/Clients, Approvals, and Audit. To change it, edit the source in Claude
  Design and re-export, replacing this file.
- `thumbnail.webp` — preview thumbnail of the mockup.
- `references/` — screenshots used as visual reference while designing. **These are
  screenshots of the Clockify product (a third-party vendor).** See the note below
  before publishing.

## Viewing the mockup

Open `Clockinator.html` directly in a browser (double-click). It only pulls fonts
from Google Fonts, falling back to system fonts when offline.

## Note on the reference screenshots

The project README states Clockinator is built "without copying any vendor UI or
implementation." The images in `references/` are screenshots of Clockify's own UI,
and the current mockup mirrors that vendor's layout fairly closely. Before pushing to
a public repo, decide whether to:

1. keep them for internal reference only (add `design/references/` to `.gitignore`), or
2. replace the mockup's borrowed layout with an original design and drop the references.
