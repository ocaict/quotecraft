# QuoteCraft Feature Roadmap & Implementation Plan

This roadmap outlines the recommended architectural upgrades and feature additions for QuoteCraft, organized into standalone, testable phases. Each phase can be executed sequentially with zero regressions to the existing offline-first vanilla JS stack.

---

## Overview of Roadmap Phases

| Phase | Feature | Focus Area | Status | Impact |
| :---: | :--- | :--- | :---: | :---: |
| **Phase 1** | **CSV Data Portability Hub** | Import clients & export tax/accounting data | ✅ **Completed** | ⭐⭐⭐⭐⭐ |
| **Phase 2** | **Visual Dashboard Cash Flow Chart** | Interactive SVG cash flow & revenue trends | ✅ **Completed** | ⭐⭐⭐⭐⭐ |
| **Phase 3** | **PDF Branding & Template Styles** | Brand accent colors & document layout presets | ✅ **Completed** | ⭐⭐⭐⭐ |
| **Phase 4** | **Multi-Currency Document Billing** | Foreign currency invoicing with base P&L snapshot | ✅ **Completed** | ⭐⭐⭐⭐ |
| **Phase 5** | **In-App Quick Document Preview & HTML Receipts** | Instant preview modal & shareable HTML invoice | ⏳ Planned | ⭐⭐⭐⭐ |

---

## Phase 1: CSV Data Portability Hub (Import & Export) — ✅ COMPLETED

### Objective
Enable frictionless onboarding from other software (Excel, QuickBooks, Wave) and seamless annual tax reporting by providing robust CSV import and export capabilities.

### 1. Client & Line Item CSV Import
* **CSV Parsing**: Native Node.js parser with support for standard comma/semicolon delimiters and quoted strings.
* **Column Mapping Wizard**:
  * Auto-detect columns: `Name`, `Email`, `Phone`, `Address`, `City`, `State`, `Currency`, `Notes`.
  * Visual mapping confirmation dialog before inserting records.
* **Validation & Deduplication**:
  * Check existing clients by email or phone.
  * Options: `Skip duplicates`, `Overwrite existing`, or `Import as new`.
* **Line Item Library Import**:
  * Columns: `Description`, `Unit Price`, `Tax Rate`, `Category`.

### 2. Accounting & Tax CSV Exports
* **Export Datasets**:
  1. **Invoices Ledger**: Invoice number, client name, issue date, due date, subtotal, tax, discount, total, amount paid, balance due, status.
  2. **Payments Received**: Payment date, invoice number, client, payment method, reference, notes, amount.
  3. **Expenses Ledger**: Date, category, vendor, amount, tax, billable status, client name, invoice number.
  4. **Time Tracking Log**: Date, project, client, duration (hours), billable rate, total, status.
* **Filter Controls**: Date range filter (This Month, Last Quarter, Year-to-Date, Custom Range).
* **Save Location**: Native OS file picker (`dialog.showSaveDialog`).

### File Targets:
- `src/main/csv-service.js` (core import/export business logic)
- `src/main/database.js` (bulk insertion transactions)
- `src/main/ipc-handlers.js` (IPC channels: `csv:importClients`, `csv:exportLedger`)
- `src/renderer/js/settings.js` & `src/renderer/index.html` (UI in *Backups & Portability*)
- `scripts/test-csv-portability.js` (automated test suite)

---

## Phase 2: Visual Dashboard Analytics & Cash Flow Chart — ✅ COMPLETED

### Objective
Upgrade the Dashboard from static numerical stat cards to an insightful, interactive financial overview without introducing heavy external charting dependencies.

### 1. Lightweight Vanilla SVG Charting
* Zero external dependencies: pure math-to-SVG `<svg viewBox="...">` path rendering.
* **Chart Types**:
  * **Monthly Cash Flow**: Dual-bar or smoothed area chart comparing **Money In (Payments)** vs **Money Out (Expenses)** over the last 6 or 12 months.
  * **Net Income Sparkline**: Trend line showing net profit month-over-month.

### 2. Interactions & Data Controls
* **Time Range Selector**: Toggle between `Last 6 Months`, `Last 12 Months`, and `Year to Date`.
* **Hover Tooltips**: Floating glassmorphic tooltip displaying exact dates, revenue, expenses, and net profit.
* **Empty State**: Elegant empty graphic and placeholder when new accounts have fewer than 2 months of records.

### 3. Database Layer
* Single optimized SQL aggregation query grouping payments and expenses by `strftime('%Y-%m', date)`.
* Fully compatible with offline SQLite/sql.js WASM.

