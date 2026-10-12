# QuoteCraft Go-Live Production Implementation Plan

A comprehensive, stage-by-stage operational execution plan to take **QuoteCraft** from staging/testing to live public commercial operation.

---

## Stage Summary

| Stage | Focus Area | Primary Target | Acceptance Criteria |
|---|---|---|---|
| **Stage 1** | **Payment & Webhook Synchronization** | Paystack Dashboard & Cloudflare Worker | ✅ **COMPLETED** — Live webhook active, HMAC-SHA512 verified, KV & browser callback deployed |
| **Stage 2** | **Email Deliverability & Sender Setup** | Brevo Shared Delivery & On-Screen Key | ✅ **COMPLETED** — Delivered via Brevo shared verified infrastructure + on-screen display |
| **Stage 3** | **App Pricing & Upgrade Flow Hardening** | Desktop Client Code & Cloudflare Worker | ✅ **COMPLETED** — Official pricing: ₦15,000 Lifetime & ₦5,000 Yearly configured |
| **Stage 4** | **Packaging, GitHub Releases & Auto-Update** | `electron-builder`, GitHub Releases | Signed/notarized or clean NSIS installer with `latest.yml` |
| **Stage 5** | **Live Canary Transaction & Verification** | End-to-End Real User Flow | Full real payment &rarr; auto-license email &rarr; 1-click in-app activation |
| **Stage 6** | **Post-Launch Operations & Support Runbook** | Monitoring & Customer Support | License recovery, refund handling, error diagnostics |

---

## Stage 1: Payment & Webhook Synchronization (Paystack + Cloudflare) (✅ COMPLETED)

### 1.1 Objective
Ensure Paystack Live mode sends webhooks to the production Cloudflare Worker, and the worker validates signatures using the live secret key.

### 1.2 Action Steps
1. **Configure Live Webhook URL in Paystack Dashboard:**
   - Log in to [Paystack Dashboard](https://dashboard.paystack.com/).
   - Navigate to **Settings** &rarr; **API Keys & Webhooks**.
   - Under **Live Webhook URL** and **Live Callback URL**, set:
     ```text
     https://quotecraft-license-worker.ocatech.workers.dev/webhook
     ```
   - *Status:* ✅ Verified and saved in Paystack Dashboard.
2. **Synchronize Cloudflare Worker Secrets:**
   - Worker environment variables & secrets configured:
     - `PAYSTACK_SECRET_KEY`: Set to Paystack Live Secret Key (`sk_live_...`).
     - `QC_LICENSE_KEY`: Set to production HMAC signing key.
     - `BREVO_API_KEY`: Set to active Brevo API key.
     - `LICENSES_KV`: Bound to KV namespace `9af9aa2b6fc14d7283e5925ca94adeb0`.
   - *Status:* ✅ All secrets verified active and live.
3. **Browser Callback & Event Handling:**
   - Worker handles `POST /webhook` for Paystack automated events (`charge.success`).
   - Worker handles `GET /webhook` for browser redirects, instantly looking up the reference in KV to render a branded success UI with 1-click license key copy.
   - *Status:* ✅ Deployed and verified on Cloudflare.

### 1.3 Verification & Acceptance Criteria
- [x] Webhook endpoint returns HTTP `200 OK` on valid signed `charge.success` events.
- [x] Invalid signatures correctly rejected with HTTP `401 Unauthorized`.
- [x] Generated license keys saved in remote KV with 90-day TTL.
- [x] Transactional emails dispatched via Brevo API and delivered.
- [x] Browser callback verified (`GET /webhook?reference=...`) displaying instant on-screen key.

---

## Stage 2: Transactional Email Deliverability & Verification (Brevo) (✅ COMPLETED)

### 2.1 Objective
Deliver license keys reliably to customers even without an upfront custom domain.

### 2.2 Action Steps & Implementation
1. **Brevo Shared Infrastructure Active:**
   - Transactional emails send through Brevo's verified infrastructure (`ocatechskill@...brevosend.com`) with `replyTo: ocatechskill@gmail.com`.
   - Verified live test delivery (`status: delivered`) to `ocatestemail@gmail.com`.
2. **Instant On-Screen Guarantee:**
   - Even if email delivery is delayed or filtered by a customer's provider, the newly deployed browser callback displays the license key on-screen immediately upon completing payment.
3. **Future Custom Domain Optimization:**
   - When a custom domain is acquired, SPF/DKIM DNS records will be added to Brevo for white-label branding.

### 2.3 Verification & Acceptance Criteria
- [x] Brevo API sends transactional license emails upon payment.
- [x] Instant on-screen license key display functions as a zero-latency fallback.

---

## Stage 3: App Pricing & Upgrade Flow Hardening (✅ COMPLETED)

### 3.1 Objective
Establish official production pricing across the desktop UI and backend licensing engine.

### 3.2 Action Steps & Implementation
1. **Official Pricing Established:**
   - **Lifetime Access:** `₦15,000` (Pay once, unlimited lifetime access)
   - **Yearly Access:** `₦5,000 / year` (1 year access)
2. **Backend Licensing Engine Updated:**
   - `determinePlan(amountKobo)` in `tools/quotecraft-license-worker/src/licensing.js`:
     - Payments &ge; ₦10,000 (`1,000,000 kobo`) receive a **Lifetime** key (`expiry_date: null`).
     - Payments < ₦10,000 (e.g. ₦5,000) receive an **Annual** key (`expiry_date: +1 year`).
   - Worker freshly deployed to Cloudflare (`c01afd11`).
3. **Desktop UI Updated:**
   - `src/renderer/index.html` updated with modern pricing panel highlighting ₦15,000 Lifetime and ₦5,000/Year options.
   - Upgrade button launches Paystack checkout in system browser.

### 3.3 Verification & Acceptance Criteria
- [x] Worker plan determination logic correctly bifurcates ₦15,000 Lifetime vs ₦5,000 Annual.
- [x] Settings panel in QuoteCraft displays official prices.

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

- [x] Paystack Live Secret Key active in Cloudflare Worker
- [x] Paystack Live Webhook URL configured & saved
- [x] Brevo delivery & on-screen license fallback configured
- [x] Official production price updated in app & licensing engine (₦15k / ₦5k)
- [ ] `npm run dist:win` installer built and verified on clean OS
- [ ] GitHub Release uploaded with `latest.yml`
- [ ] 1 successful Live Canary transaction completed
- [ ] Support email / contact channel monitored
