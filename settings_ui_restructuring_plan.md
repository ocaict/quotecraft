# QuoteCraft Settings UI Redesign & Restructuring Plan

## 1. Executive Summary & Problem Analysis

QuoteCraft's current settings page (`#page-settings`) is a single, monolithic form containing **18 distinct cards** stretching across more than 900 lines of HTML. It mixes business identity, payment gateways, invoice prefixes, visual themes, SQLite database diagnostics, software updates, and commercial licensing into an endless vertical scroll.

### Key Pain Points in the Current UI

1. **Misleading Sidebar Labeling**: In the main sidebar under "Settings & System", the page is labeled `"Company Profile"`, yet it houses everything from App Lock PINs and SQLite health diagnostics to Electron auto-updates and Pro license activations.
2. **The "Save Button at the Bottom" Problem**: If a user updates their Business Name or Address at the top, they must scroll past 17 cards (past banking, tax, numbering, appearance, shortcuts, app locks, backups, diagnostics, data exports, updates, and licensing) just to reach the primary `<button type="submit">Save settings</button>` at line 3518.
3. **Fragmented Saving Semantics**:
   - `settingsForm` fields (profile, bank, numbering, appearance, defaults) are saved via the bottom form submit button.
   - Time Tracking has its own individual `Save timer settings` button.
   - App Lock has its own `Save PIN` and `Turn lock off` buttons.
   - Auto-backup has its own `Save` and `Back up now` buttons.
   - Diagnostics, Updates, and Licensing each have independent interactive buttons.
   Mixing all these inside one giant `<form id="settingsForm">` creates cognitive overload and styling conflicts.
4. **Scattered Payment Settings**: Nigerian NUBAN details, foreign Domiciliary wire details, Paystack gateway configuration, and payment text presets are broken across three separate cards interleaved with unrelated sections.
5. **Static Information Mixed with Transactional Controls**: Keyboard shortcuts reference table sits in the middle of active configuration cards.

---

## 2. Benchmark: Modern Electron App Patterns

