# QuoteCraft Go-Live Production Implementation Plan

A comprehensive, stage-by-stage operational execution plan to take **QuoteCraft** from staging/testing to live public commercial operation.

---

## Stage Summary

| Stage | Focus Area | Primary Target | Acceptance Criteria |
|---|---|---|---|
| **Stage 1** | **Payment & Webhook Synchronization** | Paystack Dashboard & Cloudflare Worker | Live transactions trigger valid HMAC webhooks without 401 errors |
| **Stage 2** | **Email Deliverability & Sender Setup** | Brevo & Custom Domain DNS | License emails land in primary inbox (DKIM/SPF passed) |
| **Stage 3** | **App Pricing & Upgrade Flow Hardening** | Desktop Client Code (`settings.js`, Paystack URL) | Live official pricing displayed; secure payment link triggered |
| **Stage 4** | **Packaging, GitHub Releases & Auto-Update** | `electron-builder`, GitHub Releases | Signed/notarized or clean NSIS installer with `latest.yml` |
| **Stage 5** | **Live Canary Transaction & Verification** | End-to-End Real User Flow | Full real payment &rarr; auto-license email &rarr; 1-click in-app activation |
| **Stage 6** | **Post-Launch Operations & Support Runbook** | Monitoring & Customer Support | License recovery, refund handling, error diagnostics |

---

## Stage 1: Payment & Webhook Synchronization (Paystack + Cloudflare)

### 1.1 Objective
Ensure Paystack Live mode sends webhooks to the production Cloudflare Worker, and the worker validates signatures using the live secret key.

