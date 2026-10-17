/**
 * licensing.js — QuoteCraft License & Entitlement Engine (Cloudflare Worker)
 *
 * Implements:
 * 1. Crockford Base32 v1 serial generation, normalization, and checksum validation
 *    matching src/shared/license-key.js.
 * 2. Ed25519 digital signature and verification for Entitlement Tokens via WebCrypto.
 * 3. Payment-to-plan mapping for Paystack transactions.
 *
 * Key format: QC-XXXXX-XXXXX-XXXXX-XXXXX
 */

'use strict';

// ---------------------------------------------------------------------------
// Crockford Base32 & Serial Format (v1)
// ---------------------------------------------------------------------------

export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // 32 chars, no I L O U
export const KEY_PREFIX = 'QC';
export const FORMAT_VERSION = '1';
export const GROUPS = 4;
export const GROUP_LEN = 5;
export const PAYLOAD_LEN = GROUPS * GROUP_LEN; // 20
export const SERIAL_LEN = 13;
export const EXPIRY_LEN = 4;
export const EPOCH_MS = Date.UTC(2020, 0, 1);
export const DAY_MS = 86400000;

export const PLAN_CODES = { annual: 'A', lifetime: 'P', trial: 'T' };
export const PLAN_CODE_TO_PLAN = { A: 'annual', P: 'lifetime', T: 'trial' };

// DEV keypair fallbacks for local development / testing
export const DEV_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIHqE0SnR6rMoBr4biI7KErngMuXONykLBh+hSouo8e28
-----END PRIVATE KEY-----
`;

export const DEV_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA23GGnTyS9KuyzQZuW2XVdHcyUL0m8T3QQCw3P6CUVzM=
-----END PUBLIC KEY-----
`;

function charValue(ch) {
  const idx = CROCKFORD.indexOf(ch);
  if (idx === -1) throw new Error('Invalid Base32 character: ' + ch);
  return idx;
}

/**
 * Normalizes input key: uppercase, strip separators, map O->0, I/L->1.
 * @param {string} input
 * @returns {string}
 */
export function normalizeKey(input) {
  if (input === null || input === undefined) return '';
  const s = String(input).toUpperCase().replace(/[^0-9A-Z]/g, '');
  return s.replace(/O/g, '0').replace(/[IL]/g, '1');
}

