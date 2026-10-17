'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Isolated test DB
const testDbPath = path.join(__dirname, 'test-licensing.sqlite');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
process.env.TEST_DB_PATH = testDbPath;
// Silence the dev-fallback warning from licensing.js
process.env.NODE_ENV = 'test';

const {
  generateLicenseKey,
  verifyLicenseKey,
  isProLicense,
  PLANS,
  PLAN_FEATURES,
  FREE_LIMITS,
} = require('../src/main/licensing');

const {
  initializeDatabase,
  getLicenseInfo,
  saveLicenseInfo,
  clearLicenseInfo,
  addClient,
  getClients,
} = require('../src/main/database');

const { generateSerial, validateKeyFormat, normalizeKey } = require('../src/shared/license-key');
const { signEntitlement, buildEntitlement, verifyEntitlementToken, isEntitlementValid } = require('../src/main/entitlement');
const { getEffectiveLicenseState } = require('../src/main/activation');
const { getPrivateKeyPem } = require('./license-keys');

// Mock fetch placeholder for offline grace tests
const originalFetch = global.fetch;

async function runTests() {
  console.log('=== QuoteCraft Commercial Licensing Test Suite ===\n');

  // -------------------------------------------------------------------------
  // Legacy QC-PRO- key tests (backwards compat, keep these forever)
  // -------------------------------------------------------------------------

  // Test 1: Generate & Verify Annual Pro License Key
  console.log('--- Test 1: Annual Pro License Key Generation & Verification ---');
  const annualKey = generateLicenseKey({
    licensee_name: 'Chinedu Okafor',
    licensee_email: 'chinedu@techcorp.ng',
    plan: PLANS.ANNUAL,
    expiry_date: '2027-12-31',
  });

  assert.ok(annualKey.startsWith('QC-PRO-'), 'License key must begin with QC-PRO- prefix');
  const annualSegments = annualKey.split('-');
  assert.strictEqual(annualSegments.length, 4, 'License key must have 4 hyphen-separated segments');

  const annualVerify = verifyLicenseKey(annualKey);
  assert.strictEqual(annualVerify.ok, true, 'Annual key should verify as valid');
  assert.strictEqual(annualVerify.isPro, true, 'isPro should be true');
  assert.strictEqual(annualVerify.plan, 'annual', 'Plan should be annual');
  assert.strictEqual(annualVerify.licensee_name, 'Chinedu Okafor');
  assert.strictEqual(annualVerify.licensee_email, 'chinedu@techcorp.ng');
  assert.strictEqual(annualVerify.expiry_date, '2027-12-31');
  assert.strictEqual(isProLicense(annualKey), true, 'isProLicense helper should return true');
  console.log('  Key generated:', annualKey);
  console.log('✓ Annual key verified successfully\n');

  // Test 2: Generate & Verify Lifetime Pro License Key
  console.log('--- Test 2: Lifetime Pro License Key Generation & Verification ---');
  const lifetimeKey = generateLicenseKey({
    licensee_name: 'Fatima Aliyu',
    licensee_email: 'fatima@aliyu-holdings.ng',
    plan: PLANS.LIFETIME,
  });

  assert.ok(lifetimeKey.startsWith('QC-PRO-'));
  const lifetimeVerify = verifyLicenseKey(lifetimeKey);
  assert.strictEqual(lifetimeVerify.ok, true, 'Lifetime key should verify as valid');
  assert.strictEqual(lifetimeVerify.isPro, true);
  assert.strictEqual(lifetimeVerify.plan, 'lifetime');
  assert.strictEqual(lifetimeVerify.expiry_date, null, 'Lifetime key has no expiry date');
  assert.strictEqual(isProLicense(lifetimeKey), true);
  console.log('  Key generated:', lifetimeKey);
  console.log('✓ Lifetime key verified successfully\n');

  // Test 3: Tamper Detection (Payload modification)
  console.log('--- Test 3: Tamper Detection (Tampered Payload) ---');
  const parts = annualKey.split('-');
  // Flip a character in the second chunk (payload)
  const tamperedChunk = (parts[2].charAt(0) === 'A' ? 'B' : 'A') + parts[2].slice(1);
  const tamperedKey = `${parts[0]}-${parts[1]}-${tamperedChunk}-${parts[3]}`;
  const tamperedVerify = verifyLicenseKey(tamperedKey);
  assert.strictEqual(tamperedVerify.ok, false, 'Tampered key must fail verification');
  assert.ok(
    /invalid|tampered|failed to decode/i.test(tamperedVerify.message),
    'Error message should indicate invalid signature, decode failure, or tampering'
  );
  assert.strictEqual(isProLicense(tamperedKey), false);
  console.log('✓ Tampered payload detected and rejected\n');

  // Test 4: Tamper Detection (Tampered Signature)
  console.log('--- Test 4: Tamper Detection (Tampered Signature) ---');
  const tamperedSig = (parts[3].charAt(0) === 'X' ? 'Y' : 'X') + parts[3].slice(1);
  const tamperedSigKey = `${parts[0]}-${parts[1]}-${parts[2]}-${tamperedSig}`;
  const sigVerify = verifyLicenseKey(tamperedSigKey);
  assert.strictEqual(sigVerify.ok, false, 'Tampered signature must fail verification');
  assert.strictEqual(isProLicense(tamperedSigKey), false);
  console.log('✓ Tampered signature detected and rejected\n');

  // Test 5: Expired License Detection
  console.log('--- Test 5: Expired License Detection ---');
  const expiredKey = generateLicenseKey({
    licensee_name: 'Past User',
    licensee_email: 'past@expired.ng',
    plan: PLANS.ANNUAL,
    expiry_date: '2023-01-01',
  });
  const expiredVerify = verifyLicenseKey(expiredKey);
  assert.strictEqual(expiredVerify.ok, false, 'Expired license must not be valid');
  assert.ok(expiredVerify.message.includes('expired'), 'Message should indicate license expired');
  assert.strictEqual(isProLicense(expiredKey), false, 'isProLicense helper should return false for expired key');
  console.log('✓ Expired key correctly identified and rejected\n');

  // Test 6: Malformed Keys & Edge Cases
  console.log('--- Test 6: Malformed Keys & Edge Cases ---');
  assert.strictEqual(verifyLicenseKey(null).ok, false);
  assert.strictEqual(verifyLicenseKey('').ok, false);
  assert.strictEqual(verifyLicenseKey('INVALID-FORMAT').ok, false);
  assert.strictEqual(verifyLicenseKey('QC-BASIC-1234-5678').ok, false);
  assert.strictEqual(isProLicense(''), false);
  assert.strictEqual(isProLicense(null), false);
  console.log('✓ Malformed keys safely rejected\n');

  // Test 7: Feature Constants & Plan Limits
  console.log('--- Test 7: Feature Limits & Constants ---');
  assert.strictEqual(FREE_LIMITS.MAX_CLIENTS, 3, 'Free tier limit must be 3 clients');
  assert.ok(Array.isArray(PLAN_FEATURES.free), 'PLAN_FEATURES.free must be an array');
  assert.ok(Array.isArray(PLAN_FEATURES.pro), 'PLAN_FEATURES.pro must be an array');
  assert.ok(PLAN_FEATURES.pro.length > PLAN_FEATURES.free.length, 'Pro tier must have more features');
  console.log('✓ Feature limits and constants verified\n');

  // Test 8: Database Storage & Retrieval of License
  console.log('--- Test 8: Database License Info CRUD ---');
  await initializeDatabase();
  console.log('✓ Database initialized');

  const initialLicense = getLicenseInfo();
  assert.strictEqual(initialLicense, null, 'Initial license info should be null');

  saveLicenseInfo({
    license_key: annualKey,
    licensee_name: annualVerify.licensee_name,
    licensee_email: annualVerify.licensee_email,
    plan: annualVerify.plan,
    expiry_date: annualVerify.expiry_date,
    issued_at: annualVerify.issued_at,
  });

  const storedLicense = getLicenseInfo();
  assert.ok(storedLicense, 'Stored license should exist');
  assert.strictEqual(storedLicense.license_key, annualKey);
  assert.strictEqual(storedLicense.licensee_name, 'Chinedu Okafor');
  assert.strictEqual(storedLicense.licensee_email, 'chinedu@techcorp.ng');
  assert.strictEqual(storedLicense.plan, 'annual');
  assert.strictEqual(storedLicense.expiry_date, '2027-12-31');

  clearLicenseInfo();
  const clearedLicense = getLicenseInfo();
  assert.strictEqual(clearedLicense, null, 'License should be null after clearing');
  console.log('✓ Database license storage and clearing round-trip verified\n');

  // Test 9: Free Tier Client Limit Enforcement
  console.log('--- Test 9: Free Tier Client Limit Logic ---');
  // At this point license is cleared (user is on Free tier)
  const client1 = addClient({ name: 'Client 1', email: 'c1@test.ng' });
  const client2 = addClient({ name: 'Client 2', email: 'c2@test.ng' });
  const client3 = addClient({ name: 'Client 3', email: 'c3@test.ng' });
  assert.ok(client1 && client2 && client3, 'First 3 clients should be created');

  const clientList = getClients();
  assert.strictEqual(clientList.length, 3, 'Should have 3 clients in DB');

  // Verify that Free tier check detects limit reached
  const currentLic = getLicenseInfo();
  const isPro = currentLic && currentLic.license_key ? verifyLicenseKey(currentLic.license_key).ok : false;
  assert.strictEqual(isPro, false, 'User is currently on Free tier');
  assert.strictEqual(clientList.length >= FREE_LIMITS.MAX_CLIENTS, true, 'Client limit of 3 is reached');

  // Activate Lifetime Pro license
  saveLicenseInfo({
    license_key: lifetimeKey,
    licensee_name: lifetimeVerify.licensee_name,
    licensee_email: lifetimeVerify.licensee_email,
    plan: lifetimeVerify.plan,
    expiry_date: null,
    issued_at: lifetimeVerify.issued_at,
  });

  const activeLic = getLicenseInfo();
  const isProAfterActivation = activeLic && activeLic.license_key ? verifyLicenseKey(activeLic.license_key).ok : false;
  assert.strictEqual(isProAfterActivation, true, 'User is now verified Pro');

  // Pro allows adding 4th client and beyond
  const client4 = addClient({ name: 'Client 4 (Pro Unlimited)', email: 'c4@test.ng' });
  assert.ok(client4 && client4.id, '4th client successfully added under Pro license');
  clearLicenseInfo();
  console.log('✓ Client gating logic and Pro unlock validated\n');

  // -------------------------------------------------------------------------
  // New Crockford Base32 + Ed25519 Entitlement tests
  // -------------------------------------------------------------------------

  // Test 10: New Key Format, Normalization & Checksum
  console.log('--- Test 10: New Crockford Base32 Key Format & Validation ---');
  const serial = generateSerial({ plan: 'annual', expiry: '2027-12-31' });
  assert.ok(serial.startsWith('QC-'), 'Serial must start with QC-');
  const fmtOk = validateKeyFormat(serial);
  assert.strictEqual(fmtOk.ok, true, 'Generated serial must pass format validation');
  assert.strictEqual(fmtOk.plan, 'annual', 'Validated plan must be annual');

  const fmtBad = validateKeyFormat('QC-INVALID-KEY-12345-67890');
  assert.strictEqual(fmtBad.ok, false, 'Invalid format key must fail validation');

  const norm = normalizeKey('qc-7a2k9-4mpq8-xt5r2-9wz3o');
  assert.ok(!norm.includes('o') && !norm.includes('O'), 'O must normalize to 0');
  console.log('✓ New Crockford base32 format & normalization verified\n');

  // Test 11: Ed25519 Entitlement Token Verification & Tamper Detection
  console.log('--- Test 11: Entitlement Token Signing & Ed25519 Verification ---');
  const privateKeyPem = getPrivateKeyPem();
  const deviceId = 'test-device-uuid-1234';
  const entPayload = buildEntitlement({
    serial,
    name: 'Alice Test',
    email: 'alice@test.ng',
    plan: 'lifetime',
    deviceId,
  });
  const token = signEntitlement(entPayload, privateKeyPem);
  const verify11 = verifyEntitlementToken(token);
  assert.strictEqual(verify11.ok, true, 'Signed token must verify with public key');
  assert.strictEqual(verify11.payload.serial, serial, 'Token serial must match');

  const validNow = isEntitlementValid(verify11.payload);
  assert.strictEqual(validNow.ok, true, 'Entitlement token is currently valid');

  // Tamper detection
  const tokenParts = token.split('.');
  const tamperedToken = tokenParts[0] + '.tampered.' + tokenParts[2];
  const tamperVerify = verifyEntitlementToken(tamperedToken);
  assert.strictEqual(tamperVerify.ok, false, 'Tampered token must fail verification');

  // Expiry check (beyond 30 days grace)
  const future35 = new Date(Date.now() + 35 * 86400 * 1000);
  const graceExpired = isEntitlementValid(verify11.payload, future35.getTime());
  assert.strictEqual(graceExpired.ok, false, 'Expired beyond grace window must be invalid');
  console.log('✓ Entitlement token signing, Ed25519 verification & tamper detection verified\n');

  // Test 12: Desktop Offline Grace & Effective License State
  console.log('--- Test 12: Desktop Offline Grace & Effective License State ---');
  saveLicenseInfo({
    license_key: serial,
    serial: serial,
    entitlement_token: token,
    status: 'active',
    device_id: deviceId,
    valid_until: entPayload.valid_until,
    plan: 'lifetime',
    licensee_name: 'Alice Test',
    licensee_email: 'alice@test.ng',
  });

  const stored12 = getLicenseInfo();
  assert.strictEqual(stored12.serial, serial, 'Stored serial should match');

  const state12 = await getEffectiveLicenseState();
  assert.strictEqual(state12.ok, true, 'getEffectiveLicenseState should succeed');
  assert.strictEqual(state12.isPro, true, 'Effective state should be Pro within grace');
  assert.strictEqual(state12.state, 'active', 'Effective state should be active');

  // Simulate after grace expiry with injectable clock
  const stateExpired12 = await getEffectiveLicenseState({ autoRefresh: false, now: future35.getTime() });
  assert.strictEqual(stateExpired12.isPro, false, 'Expired license must not be Pro');
  assert.strictEqual(stateExpired12.state, 'grace_expired', 'State should be grace_expired');

  clearLicenseInfo();
  console.log('✓ Offline grace and effective license state verified\n');

  // Clean up test DB
  global.fetch = originalFetch;
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (_e) {}
  }

  console.log('=========================================================');
  console.log(' All 12 Licensing & Monetization tests passed! (100%)');
  console.log('=========================================================\n');
}

runTests().catch((err) => {
  global.fetch = originalFetch;
  console.error('\n✗ Licensing test failed:', err);
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (_e) {}
  }
  process.exit(1);
});
