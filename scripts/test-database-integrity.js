const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-db-integrity-'));
const testDbPath = path.join(testDir, 'test-integrity.sqlite');
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  checkIntegrity,
  verifyDatabaseHealth,
  getRecoveryInfo,
  saveCompanyProfile,
  addClient,
} = require('../src/main/database');

const {
  createBackupPayload,
  getDefaultBackupsFolder,
} = require('../src/main/auto-backup');

async function runTests() {
  console.log('--- Starting Database Integrity & Self-Healing Unit Tests ---');

  // Test 1: Clean initialization and integrity check
  await initializeDatabase();
  console.log('✓ Database initialized cleanly');

  const integrity = checkIntegrity();
  assert.strictEqual(integrity.ok, true, 'Integrity check must pass on clean db');
  assert.strictEqual(integrity.status, 'ok', 'Status must be "ok"');
  console.log('✓ PRAGMA integrity_check passed');

  // Test 2: verifyDatabaseHealth
  saveCompanyProfile({ business_name: 'Test Corp', default_currency: 'USD' });
  addClient({ name: 'Alpha Client', email: 'alpha@example.com' });

  const health = verifyDatabaseHealth();
  assert.strictEqual(health.ok, true, 'Health check must pass');
  assert.strictEqual(health.status, 'ok', 'Health status must be "ok"');
  assert.strictEqual(typeof health.counts, 'object', 'Counts must be returned');
  assert.strictEqual(health.counts.clients, 1, 'Client count must be 1');
  console.log(`✓ verifyDatabaseHealth returned ${health.tablesChecked} tables checked, 1 client found`);

  // Test 3: getDefaultBackupsFolder
  const defaultFolder = getDefaultBackupsFolder();
  assert.ok(typeof defaultFolder === 'string' && defaultFolder.length > 0, 'Default folder must be non-empty string');
  assert.ok(defaultFolder.includes('backups'), 'Default folder path must contain "backups"');
  console.log(`✓ Default backup folder resolved: ${defaultFolder}`);

  // Test 4: Self-healing on corrupt database
  // Step 4a: Create a valid backup file in the test directory
  const profile = { business_name: 'Test Corp' };
  const backupPayload = createBackupPayload(profile);
  const backupFilePath = path.join(testDir, 'quoteCraft-auto-testbackup.json');
  fs.writeFileSync(backupFilePath, JSON.stringify(backupPayload, null, 2), 'utf8');
  console.log('✓ Created valid candidate backup file');

  closeDatabase();

  // Step 4b: Deliberately corrupt the sqlite file
  fs.writeFileSync(testDbPath, Buffer.from('NOT A VALID SQLITE DATABASE TRUNCATED GARBAGE DATA'));
  console.log('✓ Corrupted the database file on disk');

  // Step 4c: Re-initialize database — must self-heal from candidate backup
  await initializeDatabase();
  console.log('✓ initializeDatabase completed after corruption');

  const recovery = getRecoveryInfo();
  assert.ok(recovery, 'Recovery info must be present');
  assert.strictEqual(recovery.recovered, true, 'Recovery must report success');
  assert.strictEqual(recovery.sourceBackup, 'quoteCraft-auto-testbackup.json', 'Source backup must match');
  assert.ok(recovery.corruptPreservedAs.includes('corrupted'), 'Corrupted file must be preserved');

  // Verify that the restored database is healthy and has our client
  const restoredHealth = verifyDatabaseHealth();
  assert.strictEqual(restoredHealth.ok, true, 'Restored database must be healthy');
  assert.strictEqual(restoredHealth.counts.clients, 1, 'Restored database must contain our client');
  console.log('✓ Self-healing successfully restored data and preserved corrupt file');

  closeDatabase();

  // Cleanup
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('\n--- All Database Integrity & Self-Healing Tests Passed! ---');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
