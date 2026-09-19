const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Isolated temp DB — MUST be set BEFORE require('../src/main/database')
const testDbPath = path.join(__dirname, 'test-invoice-from-time.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  saveCompanyProfile,
  addClient,
  addProject,
  createTimeEntry,
  getTimeEntry,
  updateTimeEntry,
  listTimeEntries,
  listInvoices,
  getInvoice,
  createInvoiceFromTimeEntries,
  unbillTimeEntriesForInvoice,
} = require('../src/main/database');

async function runTests() {
  console.log('--- Starting Invoice From Time Tests ---');
  await initializeDatabase();
  console.log('✓ Database initialized');

  // ---------- Fixtures ----------
  saveCompanyProfile({
    business_name: 'Freelancer Co',
    default_currency: 'USD',
    default_tax_rate: '10',
    default_terms: 'Net 14 days',
  });

  const clientA = addClient({ name: 'Acme Corp', status: 'active' });
  const clientB = addClient({ name: 'Globex', status: 'active' });
  assert.ok(clientA && clientA.id, 'Client A should be created');
  assert.ok(clientB && clientB.id, 'Client B should be created');

  const p1 = addProject({ client_id: clientA.id, name: 'Website Redesign', status: 'active', hourly_rate: '80', start_date: '2026-09-01' });
  const p2 = addProject({ client_id: clientA.id, name: 'Brand Refresh', status: 'active', start_date: '2026-09-01' });
  assert.strictEqual(p1.ok, true, 'Project 1 created');
  assert.strictEqual(p2.ok, true, 'Project 2 created');
  const p1Id = p1.project.id;
  const p2Id = p2.project.id;

  // e1/e2: 80/h (project rate), e3: 120/h (explicit), e4: 50/h (explicit, no project)
  const e1 = createTimeEntry({ client_id: clientA.id, project_id: p1Id, date: '2026-09-02', description: 'Wireframes', hours: '2.5', hourly_rate: '' });
  const e2 = createTimeEntry({ client_id: clientA.id, project_id: p1Id, date: '2026-09-03', description: 'Build pages', hours: '3', hourly_rate: '' });
  const e3 = createTimeEntry({ client_id: clientA.id, project_id: p2Id, date: '2026-09-04', description: 'Logo concepts', hours: '1.5', hourly_rate: '120' });
  const e4 = createTimeEntry({ client_id: clientA.id, date: '2026-09-05', description: 'Consulting call', hours: '2', hourly_rate: '50' });
  [e1, e2, e3, e4].forEach((r, i) => assert.strictEqual(r.ok, true, 'Entry ' + (i + 1) + ' created'));

  const id1 = e1.entry.id;
  const id2 = e2.entry.id;
  const id3 = e3.entry.id;
  const id4 = e4.entry.id;
  console.log('✓ Fixtures created (4 unbilled entries at rates 80/80/120/50)');

  // ---------- 1. Create invoice from a subset (client-scoped) ----------
  const r1 = createInvoiceFromTimeEntries({
    client_id: clientA.id,
    entry_ids: [id1, id2, id3],
  });
  assert.strictEqual(r1.ok, true, 'Invoice creation should succeed');
  assert.ok(r1.invoice && r1.invoice.id, 'Invoice should be returned');
  assert.strictEqual(r1.billedCount, 3, 'Three entries billed');

  const inv1 = r1.invoice;
  assert.strictEqual(inv1.invoice_type, 'standard', 'Not a special invoice type');
  assert.strictEqual(inv1.status, 'draft', 'Starts as a draft');
  assert.strictEqual(inv1.quote_id, null, 'Standalone (no source quote)');
  assert.match(String(inv1.invoice_number), /^INV-\d{4}-\d+$/, 'Uses the normal invoice numbering');
  assert.strictEqual(inv1.currency, 'USD', 'Company default currency');
  assert.strictEqual(Number(inv1.subtotal), 620, 'Subtotal = 5.5*80 + 1.5*120');
  assert.strictEqual(Number(inv1.tax_amount), 62, 'Tax = 10% of subtotal');
  assert.strictEqual(Number(inv1.total), 682, 'Total = subtotal + tax');
  assert.strictEqual(Number(inv1.balance_due), 682, 'Balance = total');
  assert.strictEqual(Number(inv1.amount_paid), 0, 'Nothing paid yet');
  console.log('✓ Standard draft invoice with normal numbering/status/calculation');

  // ---------- 2. Grouped one line per distinct rate ----------
  assert.strictEqual(inv1.line_items.length, 2, 'Two distinct rates -> two grouped lines');
  const line80 = inv1.line_items.find((l) => Number(l.unit_price) === 80);
  const line120 = inv1.line_items.find((l) => Number(l.unit_price) === 120);
  assert.ok(line80, 'A grouped 80/h line exists');
  assert.ok(line120, 'A grouped 120/h line exists');
  assert.strictEqual(Number(line80.quantity), 5.5, '80/h line sums 2.5 + 3 hours');
  assert.strictEqual(Number(line80.tax_rate), 10, 'Line carries company default tax rate');
  assert.strictEqual(Number(line80.amount), 484, '80/h line amount = 440 + 10% tax');
  assert.strictEqual(Number(line120.quantity), 1.5, '120/h line has 1.5 hours');
  assert.strictEqual(Number(line120.amount), 198, '120/h line amount = 180 + 10% tax');
  console.log('✓ Grouped per rate: hours summed, amounts = hours x rate (+tax)');

  // ---------- 3. Included entries are Billed, locked, and linked ----------
  [id1, id2, id3].forEach((id) => {
    const ent = getTimeEntry(id);
    assert.strictEqual(Number(ent.billed), 1, 'Entry ' + id + ' is Billed');
    assert.strictEqual(Number(ent.invoice_id), Number(inv1.id), 'Entry ' + id + ' links to the invoice');
    assert.strictEqual(ent.invoice_number, inv1.invoice_number, 'Entry exposes the invoice number');
  });
  const locked = updateTimeEntry(id1, { client_id: clientA.id, date: '2026-09-02', description: 'Try edit', hours: '1', hourly_rate: '' });
  assert.strictEqual(locked.ok, false, 'Billed entry can no longer be edited');
  assert.strictEqual(locked.locked, true, 'Lock is reported');
  console.log('✓ Selected entries marked Billed, linked to invoice, and locked');

  // ---------- 4. Unselected entries stay Unbilled and re-invoiceable ----------
  const stillOpen = getTimeEntry(id4);
  assert.strictEqual(Number(stillOpen.billed), 0, 'Unselected entry remains Unbilled');
  assert.strictEqual(stillOpen.invoice_id, null, 'Unselected entry has no invoice link');

  const openForClient = listTimeEntries({ client_id: clientA.id, billed: 'unbilled' });
  assert.strictEqual(openForClient.length, 1, 'Exactly one unbilled entry remains for the client');
  assert.strictEqual(openForClient[0].id, id4, 'The remaining unbilled entry is the unselected one');
  console.log('✓ Unselected entry stays Unbilled and available for a future invoice');

  // ---------- 5. Second invoice from the remaining entry ----------
  const r2 = createInvoiceFromTimeEntries({ client_id: clientA.id, entry_ids: [id4] });
  assert.strictEqual(r2.ok, true, 'Second invoice succeeds from the leftover entry');
  assert.notStrictEqual(r2.invoice.invoice_number, inv1.invoice_number, 'Numbering advances');
  assert.strictEqual(Number(r2.invoice.total), 110, '2h x 50 + 10% tax = 110');
  assert.strictEqual(Number(getTimeEntry(id4).billed), 1, 'Leftover entry now Billed');
  assert.strictEqual(listTimeEntries({ client_id: clientA.id, billed: 'unbilled' }).length, 0, 'No unbilled entries left');
  console.log('✓ Remaining entry can be invoiced separately (no double-billing)');

  // ---------- 6. Already-billed entries are refused, no dangling invoice ----------
  const invoicesBefore = listInvoices().length;
  const r3 = createInvoiceFromTimeEntries({ client_id: clientA.id, entry_ids: [id1] });
  assert.strictEqual(r3.ok, false, 'Re-using a billed entry is rejected');
  assert.ok(r3.errors.general, 'A general error is returned');
  assert.strictEqual(listInvoices().length, invoicesBefore, 'No partial/dangling invoice was created');
  console.log('✓ Already-billed entry rejected inside the transaction (no rows left behind)');

  // ---------- 7. Validation ----------
  let v = createInvoiceFromTimeEntries({ client_id: clientA.id, entry_ids: [] });
  assert.strictEqual(v.ok, false, 'Empty selection rejected');
  assert.ok(v.errors.entry_ids, 'entry_ids error expected');

  v = createInvoiceFromTimeEntries({ entry_ids: [id1] });
  assert.strictEqual(v.ok, false, 'Missing client rejected');
  assert.ok(v.errors.client_id, 'client_id error expected');

  v = createInvoiceFromTimeEntries({ client_id: clientB.id, entry_ids: [id1] });
  assert.strictEqual(v.ok, false, 'Entry from another client rejected');

  const pB = addProject({ client_id: clientB.id, name: 'Other', status: 'active', start_date: '2026-09-01' });
  v = createInvoiceFromTimeEntries({ client_id: clientA.id, project_id: pB.project.id, entry_ids: [id1] });
  assert.strictEqual(v.ok, false, 'Project from another client rejected');
  console.log('✓ Validation: empty selection, missing client, cross-client entry/project');

  // ---------- 8. Delete-future-proof unbill helper ----------
  const inv1Id = inv1.id;
  const unbilled = unbillTimeEntriesForInvoice(inv1Id);
  assert.strictEqual(unbilled.ok, true, 'unbill helper succeeds');
  assert.strictEqual(unbilled.count, 3, 'All three entries reverted');
  [id1, id2, id3].forEach((id) => {
    const ent = getTimeEntry(id);
    assert.strictEqual(Number(ent.billed), 0, 'Entry ' + id + ' restored to Unbilled');
    assert.strictEqual(ent.invoice_id, null, 'Entry ' + id + ' invoice link cleared');
  });
  const r4 = createInvoiceFromTimeEntries({ client_id: clientA.id, entry_ids: [id1, id2, id3] });
  assert.strictEqual(r4.ok, true, 'Reverted entries can be billed again on a new invoice');
  console.log('✓ Unbill helper restores entries (future delete/void safe, no broken state)');

  console.log('--- All Invoice From Time tests passed ---');
}

runTests()
  .catch((err) => {
    console.error('Invoice-from-time test failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });
