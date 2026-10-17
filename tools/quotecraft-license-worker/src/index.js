/**
 * index.js — QuoteCraft License Worker Entry Point
 *
 * Endpoints:
 *   1. GET  /health: Health check endpoint.
 *   2. GET  /webhook, /callback, /success: Browser redirects displaying confirmation & key.
 *   3. POST /webhook: Paystack charge.success webhook handler (durable serial creation & email).
 *   4. POST /activate: Online activation & device binding (issues Ed25519 entitlement token).
 *   5. POST /deactivate: Releases a device seat.
 *   6. POST /validate: Validates cached entitlement token and refreshes offline grace window.
 */

'use strict';

import {
  generateSerial,
  validateKeyFormat,
  determinePlan,
  buildEntitlement,
  signEntitlementToken,
  verifyEntitlementToken,
  normalizeKey,
} from './licensing.js';
import { createLicensingStore } from './licensing-store.js';
import { sendLicenseEmail } from './email.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-paystack-signature',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);

    // ─── CORS Preflight ───────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ─── Health check ────────────────────────────────────────────────────────
    if (url.pathname === '/health' && request.method === 'GET') {
      return jsonResponse({ status: 'ok', service: 'quotecraft-license-worker' });
    }

    const store = createLicensingStore(env);

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

      if (reference) {
        try {
          record = await store.getTransaction(reference);
        } catch (e) {
          console.error('[worker] Error retrieving record for callback:', e);
        }
      }

      // JSON status endpoint used by the success page to poll until the
      // charge.success webhook has finished writing the key to the store.
      if (url.searchParams.get('format') === 'json') {
        const key = record?.serial || record?.license_key || null;
        return new Response(
          JSON.stringify({
            ready: Boolean(key),
            license_key: key,
            plan: record?.plan || null,
            reference,
          }),
          {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
              ...CORS_HEADERS,
            },
          }
        );
      }

      return new Response(renderSuccessHtml(reference, record), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // ─── POST /activate ───────────────────────────────────────────────────────
    if (url.pathname === '/activate' && request.method === 'POST') {
      return handleActivate(request, env, store);
    }

    // ─── POST /deactivate ─────────────────────────────────────────────────────
    if (url.pathname === '/deactivate' && request.method === 'POST') {
      return handleDeactivate(request, env, store);
    }

    // ─── POST /validate ───────────────────────────────────────────────────────
    if (url.pathname === '/validate' && request.method === 'POST') {
      return handleValidate(request, env, store);
    }

    // ─── POST /webhook ────────────────────────────────────────────────────────
    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env, store);
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  },
};

// ─── Endpoint Handlers ────────────────────────────────────────────────────────

/**
 * Handles device activation against a license key.
 */
async function handleActivate(request, env, store) {
  let body;
  try {
    body = await request.json();
  } catch (_e) {
    return jsonResponse({ ok: false, reason: 'malformed', message: 'Invalid JSON body' }, 400);
  }

  const { key, device_id, app_version } = body || {};
  if (!key || !device_id) {
    return jsonResponse({ ok: false, reason: 'malformed', message: 'key and device_id are required' }, 400);
  }

  // Rate limiting per IP and per key
  const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const ipLimit = await store.checkRateLimit('ip', clientIp, 20, 60);
  if (!ipLimit.allowed) {
    return jsonResponse({ ok: false, reason: 'rate_limited', message: 'Too many requests. Please wait a minute.' }, 429);
  }

  const normKey = normalizeKey(key);
  const keyLimit = await store.checkRateLimit('key', normKey, 10, 60);
  if (!keyLimit.allowed) {
    return jsonResponse({ ok: false, reason: 'rate_limited', message: 'Too many activation attempts for this key.' }, 429);
  }

  // Format and checksum validation
  const fmt = validateKeyFormat(key);
  if (!fmt.ok) {
    return jsonResponse({ ok: false, reason: 'malformed', message: 'Invalid license key format or checksum' }, 400);
  }

  const serial = fmt.serial;
  const license = await store.getLicense(serial);
  if (!license) {
    return jsonResponse({ ok: false, reason: 'invalid', message: 'License key not found' }, 404);
  }

  if (license.status !== 'active') {
    return jsonResponse({ ok: false, reason: license.status || 'revoked' }, 403);
  }

  if (license.expiry) {
    const expiryMs = Date.parse(license.expiry);
    if (!isNaN(expiryMs) && Date.now() > expiryMs + 86400000) {
      return jsonResponse({ ok: false, reason: 'expired' }, 403);
    }
  }

  // Device seat binding (idempotent for the same device_id)
  const bindRes = await store.bindDevice(serial, { device_id, app_version });
  if (!bindRes.ok) {
    return jsonResponse({ ok: false, reason: bindRes.reason }, 403);
  }

  // Issue Ed25519-signed Entitlement Token (valid for 30-day offline grace)
  const entitlement = buildEntitlement({
    serial: license.serial,
    name: license.name,
    plan: license.plan,
    expiry: license.expiry,
    device_id,
    graceDays: 30,
  });

  let token;
  try {
    token = await signEntitlementToken(entitlement, env.QC_LICENSE_PRIVATE_KEY);
  } catch (err) {
    console.error('[worker] Failed to sign entitlement token:', err);
    return jsonResponse({ ok: false, reason: 'internal_error' }, 500);
  }

  return jsonResponse({
    ok: true,
    token,
    license: {
      name: license.name,
      plan: license.plan,
      expiry: license.expiry,
    },
  });
}

