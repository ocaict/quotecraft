/**
 * index.js — QuoteCraft License Worker Entry Point
 *
 * Handles Paystack `charge.success` webhooks to:
 *   1. Verify the Paystack HMAC-SHA512 signature
 *   2. Enforce idempotency via Cloudflare KV
 *   3. Generate an HMAC-SHA256 QuoteCraft Pro license key
 *   4. Send a branded activation email via Resend
 *   5. Return HTTP 200 to Paystack within ~300ms
 *
 * Environment Variables (set via `wrangler secret put`):
 *   - PAYSTACK_SECRET_KEY  : Paystack live secret key (sk_live_...)
 *   - QC_LICENSE_KEY       : QuoteCraft signing secret (same as desktop app)
 *   - RESEND_API_KEY       : Resend transactional email API key (re_...)
 *
 * KV Bindings (set in wrangler.toml):
 *   - LICENSES_KV          : KV namespace for idempotency & audit trail
 */

import { generateLicenseKey, determinePlan } from './licensing.js';
import { sendLicenseEmail } from './email.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health' && request.method === 'GET') {
      return new Response(JSON.stringify({ status: 'ok', service: 'quotecraft-license-worker' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Only handle POST /webhook
    if (url.pathname !== '/webhook' || request.method !== 'POST') {
      return new Response('Not Found', { status: 404 });
    }

    // ─── Step 1: Read raw body (MUST be done before any parsing) ──────────────
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
      // Always return 200 for unrelated events (Paystack expects 200)
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
      // Still return 200 to prevent Paystack from retrying forever
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

    // ─── Step 7: Store audit record in KV (90-day TTL = 7,776,000 seconds) ───
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
      // Do NOT return 500 — we've already stored the record in KV.
      // Paystack would retry and a duplicate email might be sent.
      // Log it and return 200; manual recovery is possible from KV.
    }

    return new Response('OK', { status: 200 });
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Verifies the Paystack HMAC-SHA512 webhook signature.
 *
 * @param {string} rawBody  - Raw request body text
 * @param {string} signature - Value of x-paystack-signature header
 * @param {string} secretKey - Paystack secret key from env
 * @returns {Promise<boolean>}
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