### File Targets:
- `src/main/database.js` (`getCashFlowTimeline(months)`)
- `src/renderer/js/dashboard.js` & `src/renderer/js/cashflow-chart.js` (SVG path generator & tooltip listener)
- `src/renderer/styles/components.css` (responsive chart styling & animations)
- `scripts/test-cashflow-analytics.js` (unit tests)

---

## Phase 3: PDF Document Branding & Template Customization — ✅ COMPLETED

### Objective
Allow businesses and creative agencies to align quotes and invoices with their brand identity by introducing custom color accents and document layout templates.

### 1. Brand Accent Color Picker
* Add brand primary color setting in **Settings > Company Profile**.
* Preset color swatches (Classic Navy, Emerald Green, Slate Modern, Crimson, Royal Purple, Custom Hex).
* Applies dynamically to generated PDF tables, header dividing lines, and totals callout boxes.

### 2. Document Layout Styles
* **Modern Minimalist (Default)**: Clean typography, subtle lines, generous whitespace, colored total badge.
* **Classic Corporate**: Traditional formal invoice structure with boxed client/company tables and double-bordered bottom totals.
* **Compact Service**: Dense single-page layout optimized for freelance hourly jobs and compact printing.

### 3. Live Document Preview
* Add an interactive preview thumbnail in Settings showing real-time changes to company font and accent color.

### File Targets:
- `src/main/pdf-generator.js` (layout rendering engines)
- `src/main/database.js` (company profile migration for `pdf_accent_color` and `pdf_template_style`)
- `src/renderer/js/settings.js` (color picker & layout selector)
- `scripts/test-pdf-theme.js` (assert PDF layout variations)

---

## Phase 4: Multi-Currency Invoicing & Exchange Rate Snapshots — ✅ COMPLETED

### Objective
Empower contractors and agencies who bill international clients in USD, EUR, or GBP while tracking local business accounts and tax reporting in their domestic currency (e.g., NGN).

### 1. Per-Document Currency Override
* In Quote & Invoice editor, allow changing document currency independently of company base currency.
* Support symbol formatting and formatting rules (e.g., `$1,250.00`, `€1.250,00`, `£1,250.00`, `₦1,250,000.00`).

### 2. Base Currency Snapshot & Exchange Rate
* When issuing in a foreign currency, provide an optional **Exchange Rate Snapshot** field (e.g., `1 USD = 1,480 NGN`).
* Allows reports (Revenue, Profit & Loss, Client Profitability) to accurately compute total business earnings in the company's base currency without distorting ledger totals.

### 3. Bank Account Mapping
* Automatically recommend NUBAN local bank presets for domestic currency, and foreign Domiciliary accounts (IBAN/SWIFT) when a foreign currency is selected.

### File Targets:
- `src/main/database.js` (schema migration: `currency`, `exchange_rate`, `base_amount_cents`)
- `src/main/pdf-generator.js` (format per-document currency)
- `src/renderer/js/invoices.js` & `src/renderer/js/quotes.js` (currency dropdown & rate input)
- `scripts/test-multi-currency.js` (tests for cross-currency math)

---

## Phase 5: In-App Document Quick Look & Shareable HTML Receipts

### Objective
Eliminate the friction of opening external PDF reader programs just to review an invoice, and provide lightweight, modern web-native receipt sharing.

### 1. In-App Document Quick Look Preview
* Instant modal dialog (`#docPreviewModal`) rendering generated document pages directly inside the desktop app.
* Actions: `Print Immediately`, `Save to Disk…`, `Send via Email`, `Share via WhatsApp`.
* Zero external viewer dependencies.

### 2. Standalone Shareable HTML Invoice / Receipt
* In addition to PDF, export a standalone `.html` receipt.
* Fully styled, self-contained single file that clients can open on mobile phones, tablets, or laptops.
* Includes dynamic payment links (Paystack online payment button) when credentials are configured.

### File Targets:
- `src/renderer/js/document-preview.js` & `src/renderer/styles/document-preview.css`
- `src/main/receipt-generator.js` (standalone HTML template compiler)
- `src/renderer/index.html` (modal markup)
- `scripts/test-document-preview.js`

---

## Recommended Execution Order

1. **Step 1**: Phase 1 — CSV Data Portability Hub (High user demand, tax season value).
2. **Step 2**: Phase 2 — Dashboard Visual Cash Flow Chart (Immediate visual WOW factor).
3. **Step 3**: Phase 3 — PDF Document Branding & Templates (Professional brand touch).
4. **Step 4**: Phase 4 — Multi-Currency Document Billing (Commercial growth).
5. **Step 5**: Phase 5 — In-App Document Quick Look & HTML Receipts (Workflow refinement).
