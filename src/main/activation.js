/**
 * activation.js — Desktop Online Activation & Offline Grace Management
 *
 * Implements:
 *   1. Online serial activation against the Cloudflare Worker (/activate).
 *   2. Cached Ed25519 entitlement token verification (30-day offline grace).
 *   3. Online validation and silent token refresh (/validate).
 *   4. Seat release upon deactivation (/deactivate).
 *   5. Machine device ID generation and persistence.
 */

'use strict';

const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

let electronApp = null;
try {
  electronApp = require('electron').app;
} catch (_e) {
  electronApp = null;
}

const { validateKeyFormat, formatKey } = require('../shared/license-key');
const { verifyEntitlementToken, isEntitlementValid } = require('./entitlement');
const { getLicenseInfo, saveLicenseInfo, clearLicenseInfo } = require('./database');

const DEFAULT_WORKER_URL = 'https://quotecraft-license-worker.ocatech.workers.dev';

function getWorkerUrl() {
  return (process.env.QC_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, '');
}

/**
 * Returns a stable, persistent device ID for this machine.
 * Resolution:
 *   1. Existing device_id stored in database license_info.
 *   2. Existing device.id file in AppData / data directory.
 *   3. Newly generated crypto.randomUUID() written to device.id file.
 */
function getDeviceId() {
  const existingLicense = getLicenseInfo();
  if (existingLicense && existingLicense.device_id) {
    return existingLicense.device_id;
  }

  let dataDir = null;
  if (electronApp && typeof electronApp.getPath === 'function') {
    dataDir = path.join(electronApp.getPath('appData'), 'quotecraft');
  } else if (process.env.TEST_DB_PATH) {
    dataDir = path.dirname(process.env.TEST_DB_PATH);
  } else {
    dataDir = path.join(__dirname, '..', '..', 'data');
  }

  const deviceIdFile = path.join(dataDir, 'device.id');
  if (fs.existsSync(deviceIdFile)) {
    try {
      const id = fs.readFileSync(deviceIdFile, 'utf8').trim();
      if (id) return id;
    } catch (_e) {
      // Fallback to generating new ID
    }
  }

  const newId = crypto.randomUUID();
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(deviceIdFile, newId, 'utf8');
  } catch (_e) {
    // Non-fatal if filesystem write fails in sandbox
  }

  return newId;
}

/**
 * Activates a license key online against the Worker.
 *
 * @param {string} key
 * @param {object} [opts]
 * @param {string} [opts.appVersion]
 * @returns {Promise<{ ok: boolean, license?: object, token?: string, reason?: string, message?: string }>}
 */
async function activateOnline(key, opts = {}) {
  if (!key || typeof key !== 'string') {
    return { ok: false, reason: 'missing', message: 'Please enter a license key.' };
  }

  // 1. Client-side format & checksum check (instant typo feedback before network)
  const fmt = validateKeyFormat(key.trim());
  if (!fmt.ok) {
    const reasonMsg =
      fmt.reason === 'checksum'
        ? 'License key typo detected. Please check the characters and try again.'
        : fmt.reason === 'length'
        ? 'License key is incomplete. Must be 4 groups of 5 characters (e.g. QC-XXXXX-XXXXX-XXXXX-XXXXX).'
        : 'Invalid license key format.';
    return { ok: false, reason: fmt.reason, message: reasonMsg };
  }

  const canonicalKey = fmt.formatted || formatKey(fmt.normalized);
  const device_id = getDeviceId();
  const appVersion = opts.appVersion || (electronApp && electronApp.getVersion ? electronApp.getVersion() : '2.1.0');

  // 2. Contact Worker /activate endpoint
  let response;
  try {
    response = await fetch(`${getWorkerUrl()}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: canonicalKey,
        device_id,
        app_version: appVersion,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      reason: 'network_error',
      message: 'Could not connect to the activation server. Please check your internet connection.',
    };
  }

  let data;
  try {
    data = await response.json();
  } catch (_e) {
    return { ok: false, reason: 'server_error', message: 'Unexpected response from activation server.' };
  }

  if (!response.ok || !data.ok) {
    let message = 'Activation failed.';
    if (data.reason === 'device_limit') {
      message = 'Device limit reached (2 devices maximum). Please deactivate another device before activating this one.';
    } else if (data.reason === 'expired') {
      message = 'This license key has expired.';
    } else if (data.reason === 'revoked') {
      message = 'This license key has been revoked.';
    } else if (data.reason === 'invalid') {
      message = 'License key not found. Please verify your purchase or key.';
    } else if (data.reason === 'rate_limited') {
      message = 'Too many activation attempts. Please wait a minute and try again.';
    }
    return { ok: false, reason: data.reason || 'activation_failed', message: data.message || message };
  }

  // 3. Cryptographically verify the issued Entitlement Token with embedded public key
  const tokenVerify = verifyEntitlementToken(data.token);
  if (!tokenVerify.ok) {
    return {
      ok: false,
      reason: 'invalid_token_signature',
      message: 'Failed to verify license entitlement token signature.',
    };
  }

  const payload = tokenVerify.payload;

  // 4. Save license info & cached token to database
  saveLicenseInfo({
    license_key: canonicalKey,
    serial: canonicalKey,
    licensee_name: data.license?.name || payload.name || '',
    licensee_email: payload.email || '',
    plan: data.license?.plan || payload.plan || 'lifetime',
    expiry_date: data.license?.expiry || payload.expiry || null,
    issued_at: payload.issued_at,
    entitlement_token: data.token,
    status: 'active',
    valid_until: payload.valid_until,
    device_id,
  });

  return {
    ok: true,
    message: 'QuoteCraft Pro activated successfully!',
    license: {
      serial: canonicalKey,
      name: data.license?.name || payload.name,
      plan: data.license?.plan || payload.plan,
      expiry: data.license?.expiry || payload.expiry,
      valid_until: payload.valid_until,
    },
    token: data.token,
  };
}

/**
 * Deactivates this machine's seat online and clears local license records.
 *
 * @returns {Promise<{ ok: boolean, released: boolean, message?: string }>}
 */
async function deactivateOnline() {
  const stored = getLicenseInfo();
  const serial = stored?.serial || stored?.license_key;
  const device_id = stored?.device_id || getDeviceId();

  if (serial) {
    try {
      await fetch(`${getWorkerUrl()}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: serial, device_id }),
      });
    } catch (_err) {
      // Offline / network failure when releasing seat is non-blocking locally
    }
  }

  clearLicenseInfo();
  return { ok: true, released: true, message: 'License deactivated on this device.' };
}

