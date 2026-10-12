/**
 * simulate-webhook.js — Local test for the QuoteCraft License Worker
 *
 * Sends a simulated Paystack charge.success payload to the local wrangler dev server.
 * Run `npx wrangler dev` first, then run this script with Node.js.
 *
 * Usage:
 *   node test/simulate-webhook.js [annual|lifetime]
 *
 * Requires:
 *   - Local wrangler dev server running on http://localhost:8787
 *   - PAYSTACK_SECRET_KEY set in .dev.vars or as env var
 */

'use strict';

const crypto = require('crypto');

// ─── Config ───────────────────────────────────────────────────────────────────
// For local dev testing, use a known test secret key.
const TEST_PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
if (!TEST_PAYSTACK_SECRET) {
  console.error('Error: PAYSTACK_SECRET_KEY environment variable is required to run this simulation.');
  process.exit(1);
}
const WORKER_URL = process.env.WORKER_URL || 'http://localhost:8787/webhook';

// ─── Build payload ────────────────────────────────────────────────────────────
const planArg = process.argv[2] || 'annual';
const isLifetime = planArg === 'lifetime';

// Annual = ₦20,000 (2,000,000 kobo), Lifetime = ₦40,000 (4,000,000 kobo)
const amountKobo = isLifetime ? 4_000_000 : 2_000_000;
const testRef = `TEST-${Date.now()}`;

const payload = {
  event: 'charge.success',
  data: {
    id: 999999999,
    domain: 'live',
    status: 'success',
    reference: testRef,
    amount: amountKobo,
    message: null,
    gateway_response: 'Successful',
    paid_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    channel: 'card',
    currency: 'NGN',
    ip_address: '197.210.64.97',
    metadata: '',
    log: null,
    fees: isLifetime ? 100000 : 50000,
    customer: {
      id: 88888,
      first_name: 'Test',
      last_name: 'Customer',
      email: 'test@example.com',
      customer_code: 'CUS_test123',
      phone: '+2348000000000',
      metadata: null,
      risk_action: 'default',
    },
    authorization: {
      authorization_code: 'AUTH_test',
      bin: '408408',
      last4: '4081',
      exp_month: '12',
      exp_year: '2030',
      channel: 'card',
      card_type: 'visa',
      bank: 'Test Bank',
      country_code: 'NG',
      brand: 'visa',
      reusable: true,
      signature: 'SIG_test',
    },
    plan: {},
  },
};

const rawBody = JSON.stringify(payload);

// ─── Sign the payload with HMAC-SHA512 ───────────────────────────────────────
const signature = crypto
  .createHmac('sha512', TEST_PAYSTACK_SECRET)
  .update(rawBody)
  .digest('hex');

// ─── Send to local worker ─────────────────────────────────────────────────────
async function main() {
  console.log(`\n🧪 Simulating ${isLifetime ? 'LIFETIME' : 'ANNUAL'} charge.success webhook`);
  console.log(`   Amount: ₦${(amountKobo / 100).toLocaleString()}`);
  console.log(`   Reference: ${testRef}`);
  console.log(`   Target: ${WORKER_URL}\n`);

  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': signature,
      },
      body: rawBody,
    });

    const text = await res.text();
    if (res.ok) {
      console.log(`✅ Worker responded: ${res.status} — ${text}`);
      console.log('   Check your email inbox and the wrangler dev logs for details.');
    } else {
      console.error(`❌ Worker error: ${res.status} — ${text}`);
    }

    // Send duplicate to test idempotency
    console.log('\n🔁 Sending duplicate (idempotency test)...');
    const res2 = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': signature,
      },
      body: rawBody,
    });
    const text2 = await res2.text();
    if (res2.ok) {
      console.log(`✅ Duplicate responded: ${res2.status} — ${text2}`);
      console.log('   (Should have been ignored — no duplicate email sent)');
    }

  } catch (err) {
    console.error('❌ Failed to reach worker. Is `npx wrangler dev` running?');
    console.error(err.message);
    process.exit(1);
  }
}

main();
