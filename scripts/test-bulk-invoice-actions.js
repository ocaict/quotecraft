const path = require('path');
const fs = require('fs');
const assert = require('assert');

const testDbPath = path.join(__dirname, 'test-bulk-invoice.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  saveCompanyProfile,
  addClient,
  createQuote,
  markQuoteAccepted,
  convertQuoteToInvoice,
  getInvoice,
  addPayment,
  duplicateInvoice,
  markInvoicesSent,
} = require('../src/main/database');
const { renderInvoicePdf } = require('../src/main/pdf-export');

function makeQuote(clientId) {
  const res = createQuote(
    {
      client_id: clientId,
      date_created: '2026-09-14',
      valid_until: '2026-10-14',
      currency: 'USD',
      exchange_rate: 1,
      terms: 'Net 14 days.',
      subtotal: 1200,
      tax: 0,
      total: 1200,
    },
    [
      { description: 'Brand audit', quantity: 2, unit_price: 350, tax_rate: 0, amount: 700 },
      { description: 'Strategy session', quantity: 1, unit_price: 500, tax_rate: 0, amount: 500 },
    ]
  );
  assert.ok(res.ok, 'Quote creation should succeed');
  return res.quote.id;
}

function makeInvoice(quoteId) {
  const accept = markQuoteAccepted(quoteId, {
    method: 'email',
    accepted_by: 'Sarah Connor',
    date_accepted: '2026-09-14',
    note: 'Approved.',
  });
  assert.ok(accept.ok, 'Quote acceptance should succeed');
  const conv = convertQuoteToInvoice(quoteId);
  assert.ok(conv.ok && conv.invoice, 'Quote should convert to an invoice');
  return conv.invoice.id;
}

async function runTests() {
  console.log('--- Starting Bulk Invoice Actions Unit Tests ---');

  await initializeDatabase();
  const profile = saveCompanyProfile({ business_name: 'Acme Studio', email: 'hello@acme.com', phone: '+1 555-0100' });
  const client = addClient({ name: 'Cyberdyne Systems', company_name: 'Corp', email: 'x@y.com' });
  console.log('✓ Database + client ready');

  // Three sent invoices (converted from accepted quotes)
  const inv1 = makeInvoice(makeQuote(client.id));
  const inv2 = makeInvoice(makeQuote(client.id));
  const inv3 = makeInvoice(makeQuote(client.id));

  // Two fresh Drafts via duplicate
  const draft1 = duplicateInvoice(inv1).invoice;
  const draft2 = duplicateInvoice(inv2).invoice;
  assert.strictEqual(draft1.status, 'draft');
  assert.strictEqual(draft2.status, 'draft');

  // inv2 is 'sent'; inv3 becomes partially paid
  assert.strictEqual(getInvoice(inv2).status, 'sent');
  addPayment(inv3, { amount: 400, payment_date: '2026-09-15', payment_method: 'Bank Transfer' });
  assert.strictEqual(getInvoice(inv3).status, 'partially_paid');
  console.log('✓ Fixtures ready: 2 Drafts, 1 Sent, 1 Partially-paid invoice');

  // ------------------------------------------------------------------
  // 1. Bulk mark the two Drafts as Sent (only drafts are promoted)
  // ------------------------------------------------------------------
  const res = markInvoicesSent([draft1.id, draft2.id, inv2, inv3, 999999]);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.marked, 2, 'Exactly the 2 drafts should be marked sent');
  assert.strictEqual(res.skipped.length, 3, 'Already-sent, partially-paid, and unknown ids are skipped');
  assert.ok(res.skipped.includes(inv2), 'Already-sent invoice must be skipped (not downgraded)');
  assert.ok(res.skipped.includes(inv3), 'Partially-paid invoice must be skipped');
  assert.ok(res.skipped.includes(999999), 'Unknown id must be skipped without error');
  console.log('✓ Bulk mark: 2 drafts promoted, 3 skipped (sent/partially-paid/unknown)');

  const d1 = getInvoice(draft1.id);
  const d2 = getInvoice(draft2.id);
  assert.strictEqual(d1.status, 'sent');
  assert.strictEqual(d2.status, 'sent');
  assert.ok(d1.date_sent, 'date_sent should be recorded on promoted invoices');
  console.log('✓ Promoted invoices now Sent with date_sent set');

  // ------------------------------------------------------------------
  // 2. Untouched invoices keep their state
  // ------------------------------------------------------------------
  assert.strictEqual(getInvoice(inv2).status, 'sent');
  assert.strictEqual(getInvoice(inv3).status, 'partially_paid');
  assert.strictEqual(getInvoice(inv3).amount_paid, 400);
  assert.strictEqual(getInvoice(inv3).balance_due, 800);
  console.log('✓ Sent and partially-paid invoices untouched');

  // ------------------------------------------------------------------
  // 3. Batch PDF rendering for several invoices (export backend)
  // ------------------------------------------------------------------
  const idsToRender = [draft1.id, draft2.id, inv2, inv3];
  const buffers = {};
  for (const id of idsToRender) {
    const inv = getInvoice(id);
    const buffer = await renderInvoicePdf(inv, client, profile);
    assert.ok(buffer && buffer.length > 1000, `Invoice ${inv.invoice_number} should render a PDF`);
    assert.strictEqual(buffer.slice(0, 4).toString(), '%PDF', 'PDF must start with %PDF header');
    buffers[id] = buffer;
    console.log(`  ✓ ${inv.invoice_number} rendered (${buffer.length} bytes)`);
  }
  assert.strictEqual(Object.keys(buffers).length, 4);
  console.log('✓ All 4 invoices rendered in one batch (valid PDF each)');

  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('\n========================================');
  console.log('All Bulk Invoice Actions Unit Tests Passed! ✓');
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  process.exit(1);
});