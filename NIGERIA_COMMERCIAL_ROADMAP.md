# QuoteCraft Commercial Roadmap: Nigerian Market Edition

A stage-by-stage implementation plan to adapt QuoteCraft for commercial launch in Nigeria, targeting Nigerian freelancers, creative agencies, consultants, and SMEs.

---

## Executive Summary

| Goal | Description |
|---|---|
| **Primary Target Audience** | Nigerian freelancers, consultants, digital agencies, and small businesses. |
| **Payment Rail** | Direct Paystack integration (Cards, Bank Transfer, USSD) + NUBAN Bank Callouts. |
| **Tax Compliance** | FIRS requirements: 7.5% VAT, 5%/10% Withholding Tax (WHT) deduction, CAC & TIN numbers. |
| **Primary Communication** | WhatsApp 1-click invoice sharing + SMTP Email. |
| **Monetization Model** | Freemium with Paystack-powered offline license activation (Naira pricing). |

---

## Overview of Implementation Stages

| Stage | Focus Area | Impact | Complexity |
|---|---|---|---|
| **Stage 1** | **Nigerian Business Profile & Tax Compliance (FIRS, VAT & WHT)** | Legal & Enterprise Acceptance | Medium |
| **Stage 2** | **NUBAN & Domiciliary Multi-Bank Accounts** | Direct Bank Transfer Friction Reduction | Low-Medium |
| **Stage 3** | **Paystack Gateway Integration (Online Invoicing & Auto-Reconciliation)** | 3x Faster Invoice Payments | High |
| **Stage 4** | **1-Click WhatsApp Invoice & Receipt Sharing** | High Daily Engagement & Local Fit | Low-Medium |
| **Stage 5** | **Paystack Commercial Licensing & Pro-Tier Gating** | Direct Revenue Generation in NGN | Medium |
| **Stage 6** | **Automated Test Coverage & Release Packaging** | Production Quality Assurance | Low |

---

## Stage 1: Nigerian Business Profile & Tax Compliance (FIRS, VAT & WHT) ✅ COMPLETE

> **Status: IMPLEMENTED** — Completed October 2026 | Test Coverage: `scripts/test-stage1-nigeria.js` (9/9 tests passing)

Ensure invoices meet legal and accounting standards required by Nigerian corporate clients and the Federal Inland Revenue Service (FIRS).

### 1.1 CAC Registration & Tax Identification Number (TIN) ✅
- **Problem:** Corporate clients and institutions in Nigeria reject invoices that lack Corporate Affairs Commission (CAC) registration numbers (RC or BN) and Tax Identification Numbers (TIN).
- **Action:**
  - Add `cac_number` and `tin` fields to `company_profile` table.
  - Update **Settings > Company Profile** to include CAC (RC/BN) and TIN input fields.
  - Update PDF invoice/quote templates to prominently render CAC and TIN in the header alongside company address and contact information.
- **Files Affected:**
  - `src/main/database.js`
  - `src/renderer/index.html`
  - `src/renderer/js/settings.js`
  - `src/main/pdf-export.js`

---

### 1.2 Preset 7.5% VAT Engine ✅
- **Problem:** Nigeria's standard Value Added Tax (VAT) rate is statutorily fixed at 7.5%. Users currently have to type "7.5" manually.
- **Action:**
  - Add a 1-click **"Apply 7.5% Nigerian VAT"** toggle button in the Invoice and Quote editors.
  - Automatically calculate and separate VAT lines on the document.
- **Files Affected:**
  - `src/renderer/js/invoices.js`
  - `src/renderer/js/quotes.js`
  - `src/renderer/index.html`

---

### 1.3 Withholding Tax (WHT) Deduction Engine ✅
- **Problem:** Nigerian corporate clients legally deduct Withholding Tax (5% for goods/contracts, 10% for professional services) prior to making payment. Invoices must reflect this deduction, or clients return invoices for correction.
- **Action:**
  - Add `wht_rate` (e.g., 0%, 5%, 10%) and `wht_amount` fields to the `invoices` table.
  - In the Invoice Builder totals section:
    - **Subtotal:** `₦1,000,000`
    - **VAT (7.5%):** `+₦75,000`
    - **Gross Invoice Amount:** `₦1,075,000`
    - **Less WHT (10%):** `-₦100,000`
    - **Net Amount Payable by Client:** `₦975,000`
  - Render this breakdown clearly on the PDF invoice and in payment balance calculations (`balance_due = net_payable - amount_paid`).
