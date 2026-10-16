/**
 * index.js — QuoteCraft License Worker Entry Point
 *
 * Handles Paystack:
 *   1. POST /webhook: Validates HMAC-SHA512, enforces idempotency, generates
 *      ed25519/HMAC license key, stores in KV, and dispatches email via Brevo.
 *   2. GET /webhook or GET /callback or GET /success: Renders a beautiful, branded
 *      confirmation page for users redirected after Paystack checkout, displaying
 *      their license key immediately with 1-click copy.
 *   3. GET /health: Health check endpoint.
 */

import { generateLicenseKey, determinePlan } from './licensing.js';
import { sendLicenseEmail } from './email.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ─── Health check ────────────────────────────────────────────────────────
    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', service: 'quotecraft-license-worker' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ─── Browser Redirects (GET /webhook, GET /callback, GET /success) ────────
    const isBrowserCallback =
      request.method === 'GET' &&
      (url.pathname === '/webhook' ||
        url.pathname === '/callback' ||
        url.pathname === '/success' ||
        url.searchParams.has('reference') ||
        url.searchParams.has('trxref'));

    if (isBrowserCallback) {
      const reference = url.searchParams.get('reference') || url.searchParams.get('trxref') || '';
      let record = null;

      if (reference && env.LICENSES_KV) {
        try {
          const raw = await env.LICENSES_KV.get(`tx:${reference}`);
          if (raw) record = JSON.parse(raw);
        } catch (e) {
          console.error('[worker] Error retrieving KV record for callback:', e);
        }
      }

      // JSON status endpoint used by the success page to poll until the
      // charge.success webhook has finished writing the key to KV.
      if (url.searchParams.get('format') === 'json') {
        return new Response(
          JSON.stringify({
            ready: Boolean(record && record.license_key),
            license_key: record?.license_key || null,
            plan: record?.plan || null,
            reference,
          }),
          {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
            },
          }
        );
      }

      return new Response(renderSuccessHtml(reference, record), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // ─── Only handle POST /webhook beyond this point ─────────────────────────
    if (url.pathname !== '/webhook' || request.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }

    // ─── Step 1: Read raw body ───────────────────────────────────────────────
    let rawBody;
    try {
      rawBody = await request.text();
    } catch (err) {
      console.error('[worker] Failed to read request body:', err);
      return new Response('Bad Request', { status: 400 });
    }

    // ─── Step 2: Verify Paystack HMAC-SHA512 Signature ────────────────────────
    const paystackSig = request.headers.get('x-paystack-signature');
    if (!paystackSig) {
      console.warn('[worker] Missing x-paystack-signature header');
      return new Response('Unauthorized', { status: 401 });
    }

    let isValid = false;
    if (env.PAYSTACK_SECRET_KEY) {
      isValid = await verifyPaystackSignature(rawBody, paystackSig, env.PAYSTACK_SECRET_KEY);
    }
    if (!isValid && env.PAYSTACK_TEST_SECRET_KEY) {
      isValid = await verifyPaystackSignature(rawBody, paystackSig, env.PAYSTACK_TEST_SECRET_KEY);
    }

    if (!isValid) {
      console.warn('[worker] Invalid Paystack signature — signature did not match live or test key');
      return new Response('Unauthorized', { status: 401 });
    }

    // ─── Step 3: Parse event body ─────────────────────────────────────────────
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch (err) {
      console.error('[worker] Invalid JSON body:', err);
      return new Response('Bad Request', { status: 400 });
    }

    // ─── Step 4: Only process charge.success ──────────────────────────────────
    if (event.event !== 'charge.success') {
      console.log(`[worker] Ignoring event type: ${event.event}`);
      return new Response('OK', { status: 200 });
    }

    const data = event.data || {};
    const reference = data.reference;
    const email = data.customer?.email;
    const firstName = data.customer?.first_name || '';
    const lastName = data.customer?.last_name || '';
    const name = [firstName, lastName].filter(Boolean).join(' ') || email;
    const amountKobo = data.amount || 0;

    if (!reference || !email) {
      console.error('[worker] Missing reference or email in charge.success payload');
      return new Response('OK', { status: 200 });
    }

    // ─── Step 5: Idempotency check ────────────────────────────────────────────
    const kvKey = `tx:${reference}`;
    const existing = await env.LICENSES_KV.get(kvKey);
    if (existing) {
      console.log(`[worker] Duplicate event for reference ${reference} — skipping`);
      return new Response('OK', { status: 200 });
    }

    // ─── Step 6: Determine plan & generate license key ────────────────────────
    const { plan, expiry_date } = determinePlan(amountKobo);
    let licenseKey;
    try {
      licenseKey = await generateLicenseKey({
        licensee_name: name,
        licensee_email: email,
        plan,
        expiry_date,
        signingKey: env.QC_LICENSE_KEY,
      });
    } catch (err) {
      console.error('[worker] License key generation failed:', err);
      return new Response('Internal Server Error', { status: 500 });
    }

    // ─── Step 7: Store audit record in KV (90-day TTL) ────────────────────────
    const auditRecord = JSON.stringify({
      email,
      name,
      plan,
      expiry_date,
      license_key: licenseKey,
      amount_kobo: amountKobo,
      issued_at: new Date().toISOString(),
    });
    await env.LICENSES_KV.put(kvKey, auditRecord, { expirationTtl: 7_776_000 });

    // ─── Step 8: Send activation email via Brevo ───────────────────────────────
    const amountNaira = '₦' + (amountKobo / 100).toLocaleString('en-NG');
    try {
      await sendLicenseEmail({
        to: email,
        name,
        licenseKey,
        plan,
        expiryDate: expiry_date,
        amount: amountNaira,
        reference,
        apiKey: env.BREVO_API_KEY || env.RESEND_API_KEY,
      });
      console.log(`[worker] ✅ License emailed to ${email} — plan: ${plan}, ref: ${reference}`);
    } catch (err) {
      console.error(`[worker] ❌ Failed to send email to ${email}:`, err);
    }

    return new Response('OK', { status: 200 });
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Verifies Paystack HMAC-SHA512 webhook signature.
 */
async function verifyPaystackSignature(rawBody, signature, secretKey) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return computed === signature;
}

