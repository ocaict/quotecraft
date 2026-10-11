/**
 * licensing.js — QuoteCraft Offline Commercial License Engine
 *
 * Generates and verifies HMAC-SHA256 signed license keys for QuoteCraft Pro.
 *
 * License Key Format:
 *   QC-PRO-<BASE32_PAYLOAD>-<BASE32_SIGNATURE>
 *
 * Payload JSON (Base32-encoded):
 *   {
 *     licensee_name: string,
 *     licensee_email: string,
 *     plan: 'annual' | 'lifetime',
 *     expiry_date: string | null,   // ISO date string or null for lifetime
 *     issued_at: string,            // ISO date string
 *     sku: 'QC-PRO-NG',            // Product SKU
 *   }
 *
 * The signature is HMAC-SHA256 of the payload JSON, keyed with SIGNING_KEY.
 * Verification is entirely offline; no internet required.
 */

'use strict';

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Signing Key — keep this SECRET on the server that generates licenses.
// The bundled app only needs this to VERIFY (can be same key for symmetric HMAC).
// For production, replace with your own 64+ character random secret.
// ---------------------------------------------------------------------------
const SIGNING_KEY = process.env.QC_LICENSE_KEY ||
  'QuoteCraft-Nigeria-2026-CommercialLicense-SigningSecret-v1-Do-Not-Share';

// Supported plans
const PLANS = Object.freeze({
  annual: 'annual',
  lifetime: 'lifetime',
  ANNUAL: 'annual',
  LIFETIME: 'lifetime',
});

// Feature list for each plan
const PLAN_FEATURES = Object.freeze({
  free: [
    'Up to 3 active clients',
    'Standard PDF templates',
    'Manual payment recording',
    'Local ZIP backups',
  ],
  pro: [
    'Unlimited clients & documents',
    'Paystack automatic payment link generation',
    '1-click Paystack payment verification',
    'WhatsApp 1-click invoice & quote sharing',
    'WHT & FIRS tax breakdown engine (7.5% VAT, 5%/10% WHT)',
    'Custom PDF branding & themes',
    'Domiciliary (USD/GBP/EUR) bank details on invoices',
    'Priority support',
  ],
});

// Free tier limits
const FREE_LIMITS = Object.freeze({
  maxClients: 3,
  MAX_CLIENTS: 3,
});

// ---------------------------------------------------------------------------
// Base32 helpers (Crockford alphabet — no ambiguous chars O/0 I/1)
// ---------------------------------------------------------------------------
const BASE32_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789'; // 32 chars

function toBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

function fromBase32(str) {
  const charMap = {};
  for (let i = 0; i < BASE32_ALPHABET.length; i++) {
    charMap[BASE32_ALPHABET[i]] = i;
  }
  let bits = 0;
  let value = 0;
  const bytes = [];
  const upper = str.toUpperCase().replace(/[^A-GHJKMNPQRSTVWXYZ0-9]/g, '');
  for (const char of upper) {
    if (charMap[char] === undefined) throw new Error(`Invalid Base32 character: ${char}`);
    value = (value << 5) | charMap[char];
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

// ---------------------------------------------------------------------------
// Core cryptographic operations
// ---------------------------------------------------------------------------

function signPayload(payloadJson) {
  return crypto.createHmac('sha256', SIGNING_KEY)
    .update(payloadJson, 'utf8')
    .digest();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a QuoteCraft Pro license key.
 *
 * @param {object} opts
 * @param {string} opts.licensee_name  - Name of the licensee
 * @param {string} opts.licensee_email - Email of the licensee
 * @param {'annual'|'lifetime'} opts.plan - License plan
 * @param {string|null} [opts.expiry_date] - Expiry ISO date (null for lifetime)
 * @returns {string} License key in QC-PRO-XXXX-XXXX format
 */
function generateLicenseKey({ licensee_name, licensee_email, plan, expiry_date = null }) {
  if (!licensee_name || !licensee_email) {
    throw new Error('licensee_name and licensee_email are required.');
  }
  if (!PLANS[plan]) {
    throw new Error(`Invalid plan "${plan}". Must be one of: ${Object.keys(PLANS).join(', ')}`);
  }
  if (plan === 'annual' && !expiry_date) {
    throw new Error('expiry_date is required for annual licenses.');
  }

  const payload = {
    licensee_name: String(licensee_name).trim(),
    licensee_email: String(licensee_email).trim().toLowerCase(),
    plan,
    expiry_date: expiry_date || null,
    issued_at: new Date().toISOString(),
    sku: 'QC-PRO-NG',
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB32 = toBase32(Buffer.from(payloadJson, 'utf8'));
  const sigBytes = signPayload(payloadJson);
  // Use only first 10 bytes of signature for brevity (80-bit security for a desktop app)
  const sigB32 = toBase32(sigBytes.slice(0, 10));

  return `QC-PRO-${payloadB32}-${sigB32}`;
}

/**
 * Verifies a QuoteCraft license key.
 *
 * @param {string} keyString - The license key to verify
 * @returns {{ ok: boolean, plan?: string, licensee_name?: string, licensee_email?: string,
 *             expiry_date?: string|null, issued_at?: string, expired?: boolean, message?: string }}
 */
function verifyLicenseKey(keyString) {
  if (!keyString || typeof keyString !== 'string') {
    return { ok: false, message: 'No license key provided.' };
  }

  const trimmed = keyString.trim().toUpperCase();

  // Format check
  if (!trimmed.startsWith('QC-PRO-')) {
    return { ok: false, message: 'Invalid license key format. Key must start with QC-PRO-.' };
  }

  // Split on the last '-' to separate payload from signature
  // Key format: QC-PRO-<PAYLOAD>-<SIG>
  const withoutPrefix = trimmed.slice('QC-PRO-'.length);
  const lastDash = withoutPrefix.lastIndexOf('-');
  if (lastDash === -1) {
    return { ok: false, message: 'Malformed license key: missing signature separator.' };
  }

  const payloadB32 = withoutPrefix.slice(0, lastDash);
  const sigB32 = withoutPrefix.slice(lastDash + 1);

  if (!payloadB32 || !sigB32) {
    return { ok: false, message: 'Malformed license key: empty payload or signature.' };
  }

  // Decode payload
  let payload;
  let payloadJson;
  try {
    const payloadBytes = fromBase32(payloadB32);
    payloadJson = payloadBytes.toString('utf8');
    payload = JSON.parse(payloadJson);
  } catch (err) {
    return { ok: false, message: `Failed to decode license key payload: ${err.message}` };
  }

  // Verify signature
  try {
    const expectedSigBytes = signPayload(payloadJson);
    const expectedSigB32 = toBase32(expectedSigBytes.slice(0, 10));

    // Constant-time comparison to prevent timing attacks
    if (sigB32.length !== expectedSigB32.length ||
        !crypto.timingSafeEqual(Buffer.from(sigB32), Buffer.from(expectedSigB32))) {
      return { ok: false, message: 'License key signature is invalid. The key may have been tampered with.' };
    }
  } catch (err) {
    return { ok: false, message: `Signature verification failed: ${err.message}` };
  }

  // Validate payload fields
  if (!payload.licensee_name || !payload.licensee_email || !payload.plan || !payload.sku) {
    return { ok: false, message: 'License key payload is missing required fields.' };
  }

  if (payload.sku !== 'QC-PRO-NG') {
    return { ok: false, message: `This license key is for a different product (SKU: ${payload.sku}).` };
  }

  // Check expiry
  let expired = false;
  if (payload.expiry_date) {
    const expiryMs = new Date(payload.expiry_date).getTime();
    if (isNaN(expiryMs)) {
      return { ok: false, message: 'License key contains an invalid expiry date.' };
    }
    expired = Date.now() > expiryMs;
  }

  return {
    ok: !expired,
    isPro: !expired,
    plan: payload.plan,
    licensee_name: payload.licensee_name,
    licensee_email: payload.licensee_email,
    expiry_date: payload.expiry_date || null,
    issued_at: payload.issued_at,
    expired,
    message: expired
      ? `This license key expired on ${new Date(payload.expiry_date).toLocaleDateString()}.`
      : `QuoteCraft Pro (${payload.plan}) — Valid`,
  };
}

/**
 * Returns whether a license is currently active (ok and not expired).
 * Quick helper to call from feature gates.
 *
 * @param {string|null} keyString
 * @returns {boolean}
 */
function isProLicense(keyString) {
  if (!keyString) return false;
  const result = verifyLicenseKey(keyString);
  return result.ok === true && !result.expired;
}

module.exports = {
  generateLicenseKey,
  verifyLicenseKey,
  isProLicense,
  PLANS,
  PLAN_FEATURES,
  FREE_LIMITS,
};
