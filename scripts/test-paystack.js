// scripts/test-paystack.js
// Validation test suite for Stage 3: Paystack Payment Gateway Integration

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const TEST_DB = path.join(__dirname, '../data/test-paystack.sqlite');
process.env.TEST_DB_PATH = TEST_DB;

if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);

const {
  initializeDatabase,
  closeDatabase,
  getCompanyProfile,
  saveCompanyProfile,
  getPaystackSecretKey,
  updateInvoicePaystackLink,
  addClient,
  createInvoice,
  getInvoice,
  addPayment,
} = require('../src/main/database');

const {
  validatePaystackKey,
  initializeTransaction,
  verifyTransaction,
  buildReference,
} = require('../src/main/paystack');

const {
  renderInvoiceHtml,
  renderInvoicePrintHtml,
  renderInvoicePdf,
} = require('../src/main/pdf-export');

async function run() {
  console.log('--- Testing Stage 3: Paystack Payment Gateway Integration ---');

  await initializeDatabase();

  // Test 1: buildReference format
  console.log('Test 1: buildReference generates formatted QC reference...');
  const ref1 = buildReference('INV-2026-0001');
  assert(ref1.startsWith('QC-INV-2026-0001-'), `Reference should start with QC-INV-2026-0001-, got: ${ref1}`);
  const parts = ref1.split('-');
  assert(parts.length >= 4, 'Reference should have at least 4 hyphen-separated parts');
  console.log('✓ Test 1 passed: Reference generated: ' + ref1);

  // Test 2: validatePaystackKey input checks
  console.log('Test 2: validatePaystackKey parameter validation...');
  const resEmpty = await validatePaystackKey('');
  assert.strictEqual(resEmpty.ok, false, 'Empty key should fail');
  assert(resEmpty.message.includes('required'), 'Should indicate key is required');

  const resInvalidFormat = await validatePaystackKey('pk_live_1234567890');
  assert.strictEqual(resInvalidFormat.ok, false, 'Public key passed to validateSecretKey should fail format check');
  assert(resInvalidFormat.message.includes('sk_live_ or sk_test_'), 'Should flag invalid key prefix');

  const resBadKey = await validatePaystackKey('sk_test_fake_invalid_key_for_testing_12345678');
  assert.strictEqual(resBadKey.ok, false, 'Invalid secret key should fail API balance check');
  console.log('✓ Test 2 passed: Key validation correctly rejects invalid keys');

  // Test 3: initializeTransaction input checks
  console.log('Test 3: initializeTransaction validation...');
  const noKey = await initializeTransaction({ email: 'test@example.com', amountKobo: 50000 });
  assert.strictEqual(noKey.ok, false, 'Missing key should return ok: false');

  const noEmail = await initializeTransaction({ secretKey: 'sk_test_123', amountKobo: 50000 });
  assert.strictEqual(noEmail.ok, false, 'Missing email should return ok: false');
  console.log('✓ Test 3 passed: initializeTransaction input checks succeed');

  // Test 4: verifyTransaction input checks
  console.log('Test 4: verifyTransaction validation...');
  const noKeyVerify = await verifyTransaction('', 'QC-123');
  assert.strictEqual(noKeyVerify.ok, false, 'Missing key should return ok: false');

  const noRefVerify = await verifyTransaction('sk_test_123', '');
  assert.strictEqual(noRefVerify.ok, false, 'Missing reference should return ok: false');
  console.log('✓ Test 4 passed: verifyTransaction input checks succeed');

  // Test 5: Database Profile Encryption & Masking
  console.log('Test 5: Paystack credentials storage and encryption in company_profile...');
  const testSecret = 'sk_test_9876543210fedcba9876543210';
  const savedProfile = saveCompanyProfile({
    business_name: 'Lagos Tech Hub Ltd',
    email: 'billing@lagostechhub.ng',
    paystack_enabled: 1,
    paystack_public_key: 'pk_test_1234567890abcdef1234567890',
    _paystack_secret_key_plain: testSecret,
    paystack_page_url: 'https://paystack.com/pay/lagostechhub',
    default_currency: 'NGN',
  });
  assert(savedProfile && savedProfile.business_name, 'saveCompanyProfile should succeed');

  const profile = getCompanyProfile();
  assert.strictEqual(profile.paystack_enabled, 1, 'paystack_enabled should be 1');
  assert.strictEqual(profile.paystack_public_key, 'pk_test_1234567890abcdef1234567890', 'public key preserved');
  assert.strictEqual(profile.paystack_page_url, 'https://paystack.com/pay/lagostechhub', 'page url preserved');
  assert.strictEqual(profile.paystack_secret_key_encrypted, undefined, 'Encrypted secret key must NEVER be in getCompanyProfile');
  assert.strictEqual(profile._paystack_secret_key_plain, undefined, 'Plaintext secret key must NEVER be in getCompanyProfile');

  // Main-process only getter
  const decryptedKey = getPaystackSecretKey();
  assert.strictEqual(decryptedKey, testSecret, 'getPaystackSecretKey should return decrypted plain secret key');
  console.log('✓ Test 5 passed: Secret key safely encrypted in SQLite and decrypted only for main process');

  // Test 6: Invoice Paystack Link Storage & Updating
  console.log('Test 6: Invoice paystack_url and paystack_reference updating...');
  const client = addClient({
    name: 'Olusegun Adeyemi',
    company: 'Adeyemi Ventures',
    email: 'olusegun@adeyemi.ng',
  });
  assert(client && client.id, 'addClient should succeed');

  const invRes = createInvoice({
    client_id: client.id,
    currency: 'NGN',
    date_created: '2026-10-11',
    notes: 'Services rendered for Q1',
  }, [
    { description: 'Cloud Infrastructure Setup', quantity: 1, unit_price: 250000 },
  ]);
  assert(invRes.ok, 'createInvoice should succeed: ' + JSON.stringify(invRes.errors));
  const invoiceId = invRes.invoice.id;

  const testPayUrl = 'https://checkout.paystack.com/0000000000abcdef';
  const testRef = buildReference(invRes.invoice.invoice_number);
  const updateRes = updateInvoicePaystackLink(invoiceId, testPayUrl, testRef);
  assert(updateRes.ok, 'updateInvoicePaystackLink should succeed');

  const updatedInv = getInvoice(invoiceId);
  assert.strictEqual(updatedInv.paystack_url, testPayUrl, 'Invoice paystack_url should match');
  assert.strictEqual(updatedInv.paystack_reference, testRef, 'Invoice paystack_reference should match');
  console.log('✓ Test 6 passed: Invoice updated with Paystack link: ' + updatedInv.paystack_url);

  // Test 7: PDF & HTML Export includes Paystack Callout
  console.log('Test 7: PDF & HTML export incorporates Paystack payment link...');
  const htmlExport = renderInvoiceHtml(updatedInv, client, profile);
  assert(htmlExport.includes('Instant Online Payment'), 'HTML invoice should include Paystack online payment card');
  assert(htmlExport.includes(testPayUrl), 'HTML invoice should include link to Paystack checkout');
  assert(htmlExport.includes('Pay Online Now'), 'HTML invoice should include Pay Online button');

  const printHtml = renderInvoicePrintHtml(updatedInv, client, profile);
  assert(printHtml.includes(testPayUrl), 'Print HTML should include Paystack URL');
  assert(printHtml.includes('ONLINE PAYMENT'), 'Print HTML should include online payment section');

  const pdfBuffer = await renderInvoicePdf(updatedInv, client, profile);
  assert(pdfBuffer instanceof Buffer && pdfBuffer.length > 500, 'PDF buffer should be generated successfully');
  console.log('✓ Test 7 passed: PDF and HTML invoice templates render Paystack payment button and callouts');

  // Test 8: Auto-reconciliation simulation via addPayment
  console.log('Test 8: Auto-reconciliation records Paystack payment...');
  const payRecordRes = addPayment(invoiceId, {
    amount: 250000,
    payment_date: '2026-10-11',
    payment_method: 'Paystack',
    reference_number: testRef,
    notes: 'Verified via Paystack (NGN 250,000)',
  });
  assert(payRecordRes.ok, 'addPayment should succeed: ' + JSON.stringify(payRecordRes.errors));
  const paidInvoice = getInvoice(invoiceId);
  assert.strictEqual(paidInvoice.status, 'paid', 'Invoice status should auto-update to paid');
  assert.strictEqual(Number(paidInvoice.balance_due), 0, 'Balance due should be 0');
  console.log('✓ Test 8 passed: Invoice automatically marked paid upon Paystack payment reconciliation');

  console.log('\nAll Stage 3 Paystack tests passed successfully! ✅');
  closeDatabase();
}

run().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
