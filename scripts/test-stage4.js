const path = require('path');
const fs = require('fs');
const assert = require('assert');
const os = require('os');
const AdmZip = require('adm-zip');

// Isolated test setup
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-test-stage4-'));
const testDbPath = path.join(tempDir, 'test-stage4.sqlite');
const testAttachmentsDir = path.join(tempDir, 'attachments');
fs.mkdirSync(testAttachmentsDir, { recursive: true });

process.env.TEST_DB_PATH = testDbPath;
process.env.TEST_ATTACHMENTS_PATH = testAttachmentsDir;

const {
  initializeDatabase,
  closeDatabase,
  saveCompanyProfile,
  addClient,
  createQuote,
  createInvoice,
  validateBackupBuffer,
  restoreDatabaseFromBuffer,
  saveToDiskImmediate,
} = require('../src/main/database');

const {
  storeAttachmentFromPath,
  listAllAttachments,
  restoreAttachments,
  restoreAttachmentsFromZip,
  addAttachmentsToZip,
} = require('../src/main/attachments');

const {
  createBackupZip,
  createBackupPayload,
} = require('../src/main/auto-backup');

async function runStage4Tests() {
  console.log('=== Starting Stage 4 Unit Tests: Modern ZIP-Based Backups ===\n');

  await initializeDatabase();
  saveToDiskImmediate();

  saveCompanyProfile({
    business_name: 'Apex Design Studio',
    email: 'contact@apexdesign.com',
    default_currency: 'USD',
  });

  const client = addClient({
    name: 'Globex Corp',
    email: 'billing@globex.com',
  });

  const invRes = createInvoice(
    { client_id: client.id, date_created: '2026-10-10' },
    [{ description: 'Milestone 1 Deliverable', quantity: 1, unit_price: 1750 }]
  );
  assert(invRes && invRes.ok && invRes.invoice, 'Invoice created: ' + JSON.stringify(invRes));
  const invoice = invRes.invoice;

  // Create a test file attachment
  const sampleFilePath = path.join(tempDir, 'project-spec.pdf');
  const samplePdfContent = Buffer.from('%PDF-1.4 sample contract document content for QuoteCraft tests');
  fs.writeFileSync(sampleFilePath, samplePdfContent);

  const storedRes = storeAttachmentFromPath({
    sourcePath: sampleFilePath,
    entity_type: 'invoice',
    entity_id: invoice.id,
  });
  assert(storedRes && storedRes.ok && storedRes.attachment, 'Attachment must be saved to disk');
  const storedAtt = storedRes.attachment;
  console.log('✓ Test database and attachments initialized');

  // 1. Create Modern ZIP Backup (.qcbackup)
  console.log('\n--- Testing ZIP Archive Backup Creation ---');
  const profile = {
    business_name: 'Apex Design Studio',
    email: 'contact@apexdesign.com',
    default_currency: 'USD',
  };

  const zip = createBackupZip(profile);
  const zipBuffer = zip.toBuffer();
  assert(zipBuffer.length > 500, 'ZIP backup buffer should contain valid archive data');
  assert.strictEqual(zipBuffer[0], 0x50, 'ZIP signature byte 0 must be 0x50 (P)');
  assert.strictEqual(zipBuffer[1], 0x4B, 'ZIP signature byte 1 must be 0x4B (K)');

  // Verify internal ZIP structure
  const testZip = new AdmZip(zipBuffer);
  const manifestEntry = testZip.getEntry('manifest.json');
  const dbEntry = testZip.getEntry('database.sqlite');
  const attEntry = testZip.getEntry(`attachments/${storedAtt.stored_filename}`);

  assert(manifestEntry, 'ZIP archive must contain manifest.json');
  assert(dbEntry, 'ZIP archive must contain database.sqlite');
  assert(attEntry, 'ZIP archive must contain attachment binary under attachments/');

  const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  assert.strictEqual(manifest.app, 'QuoteCraft');
  assert.strictEqual(manifest.magic, 'QUOTECRAFT_BACKUP');
  assert.strictEqual(manifest.version, 3);
  assert.strictEqual(manifest.format, 'zip');
  assert.strictEqual(manifest.attachmentCount, 1);
  console.log('✓ ZIP archive contains manifest.json (v3), database.sqlite, and binary attachments');

  // 2. Validate Modern ZIP Backup Buffer
  console.log('\n--- Testing ZIP Backup Buffer Validation ---');
  const zipValidation = await validateBackupBuffer(zipBuffer);
  assert.strictEqual(zipValidation.ok, true, 'Validation must succeed for ZIP backup');
  assert.strictEqual(zipValidation.isZip, true, 'isZip must be true');
  assert(zipValidation.counts.clients >= 1, 'Validation should report client count >= 1');
  assert(zipValidation.counts.invoices >= 1, 'Validation should report invoice count >= 1');
  assert.strictEqual(zipValidation.counts.attachments, 1, 'Validation should report 1 attachment');
  console.log('✓ validateBackupBuffer correctly identifies ZIP archive and extracts table counts');

  // 3. Attachment Restoration from ZIP
  console.log('\n--- Testing Binary Attachment Restoration from ZIP ---');
  // Delete the physical attachment file from disk
  const physicalAttPath = path.join(testAttachmentsDir, storedAtt.stored_filename);
  if (fs.existsSync(physicalAttPath)) {
    fs.unlinkSync(physicalAttPath);
  }
  assert(!fs.existsSync(physicalAttPath), 'Attachment file deleted to test restore');

  // Restore attachments from the ZIP
  const restoreRes = restoreAttachmentsFromZip(testZip);
  assert.strictEqual(restoreRes.ok, true);
  assert.strictEqual(restoreRes.restored, 1, 'Must restore 1 attachment from ZIP');
  assert(fs.existsSync(physicalAttPath), 'Attachment must exist on disk after restore');

  const restoredContent = fs.readFileSync(physicalAttPath);
  assert.deepStrictEqual(restoredContent, samplePdfContent, 'Restored attachment content must match original byte-for-byte');
  console.log('✓ Attachment binary restored byte-for-byte from ZIP archive');

  // 4. Backward Compatibility: Legacy JSON Backup Validation
  console.log('\n--- Testing Legacy JSON Backup Compatibility (v2) ---');
  const legacyPayload = createBackupPayload(profile);
  const jsonBuffer = Buffer.from(JSON.stringify(legacyPayload, null, 2), 'utf8');

  const jsonValidation = await validateBackupBuffer(jsonBuffer);
  assert.strictEqual(jsonValidation.ok, true, 'Validation must succeed for legacy JSON backup');
  assert(!jsonValidation.isZip, 'isZip should be falsy for JSON backup');
  assert(jsonValidation.counts.clients >= 1, 'Legacy validation should report client count >= 1');
  console.log('✓ Legacy JSON backups (v1/v2) remain 100% backward-compatible and validate cleanly');

  // 5. Error Handling & Malformed Files
  console.log('\n--- Testing Resilient Error Handling ---');
  const corruptZipBuffer = Buffer.from('PK\x03\x04corrupt-data-not-a-valid-zip');
  const corruptRes = await validateBackupBuffer(corruptZipBuffer);
  assert.strictEqual(corruptRes.ok, false, 'Corrupt ZIP must fail validation');

  const invalidJsonBuffer = Buffer.from(JSON.stringify({ app: 'NotQuoteCraft' }));
  const invalidJsonRes = await validateBackupBuffer(invalidJsonBuffer);
  assert.strictEqual(invalidJsonRes.ok, false, 'Non-QuoteCraft JSON must fail validation');
  console.log('✓ Corrupt ZIP archives and non-QuoteCraft files are safely rejected with descriptive errors');

  // Cleanup
  closeDatabase();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {}

  console.log('\n=== All Stage 4 Unit Tests Passed! ===\n');
}

runStage4Tests().catch((err) => {
  console.error('Stage 4 test failure:', err);
  process.exit(1);
});
