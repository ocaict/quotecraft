const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DB_DIR = app.getPath('userData');
const DB_FILE = path.join(DB_DIR, 'quotecraft.sqlite');

let db = null;
let SQL_PROMISE = null;

function loadSqlJs() {
  if (!SQL_PROMISE) SQL_PROMISE = initSqlJs();
  return SQL_PROMISE;
}

function getDbPath() {
  return DB_FILE;
}

function saveToDisk() {
  if (!db) throw new Error('Database not initialized');
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_FILE, buffer);
}

function getDb() {
  if (!db) throw new Error('Database not initialized');
  return db;
}

async function initializeDatabase() {
  const SQL = await loadSqlJs();

  const fileExists = fs.existsSync(DB_FILE);

  if (fileExists) {
    const fileBuffer = fs.readFileSync(DB_FILE);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  createTables();

  if (!fileExists) {
    saveToDisk();
  }

  const migrationsApplied = runMigrations();
  if (migrationsApplied) {
    saveToDisk();
  }

  return db;
}

function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS company_profile (
      id              INTEGER PRIMARY KEY CHECK (id = 1),
      business_name   TEXT NOT NULL DEFAULT '',
      logo_path       TEXT DEFAULT NULL,
      address_line1   TEXT DEFAULT '',
      address_line2   TEXT DEFAULT '',
      city            TEXT DEFAULT '',
      state           TEXT DEFAULT '',
      postal_code     TEXT DEFAULT '',
      country         TEXT DEFAULT '',
      phone           TEXT DEFAULT '',
      email           TEXT DEFAULT '',
      website         TEXT DEFAULT '',
      tax_id          TEXT DEFAULT '',
      default_currency TEXT NOT NULL DEFAULT 'USD',
      default_tax_rate REAL NOT NULL DEFAULT 0,
      invoice_prefix  TEXT NOT NULL DEFAULT 'INV-',
      invoice_start_number INTEGER NOT NULL DEFAULT 1,
      quote_prefix    TEXT NOT NULL DEFAULT 'Q-',
      quote_start_number INTEGER NOT NULL DEFAULT 1,
      default_terms   TEXT DEFAULT '',
      payment_details TEXT DEFAULT '',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      email           TEXT DEFAULT '',
      phone           TEXT DEFAULT '',
      company_name    TEXT DEFAULT '',
      address_line1   TEXT DEFAULT '',
      address_line2   TEXT DEFAULT '',
      city            TEXT DEFAULT '',
      state           TEXT DEFAULT '',
      postal_code     TEXT DEFAULT '',
      country         TEXT DEFAULT '',
      notes           TEXT DEFAULT '',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS quotes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_number    TEXT NOT NULL UNIQUE,
      client_id       INTEGER NOT NULL REFERENCES clients(id),
      status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','accepted','declined')),
      date_created    TEXT NOT NULL,
      date_sent       TEXT DEFAULT NULL,
      date_accepted   TEXT DEFAULT NULL,
      valid_until     TEXT DEFAULT NULL,
      subtotal        REAL NOT NULL DEFAULT 0,
      tax_amount      REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      total           REAL NOT NULL DEFAULT 0,
      notes           TEXT DEFAULT '',
      terms           TEXT DEFAULT '',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS quote_line_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id        INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      description     TEXT NOT NULL,
      quantity        REAL NOT NULL CHECK (quantity >= 0),
      unit_price      REAL NOT NULL CHECK (unit_price >= 0),
      tax_rate        REAL NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
      discount_percent REAL NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
      amount          REAL NOT NULL,
      sort_order      INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number  TEXT NOT NULL UNIQUE,
      quote_id        INTEGER DEFAULT NULL REFERENCES quotes(id),
      client_id       INTEGER NOT NULL REFERENCES clients(id),
      status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','paid','partially_paid','overdue')),
      date_created    TEXT NOT NULL,
      date_sent       TEXT DEFAULT NULL,
      date_due        TEXT DEFAULT NULL,
      subtotal        REAL NOT NULL DEFAULT 0,
      tax_amount      REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      total           REAL NOT NULL DEFAULT 0,
      amount_paid     REAL NOT NULL DEFAULT 0,
      balance_due     REAL NOT NULL DEFAULT 0,
      notes           TEXT DEFAULT '',
      terms           TEXT DEFAULT '',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description     TEXT NOT NULL,
      quantity        REAL NOT NULL CHECK (quantity >= 0),
      unit_price      REAL NOT NULL CHECK (unit_price >= 0),
      tax_rate        REAL NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
      discount_percent REAL NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
      amount          REAL NOT NULL,
      sort_order      INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      amount          REAL NOT NULL CHECK (amount > 0),
      payment_date    TEXT NOT NULL,
      payment_method  TEXT DEFAULT '',
      reference_number TEXT DEFAULT '',
      notes           TEXT DEFAULT '',
      created_at      TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sequence_counters (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      prefix          TEXT NOT NULL,
      year            INTEGER NOT NULL,
      last_number     INTEGER NOT NULL DEFAULT 0,
      UNIQUE(prefix, year)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version         INTEGER PRIMARY KEY,
      applied_at      TEXT NOT NULL
    );
  `);
}

const MIGRATIONS = [
  {
    version: 2,
    up: () => {
      const cols = db.exec(`PRAGMA table_info(company_profile)`);
      const existing = new Set(cols[0].values.map((v) => v[1]));

      const addIfMissing = [
        ['tax_id', "TEXT DEFAULT ''"],
        ['invoice_prefix', "TEXT NOT NULL DEFAULT 'INV-'"],
        ['invoice_start_number', 'INTEGER NOT NULL DEFAULT 1'],
        ['quote_prefix', "TEXT NOT NULL DEFAULT 'Q-'"],
        ['quote_start_number', 'INTEGER NOT NULL DEFAULT 1'],
        ['default_terms', "TEXT DEFAULT ''"],
      ];

      for (const [name, def] of addIfMissing) {
        if (!existing.has(name)) {
          db.run(`ALTER TABLE company_profile ADD COLUMN ${name} ${def}`);
        }
      }
    },
  },
  {
    version: 3,
    up: () => {
      const cols = db.exec(`PRAGMA table_info(clients)`);
      const existing = new Set(cols[0].values.map((v) => v[1]));
      if (!existing.has('archived')) {
        db.run(`ALTER TABLE clients ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
      }
    },
  },
  {
    version: 4,
    up: () => {
      const cols = db.exec(`PRAGMA table_info(quotes)`);
      const existing = new Set(cols[0].values.map((v) => v[1]));
      if (!existing.has('discount_type')) {
        db.run(`ALTER TABLE quotes ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none'`);
      }
      if (!existing.has('discount_value')) {
        db.run(`ALTER TABLE quotes ADD COLUMN discount_value REAL NOT NULL DEFAULT 0`);
      }
      if (!existing.has('tax_rate')) {
        db.run(`ALTER TABLE quotes ADD COLUMN tax_rate REAL NOT NULL DEFAULT 0`);
      }
      if (!existing.has('currency')) {
        db.run(`ALTER TABLE quotes ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'`);
      }
    },
  },
  {
    version: 5,
    up: () => {
      // Enforce that a quote can be converted to an invoice only once.
      // SQLite allows multiple NULLs, so non-linked invoices are unaffected.
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_quote_id ON invoices(quote_id)`);
    },
  },
  {
    version: 6,
    up: () => {
      const cols = db.exec(`PRAGMA table_info(company_profile)`);
      const existing = new Set(cols[0].values.map((v) => v[1]));
      if (!existing.has('payment_details')) {
        db.run(`ALTER TABLE company_profile ADD COLUMN payment_details TEXT DEFAULT ''`);
      }
    },
  },
];

function runMigrations() {
  const res = db.exec(`SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations`);
  let current = res[0].values[0][0];
  let appliedAny = false;

  for (const migration of MIGRATIONS) {
    if (migration.version > current) {
      db.run('BEGIN');
      try {
        migration.up();
        db.run(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`, [
          migration.version,
          new Date().toISOString(),
        ]);
        db.run('COMMIT');
        current = migration.version;
        appliedAny = true;
      } catch (err) {
        db.run('ROLLBACK');
        throw err;
      }
    }
  }

  return appliedAny;
}

