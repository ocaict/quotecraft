// Automated Verification Suite for Profit Reporting & Profit & Loss Report
const {
  initializeDatabase,
  getDb,
  getProfitLossReport,
  getDashboardStats,
  addClient,
  addPayment,
  createExpense,
  deleteExpense,
} = require('../src/main/database');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✔ ${message}`);
}

async function runTests() {
  console.log('--- Starting Profit Reporting & Profit & Loss Verification ---');

  await initializeDatabase();
  const db = getDb();

  // 1. Initial State Checks
  const initialCashReport = getProfitLossReport({ basis: 'cash' });
  assert(initialCashReport.basis === 'cash', 'Default/Cash basis report has basis === "cash"');
  assert(typeof initialCashReport.totalIncome === 'number', 'totalIncome is numeric');
  assert(typeof initialCashReport.totalExpenses === 'number', 'totalExpenses is numeric');
  assert(typeof initialCashReport.netProfit === 'number', 'netProfit is numeric');
  assert(typeof initialCashReport.variance === 'number', 'variance is numeric');
  assert(Array.isArray(initialCashReport.months), 'months is an array');

  const initialAccrualReport = getProfitLossReport({ basis: 'accrual' });
  assert(initialAccrualReport.basis === 'accrual', 'Accrual report has basis === "accrual"');

  // 2. Setup a controlled test dataset with realistic mix across months:
  // Using a distinctive test year (e.g. 2029) to avoid colliding with any live data
  const testYear = 2029;
  const runTag = `PLTEST-${Date.now()}`;

  // Create a test client
  const client = addClient({
    name: `Acme Corp ${runTag}`,
    email: `acme-${Date.now()}@example.com`,
  });
  assert(client && client.id, `Created test client ID ${client.id}`);
  const clientId = client.id;

  // Helper to insert invoice directly
  function insertTestInvoice({ number, dateCreated, dateDue, subtotal, total, currency = 'USD', exchangeRate = 1.0 }) {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO invoices (invoice_number, client_id, status, subtotal, tax_amount, total, currency, exchange_rate, date_created, date_due, amount_paid, balance_due, created_at, updated_at)
       VALUES (?, ?, 'sent', ?, 0, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [number, clientId, subtotal, total, currency, exchangeRate, dateCreated, dateDue, total, now, now]
    );
    const idRes = db.exec(`SELECT last_insert_rowid()`);
    return idRes[0].values[0][0];
  }

  // Month 1 (Jan 2029):
  // Inv 1: $1,000 created on 2029-01-10, fully paid on 2029-01-15
  // Exp 1: $400 (Software) on 2029-01-20
  const inv1Id = insertTestInvoice({
    number: `INV-${runTag}-01`,
    dateCreated: `${testYear}-01-10`,
    dateDue: `${testYear}-01-24`,
    subtotal: 1000,
    total: 1000,
  });
  const pay1Res = addPayment(inv1Id, {
    amount: 1000,
    payment_date: `${testYear}-01-15`,
    payment_method: 'Bank Transfer',
  });
  assert(pay1Res.ok, 'Recorded full payment for Inv 1 in Jan');

  const exp1Res = createExpense({
    amount: 400,
    date: `${testYear}-01-20`,
    category: 'Software',
    notes: `Dev cloud tools ${runTag}`,
    currency: 'USD',
  });
  assert(exp1Res.ok, 'Created expense 1 in Jan ($400 Software)');

  // Month 2 (Feb 2029):
  // Inv 2: $2,500 created on 2029-02-05
  // Payment 2: $1,000 partial payment on 2029-02-12 ($1,500 remains unpaid)
  // Exp 2: $800 (Supplies) on 2029-02-18
  const inv2Id = insertTestInvoice({
    number: `INV-${runTag}-02`,
    dateCreated: `${testYear}-02-05`,
    dateDue: `${testYear}-02-19`,
    subtotal: 2500,
    total: 2500,
  });
  const pay2Res = addPayment(inv2Id, {
    amount: 1000,
    payment_date: `${testYear}-02-12`,
    payment_method: 'Card',
  });
  assert(pay2Res.ok, 'Recorded partial payment ($1,000) for Inv 2 in Feb');

  const exp2Res = createExpense({
    amount: 800,
    date: `${testYear}-02-18`,
    category: 'Supplies',
    notes: `Office equipment ${runTag}`,
    currency: 'USD',
  });
  assert(exp2Res.ok, 'Created expense 2 in Feb ($800 Supplies)');

  // Month 3 (Mar 2029):
  // Inv 3: $3,000 created on 2029-03-01 ($0 paid - completely unpaid!)
  // Payment 3: $1,500 recorded on 2029-03-10 for Inv 2 (cross-month payment!)
  // Exp 3: $1,200 (Travel) on 2029-03-15
  const inv3Id = insertTestInvoice({
    number: `INV-${runTag}-03`,
    dateCreated: `${testYear}-03-01`,
    dateDue: `${testYear}-03-15`,
    subtotal: 3000,
    total: 3000,
  });
  const pay3Res = addPayment(inv2Id, {
    amount: 1500,
    payment_date: `${testYear}-03-10`,
    payment_method: 'Bank Transfer',
  });
  assert(pay3Res.ok, 'Recorded remaining balance ($1,500) for Inv 2 in Mar');

  const exp3Res = createExpense({
    amount: 1200,
    date: `${testYear}-03-15`,
    category: 'Travel',
    notes: `Client conference flight ${runTag}`,
    currency: 'USD',
  });
  assert(exp3Res.ok, 'Created expense 3 in Mar ($1,200 Travel)');

  // Month 4 (Apr 2029):
  // Multi-currency test:
  // Inv 4: EUR 1,000 at exchange_rate 1.10 = $1,100 USD base, created 2029-04-05, paid 2029-04-10
  // Exp 4: EUR 300 at exchange_rate 1.10 = $330 USD base on 2029-04-15
  const inv4Id = insertTestInvoice({
    number: `INV-${runTag}-04`,
    dateCreated: `${testYear}-04-05`,
    dateDue: `${testYear}-04-19`,
    subtotal: 1000,
    total: 1000,
    currency: 'EUR',
    exchangeRate: 1.10,
  });
  const pay4Res = addPayment(inv4Id, {
    amount: 1000,
    payment_date: `${testYear}-04-10`,
    payment_method: 'Other',
  });
  assert(pay4Res.ok, 'Recorded payment for multi-currency Inv 4 in Apr');

  const exp4Res = createExpense({
    amount: 300,
    date: `${testYear}-04-15`,
    category: 'Other',
    notes: `European server hosting ${runTag}`,
    currency: 'EUR',
    exchange_rate: 1.10,
  });
  assert(exp4Res.ok, 'Created multi-currency expense 4 in Apr');

  try {
    // 3. Test Cash Basis Report for 2029-01 through 2029-04
    console.log('\n--- Testing Cash Basis (Actually Paid) ---');
    const cashReport = getProfitLossReport({
      startDate: `${testYear}-01-01`,
      endDate: `${testYear}-04-30`,
      basis: 'cash',
    });

    assert(cashReport.basis === 'cash', 'Report confirms cash basis');
    assert(cashReport.months.length === 4, `Report returned exactly 4 months (got ${cashReport.months.length})`);

    const janCash = cashReport.months.find((m) => m.month === `${testYear}-01`);
    const febCash = cashReport.months.find((m) => m.month === `${testYear}-02`);
    const marCash = cashReport.months.find((m) => m.month === `${testYear}-03`);
    const aprCash = cashReport.months.find((m) => m.month === `${testYear}-04`);

    // Verify Jan Cash:
    // Invoiced: $1,000, Paid: $1,000, Exp: $400, Cash Profit: +$600, Running: +$600
    assert(janCash.invoiced === 1000, `Jan Invoiced is 1000 (got ${janCash.invoiced})`);
    assert(janCash.paid === 1000, `Jan Paid is 1000 (got ${janCash.paid})`);
    assert(janCash.expenses === 400, `Jan Expenses is 400 (got ${janCash.expenses})`);
    assert(janCash.cashProfit === 600, `Jan Cash Profit is 600 (got ${janCash.cashProfit})`);
    assert(janCash.activeRunningProfit === 600, `Jan Running Cash Profit is 600 (got ${janCash.activeRunningProfit})`);

    // Verify Feb Cash:
    // Invoiced: $2,500, Paid: $1,000, Exp: $800, Cash Profit: +$200, Running: +$800
    assert(febCash.invoiced === 2500, `Feb Invoiced is 2500 (got ${febCash.invoiced})`);
    assert(febCash.paid === 1000, `Feb Paid is 1000 (got ${febCash.paid})`);
    assert(febCash.expenses === 800, `Feb Expenses is 800 (got ${febCash.expenses})`);
    assert(febCash.cashProfit === 200, `Feb Cash Profit is 200 (got ${febCash.cashProfit})`);
    assert(febCash.activeRunningProfit === 800, `Feb Running Cash Profit is 800 (got ${febCash.activeRunningProfit})`);

    // Verify Mar Cash:
    // Invoiced: $3,000 (unpaid), Paid: $1,500 (from Feb!), Exp: $1,200, Cash Profit: +$300, Running: +$1,100
    assert(marCash.invoiced === 3000, `Mar Invoiced is 3000 (got ${marCash.invoiced})`);
    assert(marCash.paid === 1500, `Mar Paid is 1500 (got ${marCash.paid})`);
    assert(marCash.expenses === 1200, `Mar Expenses is 1200 (got ${marCash.expenses})`);
    assert(marCash.cashProfit === 300, `Mar Cash Profit is 300 (got ${marCash.cashProfit})`);
    assert(marCash.activeRunningProfit === 1100, `Mar Running Cash Profit is 1100 (got ${marCash.activeRunningProfit})`);

    // Verify Apr Cash:
    // Invoiced: €1000 * 1.10 = $1,100, Paid: €1000 * 1.10 = $1,100, Exp: €300 * 1.10 = $330, Cash Profit: +$770, Running: +$1,870
    assert(aprCash.invoiced === 1100, `Apr Invoiced is 1100 (got ${aprCash.invoiced})`);
    assert(aprCash.paid === 1100, `Apr Paid is 1100 (got ${aprCash.paid})`);
    assert(aprCash.expenses === 330, `Apr Expenses is 330 (got ${aprCash.expenses})`);
    assert(aprCash.cashProfit === 770, `Apr Cash Profit is 770 (got ${aprCash.cashProfit})`);
    assert(aprCash.activeRunningProfit === 1870, `Apr Running Cash Profit is 1870 (got ${aprCash.activeRunningProfit})`);

    // Cash Period Totals:
    // Total Invoiced: 1000 + 2500 + 3000 + 1100 = $7,600
    // Total Paid: 1000 + 1000 + 1500 + 1100 = $4,600
    // Total Expenses: 400 + 800 + 1200 + 330 = $2,730
    // Net Profit Cash: 4600 - 2730 = $1,870
    // Variance: 7600 - 4600 = $3,000 (unpaid Invoice 3)
    assert(cashReport.totalInvoiced === 7600, `Period Total Invoiced is 7600 (got ${cashReport.totalInvoiced})`);
    assert(cashReport.totalPaid === 4600, `Period Total Paid is 4600 (got ${cashReport.totalPaid})`);
    assert(cashReport.totalExpenses === 2730, `Period Total Expenses is 2730 (got ${cashReport.totalExpenses})`);
    assert(cashReport.totalIncome === 4600, `Cash Total Income uses paid (got ${cashReport.totalIncome})`);
    assert(cashReport.netProfit === 1870, `Cash Net Profit is 1870 (got ${cashReport.netProfit})`);
    assert(cashReport.variance === 3000, `Variance correctly identifies $3,000 uncollected revenue (got ${cashReport.variance})`);

    // 4. Test Accrual Basis Report for 2029-01 through 2029-04
    console.log('\n--- Testing Accrual Basis (Invoiced) ---');
    const accrualReport = getProfitLossReport({
      startDate: `${testYear}-01-01`,
      endDate: `${testYear}-04-30`,
      basis: 'accrual',
    });

    assert(accrualReport.basis === 'accrual', 'Report confirms accrual basis');
    assert(accrualReport.totalIncome === 7600, `Accrual Total Income uses invoiced (got ${accrualReport.totalIncome})`);
    assert(accrualReport.netProfit === 4870, `Accrual Net Profit is 7600 - 2730 = 4870 (got ${accrualReport.netProfit})`);

    const janAcc = accrualReport.months.find((m) => m.month === `${testYear}-01`);
    const febAcc = accrualReport.months.find((m) => m.month === `${testYear}-02`);
    const marAcc = accrualReport.months.find((m) => m.month === `${testYear}-03`);
    const aprAcc = accrualReport.months.find((m) => m.month === `${testYear}-04`);

    assert(janAcc.accrualProfit === 600, `Jan Accrual Profit is 600 (got ${janAcc.accrualProfit})`);
    assert(janAcc.activeRunningProfit === 600, `Jan Running Accrual Profit is 600 (got ${janAcc.activeRunningProfit})`);

    assert(febAcc.accrualProfit === 1700, `Feb Accrual Profit is 2500 - 800 = 1700 (got ${febAcc.accrualProfit})`);
    assert(febAcc.activeRunningProfit === 2300, `Feb Running Accrual Profit is 600 + 1700 = 2300 (got ${febAcc.activeRunningProfit})`);

    assert(marAcc.accrualProfit === 1800, `Mar Accrual Profit is 3000 - 1200 = 1800 (got ${marAcc.accrualProfit})`);
    assert(marAcc.activeRunningProfit === 4100, `Mar Running Accrual Profit is 2300 + 1800 = 4100 (got ${marAcc.activeRunningProfit})`);

    assert(aprAcc.accrualProfit === 770, `Apr Accrual Profit is 1100 - 330 = 770 (got ${aprAcc.accrualProfit})`);
    assert(aprAcc.activeRunningProfit === 4870, `Apr Running Accrual Profit is 4100 + 770 = 4870 (got ${aprAcc.activeRunningProfit})`);

    console.log('\n--- Comparing Cash vs Accrual Insights ---');
    console.log(`Cash Net Profit:    $${cashReport.netProfit} (actual money collected minus expenses)`);
    console.log(`Accrual Net Profit: $${accrualReport.netProfit} (total billed to clients minus expenses)`);
    console.log(`Variance:           $${cashReport.variance} (pending collection on Inv 3)`);
    assert(
      accrualReport.netProfit - cashReport.netProfit === cashReport.variance,
      'Mathematical equality: Accrual Profit - Cash Profit === Invoiced vs Paid Variance'
    );

  } finally {
    // Clean up test data
    console.log('\n--- Cleaning up test records ---');
    try {
      db.run(`DELETE FROM payments WHERE invoice_id IN (?, ?, ?, ?)`, [inv1Id, inv2Id, inv3Id, inv4Id]);
      db.run(`DELETE FROM invoices WHERE id IN (?, ?, ?, ?)`, [inv1Id, inv2Id, inv3Id, inv4Id]);
      db.run(`DELETE FROM clients WHERE id = ?`, [clientId]);
      deleteExpense(exp1Res.expense.id);
      deleteExpense(exp2Res.expense.id);
      deleteExpense(exp3Res.expense.id);
      deleteExpense(exp4Res.expense.id);
      console.log('✔ Cleanup complete.');
    } catch (cleanupErr) {
      console.warn('Warning during cleanup:', cleanupErr.message);
    }
  }

  console.log('\n🎉 ALL PROFIT REPORTING TESTS PASSED SUCCESSFULLY! 🎉');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
