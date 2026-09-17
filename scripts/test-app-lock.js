const path = require('path');
const fs = require('fs');
const assert = require('assert');

const testDbPath = path.join(__dirname, 'test-app-lock.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  getDb,
  closeDatabase,
  getAppLockSettings,
  setAppLockPin,
  verifyAppLockPin,
  disableAppLock,
} = require('../src/main/database');

async function runTests() {
  console.log('--- Starting App Lock Unit Tests ---');

  await initializeDatabase();
  console.log('✓ Database initialized');

  // 1. Lock is off by default, no PIN set
  let settings = getAppLockSettings();
  assert.strictEqual(settings.is_enabled, false, 'Lock must be off by default');
  assert.strictEqual(settings.pin_set, false, 'No PIN should be set initially');
  assert.strictEqual(settings.inactivity_minutes, 5, 'Default inactivity is 5 minutes');
  console.log('✓ Lock is OFF by default with 5-minute inactivity');

  // 2. PIN validation: too short / too long rejected
  let res = setAppLockPin({ pin: '123', inactivityMinutes: 5 });
  assert.strictEqual(res.ok, false, '3-character PIN must be rejected');
  assert.ok(res.error.includes('at least 4 characters'));

  res = setAppLockPin({ pin: 'x'.repeat(65), inactivityMinutes: 5 });
  assert.strictEqual(res.ok, false, '65-character PIN must be rejected');
  assert.ok(res.error.includes('64 characters'));
  console.log('✓ Short and over-length PINs rejected');

  // 3. Enable lock with first PIN (no current PIN required)
  res = setAppLockPin({ pin: '4821', inactivityMinutes: 10 });
  assert.strictEqual(res.ok, true, 'First PIN should enable the lock');
  settings = getAppLockSettings();
  assert.strictEqual(settings.is_enabled, true);
  assert.strictEqual(settings.pin_set, true);
  assert.strictEqual(settings.inactivity_minutes, 10);
  console.log('✓ Lock enabled with PIN 4821, 10-minute inactivity');

  // 4. PIN is hashed, never stored in plaintext
  const db = getDb();
  const stored = db.exec('SELECT pin_hash, pin_salt FROM app_lock WHERE id = 1');
  assert.ok(stored.length && stored[0].values.length === 1, 'Row must exist');
  const row = stored[0].values[0];
  assert.notStrictEqual(row[0], '4821', 'PIN must not be stored as plaintext');
  assert.ok(row[0] && row[0].length === 32, 'scrypt hash should be 16 bytes as hex (32 chars)');
  assert.ok(row[1] && row[1].length === 32, 'salt should be 16 bytes as hex (32 chars)');
  console.log('✓ PIN stored as scrypt hash with random salt (no plaintext)');

  // 5. Verify correct and incorrect PINs
  assert.strictEqual(verifyAppLockPin('4821'), true, 'Correct PIN verifies');
  assert.strictEqual(verifyAppLockPin('4820'), false, 'Incorrect PIN rejected');
  assert.strictEqual(verifyAppLockPin(''), false, 'Empty PIN rejected');
  console.log('✓ Correct PIN verifies, wrong/empty PINs rejected');

  // 6. Changing PIN requires current PIN
  res = setAppLockPin({ pin: '9999', currentPin: '4821', inactivityMinutes: 5 });
  assert.strictEqual(res.ok, true, 'Changing PIN with correct current PIN succeeds');
  assert.strictEqual(verifyAppLockPin('9999'), true, 'New PIN works');
  assert.strictEqual(verifyAppLockPin('4821'), false, 'Old PIN no longer works');

  res = setAppLockPin({ pin: '7777', currentPin: '0000', inactivityMinutes: 5 });
  assert.strictEqual(res.ok, false, 'Changing PIN with wrong current PIN rejected');
  assert.ok(res.error.includes('Current PIN is incorrect'));
  assert.strictEqual(verifyAppLockPin('9999'), true, 'PIN unchanged after failed change');
  console.log('✓ PIN change requires the current PIN');

  // 7. Disable requires current PIN
  res = disableAppLock({ currentPin: '1111' });
  assert.strictEqual(res.ok, false, 'Disable with wrong PIN rejected');
  assert.strictEqual(getAppLockSettings().is_enabled, true, 'Lock still enabled');

  res = disableAppLock({ currentPin: '9999' });
  assert.strictEqual(res.ok, true, 'Disable with correct PIN succeeds');
  settings = getAppLockSettings();
  assert.strictEqual(settings.is_enabled, false, 'Lock is now off');
  assert.strictEqual(settings.pin_set, true, 'Hash retained so re-enabling still requires known PIN');

  // 8. Re-enabling an existing lock still requires the current PIN
  res = setAppLockPin({ pin: '1234', inactivityMinutes: 30 });
  assert.strictEqual(res.ok, false, 'Re-enabling must require the previously set PIN');
  res = setAppLockPin({ pin: '1234', currentPin: '9999', inactivityMinutes: 30 });
  assert.strictEqual(res.ok, true, 'Re-enable with correct current PIN succeeds');
  assert.strictEqual(getAppLockSettings().is_enabled, true);
  assert.strictEqual(getAppLockSettings().inactivity_minutes, 30);
  console.log('✓ Lock re-enable requires current PIN; inactivity configurable');

  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('\nAll App Lock unit tests PASSED successfully!');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});