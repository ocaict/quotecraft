/**
 * test-phase3-activation.js — Phase 3 App Activation & Offline Grace Tests
 *
 * Runs under plain Node.js. Tests DB Migration 48, online activation client,
 * cached entitlement verification, 30-day offline grace window, and deactivation.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Isolated test database
const testDbPath = path.join(__dirname, 'test-phase3-activation.sqlite');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  getDb,
  getLicenseInfo,
  saveLicenseInfo,
  clearLicenseInfo,
} = require('../src/main/database');

const { generateSerial, validateKeyFormat } = require('../src/shared/license-key');
const { signEntitlement, buildEntitlement } = require('../src/main/entitlement');
const { getPrivateKeyPem } = require('./license-keys');

// Setup mock global.fetch for worker interactions
let mockWorkerRoutes = {};
const originalFetch = global.fetch;

global.fetch = async (url, options = {}) => {
  const parsedUrl = new URL(url);
  const pathname = parsedUrl.pathname;
  if (mockWorkerRoutes[pathname]) {
    return mockWorkerRoutes[pathname](options);
  }
  throw new Error(`Unhandled mock fetch route: ${pathname}`);
};

const {
  getDeviceId,
  activateOnline,
  deactivateOnline,
  refreshLicenseOnline,
  getEffectiveLicenseState,
} = require('../src/main/activation');

async function runTests() {
  console.log('=== Starting Phase 3 Desktop App Activation Tests ===\n');

  // 1. Initialize DB and verify Migration 48
  console.log('1. Testing Database Migration 48...');
  await initializeDatabase();
  const db = getDb();
  const res = db.exec(`PRAGMA table_info(license_info)`);
  assert(res && res[0], 'license_info table must exist');
  const columns = new Set(res[0].values.map((v) => v[1]));

  assert(columns.has('entitlement_token'), 'license_info must have entitlement_token column');
  assert(columns.has('serial'), 'license_info must have serial column');
  assert(columns.has('status'), 'license_info must have status column');
  assert(columns.has('valid_until'), 'license_info must have valid_until column');
  assert(columns.has('device_id'), 'license_info must have device_id column');
  console.log('   ✓ Migration 48 applied: all new licensing columns present.\n');

  // 2. Device ID Generation
  console.log('2. Testing Device ID...');
  const devId1 = getDeviceId();
  assert(devId1 && typeof devId1 === 'string', 'getDeviceId must return a string');
  const devId2 = getDeviceId();
  assert.strictEqual(devId1, devId2, 'getDeviceId must be idempotent and stable');
  console.log(`   ✓ Stable Device ID: ${devId1}\n`);

  // 3. Client-side Format & Typo Pre-validation
  console.log('3. Testing Client-side Pre-validation...');
  const typoRes = await activateOnline('QC-7A2K9-4MPQ8-XT5R2-9WZ3A'); // incorrect checksum
  assert.strictEqual(typoRes.ok, false);
  assert.strictEqual(typoRes.reason, 'checksum');

  const shortRes = await activateOnline('QC-1234');
  assert.strictEqual(shortRes.ok, false);
  assert.strictEqual(shortRes.reason, 'length');
  console.log('   ✓ Invalid keys & typos rejected client-side before any network call.\n');

  // 4. Online Activation (/activate)
  console.log('4. Testing Online Activation...');
  const testSerial = generateSerial({ plan: 'lifetime' });

  // Mock /activate worker endpoint
  mockWorkerRoutes['/activate'] = async (opts) => {
    const body = JSON.parse(opts.body);
    const entitlement = buildEntitlement({
      serial: body.key,
      name: 'Ada Lovelace',
      plan: 'lifetime',
      expiry: null,
      device_id: body.device_id,
      graceDays: 30,
    });
    const token = signEntitlement(entitlement, getPrivateKeyPem());

    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        token,
        license: {
          serial: body.key,
          name: 'Ada Lovelace',
          plan: 'lifetime',
          expiry: null,
        },
      }),
    };
  };

  const actRes = await activateOnline(testSerial);
  assert.strictEqual(actRes.ok, true, 'Online activation must succeed');
  assert.strictEqual(actRes.license.name, 'Ada Lovelace');
  assert.strictEqual(actRes.license.plan, 'lifetime');
  assert.ok(actRes.token, 'Must return signed entitlement token');

  // Check stored in DB
  const stored = getLicenseInfo();
  assert.strictEqual(stored.serial, testSerial);
  assert.strictEqual(stored.licensee_name, 'Ada Lovelace');
  assert.strictEqual(stored.plan, 'lifetime');
  assert.strictEqual(stored.status, 'active');
  assert.strictEqual(stored.entitlement_token, actRes.token);
  assert.ok(stored.valid_until, 'valid_until date must be stored');
  console.log('   ✓ Online activation stored signed token & licensee info in database.\n');

  // 5. Offline Grace Verification
  console.log('5. Testing Offline Grace Verification...');
  // Even with network completely down:
  mockWorkerRoutes['/activate'] = () => { throw new Error('Offline'); };
  mockWorkerRoutes['/validate'] = () => { throw new Error('Offline'); };

  const stateWithinGrace = await getEffectiveLicenseState();
  assert.strictEqual(stateWithinGrace.ok, true);
  assert.strictEqual(stateWithinGrace.isPro, true);
  assert.strictEqual(stateWithinGrace.state, 'active');
  console.log('   ✓ Pro status active offline via embedded public key verification.\n');

  // 6. Grace Expiration Behavior
  console.log('6. Testing Grace Expiration...');
  // Check state 35 days in the future (past the 30-day offline grace window) while offline
  const thirtyFiveDaysFuture = Date.now() + 35 * 86400000;
  const stateGraceExpired = await getEffectiveLicenseState({ autoRefresh: true, now: thirtyFiveDaysFuture });
  assert.strictEqual(stateGraceExpired.isPro, false, 'Must drop to free tier when grace expires offline');
  assert.strictEqual(stateGraceExpired.state, 'grace_expired');
  assert.strictEqual(stateGraceExpired.needsRefresh, true);
  console.log('   ✓ Soft fallback to Free tier when grace period ends without connectivity.\n');

  // 7. Online Refresh (/validate)
  console.log('7. Testing Online Refresh...');
  // Restore network for /validate
  mockWorkerRoutes['/validate'] = async (opts) => {
    const refreshedEntitlement = buildEntitlement({
      serial: testSerial,
      name: 'Ada Lovelace',
      plan: 'lifetime',
      expiry: null,
      device_id: devId1,
      graceDays: 30, // fresh 30 days
    });
    const refreshedToken = signEntitlement(refreshedEntitlement, getPrivateKeyPem());
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        token: refreshedToken,
      }),
    };
  };

  const refRes = await refreshLicenseOnline();
  assert.strictEqual(refRes.ok, true);
  assert.strictEqual(refRes.refreshed, true);

  const stateRefreshed = await getEffectiveLicenseState();
  assert.strictEqual(stateRefreshed.isPro, true);
  assert.strictEqual(stateRefreshed.state, 'active');
  console.log('   ✓ Online validation refreshed token and extended grace window.\n');

  // 8. Online Deactivation (/deactivate)
  console.log('8. Testing Online Deactivation...');
  let deactivatedOnServer = false;
  mockWorkerRoutes['/deactivate'] = async (opts) => {
    const body = JSON.parse(opts.body);
    assert.strictEqual(body.key, testSerial);
    assert.strictEqual(body.device_id, devId1);
    deactivatedOnServer = true;
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, released: true }),
    };
  };

  const deactRes = await deactivateOnline();
  assert.strictEqual(deactRes.ok, true);
  assert.strictEqual(deactivatedOnServer, true);

  const stateAfterDeact = await getEffectiveLicenseState();
  assert.strictEqual(stateAfterDeact.isPro, false);
  assert.strictEqual(stateAfterDeact.state, 'free');
  assert.strictEqual(getLicenseInfo(), null);
  console.log('   ✓ Deactivated seat released on server and local DB cleared.\n');

  // Clean up
  global.fetch = originalFetch;
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  console.log('========================================');
  console.log(' Phase 3 Activation Tests: All passed! ');
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  global.fetch = originalFetch;
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  process.exit(1);
});
