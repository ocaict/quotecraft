// Verification script for Deposit Invoice -> Final Remainder Invoice Generation
const path = require('path');
const fs = require('fs');
const os = require('os');

// Isolated temp DB — MUST be set BEFORE require('../src/main/database')
const testDbPath = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), 'qc-deposit-final-')),
  'test.db'
);
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  getDb,
  closeDatabase,
  saveToDisk,
  addClient,
  saveCompanyProfile,
  convertQuoteToInvoice,
  createFinalInvoiceFromDeposit,
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
  console.log('--- Testing Deposit Invoice -> Final Invoice Generation ---');

  await initializeDatabase();
  const db = getDb();

  const runTag = `DEPTEST-${Date.now()}`;

  // 1. Create client
  const client = addClient({
    name: `Deposit Client ${runTag}`,
    email: `deposit-${Date.now()}@test.com`,
  });
  assert(client && client.id, `Created test client ID ${client.id}`);

  // 2. Create an accepted quote
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO quotes (
      quote_number, client_id, status, date_created, date_accepted,
      subtotal, tax_amount, discount_amount, total,
      quote_number_root, version, is_latest, currency, exchange_rate,
      created_at, updated_at
    ) VALUES (?, ?, 'accepted', '2026-09-14', '2026-09-14', 40000, 0, 0, 40000, ?, 1, 1, 'NGN', 1.0, ?, ?)`,
    [`Q-${runTag}`, client.id, `Q-${runTag}`, now, now]
  );
  const qIdRes = db.exec(`SELECT last_insert_rowid() AS id`);
  const quoteId = qIdRes[0].values[0][0];

  db.run(
    `INSERT INTO quote_line_items (quote_id, description, quantity, unit_price, amount, sort_order)
     VALUES (?, 'Web Development & Branding Services', 1, 40000, 40000, 0)`,
    [quoteId]
  );
  assert(quoteId, `Created accepted quote ID ${quoteId} for 40,000 NGN`);

  // 3. Convert quote into Deposit Invoice (50%)
  const depRes = convertQuoteToInvoice(quoteId, {
    conversion_type: 'deposit',
    deposit_type: 'percent',
    deposit_value: 50,
  });
  assert(depRes.ok, `Deposit invoice created successfully: ${depRes.invoice?.invoice_number}`);
  assert(depRes.invoice.invoice_type === 'deposit', 'Invoice type is deposit');
  assert(depRes.invoice.total === 20000, 'Deposit total is 20,000 NGN');
  assert(depRes.invoice.quote_id === quoteId, 'Deposit invoice has quote_id');
  const depositInvId = depRes.invoice.id;

  // 4. Pay the deposit invoice in full
  const payRes = addPayment(depositInvId, {
    amount: 20000,
    payment_date: '2026-09-14',
    payment_method: 'bank_transfer',
  });
  assert(payRes.ok, 'Deposit invoice paid in full');

  // 5. Generate Final Invoice from Deposit (this was failing with UNIQUE constraint failed: invoices.quote_id)
  console.log('Generating final invoice from deposit...');
  const finalRes = createFinalInvoiceFromDeposit(depositInvId);
  console.log('finalRes:', JSON.stringify(finalRes));
  assert(finalRes.ok, `Final invoice created successfully: ${finalRes.invoice?.invoice_number}`);
  assert(finalRes.invoice.invoice_type === 'final', 'Invoice type is final');
  assert(finalRes.invoice.quote_id === quoteId, 'Final invoice is linked to original quote_id');
  assert(finalRes.invoice.deposit_invoice_id === depositInvId, 'Final invoice references deposit_invoice_id');
  assert(finalRes.invoice.total === 20000, 'Final invoice total is remaining 20,000 NGN');
  assert(finalRes.invoice.line_items.length === 2, `Final invoice has 2 line items (original + deduction line, got ${finalRes.invoice.line_items.length})`);

  // 6. Calling again returns alreadyGenerated: true
  const secondCall = createFinalInvoiceFromDeposit(depositInvId);
  assert(secondCall.ok && secondCall.alreadyGenerated, 'Calling createFinalInvoiceFromDeposit again returns alreadyGenerated: true');

  console.log('\n🎉 ALL DEPOSIT -> FINAL INVOICE TESTS PASSED SUCCESSFULLY! 🎉');

  // Clean up test data
  db.run(`DELETE FROM payments WHERE invoice_id IN (?, ?)`, [depositInvId, finalRes.invoice.id]);
  db.run(`DELETE FROM invoice_line_items WHERE invoice_id IN (?, ?)`, [depositInvId, finalRes.invoice.id]);
  db.run(`DELETE FROM invoices WHERE id IN (?, ?)`, [depositInvId, finalRes.invoice.id]);
  db.run(`DELETE FROM quote_line_items WHERE quote_id = ?`, [quoteId]);
  db.run(`DELETE FROM quotes WHERE id = ?`, [quoteId]);
  db.run(`DELETE FROM clients WHERE id = ?`, [client.id]);
  saveToDisk();
  console.log('Cleanup complete.');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
