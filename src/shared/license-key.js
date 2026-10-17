/**
 * license-key.js — QuoteCraft activation key format (v1)
 *
 * Human-friendly, Adobe/Corel-style activation key:
 *
 *     QC-7A2K9-4MPQ8-XT5R2-9WZ3D
 *
 * The key is a *serial* (not a self-contained cryptographic proof). It carries only
 * UX hints (plan / expiry) and a checksum so typos can be caught locally. The real
 * validity check happens online against the Worker, which holds the signing secret.
 *
 * Layout — 20 Crockford Base32 chars (4 groups x 5), after the "QC" prefix:
 *
 *   [0]      format version        ('1')
 *   [1]      plan code             (A=annual, P=lifetime, T=trial)
 *   [2..5]   expiry bucket         days since 2020-01-01 (base32); '0000' = no expiry
 *   [6..18]  random serial         13 chars (~65 bits of entropy)
 *   [19]     checksum              weighted mod-32 over chars [0..18]
 *
 * Crockford alphabet omits I, L, O, U; normalization maps O->0 and I/L->1.
 *
 * Dual export: CommonJS (main process / scripts / tests) and window (renderer).
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

var CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // 32 chars, no I L O U
var KEY_PREFIX = 'QC';
var FORMAT_VERSION = '1';
var GROUPS = 4;
var GROUP_LEN = 5;
var PAYLOAD_LEN = GROUPS * GROUP_LEN; // 20
var SERIAL_LEN = 13;
var EXPIRY_LEN = 4;
var EPOCH_MS = Date.UTC(2020, 0, 1);
var DAY_MS = 86400000;

// Plan codes must be valid Crockford chars (the alphabet excludes I, L, O, U).
// A = Annual, P = Perpetual/Lifetime, T = Trial.
var PLAN_CODES = { annual: 'A', lifetime: 'P', trial: 'T' };
var PLAN_CODE_TO_PLAN = { A: 'annual', P: 'lifetime', T: 'trial' };

// Guarded Node crypto (renderer loads this as a plain script; only generation needs it).
var nodeCrypto = null;
if (typeof require === 'function') {
  try { nodeCrypto = require('crypto'); } catch (_e) { nodeCrypto = null; }
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function charValue(ch) {
  var idx = CROCKFORD.indexOf(ch);
  if (idx === -1) {
    throw new Error('Invalid Base32 character: ' + ch);
  }
  return idx;
}

/**
 * Normalizes any user-entered key into canonical Base32:
 * uppercase, strip separators, map ambiguous chars (O->0, I/L->1).
 * @returns {string}
 */
function normalizeKey(input) {
  if (input === null || input === undefined) return '';
  var s = String(input).toUpperCase().replace(/[^0-9A-Z]/g, '');
  return s.replace(/O/g, '0').replace(/[IL]/g, '1');
}