/**
 * Refreshes the cached entitlement token against the Worker.
 *
 * @returns {Promise<{ ok: boolean, refreshed: boolean, valid_until?: string, reason?: string, message?: string }>}
 */
async function refreshLicenseOnline() {
  const stored = getLicenseInfo();
  if (!stored || !stored.entitlement_token) {
    return { ok: false, refreshed: false, reason: 'no_license', message: 'No license token to refresh.' };
  }

  let response;
  try {
    response = await fetch(`${getWorkerUrl()}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: stored.entitlement_token }),
    });
  } catch (err) {
    return { ok: false, refreshed: false, reason: 'network_error', message: 'Network error during validation.' };
  }

  let data;
  try {
    data = await response.json();
  } catch (_e) {
    return { ok: false, refreshed: false, reason: 'server_error', message: 'Server error during validation.' };
  }

  if (!response.ok || !data.ok || !data.token) {
    if (data.reason === 'revoked' || data.reason === 'device_unlinked') {
      saveLicenseInfo({ status: data.reason });
    }
    return { ok: false, refreshed: false, reason: data.reason || 'validation_failed', message: data.message };
  }

  const verify = verifyEntitlementToken(data.token);
  if (!verify.ok) {
    return { ok: false, refreshed: false, reason: 'invalid_signature' };
  }

  saveLicenseInfo({
    entitlement_token: data.token,
    valid_until: verify.payload.valid_until,
    status: 'active',
  });

  return {
    ok: true,
    refreshed: true,
    valid_until: verify.payload.valid_until,
    token: data.token,
  };
}

/**
 * Determines the current effective license status of the application.
 * Verifies the cached token offline using the embedded public key, and
 * enforces the 30-day offline grace period.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.autoRefresh=true] Attempt silent online refresh if grace has expired
 * @returns {Promise<{ ok: boolean, isPro: boolean, state: string, license: object|null, message?: string, needsRefresh?: boolean }>}
 */
async function getEffectiveLicenseState(opts = { autoRefresh: true }) {
  const stored = getLicenseInfo();
  if (!stored || (!stored.entitlement_token && !stored.license_key)) {
    return { ok: true, isPro: false, state: 'free', license: null };
  }

  // Modern v1 Entitlement Token Path
  if (stored.entitlement_token) {
    const verify = verifyEntitlementToken(stored.entitlement_token);
    if (!verify.ok) {
      return {
        ok: false,
        isPro: false,
        state: 'invalid_signature',
        message: 'Cached license entitlement signature could not be verified.',
        license: stored,
      };
    }

    const payload = verify.payload;
    const now = typeof opts?.now === 'number' ? opts.now : Date.now();
    const validity = isEntitlementValid(payload, now);

    if (validity.reason === 'expired') {
      return {
        ok: true,
        isPro: false,
        state: 'expired',
        message: `Your QuoteCraft Pro license expired on ${payload.expiry}.`,
        license: { ...stored, expired: true },
      };
    }

    if (stored.status === 'revoked' || stored.status === 'device_unlinked') {
      return {
        ok: true,
        isPro: false,
        state: stored.status,
        message: 'This license has been revoked or unlinked on this device.',
        license: stored,
      };
    }

    // Check offline grace period
    if (validity.needsRefresh) {
      if (opts.autoRefresh !== false) {
        // Attempt silent background/online refresh
        const refRes = await refreshLicenseOnline();
        if (refRes.ok) {
          const updated = getLicenseInfo();
          return {
            ok: true,
            isPro: true,
            state: 'active',
            license: updated,
            valid_until: refRes.valid_until,
          };
        }
      }

      // Past offline grace window with no connectivity
      return {
        ok: true,
        isPro: false,
        state: 'grace_expired',
        needsRefresh: true,
        message: 'Your offline grace period has ended. Please connect to the internet to verify your license.',
        license: stored,
      };
    }

    // Within offline grace window -> Pro active!
    return {
      ok: true,
      isPro: true,
      state: 'active',
      license: stored,
      valid_until: payload.valid_until,
    };
  }

  // Fallback for legacy keys (e.g. QC-PRO-...)
  return {
    ok: true,
    isPro: Boolean(stored.license_key),
    state: stored.license_key ? 'legacy' : 'free',
    license: stored,
  };
}

module.exports = {
  getWorkerUrl,
  getDeviceId,
  activateOnline,
  deactivateOnline,
  refreshLicenseOnline,
  getEffectiveLicenseState,
};
