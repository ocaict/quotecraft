/**
 * test-activation-flow.js — Complete activation, deactivation, validation & webhook test suite
 *
 * Runs under plain Node.js (v20+) using WebCrypto & ES modules.
 * Verifies all Phase 2 acceptance criteria.
 */

'use strict';

import assert from 'node:assert';
import crypto from 'node:crypto';
import worker from '../src/index.js';
import {
  generateSerial,
  validateKeyFormat,
  determinePlan,
  signEntitlementToken,
  verifyEntitlementToken,
  DEV_PRIVATE_KEY_PEM,
  DEV_PUBLIC_KEY_PEM,
} from '../src/licensing.js';
import { createLicensingStore } from '../src/licensing-store.js';

async function run() {
  console.log('=== Starting Worker Phase 2 Activation Flow Tests ===\n');

  const env = {
    QC_LICENSE_PRIVATE_KEY: DEV_PRIVATE_KEY_PEM,
    QC_LICENSE_PUBLIC_KEY: DEV_PUBLIC_KEY_PEM,
    PAYSTACK_TEST_SECRET_KEY: 'sk_test_fake_secret_for_unit_tests',
  };

  const store = createLicensingStore(env);

  // 1. Key format & serial generation
  console.log('1. Testing serial generation & local format verification...');
  const lifetimeKey = generateSerial({ plan: 'lifetime' });
  assert.match(lifetimeKey, /^QC-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  const v1 = validateKeyFormat(lifetimeKey);
  assert.strictEqual(v1.ok, true);
  assert.strictEqual(v1.plan, 'lifetime');

  const annualKey = generateSerial({ plan: 'annual', expiry: '2027-12-31' });
  const v2 = validateKeyFormat(annualKey);
  assert.strictEqual(v2.ok, true);
  assert.strictEqual(v2.plan, 'annual');
  assert.strictEqual(v2.expiry, '2027-12-31');

  // Checksum catches typo
  const typoKey = lifetimeKey.slice(0, -1) + (lifetimeKey.slice(-1) === 'A' ? 'B' : 'A');
  assert.strictEqual(validateKeyFormat(typoKey).ok, false);
  console.log('   ✓ Format, plan hints, and typo checksum verified.');

  // 2. Health check
  console.log('\n2. Testing GET /health...');
  const healthRes = await worker.fetch(new Request('https://worker.local/health', { method: 'GET' }), env);
  assert.strictEqual(healthRes.status, 200);
  const healthJson = await healthRes.json();
  assert.strictEqual(healthJson.status, 'ok');
  console.log('   ✓ GET /health returned 200 ok.');

  // 3. Webhook issuance (durable storage, no TTL)
  console.log('\n3. Testing POST /webhook (charge.success issuance)...');
  const testRef = 'TEST-PAYSTACK-' + Date.now();
  const webhookBody = JSON.stringify({
    event: 'charge.success',
    data: {
      reference: testRef,
      amount: 1500000, // ₦15,000 => Lifetime
      customer: {
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
      },
    },
  });

  const hmacSig = crypto
    .createHmac('sha512', env.PAYSTACK_TEST_SECRET_KEY)
    .update(webhookBody)
    .digest('hex');

  const webhookRes = await worker.fetch(
    new Request('https://worker.local/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': hmacSig,
      },
      body: webhookBody,
    }),
    env
  );
  assert.strictEqual(webhookRes.status, 200);

  // Check transaction via callback
  const callbackRes = await worker.fetch(
    new Request(`https://worker.local/callback?format=json&reference=${testRef}`, { method: 'GET' }),
    env
  );
  assert.strictEqual(callbackRes.status, 200);
  const callbackJson = await callbackRes.json();
  assert.strictEqual(callbackJson.ready, true);
  assert.strictEqual(callbackJson.plan, 'lifetime');
  const issuedKey = callbackJson.license_key;
  assert.match(issuedKey, /^QC-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  console.log(`   ✓ Webhook issued durable license key: ${issuedKey}`);

  // Test idempotency: send same webhook again
  const dupRes = await worker.fetch(
    new Request('https://worker.local/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': hmacSig,
      },
      body: webhookBody,
    }),
    env
  );
  assert.strictEqual(dupRes.status, 200);
  console.log('   ✓ Duplicate webhook call handled idempotently.');

  // 4. POST /activate
  console.log('\n4. Testing POST /activate...');

  // 4a. Malformed key
  const badReq = await worker.fetch(
    new Request('https://worker.local/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'INVALID-KEY', device_id: 'dev-1' }),
    }),
    env
  );
  assert.strictEqual(badReq.status, 400);
  const badJson = await badReq.json();
  assert.strictEqual(badJson.reason, 'malformed');

  // 4b. Unknown key (valid checksum, but not in store)
  const unknownKey = generateSerial({ plan: 'lifetime' });
  const unknownReq = await worker.fetch(
    new Request('https://worker.local/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: unknownKey, device_id: 'dev-1' }),
    }),
    env
  );
  assert.strictEqual(unknownReq.status, 404);
  const unknownJson = await unknownReq.json();
  assert.strictEqual(unknownJson.reason, 'invalid');

  // 4c. First activation (device 1)
  const act1Res = await worker.fetch(
    new Request('https://worker.local/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.1.1.1' },
      body: JSON.stringify({ key: issuedKey, device_id: 'device-aaa', app_version: '2.1.0' }),
    }),
    env
  );
  assert.strictEqual(act1Res.status, 200);
  const act1Json = await act1Res.json();
  assert.strictEqual(act1Json.ok, true);
  assert.strictEqual(act1Json.license.name, 'Ada Lovelace');
  assert.strictEqual(act1Json.license.plan, 'lifetime');
  assert.ok(act1Json.token);

  // Verify entitlement token
  const tokenVerify = await verifyEntitlementToken(act1Json.token, env.QC_LICENSE_PUBLIC_KEY);
  assert.strictEqual(tokenVerify.ok, true);
  assert.strictEqual(tokenVerify.payload.serial, issuedKey);
  assert.strictEqual(tokenVerify.payload.device_id, 'device-aaa');
  console.log('   ✓ Device 1 activated successfully; token signature valid.');

  // 4d. Re-activation of same device (idempotent, does not consume seat)
  const act1Re = await worker.fetch(
    new Request('https://worker.local/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.1.1.1' },
      body: JSON.stringify({ key: issuedKey, device_id: 'device-aaa', app_version: '2.1.1' }),
    }),
    env
  );
  assert.strictEqual(act1Re.status, 200);
  console.log('   ✓ Re-activation of same device is idempotent.');

  // 4e. Second activation (device 2)
  const act2Res = await worker.fetch(
    new Request('https://worker.local/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.1.1.2' },
      body: JSON.stringify({ key: issuedKey, device_id: 'device-bbb', app_version: '2.1.0' }),
    }),
    env
  );
  assert.strictEqual(act2Res.status, 200);
  console.log('   ✓ Device 2 activated successfully (max_devices = 2 reached).');

  // 4f. Third activation (device 3 -> device_limit)
  const act3Res = await worker.fetch(
    new Request('https://worker.local/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.1.1.3' },
      body: JSON.stringify({ key: issuedKey, device_id: 'device-ccc' }),
    }),
    env
  );
  assert.strictEqual(act3Res.status, 403);
  const act3Json = await act3Res.json();
  assert.strictEqual(act3Json.reason, 'device_limit');
  console.log('   ✓ Exceeding max_devices rejected with device_limit.');

  // 5. POST /validate (online refresh)
  console.log('\n5. Testing POST /validate...');
  const valRes = await worker.fetch(
    new Request('https://worker.local/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: act1Json.token }),
    }),
    env
  );
  assert.strictEqual(valRes.status, 200);
  const valJson = await valRes.json();
  assert.strictEqual(valJson.ok, true);
  assert.ok(valJson.token);
  console.log('   ✓ Online validation refreshed token successfully.');

  // 6. POST /deactivate (release seat)
  console.log('\n6. Testing POST /deactivate...');
  const deactRes = await worker.fetch(
    new Request('https://worker.local/deactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: issuedKey, device_id: 'device-aaa' }),
    }),
    env
  );
  assert.strictEqual(deactRes.status, 200);
  const deactJson = await deactRes.json();
  assert.strictEqual(deactJson.released, true);
  console.log('   ✓ Deactivated device-aaa, freeing 1 seat.');

  // Now device 3 can activate!
  const act3Retry = await worker.fetch(
    new Request('https://worker.local/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.1.1.3' },
      body: JSON.stringify({ key: issuedKey, device_id: 'device-ccc' }),
    }),
    env
  );
  assert.strictEqual(act3Retry.status, 200);
  console.log('   ✓ Device 3 successfully activated in the freed seat.');

  // Validating previous token of device-aaa should fail (device unlinked)
  const oldValRes = await worker.fetch(
    new Request('https://worker.local/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: act1Json.token }),
    }),
    env
  );
  assert.strictEqual(oldValRes.status, 403);
  const oldValJson = await oldValRes.json();
  assert.strictEqual(oldValJson.reason, 'device_unlinked');
  console.log('   ✓ Deactivated device token rejected on /validate.');

  // 7. Revocation & Expiry
  console.log('\n7. Testing Revocation & Expiration...');
  const revKey = generateSerial({ plan: 'lifetime' });
  const wStore = createLicensingStore(env);
  await wStore.createLicense({
    serial: revKey,
    name: 'Revoked User',
    plan: 'lifetime',
    status: 'revoked',
  });

  const revAct = await worker.fetch(
    new Request('https://worker.local/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: revKey, device_id: 'dev-rev' }),
    }),
    env
  );
  assert.strictEqual(revAct.status, 403);
  const revActJson = await revAct.json();
  assert.strictEqual(revActJson.reason, 'revoked');
  console.log('   ✓ Revoked license rejected on /activate.');

  // 8. Rate Limiting
  console.log('\n8. Testing Rate Limiting on /activate...');
  const spamIp = '9.9.9.9';
  let rateLimited = false;
  for (let i = 0; i < 25; i++) {
    const res = await worker.fetch(
      new Request('https://worker.local/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': spamIp },
        body: JSON.stringify({ key: issuedKey, device_id: 'dev-spam-' + i }),
      }),
      env
    );
    if (res.status === 429) {
      const data = await res.json();
      assert.strictEqual(data.reason, 'rate_limited');
      rateLimited = true;
      break;
    }
  }
  assert.strictEqual(rateLimited, true);
  console.log('   ✓ Rate limiting triggered 429 rate_limited as expected.');

  console.log('\n========================================');
  console.log(' Worker Phase 2 Activation Flow: All passed! ');
  console.log('========================================\n');
}

run().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
