const {
  initializeDatabase,
  getDb,
  saveToDisk,
  getRevenueReport,
  addClient,
  addPayment,
} = require('../src/main/database');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✔ ${message}`);
}

async function runTests() {
  console.log('--- Starting Revenue Report Verification ---');

  await initializeDatabase();
  const db = getDb();

  const testYear = 2029;
  const runTag = `RRTEST-${Date.now()}`;

  // Clean any leftover 2029 test rows from past runs
  db.run(`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE date_created LIKE '${testYear}%')`);
  db.run(`DELETE FROM invoices WHERE date_created LIKE '${testYear}%'`);
  db.run(`DELETE FROM clients WHERE email LIKE 'revtest-%@example.com'`);
  saveToDisk();

  // 1. Create a test client
  const client = addClient({
    name: `Revenue Test Client ${runTag}`,
    email: `revtest-${Date.now()}@example.com`,
  });
  assert(client && client.id, `Created test client with ID ${client.id}`);
  const clientId = client.id;

  // Track created IDs for cleanup
  const createdInvoiceIds = [];

  function insertTestInvoice({ number, status = 'sent', dateCreated, dateDue, subtotal, total, currency = 'USD', exchangeRate = 1.0 }) {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO invoices (invoice_number, client_id, status, subtotal, tax_amount, total, currency, exchange_rate, date_created, date_due, amount_paid, balance_due, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [number, clientId, status, subtotal, total, currency, exchangeRate, dateCreated, dateDue, total, now, now]
    );
    const idRes = db.exec(`SELECT last_insert_rowid()`);
    const id = idRes[0].values[0][0];
    createdInvoiceIds.push(id);
    return id;
  }

  // 2. Seed realistic spread of invoices across months in 2029:
  // Inv 1: Jan 15, 2029 — USD $1,000, exchangeRate 1.0. Fully paid Jan 20 ($1,000).
  const inv1 = insertTestInvoice({
    number: `INV-${runTag}-01`,
    dateCreated: `${testYear}-01-15`,
    dateDue: `${testYear}-01-30`,
    subtotal: 1000,
    total: 1000,
  });
  addPayment(inv1, {
    amount: 1000,
    payment_date: `${testYear}-01-20`,
    payment_method: 'bank_transfer',
  });

  // Inv 2: Feb 10, 2029 — USD $2,000, exchangeRate 1.0.
  // Partial pay 1: Feb 15 ($500)
  // Partial pay 2: Mar 05 ($1,000)
  // Unpaid balance: $500
  const inv2 = insertTestInvoice({
    number: `INV-${runTag}-02`,
    dateCreated: `${testYear}-02-10`,
    dateDue: `${testYear}-02-25`,
    subtotal: 2000,
    total: 2000,
  });
  addPayment(inv2, {
    amount: 500,
    payment_date: `${testYear}-02-15`,
    payment_method: 'credit_card',
  });
  addPayment(inv2, {
    amount: 1000,
    payment_date: `${testYear}-03-05`,
    payment_method: 'bank_transfer',
  });

  // Inv 3: Mar 12, 2029 — Foreign currency: EUR 1,000, exchangeRate 1.10 = $1,100 USD. Unpaid.
  const inv3 = insertTestInvoice({
    number: `INV-${runTag}-03`,
    dateCreated: `${testYear}-03-12`,
    dateDue: `${testYear}-03-26`,
    currency: 'EUR',
    exchangeRate: 1.10,
    subtotal: 1000,
    total: 1000,
  });

  // Inv 4: Mar 25, 2029 — Foreign currency: GBP 500, exchangeRate 1.30 = $650 USD.
  // Fully paid Mar 28: GBP 500 (= $650 USD).
  const inv4 = insertTestInvoice({
    number: `INV-${runTag}-04`,
    dateCreated: `${testYear}-03-25`,
    dateDue: `${testYear}-04-10`,
    currency: 'GBP',
    exchangeRate: 1.30,
    subtotal: 500,
    total: 500,
  });
  addPayment(inv4, {
    amount: 500,
    payment_date: `${testYear}-03-28`,
    payment_method: 'stripe',
  });

  // Inv 5: Apr 05, 2029 — DRAFT invoice USD $5,000. Must be EXCLUDED from revenue totals.
  const inv5 = insertTestInvoice({
    number: `INV-${runTag}-05`,
    status: 'draft',
    dateCreated: `${testYear}-04-05`,
    dateDue: `${testYear}-04-20`,
    subtotal: 5000,
    total: 5000,
  });

  // Inv 6: May 02, 2029 — USD $800, exchangeRate 1.0. Fully paid May 10 ($800).
  const inv6 = insertTestInvoice({
    number: `INV-${runTag}-06`,
    dateCreated: `${testYear}-05-02`,
    dateDue: `${testYear}-05-16`,
    subtotal: 800,
    total: 800,
  });
  addPayment(inv6, {
    amount: 800,
    payment_date: `${testYear}-05-10`,
    payment_method: 'cash',
  });

  try {
    // 3. Test Monthly Breakdown (Jan - May 2029)
    console.log('\nTesting Monthly Period:');
    const monthlyReport = getRevenueReport({
      startDate: `${testYear}-01-01`,
      endDate: `${testYear}-05-31`,
      period: 'month',
    });

    assert(monthlyReport.period === 'month', 'Report period is "month"');
    assert(monthlyReport.reportingCurrency !== undefined, 'Reporting currency is defined');
    assert(monthlyReport.hasForeignCurrency === true, 'Foreign currency flagged correctly as true');
    assert(Array.isArray(monthlyReport.buckets), 'buckets is an array');
    assert(monthlyReport.buckets.length >= 5, `Expected at least 5 monthly buckets, got ${monthlyReport.buckets.length}`);

    // Summary checks:
    // Invoiced: $1000 (Jan) + $2000 (Feb) + $1100 (EUR) + $650 (GBP) + $800 (May) = $5550
    // Draft $5000 in April is excluded!
    const expectedInvoiced = 1000 + 2000 + 1100 + 650 + 800; // 5550
    // Collected: $1000 (Jan) + $500 (Feb) + $1000 (Mar part) + $650 (Mar GBP: 500 * 1.3) + $800 (May) = $3950
    const expectedCollected = 1000 + 500 + 1000 + (500 * 1.30) + 800; // 3950
    const expectedUncollected = expectedInvoiced - expectedCollected; // 1600

    assert(Math.abs(monthlyReport.summary.totalInvoiced - expectedInvoiced) < 0.01,
      `Total invoiced matches expected: got ${monthlyReport.summary.totalInvoiced}, expected ${expectedInvoiced}`);
    assert(Math.abs(monthlyReport.summary.totalCollected - expectedCollected) < 0.01,
      `Total collected matches expected: got ${monthlyReport.summary.totalCollected}, expected ${expectedCollected}`);
    assert(Math.abs(monthlyReport.summary.uncollected - expectedUncollected) < 0.01,
      `Uncollected matches expected: got ${monthlyReport.summary.uncollected}, expected ${expectedUncollected}`);

    const expectedRate = (expectedCollected / expectedInvoiced) * 100;
    assert(Math.abs(monthlyReport.summary.collectionRate - expectedRate) < 0.1,
      `Collection rate matches expected: got ${monthlyReport.summary.collectionRate.toFixed(2)}%, expected ${expectedRate.toFixed(2)}%`);

    // Verify individual monthly buckets
    const bJan = monthlyReport.buckets.find(b => b.key === `${testYear}-01`);
    assert(bJan && Math.abs(bJan.invoiced - 1000) < 0.01 && Math.abs(bJan.collected - 1000) < 0.01,
      `Jan 2029: Invoiced $1000, Collected $1000`);

    const bFeb = monthlyReport.buckets.find(b => b.key === `${testYear}-02`);
    assert(bFeb && Math.abs(bFeb.invoiced - 2000) < 0.01 && Math.abs(bFeb.collected - 500) < 0.01,
      `Feb 2029: Invoiced $2000, Collected $500`);

    const bMar = monthlyReport.buckets.find(b => b.key === `${testYear}-03`);
    assert(bMar && Math.abs(bMar.invoiced - 1750) < 0.01 && Math.abs(bMar.collected - 1650) < 0.01,
      `Mar 2029: Invoiced $1750 (EUR 1100 + GBP 650), Collected $1650 ($1000 + GBP 650)`);

    const bApr = monthlyReport.buckets.find(b => b.key === `${testYear}-04`);
    assert(bApr && bApr.invoiced === 0 && bApr.collected === 0,
      `Apr 2029: Invoiced $0, Collected $0 (Draft invoice correctly ignored)`);

    const bMay = monthlyReport.buckets.find(b => b.key === `${testYear}-05`);
    assert(bMay && Math.abs(bMay.invoiced - 800) < 0.01 && Math.abs(bMay.collected - 800) < 0.01,
      `May 2029: Invoiced $800, Collected $800`);

    // 4. Test Quarterly Breakdown
    console.log('\nTesting Quarterly Period:');
    const quarterlyReport = getRevenueReport({
      startDate: `${testYear}-01-01`,
      endDate: `${testYear}-06-30`,
      period: 'quarter',
    });
    assert(quarterlyReport.period === 'quarter', 'Report period is "quarter"');
    const bQ1 = quarterlyReport.buckets.find(b => b.key === `${testYear}-Q1`);
    assert(bQ1 && Math.abs(bQ1.invoiced - 4750) < 0.01 && Math.abs(bQ1.collected - 3150) < 0.01,
      `Q1 2029: Invoiced $4750 ($1000 + $2000 + $1750), Collected $3150 ($1000 + $500 + $1650)`);
    const bQ2 = quarterlyReport.buckets.find(b => b.key === `${testYear}-Q2`);
    assert(bQ2 && Math.abs(bQ2.invoiced - 800) < 0.01 && Math.abs(bQ2.collected - 800) < 0.01,
      `Q2 2029: Invoiced $800, Collected $800`);

    // 5. Test Yearly Breakdown
    console.log('\nTesting Yearly Period:');
    const yearlyReport = getRevenueReport({
      startDate: `${testYear}-01-01`,
      endDate: `${testYear}-12-31`,
      period: 'year',
    });
    assert(yearlyReport.period === 'year', 'Report period is "year"');
    const bYear = yearlyReport.buckets.find(b => b.key === `${testYear}`);
    assert(bYear && Math.abs(bYear.invoiced - expectedInvoiced) < 0.01 && Math.abs(bYear.collected - expectedCollected) < 0.01,
      `Year 2029: Invoiced $${expectedInvoiced}, Collected $${expectedCollected}`);

    // 6. Test Weekly Breakdown
    console.log('\nTesting Weekly Period:');
    const weeklyReport = getRevenueReport({
      startDate: `${testYear}-01-01`,
      endDate: `${testYear}-05-31`,
      period: 'week',
    });
    assert(weeklyReport.period === 'week', 'Report period is "week"');
    assert(weeklyReport.buckets.length > 0, `Weekly buckets generated (${weeklyReport.buckets.length} weeks)`);
    // Bucket sum must match overall summary
    const sumWeeklyInvoiced = weeklyReport.buckets.reduce((acc, b) => acc + b.invoiced, 0);
    const sumWeeklyCollected = weeklyReport.buckets.reduce((acc, b) => acc + b.collected, 0);
    assert(Math.abs(sumWeeklyInvoiced - expectedInvoiced) < 0.01,
      `Sum of weekly invoiced ($${sumWeeklyInvoiced}) matches total ($${expectedInvoiced})`);
    assert(Math.abs(sumWeeklyCollected - expectedCollected) < 0.01,
      `Sum of weekly collected ($${sumWeeklyCollected}) matches total ($${expectedCollected})`);

    console.log('\n🎉 ALL REVENUE REPORT TESTS PASSED PERFECTLY!');
  } finally {
    // Clean up test data
    console.log('\nCleaning up test data...');
    if (createdInvoiceIds.length) {
      const placeholders = createdInvoiceIds.map(() => '?').join(',');
      db.run(`DELETE FROM payments WHERE invoice_id IN (${placeholders})`, createdInvoiceIds);
      db.run(`DELETE FROM invoices WHERE id IN (${placeholders})`, createdInvoiceIds);
    }
    db.run(`DELETE FROM clients WHERE id = ?`, [clientId]);
    saveToDisk();
    console.log('Cleanup complete.');
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
