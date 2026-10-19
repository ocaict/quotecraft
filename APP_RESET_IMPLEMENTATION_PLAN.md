# QuoteCraft — Application Reset Implementation Plan (Tier A & Tier B)

## Overview & Executive Summary

This document specifies the end-to-end design and implementation strategy for adding application reset capabilities to QuoteCraft. It establishes a two-tier model that balances usability, data security, and enterprise-grade safeguards for offline-first accounting software.

---

## 1. Feature Architecture & Tier Definitions

```
                     ┌───────────────────────────────────────────────┐
                     │            QuoteCraft Application             │
                     └───────────────────────┬───────────────────────┘
                                             │
                   ┌─────────────────────────┴─────────────────────────┐
                   ▼                                                   ▼
       ┌───────────────────────────┐                       ┌───────────────────────────┐
       │   Tier A: Preferences     │                       │  Tier B: Factory Reset    │
       │   "Reset App Settings"    │                       │   "Erase All Data"        │
       ├───────────────────────────┤                       ├───────────────────────────┤
       │ • Reverts Numbering & Tax │                       │ • Auto Pre-Reset Backup   │
       │ • Reverts Theme & PDF     │                       │ • Wipes All DB Tables     │
       │ • Reverts Backups & UI    │                       │ • Clears Logo & Files     │
       │ • Business Data INTACT    │                       │ • Retains Pro License     │
       │ • Fast, Safe, Instant     │                       │ • Type "RESET" to confirm │
       └───────────────────────────┘                       └───────────────────────────┘
```

### Tier A: Reset Preferences & Defaults (Safe / Non-Destructive)
- **Objective**: Revert application configuration and UI preferences to clean initial defaults without altering or deleting any user documents or business relationships.
- **Scope of Changes**:
  - `company_profile` defaults: `invoice_prefix` ('INV-'), `quote_prefix` ('Q-'), `invoice_start_number` (1), `default_tax_rate` (0), `default_hourly_rate` (null), `default_currency` ('USD'), `pdf_accent_color` ('#0ea5e9'), `pdf_layout_style` ('standard').
  - Appearance: Reset theme to system default.
  - Auto-Backup settings: Reset schedule to daily, retain count to 7.
- **Data Preserved**:
  - Company identity: Business name, address, email, phone, tax ID, bank details, Paystack keys.
  - All clients and contacts.
  - All quotes, invoices, line items, and payment transactions.
  - All expenses, time tracking entries, projects, and credit notes.
  - Uploaded logo and attachments.
  - Pro license key & entitlement token.

### Tier B: Factory Reset & Data Wipe (Danger Zone / Destructive)
- **Objective**: Return QuoteCraft to a completely clean, pristine first-launch state (ideal for starting a new fiscal year or preparing a machine for transfer).
- **Scope of Changes**:
  - Purge all records from database tables: `clients`, `client_contacts`, `client_notes`, `quotes`, `quote_line_items`, `invoices`, `invoice_line_items`, `payments`, `expenses`, `time_entries`, `projects`, `items`, `credit_notes`, `audit_log`, `attachments`.
  - Reset `company_profile` to empty placeholder state.
  - Delete physical files from `%APPDATA%\quotecraft\logo\` and `%APPDATA%\quotecraft\attachments\`.
  - Re-run all database schema migrations to ensure fresh table integrity.
  - Trigger Onboarding Wizard on next view or restart.
- **Essential Safeguards**:
  1. **Automatic Pre-Reset Safety Backup**: Before any destructive query executes, the app creates a timestamped zip archive (`pre-reset-backup-<timestamp>.quotecraft.zip`) in the user's `backups/` directory. If the user regrets the decision, they can click "Restore from Backup" and immediately recover.
  2. **Pro License Retention (Enabled by Default)**: Users checking `[x] Keep my Pro License activation` retain their Crockford base32 license key and local Ed25519 entitlement token so they do not lose access to commercial features.
  3. **High-Friction Confirmation**: Requires the user to type `"RESET"` into an interactive input box before the destructive action button unlocks.

---

## 2. UI & UX Placement

### Location in Settings
The Reset section will live inside **Settings → Security & Data → Backups & Export** (`subtab="backup"`), positioned directly underneath the backup cards:
1. Card 1: *Backup & Restore* (Export / Restore)
2. Card 2: *Automatic Backups* (Schedule / Folder)
3. Card 3: *Data Portability Hub* (CSV Import / Export)
4. **Card 4: Application Reset & Danger Zone (New)**

### Visual Hierarchy & Component Mockup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ⚠️ Danger Zone & Reset Options                                               │
│ Manage application defaults or perform a full factory reset.                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Reset Preferences & Defaults                                               │
│  Revert invoice numbering, default tax rates, theme, and UI settings        │
│  to factory defaults. Your clients, quotes, and invoices are NOT affected.  │
│  [ Reset Preferences ]                                                      │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Factory Reset (Erase All Business Data)                                    │
│  Permanently deletes all clients, quotes, invoices, payments, expenses,    │
│  and attachments. A timestamped safety backup is created automatically.     │
│                                                                             │
│  [✓] Preserve Pro License activation                                        │
│  [ Erase All Data & Reset App... ]  (Danger / Red Button)                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Confirmation Modal (`#resetConfirmModal`)
- Modal with warning icon and red accent header.
- Summary bullet points showing what will be erased:
  - 🗑️ All clients, quotes, invoices, and payments
  - 🗑️ All expenses, time entries, and project records
  - 🗑️ Uploaded logo and document attachments
  - 💾 Automatic safety backup will be stored in your backups folder