/**
 * Renders user-facing HTML success confirmation for browser callbacks.
 */
function renderSuccessHtml(reference, record) {
  const licenseKey = record?.license_key || '';
  const planName = record?.plan === 'lifetime' ? 'Lifetime License' : (record?.plan ? 'Annual License' : 'Pro License');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Successful — QuoteCraft</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #151d30;
      --card-border: #1e293b;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #10b981;
      --primary: #3b82f6;
      --code-bg: #090d16;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .container {
      max-width: 580px;
      width: 100%;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 40px 32px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
      text-align: center;
    }
    .icon-badge {
      width: 72px;
      height: 72px;
      background: rgba(16, 185, 129, 0.15);
      border: 2px solid rgba(16, 185, 129, 0.4);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 36px;
      color: var(--accent);
    }
    h1 {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.5px;
      margin-bottom: 8px;
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      background: rgba(59, 130, 246, 0.2);
      border: 1px solid rgba(59, 130, 246, 0.4);
      color: #60a5fa;
      border-radius: 100px;
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    p.lead {
      color: var(--text-muted);
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 28px;
    }
    .key-section {
      background: var(--code-bg);
      border: 1px solid #334155;
      border-radius: 14px;
      padding: 20px;
      margin-bottom: 28px;
      text-align: left;
    }
    .key-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      font-size: 12px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .key-box {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      font-weight: 600;
      color: #34d399;
      background: rgba(15, 23, 42, 0.6);
      padding: 12px 14px;
      border-radius: 8px;
      word-break: break-all;
      user-select: all;
      border: 1px solid #1e293b;
    }
    .copy-btn {
      margin-top: 12px;
      width: 100%;
      padding: 12px;
      background: var(--accent);
      color: #064e3b;
      font-size: 14px;
      font-weight: 700;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
    }
    .copy-btn:hover { background: #34d399; }
    .copy-btn:active { transform: scale(0.98); }
    .spinner {
      width: 28px;
      height: 28px;
      margin: 18px auto 4px;
      border: 3px solid rgba(148, 163, 184, 0.25);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: qc-spin 0.8s linear infinite;
    }
    @keyframes qc-spin { to { transform: rotate(360deg); } }
    .steps {
      text-align: left;
      background: rgba(15, 23, 42, 0.4);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 28px;
    }
    .steps h3 {
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 14px;
      color: var(--text-muted);
    }
    .step-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      font-size: 14px;
      color: var(--text);
      line-height: 1.5;
      margin-bottom: 12px;
    }
    .step-item:last-child { margin-bottom: 0; }
    .step-num {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #3b82f6;
      color: #fff;
      font-size: 12px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .note {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .note a { color: #60a5fa; text-decoration: none; }
    .footer-ref {
      margin-top: 20px;
      font-size: 12px;
      color: #64748b;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon-badge">✓</div>
    <h1>Payment Confirmed!</h1>
    <div class="badge">${planName}</div>
    <p class="lead">
      Thank you for purchasing QuoteCraft Pro. Your payment was processed successfully, and your personal license key is ready.
    </p>

    <div class="key-section">
      <div class="key-header">
        <span id="keyHeaderLabel">${licenseKey ? 'Your Activation Key' : 'Activation Status'}</span>
      </div>

      <div id="keyPending" style="display:${licenseKey ? 'none' : 'block'};">
        <p style="font-size:14px; color:#cbd5e1; line-height:1.5;">
          Payment received — generating your license key now. This takes just a few seconds and the page updates automatically.
        </p>
        <div class="spinner" aria-hidden="true"></div>
      </div>

      <div id="keyReady" style="display:${licenseKey ? 'block' : 'none'};">
        <div class="key-box" id="keyText">${licenseKey}</div>
        <button class="copy-btn" id="copyBtn" onclick="copyKey()">📋 Copy License Key</button>
      </div>

      <div id="keyTimeout" style="display:none;">
        <p style="font-size:14px; color:#cbd5e1; line-height:1.5;">
          Your payment is confirmed, but the key is taking a little longer to generate. A copy is also being emailed to you — you can refresh in a moment.
        </p>
        <button class="copy-btn" style="background:#3b82f6; color:#fff;" onclick="window.location.reload()">🔄 Refresh</button>
      </div>
    </div>

    <div class="steps">
      <h3>Quick Activation Guide</h3>
      <div class="step-item">
        <div class="step-num">1</div>
        <div>Open <strong>QuoteCraft</strong> on your PC and click <strong>⚙ Settings</strong>.</div>
      </div>
      <div class="step-item">
        <div class="step-num">2</div>
        <div>Scroll down to <strong>License & Activation</strong>.</div>
      </div>
      <div class="step-item">
        <div class="step-num">3</div>
        <div>Paste your key and click <strong>Activate License</strong>.</div>
      </div>
    </div>

    <p class="note">
      A receipt and backup copy of this key has also been emailed to you.<br />
      Questions? Contact <a href="mailto:ocatechskill@gmail.com">ocatechskill@gmail.com</a>
    </p>

    ${reference ? `<div class="footer-ref">Ref: ${reference}</div>` : ''}
  </div>

  <script>
    var REFERENCE = ${JSON.stringify(reference || '')};
    var MAX_ATTEMPTS = 20; // ~40s at 2s intervals
    var attempts = 0;
    var pollTimer = null;

    function copyKey() {
      const text = document.getElementById('keyText').innerText.trim();
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copyBtn');
        btn.innerText = '✅ Copied to Clipboard!';
        btn.style.background = '#059669';
        btn.style.color = '#fff';
        setTimeout(() => {
          btn.innerText = '📋 Copy License Key';
          btn.style.background = '';
          btn.style.color = '';
        }, 2500);
      });
    }

    function revealKey(key) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      const pending = document.getElementById('keyPending');
      const timeout = document.getElementById('keyTimeout');
      const ready = document.getElementById('keyReady');
      const label = document.getElementById('keyHeaderLabel');
      if (pending) pending.style.display = 'none';
      if (timeout) timeout.style.display = 'none';
      if (label) label.innerText = 'Your Activation Key';
      document.getElementById('keyText').innerText = key;
      if (ready) ready.style.display = 'block';
    }

    function pollForKey() {
      if (!REFERENCE) {
        document.getElementById('keyPending').style.display = 'none';
        document.getElementById('keyTimeout').style.display = 'block';
        return;
      }
      pollTimer = setInterval(function () {
        attempts++;
        fetch(window.location.pathname + '?format=json&reference=' + encodeURIComponent(REFERENCE) + '&t=' + Date.now())
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (data) {
            if (data && data.ready && data.license_key) revealKey(data.license_key);
          })
          .catch(function () { /* network hiccup — keep polling */ })
          .then(function () {
            if (!pollTimer) return;
            if (attempts >= MAX_ATTEMPTS) {
              clearInterval(pollTimer);
              pollTimer = null;
              document.getElementById('keyPending').style.display = 'none';
              document.getElementById('keyTimeout').style.display = 'block';
            }
          });
      }, 2000);
    }

    if (!document.getElementById('keyText').innerText.trim()) {
      pollForKey();
    }
  </script>
</body>
</html>`;
}
