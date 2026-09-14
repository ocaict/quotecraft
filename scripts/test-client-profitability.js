// Automated Verification Suite for Client Profitability Report
const {
  initializeDatabase,
  getDb,
  saveToDisk,
  getClientProfitabilityReport,
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
  console.log('--- Starting Client Profitability Report Verification ---');

  await initializeDatabase();
  const db = getDb();

  const testYear = 2031;
  const runTag = `CPTEST-${Date.now()}`;

  // Clean any leftover 2031 records from past runs
  db.run(`DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE date_created LIKE '${testYear}%')`);
  db.run(`DELETE FROM invoices WHERE date_created LIKE '${testYear}%'`);
  db.run(`DELETE FROM clients WHERE email LIKE '%-@test.com' OR email LIKE '%@test.com'`);
  saveToDisk();

  const createdClientIds = [];
  const createdInvoiceIds = [];

  function createTestClient(name, company = '') {
    const cl = addClient({
      name: `${name} ${runTag}`,
      company_name: company,
      email: `${name.toLowerCase().replace(/\s+/g, '')}-${Date.now()}@test.com`,
    });
    createdClientIds.push(cl.id);
    return cl;
  }

  function insertTestInvoice({ clientId, number, status = 'sent', dateCreated, dateDue, subtotal, total, currency = 'USD', exchangeRate = 1.0 }) {
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

  try {
    // 1. Client 1: Acme Corp (Top prompt payer)
    // Inv 1: $6,000 on Jan 10, fully paid Jan 12 ($6,000)
    // Inv 2: $4,000 on Feb 10, fully paid Feb 12 ($4,000)
    // Total Billed = $10,000, Total Collected = $10,000, Outstanding = $0 (100% rate)
    const client1 = createTestClient('Acme Corp', 'Acme Global');
    const inv1_1 = insertTestInvoice({
      clientId: client1.id,
      number: `INV-${runTag}-1A`,
      dateCreated: `${testYear}-01-10`,
      dateDue: `${testYear}-01-24`,
      subtotal: 6000,
      total: 6000,
    });
    addPayment(inv1_1, { amount: 6000, payment_date: `${testYear}-01-12`, payment_method: 'bank_transfer' });

    const inv1_2 = insertTestInvoice({
      clientId: client1.id,
      number: `INV-${runTag}-1B`,
      dateCreated: `${testYear}-02-10`,
      dateDue: `${testYear}-02-24`,
      subtotal: 4000,
      total: 4000,
    });
    addPayment(inv1_2, { amount: 4000, payment_date: `${testYear}-02-12`, payment_method: 'bank_transfer' });

    // 2. Client 2: Beta Logistics (Partial payer)
    // Inv 1: $6,000 on Jan 15, partially paid $3,500 on Jan 20 ($2,500 balance due)
    // Total Billed = $6,000, Total Collected = $3,500, Outstanding = $2,500 (58.3% rate)
    const client2 = createTestClient('Beta Logistics', 'Beta Inc');
    const inv2 = insertTestInvoice({
      clientId: client2.id,
      number: `INV-${runTag}-2`,
      dateCreated: `${testYear}-01-15`,
      dateDue: `${testYear}-01-30`,
      subtotal: 6000,
      total: 6000,
    });
    addPayment(inv2, { amount: 3500, payment_date: `${testYear}-01-20`, payment_method: 'credit_card' });

    // 3. Client 3: Gamma Europe (Foreign currency client)
    // Inv 1: EUR 2,000 @ 1.10 rate = $2,200 USD base billed on Feb 05
    // Paid EUR 1,000 @ 1.10 rate = $1,100 USD collected on Feb 15
    // Outstanding = $1,100 (50.0% rate)
    const client3 = createTestClient('Gamma Europe', 'Gamma SAS');
    const inv3 = insertTestInvoice({
      clientId: client3.id,
      number: `INV-${runTag}-3`,
      dateCreated: `${testYear}-02-05`,
      dateDue: `${testYear}-02-20`,
      currency: 'EUR',
      exchangeRate: 1.10,
      subtotal: 2000,
      total: 2000,
    });
    addPayment(inv3, { amount: 1000, payment_date: `${testYear}-02-15`, payment_method: 'stripe' });

    // 4. Client 4: Delta Slowpay (Non-payer)
    // Inv 1: $4,000 USD on Feb 18. Paid $0.
    // Outstanding = $4,000 (0% rate)
    const client4 = createTestClient('Delta Slowpay', 'Delta LLC');
    const inv4 = insertTestInvoice({
      clientId: client4.id,
      number: `INV-${runTag}-4`,
      dateCreated: `${testYear}-02-18`,
      dateDue: `${testYear}-03-04`,
      subtotal: 4000,
      total: 4000,
    });

    // 5. Client 5: Epsilon Drafts (Only draft invoice)
    // Inv 1: $5,000 USD on Feb 20, status 'draft'
    // Must be excluded from report when includeInactive is false!
    const client5 = createTestClient('Epsilon Drafts');
    insertTestInvoice({
      clientId: client5.id,
      number: `INV-${runTag}-5`,
      status: 'draft',
      dateCreated: `${testYear}-02-20`,
      dateDue: `${testYear}-03-06`,
      subtotal: 5000,
      total: 5000,
    });

    // 6. Client 6: Zeta Inactive (No activity)
    const client6 = createTestClient('Zeta Inactive');

    // ── Test 1: Full Year Report with Default Sort (Collected Descending) ──
    console.log('\n--- Test 1: Default Sorting (Total Collected Descending) ---');
    const report1 = getClientProfitabilityReport({
      startDate: `${testYear}-01-01`,
      endDate: `${testYear}-12-31`,
      sort: 'collected_desc',
      includeInactive: false,
    });

    assert(report1.reportingCurrency !== undefined, 'Reporting currency resolved');
    assert(report1.hasForeignCurrency === true, 'Foreign currency flagged correctly as true');
    assert(report1.summary.totalBilled === (10000 + 6000 + 2200 + 4000), `Total billed is 22200 (got ${report1.summary.totalBilled})`);
    assert(report1.summary.totalCollected === (10000 + 3500 + 1100), `Total collected is 14600 (got ${report1.summary.totalCollected})`);
    assert(report1.summary.totalOutstanding === (22200 - 14600), `Total outstanding is 7600 (got ${report1.summary.totalOutstanding})`);
    assert(report1.summary.topClient && report1.summary.topClient.id === client1.id, `Top client is Acme Corp (ID ${client1.id})`);
    assert(report1.summary.topClient.totalCollected === 10000, `Top client collected amount is 10000`);

    // Filter our test clients only
    const testClients1 = report1.clients.filter(c => createdClientIds.includes(c.clientId));
    assert(testClients1.length === 4, `4 active test clients returned (draft & inactive excluded, got ${testClients1.length})`);

    // Check rank order: Acme ($10,000) -> Beta ($3,500) -> Gamma ($1,100) -> Delta ($0)
    assert(testClients1[0].clientId === client1.id && testClients1[0].totalCollected === 10000,
      'Rank 1 is Acme Corp with $10,000 collected');
    assert(testClients1[1].clientId === client2.id && testClients1[1].totalCollected === 3500,
      'Rank 2 is Beta Logistics with $3,500 collected');
    assert(testClients1[2].clientId === client3.id && testClients1[2].totalCollected === 1100,
      'Rank 3 is Gamma Europe with $1,100 collected (EUR 1,000 normalized at 1.10)');
    assert(testClients1[3].clientId === client4.id && testClients1[3].totalCollected === 0,
      'Rank 4 is Delta Slowpay with $0 collected');

    // Check individual client metrics
    const acme = testClients1[0];
    assert(acme.totalBilled === 10000, 'Acme total billed = 10,000');
    assert(acme.outstandingBalance === 0, 'Acme outstanding = 0');
    assert(acme.collectionRate === 100, 'Acme collection rate = 100%');
    assert(acme.invoiceCount === 2, 'Acme invoice count = 2');
    assert(acme.paymentCount === 2, 'Acme payment count = 2');

    const beta = testClients1[1];
    assert(beta.totalBilled === 6000, 'Beta total billed = 6,000');
    assert(beta.outstandingBalance === 2500, 'Beta outstanding = 2,500');
    assert(Math.abs(beta.collectionRate - 58.3) < 0.1, `Beta collection rate = 58.3% (got ${beta.collectionRate}%)`);

    const gamma = testClients1[2];
    assert(gamma.totalBilled === 2200, 'Gamma total billed = 2,200 (EUR 2000 @ 1.10)');
    assert(gamma.totalCollected === 1100, 'Gamma total collected = 1,100 (EUR 1000 @ 1.10)');
    assert(gamma.outstandingBalance === 1100, 'Gamma outstanding = 1,100');
    assert(gamma.collectionRate === 50.0, 'Gamma collection rate = 50%');

    const delta = testClients1[3];
    assert(delta.totalBilled === 4000, 'Delta total billed = 4,000');
    assert(delta.totalCollected === 0, 'Delta total collected = 0');
    assert(delta.outstandingBalance === 4000, 'Delta outstanding = 4,000');
    assert(delta.collectionRate === 0.0, 'Delta collection rate = 0%');

    // ── Test 2: Sort by Outstanding Descending ──
    console.log('\n--- Test 2: Sort by Outstanding Descending ---');
    const report2 = getClientProfitabilityReport({
      startDate: `${testYear}-01-01`,
      endDate: `${testYear}-12-31`,
      sort: 'outstanding_desc',
      includeInactive: false,
    });
    const testClients2 = report2.clients.filter(c => createdClientIds.includes(c.clientId));
    assert(testClients2[0].clientId === client4.id, 'Top outstanding is Delta ($4,000)');
    assert(testClients2[1].clientId === client2.id, 'Second outstanding is Beta ($2,500)');
    assert(testClients2[2].clientId === client3.id, 'Third outstanding is Gamma ($1,100)');
    assert(testClients2[3].clientId === client1.id, 'Lowest outstanding is Acme ($0)');

    // ── Test 3: Date Range Filtering (January Only) ──
    console.log('\n--- Test 3: Date Range Filtering (January Only) ---');
    const report3 = getClientProfitabilityReport({
      startDate: `${testYear}-01-01`,
      endDate: `${testYear}-01-31`,
      sort: 'collected_desc',
      includeInactive: false,
    });
    const testClients3 = report3.clients.filter(c => createdClientIds.includes(c.clientId));
    // In Jan: Acme had Inv 1 ($6,000 billed, $6,000 collected). Beta had Inv ($6,000 billed, $3,500 collected).
    // Gamma and Delta were in Feb.
    assert(testClients3.length === 2, `2 clients active in January (got ${testClients3.length})`);
    assert(testClients3[0].clientId === client1.id && testClients3[0].totalBilled === 6000 && testClients3[0].totalCollected === 6000,
      'January Acme: $6,000 billed, $6,000 collected');
    assert(testClients3[1].clientId === client2.id && testClients3[1].totalBilled === 6000 && testClients3[1].totalCollected === 3500,
      'January Beta: $6,000 billed, $3,500 collected');

    // ── Test 4: Include Inactive Clients ──
    console.log('\n--- Test 4: Include Inactive Clients ---');
    const report4 = getClientProfitabilityReport({
      startDate: `${testYear}-01-01`,
      endDate: `${testYear}-12-31`,
      sort: 'collected_desc',
      includeInactive: true,
    });
    const testClients4 = report4.clients.filter(c => createdClientIds.includes(c.clientId));
    assert(testClients4.length === 6, `All 6 test clients returned when includeInactive is true (got ${testClients4.length})`);

    console.log('\n🎉 ALL CLIENT PROFITABILITY TESTS PASSED PERFECTLY! 🎉');
  } finally {
    console.log('\nCleaning up test records...');
    if (createdInvoiceIds.length) {
      const placeholders = createdInvoiceIds.map(() => '?').join(',');
      db.run(`DELETE FROM payments WHERE invoice_id IN (${placeholders})`, createdInvoiceIds);
      db.run(`DELETE FROM invoices WHERE id IN (${placeholders})`, createdInvoiceIds);
    }
    if (createdClientIds.length) {
      const clientPlaceholders = createdClientIds.map(() => '?').join(',');
      db.run(`DELETE FROM clients WHERE id IN (${clientPlaceholders})`, createdClientIds);
    }
    saveToDisk();
    console.log('Cleanup complete.');
  }
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
