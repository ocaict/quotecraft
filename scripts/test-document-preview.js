/**
 * scripts/test-document-preview.js
 * 
 * Unit tests for Phase 5: In-App Document Quick Look & Standalone HTML Receipts.
 * Runs under plain Node without Electron.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, 'test-doc-preview-' + Date.now() + '.sqlite');
process.env.TEST_DB_PATH = TEST_DB;

const {
  initializeDatabase,
  getCompanyProfile,
  saveCompanyProfile,
  addClient,
  createQuote,
  createInvoice,
  addPayment,
  getInvoice,
  getQuote,
  closeDatabase,
} = require('../src/main/database');

const {
  generateInvoiceHtml,
  generateQuoteHtml,
  generatePaymentReceiptHtml,
  getBankDetails,
  escapeHtml,
  formatMoney,
  formatDate,
} = require('../src/main/receipt-generator');

async function runTests() {
  console.log('--- Starting Document Quick Look & HTML Receipt Unit Tests ---');

  await initializeDatabase();

  // Clean company profile for tests
  saveCompanyProfile({
    business_name: 'Apex Digital Solutions Ltd',
    default_currency: 'NGN',
    email: 'billing@apexdigital.com',
    phone: '+234 801 234 5678',
    address_line1: '12 Admiralty Way, Lekki Phase 1',
    city: 'Lagos',
    state: 'Lagos State',
    pdf_accent_color: '#0284c7',
    bank_name: 'Access Bank',
    account_number: '0123456789',
    account_name: 'Apex Digital Solutions Ltd',
    dom_bank_name: 'Guaranty Trust Bank',
    dom_account_number: '0987654321',
    dom_account_name: 'Apex Digital Solutions Ltd (DOM)',
    dom_swift_code: 'GTBINGLA',
    paystack_enabled: 1,
    paystack_page_url: 'https://paystack.shop/pay/apex-invoice',
  });
  const profile = getCompanyProfile();
  console.log('✓ Company profile configured for tests');

  // 1. Test helper functions
  assert.strictEqual(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.strictEqual(escapeHtml('Tom & Jerry'), 'Tom &amp; Jerry');
  assert.strictEqual(formatDate('2026-10-18'), '18 Oct 2026');
  assert.strictEqual(formatMoney(1500, 'USD'), '$1,500.00');
  assert.strictEqual(formatMoney(250000, 'NGN'), '₦250,000.00');
  console.log('✓ Helper functions (escapeHtml, formatDate, formatMoney) verified');

  // 2. Test Bank Mapping helper
  const domesticBank = getBankDetails(profile, 'NGN');
  assert.strictEqual(domesticBank.type, 'nuban');
  assert.strictEqual(domesticBank.bankName, 'Access Bank');
  assert.strictEqual(domesticBank.accountNumber, '0123456789');

  const foreignBank = getBankDetails(profile, 'USD');
  assert.strictEqual(foreignBank.type, 'domiciliary');
  assert.strictEqual(foreignBank.bankName, 'Guaranty Trust Bank');
  assert.strictEqual(foreignBank.swiftCode, 'GTBINGLA');
  console.log('✓ Bank details mapping (domestic NUBAN vs domiciliary SWIFT) verified');

  // 3. Create Client
  const clientRes = addClient({
    name: 'Metropolitan Creative Agency & Co.',
    email: 'accounts@metropolitan.co',
    phone: '+234 809 999 8888',
    address: '45 Marina Street, Lagos Island',
  });
  const clientId = clientRes.id;
  const client = { id: clientId, name: 'Metropolitan Creative Agency & Co.', email: 'accounts@metropolitan.co' };

  // 4. Test Quote HTML Compilation
  const quoteRes = createQuote(
    {
      client_id: clientId,
      currency: 'EUR',
      exchange_rate: 1.15,
      date_created: '2026-10-10',
      valid_until: '2026-11-10',
      notes: 'Terms: 50% upfront deposit upon acceptance.',
    },
    [
      { description: 'Cloud Architecture & Kubernetes Deployment', quantity: 1, unit_price: 3200 },
      { description: 'Technical Documentation & Handover', quantity: 1, unit_price: 800 },
    ]
  );
  assert(quoteRes.ok, 'Quote creation should succeed');
  const quote = getQuote(quoteRes.quote.id);

  const quoteHtml = generateQuoteHtml(quote, client, profile);
  assert(typeof quoteHtml === 'string' && quoteHtml.length > 500, 'Quote HTML should be a non-empty string');
  assert(quoteHtml.includes('<!DOCTYPE html>'), 'Quote HTML must contain doctype');
  assert(quoteHtml.includes('Quotation'), 'Quote HTML must include Quotation header');
  assert(quoteHtml.includes('Cloud Architecture &amp; Kubernetes Deployment'), 'Quote items must be escaped');
  assert(quoteHtml.includes('€4,000.00'), 'Quote grand total formatted correctly');
  assert(quoteHtml.includes('Base Equiv (NGN @ 1.1500)'), 'Multi-currency rate snapshot must be displayed');
  assert(quoteHtml.includes('Terms: 50% upfront deposit'), 'Quote notes must be included');
  assert(quoteHtml.includes('@media print'), 'Print stylesheets must be inlined');
  console.log('✓ generateQuoteHtml compiles complete quotation with multi-currency snapshot');

  // 5. Test Invoice HTML Compilation (Unpaid with Paystack)
  const invoiceRes = createInvoice(
    {
      client_id: clientId,
      currency: 'USD',
      exchange_rate: 1550,
      date_created: '2026-10-15',
      date_due: '2026-10-29',
      notes: 'Thank you for your business!',
    },
    [
      { description: 'Full-Stack Web Application Retainer', quantity: 1, unit_price: 2500 },
    ]
  );
  assert(invoiceRes.ok, 'Invoice creation should succeed');
  const invoice = getInvoice(invoiceRes.invoice.id);

  const invoiceHtml = generateInvoiceHtml(invoice, client, profile);
  assert(invoiceHtml.includes('INVOICE'), 'Invoice HTML must contain document label');
  assert(invoiceHtml.includes('$2,500.00'), 'Total amount formatted correctly');
  assert(invoiceHtml.includes('Pay Online'), 'Paystack online payment card must appear when unpaid');
  assert(invoiceHtml.includes('https://paystack.shop/pay/apex-invoice'), 'Paystack URL must be linked');
  assert(invoiceHtml.includes('Guaranty Trust Bank'), 'Domiciliary bank details must be included for USD');
  assert(invoiceHtml.includes('Base Equiv (NGN @ 1550.0000)'), 'Multi-currency conversion displayed');
  console.log('✓ generateInvoiceHtml compiles unpaid invoice with Paystack button & Domiciliary bank info');

  // 6. Test Invoice HTML Compilation (Paid settled)
  const paymentRes = addPayment(invoice.id, {
    amount: 2500,
    payment_date: '2026-10-18',
    payment_method: 'Bank Transfer',
    reference_number: 'TXN-984210',
    notes: 'Full settlement received via Wire',
  });
  assert(paymentRes.ok, 'Payment record should succeed');
  const paidInvoice = getInvoice(invoice.id);
  assert.strictEqual(paidInvoice.status, 'paid');

  const paidInvoiceHtml = generateInvoiceHtml(paidInvoice, client, profile);
  assert(paidInvoiceHtml.includes('PAID IN FULL'), 'Paid invoice must include PAID IN FULL stamp');
  assert(!paidInvoiceHtml.includes('paystack.shop'), 'Paid invoice must NOT show Paystack payment link');
  console.log('✓ generateInvoiceHtml compiles settled receipt with PAID IN FULL badge and suppresses payment CTA');

  // 7. Test Official Payment Receipt Compilation
  const paymentObj = {
    id: 1,
    amount: 2500,
    payment_date: '2026-10-18',
    payment_method: 'Bank Transfer',
    reference_number: 'TXN-984210',
    notes: 'Full settlement received via Wire',
  };
  const receiptHtml = generatePaymentReceiptHtml(paymentObj, paidInvoice, client, profile);
  assert(receiptHtml.includes('Payment Receipt'), 'Receipt HTML must contain header');
  assert(receiptHtml.includes('TXN-984210'), 'Receipt must display reference number');
  assert(receiptHtml.includes('PAYMENT RECEIVED'), 'Receipt must contain payment received stamp');
  assert(receiptHtml.includes('Bank Transfer'), 'Receipt must display payment method');
  console.log('✓ generatePaymentReceiptHtml compiles official payment receipt acknowledgment');

  // 8. Test XSS sanitization
  const maliciousClient = {
    name: '<script>alert("hacked")</script>',
    email: '"><img src=x onerror=alert(1)>',
  };
  const safeHtml = generateQuoteHtml(quote, maliciousClient, profile);
  assert(!safeHtml.includes('<script>alert("hacked")</script>'), 'XSS script tags must be escaped');
  assert(safeHtml.includes('&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;'), 'XSS entities properly sanitized');
  console.log('✓ XSS protection verified across template fields');

  closeDatabase();
  try {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  } catch (_) {}

  console.log('--- All Document Quick Look & HTML Receipt Unit Tests Passed! ---');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  try {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  } catch (_) {}
  process.exit(1);
});
