/**
 * licensing.js — QuoteCraft Commercial License Engine
 *
 * Provides plan metadata, feature lists, tier limits, and unified validation
 * for both new online serial activation (v1 Crockford Base32 + Ed25519 entitlement tokens)
 * and legacy offline keys (QC-PRO-...).
 */

'use strict';

const crypto = require('crypto');
const { validateKeyFormat, normalizeKey, isValidKey } = require('../shared/license-key');
const { verifyEntitlementToken, isEntitlementValid } = require('./entitlement');

// ---------------------------------------------------------------------------
// Legacy Signing Key (preserved for existing test backwards compatibility)
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
// Legacy Base32 & HMAC helpers
// ---------------------------------------------------------------------------
const BASE32_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';

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

function signPayload(payloadJson) {
  return crypto.createHmac('sha256', SIGNING_KEY)
    .update(payloadJson, 'utf8')
    .digest();
}

/**
 * Generates a legacy QuoteCraft Pro license key (QC-PRO-...).
 * Kept for existing test and staging backwards compatibility.
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
  const sigB32 = toBase32(sigBytes.slice(0, 10));

  return `QC-PRO-${payloadB32}-${sigB32}`;
}

/**
 * Verifies a license key or entitlement token.
 * Supports:
 *   1. Entitlement Token: <base64url>.<base64url> (Ed25519 signature + grace window)
 *   2. Modern Serial: QC-XXXXX-XXXXX-XXXXX-XXXXX (Format & checksum validation)
 *   3. Legacy Key: QC-PRO-<B32>-<SIG> (HMAC-SHA256 validation)
 *
 * @param {string} keyString
 * @returns {{ ok: boolean, plan?: string, licensee_name?: string, licensee_email?: string,
 *             expiry_date?: string|null, issued_at?: string, expired?: boolean, message?: string, isPro?: boolean }}
 */
function verifyLicenseKey(keyString) {
  if (!keyString || typeof keyString !== 'string') {
    return { ok: false, message: 'No license key provided.' };
  }

  const trimmed = keyString.trim();

  // 1. Entitlement Token check (<payload>.<sig>)
  if (trimmed.includes('.') && trimmed.split('.').length === 2) {
    const tokenRes = verifyEntitlementToken(trimmed);
    if (!tokenRes.ok) {
      return { ok: false, message: 'Invalid entitlement token signature.' };
    }
    const payload = tokenRes.payload;
    const validity = isEntitlementValid(payload, Date.now());
    const expired = validity.reason === 'expired';
    const ok = validity.ok;

    return {
      ok,
      isPro: ok,
      plan: payload.plan,
      licensee_name: payload.name || '',
      licensee_email: payload.email || '',
      expiry_date: payload.expiry || null,
      issued_at: payload.issued_at,
      valid_until: payload.valid_until,
      expired,
      needsRefresh: validity.needsRefresh || false,
      message: expired
        ? `This license key expired on ${payload.expiry}.`
        : validity.needsRefresh
        ? 'Offline grace period ended. Please reconnect to the internet.'
        : `QuoteCraft Pro (${payload.plan}) — Valid`,
    };
  }

  // 2. Modern Crockford Serial check (QC-XXXXX-...)
  if (!trimmed.toUpperCase().startsWith('QC-PRO-')) {
    const fmt = validateKeyFormat(trimmed);
    if (!fmt.ok) {
      return {
        ok: false,
        message: fmt.reason === 'checksum'
          ? 'License key typo detected. Please check the characters.'
          : 'Invalid license key format.',
      };
    }
    // A valid serial format is ready for online activation
    return {
      ok: true,
      isPro: true,
      serial: fmt.serial,
      plan: fmt.plan,
      expiry_date: fmt.expiry,
      message: `QuoteCraft (${fmt.plan}) — Ready for online activation`,
    };
  }

  // 3. Legacy QC-PRO- key validation
  const withoutPrefix = trimmed.toUpperCase().slice('QC-PRO-'.length);
  const lastDash = withoutPrefix.lastIndexOf('-');
  if (lastDash === -1) {
    return { ok: false, message: 'Malformed license key: missing signature separator.' };
  }

  const payloadB32 = withoutPrefix.slice(0, lastDash);
  const sigB32 = withoutPrefix.slice(lastDash + 1);

  if (!payloadB32 || !sigB32) {
    return { ok: false, message: 'Malformed license key: empty payload or signature.' };
  }

  let payload;
  let payloadJson;
  try {
    const payloadBytes = fromBase32(payloadB32);
    payloadJson = payloadBytes.toString('utf8');
    payload = JSON.parse(payloadJson);
  } catch (err) {
    return { ok: false, message: `Failed to decode license key payload: ${err.message}` };
  }

  try {
    const expectedSigBytes = signPayload(payloadJson);
    const expectedSigB32 = toBase32(expectedSigBytes.slice(0, 10));

    if (sigB32.length !== expectedSigB32.length ||
        !crypto.timingSafeEqual(Buffer.from(sigB32), Buffer.from(expectedSigB32))) {
      return { ok: false, message: 'License key signature is invalid. The key may have been tampered with.' };
    }
  } catch (err) {
    return { ok: false, message: `Signature verification failed: ${err.message}` };
  }

  if (!payload.licensee_name || !payload.licensee_email || !payload.plan || !payload.sku) {
    return { ok: false, message: 'License key payload is missing required fields.' };
  }

  if (payload.sku !== 'QC-PRO-NG') {
    return { ok: false, message: `This license key is for a different product (SKU: ${payload.sku}).` };
  }

  let expired = false;
  if (payload.expiry_date) {
    const expiryMs = new Date(payload.expiry_date).getTime();
    if (!isNaN(expiryMs)) {
      expired = Date.now() > expiryMs;
    }
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
 * Returns whether a license key string represents an active Pro license.
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
  validateKeyFormat,
  normalizeKey,
  isValidKey,
  verifyEntitlementToken,
  isEntitlementValid,
  PLANS,
  PLAN_FEATURES,
  FREE_LIMITS,
};
