# QuoteCraft Production Readiness Roadmap

A step-by-step implementation guide to transition QuoteCraft from active development to a robust, scalable, production-grade desktop application.

---

## Overview of Stages

| Stage | Focus Area | Impact | Complexity |
|---|---|---|---|
| **Stage 1** | Packaging Stability, Logging & Auto-Updates | ✅ Completed | Medium |
| **Stage 2** | PDF Engine & Universal Typography | ✅ Completed | Low |
| **Stage 3** | Table Performance & Pagination | ✅ Completed | Medium |
| **Stage 4** | Backup Architecture Modernization | ✅ Completed | Medium |
| **Stage 5** | First-Run Onboarding & Multi-Currency Polish | 🟢 High UX | Low-Medium |
| **Stage 6** | Cross-Platform Distribution & Release QA | 🟢 Final Polish | Low |

---

## Stage 1: Packaging Stability, Logging & Auto-Updates (✅ COMPLETED)

Ensure the app runs reliably on any customer machine, provides diagnostics when errors occur, and can be updated automatically without reinstalling.

### 1.1 ASAR Unpack for WebAssembly (`sql.js`)
- **Problem:** `sql.js` loads `sql-wasm.wasm`. In packaged Electron ASAR archives, binary wasm files can fail to read or encounter execution permissions errors.
- **Action:**
  - Update `package.json` build configuration to unpack `.wasm` files outside the ASAR bundle:
    ```json
    "build": {
      "asar": true,
      "asarUnpack": [
        "**/*.wasm"
      ]
    }
    ```
- **Files Affected:** `package.json`
- **Verification:** Run `npm run dist:dir` and verify `dist/win-unpacked/resources/app.asar.unpacked/` contains the `.wasm` file and the app boots without database errors.

---

### 1.2 Structured Production File Logging (`electron-log`)
- **Problem:** In production, `console.error` writes to an inaccessible standard output. When users report crashes or bugs, no diagnostic log file exists.
- **Action:**
  - Install and configure `electron-log` (or custom file logger):
    - Direct `main` process logs to `%APPDATA%\quotecraft\logs\main.log`.
    - Catch `uncaughtException` and `unhandledRejection` and append to the log file.
    - Set log rotation (e.g. maximum file size 5MB, keep 3 backup files).
  - Add an IPC handler `logs:export` and an **"Export Diagnostic Logs"** button in **Settings > Advanced**.
- **Files Affected:**
  - `src/main/main.js`
  - `src/main/ipc-handlers.js`
  - `src/renderer/js/settings.js`
  - `src/renderer/index.html`
- **Verification:** Trigger an error, verify the log file is created in `%APPDATA%\quotecraft\logs`, and ensure the export button saves a copy.

---

### 1.3 Global Renderer Error Boundary
- **Problem:** An unhandled JavaScript error in any renderer script can leave the UI in a frozen or unresponsive state without user feedback.
- **Action:**
  - Add `window.onerror` and `window.addEventListener('unhandledrejection')` handlers in `utils.js` or `app.js`.
  - Log errors through the preload bridge to the main log file.
  - Display a non-intrusive toast or notification modal: *"An unexpected error occurred. [Reload Application]"*.
- **Files Affected:**
  - `src/renderer/js/utils.js`
  - `src/renderer/js/app.js`

---

### 1.4 Auto-Updater Pipeline (`electron-updater`)
- **Problem:** Without auto-updates, users cannot receive bug fixes or feature releases without manually downloading and reinstalling the software.
- **Action:**
  - Install `electron-updater`.
  - Configure GitHub Releases or generic provider in `package.json`:
    ```json
    "publish": {
      "provider": "github",
      "owner": "<repo-owner>",
      "repo": "quotecraft"
    }
    ```
  - In `src/main/main.js`, add update check on startup and background polling:
    - Listen to `update-available`, `download-progress`, `update-downloaded`.
    - Notify renderer via IPC so a banner or modal displays: *"A new version of QuoteCraft (v1.3.0) is ready to install. [Restart Now]"*.
- **Files Affected:**
  - `package.json`
  - `src/main/main.js`
  - `src/main/ipc-handlers.js`
  - `src/renderer/js/app.js`

