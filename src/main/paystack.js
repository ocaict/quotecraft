/**
 * paystack.js — QuoteCraft Paystack Payment Gateway Service
 *
 * Handles all server-side Paystack API communication:
 *   • Initialising a transaction (generating a checkout URL)
 *   • Verifying a transaction by reference
 *   • Validating Paystack credentials (balance check)
 *
 * Uses Node's built-in `https` module so no extra dependency is needed.
 */

'use strict';

const https = require('https');

// ---------------------------------------------------------------------------
// Low-level HTTP helper
// ---------------------------------------------------------------------------

/**
 * Makes an authenticated HTTPS request to the Paystack REST API.
 *
 * @param {object} opts
 * @param {string} opts.method   - HTTP method (GET | POST)
 * @param {string} opts.path     - API path, e.g. '/transaction/initialize'
 * @param {string} opts.secretKey - Paystack secret key (sk_live_… / sk_test_…)
 * @param {object|null} [opts.body] - JSON request body (for POST)
 * @returns {Promise<{statusCode: number, data: object}>}
 */
function paystackRequest({ method, path, secretKey, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(raw) });
        } catch (_) {
          resolve({ statusCode: res.statusCode, data: { message: raw } });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates a Paystack secret key by calling the /balance endpoint.
 *
 * @param {string} secretKey
 * @returns {Promise<{ok: boolean, message: string, data?: object}>}
 */
async function validatePaystackKey(secretKey) {
  if (!secretKey || !String(secretKey).trim()) {
    return { ok: false, message: 'Secret key is required.' };
  }
  const key = String(secretKey).trim();
  if (!key.startsWith('sk_live_') && !key.startsWith('sk_test_')) {
    return { ok: false, message: 'Invalid Paystack secret key format. Must start with sk_live_ or sk_test_.' };
  }

  try {
    const { statusCode, data } = await paystackRequest({
      method: 'GET',
      path: '/balance',
      secretKey: key,
    });

    if (statusCode === 200 && data.status === true) {
      return { ok: true, message: 'Paystack credentials verified successfully!', data };
    }
    return {
      ok: false,
      message: data.message || `Paystack returned status ${statusCode}. Check your secret key.`,
    };
  } catch (err) {
    return { ok: false, message: `Network error: ${err.message}` };
  }
}

/**
 * Initialises a Paystack transaction and returns a checkout URL.
 *
 * @param {object} opts
 * @param {string} opts.secretKey      - Paystack secret key
 * @param {string} opts.email          - Customer email
 * @param {number} opts.amountKobo     - Amount in smallest currency unit (kobo for NGN, cents for USD)
 * @param {string} opts.reference      - Unique reference (e.g. "QC-INV-0001-1715000000")
 * @param {string} [opts.currency]     - ISO currency code (default: NGN)
 * @param {string} [opts.callbackUrl]  - URL Paystack redirects to after payment
 * @param {object} [opts.metadata]     - Additional metadata passed to Paystack
 * @returns {Promise<{ok: boolean, url?: string, reference?: string, message?: string}>}
 */
async function initializeTransaction(opts) {
  const { secretKey, email, amountKobo, reference, currency = 'NGN', callbackUrl, metadata } = opts;

  if (!secretKey) return { ok: false, message: 'Paystack secret key not configured.' };
  if (!email)     return { ok: false, message: 'Customer email is required to generate a payment link.' };

  const body = {
    email,
    amount: Math.round(amountKobo),
    reference,
    currency,
    ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    ...(metadata ? { metadata } : {}),
  };

  try {
    const { statusCode, data } = await paystackRequest({
      method: 'POST',
      path: '/transaction/initialize',
      secretKey,
      body,
    });

    if (statusCode === 200 && data.status === true && data.data) {
      return {
        ok: true,
        url: data.data.authorization_url,
        reference: data.data.reference,
        accessCode: data.data.access_code,
      };
    }
    return { ok: false, message: data.message || `Failed to initialise Paystack transaction (HTTP ${statusCode}).` };
  } catch (err) {
    return { ok: false, message: `Network error: ${err.message}` };
  }
}

/**
 * Verifies a Paystack transaction by its reference.
 *
 * @param {string} secretKey   - Paystack secret key
 * @param {string} reference   - Transaction reference to verify
 * @returns {Promise<{ok: boolean, status?: string, amount?: number, paidAt?: string, message?: string, data?: object}>}
 */
async function verifyTransaction(secretKey, reference) {
  if (!secretKey) return { ok: false, message: 'Paystack secret key not configured.' };
  if (!reference) return { ok: false, message: 'Transaction reference is required.' };

  try {
    const { statusCode, data } = await paystackRequest({
      method: 'GET',
      path: `/transaction/verify/${encodeURIComponent(reference)}`,
      secretKey,
    });

    if (statusCode === 200 && data.status === true && data.data) {
      const tx = data.data;
      return {
        ok: true,
        status: tx.status,           // 'success' | 'failed' | 'pending' etc.
        amountKobo: tx.amount,       // in kobo (smallest unit)
        currency: tx.currency,
        paidAt: tx.paid_at,
        customerEmail: tx.customer && tx.customer.email,
        data: tx,
      };
    }
    return {
      ok: false,
      message: data.message || `Paystack verification failed (HTTP ${statusCode}).`,
    };
  } catch (err) {
    return { ok: false, message: `Network error: ${err.message}` };
  }
}

/**
 * Builds a deterministic Paystack transaction reference for a QuoteCraft invoice.
 * Format: QC-{invoiceNumber}-{timestamp}
 *
 * @param {string} invoiceNumber  - e.g. "INV-2024-0001"
 * @returns {string}
 */
function buildReference(invoiceNumber) {
  const sanitised = String(invoiceNumber).replace(/[^A-Za-z0-9-]/g, '');
  return `QC-${sanitised}-${Date.now()}`;
}

module.exports = {
  validatePaystackKey,
  initializeTransaction,
  verifyTransaction,
  buildReference,
};
