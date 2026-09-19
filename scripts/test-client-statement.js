const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Isolated temp DB — MUST be set BEFORE require('../src/main/database')
const testDbPath = path.join(__dirname, 'test-client-statement.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  getDb,
  saveCompanyProfile,
  addClient,
  createTimeEntry,
  createInvoiceFromTimeEntries,
  setInvoiceStatus,
  addPayment,
  issueCreditNote,
  getClientStatement,
} = require('../src/main/database');

const RANGE_START = '2026-03-01';
const RANGE_END = '2026-03-31';

function createStandardInvoice(clientId, { total, date }) {
  const entry = createTimeEntry({
    client_id: clientId,
    date,
    description: 'Billable work',
    hours: '1',
    hourly_rate: String(total),
  });
  assert.strictEqual(entry.ok, true, 'Time entry created for invoice ' + total);
  const res = createInvoiceFromTimeEntries({
    client_id: clientId,
    entry_ids: [entry.entry.id],
    date_created: date,
  });
  assert.strictEqual(res.ok, true, 'Invoice created for total ' + total);
  assert.strictEqual(Number(res.invoice.total), Number(total), 'Invoice total matches the time entry rate');
  return res.invoice;
}

function backdateCreditNote(creditNoteId, date) {
  getDb().run('UPDATE credit_notes SET date_created = ? WHERE id = ?', [date, creditNoteId]);
}

