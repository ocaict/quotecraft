# AGENTS.md

QuoteCraft — offline-first Electron desktop app for quotes & invoices. Vanilla JS:
no framework, no bundler, no TypeScript. Main process is Node/CommonJS; the renderer
is plain `<script>` tags loaded by `src/renderer/index.html`. No README exists.

## Commands
- Install: `npm ci` (Node 20)
- Run app: `npm run dev` → `electron .` (entry `src/main/main.js`)
- All tests: `npm test` → `scripts/run-all-tests.js` runs every `scripts/test-*.js`
- Single test: `node scripts/test-invoice-create.js`
- Package Windows installer: `npm run dist` (electron-builder nsis → `dist/`)
- No lint / format / typecheck scripts exist — do not invent them.
- Releases (manual, no CI): bump `version` in `package.json`, run `npm run dist`
  (electron-builder nsis → `dist/`), then `node scripts/publish-release.js`, which
  reads `version` from `package.json` and uploads the installer, blockmap, and
  `latest.yml` to a GitHub release. The Windows artifact name is pinned by
  `build.artifactName` (no spaces, since GitHub rewrites spaces in asset names and
  `electron-updater` matches on the name).

## Tests
- Tests run under plain `node`, NOT Electron. They `require('../src/main/database')`
  directly; `database.js` tolerates a missing Electron `app` (falls back to `data/`).
- Each test sets `process.env.TEST_DB_PATH` BEFORE requiring `database.js`, and
  deletes its own `.sqlite`. Copy that pattern for new tests.
- Coverage targets main-process/DB logic (plus `renderer/js/theme.js`). DOM renderer
  code is not testable without Electron and depends on `window.electronAPI`.
- Tests must not need GUI or network (they run under plain `node`).

## Architecture
- `src/main/database.js` — the entire data layer (sql.js/WASM, synchronous
  `db.exec`/`db.run`). `ipc-handlers.js` maps `ipcMain.handle` channels to DB
  functions; `preload.js` exposes them as `window.electronAPI` via contextBridge.
- Renderer JS files are plain scripts; a NEW file must be added to the `<script>`
  list near the bottom of `src/renderer/index.html`.
- `src/shared/constants.js` is imported by main (CommonJS) and read by the renderer
  as `window.QuoteCraftConstants`; preserve the dual export.
- `tools/quotecraft-license-worker/` — separate Cloudflare Worker (ES modules).
  Deploy `npx wrangler deploy`; local sim: `npx wrangler dev` then
  `node test/simulate-webhook.js`.

## Adding a feature end-to-end
1. function in `src/main/database.js`
2. `ipcMain.handle` channel in `src/main/ipc-handlers.js`
3. bridge method in `src/main/preload.js`
4. renderer file in `src/renderer/js/` + register it in `index.html`

## Gotchas
- Money: totals, tax, and discounts are recomputed server-side in integer cents;
  client-supplied totals are ignored. Never trust renderer amounts, and mirror the
  cents math when asserting in tests (see `scripts/test-invoice-create.js`).
- Data lives in `%APPDATA%\quotecraft` (lowercase), pinned in `main.js` so it
  survives install/uninstall. Never store data inside the install directory.
- Schema changes: append a new object to the `MIGRATIONS` array in `database.js`
  with the next version and a guarded `up()` (check `PRAGMA table_info` before
  `ALTER TABLE`). Tracked in `schema_migrations`, run in transactions. Never edit an
  already-applied migration.
- Electron security: `contextIsolation: true`, `nodeIntegration: false`, CSP
  `script-src 'self'` (no inline scripts/eval). Renderer talks to main only via
  `window.electronAPI`.
- sql.js `.wasm` is `asarUnpack`ed for packaging; `pdfkit` and `sql.js` are the
  heavy runtime deps.
- Secrets: `QC_LICENSE_KEY` has a hardcoded dev fallback in `src/main/licensing.js`;
  worker secrets live in `tools/quotecraft-license-worker/.dev.vars` (gitignored) —
  never commit them.
- `GO_LIVE_IMPLEMENTATION_PLAN.md`, `PRODUCTION_ROADMAP.md`, and
  `NIGERIA_COMMERCIAL_ROADMAP.md` are status/planning docs, not setup guides.
