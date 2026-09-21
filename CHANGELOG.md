# Changelog

All notable changes to **QuoteCraft** are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-09-21

### Added — Report PDF Export (Phase 3)
- **Revenue Report** — Export PDF button next to Export CSV; produces a branded PDF
  (header, currency-summary KPIs, period buckets bar chart, line-item grid, totals,
  footer) via a native save dialog.
- **Profit & Loss Report** — Export PDF button (added next to Print / Export CSV);
  renders the monthly income-vs-expense grid, cumulative profit, basis badge, and
  totals through the same save-dialog pipeline.
- **Client Profitability Report** — Export PDF button next to Export CSV; renders
  per-client billed/collected/outstanding rows, collection-rate badge, and dashboard
  summary, saved via native dialog.

All three reuse the existing `src/main/pdf-export.js` renderer + IPC + preload +
renderer wiring already built for Payments/Client-Statement PDF, so behavior (save
dialog, default filename, `{ok,savedPath,cancelled}` return shape) is identical to the
verified Payments chain in the plan.

### Changed
- **Currency source-of-truth unification (Phase 2).** Report controllers now derive
  symbol tables from the canonical `window.CURRENCIES` single copy in
  `src/shared/constants.js` (mirrored by `src/renderer/js/currencies.js`); drifted
  literal `CURRENCY_SYMBOLS` tables were removed from `revenue-report.js` and
  `client-profitability.js`. Currency badge + CSV + PDF all use the one table.
- **DB test isolation (Phase 1).** All DB-bound test scripts now point at an isolated
  temp DB via `process.env.TEST_DB_PATH` (set before `require('../src/main/database')`,
  with `closeDatabase()` cleanup in `.finally`), so running the suite never touches the
  dev database.

### Fixed
- Report renderers in `src/main/pdf-export.js` were exported under a drifted name
  (`renderClientProfitabilityPdf`) that did not match the actual function
  (`renderClientProfitabilityReportPdf`), throwing a `ReferenceError` at module load
  and preventing `npm run dev` from launching. The export name now matches the
  function; `node --check` + a `node` census of all 3 report renderers, 3 IPC export
  handlers, 3 preload methods, 3 HTML buttons, and 3 renderer listeners are all green.

## [1.0.0] — Initial Release

First release of QuoteCraft: professional quote & invoice management for freelancers
and small businesses (quotes, invoices, payments, credit notes, expenses, time
tracking, emails/reminders, reports, PDF + HTML export).