/**
 * Handles device unbinding (releasing a seat).
 */
async function handleDeactivate(request, env, store) {
  let body;
  try {
    body = await request.json();
  } catch (_e) {
    return jsonResponse({ ok: false, reason: 'malformed', message: 'Invalid JSON body' }, 400);
  }

  const { key, device_id } = body || {};
  if (!key || !device_id) {
    return jsonResponse({ ok: false, reason: 'malformed', message: 'key and device_id are required' }, 400);
  }

  const fmt = validateKeyFormat(key);
  if (!fmt.ok) {
    return jsonResponse({ ok: false, reason: 'malformed' }, 400);
  }

  const res = await store.unbindDevice(fmt.serial, device_id);
  if (!res.ok) {
    return jsonResponse({ ok: false, released: false, reason: res.reason }, res.reason === 'invalid' ? 404 : 400);
  }

  return jsonResponse({ ok: true, released: true });
}

/**
 * Handles online validation and grace period refresh.
 */
async function handleValidate(request, env, store) {
  let body;
  try {
    body = await request.json();
  } catch (_e) {
    return jsonResponse({ ok: false, reason: 'malformed', message: 'Invalid JSON body' }, 400);
  }

  const { token } = body || {};
  if (!token) {
    return jsonResponse({ ok: false, reason: 'malformed', message: 'token is required' }, 400);
  }

  // Verify signature with embedded or env public key
  const verifyRes = await verifyEntitlementToken(token, env.QC_LICENSE_PUBLIC_KEY);
  if (!verifyRes.ok) {
    return jsonResponse({ ok: false, reason: 'invalid_token' }, 400);
  }

  const payload = verifyRes.payload;
  const license = await store.getLicense(payload.serial);
  if (!license) {
    return jsonResponse({ ok: false, reason: 'revoked' }, 403);
  }

  if (license.status !== 'active') {
    return jsonResponse({ ok: false, reason: license.status || 'revoked' }, 403);
  }

  if (license.expiry) {
    const expiryMs = Date.parse(license.expiry);
    if (!isNaN(expiryMs) && Date.now() > expiryMs + 86400000) {
      return jsonResponse({ ok: false, reason: 'expired' }, 403);
    }
  }

  // Ensure this device is still bound to the key
  if (payload.device_id && Array.isArray(license.devices)) {
    const isBound = license.devices.some((d) => d.device_id === payload.device_id);
    if (!isBound) {
      return jsonResponse({ ok: false, reason: 'device_unlinked' }, 403);
    }
  }

  // Issue refreshed token with a new 30-day offline grace window
  const refreshed = buildEntitlement({
    serial: license.serial,
    name: license.name,
    plan: license.plan,
    expiry: license.expiry,
    device_id: payload.device_id,
    graceDays: 30,
  });

  let freshToken;
  try {
    freshToken = await signEntitlementToken(refreshed, env.QC_LICENSE_PRIVATE_KEY);
  } catch (err) {
    console.error('[worker] Failed to sign refreshed token:', err);
    return jsonResponse({ ok: false, reason: 'internal_error' }, 500);
  }

  return jsonResponse({ ok: true, token: freshToken });
}

