# QuoteCraft — Remaining Phases (pick-up doc)

This file records the exact, **verified** anchors for the unfinished work so any future
session can resume without re-crawling the codebase. Census truths below were confirmed
this session via grep/source reads (not guessed).

---

## Status Snapshot (already DONE — do not redo)

- **Phase 1 — DONE.** All DB-bound test scripts now isolate the dev DB via
  `process.env.TEST_DB_PATH` (set BEFORE `require('../src/main/database')`, with
  `closeDatabase()` + temp-dir cleanup in `.finally`). Authoritative census:
  **WITH = 32, WITHOUT = 1 (`test-theme.js`, which is DB-free and exempt)**.
  Committed + pushed (`664429e`).
- **Phase 2 — DONE (currency source-of-truth unification).** Both report controllers
  now derive symbol tables from the canonical `window.CURRENCIES` (single copy in
  `src/shared/constants.js`, mirrored by `src/renderer/js/currencies.js`). Drifted
  literal `CURRENCY_SYMBOLS` tables were **removed** from:
    - `src/renderer/js/revenue-report.js`
    - `src/renderer/js/client-profitability.js`
  Committed + pushed (`81fdbf9`).
- Currency entries are EXACT-EQUAL shared↔renderer (20 codes, USD…AED); census
  `prepareCurrencySelect`/`CURRENCY_SYMBOLS` all derive from `window.CURRENCIES`.

---

## Phase 3 — Report PDF Export (DONE — verified end-to-end this session)

> **Census correction:** the "Missing renderers" census below is STALE. A prior
> session already implemented Phase 3; the only thing wrong was a **name mismatch** in
> `src/main/pdf-export.js` `module.exports` (`renderClientProfitabilityPdf` exported but
> the actual function is `renderClientProfitabilityReportPdf`) → `ReferenceError` at load,
> crashing `npm run dev`. Fixed (export name now matches the function). All chains
> verified fully present + `node --check` green.

### All three chains are COMPLETE and VERIFIED
1. `src/main/pdf-export.js` — `renderRevenueReportPdf` @1611, `renderProfitLossPdf`
   @1692, `renderClientProfitabilityReportPdf` @1765; all exported under their exact
   names in `module.exports` @2768–2770. `node -e require` → all 3 load.
2. `src/main/ipc-handlers.js` — `reports:exportRevenuePdf` @2236,
   `reports:exportProfitLossPdf` @2263, `reports:exportClientProfitabilityPdf` @2290
   (getter + renderer + save dialog + `fs.writeFileSync`).
3. `src/main/preload.js` — `exportRevenueReportPdf`/`exportProfitLossPdf`/
   `exportClientProfitabilityPdf` @162–164 (`ipcRenderer.invoke`).
4. `src/renderer/index.html` — `rrExportPdfBtn`, `plExportPdfBtn`,
   `cpExportPdfBtn` present (next to their Export-CSV buttons).
5. Renderers: `revenue-report.js`, `profit-loss.js`, `client-profitability.js` each
   bind its Export-PDF button → `window.electronAPI.export…Pdf`.

Verification this session: `node --check` on all 3 main + 3 renderer files; grep census
of preload exports + IPC channel names + HTML button ids + renderer listeners (all
present); `node -e` require of pdf-export.js (all 3 renderers resolve + user-facing
imports intact).

---

## Phase 4 — Version bump + release handoff (30 min; MOSTLY USER-RUN)

Target: add **PDF export buttons + IPC + preload + renderer wiring** for the three
reports, mirroring the *existing* Payments/Statement PDF chain. All three getters +
CSV exporters already exist; only PDF output is missing.

### Missing (verified MISSING via grep of `module.exports` names in pdf-export.js)
Three renderers do **not** exist yet:
- `renderRevenueReportPdf`
- `renderProfitLossPdf`
- `renderClientProfitabilityPdf`