Leading desktop apps (**Linear**, **Raycast**, **Figma**, **Slack**, and **macOS System Settings**) converge on a standardized, elegant pattern for complex desktop preferences:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Settings                                                   [Save Changes]   │
├───────────────────┬─────────────────────────────────────────────────────────┤
│ 🔍 Search settings│                                                         │
│                   │   🏢 Company Profile                                    │
│ GENERAL           │   ──────────────────────────────────────────────────    │
│ 🏢 Profile        │   Basic business details shown on quotes and invoices.  │
│ ⚙️ Defaults       │                                                         │
│ 🎨 Appearance     │   ┌─────────────────────────────────────────────────┐   │
│                   │   │ Business Name *         CAC / RC Number         │   │
│ BILLING & PAYMENTS│   │ [ Acme Studio Ltd     ] [ RC 1234567          ] │   │
│ 🏦 Bank Accounts  │   └─────────────────────────────────────────────────┘   │
│ 💳 Paystack       │   ┌─────────────────────────────────────────────────┐   │
│ 📝 Presets        │   │ Company Logo                                    │   │
│                   │   │ [ Logo Preview ]  [ Choose Logo ] [ Remove ]    │   │
│ WORKFLOW          │   └─────────────────────────────────────────────────┘   │
│ 🔢 Numbering      │                                                         │
│ ⏱️ Time Tracking   │                                                         │
│ ⌨️ Shortcuts      │                                                         │
│                   │                                                         │
│ SECURITY & DATA   │                                                         │
│ 🔒 App Lock       │                                                         │
│ 💾 Backups & Data │                                                         │
│                   │                                                         │
│ SYSTEM            │                                                         │
│ 🛠️ Diagnostics    │                                                         │
│ 🔄 Updates        │                                                         │
│ ⚡ License & Plan │                                                         │
└───────────────────┴─────────────────────────────────────────────────────────┘
```

### Core Design Principles to Adopt:
- **Two-Column Master-Detail Layout**: Vertical category sub-navigation on the left (220px–240px wide) with icons and section group headers, paired with a focused, readable content canvas on the right (max-width 780px for optimal form typography).
- **Persistent Header with Sticky Save Status**: A unified settings header showing the current active section title and a sticky "Save Changes" action bar whenever uncommitted changes exist.
- **Deep-Link Compatibility**: Seamless support for existing shortcuts and prompts (e.g. Command Palette `?` jumps to Shortcuts, Client limit prompt jumps to License tab, Onboarding jumps to Profile tab) by switching the active sub-tab automatically.
- **Strict Separation of Concerns**: Isolating independent async actions (Diagnostics, Backups, License, PIN Lock) into their own dedicated tabs so they don't interfere with the core company profile form.

---

## 3. Proposed Categorization & Grouping Structure

We will reorganize the 18 settings cards into **6 cohesive, intuitive categories**:

### Group 1: General (`profile`, `defaults`, `appearance`)
- **🏢 Company Profile**:
  - Business Name, CAC / RC Number, Tax Identification Number (TIN).
  - Logo upload preview & action buttons.
  - Physical & Mailing Address (Address 1 & 2, City, State, Postal Code, Country).
  - Public Contact (Phone, Email, Website).
- **⚙️ Regional & Defaults**:
  - Default Currency & Reporting Base Currency (with auto-sync).
  - Default Tax Rate (with one-click 7.5% Nigerian VAT button).
  - Default Hourly Rate.
  - Default Payment Terms & Quote Acceptance Instructions.
  - Date Format & Decimal Separator (`.` vs `,`).
- **🎨 Appearance & PDF Themes**:
  - Application Theme (System / Light / Dark radio cards with visual cues).
  - PDF Document Theme (Classic / Modern / Minimal / Branded Dark interactive preview cards).

### Group 2: Payments & Banking (`banking`, `paystack`, `presets`)
- **🏦 Bank Accounts (Direct Transfer)**:
  - 🇳🇬 Nigerian Bank Account (NUBAN): Quick bank datalist picker, 10-digit account number with live validation hint, beneficiary name.
  - 🌐 Domiciliary Account: For USD / GBP / EUR international wires (Bank, Account/IBAN, Beneficiary, SWIFT/BIC, Intermediary routing).
  - Fallback payment notes textarea.
- **💳 Paystack Online Payments**:
  - Enable/Disable toggle switch.
  - Public Key & Encrypted Secret Key input with live status indicator.
  - Fallback Payment Page URL.
  - "Test Connection" button with live status indicator.
- **📝 Payment Presets**:
  - Reusable payment blurbs for quotes/invoices (manage, add, edit, delete modals).

### Group 3: Workflow & Tools (`numbering`, `timetracking`, `shortcuts`)
- **🔢 Document Numbering**:
  - Invoice prefix & start number.
  - Quote prefix & start number.
  - Credit Note prefix & start number.
  - Zero-padding digit selector (e.g., `4` → `INV-0001`).
  - "Include Year in Number" toggle switch.
- **⏱️ Time Tracking**:
  - Stopped timer rounding rules (no rounding, 1m, 5m, 6m / 0.1h, 10m, 15m, 30m).
  - Dedicated timer settings save button and current status text.
- **⌨️ Keyboard Shortcuts**:
  - Clean, searchable cheat sheet table with modern `<kbd>` badges for all desktop shortcuts (`N`, `I`, `C`, `Ctrl+S`, `/`, `?`).

### Group 4: Security & Access (`applock`)
- **🔒 App Lock (PIN)**:
  - Require PIN on startup toggle.
  - Current PIN, New PIN, Confirm PIN.
  - Inactivity auto-lock dropdown (1m, 2m, 5m, 10m, 15m, 30m, Never).
  - Warning banner regarding offline zero-cloud recovery.

### Group 5: Backup & Data (`backups`, `export`)
- **💾 Backup & Restore**:
  - Manual Export Backup & Restore from Backup buttons with safety confirmation modal.
  - Automated rolling background backups (Schedule: daily/on-close, Retention count: 3–30, folder picker, Default folder button, Run backup now).
  - Recent automated backups list.
- **📦 Data Portability (GDPR)**:
  - One-click ZIP export containing all clients, quotes, invoices, payments, expenses, and time entries as clean CSV files.

### Group 6: System & Plan (`diagnostics`, `updates`, `license`)
- **🛠️ System Diagnostics & Health**:
  - Metric health cards: App Version, SQLite DB Integrity, Database File Size, Attachments Disk Usage.
  - Verify Database button, Export Diagnostic JSON report, Export Application Logs (`.log`).
- **🔄 Software Updates**:
  - Current version badge, update status message.
  - Check for Updates button, Restart & Install button, animated download progress bar.
- **⚡ QuoteCraft Pro License**:
  - License status badge (Free Tier vs Pro Active).
  - Active device details (Serial, Plan, Issued Date, Expiration, 30-Day Offline Grace status).
  - Free vs Pro feature comparison matrix.
  - Pricing cards (Lifetime vs Annual).
  - 20-character Crockford base32 key activation form (`QC-XXXXX-XXXXX-XXXXX-XXXXX`).
  - Refresh and Deactivate buttons.

---

## 4. Architectural & Implementation Strategy

### A. Navigation & DOM Structure
Within `src/renderer/index.html`:
- Rename the sidebar link text from `"Company Profile"` to `"Settings"` (or `"Settings & Profile"`), retaining `data-page="settings"` so all existing routing logic in `app.js` and `utils.js` works identically.
- Inside `<section id="page-settings" class="page">`, replace the flat vertical stack with a modern two-column shell:
  ```html
  <div class="settings-layout">
    <!-- Left: Sub-Navigation Sidebar -->
    <nav class="settings-subnav" id="settingsSubnav" aria-label="Settings navigation">
      <div class="settings-nav-group">
        <span class="settings-nav-title">General</span>
        <button type="button" class="settings-nav-item active" data-subtab="profile">
          <svg ...></svg> <span>Company Profile</span>
        </button>
        <button type="button" class="settings-nav-item" data-subtab="defaults">
          <svg ...></svg> <span>Regional & Defaults</span>
        </button>
        <button type="button" class="settings-nav-item" data-subtab="appearance">
          <svg ...></svg> <span>Appearance & Themes</span>
        </button>
      </div>

      <div class="settings-nav-group">
        <span class="settings-nav-title">Payments</span>
        <button type="button" class="settings-nav-item" data-subtab="banking">
          <svg ...></svg> <span>Bank Accounts</span>
        </button>
        <button type="button" class="settings-nav-item" data-subtab="paystack">
          <svg ...></svg> <span>Paystack Integration</span>
        </button>
        <button type="button" class="settings-nav-item" data-subtab="presets">
          <svg ...></svg> <span>Payment Presets</span>
        </button>
      </div>

      <div class="settings-nav-group">
        <span class="settings-nav-title">Workflow</span>
        <button type="button" class="settings-nav-item" data-subtab="numbering">
          <svg ...></svg> <span>Document Numbering</span>
        </button>
        <button type="button" class="settings-nav-item" data-subtab="timetracking">
          <svg ...></svg> <span>Time Tracking</span>
        </button>
        <button type="button" class="settings-nav-item" data-subtab="shortcuts">
          <svg ...></svg> <span>Shortcuts</span>
        </button>
      </div>

      <div class="settings-nav-group">
        <span class="settings-nav-title">Security & Data</span>
        <button type="button" class="settings-nav-item" data-subtab="applock">
          <svg ...></svg> <span>App Lock (PIN)</span>
        </button>
        <button type="button" class="settings-nav-item" data-subtab="backup">
          <svg ...></svg> <span>Backups & Portability</span>
        </button>
      </div>

      <div class="settings-nav-group">
        <span class="settings-nav-title">System</span>
        <button type="button" class="settings-nav-item" data-subtab="diagnostics">
          <svg ...></svg> <span>Diagnostics & Health</span>
        </button>
        <button type="button" class="settings-nav-item" data-subtab="updates">
          <svg ...></svg> <span>Software Updates</span>
        </button>
        <button type="button" class="settings-nav-item" data-subtab="license">
          <svg ...></svg> <span>Pro License</span>
          <span id="subnavLicenseBadge" class="settings-nav-badge">Free</span>
        </button>
      </div>
    </nav>

    <!-- Right: Focused Content Panes -->
    <div class="settings-content-wrapper">
      <!-- Sticky / Fixed Header with Save Button for Form Panes -->
      <div class="settings-pane-header">
        <div>
          <h2 id="settingsPaneTitle">Company Profile</h2>
          <p id="settingsPaneSubtitle" class="subtitle">This information appears on every quote and invoice you generate.</p>
        </div>
        <div class="settings-pane-actions" id="settingsFormActions">
          <button type="submit" form="settingsForm" id="settingsHeaderSaveBtn" class="btn btn-primary">Save Changes</button>
        </div>
      </div>

      <!-- Settings Panes (All inside or coordinated with settingsForm) -->
      <div class="settings-panes">
        <div class="settings-pane active" id="pane-profile">...</div>
        <div class="settings-pane" id="pane-defaults">...</div>
        <div class="settings-pane" id="pane-appearance">...</div>
        <div class="settings-pane" id="pane-banking">...</div>
        <div class="settings-pane" id="pane-paystack">...</div>
        <div class="settings-pane" id="pane-presets">...</div>
        <div class="settings-pane" id="pane-numbering">...</div>
        <div class="settings-pane" id="pane-timetracking">...</div>
        <div class="settings-pane" id="pane-shortcuts">...</div>
        <div class="settings-pane" id="pane-applock">...</div>
        <div class="settings-pane" id="pane-backup">...</div>
        <div class="settings-pane" id="pane-diagnostics">...</div>
        <div class="settings-pane" id="pane-updates">...</div>
        <div class="settings-pane" id="pane-license">...</div>
      </div>
    </div>
  </div>
  ```

### B. Preserving Form Semantics & Existing IDs
- **HTML Form Preservation**: All fields (inputs, selects, datalists) retain their exact `name` and `id` attributes. The form `#settingsForm` wraps or associates via HTML5 `form="settingsForm"` so `collectForm()` in `settings.js` continues to gather 100% of values without breaking.
- **Save Button**: `<button type="submit" form="settingsForm">` allows the save button to sit in the sticky pane header, so the user never has to scroll to save. When switching to non-form tabs (like Shortcuts, Diagnostics, or Updates), the save button simply hides gracefully.
- **Deep-Linking / Target Scroll**:
  Expose `window.QuoteCraftSettings = { switchSubtab(subtabId, targetElementId) }`.
  - When Command Palette triggers `help-shortcuts`, it calls `switchSubtab('shortcuts', 'shortcutsCard')`.
  - When Client Limit modal triggers upgrade, it calls `switchSubtab('license', 'licenseCard')`.
  - When Dashboard Onboarding runs, it opens `settings` at `switchSubtab('profile')`.

