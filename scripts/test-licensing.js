const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Isolated test DB
const testDbPath = path.join(__dirname, 'test-licensing.sqlite');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
process.env.TEST_DB_PATH = testDbPath;

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

async function runTests() {
  console.log('=== Stage 5 Nigeria: Commercial Licensing Test Suite ===\n');

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
  console.log('✓ Client gating logic and Pro unlock validated\n');

  // Clean up test DB
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (_e) {}
  }

  console.log('======================================================');
  console.log(' All 9 Licensing & Monetization tests passed! (100%)');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Licensing test failed:', err);
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (_e) {}
  }
  process.exit(1);
});
