const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Isolated temp DB — MUST be set BEFORE require('../src/main/database')
const testDbPath = path.join(__dirname, 'test-live-timer.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  getDb,
  addClient,
  addProject,
  getTimerSettings,
  saveTimerSettings,
  getLiveTimer,
  startLiveTimer,
  stopLiveTimer,
  discardLiveTimer,
  listTimeEntries,
} = require('../src/main/database');

function rewindStartedAt(msAgo) {
  getDb().exec(
    `UPDATE live_timer SET started_at = ? WHERE id = 1`,
    [new Date(Date.now() - msAgo).toISOString()]
  );
}

function localDateOfMsAgo(msAgo) {
  const d = new Date(Date.now() - msAgo);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function runTests() {
  console.log('--- Starting Live Timer Tests ---');
  await initializeDatabase();
  console.log('✓ Database initialized (live_timer + timer_settings)');

  // ---------- 1. Defaults ----------
  let s = getTimerSettings();
  assert.strictEqual(s.roundingMinutes, 6, 'Default rounding should be 6 minutes');
  assert.strictEqual(getLiveTimer(), null, 'No timer initially');
  console.log('✓ Default rounding 6 min; no timer running');

  // ---------- 2. Validation ----------
  let r = startLiveTimer({ description: 'No client' });
  assert.strictEqual(r.ok, false, 'Start without client should fail');
  assert.ok(r.errors && r.errors.client_id, 'client_id error expected');

  r = startLiveTimer({ client_id: 1, description: '' });
  assert.strictEqual(r.ok, false, 'Start without description should fail');
  assert.ok(r.errors && r.errors.description, 'description error expected');

  const clientA = addClient({ name: 'Acme Corp', status: 'active' });
  const clientB = addClient({ name: 'Globex', status: 'active' });
  const projA = addProject({ client_id: clientA.id, name: 'Website Redesign', status: 'active', start_date: '2026-09-01' });
  r = startLiveTimer({ client_id: clientB.id, project_id: projA.project.id, description: 'Wrong project' });
  assert.strictEqual(r.ok, false, 'Cross-client project should fail');
  assert.ok(r.errors && r.errors.project_id, 'project_id error expected');
  console.log('✓ Validation: client, description, cross-client project');

  // ---------- 3. Single timer ----------
  r = startLiveTimer({ client_id: clientA.id, project_id: projA.project.id, description: 'Design call' });
  assert.strictEqual(r.ok, true, 'First timer should start');
  assert.strictEqual(r.timer.client_name, 'Acme Corp', 'Client name decorated');
  assert.strictEqual(r.timer.project_name, 'Website Redesign', 'Project name decorated');
  const firstStartedAt = r.timer.started_at;

  r = startLiveTimer({ client_id: clientB.id, description: 'Second one' });
  assert.strictEqual(r.ok, false, 'Second timer should be rejected');
  assert.strictEqual(r.running, true, 'Should report already running');

  // Persistence: re-read from DB (as a fresh launch would)
  const relived = getLiveTimer();
  assert.strictEqual(relived.started_at, firstStartedAt, 'Timer survives a simulated relaunch');
  assert.ok(relived.elapsed_ms > 0, 'Elapsed is derived from started_at');
  console.log('✓ Single-timer guard + persistence (recovery read)');

  // ---------- 4. Stop with rounding ----------
  // 2h16m at 6-min rounding -> 136/6 = 22.67 increments -> 23 -> 2.3h
  rewindStartedAt(136 * 60 * 1000);
  r = stopLiveTimer();
  assert.strictEqual(r.ok, true, 'Stop should create an entry');
  assert.strictEqual(r.hours, 2.3, '2h16m rounds to 2.3h (6-min increment)');
  assert.strictEqual(Number(r.entry.hours), 2.3, 'Entry hours match');
  assert.strictEqual(Number(r.entry.billed), 0, 'Entry is Unbilled');
  assert.strictEqual(r.entry.date, localDateOfMsAgo(136 * 60 * 1000), 'Entry date is the start date');
  assert.strictEqual(getLiveTimer(), null, 'Timer cleared after stop');
  assert.strictEqual(listTimeEntries({}).length, 1, 'One entry logged');
  console.log('✓ 2h16m -> 2.3h entry on start date, timer cleared');

  // ---------- 5. Under-threshold stop refused, timer kept ----------
  r = startLiveTimer({ client_id: clientA.id, description: 'Quick check' });
  assert.strictEqual(r.ok, true, 'New timer started');
  rewindStartedAt(2 * 60 * 1000);
  r = stopLiveTimer();
  assert.strictEqual(r.ok, false, '2 min at 6-min rounding should be refused');
  assert.strictEqual(r.tooShort, true, 'Reported as too short');
  assert.ok(getLiveTimer(), 'Timer is kept running after refusal');
  assert.strictEqual(listTimeEntries({}).length, 1, 'No extra entry created');
  discardLiveTimer();
  assert.strictEqual(getLiveTimer(), null, 'Discarded after refusal');
  console.log('✓ Under-threshold stop refused; timer preserved');

  // ---------- 6. Exact rounding (0) ----------
  r = saveTimerSettings({ roundingMinutes: 0 });
  assert.strictEqual(r.ok, true, 'Save 0 = exact');
  assert.strictEqual(getTimerSettings().roundingMinutes, 0, 'Rounding persisted');
  r = saveTimerSettings({ roundingMinutes: -3 });
  assert.strictEqual(r.ok, false, 'Negative rounding rejected');
  r = saveTimerSettings({ roundingMinutes: 61 });
  assert.strictEqual(r.ok, false, '>60 rounding rejected');
  saveTimerSettings({ roundingMinutes: 0 });

  r = startLiveTimer({ client_id: clientB.id, description: 'Exact session' });
  assert.strictEqual(r.ok, true, 'Started exact session');
  rewindStartedAt(200000); // 3m20s = 0.0556h
  r = stopLiveTimer();
  assert.strictEqual(r.ok, true, 'Exact mode should log any positive elapsed');
  assert.strictEqual(r.hours, 0.06, '3m20s rounds to 0.06h exact');
  assert.strictEqual(listTimeEntries({}).length, 2, 'Second entry created');
  console.log('✓ Exact rounding (0) logs raw elapsed; settings validated');

  // ---------- 7. Discard ----------
  r = startLiveTimer({ client_id: clientA.id, description: 'To discard' });
  assert.strictEqual(r.ok, true, 'Started entry to discard');
  r = discardLiveTimer();
  assert.strictEqual(r.ok, true, 'Discard should succeed');
  assert.strictEqual(getLiveTimer(), null, 'No timer after discard');
  assert.strictEqual(listTimeEntries({}).length, 2, 'No entry created by discard');
  r = discardLiveTimer();
  assert.strictEqual(r.ok, false, 'Discard with no timer fails cleanly');
  console.log('✓ Discard removes timer without logging');

  console.log('--- All Live Timer tests passed ---');
}

runTests()
  .catch((err) => {
    console.error('Live timer test failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });