const path = require('path');
const fs = require('fs');
const assert = require('assert');

const testDbPath = path.join(__dirname, 'test-duplicate.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  saveCompanyProfile,
  addClient,
  saveClientContacts,
  createQuote,
  getQuote,
  markQuoteAccepted,
  convertQuoteToInvoice,
  getInvoice,
  addPayment,
  duplicateQuote,
  duplicateInvoice,
} = require('../src/main/database');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const QUOTE_LINE_ITEMS = [
  { description: 'Logo design', quantity: 1, unit_price: 800, tax_rate: 10, amount: 800 },
  { description: 'Landing page build', quantity: 2, unit_price: 400, tax_rate: 0, amount: 800 },
  { description: 'Monthly maintenance', quantity: 3, unit_price: 100, tax_rate: 0, discount_type: 'fixed', discount_value: 50, discount_amount: 50, amount: 250 },
];

async function runTests() {
  console.log('--- Starting Duplicate Quote/Invoice Unit Tests ---');

  await initializeDatabase();
  console.log('✓ Database initialized');

  saveCompanyProfile({
    business_name: 'Acme Cloudless Studio',
    email: 'hello@acmeoffline.com',
    phone: '+1 555-0199',
  });

  const client = addClient({
    name: 'Cyberdyne Systems',
    company_name: 'Cyberdyne Corp',
    email: 'procurement@cyberdyne.com',
    phone: '+1 555-2000',
    address_line1: '18144 El Camino Real',
    city: 'Sunnyvale',
    state: 'CA',
    postal_code: '94086',
    country: 'USA',
  });
  saveClientContacts(client.id, [
    { name: 'Sarah Connor', email: 'sconnor@cyberdyne.com', phone: '+1 555-2001', role: 'CTO', is_primary: 1 },
  ]);
  console.log('✓ Test client and contact created');

  const today = todayStr();

  // ------------------------------------------------------------------
  // 1. Create the source quote with several line items + discounts + tax
  // ------------------------------------------------------------------
  const quoteRes = createQuote(
    {
      client_id: client.id,
      date_created: '2026-09-14',
      valid_until: '2026-10-14',
      currency: 'USD',
      exchange_rate: 1,
      terms: 'Net 30 days.',
      notes: 'Original working notes',
      discount_type: 'fixed',
      discount_value: 50,
      discount: 50,
      tax_rate: 0,
      tax: 0,
      subtotal: 1850,
      total: 1800,
    },
    QUOTE_LINE_ITEMS.map((i) => ({ ...i }))
  );
  assert.ok(quoteRes.ok && quoteRes.quote, 'Source quote should be created');
  const sourceQuoteId = quoteRes.quote.id;
  const originalQuote = getQuote(sourceQuoteId);
  assert.strictEqual(originalQuote.status, 'draft');
  assert.strictEqual(originalQuote.line_items.length, 3);
  console.log(`✓ Source quote ${originalQuote.quote_number} created with 3 line items (total $1800)`);

  // ------------------------------------------------------------------
  // 2. Duplicate the quote
  // ------------------------------------------------------------------
  const dupQuoteRes = duplicateQuote(sourceQuoteId);
  assert.ok(dupQuoteRes.ok && dupQuoteRes.quote, 'duplicateQuote should succeed');
  const dupQuote = getQuote(dupQuoteRes.quote.id);
  assert.notStrictEqual(dupQuote.id, originalQuote.id, 'Duplicate must be a new record');
  assert.notStrictEqual(dupQuote.quote_number, originalQuote.quote_number, 'Duplicate must get a fresh number');
  assert.strictEqual(dupQuote.status, 'draft', 'Duplicate must be a Draft');
  assert.strictEqual(dupQuote.date_created, today, 'Duplicate date_created must be today');
  assert.strictEqual(dupQuote.valid_until, addDays(today, 30), 'Duplicate should keep the original 30-day validity window');
  assert.strictEqual(dupQuote.client_id, originalQuote.client_id, 'Duplicate must keep the same client');
  assert.strictEqual(dupQuote.subtotal, originalQuote.subtotal, 'Duplicate subtotal must match');
  assert.strictEqual(dupQuote.discount_amount, originalQuote.discount_amount, 'Duplicate discount must match');
  assert.strictEqual(dupQuote.total, originalQuote.total, 'Duplicate total must match');
  assert.strictEqual(dupQuote.terms, originalQuote.terms, 'Duplicate terms must match');
  assert.strictEqual(dupQuote.notes, originalQuote.notes, 'Duplicate notes must match');

  assert.strictEqual(dupQuote.line_items.length, 3, 'Duplicate must copy all line items');
  dupQuote.line_items.forEach((item, idx) => {
    const src = originalQuote.line_items[idx];
    assert.strictEqual(item.description, src.description, `Line ${idx} description should match`);
    assert.strictEqual(item.quantity, src.quantity, `Line ${idx} quantity should match`);
    assert.strictEqual(item.unit_price, src.unit_price, `Line ${idx} unit price should match`);
    assert.strictEqual(item.amount, src.amount, `Line ${idx} amount should match`);
    assert.strictEqual(item.tax_rate, src.tax_rate, `Line ${idx} tax rate should match`);
  });
  assert.strictEqual(dupQuote.line_items[2].discount_type, 'fixed');
  assert.strictEqual(dupQuote.line_items[2].discount_value, 50);
  assert.strictEqual(dupQuote.line_items[0].tax_rate, 10, 'Per-item tax rate should be preserved');
  console.log(`✓ Duplicate quote ${dupQuote.quote_number} (Draft, today, fresh number) has identical client + 3 line items`);

  // ------------------------------------------------------------------
  // 3. Confirm the source quote is untouched
  // ------------------------------------------------------------------
  const afterQuote = getQuote(sourceQuoteId);
  assert.strictEqual(afterQuote.quote_number, originalQuote.quote_number);
  assert.strictEqual(afterQuote.status, originalQuote.status);
  assert.strictEqual(afterQuote.total, originalQuote.total);
  assert.strictEqual(afterQuote.date_created, originalQuote.date_created);
  assert.strictEqual(afterQuote.valid_until, originalQuote.valid_until);
  assert.strictEqual(afterQuote.line_items.length, originalQuote.line_items.length);
  assert.deepStrictEqual(
    afterQuote.line_items.map((i) => i.amount),
    originalQuote.line_items.map((i) => i.amount)
  );
  console.log('✓ Original quote unchanged (number, status, dates, totals, line items)');

  // ------------------------------------------------------------------
  // 4. Build an invoice (accepted quote -> convert -> partial payment)
  // ------------------------------------------------------------------
  const invQuoteRes = createQuote(
    {
      client_id: client.id,
      date_created: '2026-09-14',
      valid_until: '2026-10-14',
      currency: 'USD',
      exchange_rate: 1,
      terms: 'Net 15 days.',
      subtotal: 1200,
      tax: 0,
      total: 1200,
    },
    [
      { description: 'Brand audit', quantity: 2, unit_price: 350, tax_rate: 0, amount: 700 },
      { description: 'Strategy session', quantity: 1, unit_price: 500, tax_rate: 0, amount: 500 },
    ]
  );
  assert.ok(invQuoteRes.ok, 'Invoice-source quote should be created');
  const invQuoteId = invQuoteRes.quote.id;
  const acceptRes = markQuoteAccepted(invQuoteId, {
    method: 'email',
    accepted_by: 'Sarah Connor',
    date_accepted: '2026-09-14',
    note: 'Approved.',
  });
  assert.ok(acceptRes.ok, 'Quote should be accepted');

  const convertRes = convertQuoteToInvoice(invQuoteId);
  assert.ok(convertRes.ok && convertRes.invoice, 'Quote should convert to an invoice');
  const originalInvoiceId = convertRes.invoice.id;
  const payRes = addPayment(originalInvoiceId, {
    amount: 500,
    payment_date: today,
    payment_method: 'bank_transfer',
    reference_number: 'TEST-1001',
    notes: 'Initial deposit',
  });
  assert.ok(payRes.ok, 'Partial payment should be recorded');

  const originalInvoice = getInvoice(originalInvoiceId);
  const originalInvoiceStatus = originalInvoice.status;
  assert.notStrictEqual(originalInvoiceStatus, 'draft', 'Source invoice should not be a draft');
  assert.strictEqual(originalInvoice.amount_paid, 500);
  assert.strictEqual(originalInvoice.balance_due, 700);
  assert.strictEqual(originalInvoice.line_items.length, 2);
  console.log(`✓ Source invoice ${originalInvoice.invoice_number} created (total $1200, $500 paid)`);

  // ------------------------------------------------------------------
  // 5. Duplicate the invoice
  // ------------------------------------------------------------------
  const dupInvRes = duplicateInvoice(originalInvoiceId);
  assert.ok(dupInvRes.ok && dupInvRes.invoice, 'duplicateInvoice should succeed');
  const dupInvoice = getInvoice(dupInvRes.invoice.id);
  assert.notStrictEqual(dupInvoice.id, originalInvoice.id, 'Duplicate must be a new record');
  assert.notStrictEqual(dupInvoice.invoice_number, originalInvoice.invoice_number, 'Duplicate must get a fresh number');
  assert.strictEqual(dupInvoice.status, 'draft', 'Duplicate must be a Draft');
  assert.strictEqual(dupInvoice.date_created, today, 'Duplicate invoice date_created must be today');
  assert.strictEqual(dupInvoice.date_due, addDays(today, 15), 'Duplicate invoice should inherit Net-15 due window');
  assert.strictEqual(dupInvoice.quote_id, null, 'Duplicate must not be linked to the quote');
  assert.strictEqual(dupInvoice.client_id, originalInvoice.client_id, 'Duplicate must keep the same client');
  assert.strictEqual(dupInvoice.subtotal, originalInvoice.subtotal, 'Duplicate subtotal must match');
  assert.strictEqual(dupInvoice.total, originalInvoice.total, 'Duplicate total must match');
  assert.strictEqual(dupInvoice.amount_paid, 0, 'Duplicate must not copy payment history');
  assert.strictEqual(dupInvoice.balance_due, dupInvoice.total, 'Duplicate must show full balance due');
  assert.strictEqual(dupInvoice.line_items.length, 2, 'Duplicate must copy all line items');
  dupInvoice.line_items.forEach((item, idx) => {
    const src = originalInvoice.line_items[idx];
    assert.strictEqual(item.description, src.description, `Invoice line ${idx} description should match`);
    assert.strictEqual(item.amount, src.amount, `Invoice line ${idx} amount should match`);
  });
  assert.strictEqual(dupInvoice.payments.length, 0, 'Duplicate must have no payments');
  console.log(`✓ Duplicate invoice ${dupInvoice.invoice_number} (Draft, today, fresh number) has identical client + 2 line items, no payments`);

  // ------------------------------------------------------------------
  // 6. Confirm the source invoice is untouched
  // ------------------------------------------------------------------
  const afterInvoice = getInvoice(originalInvoiceId);
  assert.strictEqual(afterInvoice.invoice_number, originalInvoice.invoice_number);
  assert.strictEqual(afterInvoice.status, originalInvoiceStatus);
  assert.strictEqual(afterInvoice.quote_id, originalInvoice.quote_id);
  assert.strictEqual(afterInvoice.amount_paid, 500);
  assert.strictEqual(afterInvoice.balance_due, 700);
  assert.strictEqual(afterInvoice.line_items.length, originalInvoice.line_items.length);
  console.log('✓ Original invoice unchanged (number, status, payments, balance, line items)');

  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('\n========================================');
  console.log('All Duplicate Quote/Invoice Unit Tests Passed! ✓');
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  process.exit(1);
});