### Chains to copy (VERIFIED, have exact signatures in `src/main/pdf-export.js`)
1. **Payments** (model): `getPaymentsReport` → `renderPaymentsPdf(report, profile, opts)`
   at L1552; draws header brand + `drawPaymentsTable` + totals via `drawTotals(ctx,{rows,grandLabel,grandValue,extra})`.
2. **Client Statement** (model): `getClientStatement` → `renderClientStatementPdf`
   at L1391; header brand + `drawClientStatementTable`/`drawTotals` + `drawFooter`.
   IPC: `reports:exportStatementPdf` handler at `ipc-handlers.js` ~L2207, preload at
   `preload.js` ~L161, renderer export button `csExportPdfBtn` in client-statements.js.

### IPC/preload anchors (VERIFIED)
- Getter IPC channels already present in `ipc-handlers.js`:
  `reports:revenue` (L2179), `reports:profitLoss` (L1296), `reports:clientProfitability` (L2189).
- Getter return shapes (read): revenue → `{ buckets, summary/summaries, period }`;
  profit-loss → `{ months, totalInvoiced, totalPaid, ... }`; client-profitability →
  `{ clients, summary, reportingCurrency }`.
- Preload already exposes `getRevenueReport/getProfitLossReport/getClientProfitabilityReport`
  (L158–160) — those call the getters above.
- PDF save dialog pattern to mirror: `reports:exportStatementPdf` (saves via
  `dialog.showSaveDialog`, writes buffer, returns `{ok,cancelled,savedPath}`).

### Wiring to add (each report = 6 points)
1. `src/main/pdf-export.js`: add the 3 renderers (reuse `drawHeaderBrand`,
   `drawDivider`, `drawTotals`, `drawPaymentsTable`-style grid, `drawFooter`, `money`,
   `formatDate` helpers in that file) + add to `module.exports`.
2. `src/main/ipc-handlers.js`: add `reports:exportRevenuePdf`,
   `reports:exportProfitLossPdf`, `reports:exportClientProfitabilityPdf` handlers that
   call the getters + renderer + showSaveDialog (mirror `reports:exportStatementPdf`).
3. `src/main/preload.js`: add 3 `export…Pdf` methods via `ipcRenderer.invoke`.
4. `src/renderer/index.html`: add `rrExportPdfBtn`, `plExportPdfBtn`, `cpExportPdfBtn`
   buttons next to existing `…ExportCsvBtn` buttons (grep the ids to find each row).
5. `src/renderer/js/revenue-report.js`, `profit-loss.js`, `client-profitability.js`:
   add click listeners calling `window.electronAPI.export…Pdf` (mirror client-statements).
6. Renderer helpers: money/currency formatting — reuse `window.QuoteCraftUtils`.

### Verify Phase 3
- `node --check` all edited files.
- Manual: Revenue Report → Export PDF, P&L → Export PDF, Client Profitability →
  Export PDF each produce a valid PDF via the save dialog.

---

## Phase 4 — Version bump + release handoff (30 min; MOSTLY USER-RUN)

Prereq: Phase 3 merged & green.
1. Confirm `package.json` version is `1.0.0`; create/append a `CHANGELOG.md` with a
   `1.1.0` entry (report PDF export + currency unification).
2. `npm run dist` → builds Windows NSIS installer (user-run, needs GUI/paths).
3. Tag + push: `git tag v1.1.0 && git push origin v1.1.0` (user-run).
4. Note release notes in the tag message.

---

## Gotchas re-checked this session
- Do NOT rename/relocate `src/shared/constants.js` — both PDF (`pdf-export.js:4`) and
  renderer `currencies.js` require it; it is the canonical currency list.
- Report getters return **buckets/[clients]/[months]** arrays; keep PDF column headers
  in sync with the CSV exporters (revenue-report.js / profit-loss.js /
  client-profitability.js) — that's how Phase 2 verified the currency tables.
- Tests: `scripts/test-*.js` = Node runner; all DB tests must set `TEST_DB_PATH`
  (test-theme.js exempt). Never commit scratch `.out`/census files (sweep
  `.out`, `_census*`, `__*.log`, `test-X.out*`).
