// Automated Verification Suite for Payment Method Reconciliation
const path = require('path');
const fs = require('fs');
const os = require('os');

// Isolated temp DB — MUST be set BEFORE require('../src/main/database')
const testDbPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'qc-payment-recon-')),
  'test.db'
);
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  getDb,
  closeDatabase,
  addClient,
  convertQuoteToInvoice,
  createQuote,
  setQuoteStatus,
  addPayment,
  getPaymentsReport,
} = require('../src/main/database');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✔ ${message}`);
}

async function runTests() {
  console.log('--- Starting Payment Method Reconciliation Verification ---');

  await initializeDatabase();
  const db = getDb();

  // 1. Initial State Check
  const initialReport = getPaymentsReport();
  console.log(`Initial DB has ${initialReport.count} payments totaling $${initialReport.totalReceived}`);
  assert(typeof initialReport.totalReceived === 'number', 'Initial report returns numeric totalReceived');
  assert(Array.isArray(initialReport.byMethod), 'Initial report returns byMethod array');

  // Verify initial mathematical reconciliation
  const initialMethodSum = initialReport.byMethod.reduce((acc, m) => acc + m.totalAmount, 0);
  assert(
    Math.abs(initialMethodSum - initialReport.totalReceived) < 0.05,
    `Initial method subtotals ($${initialMethodSum.toFixed(2)}) match total received ($${initialReport.totalReceived.toFixed(2)})`
  );

  // 2. Setup isolated test data: Client and Invoice
  const runId = Date.now();
  const testClientName = `Reconcile Client ${runId}`;
  const client = addClient({
    name: testClientName,
    email: `reconcile_${runId}@example.com`,
    company_name: `Reconcile Inc ${runId}`,
    currency: 'USD',
  });
  assert(client && client.id, `Created test client ID: ${client.id}`);
  const clientId = client.id;

  const quoteRes = createQuote(
    {
      client_id: clientId,
      currency: 'USD',
      date_created: '2025-05-01',
      subtotal: 1000,
      total: 1000,
      terms: 'Net 30',
    },
    [
      { description: 'Consulting Services', quantity: 10, unit_price: 100, tax_rate: 0, amount: 1000 }
    ]
  );
  assert(quoteRes.ok, `Created test quote ID: ${quoteRes.quote.id} Total: $${quoteRes.quote.total}`);
  const quoteId = quoteRes.quote.id;
  setQuoteStatus(quoteId, 'accepted');

  const convRes = convertQuoteToInvoice(quoteId, { status: 'sent' });
  assert(convRes.ok, `Converted to invoice ID: ${convRes.invoice.id} Number: ${convRes.invoice.invoice_number}`);
  const invoiceId = convRes.invoice.id;

  // 3. Record a matrix of payments across diverse methods and dates
  const wireRef = `WIRE-${runId}`;
  const testPayments = [
    { amount: 300, payment_date: '2025-05-10', payment_method: 'Bank Transfer', reference_number: wireRef, notes: 'May wire payment' },
    { amount: 150, payment_date: '2025-05-15', payment_method: 'Cash', reference_number: `RCPT-${runId}`, notes: 'In-office cash' },
    { amount: 250, payment_date: '2025-05-20', payment_method: 'Card', reference_number: `STRIPE-${runId}`, notes: 'Card transaction' },
    { amount: 100, payment_date: '2025-06-01', payment_method: 'Other', reference_number: `CHECK-${runId}`, notes: 'Physical check' },
    { amount: 75,  payment_date: '2025-06-15', payment_method: '', reference_number: `MISC-${runId}`, notes: 'Direct deposit unclassified' },
  ];

  for (const p of testPayments) {
    const payRes = addPayment(invoiceId, p);
    assert(payRes.ok, `Recorded payment $${p.amount} on ${p.payment_date} via ${p.payment_method || 'Unspecified'}`);
  }

  // 4. Verification: Date Range Filter (May 2025: should capture exactly payments 1, 2, 3 = $700)
  const mayReport = getPaymentsReport({
    startDate: '2025-05-01',
    endDate: '2025-05-31',
    search: testClientName,
  });

  assert(mayReport.count === 3, `May 2025 filtered report contains exactly 3 payments (got ${mayReport.count})`);
  assert(mayReport.totalReceived === 700, `May 2025 total received is strictly $700.00 (got $${mayReport.totalReceived})`);

  // Verify per-method subtotals for May
  const mayMethods = {};
  mayReport.byMethod.forEach((m) => { mayMethods[m.method] = m.totalAmount; });
  assert(mayMethods['Bank Transfer'] === 300, `May Bank Transfer subtotal is $300.00 (got $${mayMethods['Bank Transfer']})`);
  assert(mayMethods['Cash'] === 150, `May Cash subtotal is $150.00 (got $${mayMethods['Cash']})`);
  assert(mayMethods['Card'] === 250, `May Card subtotal is $250.00 (got $${mayMethods['Card']})`);
  assert(!mayMethods['Other'], 'May report does NOT contain June "Other" payment');
  assert(!mayMethods['Unspecified'], 'May report does NOT contain June "Unspecified" payment');

  const maySubtotalSum = mayReport.byMethod.reduce((acc, m) => acc + m.totalAmount, 0);
  assert(maySubtotalSum === 700, `Sum of May method subtotals ($${maySubtotalSum}) equals total received ($${mayReport.totalReceived})`);

  // 5. Verification: Payment Method Filter (Filter by 'Cash' across all time for test client)
  const cashReport = getPaymentsReport({
    paymentMethod: 'Cash',
    search: testClientName,
  });
  assert(cashReport.count === 1, `Filtered by method 'Cash' returned 1 payment`);
  assert(cashReport.totalReceived === 150, `Filtered by method 'Cash' total received is $150.00`);
  assert(cashReport.byMethod.length === 1 && cashReport.byMethod[0].method === 'Cash', `byMethod contains only Cash`);
  assert(cashReport.payments[0].payment_method === 'Cash', `Payment record method is Cash`);

  // 6. Verification: Unspecified Method Filter
  const unspecifiedReport = getPaymentsReport({
    paymentMethod: 'Unspecified',
    search: testClientName,
  });
  assert(unspecifiedReport.count === 1, `Filtered by method 'Unspecified' returned 1 payment`);
  assert(unspecifiedReport.totalReceived === 75, `Filtered by method 'Unspecified' total is $75.00`);
  assert(unspecifiedReport.byMethod[0].method === 'Unspecified', `Grouped under 'Unspecified'`);

  // 7. Verification: Search by Reference Number
  const refSearchReport = getPaymentsReport({
    search: wireRef,
  });
  assert(refSearchReport.count === 1, `Search by reference ${wireRef} returns exactly 1 payment`);
  assert(refSearchReport.payments[0].reference_number === wireRef, `Found correct reference`);

  // 8. Verification: Global Reconciliation across all 5 test payments ($300+$150+$250+$100+$75 = $875)
  const allTestReport = getPaymentsReport({
    startDate: '2025-05-01',
    endDate: '2025-06-30',
    search: testClientName,
  });
  assert(allTestReport.count === 5, `All test period returns 5 payments`);
  assert(allTestReport.totalReceived === 875, `All test payments total $875.00 (got $${allTestReport.totalReceived})`);

  // Verify percentage totals sum up to 100%
  const totalPercentage = allTestReport.byMethod.reduce((acc, m) => acc + m.percentage, 0);
  assert(
    Math.abs(totalPercentage - 100) < 0.5,
    `Method percentages sum up to 100% (got ${totalPercentage.toFixed(1)}%)`
  );

  // 9. Verify data integrity (no duplicate tables or schemas created)
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.values.map((v) => v[0]))[0];
  console.log('Database tables:', tables);
  assert(tables.includes('payments'), 'Database has standard payments table');
  assert(!tables.includes('payments_report') && !tables.includes('payment_methods_reconciliation'), 'No duplicate or redundant tables were created');

  console.log('\n======================================================');
  console.log('🎉 ALL PAYMENT RECONCILIATION TESTS PASSED! 🎉');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
