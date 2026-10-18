const path = require('path');
const fs = require('fs');
const assert = require('assert');

const testDbPath = path.join(__dirname, 'test-multi-currency.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  getDb,
  saveCompanyProfile,
  getCompanyProfile,
  addClient,
  createQuote,
  updateQuote,
  getQuote,
  listQuotes,
  createInvoice,
  updateInvoice,
  getInvoice,
  listInvoices,
  convertQuoteToInvoice,
  setQuoteStatus,
  computeBaseAmountCents,
} = require('../src/main/database');

const {
  getCurrencyByCode,
  convertCurrency,
  getPaymentBankDetails,
} = require('../src/shared/constants');

const {
  renderQuotePdf,
  renderInvoicePdf,
} = require('../src/main/pdf-export');

async function runTests() {
  console.log('--- Starting Multi-Currency Invoicing & Exchange Rate Unit Tests ---');

  await initializeDatabase();
  console.log('✓ Database initialized with Migration 50 (base_amount_cents)');

  // 1. Verify schema columns
  const quoteCols = new Set(getDb().exec(`PRAGMA table_info(quotes)`)[0].values.map((v) => v[1]));
  assert(quoteCols.has('base_amount_cents'), 'quotes table must contain base_amount_cents column');

  const invCols = new Set(getDb().exec(`PRAGMA table_info(invoices)`)[0].values.map((v) => v[1]));
  assert(invCols.has('base_amount_cents'), 'invoices table must contain base_amount_cents column');
  console.log('✓ Schema migration 50 verified: base_amount_cents exists on quotes & invoices');

  // 2. Test shared constants helpers
  assert.strictEqual(computeBaseAmountCents(100, 1.0), 10000);
  assert.strictEqual(computeBaseAmountCents(100, 1.25), 12500);
  assert.strictEqual(computeBaseAmountCents(150.50, 1.15), 17308); // 150.5 * 1.15 = 173.075 -> 17308
  assert.strictEqual(convertCurrency(100, 1.20, 1.0), 120);
  assert.strictEqual(getCurrencyByCode('EUR').symbol, '€');
  assert.strictEqual(getCurrencyByCode('GBP').symbol, '£');
  assert.strictEqual(getCurrencyByCode('NGN').symbol, '₦');
  console.log('✓ Multi-currency helpers computeBaseAmountCents & convertCurrency verified');

  // 3. Configure company profile with base currency USD + NUBAN + Domiciliary details
  saveCompanyProfile({
    business_name: 'Global Tech Studio',
    default_currency: 'USD',
    reporting_currency: 'USD',
    bank_name: 'Access Bank',
    account_number: '0123456789',
    account_name: 'Global Tech Studio Ltd',
    dom_bank_name: 'Citibank Nigeria',
    dom_account_number: '9876543210',
    dom_account_name: 'Global Tech Studio USD Dom',
    dom_swift_code: 'CITINGLA',
    dom_intermediary_bank: 'Citibank New York',
  });
  const profile = getCompanyProfile();
  console.log('✓ Company profile configured with dual local & foreign banking accounts');

  // 4. Test Bank Account Recommendation via getPaymentBankDetails
  const ngnDetails = getPaymentBankDetails(profile, 'NGN');
  assert.strictEqual(ngnDetails.type, 'nuban', 'NGN billing should recommend local NUBAN bank');
  assert.strictEqual(ngnDetails.bankName, 'Access Bank');

  const usdDetails = getPaymentBankDetails(profile, 'USD');
  assert.strictEqual(usdDetails.type, 'domiciliary', 'USD billing should recommend Domiciliary wire transfer');
  assert.strictEqual(usdDetails.swiftCode, 'CITINGLA');

  const eurDetails = getPaymentBankDetails(profile, 'EUR');
  assert.strictEqual(eurDetails.type, 'domiciliary', 'EUR billing should recommend Domiciliary wire transfer');

  const gbpDetails = getPaymentBankDetails(profile, 'GBP');
  assert.strictEqual(gbpDetails.type, 'domiciliary', 'GBP billing should recommend Domiciliary wire transfer');
  console.log('✓ getPaymentBankDetails maps domestic vs foreign currencies to correct bank accounts');

  // 5. Create client
  const clientRes = addClient({
    name: 'London Enterprises Ltd',
    email: 'finance@london-enterprises.co.uk',
  });
  const clientId = clientRes.id;

  // 6. Create Quote in EUR with exchange rate 1.15
  const quoteRes = createQuote(
    {
      client_id: clientId,
      currency: 'EUR',
      exchange_rate: 1.15,
      date_created: '2026-10-01',
      valid_until: '2026-10-31',
    },
    [
      { description: 'Cloud Infrastructure Setup', quantity: 1, unit_price: 1000 },
      { description: 'Security Auditing', quantity: 2, unit_price: 250 },
    ]
  );
  assert(quoteRes.ok, 'Quote creation should succeed');
  const quote = quoteRes.quote;
  assert.strictEqual(quote.currency, 'EUR');
  assert.strictEqual(Number(quote.exchange_rate), 1.15);
  assert.strictEqual(Number(quote.total), 1500); // €1,500
  // base_amount_cents = 1500 * 1.15 * 100 = 172500
  assert.strictEqual(quote.base_amount_cents, 172500, 'Quote base_amount_cents should snapshot base currency cents');
  console.log(`✓ Quote created in EUR with base_amount_cents: ${quote.base_amount_cents} ($1,725.00 base)`);

  // 7. Update Quote with new exchange rate 1.20
  const updatedQuoteRes = updateQuote(
    quote.id,
    {
      client_id: clientId,
      currency: 'EUR',
      exchange_rate: 1.20,
      date_created: '2026-10-01',
      valid_until: '2026-10-31',
    },
    [
      { description: 'Cloud Infrastructure Setup', quantity: 1, unit_price: 1000 },
      { description: 'Security Auditing', quantity: 2, unit_price: 250 },
    ]
  );
  assert(updatedQuoteRes.ok, 'Quote update should succeed');
  const updatedQuote = getQuote(quote.id);
  assert.strictEqual(Number(updatedQuote.exchange_rate), 1.20);
  assert.strictEqual(updatedQuote.base_amount_cents, 180000, 'Quote base_amount_cents should recalculate to 180000 (1500 * 1.20 * 100)');
  console.log('✓ Quote update recomputed base_amount_cents correctly');

  // 8. Accept quote & convert to invoice
  setQuoteStatus(quote.id, 'accepted');
  const invRes = convertQuoteToInvoice(quote.id);
  assert(invRes.ok, 'Conversion to invoice should succeed');
  const convertedInv = invRes.invoice;
  assert.strictEqual(convertedInv.currency, 'EUR');
  assert.strictEqual(Number(convertedInv.exchange_rate), 1.20);
  assert.strictEqual(convertedInv.base_amount_cents, 180000, 'Converted invoice should inherit exchange rate and base_amount_cents');
  console.log('✓ Convert quote to invoice preserved multi-currency exchange rate & base_amount_cents');

  // 9. Create Standalone Invoice in GBP with exchange rate 1.32
  const directInvRes = createInvoice(
    {
      client_id: clientId,
      currency: 'GBP',
      exchange_rate: 1.32,
      date_created: '2026-10-05',
      date_due: '2026-10-19',
    },
    [
      { description: 'Consulting Retainer (October)', quantity: 1, unit_price: 2000 },
    ]
  );
  assert(directInvRes.ok, 'Invoice creation should succeed');
  const directInv = directInvRes.invoice;
  assert.strictEqual(directInv.currency, 'GBP');
  assert.strictEqual(Number(directInv.exchange_rate), 1.32);
  assert.strictEqual(Number(directInv.total), 2000); // £2,000
  // base_amount_cents = 2000 * 1.32 * 100 = 264000 cents ($2,640.00 base)
  assert.strictEqual(directInv.base_amount_cents, 264000);
  console.log(`✓ Standalone Invoice created in GBP with base_amount_cents: ${directInv.base_amount_cents} ($2,640.00 base)`);

  // 10. Update Invoice exchange rate and amounts
  const updatedInvRes = updateInvoice(
    directInv.id,
    {
      client_id: clientId,
      currency: 'GBP',
      exchange_rate: 1.35,
      date_created: '2026-10-05',
      date_due: '2026-10-19',
    },
    [
      { description: 'Consulting Retainer (October)', quantity: 1, unit_price: 2500 },
    ]
  );
  assert(updatedInvRes.ok, 'Invoice update should succeed');
  const fetchedUpdatedInv = getInvoice(directInv.id);
  assert.strictEqual(Number(fetchedUpdatedInv.total), 2500);
  assert.strictEqual(Number(fetchedUpdatedInv.exchange_rate), 1.35);
  // 2500 * 1.35 * 100 = 337500
  assert.strictEqual(fetchedUpdatedInv.base_amount_cents, 337500);
  console.log('✓ Standalone Invoice update recomputed base_amount_cents correctly');

  // 11. Test listInvoices & listQuotes return base_amount_cents
  const quotesList = listQuotes();
  assert(quotesList.length > 0);
  assert(typeof quotesList[0].base_amount_cents === 'number');

  const invoicesList = listInvoices();
  assert(invoicesList.length > 0);
  assert(typeof invoicesList[0].base_amount_cents === 'number');
  console.log('✓ listQuotes and listInvoices return normalized base_amount_cents');

  // 12. Test PDF Export for Multi-Currency Document
  const quotePdfBytes = await renderQuotePdf(updatedQuote, { name: 'London Enterprises Ltd' }, profile);
  assert(quotePdfBytes && quotePdfBytes.length > 0, 'Quote PDF should be generated');
  console.log(`✓ Quote PDF generated with foreign currency & rate snapshot (bytes: ${quotePdfBytes.length})`);

  const invPdfBytes = await renderInvoicePdf(fetchedUpdatedInv, { name: 'London Enterprises Ltd' }, profile);
  assert(invPdfBytes && invPdfBytes.length > 0, 'Invoice PDF should be generated');
  console.log(`✓ Invoice PDF generated with foreign currency & base equivalent snapshot (bytes: ${invPdfBytes.length})`);

  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('--- All Multi-Currency Unit Tests Passed Successfully! ---');
}

runTests().catch((err) => {
  console.error('Test failed:', err.stack || err);
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  process.exit(1);
});
