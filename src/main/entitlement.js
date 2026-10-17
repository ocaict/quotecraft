/**
 * entitlement.js — Ed25519-signed entitlement tokens.
 *
 * A token is issued by the Worker after successful activation and cached by the app.
 * It is two base64url segments joined by a dot: <payload>.<signature>.
 *
 *   payload: { serial, name, plan, expiry, device_id, issued_at, valid_until }
 *
 * The app ships only the public key, so it can verify but never forge entitlements.
 */

'use strict';

const crypto = require('crypto');
const { LICENSE_PUBLIC_KEY_PEM } = require('./license-public-key');

const DAY_MS = 86400000;
const DEFAULT_GRACE_DAYS = 30;

function base64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function base64urlDecode(str) {
  return Buffer.from(str, 'base64url');
}

/** Builds a signed entitlement token. Used by the vendor CLI / Worker (never the app). */
function signEntitlement(payload, privateKeyPem) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('payload object is required.');
  }
  if (!privateKeyPem) {
    throw new Error('private key is required.');
  }
  const payloadJson = JSON.stringify(payload);
  const sig = crypto.sign(null, Buffer.from(payloadJson, 'utf8'), crypto.createPrivateKey(privateKeyPem));
  return base64urlEncode(Buffer.from(payloadJson, 'utf8')) + '.' + base64urlEncode(sig);
}

/**
 * Verifies a token's signature and parses its payload.
 * @returns {{ ok: boolean, payload?: object, reason?: string }}
 */
function verifyEntitlementToken(token, publicKeyPem) {
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
    payloadJson = base64urlDecode(parts[0]).toString('utf8');
    payload = JSON.parse(payloadJson);
  } catch (_e) {
    return { ok: false, reason: 'payload' };
  }

  try {
    const publicKey = crypto.createPublicKey(publicKeyPem || LICENSE_PUBLIC_KEY_PEM);
    const sig = base64urlDecode(parts[1]);
    const valid = crypto.verify(null, Buffer.from(payloadJson, 'utf8'), publicKey, sig);
    if (!valid) return { ok: false, reason: 'signature' };
  } catch (_e) {
    return { ok: false, reason: 'signature' };
  }

  return { ok: true, payload };
}

/** Convenience: verify the signature AND return the parsed payload (throws-safe). */
function readEntitlement(token, publicKeyPem) {
  const res = verifyEntitlementToken(token, publicKeyPem);
  return res.ok ? res.payload : null;
}

/**
 * Checks an entitlement payload against the clock.
 * - `expiry`      -> the plan itself expired  => hard invalid.
 * - `valid_until` -> offline grace deadline   => needs online refresh.
 *
 * @returns {{ ok: boolean, reason?: string, needsRefresh?: boolean }}
 */
function isEntitlementValid(payload, now) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'missing' };
  }
  const nowMs = typeof now === 'number' ? now : Date.now();

  if (payload.expiry) {
    const expiryMs = Date.parse(payload.expiry);
    if (!isNaN(expiryMs) && nowMs > expiryMs + DAY_MS) {
      return { ok: false, reason: 'expired' };
    }
  }

  if (payload.valid_until) {
    const untilMs = Date.parse(payload.valid_until);
    if (!isNaN(untilMs) && nowMs > untilMs) {
      return { ok: false, reason: 'stale', needsRefresh: true };
    }
  }

  return { ok: true };
}

/** Issues a fresh entitlement payload (server/CLI side). */
function buildEntitlement({ serial, name, plan, expiry, device_id, graceDays }) {
  const issuedAt = new Date();
  const grace = typeof graceDays === 'number' ? graceDays : DEFAULT_GRACE_DAYS;
  return {
    serial,
    name: name || '',
    plan,
    expiry: expiry || null,
    device_id: device_id || null,
    issued_at: issuedAt.toISOString(),
    valid_until: new Date(issuedAt.getTime() + grace * DAY_MS).toISOString(),
  };
}

module.exports = {
  signEntitlement,
  verifyEntitlementToken,
  readEntitlement,
  isEntitlementValid,
  buildEntitlement,
  DEFAULT_GRACE_DAYS,
};