### 1.2 Action Steps
1. **Configure Live Webhook URL in Paystack Dashboard:**
   - Log in to [Paystack Dashboard](https://dashboard.paystack.com/).
   - Navigate to **Settings** &rarr; **API Keys & Webhooks**.
   - Under **Live Webhook URL**, set:
     ```text
     https://quotecraft-license-worker.ocatech.workers.dev/webhook
     ```
2. **Synchronize Cloudflare Worker Secrets:**
   - Ensure the worker environment variables / secrets match live credentials:
     - `PAYSTACK_SECRET_KEY`: Set to Paystack Live Secret Key (`sk_live_...`).
     - `SIGNING_KEY`: Confirmed 64-character hex Ed25519 private key.
     - `BREVO_API_KEY`: Confirmed active Brevo API Key.
     - `KV_LICENSES`: Cloudflare KV namespace binding `LICENSES`.
3. **Set Webhook Event Filter:**
   - Confirm worker handles `charge.success` events cleanly.

### 1.3 Verification & Acceptance Criteria
- Sending a test ping or viewing Paystack Webhook Logs shows HTTP `200 OK`.
- Signature calculation matches `x-paystack-signature` header using `crypto.subtle` HMAC SHA-512.

---

## Stage 2: Transactional Email Deliverability & Verification (Brevo)

### 2.1 Objective
Prevent license emails from landing in customer spam or promotion folders.

### 2.2 Action Steps
1. **Domain Authentication (SPF, DKIM, DMARC):**
   - In [Brevo Dashboard](https://app.brevo.com/), go to **Senders, Domains & Dedicated IPs** &rarr; **Domains**.
   - Add your sending domain (e.g., `ocatech.com` or `quotecraft.app`).
   - Add the generated TXT and CNAME records to your DNS provider (Cloudflare DNS).
   - Ensure Status shows **Authenticated**.
2. **Sender Profile:**
   - Configure a dedicated sender in Brevo (e.g. `QuoteCraft Licensing <licensing@yourdomain.com>` or `support@yourdomain.com`).
   - Update `SENDER_EMAIL` and `SENDER_NAME` in the Cloudflare Worker environment.
3. **Email Content Audit:**
   - Confirm the email body clearly explains:
     1. User's unique license key formatted in clean monospace.
     2. Step-by-step in-app instructions: **Settings** &rarr; **License** &rarr; **Paste Key** &rarr; **Activate**.
     3. Customer support contact email.

### 2.3 Verification & Acceptance Criteria
- Test email sent to Gmail, Outlook, and Yahoo accounts arrives directly in the **Primary Inbox**.
- Headers display `SPF: PASS`, `DKIM: PASS`.

---

## Stage 3: App Pricing & Upgrade Flow Hardening

### 3.1 Objective
Restore production pricing in the desktop UI and ensure payment links match official commercial rates.

### 3.2 Action Steps
1. **Restore Official Production Pricing:**
   - In [settings.js](file:///c:/Users/oluegwuc/Desktop/Projects/quotecraft/src/renderer/js/settings.js), update the Upgrade modal:
     - Reset displayed amount from temporary test price (₦1,000) to official production price (e.g., ₦15,000 or official tier).
   - Update Paystack Payment Page / Product Link to the official live product link.
2. **In-App Payment Gateway Launch:**
   - Confirm clicking **Upgrade to Lifetime** invokes `electron.openExternal(paystackUrl)` safely.
   - Pre-fill customer email or pass customer identifier if available in query parameters.
3. **License Input Field Validation:**
   - Verify license input trims whitespace, ignores accidental linebreaks, and checks format (`QC-...`) prior to calling `window.api.activateLicense(key)`.

### 3.3 Verification & Acceptance Criteria
- Settings page shows the correct commercial pricing.
- Clicking Upgrade launches the official Paystack payment page in the default system browser.

---

## Stage 4: Binary Packaging, Releases & Auto-Update

### 4.1 Objective
Build clean production installers, establish auto-update infrastructure, and prepare customer download links.

### 4.2 Action Steps
1. **Version Bump & Git Tagging:**
   - Verify `version` in [package.json](file:///c:/Users/oluegwuc/Desktop/Projects/quotecraft/package.json) (e.g. `1.2.0`).
   - Create clean Git tag: `git tag v1.2.0`.
2. **Build Distribution Executables:**
   - Run the packaging script:
     ```powershell
     npm run dist:win
     ```
   - Generates:
     - `dist/QuoteCraft Setup 1.2.0.exe` (NSIS Installer)
     - `dist/QuoteCraft Setup 1.2.0.exe.blockmap`
     - `dist/latest.yml` (Required by `electron-updater`)
3. **Windows SmartScreen Strategy:**
   - **Scenario A (With Code Signing):** Set `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables before running build.
   - **Scenario B (Standard/Unsigned Launch):**
     - Submit `QuoteCraft Setup 1.2.0.exe` to [Microsoft Defender Security Intelligence](https://www.microsoft.com/en-us/wdsi/filesubmission) for reputation whitelisting.
     - Document download guidance for initial users (*"Windows SmartScreen &rarr; More info &rarr; Run anyway"*).
4. **Publish GitHub Release:**
   - Create Release `v1.2.0` on `github.com/ocaict/quotecraft`.
   - Upload `QuoteCraft Setup 1.2.0.exe` and `latest.yml`.

### 4.3 Verification & Acceptance Criteria
- Fresh install on a clean Windows machine completes without error.
- App launches and displays `v1.2.0` in Settings.
- Database initializes in `%APPDATA%\quotecraft\quotecraft.db`.

---

## Stage 5: Live Canary Transaction & Verification

### 5.1 Objective
Execute a live, end-to-end commercial transaction as a real user to guarantee zero friction.

### 5.2 Action Steps
1. **Perform Live Payment:**
   - Open packaged QuoteCraft &rarr; **Settings** &rarr; Click **Upgrade**.
   - Complete checkout on Paystack with a real debit/credit card or bank transfer.
2. **Verify Worker Webhook Execution:**
   - Monitor Cloudflare Worker logs via Cloudflare Dashboard or Wrangler tail.
   - Confirm event `charge.success` received.
   - Confirm Ed25519 license key generated and stored in KV.
3. **Verify Email Receipt:**
   - Confirm receipt of Brevo email containing the license key within 30-60 seconds.
4. **Activate Within QuoteCraft:**
   - Copy key from email &rarr; Paste into QuoteCraft **License Key** field &rarr; Click **Activate License**.
   - Confirm app status immediately updates to **"Lifetime License Active"**.
   - Verify all Pro features unlock (watermark removed, unlimited quotes/invoices, advanced PDF exports).

### 5.3 Acceptance Criteria
- Zero manual developer intervention required from checkout to activation.

---

## Stage 6: Customer Operations & Post-Launch Support Runbook

### 6.1 Objective
Provide standard operating procedures for customer assistance, lost keys, and refunds.

### 6.2 Operational Procedures

#### A. Resending a Lost License Key
When a customer contacts support claiming they never received their email:
1. Look up payment in Paystack Dashboard by customer email or reference number.
2. Use the Worker recovery endpoint or run the recovery script:
   ```powershell
   node scratch/resend-license.js --email="customer@example.com"
   ```
3. KV retrieves existing license key by reference and dispatches a fresh Brevo email.

#### B. Machine Transfer / Reinstallation
- Because QuoteCraft uses cryptographically signed Ed25519 offline keys, the customer can reuse their license key on a new or formatted computer.
- Instructions to user: Download fresh QuoteCraft &rarr; Settings &rarr; Enter existing license key.

#### C. Database Disaster Recovery
- Instruct users to utilize **Settings** &rarr; **Backup & Restore** &rarr; **Create Backup** periodically.
- Backups include full SQLite database, settings, and business profile.

---

## Launch Checklist Sign-Off

- [ ] Paystack Live Secret Key active in Cloudflare Worker
- [ ] Paystack Live Webhook URL configured
- [ ] Brevo sending domain authenticated (SPF/DKIM)
- [ ] Official production price updated in app & Paystack link
- [ ] `npm run dist:win` installer built and verified on clean OS
- [ ] GitHub Release uploaded with `latest.yml`
- [ ] 1 successful Live Canary transaction completed
- [ ] Support email / contact channel monitored