- Input field: `Type RESET to confirm:`
- Buttons: `Cancel` (Ghost) and `Permanently Erase & Reset` (Red button, disabled until `"RESET"` matches).

---

## 3. Technical Specifications

### A. Data Layer (`src/main/database.js`)

1. **`resetPreferencesToDefault()`**:
   - Reverts specific columns in `company_profile`:
     ```sql
     UPDATE company_profile SET
       invoice_prefix = 'INV-',
       invoice_start_number = 1,
       quote_prefix = 'Q-',
       default_tax_rate = 0,
       default_hourly_rate = NULL,
       pdf_accent_color = '#0ea5e9',
       pdf_layout_style = 'standard',
       theme = 'system',
       updated_at = ?
     WHERE id = 1
     ```
   - Adds an entry to `audit_log` recording preferences reset.
   - Saves changes immediately to disk.

2. **`factoryResetDatabase({ preserveLicense = true })`**:
   - **Step 1 (Safety Snapshot)**: Calls `autoBackupScheduler` / zip backup generator to write `pre-reset-backup-${timestamp}.quotecraft.zip` into `getBackupsDir()`.
   - **Step 2 (License Snapshot)**: If `preserveLicense` is true, extracts `license_info` row (`SELECT * FROM license_info WHERE id = 1`).
   - **Step 3 (Recreate Database)**:
     - Closes existing SQL database connection.
     - Initializes brand new in-memory `new SQL.Database()`.
     - Executes `createTables()`, `runMigrations()`, and `seedDefaults()`.
   - **Step 4 (Restore License)**:
     - If preserved license exists, writes it back into the fresh `license_info` table.
   - **Step 5 (Clean Filesystem)**:
     - Clears contents of `getAttachmentsDir()`.
     - Deletes logo file from `getLogoDir()` if present.
   - **Step 6 (Save to Disk)**:
     - Calls `saveToDiskImmediate()` to flush clean SQLite database over `quotecraft.sqlite`.

### B. IPC Channel Layer (`src/main/ipc-handlers.js`)

- `settings:resetPreferences`:
  - Calls `resetPreferencesToDefault()`.
  - Returns `{ ok: true, profile: getCompanyProfile() }`.
- `settings:factoryReset`:
  - Accepts `{ preserveLicense: boolean }`.
  - Calls `factoryResetDatabase({ preserveLicense })`.
  - Returns `{ ok: true, backupPath, licensePreserved }`.

### C. Preload Bridge (`src/main/preload.js`)

- `resetAppPreferences: () => ipcRenderer.invoke('settings:resetPreferences')`
- `factoryResetApp: (options) => ipcRenderer.invoke('settings:factoryReset', options)`

### D. Renderer Controller (`src/renderer/js/settings.js`)

- Handles click on `#resetPreferencesBtn`:
  - Prompts with native confirmation dialog.
  - Disables button, calls `window.electronAPI.resetAppPreferences()`.
  - Shows success toast and re-renders settings forms.
- Handles click on `#factoryResetBtn`:
  - Opens `#resetConfirmModal`.
  - Listens to `#resetConfirmInput` `input` event to toggle `#resetConfirmSubmitBtn.disabled`.
  - On confirm:
    - Shows busy spinner overlay: *"Creating safety backup & resetting QuoteCraft..."*.
    - Calls `window.electronAPI.factoryResetApp({ preserveLicense })`.
    - Closes modal, shows success toast with backup location.
    - Triggers `window.location.reload()` to reinitialize the UI from clean state.

---

## 4. Test Strategy (`scripts/test-app-reset.js`)

A dedicated automated test suite running under plain Node will verify:

1. **Preferences Reset (Tier A)**:
   - Configures non-default numbering prefixes (`XYZ-`), tax rate (15%), and layout.
   - Calls `resetPreferencesToDefault()`.
   - Asserts prefixes return to `INV-` and `Q-`, tax rate returns to `0`.
   - Asserts clients and invoices created previously are completely intact.
2. **Factory Reset (Tier B)**:
   - Populates database with sample client, sample invoice, sample payment, and sample license.
   - Calls `factoryResetDatabase({ preserveLicense: true })`.
   - Asserts tables `clients`, `invoices`, `payments` now have 0 rows.
   - Asserts `license_info` retains the license key and entitlement.
   - Asserts safety backup file was created on disk in test directory.
3. **Full License Wipe (Tier B with preserveLicense: false)**:
   - Asserts license table is wiped when option is unchecked.

---

## 5. Implementation Roadmap Checklist

- [x] **Step 1: Backend Functions** in `src/main/database.js` (`resetPreferencesToDefault`, `factoryResetDatabase`).
- [x] **Step 2: IPC Handlers** in `src/main/ipc-handlers.js` (`settings:resetPreferences`, `settings:factoryReset`).
- [x] **Step 3: Preload Methods** in `src/main/preload.js` (`resetAppPreferences`, `factoryResetApp`).
- [x] **Step 4: UI Markup** in `src/renderer/index.html` (Danger Zone Card & `#resetConfirmModal`).
- [x] **Step 5: Styling** in `src/renderer/styles/settings.css` (Danger card styles, red destructive button, typed input validation).
- [x] **Step 6: Renderer Script** in `src/renderer/js/settings.js` (Event handlers, validation, reload).
- [x] **Step 7: Automated Tests** in `scripts/test-app-reset.js`.
- [x] **Step 8: Full Regression Run** across all 53 test suites.
