const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

// Isolated DB + attachments folder — both MUST be set before requiring database.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qc-attachments-'));
const testDbPath = path.join(tmpDir, 'test-attachments.sqlite');
process.env.TEST_DB_PATH = testDbPath;
process.env.TEST_ATTACHMENTS_PATH = path.join(tmpDir, 'attachments');

const {
  initializeDatabase,
  closeDatabase,
  getDatabaseBuffer,
  validateBackupBuffer,
  restoreDatabaseFromBuffer,
  addClient,
  addProject,
  createTimeEntry,
  createInvoiceFromTimeEntries,
  setInvoiceStatus,
  listAttachments,
  getAttachment,
  deleteAttachment,
  getAttachmentTotals,
} = require('../src/main/database');

const {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
  ALLOWED_EXTENSIONS,
  getAttachmentsDir,
  validateSourceFile,
  storeAttachmentFromPath,
  getAttachmentPath,
  deleteAttachmentFile,
  readAttachmentBase64,
  buildBackupAttachments,
  restoreAttachments,
  sanitizeStoredName,
} = require('../src/main/attachments');

const { createBackupPayload } = require('../src/main/auto-backup');

function listDirCount(dir) {
  try {
    return fs.readdirSync(dir).length;
  } catch (e) {
    return 0;
  }
}

