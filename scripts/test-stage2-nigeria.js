// scripts/test-stage2-nigeria.js
// Validation test suite for Stage 2: NUBAN & Domiciliary Multi-Bank Accounts

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, '../data/test-stage2-nigeria.sqlite');
process.env.TEST_DB_PATH = TEST_DB;

if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

const {
  initializeDatabase,
  closeDatabase,
  getCompanyProfile,
  saveCompanyProfile,
  addClient,
  createInvoice,
  getPaymentBankDetails,
  NIGERIAN_BANKS,
  isValidNuban,
} = require('../src/main/database');

const {
  renderInvoiceHtml,
  renderInvoicePrintHtml,
  renderInvoicePdf,
} = require('../src/main/pdf-export');

let client;

async function run() {
  console.log('--- Testing Stage 2: NUBAN & Domiciliary Multi-Bank Accounts ---');

  await initializeDatabase();

  client = addClient({
    name: 'Dangote Industries Ltd',
    company: 'Dangote Group',
    email: 'procurement@dangote.com',
    phone: '+234 1 271 2000',
    address: 'Union Marble House, 1 Alfred Rewane Rd, Ikoyi, Lagos',
  });

  // Test 1: NIGERIAN_BANKS constant list
  console.log('Test 1: NIGERIAN_BANKS list contains top commercial banks and fintechs...');
  assert(Array.isArray(NIGERIAN_BANKS) && NIGERIAN_BANKS.length >= 20, 'NIGERIAN_BANKS should have at least 20 entries');
  const bankNames = NIGERIAN_BANKS.map((b) => b.name);
  assert(bankNames.includes('Access Bank'), 'Should include Access Bank');
  assert(bankNames.some((n) => n.includes('GTBank') || n.includes('Guaranty Trust')), 'Should include GTBank');
  assert(bankNames.includes('Zenith Bank'), 'Should include Zenith Bank');
  assert(bankNames.includes('First Bank of Nigeria'), 'Should include First Bank');
  assert(bankNames.includes('Kuda Bank'), 'Should include Kuda Bank');
  assert(bankNames.includes('Moniepoint MFB'), 'Should include Moniepoint MFB');
  assert(bankNames.includes('OPay'), 'Should include OPay');
  console.log('✓ Test 1 passed: NIGERIAN_BANKS contains ' + NIGERIAN_BANKS.length + ' banks/fintechs');

  // Test 2: NUBAN validation helper (isValidNuban)
  console.log('Test 2: isValidNuban format and check-digit validation...');
  assert(isValidNuban('0123456789') === true, '10-digit number should be valid format');
  assert(isValidNuban('12345') === false, '5-digit number should be invalid');
  assert(isValidNuban('01234567890') === false, '11-digit number should be invalid');
  assert(isValidNuban('012345678a') === false, 'Alphanumeric string should be invalid');
  assert(isValidNuban('') === false, 'Empty string should be invalid');
  assert(isValidNuban(null) === false, 'Null should be invalid');
  console.log('✓ Test 2 passed: isValidNuban validates 10-digit NUBAN numbers');

  // Test 3: Save and retrieve Nigerian NUBAN bank details in company_profile
  console.log('Test 3: Saving and retrieving NUBAN bank details in company_profile...');
  saveCompanyProfile({
    business_name: 'TechCraft Solutions Ltd',
    cac_number: 'RC-1234567',
    tin: '23456789-0001',
    bank_name: 'Guaranty Trust Bank (GTBank)',
    account_number: '0123456789',
    account_name: 'TechCraft Solutions Ltd',
    default_currency: 'NGN',
  });

  let profile = getCompanyProfile();
  assert.strictEqual(profile.bank_name, 'Guaranty Trust Bank (GTBank)', 'Bank name should match');
  assert.strictEqual(profile.account_number, '0123456789', 'Account number should match');
  assert.strictEqual(profile.account_name, 'TechCraft Solutions Ltd', 'Account name should match');
  console.log('✓ Test 3 passed: NUBAN bank details persisted and retrieved successfully');

  // Test 4: Save and retrieve Domiciliary bank details in company_profile
  console.log('Test 4: Saving and retrieving Domiciliary wire details...');
  saveCompanyProfile({
    business_name: 'TechCraft Solutions Ltd',
    bank_name: 'Guaranty Trust Bank (GTBank)',
    account_number: '0123456789',
    account_name: 'TechCraft Solutions Ltd',
    dom_bank_name: 'Guaranty Trust Bank (Dom Account)',
    dom_account_number: '0987654321',
    dom_account_name: 'TechCraft Solutions Ltd',
    dom_swift_code: 'GTBINGLA',
    dom_intermediary_bank: 'Citibank New York / CITIUS33',
    payment_details: 'Payment due within 14 days. Please include invoice number in narration.',
  });

  profile = getCompanyProfile();
  assert.strictEqual(profile.dom_bank_name, 'Guaranty Trust Bank (Dom Account)');
  assert.strictEqual(profile.dom_account_number, '0987654321');
  assert.strictEqual(profile.dom_account_name, 'TechCraft Solutions Ltd');
  assert.strictEqual(profile.dom_swift_code, 'GTBINGLA');
  assert.strictEqual(profile.dom_intermediary_bank, 'Citibank New York / CITIUS33');
  console.log('✓ Test 4 passed: Domiciliary bank details persisted and retrieved successfully');

  // Test 5: Smart Bank Routing — NGN Invoice selects NUBAN
  console.log('Test 5: Smart routing — NGN currency selects local NUBAN details...');
  const ngnDetails = getPaymentBankDetails(profile, 'NGN');
  assert.strictEqual(ngnDetails.type, 'nuban', 'NGN invoice should route to nuban');
  assert.strictEqual(ngnDetails.bankName, 'Guaranty Trust Bank (GTBank)');
  assert.strictEqual(ngnDetails.accountNumber, '0123456789');
  assert.strictEqual(ngnDetails.accountName, 'TechCraft Solutions Ltd');
  console.log('✓ Test 5 passed: NGN invoice accurately routed to NUBAN bank account');

  // Test 6: Smart Bank Routing — USD/GBP/EUR Invoices select Domiciliary Wire
  console.log('Test 6: Smart routing — USD, GBP, and EUR select Domiciliary wire instructions...');
  for (const curr of ['USD', 'GBP', 'EUR']) {
    const domDetails = getPaymentBankDetails(profile, curr);
    assert.strictEqual(domDetails.type, 'domiciliary', `${curr} invoice should route to domiciliary`);
    assert.strictEqual(domDetails.bankName, 'Guaranty Trust Bank (Dom Account)');
    assert.strictEqual(domDetails.accountNumber, '0987654321');
    assert.strictEqual(domDetails.swiftCode, 'GTBINGLA');
    assert.strictEqual(domDetails.intermediaryBank, 'Citibank New York / CITIUS33');
    assert.strictEqual(domDetails.currency, curr);
  }
  console.log('✓ Test 6 passed: USD, GBP, and EUR accurately routed to Domiciliary wire instructions');

  // Test 7: Smart Routing Fallback when Domiciliary details are absent
  console.log('Test 7: Smart routing fallback when Domiciliary details are not set...');
  const localOnlyProfile = Object.assign({}, profile, {
    dom_bank_name: '',
    dom_account_number: '',
    dom_swift_code: '',
    dom_intermediary_bank: '',
  });
  const fallbackDetails = getPaymentBankDetails(localOnlyProfile, 'USD');
  assert.strictEqual(fallbackDetails.type, 'nuban', 'USD invoice should fallback to NUBAN if Dom not configured');
  assert.strictEqual(fallbackDetails.accountNumber, '0123456789');
  console.log('✓ Test 7 passed: Fallback to NUBAN works cleanly');

  // Test 8: HTML Invoice rendering with styled Direct Bank Transfer callout
  console.log('Test 8: HTML Invoice rendering displays styled Direct Bank Transfer callout...');
  const ngnRes = createInvoice(
    { client_id: client.id, currency: 'NGN', date_created: '2026-10-11' },
    [{ description: 'Corporate Software Consulting', quantity: 1, unit_price: 1500000, tax_rate: 7.5 }]
  );
  assert(ngnRes.ok, `Invoice creation should succeed: ${JSON.stringify(ngnRes.errors || {})}`);
  const ngnInv = ngnRes.invoice;

  const ngnHtml = renderInvoiceHtml(ngnInv, client, profile);
  assert(ngnHtml.includes('bank-callout-card nuban'), 'HTML should contain bank-callout-card nuban');
  assert(ngnHtml.includes('Direct Bank Transfer'), 'HTML should contain Direct Bank Transfer title');
  assert(ngnHtml.includes('0123456789'), 'HTML should contain account number 0123456789');
  assert(ngnHtml.includes('Guaranty Trust Bank (GTBank)'), 'HTML should contain GTBank');

  // Foreign currency USD HTML
  const usdRes = createInvoice(
    { client_id: client.id, currency: 'USD', date_created: '2026-10-11' },
    [{ description: 'Cloud Infrastructure Audit', quantity: 1, unit_price: 3500, tax_rate: 0 }]
  );
  assert(usdRes.ok, `USD invoice creation should succeed: ${JSON.stringify(usdRes.errors || {})}`);
  const usdInv = usdRes.invoice;

  const usdHtml = renderInvoiceHtml(usdInv, client, profile);
  assert(usdHtml.includes('bank-callout-card domiciliary'), 'HTML should contain bank-callout-card domiciliary');
  assert(usdHtml.includes('Domiciliary Wire Transfer'), 'HTML should contain Domiciliary title');
  assert(usdHtml.includes('GTBINGLA'), 'HTML should contain SWIFT code GTBINGLA');
  assert(usdHtml.includes('0987654321'), 'HTML should contain Domiciliary account number');
  console.log('✓ Test 8 passed: HTML invoices render styled NUBAN and Domiciliary transfer callouts');

  // Test 9: Print HTML & PDFKit binary generation
  console.log('Test 9: Print HTML and binary PDF generation with bank details...');
  const printHtml = renderInvoicePrintHtml(ngnInv, client, profile);
  assert(printHtml.includes('bank-callout-print nuban'), 'Print HTML should contain bank-callout-print nuban');
  assert(printHtml.includes('0123456789'), 'Print HTML should include account number');

  const pdfBuffer = await renderInvoicePdf(ngnInv, client, profile);
  assert(Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 1000, 'PDF buffer should be valid non-empty buffer');

  const usdPdfBuffer = await renderInvoicePdf(usdInv, client, profile);
  assert(Buffer.isBuffer(usdPdfBuffer) && usdPdfBuffer.length > 1000, 'USD PDF buffer should be valid non-empty buffer');
  console.log('✓ Test 9 passed: Print HTML and binary PDF export generate smoothly with bank callouts');

  // Test 10: Backward compatibility with legacy profile (no bank details, only payment_details)
  console.log('Test 10: Backward compatibility with legacy payment_details...');
  const legacyProfile = {
    business_name: 'Legacy Freelancer',
    default_currency: 'USD',
    payment_details: 'Bank: Old Mutual Bank\nSort Code: 11-22-33\nAccount: 44556677',
  };
  const legacyDetails = getPaymentBankDetails(legacyProfile, 'USD');
  assert.strictEqual(legacyDetails.type, 'generic', 'Legacy profile should return generic type');
  assert.strictEqual(legacyDetails.notes, legacyProfile.payment_details);

  const legacyHtml = renderInvoiceHtml(usdInv, client, legacyProfile);
  assert(legacyHtml.includes('Payment Instructions / Bank Details'), 'Legacy HTML should render standard payment instructions');
  assert(legacyHtml.includes('Old Mutual Bank'), 'Legacy HTML should include legacy text');
  console.log('✓ Test 10 passed: Legacy profiles render cleanly without regression');

  closeDatabase();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

  console.log('\n--- ALL 10/10 STAGE 2 NIGERIA TESTS PASSED! ---');
}

run().catch((err) => {
  console.error('Test failed:', err);
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  process.exit(1);
});