---

## Stage 2: PDF Engine & Universal Typography (✅ COMPLETED)

Render all global currencies and international characters cleanly without fallback text.

### 2.1 Bundle an Open-Source Unicode Font in PDFKit
- **Problem:** PDFKit's default standard 14 fonts (Helvetica/Times) only support WinAnsi (ASCII/Latin-1). Currency symbols like Nigerian Naira (`₦`), Indian Rupee (`₹`), Korean Won (`₩`), and Russian Ruble (`₽`) currently fall back to plain text (`NGN 50,000.00`).
- **Action:**
  - Bundle a clean open-source font family (e.g. **Inter** or **Roboto** — Regular and Bold `.ttf`) in `src/renderer/assets/fonts/` or `assets/fonts/`.
  - In `src/main/pdf-export.js`, register the fonts:
    ```javascript
    doc.registerFont('QuoteCraft-Regular', path.join(__dirname, '../assets/fonts/Inter-Regular.ttf'));
    doc.registerFont('QuoteCraft-Bold', path.join(__dirname, '../assets/fonts/Inter-Bold.ttf'));
    ```
  - Replace `Helvetica` and `Helvetica-Bold` references with `QuoteCraft-Regular` and `QuoteCraft-Bold`.
  - Update `money(amount, currencyCode)` so supported Unicode symbols render directly rather than converting to ISO codes.
- **Files Affected:**
  - `src/main/pdf-export.js`
  - Assets directory (new `.ttf` files)
- **Verification:** Generate a PDF invoice set to NGN, INR, and EUR. Confirm that `₦`, `₹`, and `€` render crisp glyphs directly on the document.

---

## Stage 3: Table Performance & Pagination (✅ COMPLETED)

Maintain fast rendering as client databases grow over months and years.

### 3.1 Client-Side Pagination for Core Document Tables
- **Problem:** Invoices, quotes, expenses, payments, and time entries currently render every item directly into the DOM (`invoices.slice()`). A database with 500+ records will create hundreds of complex DOM nodes with dropdown menus, causing frame drops during filtering and tab switching.
- **Action:**
  - Implement a reusable table pagination helper in `utils.js` (e.g., page sizes: 25, 50, 100, or "All").
  - Add pagination controls (Previous, Next, Page Numbers, Items per Page) below:
    - Invoices table
    - Quotes table
    - Payments table
    - Expenses table
    - Time Entries table
- **Files Affected:**
  - `src/renderer/js/utils.js`
  - `src/renderer/js/invoices.js`
  - `src/renderer/js/quotes.js`
  - `src/renderer/js/payments.js`
  - `src/renderer/js/expenses.js`
  - `src/renderer/index.html`
- **Verification:** Populate test database with 200+ invoices and verify search filtering, page switching, and memory usage remain smooth.

---

### 3.2 Debounced / Safe Database Disk Writes
- **Problem:** `saveToDisk()` exports the entire in-memory SQLite database synchronously on every single mutation. Repetitive sequential edits (e.g. importing items or rapid bulk updates) cause redundant whole-database exports.
- **Action:**
  - Provide a safe batching/debounce option for bulk operations where multiple rows are written in a single transaction before flushing to disk once.
- **Files Affected:**
  - `src/main/database.js`

---

## Stage 4: Backup Architecture Modernization (✅ COMPLETED)

Ensure backups scale safely when users accumulate large attachments.

### 4.1 Transition from Base64 JSON to Standard ZIP Backups
- **Problem:** Current backups embed all file attachments as base64 strings inside a single `.json` file. If attachments total 50MB+, the base64 string consumes over 70MB of heap during `JSON.stringify` / `JSON.parse`, risking V8 memory crashes on lower-spec machines.
- **Action:**
  - Use a streaming zip library (such as `archiver` and `yauzl` or `adm-zip`):
    - Backup structure:
      ```
      quoteCraft-backup-2026-10-10.qcbackup (ZIP archive)
      ├── manifest.json       (metadata, app version, date)
      ├── database.sqlite     (clean SQLite binary)
      └── attachments/        (original binary files)
      ```
  - Maintain backward compatibility: when restoring, detect if the file is legacy JSON (`.json`) or new `.qcbackup` / `.zip`.