- **Files Affected:**
  - `src/main/database.js`
  - `src/renderer/js/invoices.js`
  - `src/main/pdf-export.js`

---

### 1.4 WHT Credit Note Tracker ✅
- **Problem:** Freelancers and agencies need to track which corporate clients have issued their FIRS WHT Credit Notes at tax year-end.
- **Action:**
  - Add a `wht_credit_received` boolean flag and `wht_credit_note_ref` string to invoice records.
  - Add a filter in Invoices/Reports: "Pending WHT Certificates" to alert business owners on uncollected tax credits.
- **Files Affected:**
  - `src/main/database.js`
  - `src/renderer/js/invoices.js`

---


## Stage 2: NUBAN & Domiciliary Multi-Bank Accounts ✅ COMPLETE

> **Status: IMPLEMENTED** — Completed October 2026 | Test Coverage: `scripts/test-stage2-nigeria.js` (10/10 tests passing)

Eliminate back-and-forth messaging with clients asking "Please send your account number."

### 2.1 Dedicated NUBAN Bank Details ✅
- **Action:**
  - Add dedicated banking fields to `company_profile`:
    - `bank_name` (dropdown of top Nigerian commercial banks + fintechs: Access, GTBank, Zenith, UBA, First Bank, Kuda, Moniepoint, OPay, etc.)
    - `account_number` (10-digit NUBAN with validation)
    - `account_name`
  - Render a styled **"Direct Bank Transfer"** callout box on PDF invoices with account details highlighted.
- **Files Affected:**
  - `src/main/database.js`
  - `src/shared/constants.js`
  - `src/renderer/index.html`
  - `src/renderer/js/settings.js`
  - `src/main/pdf-export.js`

---

### 2.2 Domiciliary Account (USD / GBP / EUR) Support ✅
- **Problem:** Nigerian tech freelancers, creators, and export consultants bill foreign clients in USD/GBP/EUR, requiring international wire details (SWIFT/BIC, IBAN, Intermediary Bank).
- **Action:**
  - Add optional Domiciliary Bank details in **Settings > Company Profile**.
  - Smart PDF rendering:
    - If invoice currency is `NGN` &rarr; render local NUBAN details.
    - If invoice currency is `USD`, `GBP`, or `EUR` &rarr; automatically render Domiciliary wire instructions (Bank, Account Name, Account Number, SWIFT/BIC).
- **Files Affected:**
  - `src/main/database.js`
  - `src/shared/constants.js`
  - `src/renderer/index.html`
  - `src/renderer/js/settings.js`
  - `src/main/pdf-export.js`

---

## Stage 3: Paystack Payment Gateway Integration ✅ COMPLETE

> **Status: IMPLEMENTED** — Completed October 2026 | Test Coverage: `scripts/test-paystack.js` (8/8 tests passing, 43/43 overall suite passing)

Enable customers to pay invoices online in seconds using Debit Cards, Bank Transfer, or USSD without installing QuoteCraft.

### 3.1 Paystack API Credentials & Settings ✅
- **Action:**
  - In **Settings > Payments**, add a dedicated **Paystack Integration** panel:
    - `paystack_public_key` (`pk_live_...` or `pk_test_...`)
    - `paystack_secret_key` (`sk_live_...` - encrypted in SQLite or via safe storage)
    - `paystack_enabled` toggle
    - **Test Connection** button (calls `GET https://api.paystack.co/balance` or validates public key).
  - Also support a simple fallback field: **Paystack Payment Page URL** for users who don't want to configure API keys.
- **Files Affected:**
  - `src/main/database.js`
  - `src/main/ipc-handlers.js`
  - `src/main/preload.js`
  - `src/renderer/js/settings.js`
  - `src/renderer/index.html`

---

### 3.2 Dynamic Payment Link Generation ✅
- **Action:**
  - When an invoice is created or finalized, if Paystack is enabled:
    - QuoteCraft calls `POST https://api.paystack.co/transaction/initialize` with:
      - `email`: client email
      - `amount`: net payable amount in kobo (e.g. `amount * 100`)
      - `reference`: unique reference like `QC-{invoice_number}-{timestamp}`
      - `currency`: invoice currency (`NGN`, `USD`)
      - `callback_url`: customizable confirmation page or Paystack default
    - Paystack returns an authorization checkout URL (`https://checkout.paystack.com/xxxxxx`).
    - Save `paystack_url` and `paystack_reference` on the invoice record.
- **Files Affected:**
  - `src/main/paystack.js` (new main-process service module)
  - `src/main/ipc-handlers.js`
  - `src/main/database.js`

---

### 3.3 QR Code & "Pay Online" Button on PDFs and Emails ✅
- **Action:**
  - Embed the Paystack checkout URL as a clickable button on email templates: `💳 Pay Online (Card / Transfer / USSD)`.
  - Generate a payment QR code directly onto the PDF invoice using `qrcode` or SVG embedding.
  - Customers scanning the QR code with their mobile phone immediately land on Paystack's secure checkout page.
- **Files Affected:**
  - `src/main/pdf-export.js`
  - `src/main/email.js`

---

### 3.4 1-Click Payment Verification & Auto-Reconciliation ✅
- **Action:**
  - On the Invoices list & Invoice view, add a button: `🔄 Verify Paystack Status`.
  - Queries `GET https://api.paystack.co/transaction/verify/{reference}`.
  - If status is `success`:
    - Automatically marks the invoice as **Paid**.
    - Records a payment entry in SQLite with method `Paystack`, transaction reference, and date.
    - Displays a success toast: `"Payment of ₦... verified via Paystack!"`.
  - Optional auto-sync: When opening the app or refreshing invoices, automatically check pending Paystack references.
- **Files Affected:**
  - `src/main/ipc-handlers.js`
  - `src/renderer/js/invoices.js`

---

## Stage 4: 1-Click WhatsApp Invoice & Quote Sharing ✅ COMPLETE

> **Status: IMPLEMENTED** — Completed October 2026 | Test Coverage: `scripts/test-whatsapp-sharing.js` (6/6 tests passing, 44/44 overall test suites passing)

Integrate Nigeria's dominant business communication channel directly into the invoicing workflow.

### 4.1 Phone Number Normalization ✅
- **Action:**
  - Update Client phone input to automatically normalize Nigerian numbers to international format:
    - Converts `08031234567` &rarr; `+2348031234567` / `2348031234567`.
    - Handles standard international prefixes (`+234...`), stripped zeros (`+2340...` &rarr; `+234...`), and spaced numbers.
    - Preserves foreign international numbers cleanly.
- **Files Affected:**
  - `src/shared/constants.js`
  - `src/renderer/js/utils.js`
  - `src/renderer/js/clients.js`

---

### 4.2 Pre-Formatted WhatsApp Message Templates ✅
- **Action:**
  - Add **"Share via WhatsApp"** button next to "Send Email" on Invoices and Quotes.
  - Automatically compiles a clean, professional message template:
    ```text
    Hello {Client Name},

    Here is Invoice {INV-001} for {₦150,000} from {Business Name}.

    • Due Date: {Due Date}
    • Pay Online (Card/Transfer/USSD): {Paystack Link}
    • Bank Transfer: {Bank Name} | {Account Number} | {Account Name}

    The detailed PDF invoice has been attached. Thank you for your business!
    ```
  - Dedicated WhatsApp share modal (`#whatsappModal`) allows live editing, phone selection from client contacts, and 1-click clipboard copy.
- **Files Affected:**
  - `src/shared/constants.js`
  - `src/renderer/js/utils.js`
  - `src/renderer/js/whatsapp-share.js`
  - `src/renderer/js/invoices.js`
  - `src/renderer/js/quotes.js`
  - `src/renderer/index.html`

---

