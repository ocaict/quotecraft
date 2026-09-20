const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Point to test db path
const testDbPath = path.join(__dirname, 'test-invoice-edit.sqlite');
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
  createQuote,
  convertQuoteToInvoice,
  getInvoice,
  updateInvoice,
  addPayment,
  getAuditLogEntries,
} = require('../src/main/database');

async function runTests() {
  console.log('--- Starting Invoice Edit & Revision Unit Tests (Phase A) ---');

  await initializeDatabase();
  console.log('✓ Database initialized with Migration 29');

  // 1. Verify Migration 29 schema columns exist
  const invCols = new Set(getDb().exec('PRAGMA table_info(invoices)')[0].values.map((v) => v[1]));
  assert(invCols.has('edit_locked'), 'edit_locked column must exist');
  assert(invCols.has('tax_rate'), 'tax_rate column must exist');
  assert(invCols.has('discount_type'), 'discount_type column must exist');
  assert(invCols.has('discount_value'), 'discount_value column must exist');
  assert(invCols.has('amount_credited'), 'amount_credited column must exist');
  console.log('✓ Migration 29 columns verified on invoices table');

  // Setup client and profile
  saveCompanyProfile({
    company_name: 'Dev Studio',
    default_currency: 'USD',
    default_tax_rate: 10,
  });

  const client = addClient({
    name: 'Acme Corp',
    email: 'billing@acme.com',
  });
  assert(client && client.id, 'Client should be created');
  const clientId = client.id;

  // Create an accepted quote and convert to invoice
  const quoteRes = createQuote(
    {
      client_id: clientId,
      date_created: '2026-09-01',
      valid_until: '2026-09-30',
      currency: 'USD',
      notes: 'Initial quote notes',
      terms: 'Net 30',
      subtotal: 500,
      tax: 50,
      tax_rate: 10,
      total: 550,
    },
    [
      {
        description: 'Web Design',
        quantity: 5,
        unit_price: 100,
        tax_rate: 10,
        amount: 500,
      },
    ]
  );
  assert(quoteRes.ok, 'Quote should be created');
  const quoteId = quoteRes.quote.id;

  // Mark accepted directly in db for conversion
  getDb().run(`UPDATE quotes SET status = 'accepted' WHERE id = ?`, [quoteId]);

  const convRes = convertQuoteToInvoice(quoteId);
  assert(convRes.ok, 'Invoice conversion should succeed');
  const invoiceId = convRes.invoice.id;

  const initialInv = getInvoice(invoiceId);
  assert.strictEqual(initialInv.line_items.length, 1);
  assert.strictEqual(initialInv.total, 550);
  assert.strictEqual(initialInv.balance_due, 550);
  assert.strictEqual(initialInv.edit_locked, 0);
  console.log('✓ Created initial invoice #' + initialInv.invoice_number + ' for $550');

  // 2. Edit the invoice: change line items and add discounts
  const updateRes = updateInvoice(
    invoiceId,
    {
      client_id: clientId,
      date_created: '2026-09-02',
      date_due: '2026-09-25',
      currency: 'USD',
      exchange_rate: 1.0,
      discount_type: 'percent',
      discount_value: 10,
      discount: 70, // 10% of 700
      tax_rate: 10,
      tax: 63, // 10% of 630
      subtotal: 700,
      total: 693,
      notes: 'Revised invoice notes',
      terms: 'Payment due on receipt',
    },
    [
      {
        description: 'Web Design Phase 1',
        quantity: 4,
        unit_price: 100,
        tax_rate: 10,
        amount: 400,
      },
      {
        description: 'SEO Optimization',
        quantity: 2,
        unit_price: 150,
        tax_rate: 10,
        amount: 300,
      },
    ]
  );

  assert(updateRes.ok, 'updateInvoice should succeed: ' + JSON.stringify(updateRes.errors));
  const updatedInv = updateRes.invoice;
  assert.strictEqual(updatedInv.line_items.length, 2, 'Should have 2 line items');
  assert.strictEqual(updatedInv.line_items[0].description, 'Web Design Phase 1');
  assert.strictEqual(updatedInv.line_items[1].description, 'SEO Optimization');
  assert.strictEqual(updatedInv.subtotal, 700, 'Subtotal should be 700');
  assert.strictEqual(updatedInv.discount_amount, 70, 'Discount amount should be 70');
  assert.strictEqual(updatedInv.tax_amount, 63, 'Tax amount should be 63');
  assert.strictEqual(updatedInv.total, 693, 'Total should be 693');
  assert.strictEqual(updatedInv.balance_due, 693, 'Balance due should match total');
  assert.strictEqual(updatedInv.notes, 'Revised invoice notes');
  assert.strictEqual(updatedInv.terms, 'Payment due on receipt');
  console.log('✓ Successfully edited invoice: line items, discounts, tax, and totals recomputed');

  // 3. Verify audit log entry
  const audits = getAuditLogEntries({ recordType: 'invoice' });
  const updateAudit = audits.find((a) => a.action === 'updated' && a.entity_ref === updatedInv.invoice_number);
  assert(updateAudit, 'Audit log must record invoice update');
  console.log('✓ Audit log recorded update event');

  // 4. Validation errors
  const emptyItemsRes = updateInvoice(invoiceId, { client_id: clientId, date_created: '2026-09-02' }, []);
  assert(!emptyItemsRes.ok, 'Should reject empty line items');
  assert(emptyItemsRes.errors.general, 'Should have general error for line items');

  const invalidPriceRes = updateInvoice(
    invoiceId,
    { client_id: clientId, date_created: '2026-09-02' },
    [{ description: 'Item', quantity: 1, unit_price: -10 }]
  );
  assert(!invalidPriceRes.ok, 'Should reject negative unit price');
  console.log('✓ Input validation guards working correctly');

  // 5. Payment lock: once payment is recorded, editing is locked
  const payRes = addPayment(invoiceId, {
    amount: 100,
    payment_date: '2026-09-10',
    payment_method: 'Bank Transfer',
  });
  assert(payRes.ok, 'Payment recording should succeed');

  const paidInv = getInvoice(invoiceId);
  assert.strictEqual(paidInv.amount_paid, 100);
  assert.strictEqual(paidInv.balance_due, 593);
  assert.strictEqual(paidInv.edit_locked, 1, 'edit_locked must be 1 after payment');

  // Attempt edit after payment
  const editLockedRes = updateInvoice(
    invoiceId,
    {
      client_id: clientId,
      date_created: '2026-09-02',
      subtotal: 500,
      total: 500,
    },
    [{ description: 'Changed item', quantity: 1, unit_price: 500 }]
  );
  assert(!editLockedRes.ok, 'Edit must be rejected when invoice has payments');
  assert(
    editLockedRes.errors.general.includes('recorded payments'),
    'Error message must indicate payments block editing'
  );
  console.log('✓ Edit lock enforced: editing rejected once payments exist');

  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('--- ALL PHASE A TESTS PASSED ---');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