function getCompanyProfile() {
  const res = db.exec('SELECT * FROM company_profile WHERE id = 1');
  if (!res.length || res[0].values.length === 0) {
    return null;
  }

  const cols = res[0].columns;
  const row = res[0].values[0];
  const profile = {};
  cols.forEach((col, i) => {
    profile[col] = row[i];
  });
  return profile;
}

function saveCompanyProfile(profile) {
  const now = new Date().toISOString();
  const existing = getCompanyProfile();
  const fields = {
    business_name: profile.business_name || '',
    logo_path: profile.logo_path !== undefined ? profile.logo_path : (existing && existing.logo_path) || null,
    address_line1: profile.address_line1 || '',
    address_line2: profile.address_line2 || '',
    city: profile.city || '',
    state: profile.state || '',
    postal_code: profile.postal_code || '',
    country: profile.country || '',
    phone: profile.phone || '',
    email: profile.email || '',
    website: profile.website || '',
    tax_id: profile.tax_id || '',
    default_currency: profile.default_currency || 'USD',
    default_tax_rate: Number(profile.default_tax_rate || 0),
    invoice_prefix: profile.invoice_prefix || 'INV-',
    invoice_start_number: Number(profile.invoice_start_number || 1),
    quote_prefix: profile.quote_prefix || 'Q-',
    quote_start_number: Number(profile.quote_start_number || 1),
    default_terms: profile.default_terms || '',
    payment_details: profile.payment_details !== undefined ? profile.payment_details : (existing && existing.payment_details) || '',
  };

  if (existing) {
    db.run(
      `UPDATE company_profile SET
        business_name = ?, logo_path = ?, address_line1 = ?, address_line2 = ?,
        city = ?, state = ?, postal_code = ?, country = ?, phone = ?, email = ?,
        website = ?, tax_id = ?, default_currency = ?, default_tax_rate = ?,
        invoice_prefix = ?, invoice_start_number = ?, quote_prefix = ?,
        quote_start_number = ?, default_terms = ?, payment_details = ?, updated_at = ?
       WHERE id = 1`,
      [
        fields.business_name, fields.logo_path, fields.address_line1, fields.address_line2,
        fields.city, fields.state, fields.postal_code, fields.country, fields.phone, fields.email,
        fields.website, fields.tax_id, fields.default_currency, fields.default_tax_rate,
        fields.invoice_prefix, fields.invoice_start_number, fields.quote_prefix,
        fields.quote_start_number, fields.default_terms, fields.payment_details, now,
      ]
    );
  } else {
    db.run(
      `INSERT INTO company_profile (
        id, business_name, logo_path, address_line1, address_line2, city, state,
        postal_code, country, phone, email, website, tax_id, default_currency,
        default_tax_rate, invoice_prefix, invoice_start_number, quote_prefix,
        quote_start_number, default_terms, payment_details, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        1, fields.business_name, fields.logo_path, fields.address_line1, fields.address_line2,
        fields.city, fields.state, fields.postal_code, fields.country, fields.phone, fields.email,
        fields.website, fields.tax_id, fields.default_currency, fields.default_tax_rate,
        fields.invoice_prefix, fields.invoice_start_number, fields.quote_prefix,
        fields.quote_start_number, fields.default_terms, fields.payment_details, now, now,
      ]
    );
  }

  saveToDisk();
  return getCompanyProfile();
}

function getClients() {
  const res = db.exec(`SELECT * FROM clients WHERE archived = 0 ORDER BY name COLLATE NOCASE ASC`);
  if (!res.length) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function getClient(id) {
  const res = db.exec('SELECT * FROM clients WHERE id = ?', [id]);
  if (!res.length || res[0].values.length === 0) return null;
  const cols = res[0].columns;
  const row = res[0].values[0];
  const obj = {};
  cols.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

function addClient(client) {
  const now = new Date().toISOString();
  const info = db.run(
    `INSERT INTO clients (
      name, email, phone, company_name, address_line1, address_line2, city,
      state, postal_code, country, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(client.name || '').trim(),
      String(client.email || '').trim(),
      String(client.phone || '').trim(),
      String(client.company_name || '').trim(),
      String(client.address_line1 || '').trim(),
      String(client.address_line2 || '').trim(),
      String(client.city || '').trim(),
      String(client.state || '').trim(),
      String(client.postal_code || '').trim(),
      String(client.country || '').trim(),
      String(client.notes || ''),
      now,
      now,
    ]
  );

  const idRes = db.exec('SELECT last_insert_rowid() AS id');
  const newId = idRes[0].values[0][0];

  saveToDisk();
  return getClient(newId);
}

function clientParams(client, now) {
  return [
    String(client.name || '').trim(),
    String(client.email || '').trim(),
    String(client.phone || '').trim(),
    String(client.company_name || '').trim(),
    String(client.address_line1 || '').trim(),
    String(client.address_line2 || '').trim(),
    String(client.city || '').trim(),
    String(client.state || '').trim(),
    String(client.postal_code || '').trim(),
    String(client.country || '').trim(),
    String(client.notes || ''),
  ];
}

function updateClient(id, client) {
  const now = new Date().toISOString();
  const p = clientParams(client, now);
  db.run(
    `UPDATE clients SET
       name = ?, email = ?, phone = ?, company_name = ?, address_line1 = ?,
       address_line2 = ?, city = ?, state = ?, postal_code = ?, country = ?,
       notes = ?, updated_at = ?
     WHERE id = ?`,
    [...p, now, id]
  );

  saveToDisk();
  return getClient(id);
}

function countClientHistory(id) {
  const quotes = db.exec('SELECT COUNT(*) AS c FROM quotes WHERE client_id = ?', [id]);
  const invoices = db.exec('SELECT COUNT(*) AS c FROM invoices WHERE client_id = ?', [id]);
  return {
    quoteCount: quotes[0].values[0][0],
    invoiceCount: invoices[0].values[0][0],
  };
}

function archiveClient(id) {
  const now = new Date().toISOString();
  db.run(`UPDATE clients SET archived = 1, updated_at = ? WHERE id = ?`, [now, id]);
  saveToDisk();
  return getClient(id);
}

function deleteClient(id) {
  const history = countClientHistory(id);
  if (history.quoteCount > 0 || history.invoiceCount > 0) {
    return { ok: false, blocked: true, ...history };
  }
  const changes = db.run(`DELETE FROM clients WHERE id = ?`, [id]);
  const deleted = db.getRowsModified() > 0;
  saveToDisk();
  return { ok: true, deleted };
}

// ---------- Quote numbering (monotonic, never reused) ----------
// Counter is keyed by (prefix, year) in sequence_counters. It only ever
// increments and is never decremented, so even if a quote is deleted the
// number is never reused. quote_number is UNIQUE, enforcing this hard.

function padNumber(n) {
  const s = String(n);
  return s.length >= 4 ? s : s.padStart(4, '0');
}

function getQuotePrefix() {
  const profile = getCompanyProfile();
  return (profile && profile.quote_prefix) || 'Q-';
}

function getQuoteStartNumber() {
  const profile = getCompanyProfile();
  return (profile && Number(profile.quote_start_number)) || 1;
}

function nextQuoteNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const prefix = getQuotePrefix();
  const startNumber = getQuoteStartNumber();

  db.run('BEGIN');
  try {
    const res = db.exec(
      `SELECT last_number FROM sequence_counters WHERE prefix = ? AND year = ?`,
      [prefix, year]
    );
    let last = 0;
    if (res.length && res[0].values.length > 0) {
      last = res[0].values[0][0];
    } else {
      last = startNumber - 1;
      db.run(
        `INSERT INTO sequence_counters (prefix, year, last_number) VALUES (?, ?, ?)`,
        [prefix, year, last]
      );
    }
    const next = last + 1;
    const padded = padNumber(next);
    const quoteNumber = `${prefix}${year}-${padded}`;
    db.run(
      `UPDATE sequence_counters SET last_number = ? WHERE prefix = ? AND year = ?`,
      [next, prefix, year]
    );
    db.run('COMMIT');
    return quoteNumber;
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

function rowToObject(res) {
  if (!res.length || res[0].values.length === 0) return null;
  const cols = res[0].columns;
  const row = res[0].values[0];
  const obj = {};
  cols.forEach((col, i) => { obj[col] = row[i]; });
  return obj;
}

function rowsToArray(res) {
  if (!res.length) return [];
  const cols = res[0].columns;
  return res[0].values.map((row) => {
    const obj = {};
    cols.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

function getQuoteLineItems(quoteId) {
  const res = db.exec(
    `SELECT id, description, quantity, unit_price, amount, sort_order
       FROM quote_line_items WHERE quote_id = ? ORDER BY sort_order ASC, id ASC`,
    [quoteId]
  );
  return rowsToArray(res);
}

function createQuote(data, lineItems) {
  const errors = validateQuoteInput(data, lineItems);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const now = new Date().toISOString();
  const profile = getCompanyProfile();
  const currency = (profile && profile.default_currency) || 'USD';
  const quoteNumber = nextQuoteNumber();
  let createdQuoteId = null;

  db.run('BEGIN');
  try {
    const insertRes = db.run(
      `INSERT INTO quotes (
        quote_number, client_id, status, date_created, valid_until,
        subtotal, discount_amount, discount_type, discount_value, tax_rate,
        tax_amount, total, currency, notes, terms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quoteNumber,
        data.client_id,
        'draft',
        data.date_created || new Date().toISOString().slice(0, 10),
        data.valid_until || null,
        Number(data.subtotal) || 0,
        Number(data.discount) || 0,
        data.discount_type || 'none',
        Number(data.discount_value) || 0,
        Number(data.tax_rate) || 0,
        Number(data.tax) || 0,
        Number(data.total) || 0,
        currency,
        data.notes || '',
        data.terms || '',
        now,
        now,
      ]
    );
    const idRes = db.exec('SELECT last_insert_rowid() AS id');
    createdQuoteId = idRes[0].values[0][0];

    lineItems.forEach((item, idx) => {
      db.run(
        `INSERT INTO quote_line_items (
          quote_id, description, quantity, unit_price,
          tax_rate, discount_percent, amount, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createdQuoteId,
          String(item.description).trim(),
          Number(item.quantity),
          Number(item.unit_price),
          Number(data.tax_rate) || 0,
          0,
          Number(item.amount) || 0,
          idx,
        ]
      );
    });

    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    return { ok: false, errors: { general: `Failed to save quote: ${err.message}` } };
  }

  saveToDisk();
  return { ok: true, quote: getQuote(createdQuoteId) };
}

function updateQuote(id, data, lineItems) {
  const errors = validateQuoteInput(data, lineItems);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const existing = getQuote(id);
  if (!existing) {
    return { ok: false, errors: { general: 'Quote not found.' } };
  }
  if (existing.status !== 'draft') {
    return { ok: false, errors: { general: 'Only draft quotes can be edited.' } };
  }

  const now = new Date().toISOString();
  const profile = getCompanyProfile();
  const currency = (profile && profile.default_currency) || 'USD';

  const dateCreatedVal = data.date_created === undefined || data.date_created === null
    ? existing.date_created
    : (String(data.date_created) || existing.date_created);
  const validUntilVal = data.valid_until === undefined || data.valid_until === null
    ? existing.valid_until
    : (String(data.valid_until) || null);

  db.run('BEGIN');
  try {
    db.run(
      `UPDATE quotes SET
        client_id = ?, date_created = ?, valid_until = ?,
        subtotal = ?, discount_amount = ?, discount_type = ?,
        discount_value = ?, tax_rate = ?, tax_amount = ?, total = ?,
        currency = ?, notes = ?, terms = ?, updated_at = ?
       WHERE id = ?`,
      [
        data.client_id,
        dateCreatedVal,
        validUntilVal,
        Number(data.subtotal) || 0,
        Number(data.discount) || 0,
        data.discount_type || 'none',
        Number(data.discount_value) || 0,
        Number(data.tax_rate) || 0,
        Number(data.tax) || 0,
        Number(data.total) || 0,
        currency,
        data.notes || '',
        data.terms || '',
        now,
        id,
      ]
    );

    db.run(`DELETE FROM quote_line_items WHERE quote_id = ?`, [id]);
    lineItems.forEach((item, idx) => {
      db.run(
        `INSERT INTO quote_line_items (
          quote_id, description, quantity, unit_price,
          tax_rate, discount_percent, amount, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          String(item.description).trim(),
          Number(item.quantity),
          Number(item.unit_price),
          Number(data.tax_rate) || 0,
          0,
          Number(item.amount) || 0,
          idx,
        ]
      );
    });

    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    return { ok: false, errors: { general: `Failed to update quote: ${err.message}` } };
  }

  saveToDisk();
  return { ok: true, quote: getQuote(id) };
}

function getQuote(id) {
  const quote = rowToObject(db.exec('SELECT * FROM quotes WHERE id = ?', [id]));
  if (!quote) return null;
  quote.line_items = getQuoteLineItems(id);
  const client = getClient(quote.client_id);
  quote.client = client ? { id: client.id, name: client.name, company_name: client.company_name } : null;
  return quote;
}

function listQuotes() {
  const quotes = rowsToArray(
    db.exec(`SELECT * FROM quotes ORDER BY created_at DESC, id DESC`)
  );
  return quotes.map((q) => {
    const client = getClient(q.client_id);
    q.client = client ? { id: client.id, name: client.name, company_name: client.company_name } : null;
    return q;
  });
}

const ALLOWED_QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'declined'];

function setQuoteStatus(id, status) {
  if (!ALLOWED_QUOTE_STATUSES.includes(status)) {
    return { ok: false, errors: { status: 'Invalid quote status.' } };
  }
  const existing = getQuote(id);
  if (!existing) {
    return { ok: false, errors: { general: 'Quote not found.' } };
  }

  const now = new Date().toISOString();
  const fields = [];
  const params = [];
  if (status === 'sent' && !existing.date_sent) {
    fields.push('date_sent = ?');
    params.push(now);
  }
  if (status === 'accepted' && !existing.date_accepted) {
    fields.push('date_accepted = ?');
    params.push(now);
  }
  if (status !== 'sent') {
    fields.push('date_sent = ?');
    params.push(null);
  }
  if (status !== 'accepted') {
    fields.push('date_accepted = ?');
    params.push(null);
  }
  fields.push('updated_at = ?');
  params.push(now);

  db.run(
    `UPDATE quotes SET status = ?, ${fields.join(', ')} WHERE id = ?`,
    [status, ...params, id]
  );
  saveToDisk();
  return { ok: true, quote: getQuote(id) };
}

// ---------- Invoice numbering & conversion ----------
function getInvoicePrefix() {
  const profile = getCompanyProfile();
  return (profile && profile.invoice_prefix) || 'INV-';
}

function getInvoiceStartNumber() {
  const profile = getCompanyProfile();
  return (profile && Number(profile.invoice_start_number)) || 1;
}

function nextInvoiceNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const prefix = getInvoicePrefix();
  const startNumber = getInvoiceStartNumber();

  db.run('BEGIN');
  try {
    const res = db.exec(
      `SELECT last_number FROM sequence_counters WHERE prefix = ? AND year = ?`,
      [prefix, year]
    );
    let last = 0;
    if (res.length && res[0].values.length > 0) {
      last = res[0].values[0][0];
    } else {
      last = startNumber - 1;
      db.run(
        `INSERT INTO sequence_counters (prefix, year, last_number) VALUES (?, ?, ?)`,
        [prefix, year, last]
      );
    }
    const next = last + 1;
    const invoiceNumber = `${prefix}${year}-${padNumber(next)}`;
    db.run(
      `UPDATE sequence_counters SET last_number = ? WHERE prefix = ? AND year = ?`,
      [next, prefix, year]
    );
    db.run('COMMIT');
    return invoiceNumber;
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

// Parse a clear "N days" figure from free-text payment terms. If unclear,
// return null so the caller can fall back to the default (+14 days).
function parsePaymentTermsDays(terms) {
  if (!terms) return null;
  const m = String(terms).match(/(\d+)\s*day/i);
  if (m && Number(m[1]) >= 0) return Number(m[1]);
  return null;
}

function toDateString(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00');
  return !Number.isNaN(d.getTime()) && toDateString(d) === value;
}

function countDecimals(value) {
  const match = String(value).match(/\.(\d+)$/);
  return match ? match[1].length : 0;
}

function hasMoreThanTwoDecimals(value) {
  if (value === undefined || value === null || value === '') return false;
  return countDecimals(value) > 2;
}

function validateQuoteInput(data, lineItems) {
  const errors = {};

  if (!data.client_id) {
    errors.client_id = 'Please select a client.';
    return errors;
  }
  if (!lineItems || lineItems.length === 0) {
    errors.general = 'Add at least one line item.';
    return errors;
  }

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    if (!item.description || !String(item.description).trim()) {
      errors.general = `Line item ${i + 1} is missing a description.`;
      return errors;
    }
    if (!(Number(item.quantity) > 0)) {
      errors.general = `Line item ${i + 1} must have a quantity greater than zero.`;
      return errors;
    }
    if (!(Number(item.unit_price) > 0)) {
      errors.general = `Line item ${i + 1} must have a unit price greater than zero.`;
      return errors;
    }
    if (hasMoreThanTwoDecimals(item.unit_price)) {
      errors.general = `Line item ${i + 1} unit price may only have up to 2 decimal places.`;
      return errors;
    }
  }

  const dateCreated = data.date_created === undefined || data.date_created === null ? '' : String(data.date_created);
  if (!isValidDateString(dateCreated)) {
    errors.date_created = 'Quote date is required and must be a valid date.';
    return errors;
  }
  const validUntil = data.valid_until === undefined || data.valid_until === null ? '' : String(data.valid_until);
  if (validUntil !== '' && !isValidDateString(validUntil)) {
    errors.valid_until = 'Expiry date must be a valid date.';
    return errors;
  }
  if (validUntil !== '' && validUntil < dateCreated) {
    errors.valid_until = 'Expiry date cannot be before the quote date.';
    return errors;
  }

  const taxRateStr = data.tax_rate === undefined || data.tax_rate === null ? '' : String(data.tax_rate);
  if (taxRateStr !== '') {
    const tr = Number(data.tax_rate);
    if (Number.isNaN(tr) || tr < 0 || tr > 100) {
      errors.tax_rate = 'Tax rate must be a number between 0 and 100.';
      return errors;
    }
  }

  const discountType = data.discount_type || 'none';
  if (!['none', 'percent', 'fixed'].includes(discountType)) {
    errors.discount_value = 'Invalid discount type.';
    return errors;
  }
  if (discountType !== 'none') {
    const dvStr = data.discount_value === undefined || data.discount_value === null ? '' : String(data.discount_value);
    const dv = Number(data.discount_value);
    if (dvStr === '' || Number.isNaN(dv) || dv < 0 || (discountType === 'percent' && dv > 100)) {
      errors.discount_value = discountType === 'percent'
        ? 'Percentage discount must be between 0 and 100.'
        : 'Discount cannot be negative.';
      return errors;
    }
    if (discountType === 'fixed' && hasMoreThanTwoDecimals(dvStr)) {
      errors.discount_value = 'Discount amount may only have up to 2 decimal places.';
      return errors;
    }
  }

  return errors;
}

function getInvoiceLineItems(invoiceId) {
  const res = db.exec(
    `SELECT id, description, quantity, unit_price, tax_rate, discount_percent, amount, sort_order
       FROM invoice_line_items WHERE invoice_id = ? ORDER BY sort_order ASC, id ASC`,
    [invoiceId]
  );
  return rowsToArray(res);
}

function getInvoice(id) {
  const invoice = rowToObject(db.exec('SELECT * FROM invoices WHERE id = ?', [id]));
  if (!invoice) return null;
  invoice.line_items = getInvoiceLineItems(id);
  invoice.payments = getPaymentHistory(id);
  refreshInvoiceBalance(invoice);
  const client = getClient(invoice.client_id);
  invoice.client = client ? { id: client.id, name: client.name, company_name: client.company_name } : null;
  return invoice;
}

// Recompute amount_paid / balance_due from the payments ledger and reflect
// them on the invoice object (and optionally persist to the DB).
function computeInvoiceBalance(invoiceId) {
  const res = db.exec(
    `SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?`,
    [invoiceId]
  );
  const paid = Number(res[0].values[0][0]) || 0;
  const invoice = rowToObject(db.exec('SELECT total FROM invoices WHERE id = ?', [invoiceId]));
  const total = Number(invoice.total) || 0;
  const balance = Math.round((total - paid) * 100) / 100;
  return { total, paid: Math.round(paid * 100) / 100, balance };
}

function refreshInvoiceBalance(invoice) {
  if (invoice.id !== undefined) {
    const b = computeInvoiceBalance(invoice.id);
    invoice.amount_paid = b.paid;
    invoice.balance_due = b.balance;
  }
  return invoice;
}

function getInvoiceByQuote(quoteId) {
  const res = db.exec('SELECT id FROM invoices WHERE quote_id = ?', [quoteId]);
  if (!res.length || res[0].values.length === 0) return null;
  return getInvoice(res[0].values[0][0]);
}

// Convert an accepted quote into an invoice. Returns:
//   { ok:true, invoice, alreadyConverted:false }
// or if already converted:
//   { ok:true, alreadyConverted:true, invoice: <existing> }
function convertQuoteToInvoice(quoteId, overrides) {
  const quote = getQuote(quoteId);
  if (!quote) {
    return { ok: false, errors: { general: 'Quote not found.' } };
  }
  if (quote.status !== 'accepted') {
    return { ok: false, errors: { general: 'Only accepted quotes can be converted to an invoice.' } };
  }

  const existing = getInvoiceByQuote(quoteId);
  if (existing) {
    return { ok: true, alreadyConverted: true, invoice: existing };
  }

  const now = new Date().toISOString();
  const today = new Date();

  // Due date: from overrides, else parse payment terms, else default +14 days.
  let dueDate;
  const over = overrides || {};
  if (over.date_due && !isValidDateString(over.date_due)) {
    return { ok: false, errors: { date_due: 'Due date must be a valid date.' } };
  }
  if (over.date_due && over.date_due < toDateString(today)) {
    return { ok: false, errors: { date_due: 'Due date cannot be before today.' } };
  }
  if (over.date_due) {
    dueDate = over.date_due;
  } else {
    const termsSource = over.terms !== undefined ? over.terms : (quote.terms || '');
    const days = parsePaymentTermsDays(termsSource);
    const due = new Date(today);
    due.setDate(due.getDate() + (days === null ? 14 : days));
    dueDate = toDateString(due);
  }

  const status = over.status || 'sent';
  if (!['draft', 'sent', 'paid', 'partially_paid', 'overdue'].includes(status)) {
    return { ok: false, errors: { status: 'Invalid invoice status.' } };
  }

  const invoiceNumber = nextInvoiceNumber();
  let invoiceId = null;

  db.run('BEGIN');
  try {
    const insertRes = db.run(
      `INSERT INTO invoices (
        invoice_number, quote_id, client_id, status, date_created, date_sent, date_due,
        subtotal, tax_amount, discount_amount, total, amount_paid, balance_due,
        notes, terms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        quoteId,
        quote.client_id,
        status,
        toDateString(today),
        status === 'sent' ? now : null,
        dueDate,
        Number(quote.subtotal) || 0,
        Number(quote.tax_amount) || 0,
        Number(quote.discount_amount) || 0,
        Number(quote.total) || 0,
        0,
        Number(quote.total) || 0,
        over.notes !== undefined ? over.notes : '',
        over.terms !== undefined ? over.terms : (quote.terms || ''),
        now,
        now,
      ]
    );
    const idRes = db.exec('SELECT last_insert_rowid() AS id');
    invoiceId = idRes[0].values[0][0];

    (quote.line_items || []).forEach((item, idx) => {
      db.run(
        `INSERT INTO invoice_line_items (
          invoice_id, description, quantity, unit_price,
          tax_rate, discount_percent, amount, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          item.description,
          Number(item.quantity),
          Number(item.unit_price),
          Number(item.tax_rate) || 0,
          Number(item.discount_percent) || 0,
          Number(item.amount) || 0,
          idx,
        ]
      );
    });

    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    if (String(err.message).toLowerCase().includes('unique')) {
      const existing2 = getInvoiceByQuote(quoteId);
      if (existing2) {
        return { ok: true, alreadyConverted: true, invoice: existing2 };
      }
    }
    return { ok: false, errors: { general: `Failed to create invoice: ${err.message}` } };
  }

  saveToDisk();
  return { ok: true, alreadyConverted: false, invoice: getInvoice(invoiceId) };
}

function listInvoices() {
  const invoices = rowsToArray(
    db.exec(`SELECT * FROM invoices ORDER BY created_at DESC, id DESC`)
  );
  return invoices.map((inv) => {
    refreshInvoiceBalance(inv);
    const client = getClient(inv.client_id);
    inv.client = client ? { id: client.id, name: client.name, company_name: client.company_name } : null;
    return inv;
  });
}

const ALLOWED_INVOICE_STATUSES = ['draft', 'sent', 'paid', 'partially_paid', 'overdue'];

function setInvoiceStatus(id, status) {
  if (!ALLOWED_INVOICE_STATUSES.includes(status)) {
    return { ok: false, errors: { status: 'Invalid invoice status.' } };
  }
  const existing = getInvoice(id);
  if (!existing) {
    return { ok: false, errors: { general: 'Invoice not found.' } };
  }

  const now = new Date().toISOString();
  db.run(
    `UPDATE invoices SET status = ?, date_sent = ?, updated_at = ? WHERE id = ?`,
    [status, status === 'sent' ? now : existing.date_sent, now, id]
  );
  saveToDisk();
  return { ok: true, invoice: getInvoice(id) };
}

// ---------- Payments ----------
const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Card', 'Other'];

function getPaymentHistory(invoiceId) {
  const res = db.exec(
    `SELECT id, amount, payment_date, payment_method, reference_number, notes, created_at
       FROM payments WHERE invoice_id = ? ORDER BY payment_date ASC, id ASC`,
    [invoiceId]
  );
  return rowsToArray(res);
}

// Record a payment against an invoice. Validates the amount is positive and
// does not exceed the remaining balance due. Recomputes amount_paid /
// balance_due and auto-updates the status (partially_paid if any balance
// remains and something has been paid; paid once the balance reaches 0).
function addPayment(invoiceId, input) {
  const existing = rowToObject(db.exec('SELECT * FROM invoices WHERE id = ?', [invoiceId]));
  if (!existing) {
    return { ok: false, errors: { general: 'Invoice not found.' } };
  }

  const amount = Number(input.amount);
  if (!(amount > 0)) {
    return { ok: false, errors: { amount: 'Payment amount must be greater than zero.' } };
  }
  if (hasMoreThanTwoDecimals(input.amount)) {
    return { ok: false, errors: { amount: 'Payment amount may only have up to 2 decimal places.' } };
  }

  const balance = computeInvoiceBalance(invoiceId);
  if (amount > balance.balance + 0.0001) {
    return {
      ok: false,
      errors: { amount: `Payment of ${amount.toFixed(2)} exceeds the remaining balance due of ${balance.balance.toFixed(2)}.` },
    };
  }

  const now = new Date().toISOString();
  const date = input.payment_date || toDateString(new Date());
  if (!isValidDateString(date)) {
    return { ok: false, errors: { payment_date: 'Payment date must be a valid date.' } };
  }
  const method = input.payment_method || '';
  const ref = input.reference_number || '';
  const notes = input.notes || '';

  db.run('BEGIN');
  try {
    db.run(
      `INSERT INTO payments (invoice_id, amount, payment_date, payment_method, reference_number, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [invoiceId, Math.round(amount * 100) / 100, date, method, ref, notes, now]
    );

    const b = computeInvoiceBalance(invoiceId);
    const newStatus = b.balance <= 0.0001 ? 'paid' : (b.paid > 0 ? 'partially_paid' : existing.status);
    db.run(
      `UPDATE invoices SET amount_paid = ?, balance_due = ?, status = ?, updated_at = ? WHERE id = ?`,
      [b.paid, b.balance, newStatus, now, invoiceId]
    );

    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    return { ok: false, errors: { general: `Failed to record payment: ${err.message}` } };
  }

  saveToDisk();
  return { ok: true, invoice: getInvoice(invoiceId) };
}

// ---------- Dashboard stats ----------
function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let outstanding = 0;
  let overdueCount = 0;
  let overdueBalance = 0;
  // Outstanding & overdue use the same source (with refreshed balances) and the
  // same effective-status rule as the Invoices screen, so the numbers always agree.
  for (const inv of listInvoices()) {
    const bal = Number(inv.balance_due) || 0;
    if (bal > 0.0001) outstanding += bal;

    let overdue = false;
    if (inv.date_due) {
      const due = new Date(String(inv.date_due) + 'T00:00:00');
      if (!isNaN(due.getTime()) && due < today) overdue = true;
    }
    if (bal > 0.0001 && overdue) {
      overdueCount += 1;
      overdueBalance += bal;
    }
  }
  outstanding = Math.round(outstanding * 100) / 100;
  overdueBalance = Math.round(overdueBalance * 100) / 100;

  const scalar = (sql) => {
    const res = db.exec(sql);
    if (!res.length || !res[0].values.length) return 0;
    return Number(res[0].values[0][0]) || 0;
  };

  const invoicedMonth = scalar(`SELECT COALESCE(SUM(total), 0) FROM invoices WHERE strftime('%Y-%m', date_created) = strftime('%Y-%m', 'now')`);
  const invoicedYear = scalar(`SELECT COALESCE(SUM(total), 0) FROM invoices WHERE strftime('%Y', date_created) = strftime('%Y', 'now')`);
  const paidMonth = scalar(`SELECT COALESCE(SUM(amount), 0) FROM payments WHERE strftime('%Y-%m', payment_date) = strftime('%Y-%m', 'now')`);
  const paidYear = scalar(`SELECT COALESCE(SUM(amount), 0) FROM payments WHERE strftime('%Y', payment_date) = strftime('%Y', 'now')`);

  const quoteActivity = rowsToArray(db.exec(
    `SELECT id, quote_number AS number, client_id, status, total,
            COALESCE(updated_at, created_at) AS ts
       FROM quotes`
  )).map((r) => Object.assign({ kind: 'quote' }, r));

  const invoiceActivity = rowsToArray(db.exec(
    `SELECT id, invoice_number AS number, client_id, status, total, amount_paid, balance_due, date_due,
            COALESCE(updated_at, created_at) AS ts
       FROM invoices`
  )).map((r) => Object.assign({ kind: 'invoice' }, r));

  const activity = quoteActivity.concat(invoiceActivity);
  activity.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  activity.splice(10);

  for (const item of activity) {
    const c = getClient(item.client_id);
    item.client_name = c ? (c.company_name ? `${c.name} (${c.company_name})` : c.name) : '';
  }

  return {
    outstanding_balance: outstanding,
    overdue_count: overdueCount,
    overdue_balance: overdueBalance,
    invoiced_month: invoicedMonth,
    invoiced_year: invoicedYear,
    paid_month: paidMonth,
    paid_year: paidYear,
    activity,
  };
}

function getDatabaseBuffer() {
  saveToDisk();
  return Buffer.from(db.export());
}

async function validateBackupBuffer(buffer) {
  let payload = null;
  try {
    payload = JSON.parse(buffer.toString('utf8'));
  } catch (e) {
    return { ok: false, error: 'This file is not a valid QuoteCraft backup (it could not be read as JSON).' };
  }

  if (
    !payload ||
    payload.app !== 'QuoteCraft' ||
    payload.magic !== 'QUOTECRAFT_BACKUP' ||
    payload.version !== 1
  ) {
    return { ok: false, error: 'This file is not a valid QuoteCraft backup.' };
  }

  if (typeof payload.database !== 'string' || payload.database.length < 20) {
    return { ok: false, error: 'The backup contains no database data.' };
  }

  let dbBytes;
  try {
    dbBytes = Buffer.from(payload.database, 'base64');
  } catch (e) {
    return { ok: false, error: 'The backup database data is corrupt and could not be decoded.' };
  }

  if (dbBytes.slice(0, 16).toString('latin1') !== 'SQLite format 3\u0000') {
    return { ok: false, error: 'The backup is not a valid QuoteCraft database.' };
  }

  let counts = { clients: 0, quotes: 0, invoices: 0, payments: 0 };
  try {
    const SQL = await loadSqlJs();
    const trial = new SQL.Database(dbBytes);
    const integrity = trial.exec('PRAGMA integrity_check');
    const status =
      integrity && integrity.length && integrity[0].values.length
        ? String(integrity[0].values[0][0])
        : 'error';
    if (status !== 'ok') {
      trial.close();
      return { ok: false, error: `The backup database failed its integrity check (${status}).` };
    }
    const table = (name) => {
      const r = trial.exec(`SELECT COUNT(*) FROM ${name}`);
      return r && r.length && r[0].values.length ? Number(r[0].values[0][0]) : 0;
    };
    counts = { clients: table('clients'), quotes: table('quotes'), invoices: table('invoices'), payments: table('payments') };
    trial.close();
  } catch (e) {
    return { ok: false, error: `The backup database could not be opened: ${e.message}` };
  }

  return { ok: true, payload, dbBytes, counts };
}

async function restoreDatabaseFromBuffer(dbBytes) {
  const oldBytes = db ? Buffer.from(db.export()) : null;
  if (db) {
    try {
      db.close();
    } catch (e) {
      /* ignore */
    }
    db = null;
  }

  try {
    const SQL = await loadSqlJs();
    db = new SQL.Database(dbBytes);
    createTables();
    runMigrations();
    saveToDisk();
    return true;
  } catch (err) {
    if (db) {
      try {
        db.close();
      } catch (e) {
        /* ignore */
      }
    }
    db = null;
    if (oldBytes) {
      const SQL = await loadSqlJs();
      db = new SQL.Database(oldBytes);
      saveToDisk();
    }
    throw err;
  }
}

function closeDatabase() {
  if (db) {
    saveToDisk();
    db.close();
    db = null;
  }
}

module.exports = {
  initializeDatabase,
  getDb,
  getDbPath,
  saveToDisk,
  closeDatabase,
  getCompanyProfile,
  saveCompanyProfile,
  getDashboardStats,
  getDatabaseBuffer,
  validateBackupBuffer,
  restoreDatabaseFromBuffer,
  getClients,
  getClient,
  addClient,
  updateClient,
  countClientHistory,
  archiveClient,
  deleteClient,
  createQuote,
  updateQuote,
  getQuote,
  listQuotes,
  setQuoteStatus,
  parsePaymentTermsDays,
  convertQuoteToInvoice,
  getInvoice,
  getInvoiceByQuote,
  listInvoices,
  setInvoiceStatus,
  addPayment,
  getPaymentHistory,
  PAYMENT_METHODS,
};
