# Design

UI design exploration for Clockinator. These are **mockups**, not the shipped frontend.

## Files

- `Clockinator.dc.html` — interactive Design Canvas mockup of six screens: Time
  Tracker, Timesheet, Reports, Projects/Clients, Approvals, and Audit.
- `support.js` — the Design Canvas runtime the mockup loads (`<script src="./support.js">`).
  Keep it in the same folder as the `.dc.html` file.
- `thumbnail.webp` — preview thumbnail of the mockup.
- `references/` — screenshots used as visual reference while designing. **These are
  screenshots of the Clockify product (a third-party vendor).** See the note below
  before publishing.

## Viewing the mockup

Open `Clockinator.dc.html` in a browser. It expects `support.js` alongside it and
loads React + fonts from CDNs, so an internet connection is needed.

## Note on the reference screenshots

The project README states Clockinator is built "without copying any vendor UI or
implementation." The images in `references/` are screenshots of Clockify's own UI,
and the current mockup mirrors that vendor's layout fairly closely. Before pushing to
a public repo, decide whether to:

1. keep them for internal reference only (add `design/references/` to `.gitignore`), or
2. replace the mockup's borrowed layout with an original design and drop the references.
