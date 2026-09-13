const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Set up temporary test environment
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quotecraft-email-test-'));
process.env.TEST_DB_PATH = path.join(tmpDir, 'test.db');

const {
  encryptSecret,
  decryptSecret,
  isSafeStorageAvailable,
} = require('../src/main/secure-storage');

const {
  initializeDatabase,
  getEmailSettings,
  getEmailSettingsInternal,
  saveEmailSettings,
} = require('../src/main/database');

const { sendTestEmail } = require('../src/main/email-service');

async function runTests() {
  console.log('--- Starting Email Settings & Security Tests ---');
  await initializeDatabase();

  // Test 1: Secure Storage Encryption & Decryption
  console.log('Test 1: Testing encryption & decryption round-trip...');
  const secret = 'super-secret-app-password-1234!';
  const encrypted = encryptSecret(secret);
  assert(encrypted, 'Encryption must return non-empty string');
  assert.notStrictEqual(encrypted, secret, 'Encrypted secret must not equal plaintext');

  const decrypted = decryptSecret(encrypted);
  assert.strictEqual(decrypted, secret, 'Decrypted secret must match original plaintext');
  console.log('✓ Test 1 passed: Encryption & decryption round-trip succeeded');

  // Test 2: Saving Email Settings
  console.log('Test 2: Saving email settings with credentials...');
  const initialSettings = {
    smtp_host: 'smtp.example.com',
    smtp_port: 587,
    smtp_secure: 0,
    smtp_username: 'billing@example.com',
    smtp_password: 'initial-password-xyz',
    sender_name: 'Acme Billing',
    sender_email: 'billing@example.com',
  };

  const saveRes = saveEmailSettings(initialSettings);
  assert.strictEqual(saveRes.ok, true, 'Saving settings should return ok: true');

  // Test 3: Public getter should NEVER expose plaintext password
  console.log('Test 3: getEmailSettings must mask or omit plaintext password...');
  const publicSettings = getEmailSettings();
  assert(publicSettings, 'getEmailSettings should return settings');
  assert.strictEqual(publicSettings.smtp_host, 'smtp.example.com');
  assert.strictEqual(publicSettings.smtp_port, 587);
  assert.strictEqual(publicSettings.sender_name, 'Acme Billing');
  assert.strictEqual(publicSettings.password_saved, true, 'password_saved should be true');
  assert.strictEqual(publicSettings.smtp_password, undefined, 'smtp_password must not be returned publicly');
  console.log('✓ Test 3 passed: Public settings hides secret and sets password_saved: true');

  // Test 4: Internal getter should decrypt correctly
  console.log('Test 4: getEmailSettingsInternal should return decrypted password...');
  const internalSettings = getEmailSettingsInternal();
  assert.strictEqual(internalSettings.smtp_password, 'initial-password-xyz', 'Internal password must match plaintext');
  console.log('✓ Test 4 passed: Internal decrypted password retrieved correctly');

  // Test 5: Update settings without providing a new password (retaining existing)
  console.log('Test 5: Updating settings with blank password preserves existing encrypted password...');
  const updatedSettings = {
    smtp_host: 'mail.newdomain.com',
    smtp_port: 465,
    smtp_secure: 1,
    smtp_username: 'invoicing@newdomain.com',
    smtp_password: '', // empty means keep existing
    sender_name: 'Acme Invoicing',
    sender_email: 'invoicing@newdomain.com',
  };

  const updateRes = saveEmailSettings(updatedSettings);
  assert.strictEqual(updateRes.ok, true, 'Update should succeed');

  const reloaded = getEmailSettingsInternal();
  assert.strictEqual(reloaded.smtp_host, 'mail.newdomain.com');
  assert.strictEqual(reloaded.smtp_port, 465);
  assert.strictEqual(reloaded.smtp_secure, 1);
  assert.strictEqual(reloaded.smtp_username, 'invoicing@newdomain.com');
  assert.strictEqual(reloaded.smtp_password, 'initial-password-xyz', 'Original password must be retained');
  console.log('✓ Test 5 passed: Existing password preserved when blank passed');

  // Test 6: Safe error handling in sendTestEmail on unreachable host
  console.log('Test 6: sendTestEmail error handling on non-existent host...');
  const unreachableConfig = {
    smtp_host: '127.0.0.1',
    smtp_port: 65432, // unused port
    smtp_secure: false,
    smtp_username: 'test',
    smtp_password: 'pwd',
    sender_name: 'Tester',
    sender_email: 'test@example.com',
  };

  const sendRes = await sendTestEmail(unreachableConfig, 'dest@example.com');
  assert.strictEqual(sendRes.ok, false, 'sendTestEmail should fail gracefully for unreachable host');
  assert(sendRes.error, 'Should contain user-friendly error message');
  console.log('✓ Test 6 passed: Graceful failure report:', sendRes.error);

  // Cleanup
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('--- All Email Settings & Security Tests Passed! ---');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