- **Files Affected:**
  - `src/main/auto-backup.js`
  - `src/main/attachments.js`
  - `src/main/ipc-handlers.js`
- **Verification:** Run auto-backup and manual backup/restore tests with several large attachments.

---

## Stage 5: First-Run Onboarding & Multi-Currency Polish

Make the initial experience intuitive and reduce friction for new users.

### 5.1 First-Time Setup Wizard
- **Problem:** On fresh installation, the user lands on an empty dashboard without clear next steps.
- **Action:**
  - Detect if `company_profile` is uninitialized or has only default values.
  - Present a clean, 3-step onboarding modal on first launch:
    1. **Company Identity:** Business Name, Email, Phone, Logo upload.
    2. **Localization:** Default Currency (e.g. NGN, USD, EUR), Date Format, Decimal Separator.
    3. **First Action:** "Create First Client" or "Explore Dashboard with Sample Data".
- **Files Affected:**
  - `src/renderer/index.html`
  - `src/renderer/js/app.js`
  - `src/renderer/styles/components.css`

---

### 5.2 Client-Specific Default Currency
- **Problem:** Invoices currently default to the company-wide currency unless manually changed per document. Businesses with international clients must re-select the currency every time.
- **Action:**
  - Add an optional `default_currency` field to the `clients` table (database migration).
  - Add a currency selector in the **Add/Edit Client** modal.
  - When creating a quote or invoice for a client, auto-select their preferred currency.
- **Files Affected:**
  - `src/main/database.js` (migration)
  - `src/renderer/js/clients.js`
  - `src/renderer/js/quotes.js`
  - `src/renderer/js/invoices.js`

---

### 5.3 Complete Data Export (Portability / GDPR)
- **Problem:** Users should own their business data with 1-click export.
- **Action:**
  - Add an **"Export All Business Data"** button in Settings.
  - Exports a single ZIP containing:
    - `clients.csv`
    - `invoices.csv`
    - `quotes.csv`
    - `payments.csv`
    - `expenses.csv`
    - `time_entries.csv`
- **Files Affected:**
  - `src/main/ipc-handlers.js`
  - `src/renderer/js/settings.js`

---

## Stage 6: Cross-Platform Distribution & Release QA

Finalize build configurations and smoke test all critical paths before public release.

### 6.1 Multi-Platform Build Configurations
- **Action:**
  - Add macOS and Linux build configurations in `package.json`:
    ```json
    "mac": {
      "target": ["dmg", "zip"],
      "icon": "build/icon.png",
      "category": "public.app-category.business"
    },
    "linux": {
      "target": ["AppImage", "deb"],
      "icon": "build/icon.png",
      "category": "Office"
    }
    ```
- **Files Affected:** `package.json`

---

### 6.2 Pre-Release Smoke Test Matrix

Before tagging a release, run through this checklist on the packaged installer (`dist/`):

- [ ] **Clean Install:** Install on a fresh machine (no pre-existing `%APPDATA%\quotecraft`).
- [ ] **First Launch:** Onboarding wizard appears and saves profile correctly.
- [ ] **Database Integrity:** Migrations run cleanly; `PRAGMA integrity_check` returns `ok`.
- [ ] **Document Lifecycle:** Create quote &rarr; Accept quote &rarr; Convert to invoice &rarr; Record payment.
- [ ] **PDF Output:** Export PDF invoice and verify currency symbols (`₦`, `$`, `€`, `£`) and layout.
- [ ] **Email Delivery:** Send invoice via configured SMTP with PDF attachment.
- [ ] **Backup & Restore:** Create backup &rarr; Delete an invoice &rarr; Restore backup &rarr; Verify invoice is restored with attachments intact.
- [ ] **App Lock:** Enable PIN/password, lock app, unlock app, restart app with lock active.
- [ ] **Single Instance:** Attempt to launch the app twice; verify second instance focuses the first without corrupting the database.
- [ ] **Data Preservation on Uninstall:** Uninstall and reinstall; confirm user data remains intact.
