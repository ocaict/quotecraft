const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Point to test db path
const testDbPath = path.join(__dirname, 'test-project-budget.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  getDb,
  closeDatabase,
  saveCompanyProfile,
  addClient,
  addProject,
  getProject,
  updateProject,
  getProjectOverview,
  createExpense,
  getExpense,
  bulkDeleteExpenses,
} = require('../src/main/database');

async function runTests() {
  console.log('--- Starting Project Budget & Bulk Expense Unit Tests (Phase G) ---');

  await initializeDatabase();
  console.log('✓ Database initialized with Migration 33');

  // 1. Verify Migration 33 schema column exists
  const projCols = new Set(getDb().exec('PRAGMA table_info(projects)')[0].values.map((v) => v[1]));
  assert(projCols.has('budget'), 'budget column must exist on projects table');
  console.log('✓ Migration 33 column verified on projects table');

  // Setup client and profile
  saveCompanyProfile({
    company_name: 'Agency Studio',
    default_currency: 'USD',
  });

  const client = addClient({
    name: 'Tech Ventures',
    email: 'contact@techventures.io',
  });
  assert(client && client.id, 'Client should be created');
  const clientId = client.id;

  // 2. Create project with budget
  const projRes = addProject({
    client_id: clientId,
    name: 'Website Redesign',
    start_date: '2026-01-05',
    status: 'active',
    budget: 5000.0,
    hourly_rate: 75.0,
  });
  assert(projRes && projRes.ok, 'Project should be created');
  const proj1 = projRes.project;
  assert.strictEqual(Number(proj1.budget), 5000, 'Project budget should be 5000');
  console.log('✓ Project created with budget: $5,000');

  // 3. Update project budget
  const updatedRes = updateProject(proj1.id, {
    client_id: clientId,
    name: 'Website Redesign v2',
    start_date: '2026-01-05',
    status: 'active',
    budget: 7500.5,
    hourly_rate: 85.0,
  });
  assert(updatedRes && updatedRes.ok, 'Project should be updated');
  const fetchedProj = getProject(proj1.id);
  assert.strictEqual(Number(fetchedProj.budget), 7500.5, 'Fetched project budget should be 7500.5');
  console.log('✓ Project budget updated to: $7,500.50');

  // 4. Add expenses to project
  const exp1Res = createExpense({
    date: '2026-09-10',
    category: 'Software',
    amount: 300,
    client_id: clientId,
    project_id: proj1.id,
    billable: 1,
    notes: 'Hosting and cloud setup',
  });
  assert(exp1Res && exp1Res.ok, 'Expense 1 created');
  const exp1 = exp1Res.expense;

  const exp2Res = createExpense({
    date: '2026-09-12',
    category: 'Travel',
    amount: 450,
    client_id: clientId,
    project_id: proj1.id,
    billable: 0,
    notes: 'Client onsite meeting',
  });
  assert(exp2Res && exp2Res.ok, 'Expense 2 created');
  const exp2 = exp2Res.expense;

  // 5. Verify getProjectOverview returns stats.budget and stats.totalExpenses
  const overview = getProjectOverview(proj1.id);
  assert(overview, 'Project overview should exist');
  assert.strictEqual(Number(overview.stats.budget), 7500.5, 'Overview stats.budget must match project budget');
  assert.strictEqual(Number(overview.stats.totalExpenses), 750, 'Overview stats.totalExpenses must equal 300 + 450 = 750');
  console.log(`✓ Project overview stats verified: budget=${overview.stats.budget}, totalExpenses=${overview.stats.totalExpenses}`);

  // 6. Test bulkDeleteExpenses
  // Create another expense
  const exp3Res = createExpense({
    date: '2026-09-15',
    category: 'Supplies',
    amount: 120,
    client_id: clientId,
    project_id: proj1.id,
    billable: 0,
    notes: 'Stationery',
  });
  assert(exp3Res && exp3Res.ok, 'Expense 3 created');
  const exp3 = exp3Res.expense;

  // Delete exp1 and exp2 via bulkDeleteExpenses
  const bulkRes = bulkDeleteExpenses([exp1.id, exp2.id]);
  assert.strictEqual(bulkRes.deleted, 2, 'Should delete 2 expenses');
  assert.strictEqual(bulkRes.skipped, 0, 'Should skip 0 expenses');
  assert.strictEqual(getExpense(exp1.id), null, 'Expense 1 must be deleted');
  assert.strictEqual(getExpense(exp2.id), null, 'Expense 2 must be deleted');
  assert(getExpense(exp3.id) !== null, 'Expense 3 must still exist');
  console.log('✓ Bulk delete deleted unbilled expenses correctly');

  // 7. Test bulkDeleteExpenses skips billed expenses
  // Mark exp3 as billed manually in DB
  getDb().run('UPDATE expenses SET billed = 1, invoice_id = 999 WHERE id = ?', [exp3.id]);
  const exp3Billed = getExpense(exp3.id);
  assert(exp3Billed.billed === 1, 'Expense 3 should be marked as billed');

  const exp4Res = createExpense({
    date: '2026-09-16',
    category: 'Other',
    amount: 50,
  });
  assert(exp4Res && exp4Res.ok, 'Expense 4 created');
  const exp4 = exp4Res.expense;

  const skipRes = bulkDeleteExpenses([exp3.id, exp4.id]);
  assert.strictEqual(skipRes.deleted, 1, 'Should delete 1 unbilled expense');
  assert.strictEqual(skipRes.skipped, 1, 'Should skip 1 billed expense');
  assert(getExpense(exp3.id) !== null, 'Billed expense must NOT be deleted');
  assert.strictEqual(getExpense(exp4.id), null, 'Unbilled expense must be deleted');
  console.log('✓ Bulk delete correctly skipped billed expense and deleted unbilled expense');

  // 8. Test bulkDeleteExpenses with empty or invalid input
  const emptyRes = bulkDeleteExpenses([]);
  assert.strictEqual(emptyRes.deleted, 0);
  assert.strictEqual(emptyRes.skipped, 0);

  const nullRes = bulkDeleteExpenses(null);
  assert.strictEqual(nullRes.deleted, 0);
  assert.strictEqual(nullRes.skipped, 0);
  console.log('✓ Bulk delete handles empty / invalid inputs gracefully');

  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('--- ALL PHASE G TESTS PASSED ---');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
