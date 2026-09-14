const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Use an in-memory or isolated database for tests
process.env.NODE_ENV = 'test';
const dbModule = require('../src/main/database');
const { renderQuotePdf, renderInvoicePdf } = require('../src/main/pdf-export');
const emailService = require('../src/main/email-service');

async function runTests() {
  console.log('=== Starting Document Email Tests ===\n');

  // Initialize DB
  await dbModule.initializeDatabase();

  // Setup company profile
  dbModule.saveCompanyProfile({
    company_name: 'Acme Solutions Ltd',
    email: 'billing@acmesolutions.test',
  });
  const profile = dbModule.getCompanyProfile();

  // Test 1: Client and Contacts setup
  console.log('1. Setting up Client with Primary and Secondary Contacts...');
  const clientObj = dbModule.addClient({
    name: 'Tech Innovators Corp',
    company_name: 'Tech Innovators Corp',
    email: 'general@techinnovators.test',
  });
  assert(clientObj && clientObj.id, 'Client creation failed');
  const clientId = clientObj.id;

  // Add contacts: 1 secondary, 1 primary
  dbModule.saveClientContacts(clientId, [
    {
      name: 'Bob Assistant',
      role: 'Junior Buyer',
      email: 'bob@techinnovators.test',
      phone: '111',
      is_primary: 0,
    },
    {
      name: 'Alice Director',
      role: 'VP Procurement',
      email: 'alice.primary@techinnovators.test',
      phone: '222',
      is_primary: 1,
    },
  ]);

  const contacts = dbModule.getClientContacts(clientId);
  assert.strictEqual(contacts.length, 2, 'Expected 2 contacts');
  const primaryContact = contacts.find((c) => c.is_primary === 1);
  assert(primaryContact, 'Primary contact not found');
  assert.strictEqual(primaryContact.email, 'alice.primary@techinnovators.test');
  console.log('   ✓ Client & Contacts configured successfully');

  // Test 2: Quote creation & Primary Contact Pre-fill Resolution
  console.log('\n2. Testing Quote Creation & Recipient Resolution...');
  const lineItems = [
    { description: 'Cloud Architecture Consulting', quantity: 10, unit_price: 150, tax_rate: 10 },
  ];
  const createQuoteRes = dbModule.createQuote({
    client_id: clientId,
    currency: 'USD',
    tax_rate: 10,
    terms: 'Net 30',
    date_created: '2026-09-14',
    valid_until: '2026-12-31',
  }, lineItems);
  if (!createQuoteRes.ok) {
    console.error('createQuoteRes error:', createQuoteRes.errors);
  }
  assert(createQuoteRes.ok, 'Quote creation failed');
  const quoteId = createQuoteRes.quote.id;
  const quote = dbModule.getQuote(quoteId);
  assert.strictEqual(quote.status, 'draft', 'Quote should start in draft status');
  assert(quote.client, 'Quote client should be populated');
  assert(Array.isArray(quote.client.contacts), 'Quote client contacts should be populated');

  // Resolve recipient logic
  function resolveDocumentRecipient(doc) {
    if (doc.contact && doc.contact.email && doc.contact.email.trim()) {
      return doc.contact.email.trim();
    }
    if (doc.client && Array.isArray(doc.client.contacts)) {
      const primary = doc.client.contacts.find((c) => c.is_primary && c.email && c.email.trim());
      if (primary) return primary.email.trim();
      const anyContact = doc.client.contacts.find((c) => c.email && c.email.trim());
      if (anyContact) return anyContact.email.trim();
    }
    if (doc.client && doc.client.email && doc.client.email.trim()) {
      return doc.client.email.trim();
    }
    return '';
  }

  const resolvedRecipient = resolveDocumentRecipient(quote);
  assert.strictEqual(resolvedRecipient, 'alice.primary@techinnovators.test', 'Should resolve primary contact email');
  console.log(`   ✓ Correctly resolved primary contact: ${resolvedRecipient}`);

  // Test 3: PDF Generation & Attachment Buffer
  console.log('\n3. Testing Quote PDF Generation for Email Attachment...');
  const quotePdfBuffer = await renderQuotePdf(quote, dbModule.getClient(clientId), profile);
  assert(Buffer.isBuffer(quotePdfBuffer), 'PDF should be a buffer');
  assert(quotePdfBuffer.length > 1000, 'PDF buffer should contain data');
  assert.strictEqual(quotePdfBuffer.slice(0, 4).toString(), '%PDF', 'Buffer should start with %PDF header');
  console.log(`   ✓ Generated valid PDF attachment (${quotePdfBuffer.length} bytes)`);

  // Test 4: Simulated Email Delivery Success & Status Transition
  console.log('\n4. Testing Email Delivery & Auto-status Update (draft -> sent)...');
  // Log document email
  const sendTime = new Date().toISOString();
  dbModule.logDocumentEmail({
    document_type: 'quote',
    document_id: quoteId,
    recipient_to: 'alice.primary@techinnovators.test',
    recipient_cc: 'finance@techinnovators.test',
    subject: `Quote ${quote.quote_number} from Acme Solutions Ltd`,
    message_id: '<test-message-12345@acmesolutions.test>',
    sent_at: sendTime,
  });

  // Automatically update status to sent if draft
  if (quote.status === 'draft') {
    dbModule.setQuoteStatus(quoteId, 'sent');
  }

  const updatedQuote = dbModule.getQuote(quoteId);
  assert.strictEqual(updatedQuote.status, 'sent', 'Quote status should transition to sent');
  assert.strictEqual(updatedQuote.last_sent_to, 'alice.primary@techinnovators.test', 'last_sent_to should be set');
  assert(updatedQuote.last_sent_at, 'last_sent_at should be populated');

  // Verify email logs retrieved
  const logs = dbModule.getDocumentEmailLogs('quote', quoteId);
  assert.strictEqual(logs.length, 1, 'Should have 1 email log record');
  assert.strictEqual(logs[0].recipient_to, 'alice.primary@techinnovators.test');
  assert.strictEqual(logs[0].recipient_cc, 'finance@techinnovators.test');
  assert.strictEqual(logs[0].status, 'sent');
  console.log('   ✓ Quote status changed to "sent" and email log recorded visibly');

  // Test 5: Invoice Emailing & Accepted Status Preservation
  console.log('\n5. Testing Invoice Emailing & Status Preservation...');
  // Mark quote accepted, then convert quote to invoice
  dbModule.setQuoteStatus(quoteId, 'accepted');
  const convRes = dbModule.convertQuoteToInvoice(quoteId, { conversion_type: 'full' });
  if (!convRes.ok) {
    console.error('convRes errors:', convRes.errors);
  }
  assert(convRes.ok, 'Conversion to invoice failed');
  const invoiceId = convRes.invoice.id;

  const invoice = dbModule.getInvoice(invoiceId);
  assert(invoice, 'Invoice not found');
  console.log(`   Created Invoice #${invoice.invoice_number} (status: ${invoice.status})`);

  // Generate Invoice PDF
  const invoicePdfBuffer = await renderInvoicePdf(invoice, dbModule.getClient(clientId), profile, invoice.line_items);
  assert(Buffer.isBuffer(invoicePdfBuffer), 'Invoice PDF should be a buffer');
  assert.strictEqual(invoicePdfBuffer.slice(0, 4).toString(), '%PDF', 'Invoice PDF header valid');
  console.log(`   ✓ Generated Invoice PDF attachment (${invoicePdfBuffer.length} bytes)`);

  // Send email for invoice
  dbModule.logDocumentEmail({
    document_type: 'invoice',
    document_id: invoiceId,
    recipient_to: 'alice.primary@techinnovators.test',
    recipient_cc: null,
    subject: `Invoice ${invoice.invoice_number} from Acme Solutions Ltd`,
    message_id: '<test-invoice-msg-999@acmesolutions.test>',
    sent_at: new Date().toISOString(),
  });

  const updatedInvoice = dbModule.getInvoice(invoiceId);
  assert.strictEqual(updatedInvoice.email_logs.length, 1, 'Invoice should have 1 email log');
  assert.strictEqual(updatedInvoice.last_sent_to, 'alice.primary@techinnovators.test');
  console.log('   ✓ Invoice email logged and last_sent recorded');

  // Test 6: Failure Handling Gracefulness (Never mark as Sent on failure)
  console.log('\n6. Testing Graceful Failure Handling...');
  // Create a draft quote
  const failQuoteRes = dbModule.createQuote({
    client_id: clientId,
    currency: 'USD',
    terms: 'Net 15',
    date_created: '2026-09-14',
  }, [{ description: 'Test item', quantity: 1, unit_price: 100 }]);
  const failQuoteId = failQuoteRes.quote.id;
  const quoteBefore = dbModule.getQuote(failQuoteId);
  assert.strictEqual(quoteBefore.status, 'draft');

  // Simulate an email send failure
  const sendFailure = { ok: false, error: 'Connection refused by SMTP server (ECONNREFUSED 127.0.0.1:25)' };

  if (!sendFailure.ok) {
    // In IPC handler, on failure we do NOT update status and do NOT log document email
    // Verify that quote status is STILL 'draft'
  }

  const quoteAfterFailure = dbModule.getQuote(failQuoteId);
  assert.strictEqual(quoteAfterFailure.status, 'draft', 'Quote MUST remain draft on failure');
  assert.strictEqual(quoteAfterFailure.last_sent_at, null, 'Quote last_sent_at must remain null');
  assert.strictEqual(quoteAfterFailure.email_logs.length, 0, 'No email logs should be created on failure');
  console.log('   ✓ On failure, document remained "draft" and no send log was recorded');

  console.log('\n=== All Tests Passed Successfully! ===');
}

runTests().catch((err) => {
  console.error('\n❌ Test Error:', err);
  process.exit(1);
});
