const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Point to test db path
const testDbPath = path.join(__dirname, 'test-phase-f.sqlite');
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
  addPayment,
  getPaymentsReport,
} = require('../src/main/database');

const {
  renderInvoiceHtml,
  renderPaymentsPdf,
} = require('../src/main/pdf-export');

async function runTests() {
  console.log('--- Starting Phase F Unit Tests (Shareable Invoice HTML & Payments PDF) ---');

  await initializeDatabase();
  console.log('✓ Database initialized');

  saveCompanyProfile({
    business_name: 'Alpha Design Studio & Co',
    email: 'hello@alphadesign.example',
    phone: '+1 555-0199',
    payment_details: 'Bank: TestBank\nIBAN: US99TEST0001',
    default_currency: 'USD',
  });

  const client = addClient({
    name: 'Acme Corp',
    company_name: 'Acme Global Inc',
    email: 'billing@acme.example',
    address: '123 Market St, Suite 400',
  });

  const quoteRes = createQuote(
    {
      client_id: client.id,
      date_created: '2026-09-01',
      valid_until: '2026-09-30',
      notes: 'Payment required within 30 days',
      terms: 'Standard terms apply',
      currency: 'USD',
      subtotal: 3500,
      tax: 250,
      tax_rate: 10,
      total: 3750,
    },
    [
      { description: 'Website Redesign', quantity: 1, unit_price: 2500, discount_type: 'none', discount_value: 0, tax_rate: 10, amount: 2500 },
      { description: 'Brand Strategy', quantity: 2, unit_price: 500, discount_type: 'percent', discount_value: 10, tax_rate: 0, amount: 1000 },
    ]
  );
  assert.ok(quoteRes.ok, 'createQuote should succeed');
  const quoteId = quoteRes.quote.id;

  // Mark accepted in DB for conversion
  getDb().run(`UPDATE quotes SET status = 'accepted' WHERE id = ?`, [quoteId]);

  const convResult = convertQuoteToInvoice(quoteId, {
    date_created: '2026-09-20',
    date_due: '2026-10-20',
  });
  assert.ok(convResult.ok, 'Conversion to invoice should succeed');
  const invoiceId = convResult.invoice.id;

  const invoice = getInvoice(invoiceId);
  assert.ok(invoice, 'Invoice must exist');

  // 1. Test renderInvoiceHtml (pending/due state)
  const profile = {
    business_name: 'Alpha Design Studio & Co',
    email: 'hello@alphadesign.example',
    phone: '+1 555-0199',
    payment_details: 'Bank: TestBank\nIBAN: US99TEST0001',
    default_currency: 'USD',
  };

  const htmlDue = renderInvoiceHtml(invoice, client, profile);
  assert.strictEqual(typeof htmlDue, 'string', 'renderInvoiceHtml should return a string');
  assert.ok(htmlDue.includes('<!DOCTYPE html>'), 'HTML contains doctype');
  assert.ok(htmlDue.includes('Alpha Design Studio &amp; Co'), 'HTML escapes business name');
  assert.ok(htmlDue.includes('Acme Corp'), 'HTML contains client name');
  assert.ok(htmlDue.includes(invoice.invoice_number), 'HTML contains invoice number');
  assert.ok(htmlDue.includes('Website Redesign'), 'HTML contains line item description');
  assert.ok(htmlDue.includes('Bank: TestBank'), 'HTML contains payment details');
  assert.ok(htmlDue.includes('Payment Due'), 'HTML shows Payment Due status');
  console.log('✓ renderInvoiceHtml generated valid HTML for due invoice');

  // 2. Record partial payment and test renderInvoiceHtml
  const p1Res = addPayment(invoiceId, {
    amount: 1000,
    payment_date: '2026-09-05',
    payment_method: 'Bank Transfer',
    reference_number: 'TXN-1001',
  });
  assert.ok(p1Res.ok, 'Partial payment should succeed');

  const invoicePartial = getInvoice(invoiceId);
  const htmlPartial = renderInvoiceHtml(invoicePartial, client, profile);
  assert.ok(htmlPartial.includes('Partially Paid'), 'HTML reflects partially paid status banner');
  assert.ok(htmlPartial.includes('Remaining balance due:'), 'HTML shows remaining balance');
  console.log('✓ renderInvoiceHtml generated valid HTML for partially paid invoice');

  // 3. Record remaining payment and test renderInvoiceHtml
  const p2Res = addPayment(invoiceId, {
    amount: invoicePartial.balance_due,
    payment_date: '2026-09-08',
    payment_method: 'Credit Card',
    reference_number: 'TXN-1002',
  });
  assert.ok(p2Res.ok, 'Final payment should succeed');

  const invoicePaid = getInvoice(invoiceId);
  const htmlPaid = renderInvoiceHtml(invoicePaid, client, profile);
  assert.ok(htmlPaid.includes('Paid in Full'), 'HTML reflects paid in full status banner');
  console.log('✓ renderInvoiceHtml generated valid HTML for paid invoice');

  // 4. Test renderPaymentsPdf
  const paymentsReport = getPaymentsReport({});
  assert.strictEqual(paymentsReport.count, 2, 'Should have 2 recorded payments');
  assert.ok(paymentsReport.totalReceived > 0, 'Total received should be > 0');

  const pdfBuffer = await renderPaymentsPdf(paymentsReport, profile);
  assert.ok(Buffer.isBuffer(pdfBuffer), 'renderPaymentsPdf should return a Buffer');
  assert.ok(pdfBuffer.length > 500, 'PDF buffer should not be empty');
  assert.strictEqual(pdfBuffer.slice(0, 4).toString(), '%PDF', 'PDF buffer must start with %PDF header');
  console.log('✓ renderPaymentsPdf generated valid PDF buffer (%PDF format verified)');

  // 5. Test renderPaymentsPdf with themes
  const pdfModern = await renderPaymentsPdf(paymentsReport, profile, { theme: 'modern' });
  assert.ok(Buffer.isBuffer(pdfModern), 'renderPaymentsPdf with modern theme returns Buffer');
  assert.strictEqual(pdfModern.slice(0, 4).toString(), '%PDF', 'Modern theme PDF buffer is valid');
  console.log('✓ renderPaymentsPdf supports PDF themes');

  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  console.log('--- Phase F Unit Tests Passed Successfully ---');
}

runTests().catch((err) => {
  console.error('Test failed:', err.stack || err);
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  process.exit(1);
});