async function runTests() {
  console.log('--- Starting Client Statement Tests ---');
  await initializeDatabase();
  console.log('✓ Database initialized');

  saveCompanyProfile({
    business_name: 'Freelancer Co',
    default_currency: 'USD',
    default_tax_rate: '0',
  });

  const clientA = addClient({
    name: 'Acme Corp',
    company_name: 'Acme Industries',
    email: 'billing@acme.test',
    phone: '555-0100',
    address_line1: '1 Acme Way',
    city: 'Springfield',
    state: 'IL',
    postal_code: '62701',
    country: 'USA',
    status: 'active',
  });
  const clientB = addClient({ name: 'Globex', status: 'active' });
  assert.ok(clientA && clientA.id, 'Client A created');
  assert.ok(clientB && clientB.id, 'Client B created');

  // ---------- Fixtures (all for client A) ----------
  const invOld = createStandardInvoice(clientA.id, { total: 100, date: '2026-01-15' });
  const invStart = createStandardInvoice(clientA.id, { total: 40, date: RANGE_START });
  const invIn1 = createStandardInvoice(clientA.id, { total: 200, date: '2026-03-05' });
  const invIn2 = createStandardInvoice(clientA.id, { total: 300, date: '2026-03-20' });
  const invDraft = createStandardInvoice(clientA.id, { total: 999, date: '2026-03-10' });
  const invEnd = createStandardInvoice(clientA.id, { total: 60, date: RANGE_END });
  console.log('✓ Invoices created (old/start/in1/in2/draft/end)');

  [invOld, invStart, invIn1, invIn2, invEnd].forEach((inv) => {
    const r = setInvoiceStatus(inv.id, 'sent');
    assert.strictEqual(r.ok, true, 'Invoice marked sent: ' + inv.invoice_number);
  });

  // invOld must still be recorded as 'sent' with a pre-range payment
  const payOld = addPayment(invOld.id, { amount: 40, payment_date: '2026-02-10', payment_method: 'Bank transfer' });
  assert.strictEqual(payOld.ok, true, 'Pre-range payment recorded');

  const pay1 = addPayment(invIn1.id, { amount: 50, payment_date: '2026-03-10', payment_method: 'Card' });
  assert.strictEqual(pay1.ok, true, 'In-range payment 1 recorded');
  const pay2 = addPayment(invIn2.id, { amount: 100, payment_date: '2026-03-25', payment_method: 'Cash' });
  assert.strictEqual(pay2.ok, true, 'In-range payment 2 recorded');

  // Credit note on invIn1 backdated before the range (opening), amount <= paid (50)
  const cnOld = issueCreditNote(invIn1.id, { amount: 10, reason: 'Overcharge' });
  assert.strictEqual(cnOld.ok, true, 'Pre-range credit note issued');
  backdateCreditNote(cnOld.credit_note.id, '2026-02-15');

  // Credit note on invIn2 inside the range, amount <= paid (100)
  const cnIn = issueCreditNote(invIn2.id, { amount: 25, reason: 'Small refund' });
  assert.strictEqual(cnIn.ok, true, 'In-range credit note issued');
  backdateCreditNote(cnIn.credit_note.id, '2026-03-26');
  console.log('✓ Payments + credit notes placed before/inside the range');

  // Make invIn1 overdue: its due date is in the past and it still has a balance
  // (200 invoiced - 50 paid + 10 credited = 160 outstanding).
  const pastDue = new Date();
  pastDue.setDate(pastDue.getDate() - 30);
  const pastDueStr = pastDue.toISOString().slice(0, 10);
  getDb().run('UPDATE invoices SET date_due = ? WHERE id = ?', [pastDueStr, invIn1.id]);
  console.log('✓ invIn1 backdated to be overdue (' + pastDueStr + ')');

  // ---------- 1. Opening balance + counts ----------
  const res = getClientStatement({ client_id: clientA.id, startDate: RANGE_START, endDate: RANGE_END });
  assert.strictEqual(res.ok, true, 'Statement generated');
  assert.strictEqual(res.currency, 'USD', 'Reporting currency resolved');
  assert.strictEqual(res.hasForeignCurrency, false, 'No foreign currency for client A');
  assert.strictEqual(res.openingBalance, 70, 'Opening = 100 invoiced - 40 paid + 10 credited');
  assert.strictEqual(res.counts.invoices, 4, 'Four in-range invoices (draft excluded)');
  assert.strictEqual(res.counts.payments, 2, 'Two in-range payments');
  assert.strictEqual(res.counts.creditNotes, 1, 'One in-range credit note');
  assert.strictEqual(res.rows.length, 7, 'Seven in-range rows');
  console.log('✓ Opening balance 70 and range counts (draft excluded)');

  // Client record is passed through in full so the PDF can render the address.
  assert.strictEqual(res.client.name, 'Acme Corp', 'Client name passed through');
  assert.strictEqual(res.client.company_name, 'Acme Industries', 'Client company passed through');
  assert.strictEqual(res.client.email, 'billing@acme.test', 'Client email passed through');
  assert.strictEqual(res.client.address_line1, '1 Acme Way', 'Client address passed through for the PDF');
  assert.strictEqual(res.client.city, 'Springfield', 'Client city passed through for the PDF');
  console.log('✓ Full client record available for PDF rendering');

  // ---------- 2. Draft excluded ----------
  assert.ok(!res.rows.some((r) => r.reference === invDraft.invoice_number), 'Draft invoice never appears');
  assert.strictEqual(res.totals.invoiced, 600, 'Draft total 999 is not counted (40 + 200 + 300 + 60)');
  console.log('✓ Draft invoice excluded from rows and totals');

  // ---------- 3. Boundaries + chronological order + running balance ----------
  const dates = res.rows.map((r) => r.date);
  const sorted = [...dates].sort();
  assert.deepStrictEqual(dates, sorted, 'Rows are sorted ascending by date');
  assert.strictEqual(res.rows[0].reference, invStart.invoice_number, 'Start-date invoice is the first row (inclusive)');
  assert.strictEqual(res.rows[res.rows.length - 1].reference, invEnd.invoice_number, 'End-date invoice is the last row (inclusive)');

  const expectedBalances = [110, 310, 260, 560, 460, 485, 545];
  assert.deepStrictEqual(res.rows.map((r) => r.balance), expectedBalances, 'Running balance column is correct');
  assert.strictEqual(res.closingBalance, 545, 'Closing = opening + charges - credits');
  console.log('✓ Inclusive boundaries, chronology, running balance, closing balance');

  // ---------- 4. Row classification + credit note direction ----------
  const startRow = res.rows[0];
  assert.strictEqual(startRow.type, 'invoice', 'First row is an invoice');
  assert.strictEqual(startRow.charge, 40, 'Invoice is a charge');

  const payRow = res.rows.find((r) => r.type === 'payment');
  assert.strictEqual(payRow.credit, 50, 'Payment is a credit');
  assert.strictEqual(payRow.charge, 0, 'Payment has no charge');

  const cnRow = res.rows.find((r) => r.type === 'credit_note');
  assert.strictEqual(cnRow.charge, 25, 'Credit note is a charge (increases amount owed)');
  assert.strictEqual(cnRow.credit, 0, 'Credit note has no credit');
  assert.ok(payRow.description.includes(invIn1.invoice_number), 'Payment description references its invoice');
  console.log('✓ Invoice/payment/credit-note classification and description');

  // ---------- 5. Totals ----------
  assert.strictEqual(res.totals.charges, 625, 'Charges = 600 invoiced + 25 credited');
  assert.strictEqual(res.totals.credits, 150, 'Credits = payments received');
  assert.strictEqual(res.totals.paid, 150, 'Paid total');
  assert.strictEqual(res.totals.credited, 25, 'Credit note total');
  assert.strictEqual(res.totals.netChange, 475, 'Net change = 625 - 150');
  console.log('✓ Period totals consistent');

  // ---------- 6. Client isolation ----------
  const resB = getClientStatement({ client_id: clientB.id, startDate: RANGE_START, endDate: RANGE_END });
  assert.strictEqual(resB.ok, true, 'Client B statement generated');
  assert.strictEqual(resB.openingBalance, 0, 'Client B has no opening balance');
  assert.strictEqual(resB.closingBalance, 0, 'Client B has no activity');
  assert.strictEqual(resB.rows.length, 0, 'Client B has no rows');
  console.log('✓ Statements are isolated per client');

  // ---------- 7. Foreign-currency normalization ----------
  const invFx = createStandardInvoice(clientB.id, { total: 100, date: '2026-03-15' });
  setInvoiceStatus(invFx.id, 'sent');
  getDb().run("UPDATE invoices SET currency = 'EUR', exchange_rate = 2.0 WHERE id = ?", [invFx.id]);

  const resFx = getClientStatement({ client_id: clientB.id, startDate: RANGE_START, endDate: RANGE_END });
  assert.strictEqual(resFx.ok, true, 'FX statement generated');
  assert.strictEqual(resFx.hasForeignCurrency, true, 'Foreign currency flag is set');
  assert.strictEqual(resFx.currency, 'USD', 'Normalized to base currency');
  assert.strictEqual(resFx.totals.invoiced, 200, 'EUR 100 at rate 2.0 normalizes to USD 200');
  assert.strictEqual(resFx.closingBalance, 200, 'Closing balance is normalized');
  console.log('✓ Amounts normalized to the reporting currency');

  // ---------- 8. Overdue aggregation (relative to today) ----------
  assert.strictEqual(res.overdue.hasOverdue, true, 'Statement reports an overdue balance');
  assert.strictEqual(res.overdue.balance, 160, 'invIn1: 200 - 50 paid + 10 credited = 160 overdue');
  assert.strictEqual(res.overdue.count, 1, 'Only the backdated invoice is overdue');
  assert.strictEqual(res.overdue.earliestDueDate, pastDueStr, 'Earliest overdue due date reported');
  assert.strictEqual(res.overdue.asOf, new Date().toISOString().slice(0, 10), 'Overdue is measured as of today');
  assert.strictEqual(resB.overdue.hasOverdue, false, 'Client B has nothing overdue');
  assert.strictEqual(resFx.overdue.hasOverdue, false, 'A future-due invoice is not overdue');
  console.log('✓ Overdue balance, count, earliest due date and as-of date');

  // ---------- 9. Validation ----------
  let v = getClientStatement({ startDate: RANGE_START, endDate: RANGE_END });
  assert.strictEqual(v.ok, false, 'Missing client rejected');
  assert.ok(v.errors.client_id, 'client_id error expected');

  v = getClientStatement({ client_id: 999999, startDate: RANGE_START, endDate: RANGE_END });
  assert.strictEqual(v.ok, false, 'Unknown client rejected');
  assert.ok(v.errors.client_id, 'client_id error for unknown client');

  v = getClientStatement({ client_id: clientA.id, startDate: 'not-a-date', endDate: RANGE_END });
  assert.strictEqual(v.ok, false, 'Invalid start date rejected');
  assert.ok(v.errors.range, 'range error expected');

  v = getClientStatement({ client_id: clientA.id, startDate: RANGE_END, endDate: RANGE_START });
  assert.strictEqual(v.ok, false, 'Reversed range rejected');
  assert.ok(v.errors.range, 'range error for reversed dates');
  console.log('✓ Validation: missing/unknown client, invalid + reversed range');

  console.log('--- All Client Statement tests passed ---');
}

runTests()
  .catch((err) => {
    console.error('Client statement test failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });
