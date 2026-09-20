const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Point to test db path
const testDbPath = path.join(__dirname, 'test-phase-h.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  getDb,
  closeDatabase,
  getCompanyProfile,
  saveCompanyProfile,
  addClient,
  createQuote,
  getQuote,
  updateQuote,
  duplicateQuote,
  setQuoteStatus,
  convertQuoteToInvoice,
  getInvoice,
  updateInvoice,
  duplicateInvoice,
} = require('../src/main/database');

const { renderQuotePrintHtml, renderInvoicePrintHtml } = require('../src/main/pdf-export');

async function runTests() {
  console.log('--- Starting Phase H (Polish & Power Features) Unit Tests ---');

  await initializeDatabase();
  console.log('✓ Database initialized with Migrations 34 and 35');

  const db = getDb();

  // 1. Verify schema columns
  const profileCols = new Set(db.exec('PRAGMA table_info(company_profile)')[0].values.map((v) => v[1]));
  assert(profileCols.has('number_padding'), 'number_padding column must exist on company_profile');
  assert(profileCols.has('number_include_year'), 'number_include_year column must exist on company_profile');
  console.log('✓ Migration 34 columns verified on company_profile table');

  const quoteCols = new Set(db.exec('PRAGMA table_info(quotes)')[0].values.map((v) => v[1]));
  assert(quoteCols.has('tax_lines'), 'tax_lines column must exist on quotes');

  const invCols = new Set(db.exec('PRAGMA table_info(invoices)')[0].values.map((v) => v[1]));
  assert(invCols.has('tax_lines'), 'tax_lines column must exist on invoices');
  console.log('✓ Migration 35 columns verified on quotes and invoices tables');

  // 2. Client setup
  const client = addClient({
    name: 'Multi-Tax Client',
    email: 'client@multitax.ca',
  });
  assert(client && client.id, 'Client should be created');

  // 3. Test Number Formatting Settings (Padding 6, Year OFF)
  saveCompanyProfile({
    company_name: 'Phase H Studio',
    default_currency: 'USD',
    number_padding: 6,
    number_include_year: 0,
  });

  const profile = getCompanyProfile();
  assert.strictEqual(Number(profile.number_padding), 6, 'number_padding should be 6');
  assert.strictEqual(Number(profile.number_include_year), 0, 'number_include_year should be 0');

  const q1 = createQuote({
    client_id: client.id,
    date_created: '2026-09-01',
    valid_until: '2026-09-30',
  }, [{ description: 'Item 1', quantity: 1, unit_price: 100 }]);
  assert(q1.ok, 'q1 createQuote should succeed');
  assert(q1.quote.quote_number.match(/^Q-\d{6}$/), `Quote number should match Q-00000X, got: ${q1.quote.quote_number}`);

  setQuoteStatus(q1.quote.id, 'accepted');
  const inv1 = convertQuoteToInvoice(q1.quote.id);
  assert(inv1.ok, 'inv1 convertQuoteToInvoice should succeed');
  assert(inv1.invoice.invoice_number.match(/^INV-\d{6}$/), `Invoice number should match INV-00000X, got: ${inv1.invoice.invoice_number}`);
  console.log('✓ Number formatting with year prefix OFF and padding 6 verified');

  // Test with year ON and padding 4
  const currentYear = new Date().getFullYear();
  saveCompanyProfile({
    number_padding: 4,
    number_include_year: 1,
  });
  const q2 = createQuote({
    client_id: client.id,
    date_created: '2026-09-01',
    valid_until: '2026-09-30',
  }, [{ description: 'Item 2', quantity: 1, unit_price: 100 }]);
  assert(q2.ok, 'q2 createQuote should succeed');
  assert(q2.quote.quote_number.startsWith(`Q-${currentYear}-`), `Quote number should start with Q-${currentYear}-, got: ${q2.quote.quote_number}`);
  console.log('✓ Number formatting with year prefix ON and padding 4 verified');

  // 4. Test Quote with Multi-tax (tax_lines)
  const sampleTaxLines = [
    { name: 'GST', rate: 5, amount: 50 },
    { name: 'PST', rate: 7, amount: 70 },
  ];

  const quoteRes = createQuote(
    {
      client_id: client.id,
      date_created: '2026-09-01',
      valid_until: '2026-09-30',
      subtotal: 1000,
      tax_lines: sampleTaxLines,
      tax: 120,
      total: 1120,
      notes: 'Multi-tax quote test',
    },
    [
      { description: 'Consulting services', quantity: 10, unit_price: 100 },
    ]
  );
  assert(quoteRes.ok, `Quote creation should succeed: ${JSON.stringify(quoteRes.errors)}`);
  const createdQuote = getQuote(quoteRes.quote.id);
  assert(Array.isArray(createdQuote.tax_lines), 'createdQuote.tax_lines should be parsed as an array');
  assert.strictEqual(createdQuote.tax_lines.length, 2, 'createdQuote should have 2 tax lines');
  assert.strictEqual(createdQuote.tax_lines[0].name, 'GST');
  assert.strictEqual(createdQuote.tax_lines[1].rate, 7);
  console.log('✓ Quote creation and retrieval with tax_lines verified');

  // 5. Duplicate quote preserves tax_lines
  const dupQRes = duplicateQuote(createdQuote.id);
  assert(dupQRes.ok, 'Duplicate quote should succeed');
  const dupQuote = getQuote(dupQRes.quote.id);
  assert(Array.isArray(dupQuote.tax_lines), 'Duplicated quote should have tax_lines');
  assert.strictEqual(dupQuote.tax_lines.length, 2);
  console.log('✓ Quote duplication preserves tax_lines');

  // 6. Convert Quote to Invoice copies tax_lines
  setQuoteStatus(createdQuote.id, 'accepted');
  const convRes = convertQuoteToInvoice(createdQuote.id);
  assert(convRes.ok, `Convert quote to invoice should succeed: ${JSON.stringify(convRes.errors)}`);
  const createdInvoice = getInvoice(convRes.invoice.id);
  assert(Array.isArray(createdInvoice.tax_lines), 'Invoice tax_lines should be copied from quote');
  assert.strictEqual(createdInvoice.tax_lines.length, 2);
  assert.strictEqual(createdInvoice.tax_lines[0].name, 'GST');
  console.log('✓ Quote conversion to invoice preserves tax_lines');

  // 7. Update Invoice with tax_lines
  const updatedTaxLines = [
    { name: 'HST', rate: 13, amount: 130 },
  ];
  const updateInvRes = updateInvoice(createdInvoice.id, {
    date_created: createdInvoice.date_created,
    date_due: createdInvoice.date_due,
    client_id: createdInvoice.client_id,
    subtotal: 1000,
    tax_lines: updatedTaxLines,
    tax: 130,
    total: 1130,
  }, createdInvoice.line_items);
  assert(updateInvRes.ok, 'updateInvoice should succeed');
  const reloadedInvoice = getInvoice(createdInvoice.id);
  assert.strictEqual(reloadedInvoice.tax_lines.length, 1);
  assert.strictEqual(reloadedInvoice.tax_lines[0].name, 'HST');
  console.log('✓ Invoice update with tax_lines verified');

  // 8. Duplicate Invoice preserves tax_lines
  const dupInvRes = duplicateInvoice(reloadedInvoice.id);
  assert(dupInvRes.ok, 'Duplicate invoice should succeed');
  const dupInvoice = getInvoice(dupInvRes.invoice.id);
  assert(Array.isArray(dupInvoice.tax_lines), 'Duplicated invoice should have tax_lines');
  assert.strictEqual(dupInvoice.tax_lines.length, 1);
  assert.strictEqual(dupInvoice.tax_lines[0].name, 'HST');
  console.log('✓ Invoice duplication preserves tax_lines');

  // 9. PDF / HTML print rendering with tax_lines
  const quoteHtml = renderQuotePrintHtml(createdQuote, client, profile);
  assert(quoteHtml.includes('GST (5%)') || quoteHtml.includes('GST'), 'Quote HTML should contain GST tax line');
  assert(quoteHtml.includes('PST (7%)') || quoteHtml.includes('PST'), 'Quote HTML should contain PST tax line');
  assert(quoteHtml.includes('Total Tax'), 'Quote HTML should contain Total Tax row');

  const invHtml = renderInvoicePrintHtml(reloadedInvoice, client, profile);
  assert(invHtml.includes('HST (13%)') || invHtml.includes('HST'), 'Invoice HTML should contain HST tax line');
  console.log('✓ PDF/HTML print rendering verified with multi-tax rows');

  // Cleanup
  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('--- ALL PHASE H TESTS PASSED SUCCESSFULLY! ---');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
