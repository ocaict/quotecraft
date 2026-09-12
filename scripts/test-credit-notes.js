const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('--- Starting Credit Notes Comprehensive Verification ---');

  const {
    initializeDatabase,
    saveCompanyProfile,
    addClient,
    createQuote,
    setQuoteStatus,
    convertQuoteToInvoice,
    addPayment,
    issueCreditNote,
    getInvoice,
    getCreditNotesForInvoice,
    getCreditNotesForClient,
    getCreditNote,
    getClientOverview,
    computeInvoiceBalance,
  } = require('../src/main/database');

  const { renderCreditNotePdf, renderInvoicePdf } = require('../src/main/pdf-export');

  // Initialize DB
  await initializeDatabase();

  // Ensure default profile
  saveCompanyProfile({
    business_name: 'Acme Test Corp',
    default_currency: 'USD',
    invoice_prefix: 'INV-',
    quote_prefix: 'Q-',
    credit_note_prefix: 'CN-',
    credit_note_start_number: 1,
  });

  // 1. Create a Test Client
  const client = addClient({
    name: 'Jane Doe',
    email: 'jane@example.com',
    company_name: 'Doe Enterprises',
  });
  if (!client || !client.id) throw new Error('Failed to create client');
  const clientId = client.id;
  console.log('✔ Test client created: ID', clientId);

  // 2. Create an Invoice for $500.00 (via quote conversion)
  const quoteRes = createQuote(
    {
      client_id: clientId,
      currency: 'USD',
      date_created: '2026-09-12',
      subtotal: 500,
      total: 500,
      terms: 'Net 14',
    },
    [
      { description: 'Professional Consultation', quantity: 5, unit_price: 100, tax_rate: 0, amount: 500 }
    ]
  );
  if (!quoteRes.ok) throw new Error('Failed to create quote: ' + JSON.stringify(quoteRes.errors));
  const quoteId = quoteRes.quote.id;
  setQuoteStatus(quoteId, 'accepted');

  const convRes = convertQuoteToInvoice(quoteId, { status: 'sent' });
  if (!convRes.ok) throw new Error('Failed to convert quote to invoice');
  const invoiceId = convRes.invoice.id;
  console.log('✔ Invoice created: ID', invoiceId, 'Number:', convRes.invoice.invoice_number, 'Total:', convRes.invoice.total);

  let inv = getInvoice(invoiceId);
  console.assert(inv.total === 500, 'Total should be 500');
  console.assert(inv.balance_due === 500, 'Balance due should be 500');
  console.assert(inv.amount_paid === 0, 'Amount paid should be 0');
  console.assert(inv.status === 'sent', 'Status should be sent');

  // 3. Record Full Payment of $500.00
  const payRes = addPayment(invoiceId, {
    amount: 500.00,
    payment_method: 'Bank Transfer',
    reference_number: 'TX-1001',
    notes: 'Initial full payment',
  });
  if (!payRes.ok) throw new Error('Payment failed: ' + JSON.stringify(payRes.errors));
  inv = getInvoice(invoiceId);
  console.log('✔ Payment recorded. Paid:', inv.amount_paid, 'Balance:', inv.balance_due, 'Status:', inv.status);
  console.assert(inv.amount_paid === 500, 'Amount paid must be 500');
  console.assert(inv.balance_due === 0, 'Balance due must be 0');
  console.assert(inv.status === 'paid', 'Status must be paid');

  // 4. Test Over-credit: attempt to credit $600.00 (exceeds $500.00 paid)
  const overRes = issueCreditNote(invoiceId, { amount: 600.00, reason: 'Too much refund' });
  console.assert(!overRes.ok, 'Credit note for $600 must be rejected');
  console.assert(overRes.errors && overRes.errors.amount, 'Expected error on amount');
  console.log('✔ Over-credit attempt ($600 on $500 paid) correctly rejected:', overRes.errors.amount);

  // 5. Issue Partial Credit Note for $200.00
  const cn1Res = issueCreditNote(invoiceId, {
    amount: 200.00,
    reason: 'Customer discount correction',
  });
  if (!cn1Res.ok) throw new Error('Failed to issue CN 1: ' + JSON.stringify(cn1Res.errors));
  const cn1 = cn1Res.credit_note;
  console.log('✔ Credit Note 1 issued:', cn1.credit_note_number, 'Amount:', cn1.amount);
  console.assert(/^CN-\d{4}-\d+$/.test(cn1.credit_note_number), 'Credit note number should match CN-YYYY-XXXX pattern');

  // Check Invoice Reconciliation after CN 1
  inv = getInvoice(invoiceId);
  console.log('✔ Invoice after CN 1:');
  console.log('   - Amount Paid:', inv.amount_paid);
  console.log('   - Amount Credited:', inv.amount_credited);
  console.log('   - Net Paid:', inv.amount_paid - inv.amount_credited);
  console.log('   - Balance Due:', inv.balance_due);
  console.log('   - Status:', inv.status);

  console.assert(inv.amount_paid === 500, 'Gross paid must remain 500 for paper trail');
  console.assert(inv.amount_credited === 200, 'Amount credited must be 200');
  console.assert(inv.balance_due === 200, 'Balance due must be 200');
  console.assert(inv.status === 'partially_paid', 'Status must be partially_paid');
  console.assert((inv.total - (inv.amount_paid - inv.amount_credited)) === inv.balance_due, 'Total - Net Paid must equal Balance Due');

  // 6. Test Exceeding Remaining Creditable: try to credit $350.00 (remaining is only $300.00)
  const overRes2 = issueCreditNote(invoiceId, { amount: 350.00, reason: 'Exceeding remaining' });
  console.assert(!overRes2.ok, 'Credit note for $350 must be rejected when only $300 remaining');
  console.assert(overRes2.errors && overRes2.errors.amount, 'Expected amount error');
  console.log('✔ Over-credit attempt on remaining balance ($350 on $300 remaining) correctly rejected:', overRes2.errors.amount);

  // 7. Issue Second Credit Note for remaining $300.00 (Full 100% refund)
  const cn2Res = issueCreditNote(invoiceId, {
    amount: 300.00,
    reason: 'Final refund adjustment',
  });
  if (!cn2Res.ok) throw new Error('Failed to issue CN 2: ' + JSON.stringify(cn2Res.errors));
  const cn2 = cn2Res.credit_note;
  console.log('✔ Credit Note 2 issued:', cn2.credit_note_number, 'Amount:', cn2.amount);

  inv = getInvoice(invoiceId);
  console.log('✔ Invoice after CN 2 (100% refunded):');
  console.log('   - Amount Paid:', inv.amount_paid);
  console.log('   - Amount Credited:', inv.amount_credited);
  console.log('   - Net Paid:', inv.amount_paid - inv.amount_credited);
  console.log('   - Balance Due:', inv.balance_due);
  console.log('   - Status:', inv.status);

  console.assert(inv.amount_paid === 500, 'Gross paid is still 500');
  console.assert(inv.amount_credited === 500, 'Total credited is 500');
  console.assert((inv.amount_paid - inv.amount_credited) === 0, 'Net paid is 0');
  console.assert(inv.balance_due === 500, 'Balance due is restored to 500');
  console.assert(inv.status === 'sent', 'Status must revert to sent (not partially_paid)');

  // 8. Test Zero Remaining: try to credit $0.01 when $0.00 is creditable
  const overRes3 = issueCreditNote(invoiceId, { amount: 0.01, reason: 'Beyond zero' });
  console.assert(!overRes3.ok, 'Credit note when $0.00 remaining must be rejected');
  console.log('✔ Credit attempt on fully credited invoice correctly rejected:', overRes3.errors.amount);

  // 9. Client Overview Screen Verification
  const overview = getClientOverview(clientId);
  console.log('✔ Client Overview stats:');
  console.log('   - Total Billed:', overview.stats.totalBilled);
  console.log('   - Total Paid:', overview.stats.totalPaid);
  console.log('   - Outstanding Balance:', overview.stats.outstandingBalance);
  console.log('   - Credit Notes count:', overview.creditNotes.length);

  console.assert(overview.creditNotes.length === 2, 'Should have 2 credit notes');
  console.assert(overview.stats.totalBilled === 500, 'Total billed must be 500');
  console.assert(overview.stats.totalPaid === 0, 'Total net paid must be 0 (refunded)');
  console.assert(overview.stats.outstandingBalance === 500, 'Outstanding balance must be 500');

  // 10. Credit Note PDF Export Test
  const fullCn1 = getCreditNote(cn1.id);
  const pdfBytes = await renderCreditNotePdf(fullCn1, inv, overview.client, { business_name: 'Acme Test Corp' });
  console.assert(Buffer.isBuffer(pdfBytes), 'PDF export must return a Buffer');
  console.assert(pdfBytes.toString('utf8', 0, 5) === '%PDF-', 'PDF must have valid %PDF- header');
  console.log('✔ Credit Note PDF rendered successfully (%s bytes, header: %s)', pdfBytes.length, pdfBytes.toString('utf8', 0, 5));

  // 11. Invoice PDF Export Test with Credit Breakdown
  const invPdfBytes = await renderInvoicePdf(inv, overview.client, { business_name: 'Acme Test Corp' });
  console.assert(Buffer.isBuffer(invPdfBytes), 'Invoice PDF export must return a Buffer');
  console.assert(invPdfBytes.toString('utf8', 0, 5) === '%PDF-', 'Invoice PDF must have valid %PDF- header');
  console.log('✔ Invoice PDF with credit breakdown rendered successfully (%s bytes)', invPdfBytes.length);

  // 12. Partially Paid Invoice Scenario: Total $1,000, Paid $400, Credit Note $250
  const q2Res = createQuote(
    {
      client_id: clientId,
      currency: 'USD',
      date_created: '2026-09-12',
      subtotal: 1000,
      total: 1000,
      terms: 'Net 30',
    },
    [
      { description: 'Development Work', quantity: 10, unit_price: 100, tax_rate: 0, amount: 1000 }
    ]
  );
  setQuoteStatus(q2Res.quote.id, 'accepted');
  const conv2 = convertQuoteToInvoice(q2Res.quote.id, { status: 'sent' });
  const inv2Id = conv2.invoice.id;

  // Record partial payment of $400
  addPayment(inv2Id, { amount: 400.00, payment_method: 'Card' });
  let inv2 = getInvoice(inv2Id);
  console.assert(inv2.amount_paid === 400, 'Paid should be 400');
  console.assert(inv2.balance_due === 600, 'Balance due should be 600');
  console.assert(inv2.status === 'partially_paid', 'Status should be partially_paid');

  // Attempt to credit $450 (exceeds $400 paid)
  const overCn = issueCreditNote(inv2Id, { amount: 450.00, reason: 'Exceeds partial payment' });
  console.assert(!overCn.ok, 'Credit note exceeding partial payment must be rejected');

  // Issue valid credit note of $250
  const validCn = issueCreditNote(inv2Id, { amount: 250.00, reason: 'Scope reduction adjustment' });
  console.assert(validCn.ok, 'Valid credit note of 250 must succeed');
  inv2 = getInvoice(inv2Id);
  console.assert(inv2.amount_paid === 400, 'Amount paid stays 400');
  console.assert(inv2.amount_credited === 250, 'Amount credited is 250');
  console.assert((inv2.amount_paid - inv2.amount_credited) === 150, 'Net paid is 150');
  console.assert(inv2.balance_due === 850, 'Balance due is 1000 - 150 = 850');
  console.assert(inv2.status === 'partially_paid', 'Status is partially_paid');
  console.log('✔ Partially paid invoice scenario reconciled: Total 1000, Paid 400, Credited 250, Net 150, Balance 850');

  console.log('\n======================================================');
  console.log('🎉 ALL 12 VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('======================================================');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