function encodeBase32Number(n, len) {
  let out = '';
  for (let i = len - 1; i >= 0; i--) {
    out = CROCKFORD[n & 31] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

function decodeBase32Number(chars) {
  let n = 0;
  for (let i = 0; i < chars.length; i++) {
    n = n * 32 + charValue(chars[i]);
  }
  return n;
}

/** Weighted mod-32 checksum catches single-character errors & transpositions. */
export function checksumChar(payload19) {
  let sum = 0;
  for (let i = 0; i < payload19.length; i++) {
    sum += (i + 1) * charValue(payload19[i]);
  }
  return CROCKFORD[sum % 32];
}

export function encodeExpiry(expiry) {
  if (!expiry) return '0000';
  const ms = Date.parse(expiry);
  if (isNaN(ms)) throw new Error('Invalid expiry date: ' + expiry);
  let days = Math.floor((ms - EPOCH_MS) / DAY_MS);
  if (days < 0) days = 0;
  if (days > 1048575) throw new Error('Expiry date too far in the future: ' + expiry);
  return encodeBase32Number(days, EXPIRY_LEN);
}

export function decodeExpiry(code) {
  if (code === '0000') return null;
  const days = decodeBase32Number(code);
  return new Date(EPOCH_MS + days * DAY_MS).toISOString().slice(0, 10);
}

export function formatKey(payload20) {
  const groups = [];
  for (let i = 0; i < GROUPS; i++) {
    groups.push(payload20.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN));
  }
  return KEY_PREFIX + '-' + groups.join('-');
}

/**
 * Generates an activation serial key.
 * Uses WebCrypto crypto.getRandomValues for random bytes.
 *
 * @param {{ plan: 'annual'|'lifetime'|'trial', expiry?: string|null }} [opts]
 * @returns {string} e.g. QC-7A2K9-4MPQ8-XT5R2-9WZ3D
 */
export function generateSerial(opts = {}) {
  const plan = opts.plan || 'lifetime';
  const planCode = PLAN_CODES[plan];
  if (!planCode) {
    throw new Error(`Invalid plan "${plan}". Use annual, lifetime or trial.`);
  }
  if (plan === 'annual' && !opts.expiry) {
    throw new Error('expiry is required for annual licenses.');
  }

  const bytes = new Uint8Array(SERIAL_LEN);
  crypto.getRandomValues(bytes);

  let serial = '';
  for (let i = 0; i < SERIAL_LEN; i++) {
    serial += CROCKFORD[bytes[i] % 32];
  }

  const expiryCode = plan === 'lifetime' ? '0000' : encodeExpiry(opts.expiry);
  const payload19 = FORMAT_VERSION + planCode + expiryCode + serial;
  const payload20 = payload19 + checksumChar(payload19);
  return formatKey(payload20);
}

/**
 * Validates key format + checksum locally.
 *
 * @param {string} input
 * @returns {{ ok: boolean, reason?: string, version?: string, plan?: string,
 *             expiry?: string|null, serial?: string, normalized?: string }}
 */
export function validateKeyFormat(input) {
  const norm = normalizeKey(input);
  if (!norm) return { ok: false, reason: 'missing' };

  let payload = norm;
  if (payload.length === PAYLOAD_LEN + KEY_PREFIX.length && payload.slice(0, 2) === KEY_PREFIX) {
    payload = payload.slice(2);
  }
  if (payload.length !== PAYLOAD_LEN) {
    return { ok: false, reason: 'length' };
  }

  for (let i = 0; i < payload.length; i++) {
    if (CROCKFORD.indexOf(payload[i]) === -1) {
      return { ok: false, reason: 'alphabet' };
    }
  }

  const body = payload.slice(0, PAYLOAD_LEN - 1);
  const given = payload[PAYLOAD_LEN - 1];
  if (checksumChar(body) !== given) {
    return { ok: false, reason: 'checksum' };
  }

  const version = body[0];
  if (version !== FORMAT_VERSION) {
    return { ok: false, reason: 'version' };
  }

  const planCode = body[1];
  const plan = PLAN_CODE_TO_PLAN[planCode];
  if (!plan) {
    return { ok: false, reason: 'plan' };
  }

  const expiryCode = body.slice(2, 2 + EXPIRY_LEN);
  let expiry;
  try {
    expiry = decodeExpiry(expiryCode);
  } catch (_e) {
    return { ok: false, reason: 'expiry' };
  }

  return {
    ok: true,
    version,
    plan,
    expiry,
    serial: formatKey(payload),
    normalized: payload,
  };
}

// ---------------------------------------------------------------------------
// WebCrypto Ed25519 Entitlement Signing & Verification
// ---------------------------------------------------------------------------

export function base64UrlEncode(bytes) {
  let bin = '';
  if (typeof bytes === 'string') {
    bin = bytes;
  } else {
    const arr = new Uint8Array(bytes);
    const chunk = 8192;
    for (let i = 0; i < arr.length; i += chunk) {
      bin += String.fromCharCode(...arr.subarray(i, i + chunk));
    }
  }
  return btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlDecode(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) {
    b64 += '=';
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function pemToDer(pem, header) {
  const clean = String(pem).replace(/\\n/g, '\n');
  const b64 = clean
    .replace(new RegExp(`-----BEGIN ${header}-----`), '')
    .replace(new RegExp(`-----END ${header}-----`), '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes.buffer;
}

let _cachedSignKey = null;
let _cachedSignPem = null;

export async function getSigningKey(privateKeyPem) {
  const pem = privateKeyPem || DEV_PRIVATE_KEY_PEM;
  if (_cachedSignKey && _cachedSignPem === pem) {
    return _cachedSignKey;
  }
  const der = pemToDer(pem, '(?:EC |RSA )?PRIVATE KEY');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'Ed25519' },
    false,
    ['sign']
  );
  _cachedSignKey = key;
  _cachedSignPem = pem;
  return key;
}

let _cachedVerifyKey = null;
let _cachedVerifyPem = null;

export async function getVerifyingKey(publicKeyPem) {
  const pem = publicKeyPem || DEV_PUBLIC_KEY_PEM;
  if (_cachedVerifyKey && _cachedVerifyPem === pem) {
    return _cachedVerifyKey;
  }
  const der = pemToDer(pem, '(?:EC |RSA )?PUBLIC KEY');
  const key = await crypto.subtle.importKey(
    'spki',
    der,
    { name: 'Ed25519' },
    false,
    ['verify']
  );
  _cachedVerifyKey = key;
  _cachedVerifyPem = pem;
  return key;
}

/**
 * Builds an entitlement payload with standard 30-day offline grace window.
 */
export function buildEntitlement({ serial, name, plan, expiry, device_id, graceDays = 30 }) {
  const issuedAt = new Date();
  return {
    serial,
    name: name || '',
    plan,
    expiry: expiry || null,
    device_id: device_id || null,
    issued_at: issuedAt.toISOString(),
    valid_until: new Date(issuedAt.getTime() + graceDays * DAY_MS).toISOString(),
  };
}

/**
 * Signs an entitlement payload and returns the token string: <base64url(json)>.<base64url(sig)>
 *
 * @param {object} payload
 * @param {string} [privateKeyPem]
 * @returns {Promise<string>}
 */
export async function signEntitlementToken(payload, privateKeyPem) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('payload object is required.');
  }
  const payloadJson = JSON.stringify(payload);
  const key = await getSigningKey(privateKeyPem);
  const enc = new TextEncoder();
  const sigBuffer = await crypto.subtle.sign('Ed25519', key, enc.encode(payloadJson));

  const b64Payload = base64UrlEncode(enc.encode(payloadJson));
  const b64Sig = base64UrlEncode(new Uint8Array(sigBuffer));
  return `${b64Payload}.${b64Sig}`;
}