async function runTests() {
  console.log('--- Starting Attachment Storage Tests ---');
  await initializeDatabase();
  console.log('✓ Database initialized');

  const client = addClient({ name: 'Acme Corp', email: 'billing@acme.test', status: 'active' });
  const projectRes = addProject({ client_id: client.id, name: 'Website Redesign', status: 'active', start_date: '2026-01-05' });
  assert.strictEqual(projectRes.ok, true, 'Project created');
  const projectId = projectRes.project.id;

  const entry = createTimeEntry({ client_id: client.id, date: '2026-03-05', description: 'Build', hours: '2', hourly_rate: '100' });
  const invRes = createInvoiceFromTimeEntries({ client_id: client.id, entry_ids: [entry.entry.id], date_created: '2026-03-05' });
  assert.strictEqual(invRes.ok, true, 'Invoice created');
  const invoiceId = invRes.invoice.id;
  setInvoiceStatus(invoiceId, 'sent');
  console.log('✓ Fixtures: client #' + client.id + ', project #' + projectId + ', invoice #' + invoiceId);

  // ---------- 1. Copy a file in and store metadata ----------
  const sourceName = 'signed-contract.pdf';
  const sourcePath = path.join(tmpDir, sourceName);
  const bytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  fs.writeFileSync(sourcePath, bytes);

  const stored = storeAttachmentFromPath({ entity_type: 'invoice', entity_id: invoiceId, sourcePath });
  assert.strictEqual(stored.ok, true, 'Attachment stored: ' + JSON.stringify(stored.error));
  const att = stored.attachment;
  assert.strictEqual(att.original_filename, sourceName, 'Original filename preserved');
  assert.strictEqual(att.entity_type, 'invoice', 'Stored against the invoice');
  assert.strictEqual(att.entity_id, invoiceId, 'Stored against the right record id');
  assert.strictEqual(att.mime_type, 'application/pdf', 'MIME type derived from extension');
  assert.strictEqual(att.file_size, bytes.length, 'File size recorded');
  assert.ok(att.created_at, 'Date attached recorded');
  assert.ok(/^[0-9a-f-]{36}\.pdf$/.test(att.stored_filename), 'Stored name is a generated uuid + ext');
  assert.ok(fs.existsSync(getAttachmentPath(att.stored_filename)), 'Copy exists in the app folder');
  console.log('✓ File copied into app folder with full metadata');

  // ---------- 2. The copy survives deletion of the original ----------
  const expectedBase64 = bytes.toString('base64');
  fs.unlinkSync(sourcePath);
  assert.strictEqual(readAttachmentBase64(att.stored_filename), expectedBase64, 'Bytes survive original deletion');
  assert.strictEqual(getAttachmentPath(att.stored_filename).indexOf(getAttachmentsDir()), 0, 'Stored beside the DB, not the original');
  console.log('✓ Attachment survives moving/deleting the original file');

  // ---------- 3. Listing + totals + metadata round-trip ----------
  assert.strictEqual(listAttachments('invoice', invoiceId).length, 1, 'One attachment for the invoice');
  assert.strictEqual(listAttachments('client', client.id).length, 0, 'Attachments are isolated per record');
  assert.strictEqual(getAttachment(att.id).original_filename, sourceName, 'getAttachment returns the row');
  assert.strictEqual(getAttachmentTotals().count, 1, 'Totals count the attachment');
  console.log('✓ listAttachments / getAttachment / totals');

  // ---------- 4. Validation: type, size, missing, folder ----------
  const exePath = path.join(tmpDir, 'malware.exe');
  fs.writeFileSync(exePath, Buffer.from('MZ'));
  const badType = storeAttachmentFromPath({ entity_type: 'invoice', entity_id: invoiceId, sourcePath: exePath });
  assert.strictEqual(badType.ok, false, 'Unsupported type rejected');
  assert.ok(/not a supported file type/.test(badType.error), 'Clear unsupported-type message: ' + badType.error);

  const bigPath = path.join(tmpDir, 'huge.pdf');
  fs.writeFileSync(bigPath, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1));
  const oversize = validateSourceFile(bigPath);
  assert.strictEqual(oversize.ok, false, 'Oversize file rejected');
  assert.ok(oversize.error.indexOf(MAX_ATTACHMENT_LABEL) !== -1, 'Clear size message mentions the limit: ' + oversize.error);
  fs.unlinkSync(bigPath);

  assert.strictEqual(validateSourceFile(path.join(tmpDir, 'nope.pdf')).ok, false, 'Missing file rejected');
  assert.strictEqual(validateSourceFile(tmpDir).ok, false, 'Folder rejected');
  assert.ok(/folder/.test(validateSourceFile(tmpDir).error), 'Folder message is clear');
  assert.ok(ALLOWED_EXTENSIONS.indexOf('pdf') !== -1, 'PDF is allowed');
  console.log('✓ Validation rejects wrong type, oversize, missing and folders');

  // ---------- 5. Bad target does not leave an orphaned copy ----------
  const beforeCount = listDirCount(getAttachmentsDir());
  const ghostPath = path.join(tmpDir, 'ghost.pdf');
  fs.writeFileSync(ghostPath, Buffer.from('%PDF-1.4 ghost'));
  const orphan = storeAttachmentFromPath({ entity_type: 'invoice', entity_id: 999999, sourcePath: ghostPath });
  assert.strictEqual(orphan.ok, false, 'Unknown record rejected');
  assert.strictEqual(listDirCount(getAttachmentsDir()), beforeCount, 'Failed insert leaves no orphaned file');
  console.log('✓ Failed metadata insert rolls back the copied file');

  // ---------- 6. Delete removes the row and the file ----------
  const del = deleteAttachment(att.id);
  assert.strictEqual(del.ok, true, 'deleteAttachment ok');
  deleteAttachmentFile(del.attachment.stored_filename);
  assert.strictEqual(getAttachment(att.id), null, 'Row removed');
  assert.strictEqual(fs.existsSync(getAttachmentPath(att.stored_filename)), false, 'File removed');
  console.log('✓ Delete removes both row and file');

  // ---------- 7. Backup + restore cycle ----------
  const att2Source = path.join(tmpDir, 'scope.docx');
  const att2Bytes = Buffer.from('PK\u0003\u0004docx-scope-document');
  fs.writeFileSync(att2Source, att2Bytes);
  const stored2 = storeAttachmentFromPath({ entity_type: 'invoice', entity_id: invoiceId, sourcePath: att2Source });
  assert.strictEqual(stored2.ok, true, 'Second attachment stored');
  const att2 = stored2.attachment;

  const payload = createBackupPayload(null);
  assert.strictEqual(payload.version, 2, 'Backup payload is version 2');
  assert.ok(Array.isArray(payload.attachments) && payload.attachments.length === 1, 'Backup embeds the attachment');
  const embedded = payload.attachments[0];
  assert.strictEqual(embedded.stored_filename, att2.stored_filename, 'Embedded stored name matches');
  assert.strictEqual(embedded.data, att2Bytes.toString('base64'), 'Embedded bytes match the file');
  console.log('✓ Backup payload embeds attachment bytes (v2)');

  // Simulate losing the attachment (row + file) entirely.
  const del2 = deleteAttachment(att2.id);
  deleteAttachmentFile(del2.attachment.stored_filename);
  assert.strictEqual(listAttachments('invoice', invoiceId).length, 0, 'Attachment gone before restore');
  assert.strictEqual(fs.existsSync(getAttachmentPath(att2.stored_filename)), false, 'File gone before restore');

  const backupBuffer = Buffer.from(JSON.stringify(payload));
  const validated = await validateBackupBuffer(backupBuffer);
  assert.strictEqual(validated.ok, true, 'Backup validates: ' + (validated.error || ''));
  assert.strictEqual(validated.attachments.length, 1, 'Validated backup exposes attachments');
  assert.strictEqual(validated.counts.attachments, 1, 'Attachment count reported');

  await restoreDatabaseFromBuffer(validated.dbBytes);
  const restored = restoreAttachments(validated.attachments);
  assert.strictEqual(restored.restored, 1, 'One attachment file restored');

  const restoredRows = listAttachments('invoice', invoiceId);
  assert.strictEqual(restoredRows.length, 1, 'Attachment row restored with the database');
  assert.strictEqual(readAttachmentBase64(restoredRows[0].stored_filename), att2Bytes.toString('base64'), 'Restored bytes match');
  console.log('✓ Full backup → wipe → restore cycle preserves the attachment');

  // ---------- 8. Missing files are reported, not silently dropped ----------
  deleteAttachmentFile(att2.stored_filename);
  const partial = buildBackupAttachments();
  assert.strictEqual(partial.files.length, 0, 'Missing file not embedded');
  assert.deepStrictEqual(partial.missing, [att2.stored_filename], 'Missing file reported by name');
  restoreAttachments(payload.attachments);
  assert.strictEqual(readAttachmentBase64(att2.stored_filename), att2Bytes.toString('base64'), 'Re-restored from payload');
  console.log('✓ Missing attachment files are reported');

  // ---------- 9. Version 1 backups still validate (no attachments) ----------
  const v1 = {
    app: 'QuoteCraft',
    magic: 'QUOTECRAFT_BACKUP',
    version: 1,
    createdAt: new Date().toISOString(),
    database: getDatabaseBuffer().toString('base64'),
  };
  const v1Result = await validateBackupBuffer(Buffer.from(JSON.stringify(v1)));
  assert.strictEqual(v1Result.ok, true, 'v1 backup still validates');
  assert.strictEqual(v1Result.attachments.length, 0, 'v1 backup has no attachments');
  console.log('✓ Backward compatible with version 1 backups');

  // ---------- 10. Stored-name sanitization (path traversal guard) ----------
  assert.strictEqual(sanitizeStoredName('..'), null, 'Dot-dot rejected');
  assert.strictEqual(sanitizeStoredName('a/b.pdf'), 'b.pdf', 'Path separators are stripped to a basename');
  assert.strictEqual(sanitizeStoredName('ok-name_1.pdf'), 'ok-name_1.pdf', 'Generated-style names allowed');
  const escaped = getAttachmentPath('../escape.pdf');
  assert.ok(escaped && path.resolve(escaped).indexOf(path.resolve(getAttachmentsDir())) === 0, 'Resolved path stays inside the folder');
  console.log('✓ Stored filenames cannot escape the attachments folder');

  console.log('--- All Attachment Storage tests passed ---');
}

runTests()
  .catch((err) => {
    console.error('Attachment storage test failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDatabase();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {
      /* ignore */
    }
  });
