# AGENTS.md

Electron desktop app for freelancer quotes/invoices. Vanilla JS, no bundler/framework, no lint or unit-test framework.

## Commands

- `npm run dev` — launch the Electron app.
- `npm run dist` / `dist:dir` — build Windows NSIS installer.
- Tests: `node scripts/test-*.js` (self-contained Node scripts, no framework).

## Architecture

- `src/main` (Node side), `src/renderer` (browser, `contextIsolation` on). All data access is via IPC.
- A feature touches 4 places: function in `src/main/database.js` → channel `'x:y'` in `src/main/ipc-handlers.js` → method in `src/main/preload.js` (`window.electronAPI`) → renderer JS.
- `ipc-handlers.js` also calls the sibling main modules directly — `pdf-export.js` (PDF/HTML rendering), `email-service.js` (SMTP), `auto-backup.js`, `secure-storage.js` — so an export/email feature spans more than the 4-place data-access pattern.
- `database.js` is a ~6000-line monolith holding the schema, migrations, and all CRUD/report logic; tests `require()` it directly.
- Renderer: single `index.html` with every page as `<section id="page-X">` toggled by nav `data-page`; shared helpers on `window.QuoteCraftUtils` (utils.js). There is no bundler, so every renderer JS file is loaded by an explicit `<script src="js/name.js">` at the bottom of index.html — add a new file there or it won't run (`theme.js` loads in `<head>`, before `pagechange`-driven JS). The CSP (`script-src 'self'`) blocks inline scripts.

## Gotchas

- sql.js is in-memory: changes only persist when `saveToDisk()` is called. The app DB lives at `%APPDATA%/quotecraft/quotecraft.sqlite` (pinned in main.js:7); in plain-Node test runs it falls back to `data/quotecraft.sqlite` (gitignored).
- `DB_FILE` is read from `process.env.TEST_DB_PATH` at require-time — set it before `require('../src/main/database')`.
- Roughly half of `scripts/test-*.js` set `TEST_DB_PATH` (e.g. `test-reminder-rules.js`, `test-audit-log.js`); the rest do not and write into the dev DB (`data/quotecraft.sqlite`). Model new tests on `test-reminder-rules.js`: point `TEST_DB_PATH` at a temp file before requiring database, then `closeDatabase()` + delete the temp file. Tests also reach raw SQL via the exported `getDb()` + `db.exec` (returns `{ columns, values }`).
- Schema changes go in the `MIGRATIONS` array (new-table defaults live in `createTables()`). Migrations are additive/idempotent — check `PRAGMA table_info` then `ALTER TABLE ADD COLUMN`; don't edit already-applied migrations.
- SMTP passwords are stored via `src/main/secure-storage.js`: Electron `safeStorage` in-app, AES-256-GCM fallback during CLI tests.
- Invoice status `overdue` is derived, not stored (`effectiveInvoiceStatus` in utils.js); credit notes reduce net `amount_paid` for partial-payment math.
- Quote→invoice conversion is constrained by partial unique indexes per `invoice_type` (`standard`/`deposit`/`final`): at most one of each per quote.
- The currency list is duplicated: `src/renderer/js/currencies.js` (exposed as `window.CURRENCIES`, used for formatting/drop-downs) and `src/shared/constants.js` (used by `pdf-export.js`). Keep both in sync when adding/removing currencies, or PDFs will show wrong symbols.