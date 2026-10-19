const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Point to test db path BEFORE requiring database.js
const testDbPath = path.join(__dirname, 'test-app-reset.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const testBackupsDir = path.join(__dirname, 'test-app-reset-backups');
if (fs.existsSync(testBackupsDir)) {
  fs.rmSync(testBackupsDir, { recursive: true, force: true });
}

const {
  initializeDatabase,
  getDb,
  closeDatabase,
  saveCompanyProfile,
  getCompanyProfile,
  addClient,
  getClient,
  createInvoice,
  getInvoice,
  addPayment,
  getPaymentHistory,
  saveLicenseInfo,
  getLicenseInfo,
  getAuditLogEntries,
  resetPreferencesToDefault,
  factoryResetDatabase,
} = require('../src/main/database');

async function runTests() {
  console.log('--- Starting Application Reset Tests (Tier A & Tier B) ---');

  await initializeDatabase();
  console.log('✓ Database initialized');

  // 1. Setup custom profile and data
  saveCompanyProfile({
    business_name: 'Reset Testing Corp',
    invoice_prefix: 'CUST-',
    quote_prefix: 'QUO-',
    invoice_start_number: 100,
    default_tax_rate: 15,
    pdf_accent_color: '#ff0055',
    pdf_layout_style: 'compact',
    default_currency: 'EUR',
  });

  const client = addClient({
    name: 'Reset Test Client',
    email: 'client@reset-test.com',
  });
  assert(client && client.id, 'Client should be created');

  const invRes = createInvoice(
    {
      client_id: client.id,
      date_created: '2026-01-01',
      date_due: '2026-01-15',
    },
    [
      { description: 'Consulting', quantity: 2, unit_price: 500, tax_rate: 15 },
    ]
  );
  assert(invRes && invRes.ok, 'Invoice should be created');
  const invoice = invRes.invoice;

  const payment = addPayment(invoice.id, {
    amount: 500,
    payment_date: '2026-01-05',
    payment_method: 'bank_transfer',
  });
  assert(payment && payment.ok, 'Payment should be created: ' + JSON.stringify(payment));

  // Save license
  saveLicenseInfo({
    license_key: 'QC-TEST1-TEST2-TEST3-TEST4',
    activated_at: '2026-01-01T00:00:00Z',
    status: 'active',
    entitlement_token: 'valid.token.signature',
  });
  const savedLicense = getLicenseInfo();
  assert.strictEqual(savedLicense.license_key, 'QC-TEST1-TEST2-TEST3-TEST4', 'License should be saved');

  console.log('✓ Initial test data created (company profile, client, invoice, payment, license)');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST TIER A: resetPreferencesToDefault()
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Testing Tier A: Reset Preferences & Defaults ---');
  const tierAResult = resetPreferencesToDefault();
  assert(tierAResult.ok, 'Tier A resetPreferencesToDefault should succeed');

  const profileAfterTierA = getCompanyProfile();
  assert.strictEqual(profileAfterTierA.invoice_prefix, 'INV-', 'Invoice prefix reverted to default');
  assert.strictEqual(profileAfterTierA.quote_prefix, 'Q-', 'Quote prefix reverted to default');
  assert.strictEqual(profileAfterTierA.invoice_start_number, 1, 'Invoice start number reverted to 1');
  assert.strictEqual(profileAfterTierA.default_tax_rate, 0, 'Default tax rate reverted to 0');
  assert.strictEqual(profileAfterTierA.pdf_accent_color, '#0ea5e9', 'PDF accent color reverted to default');
  assert.strictEqual(profileAfterTierA.pdf_layout_style, 'standard', 'PDF layout style reverted to standard');

  // Verify business identity and business records are INTACT
  assert.strictEqual(profileAfterTierA.business_name, 'Reset Testing Corp', 'Business identity preserved');

  const clientAfterTierA = getClient(client.id);
  assert(clientAfterTierA, 'Client still exists after Tier A reset');
  assert.strictEqual(clientAfterTierA.name, 'Reset Test Client');

  const invoiceAfterTierA = getInvoice(invoice.id);
  assert(invoiceAfterTierA, 'Invoice still exists after Tier A reset');

  const paymentsAfterTierA = getPaymentHistory(invoice.id);
  assert.strictEqual(paymentsAfterTierA.length, 1, 'Payment still exists after Tier A reset');

  const licenseAfterTierA = getLicenseInfo();
  assert.strictEqual(licenseAfterTierA.license_key, 'QC-TEST1-TEST2-TEST3-TEST4', 'License intact after Tier A reset');

  // Verify audit log
  const auditEntries = getAuditLogEntries();
  const resetAudit = auditEntries.find(e => e.action === 'reset_preferences');
  assert(resetAudit, 'Audit log contains reset_preferences entry');
  console.log('✓ Tier A verified: Preferences reset to default, all business data & license preserved');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST TIER B: factoryResetDatabase({ preserveLicense: true })
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Testing Tier B: Factory Reset with License Preservation ---');
  const tierBResult = factoryResetDatabase({
    preserveLicense: true,
    backupsDir: testBackupsDir,
  });

  assert(tierBResult.ok, 'Factory reset should return ok: true');
  assert(tierBResult.backupPath, 'Safety backup should be created');
  assert(fs.existsSync(tierBResult.backupPath), 'Safety backup file exists on disk');
  assert(tierBResult.licensePreserved, 'License preserved flag should be true');

  // Verify database tables are wiped
  const db = getDb();
  const clientCount = db.exec('SELECT count(*) as count FROM clients')[0].values[0][0];
  assert.strictEqual(clientCount, 0, 'Clients table must be empty');

  const invoiceCount = db.exec('SELECT count(*) as count FROM invoices')[0].values[0][0];
  assert.strictEqual(invoiceCount, 0, 'Invoices table must be empty');

  const paymentCount = db.exec('SELECT count(*) as count FROM payments')[0].values[0][0];
  assert.strictEqual(paymentCount, 0, 'Payments table must be empty');

  // Verify license info is preserved
  const licenseAfterTierB = getLicenseInfo();
  assert(licenseAfterTierB, 'License info should still exist');
  assert.strictEqual(licenseAfterTierB.license_key, 'QC-TEST1-TEST2-TEST3-TEST4', 'License key preserved across factory reset');
  assert.strictEqual(licenseAfterTierB.entitlement_token, 'valid.token.signature', 'Entitlement token preserved across factory reset');

  // Verify company profile was reset
  const profileAfterTierB = getCompanyProfile();
  assert.strictEqual(profileAfterTierB.invoice_prefix, 'INV-', 'Fresh default invoice prefix');
  assert.strictEqual(profileAfterTierB.business_name || '', '', 'Business name wiped to pristine placeholder');

  console.log('✓ Tier B (preserveLicense: true) verified: All tables wiped, safety backup created, license preserved');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST TIER B: factoryResetDatabase({ preserveLicense: false })
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Testing Tier B: Factory Reset without License Preservation ---');
  const tierBNoLicenseResult = factoryResetDatabase({
    preserveLicense: false,
    backupsDir: testBackupsDir,
  });

  assert(tierBNoLicenseResult.ok, 'Factory reset without license should succeed');
  assert.strictEqual(tierBNoLicenseResult.licensePreserved, false, 'licensePreserved flag should be false');

  const licenseAfterFullWipe = getLicenseInfo();
  assert.strictEqual(licenseAfterFullWipe, null, 'License table should be completely wiped');

  console.log('✓ Tier B (preserveLicense: false) verified: License table wiped');

  // Cleanup
  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  if (fs.existsSync(testBackupsDir)) {
    fs.rmSync(testBackupsDir, { recursive: true, force: true });
  }

  console.log('\n✅ All Application Reset tests passed successfully!');
}

runTests().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
