const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const testDbPath = path.join(__dirname, 'test-auto-backup.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-autobackup-'));
const backupFolder = path.join(tempDir, 'auto');

const {
  initializeDatabase,
  closeDatabase,
  saveCompanyProfile,
  getAutoBackupSettings,
  saveAutoBackupSettings,
} = require('../src/main/database');

const {
  runNow,
  runDailyIfDue,
  runOnCloseIfEnabled,
  writeAutoBackup,
  buildAutoBackupFilename,
  listAutoBackups,
  pruneAutoBackups,
} = require('../src/main/auto-backup');

const DAY_MS = 24 * 60 * 60 * 1000;

async function runTests() {
  console.log('--- Starting Automatic Backup Unit Tests ---');

  await initializeDatabase();
  console.log('✓ Database initialized');

  saveCompanyProfile({ business_name: 'Acme Technologies', default_currency: 'USD', reporting_currency: 'USD' });

  // 1. Defaults
  let s = getAutoBackupSettings();
  assert.strictEqual(s.enabled, false, 'Disabled by default');
  assert.strictEqual(s.schedule, 'daily', 'Default schedule is daily');
  assert.strictEqual(s.folder, '', 'No folder by default');
  assert.strictEqual(s.retainCount, 7, 'Default retention is 7');
  assert.strictEqual(s.lastBackupAt, null, 'No last backup recorded');
  console.log('✓ Defaults correct (off, daily, no folder, keep 7)');

  // 2. Validation
  let r = saveAutoBackupSettings({ enabled: true, schedule: 'daily', folder: '', retainCount: 7 });
  assert.strictEqual(r.ok, false, 'Enabling without a folder must fail');
  assert.ok(r.error.includes('Choose a folder'));

  r = saveAutoBackupSettings({ enabled: true, schedule: 'weekly', folder: backupFolder, retainCount: 0 });
  assert.strictEqual(r.ok, true, 'Coerces invalid values');
  assert.strictEqual(r.settings.schedule, 'daily', 'Unknown schedule coerced to daily');
  assert.strictEqual(r.settings.retainCount, 1, 'Retention clamped to minimum of 1');

  r = saveAutoBackupSettings({ enabled: true, schedule: 'daily', folder: backupFolder, retainCount: 99 });
  assert.strictEqual(r.settings.retainCount, 30, 'Retention clamped to maximum of 30');
  console.log('✓ Validation/coercion works (no folder rejected; invalid values clamped)');

  // 3. runNow requires a configured folder
  r = saveAutoBackupSettings({ enabled: false, schedule: 'daily', folder: '', retainCount: 7 });
  assert.strictEqual(r.ok, true);
  r = runNow();
  assert.strictEqual(r.ok, false, 'Back up now without folder fails');
  assert.ok(r.error.includes('folder'));
  console.log('✓ Back up now without a folder is rejected');

  // 4. Configure daily with retention 3
  r = saveAutoBackupSettings({ enabled: true, schedule: 'daily', folder: backupFolder, retainCount: 3 });
  assert.strictEqual(r.ok, true);

  // 5. Back up now creates a valid file
  const nowRes = runNow();
  assert.strictEqual(nowRes.ok, true, 'Back up now succeeds');
  assert.ok(nowRes.path.startsWith(path.join(backupFolder, 'quoteCraft-auto-')), 'Uses autoback prefix/name');
  assert.ok(nowRes.path.endsWith('.json'));

  const raw = fs.readFileSync(nowRes.path, 'utf8');
  const payload = JSON.parse(raw);
  assert.strictEqual(payload.app, 'QuoteCraft');
  assert.strictEqual(payload.magic, 'QUOTECRAFT_BACKUP');
  assert.strictEqual(payload.version, 1);
  const dbB64 = Buffer.from(payload.database, 'base64');
  assert.strictEqual(dbB64.slice(0, 16).toString('latin1'), 'SQLite format 3\u0000', 'DB payload is valid SQLite');
  console.log('✓ Back up now writes a valid QuoteCraft backup file');

  // 6. Rolling retention: writes beyond keep-count get pruned, oldest removed
  writeAutoBackup({ folder: backupFolder, retainCount: 3 });
  writeAutoBackup({ folder: backupFolder, retainCount: 3 });
  writeAutoBackup({ folder: backupFolder, retainCount: 3 });

  fs.writeFileSync(path.join(backupFolder, 'my-custom-note.txt'), 'not a backup');
  const all = listAutoBackups(backupFolder);
  assert.strictEqual(all.length, 3, 'Only the latest 3 autobackups remain');
  const names = all.map((b) => b.name);
  const expected = names.slice().sort();
  assert.deepStrictEqual(names, expected, 'Listed oldest to newest');
const allFiles = fs.readdirSync(backupFolder);
  assert.ok(allFiles.includes('my-custom-note.txt'), 'Non-backup files are left untouched');
  assert.strictEqual((fs.readdirSync(backupFolder).filter((n) => n.startsWith('quoteCraft-auto-'))).length, 3);
  console.log('✓ Rolling window keeps latest 3 and only deletes auto backups');

  // Explicit prune removes the oldest when over the limit (uses raw files since
  // writeAutoBackup already prunes internally). Clear prior autobackups first.
  for (const existing of (fs.readdirSync(backupFolder) || [])) {
    if (existing.startsWith('quoteCraft-auto-')) {
      fs.unlinkSync(path.join(backupFolder, existing));
    }
  }
  const base = new Date('2019-01-01T00:00:00Z');
  const rawNames = [];
  for (let i = 0; i < 5; i++) {
    const name = buildAutoBackupFilename(new Date(base.getTime() + i * 60000));
    fs.writeFileSync(path.join(backupFolder, name), '{}');
    rawNames.push(name);
  }
  const deleted = pruneAutoBackups(backupFolder, 3);
  assert.strictEqual(deleted, 2, 'Prune removes exactly the 2 oldest when at 5 files');
  const afterPrune = listAutoBackups(backupFolder);
  assert.strictEqual(afterPrune.length, 3);
  assert.ok(afterPrune[0].name === rawNames[2], 'Third-newest kept');
  assert.ok(!afterPrune.some((b) => b.name === rawNames[0] || b.name === rawNames[1]), 'Oldest two removed');
  assert.ok(fs.existsSync(path.join(backupFolder, 'my-custom-note.txt')), 'Stray file still untouched');
  console.log('✓ Explicit prune removes only the oldest exceeding the limit');

  // 7. Daily scheduling
  r = saveAutoBackupSettings({
    enabled: true,
    schedule: 'daily',
    folder: backupFolder,
    retainCount: 3,
    lastBackupAt: new Date(Date.now() - 2 * DAY_MS).toISOString(),
  });
  assert.strictEqual(r.ok, true);

  const before = new Set(listAutoBackups(backupFolder).map((b) => b.name));
  let sched = runDailyIfDue();
  assert.strictEqual(sched.ok, true);
  assert.strictEqual(sched.skipped, false, 'Daily backup runs when last run was >24h ago');
  const afterNames = listAutoBackups(backupFolder).map((b) => b.name);
  assert.ok(afterNames.some((n) => !before.has(n)), 'A new backup file was created (and oldest pruned)');
  assert.ok(getAutoBackupSettings().lastBackupAt, 'last_backup_at updated after a daily run');

  sched = runDailyIfDue();
  assert.strictEqual(sched.skipped, 'recent', 'Second run within 24h is skipped');
  assert.deepStrictEqual(listAutoBackups(backupFolder).map((b) => b.name), afterNames, 'No duplicate was written');
  console.log('✓ Daily schedule runs when due and skips when backed up recently');

  // 8. On-close schedule
  r = saveAutoBackupSettings({ enabled: true, schedule: 'on_close', folder: backupFolder, retainCount: 3 });
  assert.strictEqual(r.ok, true);
  const after = new Set(listAutoBackups(backupFolder).map((b) => b.name));
  let closeRes = runOnCloseIfEnabled();
  assert.strictEqual(closeRes.ok, true, 'On-close backup writes when enabled');
  const afterClose = listAutoBackups(backupFolder).map((b) => b.name);
  assert.ok(afterClose.some((n) => !after.has(n)), 'On-close backup file created');

  const dailyWhileOnClose = runDailyIfDue();
  assert.strictEqual(dailyWhileOnClose.skipped, 'off', 'Daily check is skipped under on_close schedule');

  r = saveAutoBackupSettings({ enabled: false, schedule: 'on_close', folder: backupFolder, retainCount: 3 });
  closeRes = runOnCloseIfEnabled();
  assert.strictEqual(closeRes.skipped, 'disabled', 'On-close backup skipped when disabled');
  console.log('✓ On-close schedule writes on close and respects enable/disable');

  closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('\nAll Automatic Backup unit tests PASSED successfully!');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}
  process.exit(1);
});