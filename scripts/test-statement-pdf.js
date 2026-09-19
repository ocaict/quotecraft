const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Isolated temp DB — MUST be set BEFORE require('../src/main/database')
const testDbPath = path.join(__dirname, 'test-statement-pdf.sqlite');
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
  getClientStatement,
} = require('../src/main/database');
const { renderClientStatementPdf } = require('../src/main/pdf-export');

function looksLikePdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 1000 && buffer.slice(0, 5).toString('latin1') === '%PDF-';
}

async function runTests() {
  console.log('--- Starting Client Statement PDF Tests ---');
  await initializeDatabase();
  console.log('✓ Database initialized');

  const profile = saveCompanyProfile({
    business_name: 'Freelancer Co',
    email: 'hello@freelancer.test',
    address_line1: '10 Market Street',
    city: 'Lagos',
    state: 'LA',
    postal_code: '100001',
    country: 'Nigeria',
    default_currency: 'USD',
    default_tax_rate: '0',
  });

  const client = addClient({
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

  // Two invoices: one overdue with a remaining balance, one future-due and paid.
  const overdue = createTimeEntry({ client_id: client.id, date: '2026-03-05', description: 'Billable work', hours: '1', hourly_rate: '300' });
  const invOverdue = createInvoiceFromTimeEntries({ client_id: client.id, entry_ids: [overdue.entry.id], date_created: '2026-03-05' });
  assert.strictEqual(invOverdue.ok, true, 'Overdue invoice created');
  setInvoiceStatus(invOverdue.invoice.id, 'sent');
  const paid = createTimeEntry({ client_id: client.id, date: '2026-03-10', description: 'Billable work', hours: '1', hourly_rate: '100' });
  const invPaid = createInvoiceFromTimeEntries({ client_id: client.id, entry_ids: [paid.entry.id], date_created: '2026-03-10' });
  assert.strictEqual(invPaid.ok, true, 'Paid invoice created');
  setInvoiceStatus(invPaid.invoice.id, 'sent');

  const pay = addPayment(invOverdue.invoice.id, { amount: 100, payment_date: '2026-03-20', payment_method: 'Card' });
  assert.strictEqual(pay.ok, true, 'Payment recorded');
  const pay2 = addPayment(invPaid.invoice.id, { amount: 100, payment_date: '2026-03-22', payment_method: 'Cash' });
  assert.strictEqual(pay2.ok, true, 'Second payment recorded');

  const pastDue = new Date();
  pastDue.setDate(pastDue.getDate() - 45);
  const pastDueStr = pastDue.toISOString().slice(0, 10);
  getDb().run('UPDATE invoices SET date_due = ? WHERE id = ?', [pastDueStr, invOverdue.invoice.id]);

  // ---------- 1. Statement with an overdue closing balance renders ----------
  const statement = getClientStatement({ client_id: client.id, startDate: '2026-03-01', endDate: '2026-03-31' });
  assert.strictEqual(statement.ok, true, 'Statement generated');
  assert.strictEqual(statement.overdue.hasOverdue, true, 'Statement has an overdue balance');
  assert.strictEqual(statement.closingBalance, 200, 'Closing balance = 300 overdue - 100 paid (plus settled invoice)');

  const overduePdf = await renderClientStatementPdf(statement, profile);
  assert.ok(looksLikePdf(overduePdf), 'Overdue statement produces a real PDF buffer');
  console.log('✓ Overdue statement PDF rendered (' + overduePdf.length + ' bytes)');

  // ---------- 2. Statement without overdue activity also renders ----------
  const clean = getClientStatement({ client_id: client.id, startDate: '2026-03-01', endDate: '2026-03-04' });
  assert.strictEqual(clean.ok, true, 'Clean statement generated');
  assert.strictEqual(clean.overdue.hasOverdue, false, 'No overdue in the clean period');

  const cleanPdf = await renderClientStatementPdf(clean, profile);
  assert.ok(looksLikePdf(cleanPdf), 'Clean statement produces a real PDF buffer');
  console.log('✓ Clean statement PDF rendered (' + cleanPdf.length + ' bytes)');

  // ---------- 3. Writes to disk cleanly ----------
  const outPath = path.join(__dirname, 'test-statement-pdf-out.pdf');
  fs.writeFileSync(outPath, overduePdf);
  assert.ok(fs.statSync(outPath).size > 1000, 'Rendered PDF writes to disk');
  fs.unlinkSync(outPath);
  console.log('✓ PDF buffer writes to disk');

  console.log('--- All Client Statement PDF tests passed ---');
}

runTests()
  .catch((err) => {
    console.error('Client statement PDF test failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });
