const path = require('path');
const fs = require('fs');
const assert = require('assert');

const testDbPath = path.join(__dirname, 'test-audit-log.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  saveCompanyProfile,
  addClient,
  updateClient,
  archiveClient,
  deleteClient,
  createQuote,
  updateQuote,
  setQuoteStatus,
  convertQuoteToInvoice,
  setInvoiceStatus,
  addPayment,
  issueCreditNote,
  getAuditLogEntries,
} = require('../src/main/database');

async function runTests() {
  console.log('--- Starting Audit Trail Unit Tests ---');

  await initializeDatabase();
  console.log('✓ Database initialized');

  // ── 1. Settings change ─────────────────────────────────────
  saveCompanyProfile({ business_name: 'Acme Audit Corp', default_currency: 'USD', invoice_prefix: 'INV-', quote_prefix: 'Q-', credit_note_prefix: 'CN-' });
  let entries = getAuditLogEntries({ recordType: 'settings' });
  assert.ok(entries.length >= 1, 'Should log a settings change');
  assert.strictEqual(entries[0].action, 'settings_changed', 'Settings action type');
  assert.strictEqual(entries[0].entity_type, 'settings', 'Settings entity type');
  console.log('✓ Settings change logged:', entries[0].description);

  // ── 2. Client created / updated / archived / deleted ──────
  const client = addClient({ name: 'Jane Doe', email: 'jane@example.com' });
  assert.ok(client && client.id, 'Client should be created');
  const clientId = client.id;

  const upd = updateClient(clientId, { name: 'Jane Doe-Smith', email: 'jane@example.com' });
  assert.ok(upd, 'Client should be updated');

  const clientEntries = getAuditLogEntries({ recordType: 'client' });
  assert.strictEqual(clientEntries.length, 2, 'Expected created + updated entries');
  assert.strictEqual(clientEntries[0].action, 'updated', 'Newest client entry is the update');
  assert.strictEqual(clientEntries[1].action, 'created', 'Then the create follows');
  assert.ok(/Jane Doe/.test(clientEntries[1].description), 'Create entry names the client');
  console.log('✓ Client create/update logged');

  // ── 3. Quote created / updated / status changed ───────────
  const quoteRes = createQuote(
    {
      client_id: clientId,
      currency: 'USD',
      date_created: '2026-09-15',
      subtotal: 400,
      total: 400,
      terms: 'Net 30',
    },
    [{ description: 'Consulting', quantity: 4, unit_price: 100, tax_rate: 0, amount: 400 }]
  );
  assert.ok(quoteRes.ok, 'Quote should be created: ' + JSON.stringify(quoteRes.errors));
  const quoteId = quoteRes.quote.id;

  const upQuote = updateQuote(
    quoteId,
    {
      client_id: clientId,
      currency: 'USD',
      date_created: '2026-09-15',
      subtotal: 400,
      total: 400,
      terms: 'Net 14',
    },
    [{ description: 'Consulting', quantity: 4, unit_price: 100, tax_rate: 0, amount: 400 }]
  );
  assert.ok(upQuote.ok, 'Quote should be updated: ' + JSON.stringify(upQuote.errors));

  const quoteStatus = setQuoteStatus(quoteId, 'accepted');
  assert.ok(quoteStatus.ok, 'Quote status should change');

  const quoteEntries = getAuditLogEntries({ recordType: 'quote' });
  assert.strictEqual(quoteEntries.length, 3, 'Expected created + updated + status entries');
  assert.strictEqual(quoteEntries[0].action, 'status_changed', 'Newest quote entry is status change');
  assert.strictEqual(quoteEntries[2].action, 'created', 'Oldest quote entry is create');
  console.log('✓ Quote create/update/status logged');

  // ── 4. Invoice created + status changed ───────────────────
  const convRes = convertQuoteToInvoice(quoteId, { status: 'sent' });
  assert.ok(convRes.ok, 'Invoice should be created from quote');
  const invoiceId = convRes.invoice.id;

  const invStatus = setInvoiceStatus(invoiceId, 'paid');
  assert.ok(invStatus.ok, 'Invoice status should update');

  const invEntries = getAuditLogEntries({ recordType: 'invoice' });
  assert.strictEqual(invEntries.length, 2, 'Expected invoice created + status entries');
  assert.strictEqual(invEntries[0].action, 'status_changed', 'Newest invoice entry is status change');
  assert.strictEqual(invEntries[1].action, 'created', 'Invoice created logged');
  console.log('✓ Invoice create/status logged');

  // ── 5. Payment recorded ───────────────────────────────────
  const payRes = addPayment(invoiceId, { amount: 400, payment_method: 'Bank Transfer', reference_number: 'TX-1' });
  assert.ok(payRes.ok, 'Payment should be recorded: ' + JSON.stringify(payRes.errors));

  const payEntries = getAuditLogEntries({ recordType: 'payment' });
  assert.strictEqual(payEntries.length, 1, 'Expected one payment entry');
  assert.strictEqual(payEntries[0].action, 'payment_recorded', 'Payment action type');
  console.log('✓ Payment logged:', payEntries[0].description);

  // ── 6. Credit note issued ─────────────────────────────────
  const cnRes = issueCreditNote(invoiceId, { amount: 100, reason: 'Discount correction' });
  assert.ok(cnRes.ok, 'Credit note should be issued: ' + JSON.stringify(cnRes.errors));

  const cnEntries = getAuditLogEntries({ recordType: 'credit_note' });
  assert.strictEqual(cnEntries.length, 1, 'Expected one credit note entry');
  assert.strictEqual(cnEntries[0].action, 'credit_note_issued', 'Credit note action type');
  console.log('✓ Credit note logged:', cnEntries[0].description);

  // ── 7. Archive + delete client ────────────────────────────
  archiveClient(clientId);
  assert.ok(getAuditLogEntries({ recordType: 'client' }).some((e) => e.action === 'archived'), 'Archive should be logged');

  // Deleting is blocked for clients with quote/invoice history, so use a fresh one.
  const scrapped = addClient({ name: 'Scrappy Doo', email: 'scrappy@example.com' });
  assert.ok(scrapped && scrapped.id, 'Throwaway client should be created');
  const delRes = deleteClient(scrapped.id);
  assert.ok(delRes.ok && delRes.deleted, 'History-free client should be deletable');

  const delEntries = getAuditLogEntries({ recordType: 'client' });
  assert.ok(delEntries.some((e) => e.action === 'deleted'), 'Delete should be logged');
  assert.ok(getAuditLogEntries({ recordType: 'client' }).some((e) => e.action === 'archived'), 'Archive still logged');
  assert.strictEqual(
    getAuditLogEntries({ recordType: 'client' }).filter((e) => e.entity_ref === 'Scrappy Doo').length,
    2,
    'Throwaway client should have created + deleted entries'
  );
  console.log('✓ Client archive/delete logged');

  // ── 8. Full log sanity + ordering ─────────────────────────
  const all = getAuditLogEntries();
  assert.ok(all.length >= 10, 'Should accumulate entries: ' + all.length);
  const times = all.map((e) => e.created_at);
  for (let i = 1; i < times.length; i += 1) {
    assert.ok(times[i - 1] >= times[i], 'Entries must be newest-first');
  }
  console.log('✓ Log ordering newest-first, total entries:', all.length);

  // ── 9. Date range filter ─────────────────────────────────
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const todayOnly = getAuditLogEntries({ from: todayStr, to: todayStr });
  assert.ok(todayOnly.length > 0, 'Entries should exist for today');
  assert.ok(todayOnly.length <= all.length, 'Date filter should not exceed total');

  const pastOnly = getAuditLogEntries({ from: yesterdayStr, to: yesterdayStr });
  assert.strictEqual(pastOnly.length, 0, 'No entries should fall on yesterday');
  console.log('✓ Date range filter works (today matches, yesterday empty)');

  // ── 10. Future-dated range returns nothing yet ────────────
  const future = getAuditLogEntries({ from: tomorrowStr, to: tomorrowStr });
  assert.strictEqual(future.length, 0, 'No entries in a future date range');
  console.log('✓ Future date range is empty');

  // ── 11. Combined type + date filter ───────────────────────
  const combined = getAuditLogEntries({ recordType: 'payment', from: todayStr, to: tomorrowStr });
  assert.strictEqual(combined.length, 1, 'Payment filter + date should yield exactly one entry');
  console.log('✓ Combined type + date filter works');

  console.log('\n--- Audit Trail: ALL TESTS PASSED ---');
}

runTests()
  .catch((err) => {
    console.error('✗ TEST FAILED:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(testDbPath + '-journal')) fs.unlinkSync(testDbPath + '-journal');
      if (fs.existsSync(testDbPath + '-wal')) fs.unlinkSync(testDbPath + '-wal');
      if (fs.existsSync(testDbPath + '-shm')) fs.unlinkSync(testDbPath + '-shm');
    } catch (e) {
      /* ignore */
    }
  });