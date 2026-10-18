/**
 * QuoteCraft Standalone Unit Tests: Phase 1 CSV Data Portability Hub
 * Tests CSV parsing, column auto-detection, bulk database import with deduplication,
 * and accounting ledger CSV generation.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Point to test db path
const testDbPath = path.join(__dirname, 'test-csv-portability.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  addClient,
  getClients,
  bulkImportClients,
  getLineItemTemplates,
  bulkImportLineItems,
  createInvoice,
  listInvoices,
  addPayment,
  getPaymentsReport,
  createExpense,
  listExpenses,
  createTimeEntry,
  listTimeEntries,
} = require('../src/main/database');

const {
  sniffDelimiter,
  parseCsv,
  stringifyCsv,
  detectClientColumnMapping,
  detectLineItemColumnMapping,
  prepareClientRecords,
  prepareLineItemRecords,
  generateInvoicesLedgerCsv,
  generatePaymentsLedgerCsv,
  generateExpensesLedgerCsv,
  generateTimeEntriesLedgerCsv,
} = require('../src/main/csv-service');

async function runTests() {
  console.log('--- Starting Phase 1 CSV Data Portability Unit Tests ---');

  // -------------------------------------------------------------------------
  // 1. CSV Parser Tests
  // -------------------------------------------------------------------------
  console.log('1. Testing CSV Parser & Delimiter Sniffer...');

  assert.strictEqual(sniffDelimiter('Name,Email,Phone'), ',');
  assert.strictEqual(sniffDelimiter('Name;Email;Phone;Address'), ';');
  assert.strictEqual(sniffDelimiter("Name\tEmail\tPhone"), '\t');

  const standardCsv = `Name,Email,Company,Phone
John Doe,john@example.com,Acme Corp,+1234567890
"Jane ""CEO"" Smith",jane@example.com,"Smith & Sons, LLC",+1987654321
`;
  const parsed1 = parseCsv(standardCsv);
  assert.strictEqual(parsed1.headers.length, 4);
  assert.strictEqual(parsed1.rows.length, 2);
  assert.strictEqual(parsed1.rows[0].Name, 'John Doe');
  assert.strictEqual(parsed1.rows[0].Email, 'john@example.com');
  // Check escaped quotes & commas inside quotes
  assert.strictEqual(parsed1.rows[1].Name, 'Jane "CEO" Smith');
  assert.strictEqual(parsed1.rows[1].Company, 'Smith & Sons, LLC');

  // Multi-line values in quotes
  const multilineCsv = `ID,Description,Amount
1,"Consulting Services
Phase 1 and Phase 2",1500
2,"Standard Service",200
`;
  const parsed2 = parseCsv(multilineCsv);
  assert.strictEqual(parsed2.rows.length, 2);
  assert.ok(parsed2.rows[0].Description.includes('Phase 1 and Phase 2'));

  // Semicolon delimited
  const semiCsv = `Product;Price;VAT
Design;500;7.5
Development;1200;7.5
`;
  const parsedSemi = parseCsv(semiCsv);
  assert.strictEqual(parsedSemi.delimiter, ';');
  assert.strictEqual(parsedSemi.rows.length, 2);
  assert.strictEqual(parsedSemi.rows[0].Product, 'Design');
  assert.strictEqual(parsedSemi.rows[0].Price, '500');

  console.log('✓ CSV parser handles standard, quoted, multi-line, and semicolon formats.');

  // -------------------------------------------------------------------------
  // 2. CSV Stringifier Tests
  // -------------------------------------------------------------------------
  console.log('2. Testing CSV Stringifier...');

  const headers = ['Name', 'Company', 'Notes'];
  const testRows = [
    { Name: 'Alice', Company: 'Tech, Inc.', Notes: 'Normal' },
    { Name: 'Bob', Company: 'Apex', Notes: 'Has "quotes" inside' },
  ];
  const stringified = stringifyCsv(headers, testRows);
  assert.ok(stringified.includes('"Tech, Inc."'));
  assert.ok(stringified.includes('"Has ""quotes"" inside"'));

  console.log('✓ CSV stringifier escapes commas and quotes correctly.');

  // -------------------------------------------------------------------------
  // 3. Column Auto-Detection & Record Preparation
  // -------------------------------------------------------------------------
  console.log('3. Testing Column Auto-Detection & Preparation...');

  const clientHeaders = ['Full Name', 'Primary Email', 'Mobile', 'Organization', 'Billing Address', 'Default Rate', 'Billing Currency'];
  const clientMapping = detectClientColumnMapping(clientHeaders);
  assert.strictEqual(clientMapping.mapping['Full Name'], 'name');
  assert.strictEqual(clientMapping.mapping['Primary Email'], 'email');
  assert.strictEqual(clientMapping.mapping['Mobile'], 'phone');
  assert.strictEqual(clientMapping.mapping['Organization'], 'company_name');
  assert.strictEqual(clientMapping.mapping['Billing Address'], 'address_line1');
  assert.strictEqual(clientMapping.mapping['Default Rate'], 'default_hourly_rate');
  assert.strictEqual(clientMapping.mapping['Billing Currency'], 'default_currency');

  const rawClientRows = [
    {
      'Full Name': '  Sarah Connor  ',
      'Primary Email': 'SARAH@SKYNET.COM',
      'Mobile': '+1-555-0199',
      'Organization': 'Resistance HQ',
      'Billing Address': '101 Bunker Way',
      'Default Rate': '$75.50/hr',
      'Billing Currency': 'usd',
    },
    {
      // Missing name but has organization
      'Full Name': '',
      'Primary Email': 'info@cyberdyne.com',
      'Mobile': '',
      'Organization': 'Cyberdyne Systems',
      'Billing Address': '',
      'Default Rate': '',
      'Billing Currency': '',
    },
    {
      // Missing both name and company
      'Full Name': '',
      'Primary Email': 'ghost@example.com',
      'Mobile': '',
      'Organization': '',
      'Billing Address': '',
      'Default Rate': '',
      'Billing Currency': '',
    },
  ];

  const prepClients = prepareClientRecords(rawClientRows, clientMapping.mapping);
  assert.strictEqual(prepClients.clients.length, 2); // 3rd row invalid
  assert.strictEqual(prepClients.errors.length, 1);
  assert.strictEqual(prepClients.clients[0].name, 'Sarah Connor');
  assert.strictEqual(prepClients.clients[0].email, 'sarah@skynet.com');
  assert.strictEqual(prepClients.clients[0].default_hourly_rate, 75.5);
  assert.strictEqual(prepClients.clients[0].default_currency, 'USD');
  // Fallback to organization
  assert.strictEqual(prepClients.clients[1].name, 'Cyberdyne Systems');

  // Line Item Template Detection
  const itemHeaders = ['Item Name', 'Details', 'Unit Price', 'VAT %', 'Unit of Measure'];
  const itemMapping = detectLineItemColumnMapping(itemHeaders);
  assert.strictEqual(itemMapping.mapping['Item Name'], 'name');
  assert.strictEqual(itemMapping.mapping['Details'], 'description');
  assert.strictEqual(itemMapping.mapping['Unit Price'], 'unit_price');
  assert.strictEqual(itemMapping.mapping['VAT %'], 'tax_rate');
  assert.strictEqual(itemMapping.mapping['Unit of Measure'], 'unit_label');

  const rawItemRows = [
    { 'Item Name': 'Full Stack Dev', 'Details': 'Senior Dev work', 'Unit Price': '120.00', 'VAT %': '7.5', 'Unit of Measure': 'hrs' },
    { 'Item Name': '', 'Details': 'Graphic Design Logo Package', 'Unit Price': '450.00', 'VAT %': '0', 'Unit of Measure': 'pkg' },
  ];
  const prepItems = prepareLineItemRecords(rawItemRows, itemMapping.mapping);
  assert.strictEqual(prepItems.items.length, 2);
  assert.strictEqual(prepItems.items[0].unit_price, 120);
  assert.strictEqual(prepItems.items[0].tax_rate, 7.5);
  assert.strictEqual(prepItems.items[0].unit_label, 'hrs');
  assert.strictEqual(prepItems.items[1].name, 'Graphic Design Logo Package');

  console.log('✓ Column mapping detection and record preparation passed.');

  // -------------------------------------------------------------------------
  // 4. Database Bulk Import & Deduplication
  // -------------------------------------------------------------------------
  console.log('4. Testing Database Bulk Import with Deduplication...');

  await initializeDatabase();

  // Create an existing client
  addClient({
    name: 'Existing Client One',
    email: 'client1@test.com',
    phone: '+1-800-111-2222',
    company_name: 'Existing Co',
  });

  const importBatch1 = [
    {
      name: 'Existing Client One (Dupe)',
      email: 'CLIENT1@TEST.COM', // uppercase to verify case insensitivity
      phone: '+1-800-111-2222',
      company_name: 'Updated Company Name',
      city: 'Lagos',
    },
    {
      name: 'New Client Alpha',
      email: 'alpha@test.com',
      phone: '+1-800-333-4444',
      company_name: 'Alpha LLC',
      city: 'Abuja',
    },
  ];

  // Test deduplication strategy: 'skip'
  const resSkip = bulkImportClients(importBatch1, { deduplicateBy: 'email_or_phone', onDuplicate: 'skip' });
  assert.strictEqual(resSkip.ok, true);
  assert.strictEqual(resSkip.imported, 1);
  assert.strictEqual(resSkip.skipped, 1);

  // Test deduplication strategy: 'overwrite'
  const importBatch2 = [
    {
      name: 'Existing Client One (Updated)',
      email: 'client1@test.com',
      phone: '+1-800-111-2222',
      company_name: 'Overwritten Co',
      city: 'Port Harcourt',
    },
  ];
  const resOverwrite = bulkImportClients(importBatch2, { deduplicateBy: 'email_or_phone', onDuplicate: 'overwrite' });
  assert.strictEqual(resOverwrite.ok, true);
  assert.strictEqual(resOverwrite.updated, 1);

  const allClients = getClients();
  const updatedClient = allClients.find((c) => c.email === 'client1@test.com');
  assert.strictEqual(updatedClient.company_name, 'Overwritten Co');
  assert.strictEqual(updatedClient.city, 'Port Harcourt');

  // Test Line Items Bulk Import
  const lineItemBatch = [
    { name: 'Wireframing', description: 'UX wireframes', unit_price: 85, tax_rate: 7.5, unit_label: 'hrs' },
    { name: 'API Development', description: 'Backend endpoints', unit_price: 110, tax_rate: 7.5, unit_label: 'hrs' },
  ];
  const resItems = bulkImportLineItems(lineItemBatch, { onDuplicate: 'skip' });
  assert.strictEqual(resItems.ok, true);
  assert.strictEqual(resItems.imported, 2);

  // Import duplicate line item with onDuplicate: 'skip'
  const resItemsDupe = bulkImportLineItems([
    { name: 'Wireframing', description: 'Different description', unit_price: 99, tax_rate: 0, unit_label: 'hrs' },
  ], { onDuplicate: 'skip' });
  assert.strictEqual(resItemsDupe.imported, 0);
  assert.strictEqual(resItemsDupe.skipped, 1);

  // Import duplicate line item with onDuplicate: 'overwrite'
  const resItemsOverwrite = bulkImportLineItems([
    { name: 'Wireframing', description: 'Updated UX wireframes', unit_price: 95, tax_rate: 7.5, unit_label: 'hrs' },
  ], { onDuplicate: 'overwrite' });
  assert.strictEqual(resItemsOverwrite.updated, 1);

  const templates = getLineItemTemplates();
  const wireframingTpl = templates.find((t) => t.name === 'Wireframing');
  assert.strictEqual(wireframingTpl.unit_price, 95);
  assert.strictEqual(wireframingTpl.description, 'Updated UX wireframes');

  console.log('✓ Bulk client & line item database import with deduplication passed.');

  // -------------------------------------------------------------------------
  // 5. Accounting & Tax Ledger Exports
  // -------------------------------------------------------------------------
  console.log('5. Testing Accounting & Tax Ledger Exports...');

  // Create an invoice
  const resInv = createInvoice({
    client_id: updatedClient.id,
    date_created: '2026-05-15',
    date_due: '2026-05-30',
    currency: 'USD',
  }, [
    { description: 'Consulting', quantity: 10, unit_price: 100, tax_rate: 7.5 },
  ]);
  assert.strictEqual(resInv.ok, true, JSON.stringify(resInv.errors));
  const inv = resInv.invoice;


  // Filtered invoices query
  const allInvoices = listInvoices({});
  assert.strictEqual(allInvoices.length, 1);

  const matchedFilter = listInvoices({ startDate: '2026-05-01', endDate: '2026-05-31' });
  assert.strictEqual(matchedFilter.length, 1);

  const unmatchedFilter = listInvoices({ startDate: '2026-01-01', endDate: '2026-01-31' });
  assert.strictEqual(unmatchedFilter.length, 0);

  // Generate Invoices Ledger CSV
  const invoiceLedgerCsv = generateInvoicesLedgerCsv(allInvoices);
  assert.ok(invoiceLedgerCsv.includes('Invoice Number,Client Name'));
  assert.ok(invoiceLedgerCsv.includes(inv.invoice_number));
  assert.ok(invoiceLedgerCsv.includes(updatedClient.name));

  // Add a payment
  addPayment(inv.id, {
    amount: 500,
    payment_date: '2026-05-20',
    payment_method: 'Bank Transfer',
    reference_number: 'TXN-998877',
    notes: 'Partial payment',
  });

  const paymentReport = getPaymentsReport({ startDate: '2026-05-01', endDate: '2026-05-31' });
  assert.strictEqual(paymentReport.payments.length, 1);
  const paymentLedgerCsv = generatePaymentsLedgerCsv(paymentReport.payments);
  assert.ok(paymentLedgerCsv.includes('TXN-998877'));
  assert.ok(paymentLedgerCsv.includes('500.00'));

  // Create an expense
  createExpense({
    amount: 150,
    date: '2026-05-18',
    category: 'Software',
    notes: 'Cloud hosting subscription',
    currency: 'USD',
  });
  const expenses = listExpenses({ startDate: '2026-05-01', endDate: '2026-05-31' });
  assert.strictEqual(expenses.length, 1);
  const expenseLedgerCsv = generateExpensesLedgerCsv(expenses);
  assert.ok(expenseLedgerCsv.includes('Cloud hosting subscription'));
  assert.ok(expenseLedgerCsv.includes('Software'));

  // Create a time entry
  createTimeEntry({
    client_id: updatedClient.id,
    date: '2026-05-12',
    hours: 4.5,
    hourly_rate: 80,
    description: 'Sprint planning and user story refinement',
  });
  const timeEntries = listTimeEntries({ date_from: '2026-05-01', date_to: '2026-05-31' });
  assert.strictEqual(timeEntries.length, 1);
  const timeLedgerCsv = generateTimeEntriesLedgerCsv(timeEntries);
  assert.ok(timeLedgerCsv.includes('Sprint planning and user story refinement'));
  assert.ok(timeLedgerCsv.includes('360.00'));

  console.log('✓ All 4 accounting ledger CSV datasets generated accurately with date filters.');

  // Cleanup
  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('--- All Phase 1 CSV Data Portability Unit Tests Passed Successfully! ---');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