function encodeBase32Number(n, len) {
  var out = '';
  for (var i = len - 1; i >= 0; i--) {
    out = CROCKFORD[n & 31] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

function decodeBase32Number(chars) {
  var n = 0;
  for (var i = 0; i < chars.length; i++) {
    n = n * 32 + charValue(chars[i]);
  }
  return n;
}

/** Weighted checksum so adjacent transpositions are also caught. */
function checksumChar(payload19) {
  var sum = 0;
  for (var i = 0; i < payload19.length; i++) {
    sum += (i + 1) * charValue(payload19[i]);
  }
  return CROCKFORD[sum % 32];
}

function encodeExpiry(expiry) {
  if (!expiry) return '0000';
  var ms = Date.parse(expiry);
  if (isNaN(ms)) throw new Error('Invalid expiry date: ' + expiry);
  var days = Math.floor((ms - EPOCH_MS) / DAY_MS);
  if (days < 0) days = 0;
  if (days > 1048575) throw new Error('Expiry date too far in the future: ' + expiry);
  return encodeBase32Number(days, EXPIRY_LEN);
}

function decodeExpiry(code) {
  if (code === '0000') return null;
  var days = decodeBase32Number(code);
  return new Date(EPOCH_MS + days * DAY_MS).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Groups a 20-char payload into the display format: QC-XXXXX-XXXXX-XXXXX-XXXXX
 */
function formatKey(payload20) {
  var groups = [];
  for (var i = 0; i < GROUPS; i++) {
    groups.push(payload20.slice(i * GROUP_LEN, (i + 1) * GROUP_LEN));
  }
  return KEY_PREFIX + '-' + groups.join('-');
}

/**
 * Generates a new activation key (serial).
 * @param {{ plan: 'annual'|'lifetime'|'trial', expiry?: string|null }} opts
 * @returns {string} e.g. QC-7A2K9-4MPQ8-XT5R2-9WZ3D
 */
function generateSerial(opts) {
  opts = opts || {};
  var plan = opts.plan || 'lifetime';
  var planCode = PLAN_CODES[plan];
  if (!planCode) {
    throw new Error('Invalid plan "' + plan + '". Use annual, lifetime or trial.');
  }
  if (plan === 'annual' && !opts.expiry) {
    throw new Error('expiry is required for annual licenses.');
  }
  if (!nodeCrypto) {
    throw new Error('Key generation requires Node crypto.');
  }

  var bytes = nodeCrypto.randomBytes(SERIAL_LEN);
  var serial = '';
  for (var i = 0; i < SERIAL_LEN; i++) {
    serial += CROCKFORD[bytes[i] % 32]; // 256/32 is exact -> uniform, no bias
  }

  var expiryCode = plan === 'lifetime' ? '0000' : encodeExpiry(opts.expiry);
  var payload19 = FORMAT_VERSION + planCode + expiryCode + serial;
  var payload20 = payload19 + checksumChar(payload19);
  return formatKey(payload20);
}

/**
 * Validates a key's format + checksum (NOT its server-side status).
 * @param {string} input
 * @returns {{ ok: boolean, reason?: string, version?: string, plan?: string,
 *             expiry?: string|null, serial?: string, normalized?: string }}
 */
function validateKeyFormat(input) {
  var norm = normalizeKey(input);
  if (!norm) return { ok: false, reason: 'missing' };

  // Accept both with and without the "QC" prefix.
  var payload = norm;
  if (payload.length === PAYLOAD_LEN + KEY_PREFIX.length && payload.slice(0, 2) === KEY_PREFIX) {
    payload = payload.slice(2);
  }
  if (payload.length !== PAYLOAD_LEN) {
    return { ok: false, reason: 'length' };
  }

  // Every char must be in the alphabet (normalization already mapped aliases,
  // but strip could still leave invalid letters such as I->1 handled, others rejected).
  for (var i = 0; i < payload.length; i++) {
    if (CROCKFORD.indexOf(payload[i]) === -1) {
      return { ok: false, reason: 'alphabet' };
    }
  }

  var body = payload.slice(0, PAYLOAD_LEN - 1);
  var given = payload[PAYLOAD_LEN - 1];
  if (checksumChar(body) !== given) {
    return { ok: false, reason: 'checksum' };
  }

  var version = body[0];
  if (version !== FORMAT_VERSION) {
    return { ok: false, reason: 'version' };
  }

  var planCode = body[1];
  var plan = PLAN_CODE_TO_PLAN[planCode];
  if (!plan) {
    return { ok: false, reason: 'plan' };
  }

  var expiryCode = body.slice(2, 2 + EXPIRY_LEN);
  var expiry;
  try {
    expiry = decodeExpiry(expiryCode);
  } catch (_e) {
    return { ok: false, reason: 'expiry' };
  }

  return {
    ok: true,
    version: version,
    plan: plan,
    expiry: expiry,
    serial: body.slice(2 + EXPIRY_LEN),
    normalized: payload,
  };
}

function isValidKey(input) {
  return validateKeyFormat(input).ok;
}

// ---------------------------------------------------------------------------
// Dual export
// ---------------------------------------------------------------------------

var _api = {
  CROCKFORD: CROCKFORD,
  KEY_PREFIX: KEY_PREFIX,
  FORMAT_VERSION: FORMAT_VERSION,
  PLAN_CODES: PLAN_CODES,
  normalizeKey: normalizeKey,
  generateSerial: generateSerial,
  formatKey: formatKey,
  validateKeyFormat: validateKeyFormat,
  isValidKey: isValidKey,
  encodeExpiry: encodeExpiry,
  decodeExpiry: decodeExpiry,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
}

if (typeof window !== 'undefined') {
  window.QuoteCraftLicenseKey = _api;
}