### C. Visual Aesthetics & Polish (Modern CSS)
- **Subnav Styling**:
  - Sleek background using `var(--bg-elevated)` or slightly darker `var(--bg)`.
  - Subtle category uppercase titles (`font-size: 11px`, `letter-spacing: 0.06em`, `color: var(--text-muted)`).
  - Nav items with smooth hover state, icon integration, active pill indicator (left accent line or active background pill), and badge indicators (e.g. "Pro" badge).
- **Pane Layout**:
  - Max-width constraint (`800px`) so wide widescreen desktop monitors don't stretch single text fields across 1920 pixels.
  - Card designs updated to modern card style: subtle border (`1px solid var(--border)`), soft shadow, refined padding, clear field groupings with `display: grid`.
- **Responsive / Flexible**:
  - If the window is resized down, subnav and content remain comfortably readable with scrollable content panes.

---

## 5. Phased Rollout Plan

### Phase 1: Structure & CSS Framework (Zero breaking changes)
1. Add `.settings-layout`, `.settings-subnav`, `.settings-panes`, `.settings-pane` styles to `src/renderer/styles/settings.css`.
2. Add sub-navigation controller in `src/renderer/js/settings.js` with active tab switching and local state persistence (remember last opened sub-tab in `sessionStorage` or `localStorage`).