/**
 * Verifies an entitlement token using the public key and returns the parsed payload.
 *
 * @param {string} token
 * @param {string} [publicKeyPem]
 * @returns {Promise<{ ok: boolean, payload?: object, reason?: string }>}
 */
export async function verifyEntitlementToken(token, publicKeyPem) {
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'missing' };
  }
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: 'malformed' };
  }

  let payloadJson;
  let payload;
  try {
    const rawBytes = base64UrlDecode(parts[0]);
    payloadJson = new TextDecoder().decode(rawBytes);
    payload = JSON.parse(payloadJson);
  } catch (_e) {
    return { ok: false, reason: 'payload' };
  }

  try {
    const verifyKey = await getVerifyingKey(publicKeyPem);
    const sigBytes = base64UrlDecode(parts[1]);
    const enc = new TextEncoder();
    const valid = await crypto.subtle.verify('Ed25519', verifyKey, sigBytes, enc.encode(payloadJson));
    if (!valid) return { ok: false, reason: 'signature' };
  } catch (_e) {
    return { ok: false, reason: 'signature' };
  }

  return { ok: true, payload };
}

// ---------------------------------------------------------------------------
// Pricing & Plan determination
// ---------------------------------------------------------------------------

/**
 * Determines plan and expiry date from Paystack amount (in kobo).
 * Lifetime: ₦15,000 (1,500,000 kobo); any amount >= ₦10,000 (1,000,000 kobo)
 * Annual:   ₦5,000 (500,000 kobo)
 *
 * @param {number} amountKobo
 * @returns {{ plan: 'annual'|'lifetime', expiry_date: string|null }}
 */
export function determinePlan(amountKobo) {
  const isLifetime = (amountKobo || 0) >= 1_000_000;
  if (isLifetime) {
    return { plan: 'lifetime', expiry_date: null };
  }
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  return { plan: 'annual', expiry_date: expiry.toISOString().split('T')[0] };
}
