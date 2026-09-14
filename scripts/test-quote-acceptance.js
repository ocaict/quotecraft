const path = require('path');
const fs = require('fs');
const assert = require('assert');

const testDbPath = path.join(__dirname, 'test-acceptance.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  getDb,
  closeDatabase,
  saveCompanyProfile,
  getCompanyProfile,
  addClient,
  saveClientContacts,
  createQuote,
  getQuote,
  setQuoteStatus,
  markQuoteAccepted,
  markQuoteDeclined,
  convertQuoteToInvoice,
  getInvoice,
} = require('../src/main/database');

const {
  renderQuotePdf,
  renderQuoteHtml,
} = require('../src/main/pdf-export');

async function runTests() {
  console.log('--- Starting Shareable Quote Acceptance Unit Tests ---');

  await initializeDatabase();
  console.log('✓ Database initialized with Migration 22');

  // 1. Check Company Profile Default Acceptance Instructions
  let profile = saveCompanyProfile({
    business_name: 'Acme Cloudless Studio',
    email: 'hello@acmeoffline.com',
    phone: '+1 555-0199',
  });
  assert.ok(profile, 'Company profile should exist after saving');
  assert.strictEqual(
    profile.default_quote_acceptance_instructions,
    'To accept this quote, please reply to confirm via email or phone.',
    'Should have default acceptance instructions'
  );
  console.log('✓ Default quote acceptance instructions present in company_profile');

  // 2. Create client and contacts
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

  // 3. Create quote
  const quoteRes = createQuote(
    {
      client_id: client.id,
      date_created: '2026-09-14',
      valid_until: '2026-10-14',
      currency: 'USD',
      terms: 'Net 30 days. No cloud accounts required.',
      subtotal: 5000,
      total: 5000,
    },
    [
      {
        description: 'Offline Custom Software Architecture',
        quantity: 1,
        unit_price: 5000,
        amount: 5000,
        tax_rate: 0,
      },
    ]
  );
  assert.ok(quoteRes.ok && quoteRes.quote, 'Quote should be created');
  const quoteId = quoteRes.quote.id;
  let quote = getQuote(quoteId);
  assert.strictEqual(quote.status, 'draft');
  console.log(`✓ Quote ${quote.quote_number} created in draft status`);

  // 4. Test PDF rendering with Acceptance Section
  const pdfBuffer = await renderQuotePdf(quote, client, profile);
  assert.ok(pdfBuffer && pdfBuffer.length > 1000, 'PDF buffer should be non-empty');
  assert.strictEqual(pdfBuffer.slice(0, 4).toString(), '%PDF', 'PDF buffer must start with %PDF header');
  console.log(`✓ Quote PDF rendered successfully (${pdfBuffer.length} bytes)`);

  // 5. Test Shareable HTML rendering
  const html = renderQuoteHtml(quote, client, profile);
  assert.ok(typeof html === 'string' && html.length > 500, 'HTML should be non-empty string');
  assert.ok(html.includes('<!DOCTYPE html>'), 'HTML should have doctype');
  assert.ok(html.includes('Offline Quotation:'), 'HTML should prominently state offline architecture');
  assert.ok(html.includes('To accept this quote, please reply to confirm via email or phone.'), 'HTML should include acceptance instructions');
  assert.ok(html.includes('Authorized Client Signature'), 'HTML should include formal signature line');
  assert.ok(html.includes('Acme Cloudless Studio'), 'HTML should include company business name');
  assert.ok(html.includes('Cyberdyne Systems'), 'HTML should include client name');
  assert.ok(html.includes('Offline Custom Software Architecture'), 'HTML should include line item');
  console.log(`✓ Shareable HTML quote generated successfully (${html.length} characters)`);

  // 6. Test setting quote status to Sent and ensuring date_sent is preserved upon acceptance
  setQuoteStatus(quoteId, 'sent');
  quote = getQuote(quoteId);
  assert.strictEqual(quote.status, 'sent');
  assert.ok(quote.date_sent, 'date_sent should be set');
  const initialSentDate = quote.date_sent;

  // 7. Test Mark as Accepted (email reply confirmation)
  const acceptRes = markQuoteAccepted(quoteId, {
    method: 'email',
    accepted_by: 'Sarah Connor',
    date_accepted: '2026-09-14',
    note: 'Confirmed via email reply: "Approved to proceed under PO #CD-800"',
  });
  assert.ok(acceptRes.ok, 'markQuoteAccepted should succeed');
  quote = getQuote(quoteId);
  assert.strictEqual(quote.status, 'accepted');
  assert.strictEqual(quote.acceptance_method, 'email');
  assert.strictEqual(quote.accepted_by, 'Sarah Connor');
  assert.strictEqual(quote.date_accepted, '2026-09-14');
  assert.strictEqual(quote.acceptance_note, 'Confirmed via email reply: "Approved to proceed under PO #CD-800"');
  assert.strictEqual(quote.date_sent, initialSentDate, 'date_sent must NOT be wiped when accepted');
  console.log('✓ Quote accepted with paper trail (method, authorizer, date, notes) and date_sent preserved');

  // 8. Render PDF and HTML of Accepted Quote
  const acceptedPdfBuffer = await renderQuotePdf(quote, client, profile);
  assert.ok(acceptedPdfBuffer && acceptedPdfBuffer.length > 1000, 'Accepted PDF buffer should generate');

  const acceptedHtml = renderQuoteHtml(quote, client, profile);
  assert.ok(acceptedHtml.includes('Formally Accepted'), 'Accepted HTML should state formally accepted');
  assert.ok(acceptedHtml.includes('Email reply'), 'Accepted HTML should state confirmation method');
  assert.ok(acceptedHtml.includes('Sarah Connor'), 'Accepted HTML should state authorizer name');
  assert.ok(acceptedHtml.includes('PO #CD-800'), 'Accepted HTML should include paper trail note');
  console.log('✓ Accepted Quote HTML and PDF render verified paper trail banner');

  // 9. Verify conversion to invoice works for accepted quote
  const convertRes = convertQuoteToInvoice(quoteId);
  assert.ok(convertRes.ok, 'Conversion to invoice should succeed');
  assert.ok(convertRes.invoice, 'Invoice should be created');
  const invoice = getInvoice(convertRes.invoice.id);
  assert.strictEqual(invoice.quote_id, quoteId);
  console.log(`✓ Accepted quote converted to invoice ${invoice.invoice_number}`);

  // 10. Test Decline workflow on another quote
  const quote2Res = createQuote(
    {
      client_id: client.id,
      date_created: '2026-09-14',
      total: 1200,
    },
    [
      { description: 'Consultation', quantity: 1, unit_price: 1200, amount: 1200 },
    ]
  );
  const quote2Id = quote2Res.quote.id;
  const declineRes = markQuoteDeclined(quote2Id, {
    note: 'Client postponed budget until Q1 next year',
  });
  assert.ok(declineRes.ok, 'markQuoteDeclined should succeed');
  const quote2 = getQuote(quote2Id);
  assert.strictEqual(quote2.status, 'declined');
  assert.strictEqual(quote2.acceptance_note, 'Client postponed budget until Q1 next year');
  console.log('✓ Quote declined workflow records reason and updates status');

  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('\n========================================');
  console.log('All Quote Acceptance Unit Tests Passed! ✓');
  console.log('========================================\n');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  process.exit(1);
});