/**
 * Handles Paystack charge.success webhook.
 */
async function handleWebhook(request, env, store) {
  let rawBody;
  try {
    rawBody = await request.text();
  } catch (err) {
    console.error('[worker] Failed to read request body:', err);
    return new Response('Bad Request', { status: 400, headers: CORS_HEADERS });
  }

  // Verify Paystack HMAC-SHA512 Signature
  const paystackSig = request.headers.get('x-paystack-signature');
  if (!paystackSig) {
    console.warn('[worker] Missing x-paystack-signature header');
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  let isValid = false;
  if (env.PAYSTACK_SECRET_KEY) {
    isValid = await verifyPaystackSignature(rawBody, paystackSig, env.PAYSTACK_SECRET_KEY);
  }
  if (!isValid && env.PAYSTACK_TEST_SECRET_KEY) {
    isValid = await verifyPaystackSignature(rawBody, paystackSig, env.PAYSTACK_TEST_SECRET_KEY);
  }

  if (!isValid) {
    console.warn('[worker] Invalid Paystack signature — did not match live or test key');
    return new Response('Unauthorized', { status: 401, headers: CORS_HEADERS });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error('[worker] Invalid JSON body:', err);
    return new Response('Bad Request', { status: 400, headers: CORS_HEADERS });
  }

  // Only process charge.success
  if (event.event !== 'charge.success') {
    console.log(`[worker] Ignoring event type: ${event.event}`);
    return new Response('OK', { status: 200, headers: CORS_HEADERS });
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
    return new Response('OK', { status: 200, headers: CORS_HEADERS });
  }

  // Idempotency check: don't double-issue
  const existing = await store.getTransaction(reference);
  if (existing) {
    console.log(`[worker] Duplicate event for reference ${reference} — skipping`);
    return new Response('OK', { status: 200, headers: CORS_HEADERS });
  }

  // Determine plan and generate short Crockford serial
  const { plan, expiry_date } = determinePlan(amountKobo);
  let serial;
  try {
    serial = generateSerial({ plan, expiry: expiry_date });
  } catch (err) {
    console.error('[worker] License key generation failed:', err);
    return new Response('Internal Server Error', { status: 500, headers: CORS_HEADERS });
  }

  // Store durably in license store (NO TTL)
  const record = {
    serial,
    name,
    email,
    plan,
    expiry: expiry_date,
    status: 'active',
    devices: [],
    max_devices: 2,
    activation_count: 0,
    issued_at: new Date().toISOString(),
    paystack_reference: reference,
    amount_kobo: amountKobo,
  };

  try {
    await store.createLicense(record);
  } catch (err) {
    console.error('[worker] Failed to store durable license record:', err);
    return new Response('Internal Server Error', { status: 500, headers: CORS_HEADERS });
  }

  // Send activation email via Brevo
  const amountNaira = '₦' + (amountKobo / 100).toLocaleString('en-NG');
  try {
    await sendLicenseEmail({
      to: email,
      name,
      licenseKey: serial,
      plan,
      expiryDate: expiry_date,
      amount: amountNaira,
      reference,
      apiKey: env.BREVO_API_KEY || env.RESEND_API_KEY,
    });
    console.log(`[worker] ✅ License emailed to ${email} — key: ${serial}, plan: ${plan}, ref: ${reference}`);
  } catch (err) {
    console.error(`[worker] ❌ Failed to send email to ${email}:`, err);
  }

  return new Response('OK', { status: 200, headers: CORS_HEADERS });
}

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
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return computed === signature;
}

/**
 * Renders user-facing HTML success confirmation for browser callbacks.
 */
function renderSuccessHtml(reference, record) {
  const licenseKey = record?.serial || record?.license_key || '';
  const planName =
    record?.plan === 'lifetime' ? 'Lifetime License' : record?.plan ? 'Annual License' : 'Pro License';

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
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 1.5px;
      color: #34d399;
      background: rgba(15, 23, 42, 0.6);
      padding: 12px 14px;
      border-radius: 8px;
      word-break: break-all;
      user-select: all;
      border: 1px solid #1e293b;
      text-align: center;
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
    var MAX_ATTEMPTS = 20;
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
          .catch(function () { /* network error — retry */ })
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
