const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { encryptSecret, decryptSecret, getStorageMechanismName } = require('./secure-storage');

const DB_DIR = app && typeof app.getPath === 'function' ? app.getPath('userData') : path.join(__dirname, '../../data');
const DB_FILE = process.env.TEST_DB_PATH || path.join(DB_DIR, 'quotecraft.sqlite');

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
      reporting_currency TEXT NOT NULL DEFAULT 'USD',
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
      tags            TEXT DEFAULT '',
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS client_contacts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      role            TEXT DEFAULT '',
      email           TEXT DEFAULT '',
      phone           TEXT DEFAULT '',
      is_primary      INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS client_notes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      note            TEXT NOT NULL,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS quotes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_number    TEXT NOT NULL UNIQUE,
      client_id       INTEGER NOT NULL REFERENCES clients(id),
      contact_id      INTEGER DEFAULT NULL,
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
      quote_number_root TEXT DEFAULT NULL,
      version         INTEGER NOT NULL DEFAULT 1,
      is_latest       INTEGER NOT NULL DEFAULT 1,
      notes           TEXT DEFAULT '',
      terms           TEXT DEFAULT '',
      currency        TEXT NOT NULL DEFAULT 'USD',
      exchange_rate   REAL NOT NULL DEFAULT 1.0,
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
      discount_type   TEXT NOT NULL DEFAULT 'none',
      discount_value  REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
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
      contact_id      INTEGER DEFAULT NULL,
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
      recurring_profile_id INTEGER DEFAULT NULL,
      is_recurring    INTEGER NOT NULL DEFAULT 0,
      notes           TEXT DEFAULT '',
      terms           TEXT DEFAULT '',
      currency        TEXT NOT NULL DEFAULT 'USD',
      exchange_rate   REAL NOT NULL DEFAULT 1.0,
      invoice_type    TEXT NOT NULL DEFAULT 'standard',
      deposit_percent REAL DEFAULT NULL,
      deposit_amount  REAL DEFAULT NULL,
      original_quote_total REAL DEFAULT NULL,
      deposit_invoice_id INTEGER DEFAULT NULL REFERENCES invoices(id),
      is_final_generated INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS recurring_profiles (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      source_invoice_id  INTEGER NOT NULL REFERENCES invoices(id),
      frequency          TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
      status             TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'paused', 'cancelled', 'completed')),
      next_issue_date    TEXT NOT NULL,
      end_date           TEXT DEFAULT NULL,
      created_at         TEXT NOT NULL,
      updated_at         TEXT NOT NULL
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
      discount_type   TEXT NOT NULL DEFAULT 'none',
      discount_value  REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS credit_notes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      credit_note_number TEXT NOT NULL UNIQUE,
      invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      client_id       INTEGER NOT NULL REFERENCES clients(id),
      amount          REAL NOT NULL CHECK (amount > 0),
      reason          TEXT DEFAULT '',
      date_created    TEXT NOT NULL,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
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

  db.run(`
    CREATE TABLE IF NOT EXISTS line_item_templates (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      description     TEXT DEFAULT '',
      unit_price      REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
      tax_rate        REAL NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      amount          REAL NOT NULL CHECK (amount > 0),
      date            TEXT NOT NULL,
      category        TEXT NOT NULL DEFAULT 'Other',
      notes           TEXT DEFAULT '',
      currency        TEXT DEFAULT 'USD',
      exchange_rate   REAL DEFAULT 1.0,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
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
  {
    version: 7,
    up: () => {
      db.run(`
        CREATE TABLE IF NOT EXISTS line_item_templates (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          name            TEXT NOT NULL,
          description     TEXT DEFAULT '',
          unit_price      REAL NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
          tax_rate        REAL NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 8,
    up: () => {
      db.run(`
        CREATE TABLE IF NOT EXISTS client_contacts (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          name            TEXT NOT NULL,
          role            TEXT DEFAULT '',
          email           TEXT DEFAULT '',
          phone           TEXT DEFAULT '',
          is_primary      INTEGER NOT NULL DEFAULT 0,
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL
        );
      `);
      const quoteCols = db.exec(`PRAGMA table_info(quotes)`);
      const quoteExisting = new Set(quoteCols[0].values.map((v) => v[1]));
      if (!quoteExisting.has('contact_id')) {
        db.run(`ALTER TABLE quotes ADD COLUMN contact_id INTEGER DEFAULT NULL`);
      }
      const invCols = db.exec(`PRAGMA table_info(invoices)`);
      const invExisting = new Set(invCols[0].values.map((v) => v[1]));
      if (!invExisting.has('contact_id')) {
        db.run(`ALTER TABLE invoices ADD COLUMN contact_id INTEGER DEFAULT NULL`);
      }
    },
  },
  {
    version: 9,
    up: () => {
      const clientCols = db.exec(`PRAGMA table_info(clients)`);
      const existing = new Set(clientCols[0].values.map((v) => v[1]));
      if (!existing.has('tags')) {
        db.run(`ALTER TABLE clients ADD COLUMN tags TEXT DEFAULT ''`);
      }
    },
  },
  {
    version: 10,
    up: () => {
      db.run(`
        CREATE TABLE IF NOT EXISTS client_notes (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
          note            TEXT NOT NULL,
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 11,
    up: () => {
      const qCols = db.exec(`PRAGMA table_info(quote_line_items)`);
      const qExisting = new Set(qCols[0].values.map((v) => v[1]));
      if (!qExisting.has('discount_type')) {
        db.run(`ALTER TABLE quote_line_items ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none'`);
      }
      if (!qExisting.has('discount_value')) {
        db.run(`ALTER TABLE quote_line_items ADD COLUMN discount_value REAL NOT NULL DEFAULT 0`);
      }
      if (!qExisting.has('discount_amount')) {
        db.run(`ALTER TABLE quote_line_items ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`);
      }

      const invCols = db.exec(`PRAGMA table_info(invoice_line_items)`);
      const invExisting = new Set(invCols[0].values.map((v) => v[1]));
      if (!invExisting.has('discount_type')) {
        db.run(`ALTER TABLE invoice_line_items ADD COLUMN discount_type TEXT NOT NULL DEFAULT 'none'`);
      }
      if (!invExisting.has('discount_value')) {
        db.run(`ALTER TABLE invoice_line_items ADD COLUMN discount_value REAL NOT NULL DEFAULT 0`);
      }
      if (!invExisting.has('discount_amount')) {
        db.run(`ALTER TABLE invoice_line_items ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0`);
      }
    },
  },
  {
    version: 12,
    up: () => {
      const qCols = db.exec(`PRAGMA table_info(quotes)`);
      const existing = new Set(qCols[0].values.map((v) => v[1]));
      if (!existing.has('version')) {
        db.run(`ALTER TABLE quotes ADD COLUMN version INTEGER NOT NULL DEFAULT 1`);
      }
      if (!existing.has('quote_number_root')) {
        db.run(`ALTER TABLE quotes ADD COLUMN quote_number_root TEXT DEFAULT NULL`);
      }
      if (!existing.has('is_latest')) {
        db.run(`ALTER TABLE quotes ADD COLUMN is_latest INTEGER NOT NULL DEFAULT 1`);
      }
      db.run(`UPDATE quotes SET quote_number_root = quote_number WHERE quote_number_root IS NULL OR quote_number_root = ''`);
    },
  },
  {
    version: 13,
    up: () => {
      db.run(`
        CREATE TABLE IF NOT EXISTS recurring_profiles (
          id                 INTEGER PRIMARY KEY AUTOINCREMENT,
          source_invoice_id  INTEGER NOT NULL REFERENCES invoices(id),
          frequency          TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
          status             TEXT NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'paused', 'cancelled', 'completed')),
          next_issue_date    TEXT NOT NULL,
          end_date           TEXT DEFAULT NULL,
          created_at         TEXT NOT NULL,
          updated_at         TEXT NOT NULL
        );
      `);
      const invCols = db.exec(`PRAGMA table_info(invoices)`);
      const invExisting = new Set(invCols[0].values.map((v) => v[1]));
      if (!invExisting.has('recurring_profile_id')) {
        db.run(`ALTER TABLE invoices ADD COLUMN recurring_profile_id INTEGER DEFAULT NULL`);
      }
      if (!invExisting.has('is_recurring')) {
        db.run(`ALTER TABLE invoices ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0`);
      }
    },
  },
  {
    version: 14,
    up: () => {
      const qCols = db.exec(`PRAGMA table_info(quotes)`);
      const qExisting = new Set(qCols[0].values.map((v) => v[1]));
      if (!qExisting.has('exchange_rate')) {
        db.run(`ALTER TABLE quotes ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1.0`);
      }

      const invCols = db.exec(`PRAGMA table_info(invoices)`);
      const invExisting = new Set(invCols[0].values.map((v) => v[1]));
      if (!invExisting.has('currency')) {
        db.run(`ALTER TABLE invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'`);
      }
      if (!invExisting.has('exchange_rate')) {
        db.run(`ALTER TABLE invoices ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1.0`);
      }
    },
  },
  {
    version: 15,
    up: () => {
      const cols = db.exec(`PRAGMA table_info(company_profile)`);
      const existing = new Set(cols[0].values.map((v) => v[1]));
      if (!existing.has('reporting_currency')) {
        db.run(`ALTER TABLE company_profile ADD COLUMN reporting_currency TEXT DEFAULT ''`);
      }
    },
  },
  {
    version: 16,
    up: () => {
      const cols = db.exec(`PRAGMA table_info(invoices)`);
      const existing = new Set(cols[0].values.map((v) => v[1]));
      if (!existing.has('invoice_type')) {
        db.run(`ALTER TABLE invoices ADD COLUMN invoice_type TEXT NOT NULL DEFAULT 'standard'`);
      }
      if (!existing.has('deposit_percent')) {
        db.run(`ALTER TABLE invoices ADD COLUMN deposit_percent REAL DEFAULT NULL`);
      }
      if (!existing.has('deposit_amount')) {
        db.run(`ALTER TABLE invoices ADD COLUMN deposit_amount REAL DEFAULT NULL`);
      }
      if (!existing.has('original_quote_total')) {
        db.run(`ALTER TABLE invoices ADD COLUMN original_quote_total REAL DEFAULT NULL`);
      }
      if (!existing.has('deposit_invoice_id')) {
        db.run(`ALTER TABLE invoices ADD COLUMN deposit_invoice_id INTEGER DEFAULT NULL`);
      }
      if (!existing.has('is_final_generated')) {
        db.run(`ALTER TABLE invoices ADD COLUMN is_final_generated INTEGER NOT NULL DEFAULT 0`);
      }
    },
  },
  {
    version: 17,
    up: () => {
      db.run(`
        CREATE TABLE IF NOT EXISTS credit_notes (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          credit_note_number TEXT NOT NULL UNIQUE,
          invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
          client_id       INTEGER NOT NULL REFERENCES clients(id),
          amount          REAL NOT NULL CHECK (amount > 0),
          reason          TEXT DEFAULT '',
          date_created    TEXT NOT NULL,
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 18,
    up: () => {
      const cols = db.exec(`PRAGMA table_info(company_profile)`);
      const existing = new Set(cols[0].values.map((v) => v[1]));
      if (!existing.has('credit_note_prefix')) {
        db.run(`ALTER TABLE company_profile ADD COLUMN credit_note_prefix TEXT NOT NULL DEFAULT 'CN-'`);
      }
      if (!existing.has('credit_note_start_number')) {
        db.run(`ALTER TABLE company_profile ADD COLUMN credit_note_start_number INTEGER NOT NULL DEFAULT 1`);
      }
    },
  },
  {
    version: 19,
    up: () => {
      db.run(`
        CREATE TABLE IF NOT EXISTS email_settings (
          id                      INTEGER PRIMARY KEY CHECK (id = 1),
          smtp_host               TEXT NOT NULL DEFAULT '',
          smtp_port               INTEGER NOT NULL DEFAULT 587,
          smtp_secure             INTEGER NOT NULL DEFAULT 0,
          smtp_username           TEXT NOT NULL DEFAULT '',
          smtp_password_encrypted TEXT DEFAULT '',
          sender_name             TEXT NOT NULL DEFAULT '',
          sender_email            TEXT NOT NULL DEFAULT '',
          created_at              TEXT NOT NULL,
          updated_at              TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 20,
    up: () => {
      db.run(`
        CREATE TABLE IF NOT EXISTS document_email_logs (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          document_type   TEXT NOT NULL CHECK (document_type IN ('quote', 'invoice')),
          document_id     INTEGER NOT NULL,
          recipient_to    TEXT NOT NULL,
          recipient_cc    TEXT DEFAULT '',
          subject         TEXT NOT NULL,
          message_id      TEXT DEFAULT '',
          sent_at         TEXT NOT NULL,
          status          TEXT NOT NULL DEFAULT 'sent'
        );
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_doc_email_logs ON document_email_logs(document_type, document_id, sent_at DESC);`);

      const quoteCols = new Set(db.exec(`PRAGMA table_info(quotes)`)[0].values.map((v) => v[1]));
      if (!quoteCols.has('last_sent_at')) {
        db.run(`ALTER TABLE quotes ADD COLUMN last_sent_at TEXT DEFAULT NULL`);
      }
      if (!quoteCols.has('last_sent_to')) {
        db.run(`ALTER TABLE quotes ADD COLUMN last_sent_to TEXT DEFAULT NULL`);
      }

      const invCols = new Set(db.exec(`PRAGMA table_info(invoices)`)[0].values.map((v) => v[1]));
      if (!invCols.has('last_sent_at')) {
        db.run(`ALTER TABLE invoices ADD COLUMN last_sent_at TEXT DEFAULT NULL`);
      }
      if (!invCols.has('last_sent_to')) {
        db.run(`ALTER TABLE invoices ADD COLUMN last_sent_to TEXT DEFAULT NULL`);
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
  if (!profile.reporting_currency) {
    profile.reporting_currency = profile.default_currency || 'USD';
  }
  return profile;
}

function saveCompanyProfile(profile) {
  const now = new Date().toISOString();
  const existing = getCompanyProfile();
  const defCurrency = profile.default_currency || (existing && existing.default_currency) || 'USD';
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
    default_currency: defCurrency,
    reporting_currency: profile.reporting_currency || (existing && existing.reporting_currency) || defCurrency,
    default_tax_rate: Number(profile.default_tax_rate || 0),
    invoice_prefix: profile.invoice_prefix || 'INV-',
    invoice_start_number: Number(profile.invoice_start_number || 1),
    quote_prefix: profile.quote_prefix || 'Q-',
    quote_start_number: Number(profile.quote_start_number || 1),
    default_terms: profile.default_terms || '',
    payment_details: profile.payment_details !== undefined ? profile.payment_details : (existing && existing.payment_details) || '',
    credit_note_prefix: profile.credit_note_prefix || 'CN-',
    credit_note_start_number: Number(profile.credit_note_start_number || 1),
  };

  if (existing) {
    db.run(
      `UPDATE company_profile SET
        business_name = ?, logo_path = ?, address_line1 = ?, address_line2 = ?,
        city = ?, state = ?, postal_code = ?, country = ?, phone = ?, email = ?,
        website = ?, tax_id = ?, default_currency = ?, reporting_currency = ?, default_tax_rate = ?,
        invoice_prefix = ?, invoice_start_number = ?, quote_prefix = ?,
        quote_start_number = ?, default_terms = ?, payment_details = ?,
        credit_note_prefix = ?, credit_note_start_number = ?, updated_at = ?
       WHERE id = 1`,
      [
        fields.business_name, fields.logo_path, fields.address_line1, fields.address_line2,
        fields.city, fields.state, fields.postal_code, fields.country, fields.phone, fields.email,
        fields.website, fields.tax_id, fields.default_currency, fields.reporting_currency, fields.default_tax_rate,
        fields.invoice_prefix, fields.invoice_start_number, fields.quote_prefix,
        fields.quote_start_number, fields.default_terms, fields.payment_details,
        fields.credit_note_prefix, fields.credit_note_start_number, now,
      ]
    );
  } else {
    db.run(
      `INSERT INTO company_profile (
        id, business_name, logo_path, address_line1, address_line2, city, state,
        postal_code, country, phone, email, website, tax_id, default_currency,
        reporting_currency, default_tax_rate, invoice_prefix, invoice_start_number, quote_prefix,
        quote_start_number, default_terms, payment_details,
        credit_note_prefix, credit_note_start_number, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        1, fields.business_name, fields.logo_path, fields.address_line1, fields.address_line2,
        fields.city, fields.state, fields.postal_code, fields.country, fields.phone, fields.email,
        fields.website, fields.tax_id, fields.default_currency, fields.reporting_currency, fields.default_tax_rate,
        fields.invoice_prefix, fields.invoice_start_number, fields.quote_prefix,
        fields.quote_start_number, fields.default_terms, fields.payment_details,
        fields.credit_note_prefix, fields.credit_note_start_number, now, now,
      ]
    );
  }

  saveToDisk();
  return getCompanyProfile();
}

// ---------- Email (SMTP) Settings ----------

function getEmailSettings() {
  const res = db.exec('SELECT * FROM email_settings WHERE id = 1');
  if (!res.length || res[0].values.length === 0) {
    return {
      smtp_host: 'smtp.gmail.com',
      smtp_port: 465,
      smtp_secure: 1,
      smtp_username: '',
      sender_name: '',
      sender_email: '',
      has_password: false,
      password_saved: false,
      storage_type: getStorageMechanismName(),
    };
  }

  const cols = res[0].columns;
  const row = res[0].values[0];
  const obj = {};
  cols.forEach((col, i) => { obj[col] = row[i]; });

  const hasPassword = Boolean(obj.smtp_password_encrypted && String(obj.smtp_password_encrypted).trim().length > 0);
  delete obj.smtp_password_encrypted;

  return {
    smtp_host: obj.smtp_host || '',
    smtp_port: Number(obj.smtp_port) || 587,
    smtp_secure: Number(obj.smtp_secure) || 0,
    smtp_username: obj.smtp_username || '',
    sender_name: obj.sender_name || '',
    sender_email: obj.sender_email || '',
    has_password: hasPassword,
    password_saved: hasPassword,
    storage_type: getStorageMechanismName(),
  };
}

function getEmailSettingsInternal() {
  const res = db.exec('SELECT * FROM email_settings WHERE id = 1');
  if (!res.length || res[0].values.length === 0) {
    return null;
  }
  const cols = res[0].columns;
  const row = res[0].values[0];
  const obj = {};
  cols.forEach((col, i) => { obj[col] = row[i]; });

  let decryptedPass = '';
  if (obj.smtp_password_encrypted) {
    decryptedPass = decryptSecret(obj.smtp_password_encrypted);
  }

  return {
    smtp_host: obj.smtp_host || '',
    smtp_port: Number(obj.smtp_port) || 587,
    smtp_secure: Number(obj.smtp_secure) || 0,
    smtp_username: obj.smtp_username || '',
    smtp_password: decryptedPass,
    sender_name: obj.sender_name || '',
    sender_email: obj.sender_email || '',
  };
}

function saveEmailSettings(settings) {
  const now = new Date().toISOString();
  const existingRes = db.exec('SELECT * FROM email_settings WHERE id = 1');
  let existingEncryptedPass = '';
  if (existingRes.length && existingRes[0].values.length > 0) {
    const cols = existingRes[0].columns;
    const passIdx = cols.indexOf('smtp_password_encrypted');
    if (passIdx !== -1) {
      existingEncryptedPass = existingRes[0].values[0][passIdx] || '';
    }
  }

  let finalEncryptedPass = existingEncryptedPass;
  if (settings.smtp_password !== undefined && settings.smtp_password !== null && settings.smtp_password !== '') {
    finalEncryptedPass = encryptSecret(settings.smtp_password);
  } else if (settings.clear_password) {
    finalEncryptedPass = '';
  }

  const host = String(settings.smtp_host || '').trim();
  const port = Number(settings.smtp_port) || 587;
  const secure = settings.smtp_secure ? 1 : 0;
  const username = String(settings.smtp_username || '').trim();
  const senderName = String(settings.sender_name || '').trim();
  const senderEmail = String(settings.sender_email || '').trim();

  if (existingRes.length && existingRes[0].values.length > 0) {
    db.run(
      `UPDATE email_settings SET
         smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_username = ?,
         smtp_password_encrypted = ?, sender_name = ?, sender_email = ?, updated_at = ?
       WHERE id = 1`,
      [host, port, secure, username, finalEncryptedPass, senderName, senderEmail, now]
    );
  } else {
    db.run(
      `INSERT INTO email_settings (
         id, smtp_host, smtp_port, smtp_secure, smtp_username,
         smtp_password_encrypted, sender_name, sender_email, created_at, updated_at
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [host, port, secure, username, finalEncryptedPass, senderName, senderEmail, now, now]
    );
  }

  saveToDisk();
  return { ok: true, settings: getEmailSettings() };
}

// ---------- Document Email Logging ----------

function logDocumentEmail({ document_type, document_id, recipient_to, recipient_cc, subject, message_id, sent_at }) {
  const now = sent_at || new Date().toISOString();
  db.run(
    `INSERT INTO document_email_logs (
       document_type, document_id, recipient_to, recipient_cc, subject, message_id, sent_at, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'sent')`,
    [
      document_type,
      Number(document_id),
      String(recipient_to || '').trim(),
      String(recipient_cc || '').trim(),
      String(subject || '').trim(),
      String(message_id || '').trim(),
      now,
    ]
  );

  if (document_type === 'quote') {
    db.run(
      `UPDATE quotes SET last_sent_at = ?, last_sent_to = ?, updated_at = ? WHERE id = ?`,
      [now, String(recipient_to || '').trim(), now, Number(document_id)]
    );
  } else if (document_type === 'invoice') {
    db.run(
      `UPDATE invoices SET last_sent_at = ?, last_sent_to = ?, updated_at = ? WHERE id = ?`,
      [now, String(recipient_to || '').trim(), now, Number(document_id)]
    );
  }

  saveToDisk();
  return { ok: true, logs: getDocumentEmailLogs(document_type, document_id) };
}

function getDocumentEmailLogs(document_type, document_id) {
  const res = db.exec(
    `SELECT * FROM document_email_logs WHERE document_type = ? AND document_id = ? ORDER BY sent_at DESC, id DESC`,
    [document_type, Number(document_id)]
  );
  return rowsToArray(res);
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
  obj.contacts = getClientContacts(id);
  return obj;
}

function normalizeTags(tags) {
  if (!tags) return '';
  if (Array.isArray(tags)) {
    return tags.map((t) => String(t).trim()).filter(Boolean).join(', ');
  }
  return String(tags)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .join(', ');
}

function addClient(client) {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO clients (
      name, email, phone, company_name, address_line1, address_line2, city,
      state, postal_code, country, notes, tags, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      normalizeTags(client.tags),
      now,
      now,
    ]
  );

  const idRes = db.exec('SELECT last_insert_rowid() AS id');
  const newId = idRes[0].values[0][0];

  if (Array.isArray(client.contacts) && client.contacts.length > 0) {
    saveClientContacts(newId, client.contacts);
  }

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
    normalizeTags(client.tags),
  ];
}

function updateClient(id, client) {
  const now = new Date().toISOString();
  const p = clientParams(client, now);
  db.run(
    `UPDATE clients SET
       name = ?, email = ?, phone = ?, company_name = ?, address_line1 = ?,
       address_line2 = ?, city = ?, state = ?, postal_code = ?, country = ?,
       notes = ?, tags = ?, updated_at = ?
     WHERE id = ?`,
    [...p, now, id]
  );

  // contacts array may be included; undefined means "leave them alone" (shouldn't happen
  // from the UI but guard anyway); null means "clear all"; array means "replace"
  if (client.contacts !== undefined) {
    saveClientContacts(id, client.contacts || []);
  }

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
  // client_contacts rows cascade-delete via FK ON DELETE CASCADE
  const changes = db.run(`DELETE FROM clients WHERE id = ?`, [id]);
  const deleted = db.getRowsModified() > 0;
  saveToDisk();
  return { ok: true, deleted };
}

// ---------- Client Contacts ----------

function getClientContacts(clientId) {
  const res = db.exec(
    `SELECT * FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC, id ASC`,
    [clientId]
  );
  return rowsToArray(res);
}

function getContactById(contactId) {
  const res = db.exec('SELECT * FROM client_contacts WHERE id = ?', [contactId]);
  return rowToObject(res);
}

// Replace all contacts for a client atomically.
// contacts: array of { name, role, email, phone, is_primary }
function saveClientContacts(clientId, contacts) {
  const now = new Date().toISOString();
  // Remove old contacts; ON DELETE CASCADE keeps this safe for line items / quotes
  db.run('DELETE FROM client_contacts WHERE client_id = ?', [clientId]);
  if (!contacts || contacts.length === 0) return;

  // Ensure at most one primary. If user marked multiple, keep only first.
  let primarySet = false;
  contacts.forEach((c, idx) => {
    let isPrimary = c.is_primary ? 1 : 0;
    if (isPrimary && !primarySet) {
      primarySet = true;
    } else if (isPrimary && primarySet) {
      isPrimary = 0;
    }
    db.run(
      `INSERT INTO client_contacts (client_id, name, role, email, phone, is_primary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        String(c.name || '').trim(),
        String(c.role || '').trim(),
        String(c.email || '').trim(),
        String(c.phone || '').trim(),
        isPrimary,
        now,
        now,
      ]
    );
  });
}

// ---------- Client Notes / Activity Log ----------

function getClientNotes(clientId) {
  const res = db.exec(
    `SELECT * FROM client_notes WHERE client_id = ? ORDER BY created_at DESC, id DESC`,
    [clientId]
  );
  return rowsToArray(res);
}

function getClientNote(id) {
  const res = db.exec('SELECT * FROM client_notes WHERE id = ?', [id]);
  return rowToObject(res);
}

function addClientNote(clientId, noteText) {
  const now = new Date().toISOString();
  const text = String(noteText || '').trim();
  if (!text) {
    return { ok: false, error: 'Note text cannot be empty.' };
  }

  db.run(
    `INSERT INTO client_notes (client_id, note, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [clientId, text, now, now]
  );

  const idRes = db.exec('SELECT last_insert_rowid() AS id');
  const newId = idRes[0].values[0][0];
  saveToDisk();
  return { ok: true, note: getClientNote(newId) };
}

function updateClientNote(id, noteText) {
  const now = new Date().toISOString();
  const text = String(noteText || '').trim();
  if (!text) {
    return { ok: false, error: 'Note text cannot be empty.' };
  }

  db.run(
    `UPDATE client_notes SET note = ?, updated_at = ? WHERE id = ?`,
    [text, now, id]
  );

  saveToDisk();
  return { ok: true, note: getClientNote(id) };
}

function deleteClientNote(id) {
  db.run(`DELETE FROM client_notes WHERE id = ?`, [id]);
  const deleted = db.getRowsModified() > 0;
  saveToDisk();
  return { ok: true, deleted };
}

// ---------- Client Overview (Aggregated Portal View) ----------

function getClientOverview(clientId) {
  const client = getClient(clientId);
  if (!client) return null;

  const quotesRes = db.exec(
    `SELECT * FROM quotes WHERE client_id = ? ORDER BY date_created DESC, id DESC`,
    [clientId]
  );
  const quotes = rowsToArray(quotesRes);

  const invoicesRes = db.exec(
    `SELECT * FROM invoices WHERE client_id = ? ORDER BY date_created DESC, id DESC`,
    [clientId]
  );
  const invoices = rowsToArray(invoicesRes).map((inv) => {
    refreshInvoiceBalance(inv);
    return inv;
  });

  const totalBilled = invoices.reduce((sum, inv) => sum + ((Number(inv.total) || 0) * (Number(inv.exchange_rate) || 1.0)), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (((Number(inv.amount_paid) || 0) - (Number(inv.amount_credited) || 0)) * (Number(inv.exchange_rate) || 1.0)), 0);
  const outstandingBalance = Math.max(0, Math.round(invoices.reduce((sum, inv) => sum + ((Number(inv.balance_due) || 0) * (Number(inv.exchange_rate) || 1.0)), 0) * 100) / 100);

  const notes = getClientNotes(clientId);
  const creditNotes = getCreditNotesForClient(clientId);

  // Group into linked project/document chains (Quote -> Deposit Invoice -> Final Invoice)
  const chains = [];
  const handledInvoiceIds = new Set();

  for (const q of quotes) {
    const linkedInvoices = invoices.filter((inv) => inv.quote_id === q.id);
    const depositInv = linkedInvoices.find((inv) => inv.invoice_type === 'deposit') || null;
    const finalInv = linkedInvoices.find((inv) => inv.invoice_type === 'final') ||
      (depositInv ? invoices.find((inv) => inv.deposit_invoice_id === depositInv.id) : null) || null;
    const standardInv = linkedInvoices.find((inv) => inv.invoice_type === 'standard' || (!inv.invoice_type && !inv.deposit_amount)) || null;

    if (depositInv || finalInv || standardInv) {
      if (depositInv) handledInvoiceIds.add(depositInv.id);
      if (finalInv) handledInvoiceIds.add(finalInv.id);
      if (standardInv) handledInvoiceIds.add(standardInv.id);

      const quoteTotal = Number(q.total) || 0;
      const depositPaid = depositInv ? Number(depositInv.amount_paid) : 0;
      const finalPaid = finalInv ? Number(finalInv.amount_paid) : (standardInv ? Number(standardInv.amount_paid) : 0);

      const totalPaidInChain = depositPaid + finalPaid;
      const totalOwedInChain = Math.max(0, Math.round((quoteTotal - totalPaidInChain) * 100) / 100);

      chains.push({
        id: `chain-q-${q.id}`,
        quote: q,
        chain_type: depositInv ? 'deposit_flow' : 'full_flow',
        deposit_invoice: depositInv,
        final_invoice: finalInv,
        standard_invoice: standardInv,
        quote_total: quoteTotal,
        deposit_percent: depositInv ? depositInv.deposit_percent : null,
        total_paid: Math.round(totalPaidInChain * 100) / 100,
        balance_remaining: totalOwedInChain,
        currency: q.currency || 'USD',
        is_complete: totalOwedInChain <= 0.0001 && (finalInv ? finalInv.amount_paid >= finalInv.total : (standardInv ? standardInv.amount_paid >= standardInv.total : false)),
      });
    }
  }

  // Also catch any orphan deposit/final invoices without quote
  for (const inv of invoices) {
    if (!handledInvoiceIds.has(inv.id) && (inv.invoice_type === 'deposit' || inv.invoice_type === 'final')) {
      const depInv = inv.invoice_type === 'deposit' ? inv : invoices.find((i) => i.id === inv.deposit_invoice_id);
      const finInv = inv.invoice_type === 'final' ? inv : invoices.find((i) => i.deposit_invoice_id === inv.id);
      if (depInv) handledInvoiceIds.add(depInv.id);
      if (finInv) handledInvoiceIds.add(finInv.id);

      const quoteTotal = Number(inv.original_quote_total) || ((depInv ? Number(depInv.total) : 0) + (finInv ? Number(finInv.total) : 0));
      const totalPaidInChain = (depInv ? Number(depInv.amount_paid) : 0) + (finInv ? Number(finInv.amount_paid) : 0);
      const totalOwedInChain = Math.max(0, Math.round((quoteTotal - totalPaidInChain) * 100) / 100);

      chains.push({
        id: `chain-inv-${inv.id}`,
        quote: null,
        chain_type: 'deposit_flow',
        deposit_invoice: depInv || null,
        final_invoice: finInv || null,
        standard_invoice: null,
        quote_total: quoteTotal,
        deposit_percent: depInv ? depInv.deposit_percent : null,
        total_paid: Math.round(totalPaidInChain * 100) / 100,
        balance_remaining: totalOwedInChain,
        currency: inv.currency || 'USD',
        is_complete: (depInv ? depInv.amount_paid >= depInv.total : true) && (finInv ? finInv.amount_paid >= finInv.total : false),
      });
    }
  }

  return {
    client,
    quotes,
    invoices,
    creditNotes,
    chains,
    stats: {
      totalBilled: Math.round(totalBilled * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      outstandingBalance,
      quoteCount: quotes.length,
      invoiceCount: invoices.length,
      chainCount: chains.length,
      creditNoteCount: creditNotes.length,
    },
    notes,
  };
}

function getLineItemTemplates() {
  const res = db.exec(`SELECT * FROM line_item_templates ORDER BY name COLLATE NOCASE ASC`);
  return rowsToArray(res);
}

function getLineItemTemplate(id) {
  const res = db.exec('SELECT * FROM line_item_templates WHERE id = ?', [id]);
  return rowToObject(res);
}

function addLineItemTemplate(item) {
  const now = new Date().toISOString();
  const name = String(item.name || '').trim();
  const description = String(item.description || '').trim();
  const unitPrice = Number(item.unit_price || 0);
  const taxRate = Number(item.tax_rate || 0);

  db.run(
    `INSERT INTO line_item_templates (name, description, unit_price, tax_rate, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, description, unitPrice, taxRate, now, now]
  );

  const idRes = db.exec('SELECT last_insert_rowid() AS id');
  const newId = idRes[0].values[0][0];
  saveToDisk();
  return getLineItemTemplate(newId);
}

function updateLineItemTemplate(id, item) {
  const now = new Date().toISOString();
  const name = String(item.name || '').trim();
  const description = String(item.description || '').trim();
  const unitPrice = Number(item.unit_price || 0);
  const taxRate = Number(item.tax_rate || 0);

  db.run(
    `UPDATE line_item_templates
     SET name = ?, description = ?, unit_price = ?, tax_rate = ?, updated_at = ?
     WHERE id = ?`,
    [name, description, unitPrice, taxRate, now, id]
  );
  saveToDisk();
  return getLineItemTemplate(id);
}

function deleteLineItemTemplate(id) {
  db.run(`DELETE FROM line_item_templates WHERE id = ?`, [id]);
  const deleted = db.getRowsModified() > 0;
  saveToDisk();
  return { ok: true, deleted };
}

// ---------- Expenses ----------

const EXPENSE_CATEGORIES = ['Software', 'Supplies', 'Travel', 'Other'];

function validateExpenseInput(input) {
  const errors = {};
  const amount = Number(input.amount);
  if (!(amount > 0)) {
    errors.amount = 'Expense amount must be greater than zero.';
  } else if (hasMoreThanTwoDecimals(input.amount)) {
    errors.amount = 'Expense amount may only have up to 2 decimal places.';
  }

  const date = (input.date || '').trim();
  if (!date || !isValidDateString(date)) {
    errors.date = 'A valid expense date (YYYY-MM-DD) is required.';
  }

  const category = (input.category || '').trim() || 'Other';
  const exchangeRate = Number(input.exchange_rate) > 0 ? Number(input.exchange_rate) : 1.0;
  const currency = (input.currency || '').trim() || 'USD';

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: {
      amount: Math.round(amount * 100) / 100,
      date,
      category,
      notes: (input.notes || '').trim(),
      currency,
      exchange_rate: exchangeRate,
    },
  };
}

function getExpense(id) {
  const res = db.exec('SELECT * FROM expenses WHERE id = ?', [id]);
  return rowToObject(res);
}

function createExpense(input) {
  const validation = validateExpenseInput(input);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const { amount, date, category, notes, currency, exchange_rate } = validation.data;
  const now = new Date().toISOString();

  try {
    db.run(
      `INSERT INTO expenses (amount, date, category, notes, currency, exchange_rate, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [amount, date, category, notes, currency, exchange_rate, now, now]
    );

    const idRes = db.exec('SELECT last_insert_rowid() AS id');
    const newId = idRes[0].values[0][0];
    saveToDisk();
    return { ok: true, expense: getExpense(newId) };
  } catch (err) {
    return { ok: false, errors: { general: `Failed to create expense: ${err.message}` } };
  }
}

function updateExpense(id, input) {
  const existing = getExpense(id);
  if (!existing) {
    return { ok: false, errors: { general: 'Expense not found.' } };
  }

  const validation = validateExpenseInput(input);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const { amount, date, category, notes, currency, exchange_rate } = validation.data;
  const now = new Date().toISOString();

  try {
    db.run(
      `UPDATE expenses
       SET amount = ?, date = ?, category = ?, notes = ?, currency = ?, exchange_rate = ?, updated_at = ?
       WHERE id = ?`,
      [amount, date, category, notes, currency, exchange_rate, now, id]
    );
    saveToDisk();
    return { ok: true, expense: getExpense(id) };
  } catch (err) {
    return { ok: false, errors: { general: `Failed to update expense: ${err.message}` } };
  }
}

function deleteExpense(id) {
  const existing = getExpense(id);
  if (!existing) {
    return { ok: false, errors: { general: 'Expense not found.' } };
  }

  try {
    db.run('DELETE FROM expenses WHERE id = ?', [id]);
    saveToDisk();
    return { ok: true, deleted: true };
  } catch (err) {
    return { ok: false, errors: { general: `Failed to delete expense: ${err.message}` } };
  }
}

function listExpenses(filter = {}) {
  const { startDate, endDate, category, search } = filter;
  const conditions = [];
  const params = [];

  if (startDate && startDate.trim()) {
    conditions.push('date >= ?');
    params.push(startDate.trim());
  }

  if (endDate && endDate.trim()) {
    conditions.push('date <= ?');
    params.push(endDate.trim());
  }

  if (category && category !== 'all') {
    conditions.push('category = ?');
    params.push(category.trim());
  }

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push('(category LIKE ? OR notes LIKE ?)');
    params.push(q, q);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM expenses ${whereClause} ORDER BY date DESC, id DESC`;
  return rowsToArray(db.exec(sql, params));
}

function getExpensesSummary(filter = {}) {
  const expenses = listExpenses(filter);
  const profile = getCompanyProfile();
  const baseCurrency = (profile && (profile.reporting_currency || profile.default_currency)) || 'USD';

  let totalExpenses = 0;
  const categoryMap = {};

  for (const exp of expenses) {
    const rate = Number(exp.exchange_rate) || 1.0;
    const baseAmount = Math.round((Number(exp.amount) || 0) * rate * 100) / 100;
    totalExpenses += baseAmount;

    const cat = (exp.category || 'Other').trim() || 'Other';
    if (!categoryMap[cat]) {
      categoryMap[cat] = { category: cat, totalAmount: 0, count: 0 };
    }
    categoryMap[cat].totalAmount += baseAmount;
    categoryMap[cat].count += 1;
  }

  totalExpenses = Math.round(totalExpenses * 100) / 100;

  const byCategory = Object.values(categoryMap).map((c) => {
    const rounded = Math.round(c.totalAmount * 100) / 100;
    const percentage = totalExpenses > 0 ? Math.round((rounded / totalExpenses) * 1000) / 10 : 0;
    return {
      category: c.category,
      totalAmount: rounded,
      count: c.count,
      percentage,
    };
  });

  byCategory.sort((a, b) => b.totalAmount - a.totalAmount);

  return {
    totalExpenses,
    count: expenses.length,
    baseCurrency,
    byCategory,
    expenses,
  };
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
    `SELECT id, description, quantity, unit_price, tax_rate, discount_type, discount_value, discount_amount, discount_percent, amount, sort_order
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
  const currency = data.currency || (profile && profile.default_currency) || 'USD';
  const exchangeRate = Number(data.exchange_rate) || 1.0;
  const quoteNumber = nextQuoteNumber();
  let createdQuoteId = null;

  db.run('BEGIN');
  try {
    const insertRes = db.run(
      `INSERT INTO quotes (
        quote_number, quote_number_root, version, is_latest, client_id, contact_id, status, date_created, valid_until,
        subtotal, discount_amount, discount_type, discount_value, tax_rate,
        tax_amount, total, currency, exchange_rate, notes, terms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quoteNumber,
        quoteNumber,
        1,
        1,
        data.client_id,
        data.contact_id || null,
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
        exchangeRate,
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
          tax_rate, discount_type, discount_value, discount_amount,
          discount_percent, amount, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createdQuoteId,
          String(item.description).trim(),
          Number(item.quantity),
          Number(item.unit_price),
          item.tax_rate !== undefined && item.tax_rate !== null && !isNaN(Number(item.tax_rate))
            ? Number(item.tax_rate)
            : (Number(data.tax_rate) || 0),
          item.discount_type || 'none',
          Number(item.discount_value) || 0,
          Number(item.discount_amount) || 0,
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

function getQuoteVersionHistory(quoteId) {
  const quote = rowToObject(db.exec('SELECT id, quote_number, quote_number_root, version, is_latest FROM quotes WHERE id = ?', [quoteId]));
  if (!quote) return [];
  const root = quote.quote_number_root || quote.quote_number;
  const res = db.exec(
    `SELECT id, quote_number, version, status, is_latest, date_created, total, updated_at
     FROM quotes WHERE quote_number_root = ? OR quote_number = ?
     ORDER BY version ASC, id ASC`,
    [root, root]
  );
  return rowsToArray(res);
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

  const now = new Date().toISOString();
  const profile = getCompanyProfile();
  const currency = data.currency || (profile && profile.default_currency) || 'USD';
  const exchangeRate = Number(data.exchange_rate) || 1.0;

  const dateCreatedVal = data.date_created === undefined || data.date_created === null
    ? existing.date_created
    : (String(data.date_created) || existing.date_created);
  const validUntilVal = data.valid_until === undefined || data.valid_until === null
    ? existing.valid_until
    : (String(data.valid_until) || null);

  // If already Sent/Accepted/Declined, editing creates a new version (Revision)
  if (existing.status !== 'draft') {
    const root = existing.quote_number_root || existing.quote_number;
    const vRes = db.exec(
      `SELECT COALESCE(MAX(version), 1) AS max_v FROM quotes WHERE quote_number_root = ? OR quote_number = ?`,
      [root, root]
    );
    const nextVersion = (vRes.length && vRes[0].values.length > 0 ? Number(vRes[0].values[0][0]) : 1) + 1;
    const newQuoteNumber = `${root} v${nextVersion}`;

    db.run('BEGIN');
    try {
      db.run(`UPDATE quotes SET is_latest = 0 WHERE quote_number_root = ? OR quote_number = ?`, [root, root]);

      const insertRes = db.run(
        `INSERT INTO quotes (
          quote_number, quote_number_root, version, is_latest, client_id, contact_id, status, date_created, valid_until,
          subtotal, discount_amount, discount_type, discount_value, tax_rate,
          tax_amount, total, currency, exchange_rate, notes, terms, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newQuoteNumber,
          root,
          nextVersion,
          1,
          data.client_id,
          data.contact_id !== undefined ? (data.contact_id || null) : existing.contact_id,
          'draft',
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
          exchangeRate,
          data.notes || '',
          data.terms || '',
          now,
          now,
        ]
      );
      const idRes = db.exec('SELECT last_insert_rowid() AS id');
      const createdRevisionId = idRes[0].values[0][0];

      lineItems.forEach((item, idx) => {
        db.run(
          `INSERT INTO quote_line_items (
            quote_id, description, quantity, unit_price,
            tax_rate, discount_type, discount_value, discount_amount,
            discount_percent, amount, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            createdRevisionId,
            String(item.description).trim(),
            Number(item.quantity),
            Number(item.unit_price),
            item.tax_rate !== undefined && item.tax_rate !== null && !isNaN(Number(item.tax_rate))
              ? Number(item.tax_rate)
              : (Number(data.tax_rate) || 0),
            item.discount_type || 'none',
            Number(item.discount_value) || 0,
            Number(item.discount_amount) || 0,
            0,
            Number(item.amount) || 0,
            idx,
          ]
        );
      });

      db.run('COMMIT');
      saveToDisk();
      return { ok: true, isRevision: true, quote: getQuote(createdRevisionId) };
    } catch (err) {
      db.run('ROLLBACK');
      return { ok: false, errors: { general: `Failed to create quote revision: ${err.message}` } };
    }
  }

  // Draft in-place update
  db.run('BEGIN');
  try {
    db.run(
      `UPDATE quotes SET
        client_id = ?, contact_id = ?, date_created = ?, valid_until = ?,
        subtotal = ?, discount_amount = ?, discount_type = ?,
        discount_value = ?, tax_rate = ?, tax_amount = ?, total = ?,
        currency = ?, exchange_rate = ?, notes = ?, terms = ?, updated_at = ?
       WHERE id = ?`,
      [
        data.client_id,
        data.contact_id !== undefined ? (data.contact_id || null) : existing.contact_id,
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
        exchangeRate,
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
          tax_rate, discount_type, discount_value, discount_amount,
          discount_percent, amount, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          String(item.description).trim(),
          Number(item.quantity),
          Number(item.unit_price),
          item.tax_rate !== undefined && item.tax_rate !== null && !isNaN(Number(item.tax_rate))
            ? Number(item.tax_rate)
            : (Number(data.tax_rate) || 0),
          item.discount_type || 'none',
          Number(item.discount_value) || 0,
          Number(item.discount_amount) || 0,
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
  quote.client = client ? { id: client.id, name: client.name, company_name: client.company_name, email: client.email, contacts: client.contacts } : null;
  quote.contact = quote.contact_id ? getContactById(quote.contact_id) : null;
  quote.version_history = getQuoteVersionHistory(id);
  quote.email_logs = getDocumentEmailLogs('quote', id);
  return quote;
}

function listQuotes(opts) {
  const includeRevisions = opts && opts.includeRevisions;
  const sql = includeRevisions
    ? `SELECT * FROM quotes ORDER BY created_at DESC, id DESC`
    : `SELECT * FROM quotes WHERE is_latest = 1 ORDER BY created_at DESC, id DESC`;
  const quotes = rowsToArray(db.exec(sql));
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
    `SELECT id, description, quantity, unit_price, tax_rate, discount_type, discount_value, discount_amount, discount_percent, amount, sort_order
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
  invoice.credit_notes = getCreditNotesForInvoice(id);
  refreshInvoiceBalance(invoice);
  const client = getClient(invoice.client_id);
  invoice.client = client ? { id: client.id, name: client.name, company_name: client.company_name, email: client.email, contacts: client.contacts } : null;
  invoice.contact = invoice.contact_id ? getContactById(invoice.contact_id) : null;
  invoice.recurring_profile = getRecurringProfileByInvoice(id);
  invoice.email_logs = getDocumentEmailLogs('invoice', id);

  if (invoice.quote_id) {
    const q = rowToObject(db.exec('SELECT id, quote_number, total, currency, status FROM quotes WHERE id = ?', [invoice.quote_id]));
    invoice.quote = q;
  }

  // Linked deposit / final invoice relations
  if (invoice.invoice_type === 'deposit') {
    const finalRes = db.exec('SELECT id, invoice_number, total, amount_paid, balance_due, status FROM invoices WHERE deposit_invoice_id = ?', [id]);
    if (finalRes.length && finalRes[0].values.length > 0) {
      const cols = finalRes[0].columns;
      const row = finalRes[0].values[0];
      const obj = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      invoice.final_invoice = obj;
    } else {
      invoice.final_invoice = null;
    }
  } else if (invoice.invoice_type === 'final' && invoice.deposit_invoice_id) {
    const depRes = db.exec('SELECT id, invoice_number, total, amount_paid, balance_due, status, date_created FROM invoices WHERE id = ?', [invoice.deposit_invoice_id]);
    if (depRes.length && depRes[0].values.length > 0) {
      const cols = depRes[0].columns;
      const row = depRes[0].values[0];
      const obj = {};
      cols.forEach((col, i) => { obj[col] = row[i]; });
      invoice.deposit_invoice = obj;
    } else {
      invoice.deposit_invoice = null;
    }
  }

  return invoice;
}

// Recompute amount_paid / balance_due from the payments ledger and reflect
// them on the invoice object (and optionally persist to the DB).
// balance_due = total - (paid - credited): an issued credit note raises the
// amount still owed (money was refunded), while gross amount_paid is never
// silently reduced so the paper trail stays intact.
function computeCreditedTotal(invoiceId) {
  const res = db.exec(
    `SELECT COALESCE(SUM(amount), 0) AS credited FROM credit_notes WHERE invoice_id = ?`,
    [invoiceId]
  );
  return Number(res[0].values[0][0]) || 0;
}

function computeInvoiceBalance(invoiceId) {
  const res = db.exec(
    `SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?`,
    [invoiceId]
  );
  const paid = Number(res[0].values[0][0]) || 0;
  const credited = computeCreditedTotal(invoiceId);
  const invoice = rowToObject(db.exec('SELECT total FROM invoices WHERE id = ?', [invoiceId]));
  const total = Number(invoice.total) || 0;
  const balance = Math.max(0, Math.round((total - paid + credited) * 100) / 100);
  return { total, paid: Math.round(paid * 100) / 100, credited: Math.round(credited * 100) / 100, balance };
}

function refreshInvoiceBalance(invoice) {
  if (invoice.id !== undefined) {
    const b = computeInvoiceBalance(invoice.id);
    invoice.amount_paid = b.paid;
    invoice.amount_credited = b.credited;
    invoice.balance_due = b.balance;
  } else {
    invoice.amount_paid = Number(invoice.amount_paid) || 0;
    invoice.amount_credited = Number(invoice.amount_credited) || 0;
  }
  return invoice;
}

function getInvoiceByQuote(quoteId) {
  const res = db.exec('SELECT id FROM invoices WHERE quote_id = ?', [quoteId]);
  if (!res.length || res[0].values.length === 0) return null;
  return getInvoice(res[0].values[0][0]);
}

// Convert an accepted quote into an invoice (Full or Deposit). Returns:
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

  const over = overrides || {};
  const conversionType = over.conversion_type || 'full'; // 'full' | 'deposit'

  const root = quote.quote_number_root || quote.quote_number;
  const existingRes = db.exec(
    `SELECT i.id FROM invoices i
     JOIN quotes q ON i.quote_id = q.id
     WHERE (q.quote_number_root = ? OR q.quote_number = ?) AND (i.invoice_type = 'standard' OR i.invoice_type = 'deposit')`,
    [root, root]
  );
  if (existingRes.length && existingRes[0].values.length > 0) {
    return { ok: true, alreadyConverted: true, invoice: getInvoice(existingRes[0].values[0][0]) };
  }

  const now = new Date().toISOString();
  const today = new Date();

  // Due date: from overrides, else parse payment terms, else default +14 days.
  let dueDate;
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

  if (conversionType === 'deposit') {
    const quoteTotal = Number(quote.total) || 0;
    if (quoteTotal <= 0) {
      return { ok: false, errors: { general: 'Quote total must be greater than zero for deposit invoices.' } };
    }

    const depositType = over.deposit_type || 'percent'; // 'percent' | 'fixed'
    const depositVal = Number(over.deposit_value);
    if (!(depositVal > 0)) {
      return { ok: false, errors: { deposit_value: 'Deposit value must be greater than zero.' } };
    }

    let depositAmount = 0;
    let depositPercent = 0;
    if (depositType === 'percent') {
      if (depositVal >= 100) {
        return { ok: false, errors: { deposit_value: 'Deposit percentage must be less than 100%.' } };
      }
      depositPercent = Math.round(depositVal * 100) / 100;
      depositAmount = Math.round((quoteTotal * (depositPercent / 100)) * 100) / 100;
    } else {
      if (depositVal >= quoteTotal) {
        return { ok: false, errors: { deposit_value: 'Deposit amount must be less than full quote total.' } };
      }
      depositAmount = Math.round(depositVal * 100) / 100;
      depositPercent = Math.round((depositAmount / quoteTotal) * 10000) / 100;
    }

    db.run('BEGIN');
    try {
      db.run(
        `INSERT INTO invoices (
          invoice_number, quote_id, client_id, contact_id, status, date_created, date_sent, date_due,
          subtotal, tax_amount, discount_amount, total, amount_paid, balance_due,
          currency, exchange_rate, notes, terms,
          invoice_type, deposit_percent, deposit_amount, original_quote_total, deposit_invoice_id, is_final_generated,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceNumber,
          quoteId,
          quote.client_id,
          quote.contact_id || null,
          status,
          toDateString(today),
          status === 'sent' ? now : null,
          dueDate,
          depositAmount,
          0,
          0,
          depositAmount,
          0,
          depositAmount,
          quote.currency || 'USD',
          Number(quote.exchange_rate) || 1.0,
          over.notes !== undefined ? over.notes : (quote.notes || ''),
          over.terms !== undefined ? over.terms : (quote.terms || ''),
          'deposit',
          depositPercent,
          depositAmount,
          quoteTotal,
          null,
          0,
          now,
          now,
        ]
      );
      const idRes = db.exec('SELECT last_insert_rowid() AS id');
      invoiceId = idRes[0].values[0][0];

      const desc = `Deposit / Retainer (${depositPercent}% of Quote ${quote.quote_number}) — Full Quote Reference: ${quote.currency || 'USD'} ${quoteTotal.toFixed(2)}`;
      db.run(
        `INSERT INTO invoice_line_items (
          invoice_id, description, quantity, unit_price,
          tax_rate, discount_type, discount_value, discount_amount,
          discount_percent, amount, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          desc,
          1,
          depositAmount,
          0,
          'none',
          0,
          0,
          0,
          depositAmount,
          0,
        ]
      );

      db.run('COMMIT');
    } catch (err) {
      db.run('ROLLBACK');
      return { ok: false, errors: { general: `Failed to create deposit invoice: ${err.message}` } };
    }

    saveToDisk();
    return { ok: true, alreadyConverted: false, invoice: getInvoice(invoiceId) };
  }

  // Full invoice conversion
  db.run('BEGIN');
  try {
    db.run(
      `INSERT INTO invoices (
        invoice_number, quote_id, client_id, contact_id, status, date_created, date_sent, date_due,
        subtotal, tax_amount, discount_amount, total, amount_paid, balance_due,
        currency, exchange_rate, notes, terms,
        invoice_type, deposit_percent, deposit_amount, original_quote_total, deposit_invoice_id, is_final_generated,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        quoteId,
        quote.client_id,
        quote.contact_id || null,
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
        quote.currency || 'USD',
        Number(quote.exchange_rate) || 1.0,
        over.notes !== undefined ? over.notes : '',
        over.terms !== undefined ? over.terms : (quote.terms || ''),
        'standard',
        null,
        null,
        Number(quote.total) || 0,
        null,
        0,
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
          tax_rate, discount_type, discount_value, discount_amount,
          discount_percent, amount, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          item.description,
          Number(item.quantity),
          Number(item.unit_price),
          Number(item.tax_rate) || 0,
          item.discount_type || 'none',
          Number(item.discount_value) || 0,
          Number(item.discount_amount) || 0,
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

function createFinalInvoiceFromDeposit(depositInvoiceId, overrides) {
  const depositInv = getInvoice(depositInvoiceId);
  if (!depositInv) {
    return { ok: false, errors: { general: 'Deposit invoice not found.' } };
  }
  if (depositInv.invoice_type !== 'deposit') {
    return { ok: false, errors: { general: 'The selected invoice is not a deposit invoice.' } };
  }

  const b = computeInvoiceBalance(depositInvoiceId);
  if (b.balance > 0.0001) {
    return { ok: false, errors: { general: `Deposit invoice must be fully paid before generating the final invoice (remaining deposit balance: ${b.balance.toFixed(2)}).` } };
  }

  const existingFinalRes = db.exec('SELECT id FROM invoices WHERE deposit_invoice_id = ?', [depositInvoiceId]);
  if (existingFinalRes.length && existingFinalRes[0].values.length > 0) {
    return { ok: true, alreadyGenerated: true, invoice: getInvoice(existingFinalRes[0].values[0][0]) };
  }

  const quote = depositInv.quote_id ? getQuote(depositInv.quote_id) : null;
  if (!quote) {
    return { ok: false, errors: { general: 'Original quote for this deposit was not found.' } };
  }

  const now = new Date().toISOString();
  const today = new Date();
  const over = overrides || {};

  let dueDate;
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
  const invoiceNumber = nextInvoiceNumber();
  const quoteTotal = Number(depositInv.original_quote_total) || Number(quote.total) || 0;
  const depositPaid = Number(depositInv.total) || 0;
  const finalBalance = Math.max(0, Math.round((quoteTotal - depositPaid) * 100) / 100);

  let finalInvoiceId = null;
  db.run('BEGIN');
  try {
    db.run(
      `INSERT INTO invoices (
        invoice_number, quote_id, client_id, contact_id, status, date_created, date_sent, date_due,
        subtotal, tax_amount, discount_amount, total, amount_paid, balance_due,
        currency, exchange_rate, notes, terms,
        invoice_type, deposit_percent, deposit_amount, original_quote_total, deposit_invoice_id, is_final_generated,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        quote.id,
        quote.client_id,
        quote.contact_id || null,
        status,
        toDateString(today),
        status === 'sent' ? now : null,
        dueDate,
        quote.subtotal,
        quote.tax_amount,
        quote.discount_amount,
        finalBalance,
        0,
        finalBalance,
        quote.currency || depositInv.currency || 'USD',
        Number(quote.exchange_rate) || Number(depositInv.exchange_rate) || 1.0,
        over.notes !== undefined ? over.notes : (quote.notes || ''),
        over.terms !== undefined ? over.terms : (quote.terms || ''),
        'final',
        depositInv.deposit_percent,
        depositPaid,
        quoteTotal,
        depositInvoiceId,
        0,
        now,
        now,
      ]
    );

    const idRes = db.exec('SELECT last_insert_rowid() AS id');
    finalInvoiceId = idRes[0].values[0][0];

    // Insert original line items from the quote
    let sortIdx = 0;
    (quote.line_items || []).forEach((item) => {
      db.run(
        `INSERT INTO invoice_line_items (
          invoice_id, description, quantity, unit_price,
          tax_rate, discount_type, discount_value, discount_amount,
          discount_percent, amount, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          finalInvoiceId,
          item.description,
          Number(item.quantity),
          Number(item.unit_price),
          Number(item.tax_rate) || 0,
          item.discount_type || 'none',
          Number(item.discount_value) || 0,
          Number(item.discount_amount) || 0,
          Number(item.discount_percent) || 0,
          Number(item.amount) || 0,
          sortIdx++,
        ]
      );
    });

    // Add deduction line item for deposit previously paid
    const deductionDesc = `Less: Deposit Paid (Invoice ${depositInv.invoice_number})`;
    db.run(
      `INSERT INTO invoice_line_items (
        invoice_id, description, quantity, unit_price,
        tax_rate, discount_type, discount_value, discount_amount,
        discount_percent, amount, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalInvoiceId,
        deductionDesc,
        1,
        -depositPaid,
        0,
        'none',
        0,
        0,
        0,
        -depositPaid,
        sortIdx++,
      ]
    );

    // Mark is_final_generated on the deposit invoice
    db.run(`UPDATE invoices SET is_final_generated = 1, updated_at = ? WHERE id = ?`, [now, depositInvoiceId]);

    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    return { ok: false, errors: { general: `Failed to create final invoice: ${err.message}` } };
  }

  saveToDisk();
  return { ok: true, alreadyGenerated: false, invoice: getInvoice(finalInvoiceId) };
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

// Return payments reconciliation report filtered by date range and payment method.
// Reads strictly from the existing payments table joined with invoices and clients.
function getPaymentsReport(filter = {}) {
  const { startDate, endDate, paymentMethod, search } = filter;
  const conditions = [];
  const params = [];

  if (startDate && startDate.trim()) {
    conditions.push('p.payment_date >= ?');
    params.push(startDate.trim());
  }

  if (endDate && endDate.trim()) {
    conditions.push('p.payment_date <= ?');
    params.push(endDate.trim());
  }

  if (paymentMethod && paymentMethod !== 'all') {
    if (paymentMethod === 'Unspecified') {
      conditions.push("(p.payment_method IS NULL OR TRIM(p.payment_method) = '')");
    } else {
      conditions.push('p.payment_method = ?');
      params.push(paymentMethod);
    }
  }

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push(
      '(i.invoice_number LIKE ? OR c.name LIKE ? OR c.company_name LIKE ? OR p.reference_number LIKE ? OR p.notes LIKE ?)'
    );
    params.push(q, q, q, q, q);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      p.id,
      p.invoice_id,
      p.amount,
      p.payment_date,
      p.payment_method,
      p.reference_number,
      p.notes,
      p.created_at,
      i.invoice_number,
      i.currency,
      COALESCE(i.exchange_rate, 1.0) AS exchange_rate,
      c.id AS client_id,
      c.name AS client_name,
      c.company_name AS client_company
    FROM payments p
    JOIN invoices i ON p.invoice_id = i.id
    LEFT JOIN clients c ON i.client_id = c.id
    ${whereClause}
    ORDER BY p.payment_date DESC, p.id DESC
  `;

  const payments = rowsToArray(db.exec(sql, params));

  let totalReceived = 0;
  const methodMap = {};
  const currencyMap = {};

  for (const item of payments) {
    const rate = Number(item.exchange_rate) || 1.0;
    const baseAmount = Math.round((Number(item.amount) || 0) * rate * 100) / 100;
    totalReceived += baseAmount;

    const rawMethod = (item.payment_method || '').trim();
    const methodKey = rawMethod ? rawMethod : 'Unspecified';
    if (!methodMap[methodKey]) {
      methodMap[methodKey] = {
        method: methodKey,
        totalAmount: 0,
        count: 0,
      };
    }
    methodMap[methodKey].totalAmount += baseAmount;
    methodMap[methodKey].count += 1;

    const curr = item.currency || 'USD';
    if (!currencyMap[curr]) {
      currencyMap[curr] = { currency: curr, totalAmount: 0, count: 0 };
    }
    currencyMap[curr].totalAmount += Number(item.amount) || 0;
    currencyMap[curr].count += 1;
  }

  totalReceived = Math.round(totalReceived * 100) / 100;

  const allKnownMethods = ['Bank Transfer', 'Cash', 'Card', 'Other'];
  let distinctMethodsRes = [];
  try {
    distinctMethodsRes = rowsToArray(
      db.exec(`SELECT DISTINCT payment_method FROM payments WHERE payment_method IS NOT NULL AND TRIM(payment_method) != '' ORDER BY payment_method ASC`)
    ).map((r) => r.payment_method);
  } catch (_) {}

  const availableMethods = Array.from(new Set([...allKnownMethods, ...distinctMethodsRes]));

  const byMethod = Object.values(methodMap).map((m) => {
    const rounded = Math.round(m.totalAmount * 100) / 100;
    const percentage = totalReceived > 0 ? Math.round((rounded / totalReceived) * 1000) / 10 : 0;
    return {
      method: m.method,
      totalAmount: rounded,
      count: m.count,
      percentage,
    };
  });

  byMethod.sort((a, b) => b.totalAmount - a.totalAmount);

  const byCurrency = Object.values(currencyMap).map((c) => ({
    currency: c.currency,
    totalAmount: Math.round(c.totalAmount * 100) / 100,
    count: c.count,
  }));

  const companyProfile = getCompanyProfile();
  const baseCurrency = (companyProfile && companyProfile.base_currency) || 'USD';

  return {
    totalReceived,
    count: payments.length,
    baseCurrency,
    byMethod,
    byCurrency,
    availableMethods,
    payments,
  };
}

// Return Profit & Loss report comparing income (Cash vs Accrual) and expenses by month
// with running cumulative profit for a selected date range.
function getProfitLossReport(filter = {}) {
  const { startDate, endDate, basis = 'cash' } = filter;
  const activeBasis = basis === 'accrual' ? 'accrual' : 'cash';

  const profile = getCompanyProfile();
  const baseCurrency = (profile && (profile.reporting_currency || profile.default_currency)) || 'USD';

  // Date filters
  const invConds = [];
  const invParams = [];
  const cnConds = [];
  const cnParams = [];
  const payConds = [];
  const payParams = [];
  const expConds = [];
  const expParams = [];

  let startMonth = startDate ? startDate.trim().slice(0, 7) : null;
  let endMonth = endDate ? endDate.trim().slice(0, 7) : null;

  if (startDate && startDate.trim()) {
    const s = startDate.trim();
    invConds.push('date_created >= ?');
    invParams.push(s);
    cnConds.push('cn.date_created >= ?');
    cnParams.push(s);
    payConds.push('p.payment_date >= ?');
    payParams.push(s);
    expConds.push('date >= ?');
    expParams.push(s);
  }

  if (endDate && endDate.trim()) {
    const e = endDate.trim();
    invConds.push('date_created <= ?');
    invParams.push(e);
    cnConds.push('cn.date_created <= ?');
    cnParams.push(e);
    payConds.push('p.payment_date <= ?');
    payParams.push(e);
    expConds.push('date <= ?');
    expParams.push(e);
  }

  // If month bounds not explicitly given, discover earliest and latest months
  if (!startMonth || !endMonth) {
    const minInvRes = db.exec(`SELECT MIN(strftime('%Y-%m', date_created)) FROM invoices`);
    const minPayRes = db.exec(`SELECT MIN(strftime('%Y-%m', payment_date)) FROM payments`);
    const minExpRes = db.exec(`SELECT MIN(strftime('%Y-%m', date)) FROM expenses`);

    const maxInvRes = db.exec(`SELECT MAX(strftime('%Y-%m', date_created)) FROM invoices`);
    const maxPayRes = db.exec(`SELECT MAX(strftime('%Y-%m', payment_date)) FROM payments`);
    const maxExpRes = db.exec(`SELECT MAX(strftime('%Y-%m', date)) FROM expenses`);

    const allMins = [
      minInvRes[0]?.values[0]?.[0],
      minPayRes[0]?.values[0]?.[0],
      minExpRes[0]?.values[0]?.[0],
    ].filter(Boolean);

    const allMaxs = [
      maxInvRes[0]?.values[0]?.[0],
      maxPayRes[0]?.values[0]?.[0],
      maxExpRes[0]?.values[0]?.[0],
    ].filter(Boolean);

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const startOfYear = `${now.getFullYear()}-01`;

    if (!startMonth) {
      if (allMins.length) {
        allMins.sort();
        startMonth = allMins[0] < startOfYear ? allMins[0] : startOfYear;
      } else {
        startMonth = startOfYear;
      }
    }

    if (!endMonth) {
      if (allMaxs.length) {
        allMaxs.sort();
        const latestRecorded = allMaxs[allMaxs.length - 1];
        endMonth = latestRecorded > currentMonth ? latestRecorded : currentMonth;
      } else {
        endMonth = currentMonth;
      }
    }
  }

  // Ensure chronological order for bounds
  if (startMonth > endMonth) {
    const temp = startMonth;
    startMonth = endMonth;
    endMonth = temp;
  }

  // Build array of all months in sequence
  const monthsList = [];
  const [sYear, sMo] = startMonth.split('-').map(Number);
  const [eYear, eMo] = endMonth.split('-').map(Number);

  let curY = sYear;
  let curM = sMo;
  while (curY < eYear || (curY === eYear && curM <= eMo)) {
    monthsList.push(`${curY}-${String(curM).padStart(2, '0')}`);
    curM++;
    if (curM > 12) {
      curM = 1;
      curY++;
    }
  }

  // 1. Invoices grouped by month
  const invWhere = invConds.length ? `WHERE ${invConds.join(' AND ')}` : '';
  const invSql = `
    SELECT 
      strftime('%Y-%m', date_created) AS m,
      COUNT(*) AS count,
      COALESCE(SUM(total * COALESCE(exchange_rate, 1.0)), 0) AS total_invoiced
    FROM invoices
    ${invWhere}
    GROUP BY m
  `;
  const invRows = rowsToArray(db.exec(invSql, invParams));
  const invMap = {};
  for (const r of invRows) {
    invMap[r.m] = {
      count: Number(r.count) || 0,
      total: Math.round((Number(r.total_invoiced) || 0) * 100) / 100,
    };
  }

  // 2. Credit notes grouped by month
  const cnWhere = cnConds.length ? `WHERE ${cnConds.join(' AND ')}` : '';
  const cnSql = `
    SELECT 
      strftime('%Y-%m', cn.date_created) AS m,
      COUNT(*) AS count,
      COALESCE(SUM(cn.amount * COALESCE(i.exchange_rate, 1.0)), 0) AS total_credited
    FROM credit_notes cn
    JOIN invoices i ON cn.invoice_id = i.id
    ${cnWhere}
    GROUP BY m
  `;
  const cnRows = rowsToArray(db.exec(cnSql, cnParams));
  const cnMap = {};
  for (const r of cnRows) {
    cnMap[r.m] = {
      count: Number(r.count) || 0,
      total: Math.round((Number(r.total_credited) || 0) * 100) / 100,
    };
  }

  // 3. Payments grouped by month
  const payWhere = payConds.length ? `WHERE ${payConds.join(' AND ')}` : '';
  const paySql = `
    SELECT 
      strftime('%Y-%m', p.payment_date) AS m,
      COUNT(*) AS count,
      COALESCE(SUM(p.amount * COALESCE(i.exchange_rate, 1.0)), 0) AS total_paid
    FROM payments p
    JOIN invoices i ON p.invoice_id = i.id
    ${payWhere}
    GROUP BY m
  `;
  const payRows = rowsToArray(db.exec(paySql, payParams));
  const payMap = {};
  for (const r of payRows) {
    payMap[r.m] = {
      count: Number(r.count) || 0,
      total: Math.round((Number(r.total_paid) || 0) * 100) / 100,
    };
  }

  // 4. Expenses grouped by month
  const expWhere = expConds.length ? `WHERE ${expConds.join(' AND ')}` : '';
  const expSql = `
    SELECT 
      strftime('%Y-%m', date) AS m,
      COUNT(*) AS count,
      COALESCE(SUM(amount * COALESCE(exchange_rate, 1.0)), 0) AS total_expenses
    FROM expenses
    ${expWhere}
    GROUP BY m
  `;
  const expRows = rowsToArray(db.exec(expSql, expParams));
  const expMap = {};
  for (const r of expRows) {
    expMap[r.m] = {
      count: Number(r.count) || 0,
      total: Math.round((Number(r.total_expenses) || 0) * 100) / 100,
    };
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fullMonthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  let runningProfitCash = 0;
  let runningProfitAccrual = 0;

  let totalInvoicedPeriod = 0;
  let totalPaidPeriod = 0;
  let totalExpensesPeriod = 0;

  const monthsData = [];

  for (const m of monthsList) {
    const [yr, mo] = m.split('-').map(Number);
    const monthLabel = `${monthNames[mo - 1]} ${yr}`;
    const fullMonthLabel = `${fullMonthNames[mo - 1]} ${yr}`;

    const grossInvoiced = invMap[m]?.total || 0;
    const credited = cnMap[m]?.total || 0;
    const netInvoiced = Math.max(0, Math.round((grossInvoiced - credited) * 100) / 100);
    const invoicesCount = invMap[m]?.count || 0;

    const grossPaid = payMap[m]?.total || 0;
    const netPaid = Math.max(0, Math.round((grossPaid - credited) * 100) / 100);
    const paymentsCount = payMap[m]?.count || 0;

    const expenses = expMap[m]?.total || 0;
    const expensesCount = expMap[m]?.count || 0;

    const cashProfit = Math.round((netPaid - expenses) * 100) / 100;
    const accrualProfit = Math.round((netInvoiced - expenses) * 100) / 100;

    runningProfitCash = Math.round((runningProfitCash + cashProfit) * 100) / 100;
    runningProfitAccrual = Math.round((runningProfitAccrual + accrualProfit) * 100) / 100;

    totalInvoicedPeriod += netInvoiced;
    totalPaidPeriod += netPaid;
    totalExpensesPeriod += expenses;

    const activeIncome = activeBasis === 'accrual' ? netInvoiced : netPaid;
    const activeProfit = activeBasis === 'accrual' ? accrualProfit : cashProfit;
    const activeRunningProfit = activeBasis === 'accrual' ? runningProfitAccrual : runningProfitCash;
    const activeMargin = activeIncome > 0
      ? Math.round((activeProfit / activeIncome) * 1000) / 10
      : (activeProfit < 0 ? -100 : 0);

    monthsData.push({
      month: m,
      monthLabel,
      fullMonthLabel,
      invoiced: netInvoiced,
      invoicesCount,
      paid: netPaid,
      paymentsCount,
      expenses,
      expensesCount,
      cashProfit,
      accrualProfit,
      runningProfitCash,
      runningProfitAccrual,
      activeIncome,
      activeProfit,
      activeRunningProfit,
      margin: activeMargin,
    });
  }

  totalInvoicedPeriod = Math.round(totalInvoicedPeriod * 100) / 100;
  totalPaidPeriod = Math.round(totalPaidPeriod * 100) / 100;
  totalExpensesPeriod = Math.round(totalExpensesPeriod * 100) / 100;

  const totalIncome = activeBasis === 'accrual' ? totalInvoicedPeriod : totalPaidPeriod;
  const netProfit = Math.round((totalIncome - totalExpensesPeriod) * 100) / 100;
  const netProfitCash = Math.round((totalPaidPeriod - totalExpensesPeriod) * 100) / 100;
  const netProfitAccrual = Math.round((totalInvoicedPeriod - totalExpensesPeriod) * 100) / 100;

  const profitMargin = totalIncome > 0
    ? Math.round((netProfit / totalIncome) * 1000) / 10
    : (netProfit < 0 ? -100 : 0);

  const variance = Math.round((totalInvoicedPeriod - totalPaidPeriod) * 100) / 100;

  return {
    basis: activeBasis,
    startDate: startMonth,
    endDate: endMonth,
    baseCurrency,
    totalInvoiced: totalInvoicedPeriod,
    totalPaid: totalPaidPeriod,
    totalExpenses: totalExpensesPeriod,
    totalIncome,
    netProfit,
    netProfitCash,
    netProfitAccrual,
    profitMargin,
    variance,
    months: monthsData,
  };
}

// ---------- Credit Notes ----------

function getCreditNotePrefix() {
  const profile = getCompanyProfile();
  return (profile && profile.credit_note_prefix) || 'CN-';
}

function getCreditNoteStartNumber() {
  const profile = getCompanyProfile();
  return (profile && Number(profile.credit_note_start_number)) || 1;
}

function nextCreditNoteNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const prefix = getCreditNotePrefix();
  const startNumber = getCreditNoteStartNumber();

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
    const creditNoteNumber = `${prefix}${year}-${padNumber(next)}`;
    db.run(
      `UPDATE sequence_counters SET last_number = ? WHERE prefix = ? AND year = ?`,
      [next, prefix, year]
    );
    db.run('COMMIT');
    return creditNoteNumber;
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

function issueCreditNote(invoiceId, input) {
  const invoice = rowToObject(db.exec('SELECT * FROM invoices WHERE id = ?', [invoiceId]));
  if (!invoice) {
    return { ok: false, errors: { general: 'Invoice not found.' } };
  }

  const amount = Number(input.amount);
  if (!(amount > 0)) {
    return { ok: false, errors: { amount: 'Credit note amount must be greater than zero.' } };
  }

  const balance = computeInvoiceBalance(invoiceId);
  const maxCreditable = Math.max(0, Math.round((balance.paid - balance.credited) * 100) / 100);
  if (amount > maxCreditable + 0.0001) {
    return {
      ok: false,
      errors: { amount: `Credit note amount ${amount.toFixed(2)} exceeds the remaining creditable amount (${maxCreditable.toFixed(2)}).` },
    };
  }

  const reason = (input.reason || '').trim();
  const now = new Date().toISOString();
  const dateCreated = toDateString(new Date());
  const creditNoteNumber = nextCreditNoteNumber();

  db.run('BEGIN');
  try {
    db.run(
      `INSERT INTO credit_notes (credit_note_number, invoice_id, client_id, amount, reason, date_created, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [creditNoteNumber, invoiceId, invoice.client_id, Math.round(amount * 100) / 100, reason, dateCreated, now, now]
    );

    const b = computeInvoiceBalance(invoiceId);
    const netPaid = Math.max(0, Math.round((b.paid - b.credited) * 100) / 100);
    let newStatus;
    if (b.balance <= 0.0001) {
      newStatus = 'paid';
    } else if (netPaid > 0.0001) {
      newStatus = 'partially_paid';
    } else {
      newStatus = invoice.date_sent ? 'sent' : (invoice.status === 'draft' ? 'draft' : 'sent');
    }
    db.run(
      `UPDATE invoices SET amount_paid = ?, balance_due = ?, status = ?, updated_at = ? WHERE id = ?`,
      [b.paid, b.balance, newStatus, now, invoiceId]
    );

    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    return { ok: false, errors: { general: `Failed to issue credit note: ${err.message}` } };
  }

  saveToDisk();

  const creditNote = rowToObject(
    db.exec('SELECT * FROM credit_notes WHERE credit_note_number = ?', [creditNoteNumber])
  );
  return { ok: true, credit_note: creditNote, invoice: getInvoice(invoiceId) };
}

function getCreditNotesForInvoice(invoiceId) {
  const res = db.exec(
    `SELECT * FROM credit_notes WHERE invoice_id = ? ORDER BY date_created DESC, id DESC`,
    [invoiceId]
  );
  return rowsToArray(res);
}

function getCreditNotesForClient(clientId) {
  const res = db.exec(
    `SELECT cn.*, i.invoice_number
       FROM credit_notes cn
       JOIN invoices i ON i.id = cn.invoice_id
       WHERE cn.client_id = ?
       ORDER BY cn.date_created DESC, cn.id DESC`,
    [clientId]
  );
  return rowsToArray(res);
}

function getCreditNote(id) {
  const cn = rowToObject(db.exec('SELECT * FROM credit_notes WHERE id = ?', [id]));
  if (!cn) return null;
  const inv = rowToObject(
    db.exec('SELECT id, invoice_number, total, amount_paid, balance_due, currency, client_id FROM invoices WHERE id = ?', [cn.invoice_id])
  );
  cn.invoice = inv;
  const client = inv ? getClient(inv.client_id) : null;
  cn.client = client ? { id: client.id, name: client.name, company_name: client.company_name } : null;
  return cn;
}

// ---------- Recurring Invoices ----------

function advanceRecurringDate(dateStr, frequency) {
  if (!dateStr || typeof dateStr !== 'string') return toDateString(new Date());
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (frequency === 'monthly') {
    date.setMonth(date.getMonth() + 1);
  } else if (frequency === 'yearly') {
    date.setFullYear(date.getFullYear() + 1);
  }
  return toDateString(date);
}

function getRecurringProfile(profileId) {
  const res = db.exec('SELECT * FROM recurring_profiles WHERE id = ?', [profileId]);
  const profile = rowToObject(res);
  if (!profile) return null;
  const invRes = db.exec(
    `SELECT id, invoice_number, date_created, date_due, total, amount_paid, balance_due, status
     FROM invoices
     WHERE recurring_profile_id = ? OR id = ?
     ORDER BY date_created ASC, id ASC`,
    [profileId, profile.source_invoice_id]
  );
  profile.series_invoices = rowsToArray(invRes);
  return profile;
}

function getRecurringProfileByInvoice(invoiceId) {
  const inv = rowToObject(db.exec('SELECT id, recurring_profile_id FROM invoices WHERE id = ?', [invoiceId]));
  if (!inv) return null;
  let profileId = inv.recurring_profile_id;
  if (!profileId) {
    const pRes = db.exec('SELECT id FROM recurring_profiles WHERE source_invoice_id = ?', [invoiceId]);
    if (pRes.length && pRes[0].values.length > 0) {
      profileId = pRes[0].values[0][0];
    }
  }
  if (!profileId) return null;
  return getRecurringProfile(profileId);
}

function setRecurringProfile(invoiceId, data) {
  const invoice = getInvoice(invoiceId);
  if (!invoice) return { ok: false, errors: { general: 'Invoice not found.' } };

  const freq = ['weekly', 'monthly', 'yearly'].includes(data.frequency) ? data.frequency : 'monthly';
  const nextDate = data.next_issue_date && isValidDateString(data.next_issue_date)
    ? data.next_issue_date
    : advanceRecurringDate(invoice.date_created || toDateString(new Date()), freq);
  const endDate = data.end_date && isValidDateString(data.end_date) ? data.end_date : null;
  const now = new Date().toISOString();

  let existing = getRecurringProfileByInvoice(invoiceId);
  let profileId = null;

  db.run('BEGIN');
  try {
    if (existing) {
      profileId = existing.id;
      db.run(
        `UPDATE recurring_profiles SET
           frequency = ?, status = 'active', next_issue_date = ?, end_date = ?, updated_at = ?
         WHERE id = ?`,
        [freq, nextDate, endDate, now, profileId]
      );
    } else {
      db.run(
        `INSERT INTO recurring_profiles (
           source_invoice_id, frequency, status, next_issue_date, end_date, created_at, updated_at
         ) VALUES (?, ?, 'active', ?, ?, ?, ?)`,
        [invoiceId, freq, nextDate, endDate, now, now]
      );
      const idRes = db.exec('SELECT last_insert_rowid() AS id');
      profileId = idRes[0].values[0][0];
    }

    db.run(`UPDATE invoices SET recurring_profile_id = ?, is_recurring = 1 WHERE id = ?`, [profileId, invoiceId]);
    db.run('COMMIT');
    saveToDisk();
    return { ok: true, profile: getRecurringProfile(profileId) };
  } catch (err) {
    db.run('ROLLBACK');
    return { ok: false, errors: { general: `Failed to save recurring schedule: ${err.message}` } };
  }
}

function pauseRecurringProfile(profileId) {
  db.run(`UPDATE recurring_profiles SET status = 'paused', updated_at = ? WHERE id = ?`, [new Date().toISOString(), profileId]);
  saveToDisk();
  return { ok: true, profile: getRecurringProfile(profileId) };
}

function resumeRecurringProfile(profileId) {
  db.run(`UPDATE recurring_profiles SET status = 'active', updated_at = ? WHERE id = ?`, [new Date().toISOString(), profileId]);
  saveToDisk();
  return { ok: true, profile: getRecurringProfile(profileId) };
}

function cancelRecurringProfile(profileId) {
  db.run(`UPDATE recurring_profiles SET status = 'cancelled', updated_at = ? WHERE id = ?`, [new Date().toISOString(), profileId]);
  saveToDisk();
  return { ok: true, profile: getRecurringProfile(profileId) };
}

function generateNextRecurringInvoice(profileId, forceDate) {
  const profileRes = db.exec('SELECT * FROM recurring_profiles WHERE id = ?', [profileId]);
  const profile = rowToObject(profileRes);
  if (!profile) throw new Error('Recurring profile not found.');

  const source = getInvoice(profile.source_invoice_id);
  if (!source) throw new Error('Source invoice not found.');

  const issueDate = forceDate || profile.next_issue_date || toDateString(new Date());

  let days = parsePaymentTermsDays(source.terms);
  if (days === null && source.date_created && source.date_due) {
    const d1 = new Date(source.date_created + 'T00:00:00');
    const d2 = new Date(source.date_due + 'T00:00:00');
    const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) days = diffDays;
  }
  if (days === null || days <= 0) days = 14;

  const issueD = new Date(issueDate + 'T00:00:00');
  const dueD = new Date(issueD);
  dueD.setDate(dueD.getDate() + days);
  const dueDate = toDateString(dueD);

  const invoiceNumber = nextInvoiceNumber();
  const now = new Date().toISOString();

  db.run('BEGIN');
  try {
    db.run(
      `INSERT INTO invoices (
         invoice_number, quote_id, client_id, contact_id, status,
         date_created, date_due, date_sent,
         subtotal, tax_amount, discount_amount, total, amount_paid, balance_due,
         currency, exchange_rate,
         notes, terms, recurring_profile_id, is_recurring, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        null,
        source.client_id,
        source.contact_id || null,
        'draft',
        issueDate,
        dueDate,
        null,
        Number(source.subtotal) || 0,
        Number(source.tax_amount) || 0,
        Number(source.discount_amount) || 0,
        Number(source.total) || 0,
        0,
        Number(source.total) || 0,
        source.currency || 'USD',
        Number(source.exchange_rate) || 1.0,
        source.notes || '',
        source.terms || '',
        profile.id,
        1,
        now,
        now,
      ]
    );

    const idRes = db.exec('SELECT last_insert_rowid() AS id');
    const newInvoiceId = idRes[0].values[0][0];

    (source.line_items || []).forEach((item, idx) => {
      db.run(
        `INSERT INTO invoice_line_items (
           invoice_id, description, quantity, unit_price,
           tax_rate, discount_type, discount_value, discount_amount,
           discount_percent, amount, sort_order
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newInvoiceId,
          String(item.description).trim(),
          Number(item.quantity),
          Number(item.unit_price),
          Number(item.tax_rate) || 0,
          item.discount_type || 'none',
          Number(item.discount_value) || 0,
          Number(item.discount_amount) || 0,
          0,
          Number(item.amount) || 0,
          idx,
        ]
      );
    });

    const nextDate = advanceRecurringDate(issueDate, profile.frequency);
    let newStatus = profile.status;
    if (profile.end_date && nextDate > profile.end_date) {
      newStatus = 'completed';
    }

    db.run(
      `UPDATE recurring_profiles SET next_issue_date = ?, status = ?, updated_at = ? WHERE id = ?`,
      [nextDate, newStatus, now, profileId]
    );

    db.run('COMMIT');
    saveToDisk();
    return getInvoice(newInvoiceId);
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

function triggerRecurringOccurrence(profileId) {
  try {
    const invoice = generateNextRecurringInvoice(profileId);
    return { ok: true, invoice, profile: getRecurringProfile(profileId) };
  } catch (err) {
    return { ok: false, errors: { general: `Failed to trigger recurring invoice: ${err.message}` } };
  }
}

function processDueRecurringInvoices() {
  const todayStr = toDateString(new Date());
  const activeProfilesRes = db.exec(
    `SELECT id, next_issue_date, end_date FROM recurring_profiles
     WHERE status = 'active' AND next_issue_date <= ?`,
    [todayStr]
  );
  const profiles = rowsToArray(activeProfilesRes);
  const generatedInvoices = [];

  for (const p of profiles) {
    try {
      const inv = generateNextRecurringInvoice(p.id);
      if (inv) generatedInvoices.push(inv);
    } catch (e) {
      /* continue */
    }
  }

  return {
    ok: true,
    generatedCount: generatedInvoices.length,
    invoices: generatedInvoices,
  };
}

// ---------- Dashboard stats ----------
function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const profile = getCompanyProfile();
  const baseCurrency = (profile && (profile.reporting_currency || profile.default_currency)) || 'USD';

  let outstanding = 0;
  let overdueCount = 0;
  let overdueBalance = 0;
  let hasForeignCurrency = false;

  // Outstanding & overdue use the same source (with refreshed balances) and the
  // same effective-status rule as the Invoices screen, so the numbers always agree.
  const invoices = listInvoices();
  for (const inv of invoices) {
    const bal = Number(inv.balance_due) || 0;
    const rate = Number(inv.exchange_rate) || 1.0;
    if ((inv.currency && inv.currency !== baseCurrency) || rate !== 1.0) {
      hasForeignCurrency = true;
    }
    if (bal > 0.0001) outstanding += (bal * rate);

    let overdue = false;
    if (inv.date_due) {
      const due = new Date(String(inv.date_due) + 'T00:00:00');
      if (!isNaN(due.getTime()) && due < today) overdue = true;
    }
    if (bal > 0.0001 && overdue) {
      overdueCount += 1;
      overdueBalance += (bal * rate);
    }
  }
  outstanding = Math.round(outstanding * 100) / 100;
  overdueBalance = Math.round(overdueBalance * 100) / 100;

  const scalar = (sql) => {
    const res = db.exec(sql);
    if (!res.length || !res[0].values.length) return 0;
    return Number(res[0].values[0][0]) || 0;
  };

  const invoicedMonth = scalar(`SELECT COALESCE(SUM(total * COALESCE(exchange_rate, 1.0)), 0) FROM invoices WHERE strftime('%Y-%m', date_created) = strftime('%Y-%m', 'now')`);
  const invoicedYear = scalar(`SELECT COALESCE(SUM(total * COALESCE(exchange_rate, 1.0)), 0) FROM invoices WHERE strftime('%Y', date_created) = strftime('%Y', 'now')`);
  const grossPaidMonth = scalar(`SELECT COALESCE(SUM(p.amount * COALESCE(i.exchange_rate, 1.0)), 0) FROM payments p JOIN invoices i ON p.invoice_id = i.id WHERE strftime('%Y-%m', p.payment_date) = strftime('%Y-%m', 'now')`);
  const creditedMonth = scalar(`SELECT COALESCE(SUM(cn.amount * COALESCE(i.exchange_rate, 1.0)), 0) FROM credit_notes cn JOIN invoices i ON cn.invoice_id = i.id WHERE strftime('%Y-%m', cn.date_created) = strftime('%Y-%m', 'now')`);
  const paidMonth = Math.max(0, Math.round((grossPaidMonth - creditedMonth) * 100) / 100);

  const grossPaidYear = scalar(`SELECT COALESCE(SUM(p.amount * COALESCE(i.exchange_rate, 1.0)), 0) FROM payments p JOIN invoices i ON p.invoice_id = i.id WHERE strftime('%Y', p.payment_date) = strftime('%Y', 'now')`);
  const creditedYear = scalar(`SELECT COALESCE(SUM(cn.amount * COALESCE(i.exchange_rate, 1.0)), 0) FROM credit_notes cn JOIN invoices i ON cn.invoice_id = i.id WHERE strftime('%Y', cn.date_created) = strftime('%Y', 'now')`);
  const paidYear = Math.max(0, Math.round((grossPaidYear - creditedYear) * 100) / 100);

  // Expenses & Real Profit
  const expensesMonth = Math.round(scalar(`SELECT COALESCE(SUM(amount * COALESCE(exchange_rate, 1.0)), 0) FROM expenses WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')`) * 100) / 100;
  const expensesYear = Math.round(scalar(`SELECT COALESCE(SUM(amount * COALESCE(exchange_rate, 1.0)), 0) FROM expenses WHERE strftime('%Y', date) = strftime('%Y', 'now')`) * 100) / 100;
  const profitMonth = Math.round((paidMonth - expensesMonth) * 100) / 100;
  const profitYear = Math.round((paidYear - expensesYear) * 100) / 100;

  const quoteActivity = rowsToArray(db.exec(
    `SELECT id, quote_number AS number, client_id, status, total, currency,
            COALESCE(updated_at, created_at) AS ts
       FROM quotes`
  )).map((r) => Object.assign({ kind: 'quote' }, r));

  const invoiceActivity = rowsToArray(db.exec(
    `SELECT id, invoice_number AS number, client_id, status, total, currency, amount_paid, balance_due, date_due,
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
    reporting_currency: baseCurrency,
    has_foreign_currency: hasForeignCurrency,
    outstanding_balance: outstanding,
    overdue_count: overdueCount,
    overdue_balance: overdueBalance,
    invoiced_month: invoicedMonth,
    invoiced_year: invoicedYear,
    paid_month: paidMonth,
    paid_year: paidYear,
    expenses_month: expensesMonth,
    expenses_year: expensesYear,
    profit_month: profitMonth,
    profit_year: profitYear,
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
      try {
        const r = trial.exec(`SELECT COUNT(*) FROM ${name}`);
        return r && r.length && r[0].values.length ? Number(r[0].values[0][0]) : 0;
      } catch (e) {
        return 0;
      }
    };
    counts = {
      clients: table('clients'),
      contacts: table('client_contacts'),
      notes: table('client_notes'),
      items: table('line_item_templates'),
      quotes: table('quotes'),
      invoices: table('invoices'),
      payments: table('payments'),
    };
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
  getClientContacts,
  getContactById,
  saveClientContacts,
  getClientNotes,
  getClientNote,
  addClientNote,
  updateClientNote,
  deleteClientNote,
  getClientOverview,
  createQuote,
  updateQuote,
  getQuote,
  getQuoteVersionHistory,
  listQuotes,
  setQuoteStatus,
  parsePaymentTermsDays,
  convertQuoteToInvoice,
  createFinalInvoiceFromDeposit,
  getInvoice,
  getInvoiceByQuote,
  listInvoices,
  setInvoiceStatus,
  addPayment,
  getPaymentHistory,
  getPaymentsReport,
  getProfitLossReport,
  issueCreditNote,
  getCreditNotesForInvoice,
  getCreditNotesForClient,
  getCreditNote,
  getRecurringProfile,
  getRecurringProfileByInvoice,
  setRecurringProfile,
  pauseRecurringProfile,
  resumeRecurringProfile,
  cancelRecurringProfile,
  triggerRecurringOccurrence,
  processDueRecurringInvoices,
  getLineItemTemplates,
  getLineItemTemplate,
  addLineItemTemplate,
  updateLineItemTemplate,
  deleteLineItemTemplate,
  EXPENSE_CATEGORIES,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  getExpensesSummary,
  PAYMENT_METHODS,
  getEmailSettings,
  getEmailSettingsInternal,
  saveEmailSettings,
  logDocumentEmail,
  getDocumentEmailLogs,
};
