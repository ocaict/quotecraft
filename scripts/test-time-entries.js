const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Isolated temp DB — MUST be set BEFORE require('../src/main/database')
const testDbPath = path.join(__dirname, 'test-time-entries.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  saveCompanyProfile,
  getCompanyProfile,
  addClient,
  addProject,
  createTimeEntry,
  getTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  listTimeEntries,
  getTimeEntriesSummary,
  resolveTimeEntryRate,
  markTimeEntriesBilled,
} = require('../src/main/database');

async function runTests() {
  console.log('--- Starting Time Entries Tests ---');
  await initializeDatabase();
  console.log('✓ Database initialized (time_entries table)');

  // ---------- Fixtures ----------
  const clientA = addClient({ name: 'Acme Corp', email: 'billing@acme.example', status: 'active' });
  assert.ok(clientA && clientA.id, 'Client A should be created');
  const clientB = addClient({ name: 'Globex', status: 'active', default_hourly_rate: '80' });
  assert.ok(clientB && clientB.id, 'Client B should be created');
  assert.strictEqual(Number(clientB.default_hourly_rate), 80, 'Client B rate should snapshot 80');
  const projectA = addProject({ client_id: clientA.id, name: 'Website Redesign', status: 'active', hourly_rate: '85', start_date: '2026-09-01' });
  assert.strictEqual(projectA.ok, true, 'Project A should be created');
  const projectAId = projectA.project.id;
  const projectB = addProject({ client_id: clientB.id, name: 'SEO Sprint', status: 'active', start_date: '2026-09-01' });
  assert.strictEqual(projectB.ok, true, 'Project B should be created');
  const projectBId = projectB.project.id;
  console.log('✓ Fixtures created');

  // ---------- 1. Rate resolution fallback chain ----------
  let res = resolveTimeEntryRate(clientB.id, projectBId);
  assert.strictEqual(res.source, 'client', 'Client default should win when project has none');
  assert.strictEqual(res.hourly_rate, 80, 'Client default rate should be used');

  res = resolveTimeEntryRate(clientA.id, projectAId);
  assert.strictEqual(res.source, 'project', 'Project rate should win');
  assert.strictEqual(res.hourly_rate, 85, 'Project rate should be used');

  res = resolveTimeEntryRate(clientA.id, null);
  assert.strictEqual(res.source, null, 'No client/project rate -> no company default yet');
  assert.strictEqual(res.hourly_rate, null, 'No rate should resolve to null');

  saveCompanyProfile({ business_name: 'Freelancer Co', default_hourly_rate: '75' });
  res = resolveTimeEntryRate(clientA.id, null);
  assert.strictEqual(res.source, 'company', 'Company default should be the last resort');
  assert.strictEqual(res.hourly_rate, 75, 'Company default rate should be used');
  console.log('✓ Rate fallback: project > client > company');

  // Blank rate on create should snapshot the resolved value
  const snap = createTimeEntry({ client_id: clientA.id, project_id: projectAId, date: '2026-09-10', description: 'Design call', hours: '1.5', hourly_rate: '' });
  assert.strictEqual(snap.ok, true, 'Create with blank rate should succeed');
  assert.strictEqual(Number(snap.entry.hourly_rate), 85, 'Blank rate should snapshot project rate 85');
  assert.strictEqual(Number(snap.entry.amount), 127.5, 'Amount should be hours * rate (1.5 x 85)');
  const snapId = snap.entry.id;
  console.log('✓ Blank rate snapshots resolved project rate; amount computed');

  // ---------- 2. Validation ----------
  let r = createTimeEntry({ project_id: projectAId, date: '2026-09-10', description: 'No client', hours: '1' });
  assert.strictEqual(r.ok, false, 'Missing client should be rejected');
  assert.ok(r.errors.client_id, 'client_id error expected');

  r = createTimeEntry({ client_id: clientA.id, date: 'bad-date', description: 'Bad date', hours: '1' });
  assert.strictEqual(r.ok, false, 'Invalid date should be rejected');
  assert.ok(r.errors.date, 'date error expected');

  r = createTimeEntry({ client_id: clientA.id, date: '2026-09-10', description: '', hours: '1' });
  assert.strictEqual(r.ok, false, 'Missing description should be rejected');
  assert.ok(r.errors.description, 'description error expected');

  r = createTimeEntry({ client_id: clientA.id, date: '2026-09-10', description: 'Zero hours', hours: '0' });
  assert.strictEqual(r.ok, false, 'Zero hours should be rejected');
  assert.ok(r.errors.hours, 'hours error expected');

  r = createTimeEntry({ client_id: clientA.id, date: '2026-09-10', description: 'Too precise', hours: '1.555' });
  assert.strictEqual(r.ok, false, 'Hours with >2 decimals should be rejected');
  assert.ok(r.errors.hours, 'hours error expected');

  r = createTimeEntry({ client_id: clientA.id, date: '2026-09-10', description: 'Negative rate', hours: '1', hourly_rate: '-5' });
  assert.strictEqual(r.ok, false, 'Negative rate should be rejected');
  assert.ok(r.errors.hourly_rate, 'hourly_rate error expected');

  r = createTimeEntry({ client_id: clientA.id, date: '2026-09-10', description: 'Precise rate', hours: '1', hourly_rate: '85.999' });
  assert.strictEqual(r.ok, false, 'Rate with >2 decimals should be rejected');
  assert.ok(r.errors.hourly_rate, 'hourly_rate error expected');
  console.log('✓ Validation: client, date, description, hours, rate');

  // ---------- 3. Cross-client project rejected ----------
  r = createTimeEntry({ client_id: clientB.id, project_id: projectAId, date: '2026-09-10', description: 'Wrong project', hours: '1' });
  assert.strictEqual(r.ok, false, 'Project from another client should be rejected');
  assert.ok(r.errors.project_id, 'project_id error expected');
  console.log('✓ Cross-client project rejected');

  // ---------- 4. Company default used when nothing set ----------
  r = createTimeEntry({ client_id: clientA.id, date: '2026-09-11', description: 'Company rate fallback', hours: '2', hourly_rate: '' });
  assert.strictEqual(r.ok, true, 'Company fallback entry should be created');
  assert.strictEqual(Number(r.entry.hourly_rate), 75, 'Should use company default 75');
  assert.strictEqual(Number(r.entry.amount), 150, 'Amount 2 x 75');
  console.log('✓ Company default applied when no client/project rate');

  // ---------- 5. Update ----------
  r = updateTimeEntry(snapId, {
    client_id: clientA.id, project_id: projectAId, date: '2026-09-10', description: 'Design call (final)', hours: '2.25', hourly_rate: '90',
  });
  assert.strictEqual(r.ok, true, 'Update should succeed');
  assert.strictEqual(Number(r.entry.hours), 2.25, 'Hours updated');
  assert.strictEqual(Number(r.entry.hourly_rate), 90, 'Rate updated to manual value');
  assert.strictEqual(Number(r.entry.amount), 202.5, 'Amount updated to 2.25 x 90');

  // Blank rate on edit keeps the stored snapshot
  r = updateTimeEntry(snapId, {
    client_id: clientA.id, project_id: projectAId, date: '2026-09-10', description: 'Design call (final)', hours: '2', hourly_rate: '',
  });
  assert.strictEqual(r.ok, true, 'Update with blank rate should succeed');
  assert.strictEqual(Number(r.entry.hourly_rate), 90, 'Blank rate should keep stored snapshot');
  console.log('✓ Update applies new rate; blank keeps stored snapshot');

  // ---------- 6. Billed lock ----------
  const billedIds = [];
  const billTargets = listTimeEntries({ search: 'Company rate fallback' });
  billedIds.push(billTargets[0].id);

  let m = markTimeEntriesBilled(billedIds);
  assert.strictEqual(m.ok, true, 'markTimeEntriesBilled should succeed');
  assert.strictEqual(m.count, 1, 'One entry marked');

  const billedEnt = getTimeEntry(billedIds[0]);
  assert.strictEqual(Number(billedEnt.billed), 1, 'Entry should be billed');

  r = updateTimeEntry(billedIds[0], { client_id: clientA.id, date: '2026-09-11', description: 'Trying to edit', hours: '3', hourly_rate: '' });
  assert.strictEqual(r.ok, false, 'Billed entry update should be blocked');
  assert.strictEqual(r.locked, true, 'Should report locked');

  r = deleteTimeEntry(billedIds[0]);
  assert.strictEqual(r.ok, false, 'Billed entry delete should be blocked');
  assert.strictEqual(r.locked, true, 'Should report locked');
  console.log('✓ Billed entries immutable (update/delete blocked)');

  // ---------- 7. Delete unbilled ----------
  r = deleteTimeEntry(snapId);
  assert.strictEqual(r.ok, true, 'Unbilled entry should delete');
  assert.strictEqual(getTimeEntry(snapId), null, 'Entry should be gone');
  console.log('✓ Delete unbilled works');

  // ---------- 8. Summary math ----------
  // Entries now: billed 2h @75 (from fixture), plus project-fallback snapshot deleted.
  // Add a couple more so billed/unbilled split is non-trivial.
  createTimeEntry({ client_id: clientB.id, project_id: projectBId, date: '2026-09-12', description: 'Keyword research', hours: '3', hourly_rate: '' });
  const s = getTimeEntriesSummary({});
  assert.strictEqual(s.count, 2, 'Summary should count 2 remaining entries');
  assert.strictEqual(s.totalHours, 5, '2h billed + 3h unbilled = 5h');
  assert.strictEqual(s.totalAmount, 150 + 240, '150 (2x75) + 240 (3x80)');
  assert.strictEqual(s.billedHours, 2, 'Billed hours = 2');
  assert.strictEqual(s.unbilledHours, 3, 'Unbilled hours = 3');
  assert.ok(s.baseCurrency, 'Summary should report base currency');
  console.log('✓ Summary math (count, hours, amount, billed/unbilled split)');

  // ---------- 9. Filters ----------
  let entries = listTimeEntries({ client_id: clientB.id });
  assert.strictEqual(entries.length, 1, 'Client filter should match only client B entries');
  entries = listTimeEntries({ project_id: projectBId });
  assert.strictEqual(entries.length, 1, 'Project filter should match SEO Sprint');
  entries = listTimeEntries({ date_from: '2026-09-12', date_to: '2026-09-30' });
  assert.strictEqual(entries.length, 1, 'Date range should match Sept 12 entry');
  entries = listTimeEntries({ billed: 'unbilled' });
  assert.strictEqual(entries.length, 1, 'Unbilled filter should match unbilled only');
  entries = listTimeEntries({ billed: 'billed' });
  assert.strictEqual(entries.length, 1, 'Billed filter should match billed only');
  entries = listTimeEntries({ search: 'Keyword' });
  assert.strictEqual(entries.length, 1, 'Search should match description');
  const combo = listTimeEntries({ client_id: clientB.id, billed: 'billed' });
  assert.strictEqual(combo.length, 0, 'Combined filters should intersect');
  console.log('✓ Filters: client, project, dates, billed, search');

  console.log('--- All Time Entries tests passed ---');
}

runTests()
  .catch((err) => {
    console.error('Time entry test failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });