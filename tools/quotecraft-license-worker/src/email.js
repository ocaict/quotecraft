/**
 * email.js — Resend API transactional email for QuoteCraft Pro license delivery
 *
 * Sends a beautifully branded HTML email with:
 * - The generated activation key in a prominent monospace box
 * - 3-step activation walkthrough
 * - Receipt details
 * - Support contacts
 */

'use strict';

/**
 * Sends the license key email via Resend API.
 *
 * @param {object} opts
 * @param {string} opts.to           - Customer email
 * @param {string} opts.name         - Customer name
 * @param {string} opts.licenseKey   - The generated QC-PRO-... key
 * @param {'annual'|'lifetime'} opts.plan
 * @param {string|null} opts.expiryDate
 * @param {string} opts.amount       - Formatted payment amount (e.g. "₦20,000")
 * @param {string} opts.reference    - Paystack transaction reference
 * @param {string} opts.resendApiKey - Resend API key from env
 * @returns {Promise<void>}
 */
export async function sendLicenseEmail({ to, name, licenseKey, plan, expiryDate, amount, reference, apiKey }) {
  const planLabel = plan === 'lifetime' ? 'Lifetime' : 'Annual';
  const validityNote = plan === 'lifetime'
    ? 'Your license never expires — it is valid for life. ✨'
    : `Your license is valid until <strong>${new Date(expiryDate).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your QuoteCraft Pro License Key</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: #f0f4f8;
      color: #1a202c;
    }
    .wrapper { max-width: 600px; margin: 32px auto; }
    .card {
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }

    /* Header */
    .header {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      padding: 40px 32px;
      text-align: center;
    }
    .header-logo {
      font-size: 28px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.5px;
    }
    .header-logo span { color: #e94560; }
    .header-badge {
      display: inline-block;
      margin-top: 12px;
      padding: 4px 16px;
      background: linear-gradient(90deg, #e94560, #f5a623);
      border-radius: 100px;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }

    /* Body */
    .body { padding: 40px 32px; }
    .greeting { font-size: 20px; font-weight: 700; color: #1a202c; margin-bottom: 8px; }
    .lead { font-size: 15px; color: #4a5568; line-height: 1.6; margin-bottom: 32px; }

    /* Key Box */
    .key-section { margin-bottom: 32px; }
    .key-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #718096;
      margin-bottom: 10px;
    }
    .key-box {
      background: #0f0f1a;
      border: 2px solid #e94560;
      border-radius: 12px;
      padding: 20px 24px;
      text-align: center;
    }
    .key-text {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      font-weight: 700;
      color: #68d391;
      word-break: break-all;
      letter-spacing: 1px;
      line-height: 1.8;
    }
    .key-hint {
      font-size: 12px;
      color: #a0aec0;
      margin-top: 10px;
    }

    /* Steps */
    .steps-title {
      font-size: 15px;
      font-weight: 700;
      color: #1a202c;
      margin-bottom: 16px;
    }
    .step {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 16px;
    }
    .step-num {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #e94560, #f5a623);
      border-radius: 50%;
      color: #fff;
      font-size: 14px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .step-content { font-size: 14px; color: #4a5568; line-height: 1.55; }
    .step-content strong { color: #1a202c; }

    /* Receipt */
    .divider { border: none; border-top: 1px solid #e2e8f0; margin: 32px 0; }
    .receipt-title { font-size: 13px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 14px; }
    .receipt-row { display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 8px; }
    .receipt-row .label { color: #718096; }
    .receipt-row .value { color: #1a202c; font-weight: 600; }

    /* Support */
    .support-box {
      background: #f7fafc;
      border-radius: 12px;
      padding: 20px 24px;
      margin-top: 32px;
    }
    .support-box p { font-size: 14px; color: #4a5568; line-height: 1.6; }
    .support-box a { color: #e94560; text-decoration: none; font-weight: 600; }

    /* Footer */
    .footer {
      background: #f7fafc;
      border-top: 1px solid #e2e8f0;
      padding: 24px 32px;
      text-align: center;
    }
    .footer p { font-size: 12px; color: #a0aec0; line-height: 1.7; }
    .validity-note {
      background: #ebf8ff;
      border-left: 4px solid #3182ce;
      border-radius: 0 8px 8px 0;
      padding: 12px 16px;
      margin-bottom: 20px;
      font-size: 14px;
      color: #2c5282;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <!-- Header -->
      <div class="header">
        <div class="header-logo">Quote<span>Craft</span></div>
        <div class="header-badge">🎉 ${planLabel} License Activated</div>
      </div>

      <!-- Body -->
      <div class="body">
        <p class="greeting">Hello, ${escapeHtml(name)}! 👋</p>
        <p class="lead">
          Thank you for upgrading to <strong>QuoteCraft Pro (${planLabel})</strong>. Your payment has been confirmed,
          and your personal activation key is ready below. You now have full access to all Pro features.
        </p>

        <!-- Validity Notice -->
        <div class="validity-note">ℹ️ ${validityNote}</div>

        <!-- Key Box -->
        <div class="key-section">
          <p class="key-label">🔑 Your Activation Key</p>
          <div class="key-box">
            <div class="key-text">${escapeHtml(licenseKey)}</div>
            <p class="key-hint">Copy the entire key including the QC-PRO- prefix</p>
          </div>
        </div>

        <!-- Steps -->
        <p class="steps-title">How to activate QuoteCraft Pro:</p>

        <div class="step">
          <div class="step-num">1</div>
          <div class="step-content">
            <strong>Open QuoteCraft</strong> on your Windows PC and click the
            <strong>⚙ Settings</strong> icon in the sidebar.
          </div>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-content">
            Scroll down to the <strong>"License & Activation"</strong> section and
            paste your key into the input field.
          </div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-content">
            Click <strong>"Activate License"</strong>. QuoteCraft will verify your key
            instantly — no internet required after this step. ✅
          </div>
        </div>

        <hr class="divider" />

        <!-- Receipt -->
        <p class="receipt-title">Payment Receipt</p>
        <div class="receipt-row">
          <span class="label">Plan</span>
          <span class="value">QuoteCraft Pro ${planLabel}</span>
        </div>
        <div class="receipt-row">
          <span class="label">Amount Paid</span>
          <span class="value">${escapeHtml(amount)}</span>
        </div>
        <div class="receipt-row">
          <span class="label">Transaction Ref</span>
          <span class="value" style="font-family:monospace;font-size:12px;">${escapeHtml(reference)}</span>
        </div>
        <div class="receipt-row">
          <span class="label">Date</span>
          <span class="value">${new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>

        <!-- Support -->
        <div class="support-box">
          <p>
            Need help? Reach us on
            <a href="https://wa.me/2348000000000">WhatsApp</a> or email
            <a href="mailto:ocatechskill@gmail.com">ocatechskill@gmail.com</a>.
            We typically respond within a few hours during business hours (Mon–Fri, 9am–6pm WAT).
          </p>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>
          © ${new Date().getFullYear()} QuoteCraft · Made with ❤️ in Nigeria<br />
          This email was sent because you made a purchase at
          <a href="https://paystack.shop/pay/quotecraft" style="color:#e94560;">paystack.shop/pay/quotecraft</a>.<br />
          Keep your activation key safe — treat it like a password.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'QuoteCraft Pro', email: 'ocatechskill@gmail.com' },
      replyTo: { name: 'QuoteCraft Support', email: 'ocatechskill@gmail.com' },
      to: [{ email: to, name }],
      subject: `Your QuoteCraft Pro ${planLabel} License Key — Order ${reference}`,
      htmlContent: html,
      textContent: `Hello ${name},\n\nThank you for purchasing QuoteCraft Pro (${planLabel}).\n\nYour activation key:\n${licenseKey}\n\nTo activate: Open QuoteCraft → Settings → License & Activation → paste your key → click Activate.\n\nPlan: QuoteCraft Pro ${planLabel}\nAmount: ${amount}\nReference: ${reference}\n\nNeed help? Email ocatechskill@gmail.com\n\n© ${new Date().getFullYear()} QuoteCraft`,
      tags: ['license-delivery'],
      headers: {
        'X-Mailer': 'QuoteCraft-License-Worker/1.0',
        'X-Transaction-Type': 'license-delivery',
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Brevo API error ${response.status}: ${errBody}`);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
