const assert = require('assert');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(__dirname, 'test-phase2.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const dbModule = require('../src/main/database');
const pdfModule = require('../src/main/pdf-export');

async function runPhase2Tests() {
  console.log('=== Starting Phase 2 Unit Tests ===');
  await dbModule.initializeDatabase();
  console.log('✓ Database initialized with Migrations 37-40');

  // 1. Company profile locale preferences: date_format & decimal_separator
  console.log('\n--- Testing Date Format & Decimal Separator Preferences ---');
  let initialProfile = dbModule.saveCompanyProfile({
    business_name: 'Initial Co',
  });
  assert(initialProfile, 'saveCompanyProfile returns profile');
  assert.strictEqual(initialProfile.date_format, 'MMM D, YYYY', 'Default date_format should be MMM D, YYYY');
  assert.strictEqual(initialProfile.decimal_separator, '.', 'Default decimal_separator should be .');

  const updatedProfile = dbModule.saveCompanyProfile({
    business_name: 'Phase 2 Test Co',
    date_format: 'DD/MM/YYYY',
    decimal_separator: ',',
  });
  assert.strictEqual(updatedProfile.date_format, 'DD/MM/YYYY', 'date_format should be updated to DD/MM/YYYY');
  assert.strictEqual(updatedProfile.decimal_separator, ',', 'decimal_separator should be updated to ,');
  console.log('✓ Company profile date_format and decimal_separator saved & retrieved');

  // 2. Payment instruction presets CRUD
  console.log('\n--- Testing Payment Instruction Presets CRUD ---');
  let presets = dbModule.listPaymentInstructionPresets();
  assert(Array.isArray(presets));
  assert.strictEqual(presets.length, 0, 'Initially 0 presets');

  const p1 = dbModule.createPaymentInstructionPreset({
    name: 'Wire Transfer',
    body: 'Bank: ACME Bank\nIBAN: US123456789\nBIC: ACMEXX',
  });
  assert.strictEqual(p1.ok, true, 'Preset 1 created');
  assert(p1.preset.id > 0);

  const p2 = dbModule.createPaymentInstructionPreset({
    name: 'PayPal',
    body: 'Send payment to billing@example.com',
  });
  assert.strictEqual(p2.ok, true, 'Preset 2 created');

  presets = dbModule.listPaymentInstructionPresets();
  assert.strictEqual(presets.length, 2, 'Should list 2 presets');
  // Sorted by sort_order ASC then name COLLATE NOCASE ASC → alphabetical
  assert.strictEqual(presets[0].name, 'PayPal');
  assert.strictEqual(presets[1].name, 'Wire Transfer');

  const updateRes = dbModule.updatePaymentInstructionPreset(p1.preset.id, {
    name: 'Direct Wire',
    body: 'Updated bank details',
  });
  assert.strictEqual(updateRes.ok, true, 'Preset updated');
  const fetchedP1 = dbModule.getPaymentInstructionPreset(p1.preset.id);
  assert.strictEqual(fetchedP1.name, 'Direct Wire');
  assert.strictEqual(fetchedP1.body, 'Updated bank details');

  const delRes = dbModule.deletePaymentInstructionPreset(p2.preset.id);
  assert.strictEqual(delRes.ok, true, 'Preset 2 deleted');
  presets = dbModule.listPaymentInstructionPresets();
  assert.strictEqual(presets.length, 1, 'Should have 1 preset remaining');
  console.log('✓ Payment presets create, list, update, and delete verified');

  // 3. Custom units on quotes and invoices
  console.log('\n--- Testing Custom Units on Line Items ---');
  // Create client
  const clientRes = dbModule.addClient({ name: 'Acme Corp', email: 'test@acme.com' });
  const clientId = clientRes.id; // addClient returns the client object directly

  // Create quote with unit_label
  const quoteRes = dbModule.createQuote(
    { client_id: clientId, date_created: '2026-05-10', valid_until: '2026-06-10' },
    [
      { description: 'Design Consultation', quantity: 5, unit_label: 'hrs', unit_price: 120 },
      { description: 'Server License', quantity: 2, unit_label: 'licenses', unit_price: 500 },
    ]
  );
  assert.strictEqual(quoteRes.ok, true, 'Quote created');
  const quote = dbModule.getQuote(quoteRes.quote.id);
  assert.strictEqual(quote.line_items[0].unit_label, 'hrs', 'Line item 1 should have unit_label hrs');
  assert.strictEqual(quote.line_items[1].unit_label, 'licenses', 'Line item 2 should have unit_label licenses');

  // Update quote draft
  const updateQuoteRes = dbModule.updateQuote(
    quote.id,
    { client_id: clientId, date_created: '2026-05-10', valid_until: '2026-06-10' },
    [
      { description: 'Design Consultation', quantity: 6, unit_label: 'hours', unit_price: 120 },
    ]
  );
  assert.strictEqual(updateQuoteRes.ok, true, 'Quote updated');
  const updatedQuote = dbModule.getQuote(quote.id);
  assert.strictEqual(updatedQuote.line_items[0].unit_label, 'hours', 'Line item unit_label updated to hours');

  // Create invoice with unit_label
  const invRes = dbModule.createInvoice(
    { client_id: clientId, date_created: '2026-05-15', date_due: '2026-05-29' },
    [
      { description: 'Development Sprints', quantity: 3, unit_label: 'sprints', unit_price: 2500 },
    ]
  );
  assert.strictEqual(invRes.ok, true, 'Invoice created');
  const inv = dbModule.getInvoice(invRes.invoice.id);
  assert.strictEqual(inv.line_items[0].unit_label, 'sprints', 'Invoice line item has unit_label sprints');

  // Duplicate invoice preserves unit_label
  const dupRes = dbModule.duplicateInvoice(inv.id);
  assert.strictEqual(dupRes.ok, true, 'Invoice duplicated');
  const dupInv = dbModule.getInvoice(dupRes.invoice.id);
  assert.strictEqual(dupInv.line_items[0].unit_label, 'sprints', 'Duplicated invoice preserved unit_label sprints');

  // Accept quote and convert to invoice preserves unit_label
  dbModule.setQuoteStatus(quote.id, 'accepted');
  const convRes = dbModule.convertQuoteToInvoice(quote.id);
  assert.strictEqual(convRes.ok, true, 'Quote converted to invoice');
  const convInv = dbModule.getInvoice(convRes.invoice.id);
  assert.strictEqual(convInv.line_items[0].unit_label, 'hours', 'Converted invoice preserved unit_label hours');
  console.log('✓ Custom units on quote, invoice, duplicate, and conversion verified');

  // 4. Line item templates with unit_label
  console.log('\n--- Testing Line Item Templates unit_label ---');
  // addLineItemTemplate returns the template object directly (not {ok, template})
  const tplRes = dbModule.addLineItemTemplate({
    title: 'Consulting Hour',
    description: '1 hour of senior architectural consulting',
    unit_price: 180,
    unit_label: 'hrs',
    tax_rate: 0,
  });
  assert(tplRes && tplRes.id > 0, 'Template created');
  // getLineItemTemplates returns a plain array
  const templates = dbModule.getLineItemTemplates();
  const createdTpl = templates.find(t => t.id === tplRes.id);
  assert.strictEqual(createdTpl.unit_label, 'hrs', 'Template has unit_label hrs');
  console.log('✓ Line item template unit_label verified');

  dbModule.closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('\n========================================');
  console.log(' ALL PHASE 2 UNIT TESTS PASSED (100%)');
  console.log('========================================');
}

runPhase2Tests().catch((err) => {
  console.error('Phase 2 test failure:', err);
  process.exit(1);
});
