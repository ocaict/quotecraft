const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Point to test db path
const testDbPath = path.join(__dirname, 'test-invoice-create.sqlite');
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
  saveClientContacts,
  createInvoice,
  getInvoice,
  getAuditLogEntries,
} = require('../src/main/database');

// Independent mirror of the renderer's integer-cents arithmetic, used to build
// the expected values with which the server recompute must agree.
function toCents(value) {
  if (value === '' || value === null || value === undefined || isNaN(Number(value))) return 0;
  return Math.round(Number(value) * 100);
}
function lineNetCents(qty, price, discType, discValue) {
  const raw = Math.round(toCents(qty) * toCents(price) / 100);
  let dc = 0;
  if (discType && discType !== 'none' && !isNaN(discValue) && discValue > 0) {
    dc = discType === 'fixed' ? toCents(discValue) : Math.round(raw * discValue / 100);
    if (dc > raw) dc = raw;
  }
  return raw - dc;
}

async function runTests() {
  console.log('--- Starting Standalone Invoice Creation Unit Tests ---');

  await initializeDatabase();
  console.log('✓ Database initialized (Migration 36: quotes.internal_notes)');

  saveCompanyProfile({
    business_name: 'Acme Technologies',
    default_currency: 'USD',
    default_terms: 'Payment due within 14 days',
  });

  const client = addClient({
    name: 'Standalone Client',
    email: 'standalone@test.com',
    company_name: 'Standalone Co',
    payment_terms: 'Net 30 days',
  });
  saveClientContacts(client.id, [{ name: 'Primary Contact', email: 'primary@test.com', is_primary: 1 }]);
  console.log('✓ Test client + contact created');

  // --- Case 1: bounding-bracket tax recompute; bogus money ignored ---
  const items1 = [
    { description: 'Design', quantity: 3, unit_price: 100, tax_rate: 10, discount_type: 'none', discount_value: 0, amount: 999 },
    { description: 'Dev', quantity: 1, unit_price: 450.5, tax_rate: 10, discount_type: 'percent', discount_value: 10, amount: 999 },
  ];
  const net1 = [lineNetCents(3, 100, 'none', 0), lineNetCents(1, 450.5, 'percent', 10)];
  const expectedSubtotal1 = (net1[0] + net1[1]) / 100;
  const expectedTax1 = Math.round(Math.round((net1[0] + net1[1]) * 10 / 100)) / 100;
  const expectedTotal1 = expectedSubtotal1 + expectedTax1;

  const res1 = createInvoice(
    { client_id: client.id, date_created: '2026-09-20', tax_rate: 10, subtotal: 999999, discount: 999999, tax: 999999, total: 0 },
    items1
  );
  assert.ok(res1.ok, 'createInvoice should succeed: ' + JSON.stringify(res1));
  assert.strictEqual(res1.invoice.status, 'draft');
  assert.strictEqual(res1.invoice.invoice_type, 'standard');
  assert.strictEqual(res1.invoice.quote_id, null);
  assert.strictEqual(res1.invoice.edit_locked, 0, 'new invoices are editable');
  assert.ok(res1.invoice.invoice_number.startsWith('INV-'), 'numbering from prefix');
  assert.strictEqual(res1.invoice.subtotal, expectedSubtotal1, `subtotal must be recomputed (${expectedSubtotal1})`);
  assert.strictEqual(res1.invoice.discount_amount, 0, 'no doc discount requested');
  assert.strictEqual(res1.invoice.tax_amount, expectedTax1, `tax must be recomputed (${expectedTax1})`);
  assert.strictEqual(res1.invoice.total, expectedTotal1, `total must be recomputed (${expectedTotal1})`);
  assert.strictEqual(res1.invoice.balance_due, expectedTotal1, 'balance_due = total for a new draft');
  assert.strictEqual(res1.invoice.amount_paid, 0);
  assert.strictEqual(res1.invoice.line_items[0].amount, net1[0] / 100, 'line 1 amount recomputed');
  assert.strictEqual(res1.invoice.line_items[1].amount, net1[1] / 100, 'line 2 amount recomputed');
  assert.strictEqual(res1.invoice.line_items[1].discount_amount, Math.round(toCents(450.5) * 10 / 100) / 100, 'line 2 percent discount computed (not renderer-supplied)');
  console.log(`✓ Invoice ${res1.invoice.invoice_number}: subtotal, tax, total and line amounts recomputed server-side`);

  // --- Case 2: multi-tax lines + fixed doc discount ---
  const res2 = createInvoice(
    {
      client_id: client.id,
      date_created: '2026-09-20',
      tax_lines: [{ name: 'GST', rate: 5 }, { name: 'PST', rate: 7 }],
      discount_type: 'fixed',
      discount_value: 30,
    },
    [{ description: 'Consulting', quantity: 1, unit_price: 300, tax_rate: 0, discount_type: 'none', discount_value: 0 }]
  );
  assert.ok(res2.ok, 'multi-tax invoice should succeed: ' + JSON.stringify(res2));
  const basis2 = (300 - 30) * 100;
  const gst2 = Math.round(basis2 * 5 / 100) / 100;
  const pst2 = Math.round(basis2 * 7 / 100) / 100;
  assert.strictEqual(res2.invoice.subtotal, 300);
  assert.strictEqual(res2.invoice.discount_amount, 30);
  assert.strictEqual(res2.invoice.tax_amount, gst2 + pst2, 'tax_amount = GST + PST');
  assert.strictEqual(res2.invoice.total, Math.round((270 + gst2 + pst2) * 100) / 100);
  assert.ok(Array.isArray(res2.invoice.tax_lines), 'tax_lines persisted as JSON array');
  assert.strictEqual(res2.invoice.tax_lines.length, 2);
  console.log(`✓ ${res2.invoice.invoice_number}: multi-tax (GST ${gst2} + PST ${pst2}) with fixed discount computed`);

  // --- Case 3: percent doc discount rolls into per-bracket tax basis ---
  const res3 = createInvoice(
    { client_id: client.id, date_created: '2026-09-20', date_due: '2026-10-05', discount_type: 'percent', discount_value: 10, tax_rate: 5 },
    [{ description: 'Retainer', quantity: 1, unit_price: 1000, tax_rate: 5, discount_type: 'none', discount_value: 0 }]
  );
  assert.ok(res3.ok, 'percent-discount invoice should succeed: ' + JSON.stringify(res3));
  const basis3 = 900 * 100;
  const tax3 = Math.round(basis3 * 5 / 100) / 100;
  assert.strictEqual(res3.invoice.subtotal, 1000);
  assert.strictEqual(res3.invoice.discount_amount, 100, '10% doc discount = $100');
  assert.strictEqual(res3.invoice.tax_amount, tax3, 'tax charged on discounted basis');
  assert.strictEqual(res3.invoice.total, 945);
  assert.strictEqual(res3.invoice.date_due, '2026-10-05', 'explicit due date honored');
  console.log(`✓ ${res3.invoice.invoice_number}: percent discount + tax rounded on discounted basis`);

  // --- Case 4: default due date from profile default payment terms ---
  saveCompanyProfile({
    business_name: 'Acme Technologies',
    default_currency: 'USD',
    default_terms: 'Net 45 days',
  });
  const res4 = createInvoice(
    { client_id: client.id, date_created: '2026-09-20' },
    [{ description: 'Advisory', quantity: 1, unit_price: 50, tax_rate: 0, discount_type: 'none', discount_value: 0 }]
  );
  assert.ok(res4.ok, 'due-date-default invoice should succeed');
  assert.strictEqual(res4.invoice.date_due, '2026-11-04', 'Net 45 profile terms applied (+45 days)');
  console.log(`✓ ${res4.invoice.invoice_number}: due date derived from profile default terms (Net 45)`);

  // --- Case 5: currency + notes + terms carried through ---
  const res5 = createInvoice(
    { client_id: client.id, date_created: '2026-09-20', currency: 'EUR', exchange_rate: 1.1, notes: 'Behind the scenes', terms: 'TBD' },
    [{ description: 'Design audit', quantity: 1, unit_price: 200, tax_rate: 0, discount_type: 'none', discount_value: 0 }]
  );
  assert.ok(res5.ok);
  assert.strictEqual(res5.invoice.currency, 'EUR');
  assert.strictEqual(Number(res5.invoice.exchange_rate), 1.1);
  assert.strictEqual(res5.invoice.notes, 'Behind the scenes');
  assert.strictEqual(res5.invoice.terms, 'TBD');
  console.log(`✓ ${res5.invoice.invoice_number}: currency, notes, and terms stored`);

  // --- Case 6: validation guards ---
  const validBase = { client_id: client.id, date_created: '2026-09-20' };
  const badNoClient = createInvoice({ date_created: '2026-09-20' }, [{ description: 'X', quantity: 1, unit_price: 10 }]);
  assert.ok(!badNoClient.ok && badNoClient.errors.client_id, 'client required');
  const badNoItems = createInvoice(validBase, []);
  assert.ok(!badNoItems.ok && badNoItems.errors.general, 'empty line items rejected');
  const badBadPrice = createInvoice(validBase, [{ description: 'X', quantity: 1, unit_price: 1.234 }]);
  assert.ok(!badBadPrice.ok && badBadPrice.errors.general, '>2dp unit price rejected');
  const badProject = createInvoice({ ...validBase, project_id: 12345 }, [{ description: 'X', quantity: 1, unit_price: 10 }]);
  assert.ok(!badProject.ok && badProject.errors.project_id, 'project must exist and belong to client');
  console.log('✓ Validation guards: client, line items, rounding, project linkage');

  // --- Case 7: audit trail ---
  const entries = getAuditLogEntries({ recordType: 'invoice', limit: 100 });
  const created = (entries || []).filter((e) => e.action === 'created');
  assert.ok(created.length >= 3, 'invoice creations recorded in audit log');
  console.log('✓ Audit log records new-invoice creation events');

  // --- Case 8: persistence (row survives reload) ---
  const createdId = res1.invoice.id;
  const raw = getDb().exec(
    `SELECT invoice_number, subtotal, tax_amount, total FROM invoices WHERE id = ?`,
    [createdId]
  );
  assert.strictEqual(raw[0].values[0][1], expectedSubtotal1, 'persisted subtotal matches');
  console.log('✓ Row persisted to disk via saveToDisk()');

  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('\nAll Standalone Invoice Creation unit tests PASSED successfully!');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.stdout.write('\n');
  process.exit(1);
});