const path = require('path');
const fs = require('fs');
const assert = require('assert');
const os = require('os');
const AdmZip = require('adm-zip');

// Isolated test setup
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-test-stage5-'));
const testDbPath = path.join(tempDir, 'test-stage5.sqlite');
const testAttachmentsDir = path.join(tempDir, 'attachments');
fs.mkdirSync(testAttachmentsDir, { recursive: true });

process.env.TEST_DB_PATH = testDbPath;
process.env.TEST_ATTACHMENTS_PATH = testAttachmentsDir;

const {
  initializeDatabase,
  closeDatabase,
  getCompanyProfile,
  saveCompanyProfile,
  addClient,
  getClient,
  getClients,
  createInvoice,
  listInvoices,
  createQuote,
  listQuotes,
  getPaymentsReport,
  createExpense,
  listExpenses,
  createTimeEntry,
  listTimeEntries,
} = require('../src/main/database');

async function run() {
  await initializeDatabase();
  console.log('✓ Stage 5 Database initialized');

  // Test 1: Onboarding profile defaults validate and save properly
  const wizardProfile = {
    business_name: 'Acme Test Corp',
    business_email: 'hello@acme.test',
    business_phone: '+1 555 123 4567',
    default_currency: 'EUR',
    date_format: 'YYYY-MM-DD',
    decimal_separator: 'dot',
    default_tax_rate: 10,
    invoice_start_number: 1,
    quote_start_number: 1,
    invoice_prefix: 'INV',
    quote_prefix: 'QT',
  };
  const profileRes = saveCompanyProfile(wizardProfile);
  assert.ok(profileRes && profileRes.business_name === 'Acme Test Corp', 'Wizard profile should save cleanly');
  const savedProfile = getCompanyProfile();
  assert.strictEqual(savedProfile.business_name, 'Acme Test Corp');
  assert.strictEqual(savedProfile.default_currency, 'EUR');
  console.log('✓ Test 1: Wizard company profile defaults save successfully');

  // Test 2: Client default_currency field
  const client = addClient({
    name: 'Global Client LLC',
    email: 'client@global.test',
    default_currency: 'GBP',
  });
  assert.ok(client && client.id, 'Client should be added');
  const fetchedClient = getClient(client.id);
  assert.strictEqual(fetchedClient.default_currency, 'GBP', 'Client should preserve default_currency');
  console.log('✓ Test 2: Client default_currency field persisted and retrieved');

  // Test 3: CSV Export Data Preparation & Archive Generation
  const invoiceRes = createInvoice(
    { client_id: client.id, currency: 'GBP', date_created: '2026-10-10' },
    [{ description: 'Consulting', quantity: 5, unit_price: 100 }]
  );
  assert.ok(invoiceRes.ok && invoiceRes.invoice, 'Invoice created');

  const quoteRes = createQuote(
    { client_id: client.id, currency: 'GBP', date_created: '2026-10-10' },
    [{ description: 'Strategy', quantity: 2, unit_price: 250 }]
  );
  assert.ok(quoteRes.ok && quoteRes.quote, 'Quote created');

  createExpense({
    date: '2026-10-10',
    category: 'Software',
    amount: 50,
    currency: 'EUR',
    notes: 'Hosting bill',
  });

  createTimeEntry({
    client_id: client.id,
    date: '2026-10-10',
    duration_minutes: 120,
    description: 'Dev work',
  });

  function objsToCSV(rows) {
    if (!rows || rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const escape = (v) => {
      if (v == null) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
    };
    return [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
    ].join('\n');
  }

  const clients = getClients() || [];
  const invoices = listInvoices() || [];
  const quotes = listQuotes() || [];
  const paymentReport = getPaymentsReport({}) || {};
  const payments = paymentReport.payments || [];
  const expenses = listExpenses({}) || [];
  const timeEntries = listTimeEntries({}) || [];

  const zip = new AdmZip();
  zip.addFile('clients.csv', Buffer.from(objsToCSV(clients), 'utf8'));
  zip.addFile('invoices.csv', Buffer.from(objsToCSV(invoices), 'utf8'));
  zip.addFile('quotes.csv', Buffer.from(objsToCSV(quotes), 'utf8'));
  zip.addFile('payments.csv', Buffer.from(objsToCSV(payments), 'utf8'));
  zip.addFile('expenses.csv', Buffer.from(objsToCSV(expenses), 'utf8'));
  zip.addFile('time_entries.csv', Buffer.from(objsToCSV(timeEntries), 'utf8'));

  const exportZipPath = path.join(tempDir, 'export.zip');
  zip.writeZip(exportZipPath);
  assert.strictEqual(fs.existsSync(exportZipPath), true, 'Export zip should be written');

  const readZip = new AdmZip(exportZipPath);
  const entries = readZip.getEntries().map((e) => e.entryName);
  assert.ok(entries.includes('clients.csv'));
  assert.ok(entries.includes('invoices.csv'));
  assert.ok(entries.includes('quotes.csv'));
  assert.ok(entries.includes('payments.csv'));
  assert.ok(entries.includes('expenses.csv'));
  assert.ok(entries.includes('time_entries.csv'));

  const clientsCsv = readZip.readAsText('clients.csv');
  assert.ok(clientsCsv.includes('Global Client LLC'));
  console.log('✓ Test 3: CSV Data Export archive generated and verified');

  // Test 4: Verify package.json multi-platform configurations (Stage 6.1)
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
  assert.ok(pkg.build.mac, 'mac build config should exist');
  assert.ok(pkg.build.linux, 'linux build config should exist');
  assert.ok(pkg.build.mac.target.includes('dmg'));
  assert.ok(pkg.build.linux.target.includes('AppImage'));
  assert.ok(pkg.scripts['dist:mac']);
  assert.ok(pkg.scripts['dist:linux']);
  console.log('✓ Test 4: package.json multi-platform configs verified');

  closeDatabase();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  console.log('\nAll Stage 5 & 6 tests passed!');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
