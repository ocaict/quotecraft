const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  getDbPath,
  listAllAttachments,
  addAttachment,
} = require('./database');

// Files are copied into this folder. A 25 MB per-file ceiling keeps the app
// responsive and stops a single attachment from bloating backups (which embed
// every file as base64, ~33% larger).
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENT_LABEL = '25 MB';

const MIME_BY_EXT = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  rtf: 'application/rtf',
  md: 'text/markdown',
  json: 'application/json',
  zip: 'application/zip',
};

const ALLOWED_EXTENSIONS = Object.keys(MIME_BY_EXT);

// Attachments live beside the database inside the app's user-data folder
// (%APPDATA%\quotecraft\attachments). Deriving the path from the DB location
// keeps plain-Node test runs isolated automatically.
function getAttachmentsDir() {
  if (process.env.TEST_ATTACHMENTS_PATH) return process.env.TEST_ATTACHMENTS_PATH;
  return path.join(path.dirname(getDbPath()), 'attachments');
}

function ensureAttachmentsDir() {
  fs.mkdirSync(getAttachmentsDir(), { recursive: true });
}

function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function extensionOf(filename) {
  return path.extname(String(filename || '')).toLowerCase().replace(/^\./, '');
}

function mimeForExtension(ext) {
  return MIME_BY_EXT[String(ext || '').toLowerCase()] || 'application/octet-stream';
}

// Validate a file before copying it: it must be a real file, a supported type,
// non-empty, and within the size limit. Returns a message ready for the UI.
function validateSourceFile(sourcePath) {
  if (!sourcePath || typeof sourcePath !== 'string') {
    return { ok: false, error: 'No file was selected.' };
  }
  let stat;
  try {
    stat = fs.statSync(sourcePath);
  } catch (e) {
    return { ok: false, error: 'The selected file could not be read.', name: path.basename(sourcePath) };
  }
  const base = path.basename(sourcePath);
  if (!stat.isFile()) {
    return { ok: false, error: base + ' is a folder — only files can be attached.', name: base };
  }
  const ext = extensionOf(base);
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
    return { ok: false, error: base + ' is not a supported file type.', name: base };
  }
  if (stat.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: base + ' is ' + humanSize(stat.size) + ' — the limit is ' + MAX_ATTACHMENT_LABEL + '.',
      name: base,
    };
  }
  if (stat.size === 0) {
    return { ok: false, error: base + ' is empty.', name: base };
  }
  return { ok: true, size: stat.size, base, ext, mime: mimeForExtension(ext) };
}

// Only our generated "<uuid>.<ext>" names (or equivalent) are allowed. This
// guards both on-disk reads and filenames coming from a restored backup.
function sanitizeStoredName(name) {
  const base = path.basename(String(name || ''));
  if (!base || base === '.' || base === '..') return null;
  if (!/^[A-Za-z0-9._-]+$/.test(base)) return null;
  return base;
}

function getAttachmentPath(storedFilename) {
  const safe = sanitizeStoredName(storedFilename);
  if (!safe) return null;
  return path.join(getAttachmentsDir(), safe);
}

// Copy a picked/dropped file into the app folder and record its metadata.
function storeAttachmentFromPath({ entity_type, entity_id, sourcePath }) {
  const check = validateSourceFile(sourcePath);
  if (!check.ok) {
    return { ok: false, error: check.error, name: check.name || '' };
  }

  ensureAttachmentsDir();
  const storedFilename = crypto.randomUUID() + (check.ext ? '.' + check.ext : '');
  const dest = path.join(getAttachmentsDir(), storedFilename);
  try {
    fs.copyFileSync(sourcePath, dest);
  } catch (e) {
    return { ok: false, error: 'Could not copy ' + check.base + ': ' + e.message, name: check.base };
  }

  const res = addAttachment({
    entity_type,
    entity_id,
    original_filename: check.base,
    stored_filename: storedFilename,
    mime_type: check.mime,
    file_size: check.size,
  });

  if (!res.ok) {
    // Never leave an orphaned copy when metadata validation fails.
    try { fs.unlinkSync(dest); } catch (e) { /* best effort */ }
    const errors = (res && res.errors) || {};
    return {
      ok: false,
      error: errors.entity_id || errors.entity_type || errors.general || 'Could not save the attachment.',
      name: check.base,
    };
  }
  return { ok: true, attachment: res.attachment };
}

function deleteAttachmentFile(storedFilename) {
  const p = getAttachmentPath(storedFilename);
  if (!p) return false;
  try {
    fs.unlinkSync(p);
    return true;
  } catch (e) {
    return false;
  }
}

function readAttachmentBase64(storedFilename) {
  const p = getAttachmentPath(storedFilename);
  if (!p || !fs.existsSync(p)) return null;
  try {
    return fs.readFileSync(p).toString('base64');
  } catch (e) {
    return null;
  }
}

function writeAttachmentFromBase64(storedFilename, base64) {
  const safe = sanitizeStoredName(storedFilename);
  if (!safe) return false;
  ensureAttachmentsDir();
  try {
    fs.writeFileSync(path.join(getAttachmentsDir(), safe), Buffer.from(String(base64 || ''), 'base64'));
    return true;
  } catch (e) {
    return false;
  }
}

// Backup section: every attachment's metadata plus its bytes, so a single JSON
// file can fully reconstruct the attachments folder. Missing files are
// reported rather than silently dropped.
function buildBackupAttachments() {
  const rows = listAllAttachments();
  const files = [];
  const missing = [];
  for (const row of rows) {
    const data = readAttachmentBase64(row.stored_filename);
    if (data === null) {
      missing.push(row.stored_filename);
      continue;
    }
    files.push({
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      original_filename: row.original_filename,
      stored_filename: row.stored_filename,
      mime_type: row.mime_type,
      file_size: row.file_size,
      created_at: row.created_at,
      data,
    });
  }
  return { files, missing };
}

// Restore files from a validated backup. Filenames are sanitized so a hostile
// backup cannot write outside the attachments folder.
function restoreAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { ok: true, restored: 0, skipped: 0 };
  }
  ensureAttachmentsDir();
  let restored = 0;
  let skipped = 0;
  for (const item of attachments) {
    const data = item && item.data;
    if (typeof data !== 'string' || !writeAttachmentFromBase64(item && item.stored_filename, data)) {
      skipped++;
      continue;
    }
    restored++;
  }
  return { ok: true, restored, skipped };
}

module.exports = {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_LABEL,
  MIME_BY_EXT,
  ALLOWED_EXTENSIONS,
  getAttachmentsDir,
  ensureAttachmentsDir,
  humanSize,
  extensionOf,
  mimeForExtension,
  validateSourceFile,
  sanitizeStoredName,
  getAttachmentPath,
  storeAttachmentFromPath,
  deleteAttachmentFile,
  readAttachmentBase64,
  writeAttachmentFromBase64,
  buildBackupAttachments,
  restoreAttachments,
};