### 4.3 1-Click Action & PDF Delivery ✅
- **Action:**
  - Clicking "Share via WhatsApp" opens `https://wa.me/{phone}?text={encoded_message}` in the default browser or launches WhatsApp Desktop.
  - Automatically generates and reveals the document PDF in Windows Explorer (`shell.showItemInFolder`) for instant drag-and-drop into WhatsApp chat.
- **Files Affected:**
  - `src/main/ipc-handlers.js`
  - `src/main/preload.js`
  - `src/renderer/js/whatsapp-share.js`
  - `src/renderer/js/invoices.js`
  - `src/renderer/js/quotes.js`

---

## Stage 5: Commercial Licensing & Monetization Engine ✅ COMPLETE

> **Status: IMPLEMENTED** — Completed October 2026 | Test Coverage: `scripts/test-licensing.js` (9/9 tests passing, 45/45 overall test suites passing)

Turn QuoteCraft into a paid, revenue-generating desktop product tailored for Nigerian buyers.

### 5.1 Free vs. Pro Feature Gating ✅
- **Free Starter Tier:**
  - Up to 3 active clients.
  - Standard PDF templates.
  - Manual payment recording & local ZIP backups.
- **Pro Tier (Paid):**
  - Unlimited clients & documents.
  - Paystack automatic payment link generation & 1-click verification.
  - WhatsApp 1-click invoice sharing.
  - WHT & FIRS tax breakdown engine.
  - Custom PDF branding & themes.
  - Priority support.
- **Files Affected:**
  - `src/main/licensing.js`
  - `src/main/ipc-handlers.js`
  - `src/renderer/js/clients.js`
  - `src/renderer/js/settings.js`

---

### 5.2 Offline Cryptographic License Keys ✅
- **Design:**
  - License keys signed with HMAC-SHA256 (`QC-PRO-<B32_PAYLOAD>-<B32_SIG>`).
  - Key payload contains: `licensee_name`, `licensee_email`, `plan` (lifetime / annual), `expiry_date` (or permanent).
  - QuoteCraft verifies the digital signature locally without requiring constant internet access.
- **Files Affected:**
  - `src/main/licensing.js`
  - `src/main/database.js`
  - `src/main/ipc-handlers.js`
  - `src/main/preload.js`

---

### 5.3 Paystack Purchase Flow for Nigerian Buyers ✅
- **Action:**
  - Price in Naira: **₦20,000 / year** or **₦40,000 Lifetime License**.
  - In QuoteCraft, clicking **"Upgrade to Pro"** opens the official Paystack payment page in browser.
  - In **Settings > Commercial License**, user enters their key and clicks **"Activate License"**.
  - Instant unlock with active status badge, licensee display, and plan details.
- **Files Affected:**
  - `src/renderer/js/settings.js`
  - `src/renderer/index.html`
  - `src/main/ipc-handlers.js`

---

## Stage 6: Automated Test Coverage & Release QA

Validate all Nigerian ecosystem additions with unit and integration tests.

### 6.1 New Automated Test Suites
- `test-nigerian-tax.js`:
  - 7.5% VAT calculation accuracy.
  - 5% and 10% Withholding Tax (WHT) deductions.
  - Net payable balance calculation.
- `test-paystack-service.js`:
  - Payload construction for `transaction/initialize`.
  - Verification response parsing and payment record creation.
- `test-whatsapp-formatting.js`:
  - Phone number normalization (`080...` &rarr; `23480...`).
  - URL encoding and template string rendering.
- `test-licensing.js`:
  - Cryptographic key verification, tamper detection, and expiry checking.

### 6.2 Pre-Release Packaging Check
- Build Windows executable with new features.
- Verify currency formatting (`₦` Nigerian Naira symbol) across all PDF themes and tables.

---

## Next Steps

When ready to begin implementation:
1. **Start with Stage 1:** CAC/TIN fields and Nigerian 7.5% VAT + WHT calculation engine.
2. **Move to Stage 2:** NUBAN bank callouts on invoices.
3. **Execute Stage 3:** Paystack integration service.
4. **Implement Stage 4:** 1-Click WhatsApp sharing.
5. **Finalize Stage 5 & 6:** Paystack-powered licensing & QA testing.
