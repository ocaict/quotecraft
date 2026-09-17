# AGENTS.md

Electron desktop app for freelancer quotes/invoices. Vanilla JS, no bundler/framework, no lint or unit-test framework.

## Commands

- `npm run dev` — launch the Electron app.
- `npm run dist` / `dist:dir` — build Windows NSIS installer.
- Tests: `node scripts/test-*.js` (self-contained Node scripts, no framework).

## Architecture

- `src/main` (Node side), `src/renderer` (browser, `contextIsolation` on). All data access is via IPC.
- A feature touches 4 places: function in `src/main/database.js` → channel `'x:y'` in `src/main/ipc-handlers.js` → method in `src/main/preload.js` (`window.electronAPI`) → renderer JS.
- `database.js` is a ~5200-line monolith holding the schema, migrations, and all CRUD/report logic; tests `require()` it directly.
- Renderer: single `index.html` with every page as `<section id="page-X">` toggled by nav `data-page`; shared helpers on `window.QuoteCraftUtils` (utils.js). The CSP in index.html blocks inline scripts.

## Gotchas

- sql.js is in-memory: changes only persist when `saveToDisk()` is called. The app DB lives at `%APPDATA%/quotecraft/quotecraft.sqlite` (pinned in main.js:7); in plain-Node test runs it falls back to `data/quotecraft.sqlite` (gitignored).
- `DB_FILE` is read from `process.env.TEST_DB_PATH` at require-time — set it before `require('../src/main/database')`.
- Most existing `scripts/test-*.js` do NOT set `TEST_DB_PATH`, so they write into the real dev DB (`data/quotecraft.sqlite`). Model new tests on `test-reminder-rules.js`: temp DB path + `closeDatabase()` + temp file cleanup.
- Schema changes go in the `MIGRATIONS` array (new-table defaults live in `createTables()`). Migrations are additive/idempotent — check `PRAGMA table_info` then `ALTER TABLE ADD COLUMN`; don't edit already-applied migrations.
- SMTP passwords are stored via `src/main/secure-storage.js`: Electron `safeStorage` in-app, AES-256-GCM fallback during CLI tests.
- Invoice status `overdue` is derived, not stored (`effectiveInvoiceStatus` in utils.js); credit notes reduce net `amount_paid` for partial-payment math.
- Quote→invoice conversion is constrained by partial unique indexes per `invoice_type` (`standard`/`deposit`/`final`): at most one of each per quote.