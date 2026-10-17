/**
 * licensing-store.js — Durable License Store Interface & KV Implementation
 *
 * Implements the durable store interface for the QuoteCraft License Worker.
 * Handles serial records, multi-device seat binding/unbinding, transaction logs,
 * and rate limiting.
 *
 * Designed to be backed by Cloudflare KV now and easily swapped with Cloudflare D1
 * or PostgreSQL in Phase 5.
 */

'use strict';

/**
 * Normalizes user/client input keys to match stored serials:
 * uppercase, strip non-alphanumerics, map O->0, I/L->1.
 */
export function normalizeSerial(key) {
  if (!key) return '';
  return String(key)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

/**
 * In-memory fallback store used in tests or when KV is not bound.
 */
class MemoryBackend {
  constructor() {
    this._map = new Map();
  }

  async get(key) {
    return this._map.has(key) ? this._map.get(key) : null;
  }

  async put(key, value) {
    this._map.set(key, value);
  }

  async delete(key) {
    this._map.delete(key);
  }
}

/**
 * KV Backend wrapping Cloudflare Workers KV namespace.
 */
class KvBackend {
  constructor(kv) {
    this._kv = kv;
  }

  async get(key) {
    return await this._kv.get(key);
  }

  async put(key, value, options) {
    return await this._kv.put(key, value, options);
  }

  async delete(key) {
    return await this._kv.delete(key);
  }
}

export class LicensingStore {
  /**
   * @param {object} [env]
   * @param {object} [env.LICENSES_KV]
   */
  constructor(env = {}) {
    this.env = env;
    if (env && env.LICENSES_KV) {
      this.backend = new KvBackend(env.LICENSES_KV);
    } else {
      if (!env._memoryStore) {
        env._memoryStore = new MemoryBackend();
      }
      this.backend = env._memoryStore;
    }
  }

  /**
   * Key prefix helpers
   */
  _serialKey(serial) {
    return `serial:${normalizeSerial(serial)}`;
  }

  _txKey(reference) {
    return `tx:${String(reference).trim()}`;
  }

  _rateKey(prefix, id) {
    return `rl:${prefix}:${id}`;
  }

  /**
   * Retrieves a license by its serial.
   * @param {string} serial
   * @returns {Promise<object|null>}
   */
  async getLicense(serial) {
    const raw = await this.backend.get(this._serialKey(serial));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_e) {
      return null;
    }
  }

  /**
   * Creates a new durable license record.
   * Note: No expiration TTL is set so records persist permanently.
   *
   * @param {object} record
   * @returns {Promise<object>}
   */
  async createLicense(record) {
    if (!record || !record.serial) {
      throw new Error('License record must have a valid serial.');
    }

    const now = new Date().toISOString();
    const license = {
      serial: record.serial,
      name: record.name || '',
      email: record.email || '',
      plan: record.plan || 'lifetime',
      expiry: record.expiry || null,
      status: record.status || 'active',
      devices: Array.isArray(record.devices) ? record.devices : [],
      max_devices: typeof record.max_devices === 'number' ? record.max_devices : 2,
      activation_count: typeof record.activation_count === 'number' ? record.activation_count : 0,
      issued_at: record.issued_at || now,
      updated_at: now,
      paystack_reference: record.paystack_reference || null,
      amount_kobo: record.amount_kobo || null,
    };

    // Store primary record by serial (permanent, no TTL)
    await this.backend.put(this._serialKey(license.serial), JSON.stringify(license));

    // Also store by paystack reference if provided
    if (license.paystack_reference) {
      await this.saveTransaction(license.paystack_reference, {
        reference: license.paystack_reference,
        serial: license.serial,
        license_key: license.serial,
        name: license.name,
        email: license.email,
        plan: license.plan,
        expiry_date: license.expiry,
        amount_kobo: license.amount_kobo,
        issued_at: license.issued_at,
      });
    }

    return license;
  }

  /**
   * Updates an existing license record.
   * @param {object} record
   * @returns {Promise<object>}
   */
  async saveLicense(record) {
    if (!record || !record.serial) {
      throw new Error('License record must have a valid serial.');
    }
    record.updated_at = new Date().toISOString();
    await this.backend.put(this._serialKey(record.serial), JSON.stringify(record));
    return record;
  }

  /**
   * Binds a device to a license key.
   * Idempotent: re-activating an existing device_id updates its timestamp and app_version
   * without consuming an additional seat.
   *
   * @param {string} serial
   * @param {{ device_id: string, app_version?: string }} opts
   * @returns {Promise<{ ok: boolean, license?: object, reason?: string, reconnected?: boolean }>}
   */
  async bindDevice(serial, { device_id, app_version }) {
    if (!device_id) {
      return { ok: false, reason: 'missing_device_id' };
    }

    const license = await this.getLicense(serial);
    if (!license) {
      return { ok: false, reason: 'invalid' };
    }

    if (license.status !== 'active') {
      return { ok: false, reason: license.status || 'inactive' };
    }

    if (license.expiry) {
      const expiryMs = Date.parse(license.expiry);
      // Give a 1-day grace buffer for timezone differences
      if (!isNaN(expiryMs) && Date.now() > expiryMs + 86400000) {
        return { ok: false, reason: 'expired' };
      }
    }

    license.devices = Array.isArray(license.devices) ? license.devices : [];
    const maxDevices = license.max_devices || 2;
    const existingIndex = license.devices.findIndex((d) => d.device_id === device_id);

    const nowIso = new Date().toISOString();

    if (existingIndex !== -1) {
      // Idempotent: update existing device entry
      license.devices[existingIndex].activated_at = nowIso;
      if (app_version) {
        license.devices[existingIndex].app_version = app_version;
      }
      await this.saveLicense(license);
      return { ok: true, license, reconnected: true };
    }

    // New device seat
    if (license.devices.length >= maxDevices) {
      return { ok: false, reason: 'device_limit' };
    }

    license.devices.push({
      device_id,
      activated_at: nowIso,
      app_version: app_version || '',
    });
    license.activation_count = (license.activation_count || 0) + 1;

    await this.saveLicense(license);
    return { ok: true, license, reconnected: false };
  }

  /**
   * Unbinds / deactivates a device seat from a license key.
   *
   * @param {string} serial
   * @param {string} device_id
   * @returns {Promise<{ ok: boolean, released: boolean, reason?: string }>}
   */
  async unbindDevice(serial, device_id) {
    if (!device_id) {
      return { ok: false, released: false, reason: 'missing_device_id' };
    }

    const license = await this.getLicense(serial);
    if (!license) {
      return { ok: false, released: false, reason: 'invalid' };
    }

    license.devices = Array.isArray(license.devices) ? license.devices : [];
    const initialLen = license.devices.length;
    license.devices = license.devices.filter((d) => d.device_id !== device_id);

    if (license.devices.length !== initialLen) {
      await this.saveLicense(license);
      return { ok: true, released: true };
    }

    // Device was not bound, still return success / released: true (idempotent)
    return { ok: true, released: true };
  }

  /**
   * Retrieves transaction record by Paystack reference.
   * @param {string} reference
   * @returns {Promise<object|null>}
   */
  async getTransaction(reference) {
    if (!reference) return null;
    const raw = await this.backend.get(this._txKey(reference));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_e) {
      return null;
    }
  }

  /**
   * Saves transaction record by Paystack reference (durable, no expiration).
   * @param {string} reference
   * @param {object} data
   * @returns {Promise<void>}
   */
  async saveTransaction(reference, data) {
    if (!reference || !data) return;
    await this.backend.put(this._txKey(reference), JSON.stringify(data));
  }

  /**
   * Simple fixed-window rate limiter.
   *
   * @param {'ip'|'key'} type
   * @param {string} identifier
   * @param {number} limit Maximum requests per window
   * @param {number} windowSeconds Duration of window in seconds (default 60)
   * @returns {Promise<{ allowed: boolean, count: number }>}
   */
  async checkRateLimit(type, identifier, limit = 10, windowSeconds = 60) {
    if (!identifier) return { allowed: true, count: 0 };
    const key = this._rateKey(type, identifier);
    let count = 0;
    try {
      const raw = await this.backend.get(key);
      count = raw ? parseInt(raw, 10) || 0 : 0;
    } catch (_e) {
      count = 0;
    }

    count += 1;
    try {
      await this.backend.put(key, String(count), { expirationTtl: windowSeconds });
    } catch (_e) {
      // In case backend doesn't support expirationTtl in test mocks, silently ignore
    }

    return {
      allowed: count <= limit,
      count,
    };
  }
}

export function createLicensingStore(env) {
  return new LicensingStore(env);
}
