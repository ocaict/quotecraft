// Automated Verification Suite for Expense Tracking & Dashboard Real Profit
const path = require('path');
const fs = require('fs');
const os = require('os');

// Isolated temp DB — MUST be set BEFORE require('../src/main/database')
const testDbPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'qc-expenses-')),
  'test.db'
);
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  getDb,
  closeDatabase,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  getExpensesSummary,
  getDashboardStats,
  EXPENSE_CATEGORIES,
} = require('../src/main/database');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✔ ${message}`);
}

async function runTests() {
  console.log('--- Starting Expense Tracking & Dashboard Profit Verification ---');

  await initializeDatabase();
  const db = getDb();

  // 1. Initial State Checks
  assert(Array.isArray(EXPENSE_CATEGORIES), 'EXPENSE_CATEGORIES is an array');
  assert(EXPENSE_CATEGORIES.includes('Software'), 'Includes Software category');
  assert(EXPENSE_CATEGORIES.includes('Supplies'), 'Includes Supplies category');
  assert(EXPENSE_CATEGORIES.includes('Travel'), 'Includes Travel category');
  assert(EXPENSE_CATEGORIES.includes('Other'), 'Includes Other category');

  const initialSummary = getExpensesSummary();
  assert(typeof initialSummary.totalExpenses === 'number', 'Summary returns numeric totalExpenses');
  assert(Array.isArray(initialSummary.byCategory), 'Summary returns byCategory array');

  // 2. Add Expenses across categories and dates
  const runId = Date.now();
  const runTag = `RUN-${runId}`;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  // Expense 1: Software ($120)
  const exp1Res = createExpense({
    amount: 120.00,
    date: todayStr,
    category: 'Software',
    notes: `Dev tool licenses ${runTag}`,
    currency: 'USD',
  });
  assert(exp1Res.ok, `Created expense 1 (Software): ID ${exp1Res.expense.id}`);
  const exp1Id = exp1Res.expense.id;

  // Expense 2: Supplies ($85.50)
  const exp2Res = createExpense({
    amount: 85.50,
    date: todayStr,
    category: 'Supplies',
    notes: `Printer ink & paper ${runTag}`,
    currency: 'USD',
  });
  assert(exp2Res.ok, `Created expense 2 (Supplies): ID ${exp2Res.expense.id}`);
  const exp2Id = exp2Res.expense.id;

  // Expense 3: Travel ($350.00)
  const exp3Res = createExpense({
    amount: 350.00,
    date: todayStr,
    category: 'Travel',
    notes: `Client onsite travel ${runTag}`,
    currency: 'USD',
  });
  assert(exp3Res.ok, `Created expense 3 (Travel): ID ${exp3Res.expense.id}`);

  // Expense 4: Historical Other ($60) in 2025-01
  const exp4Res = createExpense({
    amount: 60.00,
    date: '2025-01-15',
    category: 'Other',
    notes: `Postal service box ${runTag}`,
    currency: 'USD',
  });
  assert(exp4Res.ok, `Created expense 4 (Historical Other): ID ${exp4Res.expense.id}`);

  // Expense 5: Historical Custom Category ($200) in 2025-01
  const exp5Res = createExpense({
    amount: 200.00,
    date: '2025-01-20',
    category: 'Marketing',
    notes: `Search ads campaign ${runTag}`,
    currency: 'USD',
  });
  assert(exp5Res.ok, `Created expense 5 (Custom Category Marketing): ID ${exp5Res.expense.id}`);

  // Expense 6: Multi-Currency EUR 100 @ 1.10 rate (= $110.00 USD base)
  const exp6Res = createExpense({
    amount: 100.00,
    date: todayStr,
    category: 'Software',
    notes: `European server hosting (EUR 100) ${runTag}`,
    currency: 'EUR',
    exchange_rate: 1.10,
  });
  assert(exp6Res.ok, `Created expense 6 (EUR 100 @ 1.10 = $110 USD): ID ${exp6Res.expense.id}`);

  // 3. Test Edit Expense
  const updateRes = updateExpense(exp2Id, {
    amount: 95.50,
    date: todayStr,
    category: 'Supplies',
    notes: `Printer ink & premium paper (updated) ${runTag}`,
    currency: 'USD',
  });
  assert(updateRes.ok, 'Updated expense 2 successfully');
  const updatedExp2 = getExpense(exp2Id);
  assert(updatedExp2.amount === 95.50, `Expense 2 amount updated to $95.50 (got $${updatedExp2.amount})`);
  assert(updatedExp2.notes.includes('(updated)'), 'Expense 2 notes updated');

  // 4. Test Delete Expense
  const tempExp = createExpense({
    amount: 25.00,
    date: todayStr,
    category: 'Other',
    notes: `Temporary expense to delete ${runTag}`,
  });
  assert(tempExp.ok, `Created temp expense ID ${tempExp.expense.id}`);
  const deleteRes = deleteExpense(tempExp.expense.id);
  assert(deleteRes.ok && deleteRes.deleted, 'deleteExpense returned ok: true, deleted: true');
  assert(getExpense(tempExp.expense.id) === null, 'Deleted expense is no longer found in DB');

  // 5. Test Date Range Filtering (January 2025: should only find Exp 4 and Exp 5 for this runTag)
  const janSummary = getExpensesSummary({
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    search: runTag,
  });
  assert(janSummary.count === 2, `January 2025 has exactly 2 expenses for this run (got ${janSummary.count})`);
  assert(janSummary.totalExpenses === 260.00, `January 2025 total is $260.00 ($60+$200) (got $${janSummary.totalExpenses})`);

  // 6. Test Category Filtering
  const softwareSummary = getExpensesSummary({
    category: 'Software',
    startDate: todayStr,
    endDate: todayStr,
    search: runTag,
  });
  // Exp 1: $120 USD + Exp 6: 100 EUR * 1.10 = $110 USD => Total Software for today = $230.00
  assert(softwareSummary.count === 2, `Software category today has 2 expenses (got ${softwareSummary.count})`);
  assert(
    Math.abs(softwareSummary.totalExpenses - 230.00) < 0.01,
    `Software subtotal is $230.00 ($120 + $110 converted EUR) (got $${softwareSummary.totalExpenses})`
  );

  // 7. Verify Dashboard Stats & Profit Calculation
  const dashStats = getDashboardStats();
  console.log('Dashboard Stats:');
  console.log(`   Paid this month: $${dashStats.paid_month}`);
  console.log(`   Expenses this month: $${dashStats.expenses_month}`);
  console.log(`   Net profit this month: $${dashStats.profit_month}`);
  console.log(`   Paid this year: $${dashStats.paid_year}`);
  console.log(`   Expenses this year: $${dashStats.expenses_year}`);
  console.log(`   Net profit this year: $${dashStats.profit_year}`);

  assert(typeof dashStats.expenses_month === 'number', 'dashStats.expenses_month is a number');
  assert(typeof dashStats.expenses_year === 'number', 'dashStats.expenses_year is a number');
  assert(typeof dashStats.profit_month === 'number', 'dashStats.profit_month is a number');
  assert(typeof dashStats.profit_year === 'number', 'dashStats.profit_year is a number');

  // Verify mathematical reconciliation: Profit = Cash Paid - Expenses
  const expectedProfitMonth = Math.round((dashStats.paid_month - dashStats.expenses_month) * 100) / 100;
  assert(
    Math.abs(dashStats.profit_month - expectedProfitMonth) < 0.01,
    `Net profit this month ($${dashStats.profit_month}) strictly equals Paid ($${dashStats.paid_month}) minus Expenses ($${dashStats.expenses_month})`
  );

  const expectedProfitYear = Math.round((dashStats.paid_year - dashStats.expenses_year) * 100) / 100;
  assert(
    Math.abs(dashStats.profit_year - expectedProfitYear) < 0.01,
    `Net profit this year ($${dashStats.profit_year}) strictly equals Paid ($${dashStats.paid_year}) minus Expenses ($${dashStats.expenses_year})`
  );

  console.log('\n======================================================');
  console.log('🎉 ALL EXPENSE TRACKING & PROFIT TESTS PASSED! 🎉');
  console.log('======================================================\n');
}

runTests()
  .catch((err) => {
    console.error('Fatal error running tests:', err);
    process.exit(1);
  })
  .finally(() => {
    closeDatabase();
    fs.rmSync(path.dirname(testDbPath), { recursive: true, force: true });
  });
