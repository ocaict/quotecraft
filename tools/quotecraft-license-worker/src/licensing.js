/**
 * licensing.js — QuoteCraft License Engine (Cloudflare Worker Port)
 *
 * Ported from src/main/licensing.js for use in the V8 isolate environment.
 * Uses the Web Crypto API instead of Node.js `crypto` for HMAC-SHA256.
 *
 * Key Format: QC-PRO-<BASE32_PAYLOAD>-<BASE32_SIGNATURE>
 */

'use strict';

// Crockford Base32 alphabet (no ambiguous chars O/0 I/1/L)
const BASE32_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ0123456789';

export function toBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of new Uint8Array(buffer)) {
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

export function fromBase32(str) {
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
  return new Uint8Array(bytes);
}

/**
 * Import the signing key as a CryptoKey for use with SubtleCrypto.
 */
async function importSigningKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/**
 * Generates a QuoteCraft Pro license key.
 *
 * @param {object} opts
 * @param {string} opts.licensee_name
 * @param {string} opts.licensee_email
 * @param {'annual'|'lifetime'} opts.plan
 * @param {string|null} opts.expiry_date - ISO date or null for lifetime
 * @param {string} opts.signingKey - The QC_LICENSE_KEY secret from env
 * @returns {Promise<string>} License key in QC-PRO-XXXX-XXXX format
 */
export async function generateLicenseKey({ licensee_name, licensee_email, plan, expiry_date, signingKey }) {
  const payload = {
    licensee_name: String(licensee_name).trim(),
    licensee_email: String(licensee_email).trim().toLowerCase(),
    plan,
    expiry_date: expiry_date || null,
    issued_at: new Date().toISOString(),
    sku: 'QC-PRO-NG',
  };

  const payloadJson = JSON.stringify(payload);
  const enc = new TextEncoder();

  const cryptoKey = await importSigningKey(signingKey);
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(payloadJson));

  const payloadB32 = toBase32(enc.encode(payloadJson));
  // Use first 10 bytes of signature for a compact key (80-bit security is fine for desktop app)
  const sigB32 = toBase32(new Uint8Array(sigBuffer).slice(0, 10));

  return `QC-PRO-${payloadB32}-${sigB32}`;
}

/**
 * Determines the plan and expiry based on the amount paid (in kobo).
 * Lifetime: ₦15,000 (1,500,000 kobo)
 * Annual:   ₦5,000 (500,000 kobo)
 *
 * @param {number} amountKobo
 * @returns {{ plan: 'annual'|'lifetime', expiry_date: string|null }}
 */
export function determinePlan(amountKobo) {
  // Any payment >= ₦10,000 (1,000,000 kobo) qualifies for Lifetime Access
  const isLifetime = amountKobo >= 1_000_000;
  if (isLifetime) {
    return { plan: 'lifetime', expiry_date: null };
  }
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  return { plan: 'annual', expiry_date: expiry.toISOString().split('T')[0] };
}