### Phase 2: HTML Restructuring in `src/renderer/index.html`
1. Re-wrap the existing 18 cards into the respective `<div class="settings-pane" id="pane-...">` containers.
2. Ensure every existing element ID and input name remains identical.
3. Update the main sidebar navigation label to `"Settings"`.

### Phase 3: Deep-Link Integration & Inter-Module Alignment
1. Update `command-palette.js` shortcut action to switch to the `shortcuts` sub-tab.
2. Update `clients.js` limit modal to switch to the `license` sub-tab.
3. Ensure sticky header save button triggers `settingsForm` submission and displays success/error feedback toasts.

### Phase 4: Verification & Test Coverage
1. Run `npm test` (all 48 test suites run under node; verify no regressions).
2. Manually test all settings forms (Company profile save, currency change, logo upload, bank datalist, Paystack test, App Lock PIN save, backup export/restore, update check, license activation).
3. Confirm dark/light theme switching behaves properly in the new layout.

---

## 6. Questions & Decisions for User Feedback

Before writing any code, please review these design options:

1. **Sub-Tab Navigation Style**:
   - **Option A (Recommended)**: Vertical sidebar sub-navigation inside Settings (two columns: left categories list, right settings content). Matches Linear, Slack, and macOS Settings.
   - **Option B**: Horizontal tab strip along the top of the Settings page.
2. **Main Sidebar Label**:
   - Should the sidebar item under "Settings & System" be renamed to **"Settings"** (with Company Profile as the first sub-tab), or keep the label "Company Profile" and add a dedicated "Settings" entry?
3. **Email Configuration & Audit Log**:
   - Would you prefer **Email Configuration** and **Audit Log** to remain as separate top-level sidebar items (as they are now), or would you eventually like them integrated as sub-tabs inside this unified Settings hub?
