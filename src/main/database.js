const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
      default_hourly_rate REAL DEFAULT NULL,
      invoice_prefix  TEXT NOT NULL DEFAULT 'INV-',
      invoice_start_number INTEGER NOT NULL DEFAULT 1,
      quote_prefix    TEXT NOT NULL DEFAULT 'Q-',
      quote_start_number INTEGER NOT NULL DEFAULT 1,
      default_terms   TEXT DEFAULT '',
      payment_details TEXT DEFAULT '',
      default_quote_acceptance_instructions TEXT DEFAULT 'To accept this quote, please reply to confirm via email or phone.',
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
      default_hourly_rate REAL DEFAULT NULL,
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
      acceptance_method TEXT DEFAULT NULL,
      acceptance_note TEXT DEFAULT NULL,
      accepted_by     TEXT DEFAULT NULL,
      acceptance_instructions TEXT DEFAULT NULL,
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

  db.run(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id    INTEGER NOT NULL REFERENCES clients(id),
      project_id   INTEGER DEFAULT NULL REFERENCES projects(id),
      date         TEXT NOT NULL,
      description  TEXT NOT NULL,
      hours        REAL NOT NULL CHECK (hours > 0),
      hourly_rate  REAL NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
      billed       INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_time_entries_client_id ON time_entries(client_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON time_entries(project_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);`);

  db.run(`
    CREATE TABLE IF NOT EXISTS app_lock (
      id                 INTEGER PRIMARY KEY CHECK (id = 1),
      is_enabled         INTEGER NOT NULL DEFAULT 0,
      pin_hash           TEXT DEFAULT '',
      pin_salt           TEXT DEFAULT '',
      inactivity_minutes INTEGER NOT NULL DEFAULT 5,
      updated_at         TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS auto_backup_settings (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      enabled        INTEGER NOT NULL DEFAULT 0,
      schedule       TEXT NOT NULL DEFAULT 'daily',
      folder         TEXT NOT NULL DEFAULT '',
      retain_count   INTEGER NOT NULL DEFAULT 7,
      last_backup_at TEXT DEFAULT '',
      updated_at     TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS audit_log_entries (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_ref  TEXT DEFAULT '',
      action      TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log_entries(created_at DESC);`);

  db.run(`
    CREATE TABLE IF NOT EXISTS live_timer (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      client_id    INTEGER NOT NULL REFERENCES clients(id),
      project_id   INTEGER DEFAULT NULL REFERENCES projects(id),
      description  TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS timer_settings (
      id                INTEGER PRIMARY KEY CHECK (id = 1),
      rounding_minutes  INTEGER NOT NULL DEFAULT 6,
      updated_at        TEXT NOT NULL
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
  {
    version: 21,
    up: () => {
      db.run(`
        CREATE TABLE IF NOT EXISTS reminder_rules (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          name             TEXT NOT NULL,
          timing_type      TEXT NOT NULL CHECK (timing_type IN ('before_due', 'on_due', 'after_due')),
          days             INTEGER NOT NULL DEFAULT 0,
          is_enabled       INTEGER NOT NULL DEFAULT 1,
          subject_template TEXT NOT NULL,
          body_template    TEXT NOT NULL,
          created_at       TEXT NOT NULL,
          updated_at       TEXT NOT NULL
        );
      `);

      const emailCols = new Set(db.exec(`PRAGMA table_info(email_settings)`)[0].values.map((v) => v[1]));
      if (!emailCols.has('auto_send_reminders')) {
        db.run(`ALTER TABLE email_settings ADD COLUMN auto_send_reminders INTEGER NOT NULL DEFAULT 0`);
      }

      db.run(`
        CREATE TABLE IF NOT EXISTS invoice_reminder_logs (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_id      INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
          rule_id         INTEGER NOT NULL REFERENCES reminder_rules(id) ON DELETE CASCADE,
          sent_at         TEXT NOT NULL,
          recipient_to    TEXT NOT NULL,
          status          TEXT NOT NULL DEFAULT 'sent'
        );
      `);
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_reminder_unique ON invoice_reminder_logs(invoice_id, rule_id);`);

      const countRes = db.exec(`SELECT COUNT(*) FROM reminder_rules`);
      const existingCount = countRes && countRes.length ? Number(countRes[0].values[0][0]) : 0;
      if (existingCount === 0) {
        const now = new Date().toISOString();
        db.run(
          `INSERT INTO reminder_rules (id, name, timing_type, days, is_enabled, subject_template, body_template, created_at, updated_at)
           VALUES (1, ?, ?, ?, 1, ?, ?, ?, ?)`,
          [
            'Upcoming Payment (3 days before)',
            'before_due',
            3,
            'Upcoming Payment Reminder: Invoice {invoice_number} due in {days_until_due} days',
            `Dear {client_name},\n\nThis is a friendly reminder that Invoice {invoice_number} for {amount_due} is due on {due_date} (in {days_until_due} days).\n\nPlease find attached a copy of the invoice for your records. If you have already processed payment, please disregard this notice.\n\nBest regards,\n{sender_name}\n{company_name}`,
            now,
            now,
          ]
        );
        db.run(
          `INSERT INTO reminder_rules (id, name, timing_type, days, is_enabled, subject_template, body_template, created_at, updated_at)
           VALUES (2, ?, ?, ?, 1, ?, ?, ?, ?)`,
          [
            'Payment Due Today',
            'on_due',
            0,
            'Payment Due Today: Invoice {invoice_number}',
            `Dear {client_name},\n\nThis is a reminder that Invoice {invoice_number} for {amount_due} is due today, {due_date}.\n\nA copy of your invoice is attached for reference. Please arrange for payment today. If you have already sent payment, thank you!\n\nBest regards,\n{sender_name}\n{company_name}`,
            now,
            now,
          ]
        );
        db.run(
          `INSERT INTO reminder_rules (id, name, timing_type, days, is_enabled, subject_template, body_template, created_at, updated_at)
           VALUES (3, ?, ?, ?, 1, ?, ?, ?, ?)`,
          [
            'Overdue Notice (7 days after)',
            'after_due',
            7,
            'Overdue Payment Notice: Invoice {invoice_number} ({days_overdue} days overdue)',
            `Dear {client_name},\n\nOur records indicate that Invoice {invoice_number} for {amount_due} was due on {due_date} and is now {days_overdue} days overdue.\n\nPlease arrange for payment at your earliest convenience. If there are any issues with this invoice or if payment has already been made, please contact us right away.\n\nBest regards,\n{sender_name}\n{company_name}`,
            now,
            now,
          ]
        );
      }
    },
  },
  {
    version: 22,
    up: () => {
      const qCols = new Set(db.exec(`PRAGMA table_info(quotes)`)[0].values.map((v) => v[1]));
      if (!qCols.has('acceptance_method')) {
        db.run(`ALTER TABLE quotes ADD COLUMN acceptance_method TEXT DEFAULT NULL`);
      }
      if (!qCols.has('acceptance_note')) {
        db.run(`ALTER TABLE quotes ADD COLUMN acceptance_note TEXT DEFAULT NULL`);
      }
      if (!qCols.has('accepted_by')) {
        db.run(`ALTER TABLE quotes ADD COLUMN accepted_by TEXT DEFAULT NULL`);
      }
      if (!qCols.has('acceptance_instructions')) {
        db.run(`ALTER TABLE quotes ADD COLUMN acceptance_instructions TEXT DEFAULT NULL`);
      }

      const cpCols = new Set(db.exec(`PRAGMA table_info(company_profile)`)[0].values.map((v) => v[1]));
      if (!cpCols.has('default_quote_acceptance_instructions')) {
        db.run(`ALTER TABLE company_profile ADD COLUMN default_quote_acceptance_instructions TEXT DEFAULT 'To accept this quote, please reply to confirm via email or phone.'`);
      }
    },
  },
  {
    version: 23,
    up: () => {
      // Allow quotes with a deposit invoice to also have a final remainder invoice linked to the same quote
      db.run(`DROP INDEX IF EXISTS idx_invoices_quote_id`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_invoices_quote_id ON invoices(quote_id)`);
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_quote_standard ON invoices(quote_id) WHERE invoice_type = 'standard'`);
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_quote_deposit ON invoices(quote_id) WHERE invoice_type = 'deposit'`);
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_quote_final ON invoices(quote_id) WHERE invoice_type = 'final'`);
    },
  },
  {
    version: 24,
    up: () => {
      // Projects (Jobs) — organizing layer above quotes and invoices.
      db.run(`
        CREATE TABLE IF NOT EXISTS projects (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id    INTEGER NOT NULL REFERENCES clients(id),
          name         TEXT NOT NULL,
          description  TEXT DEFAULT '',
          status       TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','on_hold','completed','archived')),
          start_date   TEXT NOT NULL,
          end_date     TEXT DEFAULT NULL,
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL
        );
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects(client_id);`);

      // Add project_id (nullable) to quotes and invoices — additive, existing rows get NULL.
      const quoteCols = new Set(db.exec(`PRAGMA table_info(quotes)`)[0].values.map((v) => v[1]));
      if (!quoteCols.has('project_id')) {
        db.run(`ALTER TABLE quotes ADD COLUMN project_id INTEGER DEFAULT NULL`);
      }

      const invCols = new Set(db.exec(`PRAGMA table_info(invoices)`)[0].values.map((v) => v[1]));
      if (!invCols.has('project_id')) {
        db.run(`ALTER TABLE invoices ADD COLUMN project_id INTEGER DEFAULT NULL`);
      }
    },
  },
  {
    version: 25,
    up: () => {
      // Time tracking: billable hours logged against a client, optionally a project.
      db.run(`
        CREATE TABLE IF NOT EXISTS time_entries (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id    INTEGER NOT NULL REFERENCES clients(id),
          project_id   INTEGER DEFAULT NULL REFERENCES projects(id),
          date         TEXT NOT NULL,
          description  TEXT NOT NULL,
          hours        REAL NOT NULL CHECK (hours > 0),
          hourly_rate  REAL NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
          billed       INTEGER NOT NULL DEFAULT 0,
          created_at   TEXT NOT NULL,
          updated_at   TEXT NOT NULL
        );
      `);
      db.run(`CREATE INDEX IF NOT EXISTS idx_time_entries_client_id ON time_entries(client_id);`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_time_entries_project_id ON time_entries(project_id);`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);`);

      // Hourly-rate defaults. None exist today — add all three so time entries
      // can fall back project → client → company default hourly rate.
      const projectCols = new Set(db.exec(`PRAGMA table_info(projects)`)[0].values.map((v) => v[1]));
      if (!projectCols.has('hourly_rate')) {
        db.run(`ALTER TABLE projects ADD COLUMN hourly_rate REAL DEFAULT NULL`);
      }

      const clientCols = new Set(db.exec(`PRAGMA table_info(clients)`)[0].values.map((v) => v[1]));
      if (!clientCols.has('default_hourly_rate')) {
        db.run(`ALTER TABLE clients ADD COLUMN default_hourly_rate REAL DEFAULT NULL`);
      }

      const companyCols = new Set(db.exec(`PRAGMA table_info(company_profile)`)[0].values.map((v) => v[1]));
      if (!companyCols.has('default_hourly_rate')) {
        db.run(`ALTER TABLE company_profile ADD COLUMN default_hourly_rate REAL DEFAULT NULL`);
      }
    },
  },
  {
    version: 26,
    up: () => {
      // Live timer: a single, persisted "currently running" state so a running
      // timer survives an app close and is recovered on next launch. Elapsed
      // is always derived from started_at, never from an in-memory counter.
      db.run(`
        CREATE TABLE IF NOT EXISTS live_timer (
          id           INTEGER PRIMARY KEY CHECK (id = 1),
          client_id    INTEGER NOT NULL REFERENCES clients(id),
          project_id   INTEGER DEFAULT NULL REFERENCES projects(id),
          description  TEXT NOT NULL,
          started_at   TEXT NOT NULL,
          created_at   TEXT NOT NULL
        );
      `);

      // Timer rounding increment (minutes) used when a stopped timer becomes
      // a time entry. Single-row, mirroring auto_backup_settings.
      db.run(`
        CREATE TABLE IF NOT EXISTS timer_settings (
          id                INTEGER PRIMARY KEY CHECK (id = 1),
          rounding_minutes  INTEGER NOT NULL DEFAULT 6,
          updated_at        TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 27,
    up: () => {
      // Invoice linkage for billed time entries: once a time entry is included
      // on an invoice it carries that invoice's id, so (a) it is traceable back
      // to the invoice it was billed on and (b) a future delete/void path can
      // safely unbill and re-select it instead of leaving it in a broken or
      // double-billable state.
      const entryCols = new Set(db.exec(`PRAGMA table_info(time_entries)`)[0].values.map((v) => v[1]));
      if (!entryCols.has('invoice_id')) {
        db.run(`ALTER TABLE time_entries ADD COLUMN invoice_id INTEGER DEFAULT NULL`);
      }
      db.run(`CREATE INDEX IF NOT EXISTS idx_time_entries_invoice_id ON time_entries(invoice_id);`);
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
    default_hourly_rate:
      profile.default_hourly_rate === undefined || profile.default_hourly_rate === null || profile.default_hourly_rate === ''
        ? (existing && existing.default_hourly_rate != null ? existing.default_hourly_rate : null)
        : normalizeNullableRate(profile.default_hourly_rate),
    invoice_prefix: profile.invoice_prefix || 'INV-',
    invoice_start_number: Number(profile.invoice_start_number || 1),
    quote_prefix: profile.quote_prefix || 'Q-',
    quote_start_number: Number(profile.quote_start_number || 1),
    default_terms: profile.default_terms || '',
    payment_details: profile.payment_details !== undefined ? profile.payment_details : (existing && existing.payment_details) || '',
    credit_note_prefix: profile.credit_note_prefix || 'CN-',
    credit_note_start_number: Number(profile.credit_note_start_number || 1),
    default_quote_acceptance_instructions: profile.default_quote_acceptance_instructions !== undefined
      ? profile.default_quote_acceptance_instructions
      : (existing && existing.default_quote_acceptance_instructions) || 'To accept this quote, please reply to confirm via email or phone.',
  };

  if (existing) {
    db.run(
      `UPDATE company_profile SET
        business_name = ?, logo_path = ?, address_line1 = ?, address_line2 = ?,
        city = ?, state = ?, postal_code = ?, country = ?, phone = ?, email = ?,
        website = ?, tax_id = ?, default_currency = ?, reporting_currency = ?, default_tax_rate = ?,
        default_hourly_rate = ?, invoice_prefix = ?, invoice_start_number = ?, quote_prefix = ?,
        quote_start_number = ?, default_terms = ?, payment_details = ?,
        credit_note_prefix = ?, credit_note_start_number = ?, default_quote_acceptance_instructions = ?, updated_at = ?
       WHERE id = 1`,
      [
        fields.business_name, fields.logo_path, fields.address_line1, fields.address_line2,
        fields.city, fields.state, fields.postal_code, fields.country, fields.phone, fields.email,
        fields.website, fields.tax_id, fields.default_currency, fields.reporting_currency, fields.default_tax_rate,
        fields.default_hourly_rate, fields.invoice_prefix, fields.invoice_start_number, fields.quote_prefix,
        fields.quote_start_number, fields.default_terms, fields.payment_details,
        fields.credit_note_prefix, fields.credit_note_start_number, fields.default_quote_acceptance_instructions, now,
      ]
    );
  } else {
    db.run(
      `INSERT INTO company_profile (
        id, business_name, logo_path, address_line1, address_line2, city, state,
        postal_code, country, phone, email, website, tax_id, default_currency,
        reporting_currency, default_tax_rate, default_hourly_rate, invoice_prefix, invoice_start_number, quote_prefix,
        quote_start_number, default_terms, payment_details,
        credit_note_prefix, credit_note_start_number, default_quote_acceptance_instructions, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        1, fields.business_name, fields.logo_path, fields.address_line1, fields.address_line2,
        fields.city, fields.state, fields.postal_code, fields.country, fields.phone, fields.email,
        fields.website, fields.tax_id, fields.default_currency, fields.reporting_currency, fields.default_tax_rate,
        fields.default_hourly_rate, fields.invoice_prefix, fields.invoice_start_number, fields.quote_prefix,
        fields.quote_start_number, fields.default_terms, fields.payment_details,
        fields.credit_note_prefix, fields.credit_note_start_number, fields.default_quote_acceptance_instructions, now, now,
      ]
    );
  }

  saveToDisk();
  addAuditEntry({
    entityType: 'settings',
    entityRef: 'Company Profile',
    action: 'settings_changed',
    description: 'Changed company settings (business: ' + (fields.business_name || '—') + ')',
  });
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
    auto_send_reminders: Number(obj.auto_send_reminders) === 1,
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
  const autoSendReminders = settings.auto_send_reminders !== undefined
    ? (settings.auto_send_reminders ? 1 : 0)
    : undefined;

  if (existingRes.length && existingRes[0].values.length > 0) {
    if (autoSendReminders !== undefined) {
      db.run(
        `UPDATE email_settings SET
           smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_username = ?,
           smtp_password_encrypted = ?, sender_name = ?, sender_email = ?,
           auto_send_reminders = ?, updated_at = ?
         WHERE id = 1`,
        [host, port, secure, username, finalEncryptedPass, senderName, senderEmail, autoSendReminders, now]
      );
    } else {
      db.run(
        `UPDATE email_settings SET
           smtp_host = ?, smtp_port = ?, smtp_secure = ?, smtp_username = ?,
           smtp_password_encrypted = ?, sender_name = ?, sender_email = ?, updated_at = ?
         WHERE id = 1`,
        [host, port, secure, username, finalEncryptedPass, senderName, senderEmail, now]
      );
    }
  } else {
    db.run(
      `INSERT INTO email_settings (
         id, smtp_host, smtp_port, smtp_secure, smtp_username,
         smtp_password_encrypted, sender_name, sender_email, auto_send_reminders, created_at, updated_at
       ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [host, port, secure, username, finalEncryptedPass, senderName, senderEmail, autoSendReminders !== undefined ? autoSendReminders : 0, now, now]
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

// ---------- Payment Reminder Rules & Engine ----------

const DEFAULT_REMINDER_RULES = [
  {
    id: 1,
    name: 'Upcoming Payment (3 days before)',
    timing_type: 'before_due',
    days: 3,
    is_enabled: 1,
    subject_template: 'Upcoming Payment Reminder: Invoice {invoice_number} due in {days_until_due} days',
    body_template: 'Dear {client_name},\n\nThis is a friendly reminder that Invoice {invoice_number} for {amount_due} is due on {due_date} (in {days_until_due} days).\n\nPlease find attached a copy of the invoice for your records. If you have already processed payment, please disregard this notice.\n\nBest regards,\n{sender_name}\n{company_name}',
  },
  {
    id: 2,
    name: 'Payment Due Today',
    timing_type: 'on_due',
    days: 0,
    is_enabled: 1,
    subject_template: 'Payment Due Today: Invoice {invoice_number}',
    body_template: 'Dear {client_name},\n\nThis is a reminder that Invoice {invoice_number} for {amount_due} is due today, {due_date}.\n\nA copy of your invoice is attached for reference. Please arrange for payment today. If you have already sent payment, thank you!\n\nBest regards,\n{sender_name}\n{company_name}',
  },
  {
    id: 3,
    name: 'Overdue Notice (7 days after)',
    timing_type: 'after_due',
    days: 7,
    is_enabled: 1,
    subject_template: 'Overdue Payment Notice: Invoice {invoice_number} ({days_overdue} days overdue)',
    body_template: 'Dear {client_name},\n\nOur records indicate that Invoice {invoice_number} for {amount_due} was due on {due_date} and is now {days_overdue} days overdue.\n\nPlease arrange for payment at your earliest convenience. If there are any issues with this invoice or if payment has already been made, please contact us right away.\n\nBest regards,\n{sender_name}\n{company_name}',
  },
];

function getReminderSettings() {
  const s = getEmailSettings();
  return {
    auto_send_reminders: Boolean(s && s.auto_send_reminders),
  };
}

function saveReminderSettings({ auto_send_reminders }) {
  const flag = auto_send_reminders ? 1 : 0;
  const now = new Date().toISOString();
  const existingRes = db.exec('SELECT * FROM email_settings WHERE id = 1');
  if (existingRes.length && existingRes[0].values.length > 0) {
    db.run(`UPDATE email_settings SET auto_send_reminders = ?, updated_at = ? WHERE id = 1`, [flag, now]);
  } else {
    db.run(
      `INSERT INTO email_settings (
         id, smtp_host, smtp_port, smtp_secure, smtp_username,
         smtp_password_encrypted, sender_name, sender_email, auto_send_reminders, created_at, updated_at
       ) VALUES (1, '', 587, 0, '', '', '', '', ?, ?, ?)`,
      [flag, now, now]
    );
  }
  saveToDisk();
  return { ok: true, auto_send_reminders: flag === 1 };
}

function getReminderRules() {
  const res = db.exec(`SELECT * FROM reminder_rules ORDER BY CASE timing_type WHEN 'before_due' THEN 1 WHEN 'on_due' THEN 2 WHEN 'after_due' THEN 3 END ASC, days ASC, id ASC`);
  return rowsToArray(res).map((r) => ({
    ...r,
    days: Number(r.days),
    is_enabled: Number(r.is_enabled) === 1,
  }));
}

function saveReminderRule(rule) {
  const now = new Date().toISOString();
  const id = rule.id ? Number(rule.id) : null;
  const name = String(rule.name || '').trim();
  const timing_type = String(rule.timing_type || 'before_due').trim();
  const days = Math.max(0, parseInt(rule.days, 10) || 0);
  const is_enabled = rule.is_enabled ? 1 : 0;
  const subject_template = String(rule.subject_template || '').trim();
  const body_template = String(rule.body_template || '').trim();

  if (!name) return { ok: false, error: 'Rule name is required.' };
  if (!subject_template) return { ok: false, error: 'Subject template is required.' };
  if (!body_template) return { ok: false, error: 'Message body template is required.' };
  if (!['before_due', 'on_due', 'after_due'].includes(timing_type)) {
    return { ok: false, error: 'Invalid timing type.' };
  }

  if (id) {
    db.run(
      `UPDATE reminder_rules
       SET name = ?, timing_type = ?, days = ?, is_enabled = ?, subject_template = ?, body_template = ?, updated_at = ?
       WHERE id = ?`,
      [name, timing_type, days, is_enabled, subject_template, body_template, now, id]
    );
  } else {
    db.run(
      `INSERT INTO reminder_rules (name, timing_type, days, is_enabled, subject_template, body_template, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, timing_type, days, is_enabled, subject_template, body_template, now, now]
    );
  }
  saveToDisk();
  return { ok: true, rules: getReminderRules() };
}

function deleteReminderRule(id) {
  db.run(`DELETE FROM reminder_rules WHERE id = ?`, [Number(id)]);
  saveToDisk();
  return { ok: true, rules: getReminderRules() };
}

function resetDefaultReminderRules() {
  const now = new Date().toISOString();
  db.run(`DELETE FROM reminder_rules`);
  for (const r of DEFAULT_REMINDER_RULES) {
    db.run(
      `INSERT INTO reminder_rules (id, name, timing_type, days, is_enabled, subject_template, body_template, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.name, r.timing_type, r.days, r.is_enabled, r.subject_template, r.body_template, now, now]
    );
  }
  saveToDisk();
  return { ok: true, rules: getReminderRules() };
}

function formatReminderDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(String(dateStr) + 'T00:00:00');
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return String(dateStr);
  }
}

function formatReminderMoney(amount, currency = 'USD') {
  const num = Number(amount) || 0;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(num);
  } catch (e) {
    return `${currency} ${num.toFixed(2)}`;
  }
}

function interpolateReminderTemplate(template, vars) {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : match;
  });
}

function resolveDocumentRecipientEmail(doc, client) {
  if (doc && doc.contact && doc.contact.email && doc.contact.email.trim()) {
    return doc.contact.email.trim();
  }
  if (client && Array.isArray(client.contacts)) {
    const primary = client.contacts.find((c) => c.is_primary && c.email && c.email.trim());
    if (primary) return primary.email.trim();
    const any = client.contacts.find((c) => c.email && c.email.trim());
    if (any) return any.email.trim();
  }
  if (client && client.email && client.email.trim()) {
    return client.email.trim();
  }
  return '';
}

function getDueReminders(referenceDate = null) {
  const rules = getReminderRules().filter((r) => r.is_enabled);
  if (!rules.length) return [];

  const now = referenceDate ? new Date(referenceDate) : new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const today = new Date(todayStr + 'T00:00:00');

  const profile = getCompanyProfile() || {};
  const emailSettings = getEmailSettings() || {};
  const companyName = profile.business_name || profile.company_name || 'QuoteCraft';
  const senderName = emailSettings.sender_name || profile.business_name || profile.company_name || 'Accounts';

  const sentLogsRes = db.exec(`SELECT invoice_id, rule_id FROM invoice_reminder_logs`);
  const sentSet = new Set();
  if (sentLogsRes.length && sentLogsRes[0].values.length) {
    for (const [invId, rId] of sentLogsRes[0].values) {
      sentSet.add(`${invId}_${rId}`);
    }
  }

  const invoices = listInvoices().filter((inv) => {
    const bal = Number(inv.balance_due) || 0;
    const isUnpaid = bal > 0.0001;
    const isSentOrOverdue = ['sent', 'partially_paid', 'overdue'].includes(inv.status);
    return isUnpaid && isSentOrOverdue && inv.date_due;
  });

  const dueReminders = [];

  for (const inv of invoices) {
    const due = new Date(String(inv.date_due) + 'T00:00:00');
    if (isNaN(due.getTime())) continue;

    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const daysOverdue = Math.max(0, -diffDays);
    const daysUntilDue = Math.max(0, diffDays);

    for (const rule of rules) {
      if (sentSet.has(`${inv.id}_${rule.id}`)) {
        continue;
      }

      let matches = false;
      if (rule.timing_type === 'before_due') {
        if (diffDays > 0 && diffDays <= rule.days) {
          matches = true;
        }
      } else if (rule.timing_type === 'on_due') {
        if (diffDays === 0) {
          matches = true;
        }
      } else if (rule.timing_type === 'after_due') {
        if (daysOverdue >= rule.days) {
          matches = true;
        }
      }

      if (!matches) continue;

      const fullInv = getInvoice(inv.id);
      const client = fullInv ? fullInv.client : getClient(inv.client_id);
      const recipientTo = resolveDocumentRecipientEmail(fullInv, client);
      const clientName = client ? (client.company_name ? `${client.name} (${client.company_name})` : client.name) : 'Valued Client';
      let primaryContact = null;
      if (fullInv && fullInv.contact) {
        primaryContact = fullInv.contact;
      } else if (client && Array.isArray(client.contacts)) {
        primaryContact = client.contacts.find((c) => c.is_primary) || client.contacts[0] || null;
      }
      const contactName = primaryContact ? primaryContact.name : (client ? client.name : 'Valued Client');

      const invCurrency = inv.currency || profile.default_currency || 'USD';
      const balanceDue = Number(inv.balance_due) || 0;
      const formattedAmount = formatReminderMoney(balanceDue, invCurrency);
      const formattedTotal = formatReminderMoney(inv.total, invCurrency);
      const formattedDue = formatReminderDate(inv.date_due);

      const templateVars = {
        client_name: contactName || clientName,
        contact_name: contactName,
        invoice_number: inv.invoice_number,
        amount_due: formattedAmount,
        balance_due: formattedAmount,
        total: formattedTotal,
        due_date: formattedDue,
        days_until_due: daysUntilDue,
        days_overdue: daysOverdue,
        company_name: companyName,
        sender_name: senderName,
      };

      const renderedSubject = interpolateReminderTemplate(rule.subject_template, templateVars);
      const renderedBody = interpolateReminderTemplate(rule.body_template, templateVars);

      dueReminders.push({
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        client_id: inv.client_id,
        client_name: clientName,
        contact_id: inv.contact_id,
        contact_name: contactName,
        recipient_to: recipientTo,
        recipient_cc: '',
        total: inv.total,
        amount_paid: inv.amount_paid,
        balance_due: balanceDue,
        currency: invCurrency,
        date_created: inv.date_created,
        date_due: inv.date_due,
        diff_days: diffDays,
        days_overdue: daysOverdue,
        days_until_due: daysUntilDue,
        rule_id: rule.id,
        rule_name: rule.name,
        timing_type: rule.timing_type,
        rule_days: rule.days,
        subject: renderedSubject,
        message: renderedBody,
      });

      break;
    }
  }

  return dueReminders;
}

function logReminderSent(invoiceId, ruleId, { recipient_to, recipient_cc, subject, message_id, sent_at }) {
  const now = sent_at || new Date().toISOString();
  db.run(
    `INSERT OR REPLACE INTO invoice_reminder_logs (invoice_id, rule_id, sent_at, recipient_to, status)
     VALUES (?, ?, ?, ?, 'sent')`,
    [Number(invoiceId), Number(ruleId), now, String(recipient_to || '').trim()]
  );
  logDocumentEmail({
    document_type: 'invoice',
    document_id: invoiceId,
    recipient_to: recipient_to,
    recipient_cc: recipient_cc,
    subject: subject,
    message_id: message_id,
    sent_at: now,
  });
  saveToDisk();
  return { ok: true };
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

// Nullable money-like value (hourly rates): blank -> null, else rounded number.
function normalizeNullableRate(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function addClient(client) {
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO clients (
      name, email, phone, company_name, address_line1, address_line2, city,
      state, postal_code, country, notes, tags, default_hourly_rate, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      normalizeNullableRate(client.default_hourly_rate),
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
  const created = getClient(newId);
  addAuditEntry({
    entityType: 'client',
    entityRef: created.name || 'Client #' + newId,
    action: 'created',
    description: 'Created client "' + (created.name || '') + '"',
  });
  return created;
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
    normalizeNullableRate(client.default_hourly_rate),
  ];
}

function updateClient(id, client) {
  const now = new Date().toISOString();
  const p = clientParams(client, now);
  db.run(
    `UPDATE clients SET
       name = ?, email = ?, phone = ?, company_name = ?, address_line1 = ?,
       address_line2 = ?, city = ?, state = ?, postal_code = ?, country = ?,
       notes = ?, tags = ?, default_hourly_rate = ?, updated_at = ?
     WHERE id = ?`,
    [...p, now, id]
  );

  // contacts array may be included; undefined means "leave them alone" (shouldn't happen
  // from the UI but guard anyway); null means "clear all"; array means "replace"
  if (client.contacts !== undefined) {
    saveClientContacts(id, client.contacts || []);
  }

  saveToDisk();
  const updated = getClient(id);
  addAuditEntry({
    entityType: 'client',
    entityRef: (updated && updated.name) || 'Client #' + id,
    action: 'updated',
    description: 'Updated client "' + ((updated && updated.name) || '') + '"',
  });
  return updated;
}

function countClientHistory(id) {
  const quotes = db.exec('SELECT COUNT(*) AS c FROM quotes WHERE client_id = ?', [id]);
  const invoices = db.exec('SELECT COUNT(*) AS c FROM invoices WHERE client_id = ?', [id]);
  const projects = db.exec('SELECT COUNT(*) AS c FROM projects WHERE client_id = ?', [id]);
  return {
    quoteCount: quotes[0].values[0][0],
    invoiceCount: invoices[0].values[0][0],
    projectCount: projects[0].values[0][0],
  };
}

function archiveClient(id) {
  const now = new Date().toISOString();
  db.run(`UPDATE clients SET archived = 1, updated_at = ? WHERE id = ?`, [now, id]);
  saveToDisk();
  const archived = getClient(id);
  addAuditEntry({
    entityType: 'client',
    entityRef: (archived && archived.name) || 'Client #' + id,
    action: 'archived',
    description: 'Archived client "' + ((archived && archived.name) || '') + '"',
  });
  return archived;
}

function deleteClient(id) {
  const history = countClientHistory(id);
  if (history.quoteCount > 0 || history.invoiceCount > 0 || history.projectCount > 0) {
    return { ok: false, blocked: true, ...history };
  }
  const before = getClient(id);
  // client_contacts rows cascade-delete via FK ON DELETE CASCADE
  const changes = db.run(`DELETE FROM clients WHERE id = ?`, [id]);
  const deleted = db.getRowsModified() > 0;
  saveToDisk();
  if (deleted && before) {
    addAuditEntry({
      entityType: 'client',
      entityRef: before.name || 'Client #' + id,
      action: 'deleted',
      description: 'Deleted client "' + (before.name || '') + '"',
    });
  }
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

// ---------- Projects (Jobs) ----------

const PROJECT_STATUSES = ['active', 'on_hold', 'completed', 'archived'];

function countProjectHistory(id) {
  const quotes = db.exec('SELECT COUNT(*) AS c FROM quotes WHERE project_id = ?', [id]);
  const invoices = db.exec('SELECT COUNT(*) AS c FROM invoices WHERE project_id = ?', [id]);
  return {
    quoteCount: quotes[0].values[0][0],
    invoiceCount: invoices[0].values[0][0],
  };
}

// listProjects — searchable by name/client, filterable by client and status.
// opts: { search, clientId, status }
function listProjects(opts) {
  const o = opts || {};
  const where = [];
  const params = [];

  // Renderer callers pass snake_case field names (client_id); keep clientId
  // as a fallback for older test/API usage.
  const clientFilter = o.client_id !== undefined && o.client_id !== null && o.client_id !== ''
    ? o.client_id
    : (o.clientId !== undefined && o.clientId !== null && o.clientId !== '' ? o.clientId : null);
  if (clientFilter !== null) {
    where.push('p.client_id = ?');
    params.push(clientFilter);
  }
  if (o.status) {
    where.push('p.status = ?');
    params.push(o.status);
  }
  if (o.search && String(o.search).trim()) {
    const term = '%' + String(o.search).trim() + '%';
    where.push('(p.name LIKE ? OR c.name LIKE ? OR c.company_name LIKE ?)');
    params.push(term, term, term);
  }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const res = db.exec(
    `SELECT p.*, c.name AS client_name, c.company_name AS client_company,
            (SELECT COUNT(*) FROM quotes q WHERE q.project_id = p.id) AS quote_count,
            (SELECT COUNT(*) FROM invoices i WHERE i.project_id = p.id) AS invoice_count
       FROM projects p
       JOIN clients c ON c.id = p.client_id
       ${whereSql}
       ORDER BY p.name COLLATE NOCASE ASC, p.id ASC`,
    params
  );
  return rowsToArray(res);
}

function getProject(id) {
  const res = db.exec(
    `SELECT p.*, c.name AS client_name, c.company_name AS client_company,
            (SELECT COUNT(*) FROM quotes q WHERE q.project_id = p.id) AS quote_count,
            (SELECT COUNT(*) FROM invoices i WHERE i.project_id = p.id) AS invoice_count
       FROM projects p
       JOIN clients c ON c.id = p.client_id
      WHERE p.id = ?`,
    [id]
  );
  const project = rowToObject(res);
  if (!project) return null;
  return project;
}

function addProject(project) {
  const errors = validateProjectInput(project);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const now = new Date().toISOString();
  db.run(
    `INSERT INTO projects (client_id, name, description, status, start_date, end_date, hourly_rate, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project.client_id,
      String(project.name || '').trim(),
      String(project.description || '').trim(),
      String(project.status || '').trim() || 'active',
      String(project.start_date || '').trim(),
      project.end_date ? String(project.end_date).trim() : null,
      normalizeNullableRate(project.hourly_rate),
      now,
      now,
    ]
  );

  const idRes = db.exec('SELECT last_insert_rowid() AS id');
  const newId = idRes[0].values[0][0];
  saveToDisk();
  const created = getProject(newId);
  addAuditEntry({
    entityType: 'project',
    entityRef: created ? created.name : 'Project #' + newId,
    action: 'created',
    description: 'Created project "' + ((created && created.name) || '') + '"',
  });
  return { ok: true, project: created };
}

function updateProject(id, project) {
  const existing = getProject(id);
  if (!existing) {
    return { ok: false, errors: { general: 'Project not found.' } };
  }

  const errors = validateProjectInput(project);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const now = new Date().toISOString();
  db.run(
    `UPDATE projects SET
       client_id = ?, name = ?, description = ?, status = ?,
       start_date = ?, end_date = ?, hourly_rate = ?, updated_at = ?
     WHERE id = ?`,
    [
      project.client_id,
      String(project.name || '').trim(),
      String(project.description || '').trim(),
      String(project.status || '').trim() || existing.status,
      String(project.start_date || '').trim(),
      project.end_date ? String(project.end_date).trim() : null,
      normalizeNullableRate(project.hourly_rate),
      now,
      id,
    ]
  );

  saveToDisk();
  const updated = getProject(id);
  addAuditEntry({
    entityType: 'project',
    entityRef: (updated && updated.name) || 'Project #' + id,
    action: 'updated',
    description: 'Updated project "' + ((updated && updated.name) || '') + '"',
  });
  return { ok: true, project: updated };
}

function archiveProject(id) {
  const existing = getProject(id);
  if (!existing) return { ok: false, errors: { general: 'Project not found.' } };

  const now = new Date().toISOString();
  db.run(`UPDATE projects SET status = 'archived', updated_at = ? WHERE id = ?`, [now, id]);
  saveToDisk();
  const archived = getProject(id);
  addAuditEntry({
    entityType: 'project',
    entityRef: archived.name || 'Project #' + id,
    action: 'archived',
    description: 'Archived project "' + (archived.name || '') + '"',
  });
  return { ok: true, project: archived };
}

function deleteProject(id) {
  const history = countProjectHistory(id);
  if (history.quoteCount > 0 || history.invoiceCount > 0) {
    return { ok: false, blocked: true, ...history };
  }
  const before = getProject(id);
  db.run(`DELETE FROM projects WHERE id = ?`, [id]);
  const deleted = db.getRowsModified() > 0;
  saveToDisk();
  if (deleted && before) {
    addAuditEntry({
      entityType: 'project',
      entityRef: before.name || 'Project #' + id,
      action: 'deleted',
      description: 'Deleted project "' + (before.name || '') + '"',
    });
  }
  return { ok: true, deleted };
}

function validateProjectInput(project) {
  const errors = {};
  if (!project || !project.client_id) {
    errors.client_id = 'Please select a client.';
  }
  if (!project.name || !String(project.name).trim()) {
    errors.name = 'Project name is required.';
  }
  if (!project.start_date || !String(project.start_date).trim()) {
    errors.start_date = 'Start date is required.';
  } else if (!isValidDateString(String(project.start_date).trim())) {
    errors.start_date = 'Start date must be a valid date.';
  }
  if (project.end_date && !isValidDateString(String(project.end_date).trim())) {
    errors.end_date = 'End date must be a valid date.';
  }
  if (project.status && !PROJECT_STATUSES.includes(String(project.status).trim())) {
    errors.status = 'Invalid project status.';
  }
  if (project.hourly_rate !== undefined && project.hourly_rate !== null && project.hourly_rate !== '') {
    const rate = Number(project.hourly_rate);
    if (isNaN(rate) || rate < 0) {
      errors.hourly_rate = 'Hourly rate must be a number greater than or equal to zero.';
    } else if (hasMoreThanTwoDecimals(project.hourly_rate)) {
      errors.hourly_rate = 'Hourly rate may only have up to 2 decimal places.';
    }
  }
  return errors;
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

// Overview of a single project: its linked quotes + invoices and scoped KPI totals.
// Totals are converted to the reporting currency via each document's exchange_rate,
// matching the client overview convention. Read-only.
function getProjectOverview(projectId) {
  const project = getProject(projectId);
  if (!project) return null;

  const client = project.client_id ? getClient(project.client_id) : null;

  const quotesRes = db.exec(
    `SELECT * FROM quotes WHERE project_id = ? ORDER BY date_created DESC, id DESC`,
    [projectId]
  );
  const quotes = rowsToArray(quotesRes);

  const invoicesRes = db.exec(
    `SELECT * FROM invoices WHERE project_id = ? ORDER BY date_created DESC, id DESC`,
    [projectId]
  );
  const invoices = rowsToArray(invoicesRes).map((inv) => {
    refreshInvoiceBalance(inv);
    return inv;
  });

  const totalQuoted = quotes.reduce((sum, q) => sum + ((Number(q.total) || 0) * (Number(q.exchange_rate) || 1.0)), 0);
  const totalInvoiced = invoices.reduce((sum, inv) => sum + ((Number(inv.total) || 0) * (Number(inv.exchange_rate) || 1.0)), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (((Number(inv.amount_paid) || 0) - (Number(inv.amount_credited) || 0)) * (Number(inv.exchange_rate) || 1.0)), 0);
  const outstandingBalance = Math.max(0, Math.round(invoices.reduce((sum, inv) => sum + ((Number(inv.balance_due) || 0) * (Number(inv.exchange_rate) || 1.0)), 0) * 100) / 100);

  return {
    project,
    client,
    quotes,
    invoices,
    stats: {
      totalQuoted: Math.round(totalQuoted * 100) / 100,
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      outstandingBalance,
      quoteCount: quotes.length,
      invoiceCount: invoices.length,
    },
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


// ---------- Time Entries (billable hours) ----------

const TIME_ENTRY_LOCKED_MESSAGE =
  'This time entry is Billed. Once a time entry is included on an invoice it becomes a ' +
  'historical record and can no longer be edited or deleted.';

// Resolve the hourly-rate default with precedence: project → client → company.
// Returns { hourly_rate, source } where source is 'project' | 'client' | 'company' | null.
function resolveTimeEntryRate(clientId, projectId) {
  if (projectId) {
    const project = getProject(projectId);
    if (project && project.hourly_rate != null) {
      return { hourly_rate: Math.round(Number(project.hourly_rate) * 100) / 100, source: 'project' };
    }
  }
  if (clientId) {
    const client = getClient(clientId);
    if (client && client.default_hourly_rate != null) {
      return { hourly_rate: Math.round(Number(client.default_hourly_rate) * 100) / 100, source: 'client' };
    }
  }
  const profile = getCompanyProfile();
  if (profile && profile.default_hourly_rate != null) {
    return { hourly_rate: Math.round(Number(profile.default_hourly_rate) * 100) / 100, source: 'company' };
  }
  return { hourly_rate: null, source: null };
}

function validateTimeEntryInput(input) {
  const errors = {};

  if (!input.client_id) {
    errors.client_id = 'Please select a client.';
  }

  if (input.project_id !== undefined && input.project_id !== null && String(input.project_id).trim() !== '') {
    checkProjectBelongsToClient(input, errors);
  }

  const date = String(input.date || '').trim();
  if (!date || !isValidDateString(date)) {
    errors.date = 'A valid entry date (YYYY-MM-DD) is required.';
  }

  if (!String(input.description || '').trim()) {
    errors.description = 'A description of the work done is required.';
  }

  const hours = Number(input.hours);
  if (!(hours > 0)) {
    errors.hours = 'Hours must be greater than zero.';
  } else if (hasMoreThanTwoDecimals(input.hours)) {
    errors.hours = 'Hours may only have up to 2 decimal places.';
  }

  let hourlyRate = null;
  if (input.hourly_rate !== undefined && input.hourly_rate !== null && String(input.hourly_rate).trim() !== '') {
    const rate = Number(input.hourly_rate);
    if (isNaN(rate) || rate < 0) {
      errors.hourly_rate = 'Hourly rate must be a number greater than or equal to zero.';
    } else if (hasMoreThanTwoDecimals(input.hourly_rate)) {
      errors.hourly_rate = 'Hourly rate may only have up to 2 decimal places.';
    } else {
      hourlyRate = Math.round(rate * 100) / 100;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    data: {
      client_id: Number(input.client_id),
      project_id:
        input.project_id !== undefined && input.project_id !== null && String(input.project_id).trim() !== '' && Number(input.project_id) > 0
          ? Number(input.project_id)
          : null,
      date,
      description: String(input.description || '').trim(),
      hours: Math.round(hours * 100) / 100,
      hourly_rate: hourlyRate,
    },
  };
}

function decorateTimeEntry(entry) {
  const client = entry.client_id ? getClient(entry.client_id) : null;
  entry.client_name = client ? client.name : '';
  entry.client_company = client ? client.company_name : '';
  const project = entry.project_id ? getProject(entry.project_id) : null;
  entry.project_name = project ? project.name : '';
  entry.billed = Number(entry.billed) ? 1 : 0;
  entry.invoice_id = entry.invoice_id != null ? Number(entry.invoice_id) : null;
  entry.invoice_number = '';
  if (entry.billed && entry.invoice_id) {
    const inv = rowToObject(db.exec('SELECT invoice_number FROM invoices WHERE id = ?', [entry.invoice_id]));
    entry.invoice_number = inv ? inv.invoice_number : '';
  }
  entry.amount = Math.round((Number(entry.hours) || 0) * (Number(entry.hourly_rate) || 0) * 100) / 100;
  return entry;
}

function getTimeEntry(id) {
  const entry = rowToObject(db.exec('SELECT * FROM time_entries WHERE id = ?', [id]));
  if (!entry) return null;
  return decorateTimeEntry(entry);
}

function createTimeEntry(input) {
  const validation = validateTimeEntryInput(input);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const { client_id, project_id, date, description, hours, hourly_rate } = validation.data;
  const rate = hourly_rate !== null ? hourly_rate : (resolveTimeEntryRate(client_id, project_id).hourly_rate || 0);
  const now = new Date().toISOString();

  try {
    db.run(
      `INSERT INTO time_entries (client_id, project_id, date, description, hours, hourly_rate, billed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [client_id, project_id, date, description, hours, rate, now, now]
    );
    const idRes = db.exec('SELECT last_insert_rowid() AS id');
    const newId = idRes[0].values[0][0];
    saveToDisk();
    const created = getTimeEntry(newId);
    addAuditEntry({
      entityType: 'time_entry',
      entityRef: (created && created.description) || 'Time Entry #' + newId,
      action: 'created',
      description: 'Logged ' + (created ? Number(created.hours).toFixed(2) : '0.00') + 'h for "' + ((created && created.description) || '') + '"',
    });
    return { ok: true, entry: created };
  } catch (err) {
    return { ok: false, errors: { general: `Failed to create time entry: ${err.message}` } };
  }
}

function updateTimeEntry(id, input) {
  const existing = getTimeEntry(id);
  if (!existing) {
    return { ok: false, errors: { general: 'Time entry not found.' } };
  }
  if (existing.billed) {
    return { ok: false, locked: true, errors: { general: TIME_ENTRY_LOCKED_MESSAGE } };
  }

  const validation = validateTimeEntryInput(input);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const { client_id, project_id, date, description, hours, hourly_rate } = validation.data;
  // On edit keep the snapshot stored on the entry unless the form supplies a new rate.
  const rate = hourly_rate !== null ? hourly_rate : (Number(existing.hourly_rate) || 0);
  const now = new Date().toISOString();

  try {
    db.run(
      `UPDATE time_entries SET
         client_id = ?, project_id = ?, date = ?, description = ?, hours = ?, hourly_rate = ?, updated_at = ?
       WHERE id = ?`,
      [client_id, project_id, date, description, hours, rate, now, id]
    );
    saveToDisk();
    const updated = getTimeEntry(id);
    addAuditEntry({
      entityType: 'time_entry',
      entityRef: (updated && updated.description) || 'Time Entry #' + id,
      action: 'updated',
      description: 'Updated time entry "' + ((updated && updated.description) || '') + '"',
    });
    return { ok: true, entry: updated };
  } catch (err) {
    return { ok: false, errors: { general: `Failed to update time entry: ${err.message}` } };
  }
}

function deleteTimeEntry(id) {
  const existing = getTimeEntry(id);
  if (!existing) {
    return { ok: false, errors: { general: 'Time entry not found.' } };
  }
  if (existing.billed) {
    return { ok: false, locked: true, errors: { general: TIME_ENTRY_LOCKED_MESSAGE } };
  }

  try {
    db.run('DELETE FROM time_entries WHERE id = ?', [id]);
    saveToDisk();
    addAuditEntry({
      entityType: 'time_entry',
      entityRef: existing.description || 'Time Entry #' + id,
      action: 'deleted',
      description: 'Deleted time entry "' + (existing.description || '') + '"',
    });
    return { ok: true, deleted: true };
  } catch (err) {
    return { ok: false, errors: { general: `Failed to delete time entry: ${err.message}` } };
  }
}

function listTimeEntries(filter = {}) {
  const { client_id, project_id, date_from, date_to, billed, search } = filter;
  const conditions = [];
  const params = [];

  if (client_id) {
    conditions.push('client_id = ?');
    params.push(Number(client_id));
  }

  if (project_id) {
    conditions.push('project_id = ?');
    params.push(Number(project_id));
  }

  if (date_from && String(date_from).trim()) {
    conditions.push('date >= ?');
    params.push(String(date_from).trim());
  }

  if (date_to && String(date_to).trim()) {
    conditions.push('date <= ?');
    params.push(String(date_to).trim());
  }

  if (billed === 'billed') {
    conditions.push('billed = 1');
  } else if (billed === 'unbilled') {
    conditions.push('billed = 0');
  }

  if (search && String(search).trim()) {
    conditions.push('description LIKE ?');
    params.push(`%${String(search).trim()}%`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = rowsToArray(db.exec(`SELECT * FROM time_entries ${whereClause} ORDER BY date DESC, id DESC`, params));
  return rows.map(decorateTimeEntry);
}

function getTimeEntriesSummary(filter = {}) {
  const entries = listTimeEntries(filter);
  const profile = getCompanyProfile();
  const baseCurrency = (profile && (profile.reporting_currency || profile.default_currency)) || 'USD';

  let totalHours = 0;
  let totalAmount = 0;
  let billedHours = 0;
  let unbilledHours = 0;

  for (const e of entries) {
    const h = Number(e.hours) || 0;
    totalHours += h;
    totalAmount += Number(e.amount) || 0;
    if (e.billed) billedHours += h;
    else unbilledHours += h;
  }

  return {
    count: entries.length,
    totalHours: Math.round(totalHours * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
    billedHours: Math.round(billedHours * 100) / 100,
    unbilledHours: Math.round(unbilledHours * 100) / 100,
    baseCurrency,
  };
}

// Marks time entries as Billed. Called by the future include-on-invoice flow
// (Prompt 63); not exposed in the manual-entry UI — a Billed entry is immutable.
function markTimeEntriesBilled(ids) {
  const clean = (Array.isArray(ids) ? ids : [ids])
    .map((id) => Number(id))
    .filter((id) => id > 0);
  if (clean.length === 0) {
    return { ok: false, errors: { general: 'No time entries selected.' } };
  }

  const placeholders = clean.map(() => '?').join(', ');
  db.run(
    `UPDATE time_entries SET billed = 1, updated_at = ? WHERE id IN (${placeholders})`,
    [new Date().toISOString(), ...clean]
  );
  const count = db.getRowsModified();
  saveToDisk();
  return { ok: true, count };
}

// ---------- Live Timer ----------
// One timer at a time, persisted in live_timer (single row, id = 1). Elapsed is
// always recomputed from started_at so a close/crash mid-timer is recovered on
// the next launch instead of losing the time.

function getTimerSettings() {
  const res = db.exec('SELECT rounding_minutes FROM timer_settings WHERE id = 1');
  if (!res.length || res[0].values.length === 0) {
    return { roundingMinutes: 6 };
  }
  const stored = res[0].values[0][0];
  const n = stored === null || stored === undefined ? null : parseInt(stored, 10);
  if (n === null || Number.isNaN(n)) {
    return { roundingMinutes: 6 };
  }
  return { roundingMinutes: Math.max(0, Math.min(60, n)) };
}

function saveTimerSettings({ roundingMinutes } = {}) {
  const value = parseInt(roundingMinutes, 10);
  if (Number.isNaN(value) || value < 0 || value > 60) {
    return { ok: false, error: 'Rounding must be between 0 and 60 minutes.' };
  }
  const now = new Date().toISOString();
  const existingRes = db.exec('SELECT * FROM timer_settings WHERE id = 1');
  if (existingRes.length && existingRes[0].values.length > 0) {
    db.run(`UPDATE timer_settings SET rounding_minutes = ?, updated_at = ? WHERE id = 1`, [value, now]);
  } else {
    db.run(`INSERT INTO timer_settings (id, rounding_minutes, updated_at) VALUES (1, ?, ?)`, [value, now]);
  }
  saveToDisk();
  return { ok: true, settings: getTimerSettings() };
}

function getLiveTimer() {
  const res = db.exec('SELECT * FROM live_timer WHERE id = 1');
  if (!res.length || res[0].values.length === 0) {
    return null;
  }
  const cols = res[0].columns;
  const row = {};
  cols.forEach((c, i) => { row[c] = res[0].values[0][i]; });

  const startedAt = row.started_at;
  const elapsedMs = Math.max(0, Date.now() - Date.parse(startedAt));
  const client = row.client_id ? getClient(row.client_id) : null;
  const project = row.project_id ? getProject(row.project_id) : null;
  return {
    client_id: row.client_id,
    project_id: row.project_id || null,
    description: row.description,
    started_at: startedAt,
    elapsed_ms: elapsedMs,
    client_name: client ? client.name : '',
    client_company: client ? client.company_name : '',
    project_name: project ? project.name : '',
  };
}

function hasRunningTimer() {
  return !!getLiveTimer();
}

function roundElapsedHours(elapsedMs, roundingMinutes) {
  const rawHours = elapsedMs / 3600000;
  if (!roundingMinutes || roundingMinutes <= 0) {
    return Math.round(rawHours * 100) / 100;
  }
  const incrementHours = roundingMinutes / 60;
  const increments = Math.round(rawHours / incrementHours);
  return Math.round(increments * incrementHours * 100) / 100;
}

function startLiveTimer(input) {
  const errors = {};
  if (!input || !input.client_id) {
    errors.client_id = 'Please select a client.';
  }
  if (!String(input.description || '').trim()) {
    errors.description = 'A description of the work you are starting is required.';
  }
  if (input.project_id !== undefined && input.project_id !== null && String(input.project_id).trim() !== '') {
    checkProjectBelongsToClient(input, errors);
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  if (hasRunningTimer()) {
    return { ok: false, running: true, errors: { general: 'A timer is already running. Stop it before starting a new one.' } };
  }

  const now = new Date().toISOString();
  try {
    db.run(
      `INSERT INTO live_timer (id, client_id, project_id, description, started_at, created_at)
       VALUES (1, ?, ?, ?, ?, ?)`,
      [
        Number(input.client_id),
        input.project_id !== undefined && input.project_id !== null && String(input.project_id).trim() !== '' ? Number(input.project_id) : null,
        String(input.description).trim(),
        now,
        now,
      ]
    );
    saveToDisk();
    return { ok: true, timer: getLiveTimer() };
  } catch (err) {
    return { ok: false, errors: { general: `Failed to start timer: ${err.message}` } };
  }
}

function stopLiveTimer() {
  const timer = getLiveTimer();
  if (!timer) {
    return { ok: false, errors: { general: 'No timer is currently running.' } };
  }

  const { roundingMinutes } = getTimerSettings();
  const hours = roundElapsedHours(timer.elapsed_ms, roundingMinutes);
  if (!(hours > 0)) {
    const thresholdMin = roundingMinutes > 0 ? Math.ceil(roundingMinutes / 2) : 1;
    return {
      ok: false,
      tooShort: true,
      errors: {
        general: `The timer ran ${formatElapsedLabel(timer.elapsed_ms)} — less than the ${thresholdMin}-minute rounding threshold. Let it run a little longer, or lower the rounding increment in Settings → Time Tracking.`,
      },
    };
  }

  const entryDate = new Date(Date.parse(timer.started_at));
  const y = entryDate.getFullYear();
  const m = String(entryDate.getMonth() + 1).padStart(2, '0');
  const d = String(entryDate.getDate()).padStart(2, '0');
  const date = y + '-' + m + '-' + d;

  const createRes = createTimeEntry({
    client_id: timer.client_id,
    project_id: timer.project_id || '',
    date,
    description: timer.description,
    hours,
    hourly_rate: '',
  });
  if (!createRes.ok) {
    return { ok: false, errors: createRes.errors || { general: 'Could not create the time entry.' } };
  }

  try {
    db.run('DELETE FROM live_timer WHERE id = 1');
    saveToDisk();
  } catch (err) {
    return { ok: false, errors: { general: `Time entry was created but the timer could not be cleared: ${err.message}` } };
  }

  return {
    ok: true,
    entry: createRes.entry,
    elapsed_ms: timer.elapsed_ms,
    hours,
  };
}

function discardLiveTimer() {
  const timer = getLiveTimer();
  if (!timer) {
    return { ok: false, errors: { general: 'No timer is currently running.' } };
  }
  try {
    db.run('DELETE FROM live_timer WHERE id = 1');
    saveToDisk();
    addAuditEntry({
      entityType: 'timer',
      entityRef: timer.description || 'Timer',
      action: 'discarded',
      description: 'Discarded running timer started ' + new Date(Date.parse(timer.started_at)).toLocaleString() + ' without logging time.',
    });
    return { ok: true, discarded: true };
  } catch (err) {
    return { ok: false, errors: { general: `Failed to discard timer: ${err.message}` } };
  }
}

function formatElapsedLabel(elapsedMs) {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (h > 0) parts.push(h + 'h');
  if (m > 0 || h > 0) parts.push(m + 'm');
  parts.push(s + 's');
  return parts.join(' ');
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

// Validate that a project_id (if provided) exists and belongs to the same client.
function checkProjectBelongsToClient(data, errors) {
  if (!data.project_id) return;
  const project = getProject(data.project_id);
  if (!project) {
    errors.project_id = 'Selected project no longer exists.';
  } else if (data.client_id && Number(project.client_id) !== Number(data.client_id)) {
    errors.project_id = 'Selected project does not belong to the selected client.';
  }
}

function duplicateQuote(id) {
  const source = getQuote(id);
  if (!source) {
    return { ok: false, errors: { general: 'Quote not found.' } };
  }

  const today = new Date().toISOString().slice(0, 10);
  let validUntil = null;
  if (source.valid_until) {
    const d1 = new Date(source.date_created + 'T00:00:00');
    const d2 = new Date(source.valid_until + 'T00:00:00');
    const offsetDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    if (offsetDays > 0) {
      const vd = new Date(today + 'T00:00:00');
      vd.setDate(vd.getDate() + offsetDays);
      validUntil = toDateString(vd);
    }
  }

  const data = {
    client_id: source.client_id,
    contact_id: source.contact_id || null,
    project_id: source.project_id || null,
    date_created: today,
    valid_until: validUntil,
    currency: source.currency,
    exchange_rate: Number(source.exchange_rate) || 1.0,
    discount_type: source.discount_type || 'none',
    discount_value: Number(source.discount_value) || 0,
    discount: Number(source.discount_amount) || 0,
    tax_rate: Number(source.tax_rate) || 0,
    tax: Number(source.tax_amount) || 0,
    subtotal: Number(source.subtotal) || 0,
    total: Number(source.total) || 0,
    notes: source.notes || '',
    terms: source.terms || '',
  };

  const lineItems = (source.line_items || []).map((item) => ({
    description: item.description,
    quantity: Number(item.quantity),
    unit_price: Number(item.unit_price),
    tax_rate: item.tax_rate !== undefined && item.tax_rate !== null ? Number(item.tax_rate) : (Number(source.tax_rate) || 0),
    discount_type: item.discount_type || 'none',
    discount_value: Number(item.discount_value) || 0,
    discount_amount: Number(item.discount_amount) || 0,
    amount: Number(item.amount) || 0,
  }));

  return createQuote(data, lineItems);
}

function createQuote(data, lineItems) {
  const errors = validateQuoteInput(data, lineItems);
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  checkProjectBelongsToClient(data, errors);
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
        quote_number, quote_number_root, version, is_latest, client_id, contact_id, project_id, status, date_created, valid_until,
        subtotal, discount_amount, discount_type, discount_value, tax_rate,
        tax_amount, total, currency, exchange_rate, notes, terms, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quoteNumber,
        quoteNumber,
        1,
        1,
        data.client_id,
        data.contact_id || null,
        data.project_id || null,
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
  const createdQuote = getQuote(createdQuoteId);
  addAuditEntry({
    entityType: 'quote',
    entityRef: createdQuote.quote_number || 'Quote #' + createdQuoteId,
    action: 'created',
    description: 'Created quote ' + (createdQuote.quote_number || '') + ' for $' + (Number(createdQuote.total) || 0).toFixed(2),
  });
  return { ok: true, quote: createdQuote };
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
  checkProjectBelongsToClient(data, errors);
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
          quote_number, quote_number_root, version, is_latest, client_id, contact_id, project_id, status, date_created, valid_until,
          subtotal, discount_amount, discount_type, discount_value, tax_rate,
          tax_amount, total, currency, exchange_rate, notes, terms, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newQuoteNumber,
          root,
          nextVersion,
          1,
          data.client_id,
          data.contact_id !== undefined ? (data.contact_id || null) : existing.contact_id,
          data.project_id !== undefined ? (data.project_id || null) : existing.project_id,
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
        client_id = ?, contact_id = ?, project_id = ?, date_created = ?, valid_until = ?,
        subtotal = ?, discount_amount = ?, discount_type = ?,
        discount_value = ?, tax_rate = ?, tax_amount = ?, total = ?,
        currency = ?, exchange_rate = ?, notes = ?, terms = ?, updated_at = ?
       WHERE id = ?`,
      [
        data.client_id,
        data.contact_id !== undefined ? (data.contact_id || null) : existing.contact_id,
        data.project_id !== undefined ? (data.project_id || null) : existing.project_id,
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
  const updatedQuote = getQuote(id);
  addAuditEntry({
    entityType: 'quote',
    entityRef: updatedQuote.quote_number || 'Quote #' + id,
    action: 'updated',
    description: 'Updated quote ' + (updatedQuote.quote_number || '') + ' to $' + (Number(updatedQuote.total) || 0).toFixed(2),
  });
  return { ok: true, quote: updatedQuote };
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
  quote.project = quote.project_id ? projectSummary(quote.project_id) : null;
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
    q.project = q.project_id ? projectSummary(q.project_id) : null;
    return q;
  });
}

function projectSummary(projectId) {
  const project = getProject(projectId);
  return project
    ? { id: project.id, name: project.name, client_id: project.client_id, status: project.status }
    : null;
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
  if (status === 'draft') {
    fields.push('date_sent = ?');
    params.push(null);
    fields.push('date_accepted = ?');
    params.push(null);
    fields.push('acceptance_method = ?');
    params.push(null);
    fields.push('acceptance_note = ?');
    params.push(null);
    fields.push('accepted_by = ?');
    params.push(null);
  } else if (status === 'sent') {
    fields.push('date_accepted = ?');
    params.push(null);
    fields.push('acceptance_method = ?');
    params.push(null);
    fields.push('acceptance_note = ?');
    params.push(null);
    fields.push('accepted_by = ?');
    params.push(null);
  } else if (status === 'declined') {
    fields.push('date_accepted = ?');
    params.push(null);
    fields.push('acceptance_method = ?');
    params.push(null);
    fields.push('accepted_by = ?');
    params.push(null);
  }
  fields.push('updated_at = ?');
  params.push(now);

  db.run(
    `UPDATE quotes SET status = ?, ${fields.join(', ')} WHERE id = ?`,
    [status, ...params, id]
  );
  saveToDisk();
  const stQuote = getQuote(id);
  addAuditEntry({
    entityType: 'quote',
    entityRef: stQuote.quote_number || 'Quote #' + id,
    action: 'status_changed',
    description: 'Marked quote ' + (stQuote.quote_number || '') + ' as ' + (status.charAt(0).toUpperCase() + status.slice(1)),
  });
  return { ok: true, quote: stQuote };
}

function markQuoteAccepted(id, { method, note, accepted_by, date_accepted, acceptance_instructions } = {}) {
  const existing = getQuote(id);
  if (!existing) {
    return { ok: false, errors: { general: 'Quote not found.' } };
  }
  const now = new Date().toISOString();
  const acceptedDate = date_accepted ? String(date_accepted) : now;
  const accMethod = method || 'email';
  const accNote = note !== undefined ? String(note).trim() : '';
  const accBy = accepted_by !== undefined ? String(accepted_by).trim() : '';

  const fields = [
    'status = ?',
    'date_accepted = ?',
    'acceptance_method = ?',
    'acceptance_note = ?',
    'accepted_by = ?',
    'updated_at = ?',
  ];
  const params = [
    'accepted',
    acceptedDate,
    accMethod,
    accNote,
    accBy,
    now,
  ];

  if (acceptance_instructions !== undefined) {
    fields.push('acceptance_instructions = ?');
    params.push(acceptance_instructions);
  }

  params.push(id);

  db.run(`UPDATE quotes SET ${fields.join(', ')} WHERE id = ?`, params);
  saveToDisk();
  return { ok: true, quote: getQuote(id) };
}

function markQuoteDeclined(id, { note, date_declined } = {}) {
  const existing = getQuote(id);
  if (!existing) {
    return { ok: false, errors: { general: 'Quote not found.' } };
  }
  const now = new Date().toISOString();
  const decNote = note !== undefined ? String(note).trim() : '';

  db.run(
    `UPDATE quotes SET status = 'declined', acceptance_note = ?, updated_at = ? WHERE id = ?`,
    [decNote, now, id]
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
  invoice.project = invoice.project_id ? projectSummary(invoice.project_id) : null;

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

// Creates a standard draft invoice from a set of Unbilled time entries. Each
// distinct hourly rate becomes one grouped line item (quantity = total hours at
// that rate), so each amount is hours x rate. The invoice flows through the
// normal numbering/status pipeline (draft, invoice_type 'standard') like any
// other invoice. The included entries are marked Billed and linked to the new
// invoice in the same transaction, so they cannot be double-billed.
function createInvoiceFromTimeEntries(input) {
  const over = input || {};
  const clientId = Number(over.client_id);
  const projectId =
    over.project_id === undefined || over.project_id === null || over.project_id === ''
      ? null
      : Number(over.project_id);
  const entryIds = (Array.isArray(over.entry_ids) ? over.entry_ids : [])
    .map((id) => Number(id))
    .filter((id) => id > 0);

  if (!Number.isInteger(clientId) || clientId <= 0) {
    return { ok: false, errors: { client_id: 'Please select a client.' } };
  }
  const client = getClient(clientId);
  if (!client) {
    return { ok: false, errors: { client_id: 'Selected client no longer exists.' } };
  }
  if (entryIds.length === 0) {
    return { ok: false, errors: { entry_ids: 'Select at least one Unbilled time entry.' } };
  }

  if (projectId !== null) {
    if (!Number.isInteger(projectId) || projectId <= 0) {
      return { ok: false, errors: { project_id: 'Selected project no longer exists.' } };
    }
    const project = getProject(projectId);
    if (!project) {
      return { ok: false, errors: { project_id: 'Selected project no longer exists.' } };
    }
    if (Number(project.client_id) !== clientId) {
      return { ok: false, errors: { project_id: 'Selected project does not belong to the client.' } };
    }
  }

  // Load the exact rows for the requested ids and re-validate scope/billing
  // (defense in depth: the renderer selection is just a convenience).
  const placeholders = entryIds.map(() => '?').join(', ');
  const selected = rowsToArray(db.exec(`SELECT * FROM time_entries WHERE id IN (${placeholders})`, entryIds));
  const byId = new Map(selected.map((r) => [Number(r.id), r]));

  const missing = entryIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    return { ok: false, errors: { entry_ids: 'One or more selected time entries no longer exist.' } };
  }

  if (selected.some((e) => Number(e.client_id) !== clientId)) {
    return { ok: false, errors: { client_id: 'All selected time entries must belong to the same client.' } };
  }
  if (projectId !== null && selected.some((e) => e.project_id == null || Number(e.project_id) !== projectId)) {
    return { ok: false, errors: { project_id: 'All selected time entries must belong to the selected project.' } };
  }
  if (selected.some((e) => Number(e.billed) === 1 || (e.invoice_id != null && Number(e.invoice_id) > 0))) {
    return { ok: false, errors: { general: 'One or more selected time entries are already Billed.' } };
  }

  const profile = getCompanyProfile();
  const taxRate = Math.max(0, Number((profile && profile.default_tax_rate) || 0));

  // Group by hourly rate: one summarized line per distinct rate.
  const rateGroups = new Map();
  for (const e of selected) {
    const rate = Number(e.hourly_rate) || 0;
    if (!rateGroups.has(rate)) rateGroups.set(rate, { hours: 0, count: 0 });
    const g = rateGroups.get(rate);
    g.hours = Math.round((g.hours + (Number(e.hours) || 0)) * 1000000) / 1000000;
    g.count += 1;
  }

  const lineItems = [];
  const rateOrder = [...rateGroups.keys()];
  for (const rate of rateOrder) {
    const g = rateGroups.get(rate);
    const qty = Math.round(g.hours * 100) / 100;
    const unitTally = Math.round(qty * rate * 100) / 100;
    const taxTally = Math.round(unitTally * (taxRate / 100) * 100) / 100;
    lineItems.push({
      description: `Billable time (${g.count} ${g.count === 1 ? 'entry' : 'entries'}) — ${qty.toFixed(2)} h @ ${rate.toFixed(2)}`,
      quantity: qty,
      unit_price: rate,
      line_subtotal: unitTally,
      line_tax: taxTally,
      amount: Math.round((unitTally + taxTally) * 100) / 100,
    });
  }

  const subtotal = Math.round(lineItems.reduce((s, l) => s + l.line_subtotal, 0) * 100) / 100;
  const taxAmount = Math.round(lineItems.reduce((s, l) => s + l.line_tax, 0) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  // Due date: overrides > payment terms > +14 days (same as convertQuoteToInvoice).
  const today = toDateString(new Date());
  let dueDate;
  if (over.date_due && !isValidDateString(over.date_due)) {
    return { ok: false, errors: { date_due: 'Due date must be a valid date.' } };
  }
  if (over.date_due && over.date_due < today) {
    return { ok: false, errors: { date_due: 'Due date cannot be before today.' } };
  }
  if (over.date_due) {
    dueDate = over.date_due;
  } else {
    const termsSource = over.terms !== undefined ? over.terms : (profile && profile.default_terms) || '';
    const days = parsePaymentTermsDays(termsSource);
    const due = new Date(today + 'T00:00:00');
    due.setDate(due.getDate() + (days === null ? 14 : days));
    dueDate = toDateString(due);
  }

  const dateCreated = over.date_created && isValidDateString(over.date_created) ? over.date_created : today;
  const currency = (profile && profile.default_currency) || 'USD';
  const invoiceNumber = nextInvoiceNumber();
  const now = new Date().toISOString();
  let invoiceId = null;

  db.run('BEGIN');
  try {
    db.run(
      `INSERT INTO invoices (
        invoice_number, quote_id, client_id, contact_id, project_id, status, date_created, date_sent, date_due,
        subtotal, tax_amount, discount_amount, total, amount_paid, balance_due,
        currency, exchange_rate, notes, terms,
        invoice_type, deposit_percent, deposit_amount, original_quote_total, deposit_invoice_id, is_final_generated,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        null,
        clientId,
        null,
        projectId,
        'draft',
        dateCreated,
        null,
        dueDate,
        subtotal,
        taxAmount,
        0,
        total,
        0,
        total,
        currency,
        1.0,
        '',
        over.terms !== undefined ? String(over.terms) : ((profile && profile.default_terms) || ''),
        'standard',
        null,
        null,
        null,
        null,
        0,
        now,
        now,
      ]
    );
    const idRes = db.exec('SELECT last_insert_rowid() AS id');
    invoiceId = idRes[0].values[0][0];

    lineItems.forEach((item, idx) => {
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
          taxRate,
          'none',
          0,
          0,
          0,
          item.amount,
          idx,
        ]
      );
    });

    const scopedPlaceholders = selected.map(() => '?').join(', ');
    db.run(
      `UPDATE time_entries SET billed = 1, invoice_id = ?, updated_at = ? WHERE id IN (${scopedPlaceholders}) AND billed = 0`,
      [invoiceId, now, ...selected.map((e) => Number(e.id))]
    );
    const updated = db.getRowsModified();
    if (updated !== selected.length) {
      throw new Error('A selected time entry could not be marked as Billed — it may already be on another invoice.');
    }

    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    return { ok: false, errors: { general: `Failed to create invoice: ${err.message}` } };
  }

  saveToDisk();
  const created = getInvoice(invoiceId);
  addAuditEntry({
    entityType: 'invoice',
    entityRef: created.invoice_number || 'Invoice #' + invoiceId,
    action: 'created',
    description:
      'Created invoice ' +
      (created.invoice_number || '') +
      ' from ' +
      selected.length +
      ' billed time entr' +
      (selected.length === 1 ? 'y' : 'ies') +
      ' for ' +
      (Number(created.total) || 0).toFixed(2) +
      ' ' +
      (created.currency || ''),
  });
  return { ok: true, invoice: created, billedCount: selected.length };
}

// Reverts every time entry linked to an invoice back to Unbilled (clearing the
// invoice link). Today invoices cannot be deleted, so nothing calls this in the
// app — it exists so a future void/delete path can safely restore entries
// instead of leaving them Billed-but-broken or double-billable.
function unbillTimeEntriesForInvoice(invoiceId) {
  const id = Number(invoiceId);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, errors: { general: 'Invoice not found.' } };
  }
  db.run(
    `UPDATE time_entries SET billed = 0, invoice_id = NULL, updated_at = ? WHERE invoice_id = ?`,
    [new Date().toISOString(), id]
  );
  const count = db.getRowsModified();
  saveToDisk();
  return { ok: true, count };
}

function duplicateInvoice(id) {
  const source = getInvoice(id);
  if (!source) {
    return { ok: false, errors: { general: 'Invoice not found.' } };
  }
  const today = toDateString(new Date());
  let days = parsePaymentTermsDays(source.terms);
  if (days === null && source.date_created && source.date_due) {
    const d1 = new Date(source.date_created + 'T00:00:00');
    const d2 = new Date(source.date_due + 'T00:00:00');
    const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    if (diffDays > 0) days = diffDays;
  }
  if (days === null || days <= 0) days = 14;

  const issueD = new Date(today + 'T00:00:00');
  const dueD = new Date(issueD);
  dueD.setDate(dueD.getDate() + days);
  const dueDate = toDateString(dueD);

  const invoiceNumber = nextInvoiceNumber();
  const now = new Date().toISOString();
  let newInvoiceId = null;

  db.run('BEGIN');
  try {
    db.run(
      `INSERT INTO invoices (
         invoice_number, quote_id, client_id, contact_id, project_id, status,
         date_created, date_due, date_sent,
         subtotal, tax_amount, discount_amount, total, amount_paid, balance_due,
         currency, exchange_rate,
         notes, terms,
         invoice_type, deposit_percent, deposit_amount, original_quote_total, deposit_invoice_id, is_final_generated,
         recurring_profile_id, is_recurring, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        null,
        source.client_id,
        source.contact_id || null,
        source.project_id || null,
        'draft',
        today,
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
        'standard',
        null,
        null,
        null,
        null,
        0,
        null,
        0,
        now,
        now,
      ]
    );
    const idRes = db.exec('SELECT last_insert_rowid() AS id');
    newInvoiceId = idRes[0].values[0][0];

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
          Number(item.discount_percent) || 0,
          Number(item.amount) || 0,
          idx,
        ]
      );
    });

    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    return { ok: false, errors: { general: `Failed to duplicate invoice: ${err.message}` } };
  }

  saveToDisk();
  const invoice = getInvoice(newInvoiceId);
  addAuditEntry({
    entityType: 'invoice',
    entityRef: invoice.invoice_number,
    action: 'created',
    description: 'Duplicated invoice ' + invoice.invoice_number + ' for $' + (Number(invoice.total) || 0).toFixed(2),
  });
  return { ok: true, invoice };
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

  // Project linkage: default to the quote's project; caller may override or clear.
  let projectId = quote.project_id || null;
  if (over.project_id !== undefined && over.project_id !== '') {
    const overrideId = over.project_id === null || over.project_id === 0 ? null : Number(over.project_id);
    if (overrideId === null) {
      projectId = null;
    } else if (!Number.isInteger(overrideId) || overrideId <= 0) {
      return { ok: false, errors: { project_id: 'Selected project no longer exists.' } };
    } else {
      const proj = getProject(overrideId);
      if (!proj) {
        return { ok: false, errors: { project_id: 'Selected project no longer exists.' } };
      }
      if (Number(proj.client_id) !== Number(quote.client_id)) {
        return { ok: false, errors: { project_id: 'Selected project does not belong to the quote’s client.' } };
      }
      projectId = overrideId;
    }
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
          invoice_number, quote_id, client_id, contact_id, project_id, status, date_created, date_sent, date_due,
          subtotal, tax_amount, discount_amount, total, amount_paid, balance_due,
          currency, exchange_rate, notes, terms,
          invoice_type, deposit_percent, deposit_amount, original_quote_total, deposit_invoice_id, is_final_generated,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceNumber,
          quoteId,
          quote.client_id,
          quote.contact_id || null,
          projectId,
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
    const depInv = getInvoice(invoiceId);
    addAuditEntry({
      entityType: 'invoice',
      entityRef: depInv.invoice_number || 'Invoice #' + invoiceId,
      action: 'created',
      description: 'Created deposit invoice ' + (depInv.invoice_number || '') + ' for ' + (Number(depInv.total) || 0).toFixed(2) + ' ' + (depInv.currency || ''),
    });
    return { ok: true, alreadyConverted: false, invoice: depInv };
  }

  // Full invoice conversion
  db.run('BEGIN');
  try {
    db.run(
      `INSERT INTO invoices (
        invoice_number, quote_id, client_id, contact_id, project_id, status, date_created, date_sent, date_due,
        subtotal, tax_amount, discount_amount, total, amount_paid, balance_due,
        currency, exchange_rate, notes, terms,
        invoice_type, deposit_percent, deposit_amount, original_quote_total, deposit_invoice_id, is_final_generated,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        quoteId,
        quote.client_id,
        quote.contact_id || null,
        projectId,
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
  const fullInv = getInvoice(invoiceId);
  addAuditEntry({
    entityType: 'invoice',
    entityRef: fullInv.invoice_number || 'Invoice #' + invoiceId,
    action: 'created',
    description: 'Created invoice ' + (fullInv.invoice_number || '') + ' for ' + (Number(fullInv.total) || 0).toFixed(2) + ' ' + (fullInv.currency || ''),
  });
  return { ok: true, alreadyConverted: false, invoice: fullInv };
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
        invoice_number, quote_id, client_id, contact_id, project_id, status, date_created, date_sent, date_due,
        subtotal, tax_amount, discount_amount, total, amount_paid, balance_due,
        currency, exchange_rate, notes, terms,
        invoice_type, deposit_percent, deposit_amount, original_quote_total, deposit_invoice_id, is_final_generated,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        quote.id,
        quote.client_id,
        quote.contact_id || null,
        quote.project_id || depositInv.project_id || null,
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
        0,              // unit_price = 0 to satisfy CHECK (unit_price >= 0); negative value carried in amount
        0,
        'none',
        0,
        0,
        0,
        -depositPaid,  // amount = negative deposit to deduct from final total
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
  const finInv = getInvoice(finalInvoiceId);
  addAuditEntry({
    entityType: 'invoice',
    entityRef: finInv.invoice_number || 'Invoice #' + finalInvoiceId,
    action: 'created',
    description: 'Created final invoice ' + (finInv.invoice_number || '') + ' for ' + (Number(finInv.total) || 0).toFixed(2) + ' ' + (finInv.currency || ''),
  });
  return { ok: true, alreadyGenerated: false, invoice: finInv };
}

function listInvoices() {
  const invoices = rowsToArray(
    db.exec(`SELECT * FROM invoices ORDER BY created_at DESC, id DESC`)
  );
  return invoices.map((inv) => {
    refreshInvoiceBalance(inv);
    const client = getClient(inv.client_id);
    inv.client = client ? { id: client.id, name: client.name, company_name: client.company_name } : null;
    inv.project = inv.project_id ? projectSummary(inv.project_id) : null;
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
  const stInv = getInvoice(id);
  addAuditEntry({
    entityType: 'invoice',
    entityRef: stInv.invoice_number || 'Invoice #' + id,
    action: 'status_changed',
    description: 'Marked invoice ' + (stInv.invoice_number || '') + ' as ' + (status.charAt(0).toUpperCase() + status.slice(1)),
  });
  return { ok: true, invoice: stInv };
}

function markInvoicesSent(ids) {
  const unique = Array.from(new Set((ids || []).filter((id) => Number(id) > 0).map(Number)));
  let marked = 0;
  const skipped = [];
  for (const id of unique) {
    const existing = rowToObject(db.exec('SELECT id, status FROM invoices WHERE id = ?', [id]));
    if (!existing || existing.status !== 'draft') {
      skipped.push(id);
      continue;
    }
    const res = setInvoiceStatus(id, 'sent');
    if (res.ok) {
      marked++;
    } else {
      skipped.push(id);
    }
  }
  return { ok: true, marked, skipped };
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
  const payInv = getInvoice(invoiceId);
  addAuditEntry({
    entityType: 'payment',
    entityRef: payInv.invoice_number || 'Invoice #' + invoiceId,
    action: 'payment_recorded',
    description: 'Recorded payment of ' + amount.toFixed(2) + ' ' + (payInv.currency || '') + ' on invoice ' + (payInv.invoice_number || '') + (method ? ' via ' + method : ''),
  });
  return { ok: true, invoice: payInv };
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

// ---------- Revenue Reports by Period ----------

function getRevenueReport(filter = {}) {
  const { startDate, endDate, period = 'month' } = filter;
  const activePeriod = ['week', 'month', 'quarter', 'year'].includes(period) ? period : 'month';

  const profile = getCompanyProfile();
  const baseCurrency = (profile && (profile.reporting_currency || profile.default_currency)) || 'USD';

  // Discover date bounds if missing
  let sDate = startDate ? startDate.trim() : '';
  let eDate = endDate ? endDate.trim() : '';

  if (!sDate || !eDate) {
    const minInvRes = db.exec(`SELECT MIN(date_created) FROM invoices`);
    const minPayRes = db.exec(`SELECT MIN(payment_date) FROM payments`);
    const maxInvRes = db.exec(`SELECT MAX(date_created) FROM invoices`);
    const maxPayRes = db.exec(`SELECT MAX(payment_date) FROM payments`);

    const allMins = [
      minInvRes[0]?.values[0]?.[0],
      minPayRes[0]?.values[0]?.[0],
    ].filter(Boolean);

    const allMaxs = [
      maxInvRes[0]?.values[0]?.[0],
      maxPayRes[0]?.values[0]?.[0],
    ].filter(Boolean);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const startOfYear = `${now.getFullYear()}-01-01`;

    if (!sDate) {
      if (allMins.length) {
        allMins.sort();
        sDate = allMins[0] < startOfYear ? allMins[0] : startOfYear;
      } else {
        sDate = startOfYear;
      }
    }

    if (!eDate) {
      if (allMaxs.length) {
        allMaxs.sort();
        const latest = allMaxs[allMaxs.length - 1];
        eDate = latest > todayStr ? latest : todayStr;
      } else {
        eDate = todayStr;
      }
    }
  }

  if (sDate > eDate) {
    const temp = sDate;
    sDate = eDate;
    eDate = temp;
  }

  // Date helpers
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function getMondayOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return date;
  }

  function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function toISODateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getPeriodKeyForDate(dateStr) {
    if (activePeriod === 'year') {
      return dateStr.slice(0, 4);
    }
    if (activePeriod === 'quarter') {
      const y = dateStr.slice(0, 4);
      const m = Number(dateStr.slice(5, 7));
      const q = Math.ceil(m / 3);
      return `${y}-Q${q}`;
    }
    if (activePeriod === 'week') {
      const d = new Date(dateStr + 'T00:00:00');
      const mon = getMondayOfWeek(d);
      const wn = getWeekNumber(mon);
      return `${mon.getFullYear()}-W${String(wn).padStart(2, '0')}`;
    }
    return dateStr.slice(0, 7);
  }

  // Generate continuous list of period buckets
  const periodBuckets = [];
  const periodBucketMap = new Map();

  if (activePeriod === 'year') {
    const startY = Number(sDate.slice(0, 4));
    const endY = Number(eDate.slice(0, 4));
    for (let y = startY; y <= endY; y++) {
      const key = String(y);
      const bucket = {
        key,
        label: key,
        startDate: `${y}-01-01`,
        endDate: `${y}-12-31`,
        invoiced: 0,
        invoicedCount: 0,
        collected: 0,
        collectedCount: 0,
      };
      periodBuckets.push(bucket);
      periodBucketMap.set(key, bucket);
    }
  } else if (activePeriod === 'quarter') {
    const startY = Number(sDate.slice(0, 4));
    const startQ = Math.ceil(Number(sDate.slice(5, 7)) / 3);
    const endY = Number(eDate.slice(0, 4));
    const endQ = Math.ceil(Number(eDate.slice(5, 7)) / 3);

    let curY = startY;
    let curQ = startQ;
    while (curY < endY || (curY === endY && curQ <= endQ)) {
      const key = `${curY}-Q${curQ}`;
      const qStartMonth = (curQ - 1) * 3 + 1;
      const qEndMonth = curQ * 3;
      const qEndDay = new Date(curY, qEndMonth, 0).getDate();
      const qMonthsLabel = `${monthNames[qStartMonth - 1]} – ${monthNames[qEndMonth - 1]}`;

      const bucket = {
        key,
        label: `Q${curQ} ${curY} (${qMonthsLabel})`,
        startDate: `${curY}-${String(qStartMonth).padStart(2, '0')}-01`,
        endDate: `${curY}-${String(qEndMonth).padStart(2, '0')}-${String(qEndDay).padStart(2, '0')}`,
        invoiced: 0,
        invoicedCount: 0,
        collected: 0,
        collectedCount: 0,
      };
      periodBuckets.push(bucket);
      periodBucketMap.set(key, bucket);

      curQ++;
      if (curQ > 4) {
        curQ = 1;
        curY++;
      }
    }
  } else if (activePeriod === 'week') {
    const startD = new Date(sDate + 'T00:00:00');
    const endD = new Date(eDate + 'T00:00:00');
    let curMon = getMondayOfWeek(startD);

    while (curMon <= endD || (curMon.getTime() - endD.getTime() < 7 * 86400000 && toISODateStr(curMon) <= eDate)) {
      const sun = new Date(curMon);
      sun.setDate(curMon.getDate() + 6);
      const wn = getWeekNumber(curMon);
      const key = `${curMon.getFullYear()}-W${String(wn).padStart(2, '0')}`;
      const monStr = toISODateStr(curMon);
      const sunStr = toISODateStr(sun);

      const monLabel = `${monthNames[curMon.getMonth()]} ${curMon.getDate()}`;
      const sunLabel = `${monthNames[sun.getMonth()]} ${sun.getDate()}, ${sun.getFullYear()}`;

      const bucket = {
        key,
        label: `W${wn} (${monLabel} – ${sunLabel})`,
        startDate: monStr,
        endDate: sunStr,
        invoiced: 0,
        invoicedCount: 0,
        collected: 0,
        collectedCount: 0,
      };
      periodBuckets.push(bucket);
      periodBucketMap.set(key, bucket);

      curMon = new Date(curMon);
      curMon.setDate(curMon.getDate() + 7);
      if (periodBuckets.length > 520) break; // safety guard
    }
  } else {
    // Default 'month'
    const [startY, startM] = sDate.slice(0, 7).split('-').map(Number);
    const [endY, endM] = eDate.slice(0, 7).split('-').map(Number);

    let curY = startY;
    let curM = startM;
    while (curY < endY || (curY === endY && curM <= endM)) {
      const key = `${curY}-${String(curM).padStart(2, '0')}`;
      const lastDay = new Date(curY, curM, 0).getDate();
      const bucket = {
        key,
        label: `${monthNames[curM - 1]} ${curY}`,
        startDate: `${key}-01`,
        endDate: `${key}-${String(lastDay).padStart(2, '0')}`,
        invoiced: 0,
        invoicedCount: 0,
        collected: 0,
        collectedCount: 0,
      };
      periodBuckets.push(bucket);
      periodBucketMap.set(key, bucket);

      curM++;
      if (curM > 12) {
        curM = 1;
        curY++;
      }
    }
  }

  // 1. Fetch Invoices in date range
  const invSql = `
    SELECT 
      id,
      invoice_number,
      date_created,
      total,
      currency,
      exchange_rate
    FROM invoices
    WHERE date_created >= ? AND date_created <= ?
    ORDER BY date_created ASC
  `;
  const invRows = rowsToArray(db.exec(invSql, [sDate, eDate]));
  let hasForeignCurrency = false;

  for (const inv of invRows) {
    const rate = Number(inv.exchange_rate) || 1.0;
    if ((inv.currency && inv.currency !== baseCurrency) || rate !== 1.0) {
      hasForeignCurrency = true;
    }
    const invBaseAmount = Math.round((Number(inv.total) || 0) * rate * 100) / 100;
    const pKey = getPeriodKeyForDate(inv.date_created);

    let bucket = periodBucketMap.get(pKey);
    if (!bucket) {
      bucket = {
        key: pKey,
        label: pKey,
        startDate: inv.date_created,
        endDate: inv.date_created,
        invoiced: 0,
        invoicedCount: 0,
        collected: 0,
        collectedCount: 0,
      };
      periodBuckets.push(bucket);
      periodBucketMap.set(pKey, bucket);
    }
    bucket.invoiced = Math.round((bucket.invoiced + invBaseAmount) * 100) / 100;
    bucket.invoicedCount += 1;
  }

  // 2. Fetch Payments in date range
  const paySql = `
    SELECT 
      p.id,
      p.invoice_id,
      p.payment_date,
      p.amount,
      i.currency,
      i.exchange_rate
    FROM payments p
    JOIN invoices i ON p.invoice_id = i.id
    WHERE p.payment_date >= ? AND p.payment_date <= ?
    ORDER BY p.payment_date ASC
  `;
  const payRows = rowsToArray(db.exec(paySql, [sDate, eDate]));

  for (const pay of payRows) {
    const rate = Number(pay.exchange_rate) || 1.0;
    if ((pay.currency && pay.currency !== baseCurrency) || rate !== 1.0) {
      hasForeignCurrency = true;
    }
    const payBaseAmount = Math.round((Number(pay.amount) || 0) * rate * 100) / 100;
    const pKey = getPeriodKeyForDate(pay.payment_date);

    let bucket = periodBucketMap.get(pKey);
    if (!bucket) {
      bucket = {
        key: pKey,
        label: pKey,
        startDate: pay.payment_date,
        endDate: pay.payment_date,
        invoiced: 0,
        invoicedCount: 0,
        collected: 0,
        collectedCount: 0,
      };
      periodBuckets.push(bucket);
      periodBucketMap.set(pKey, bucket);
    }
    bucket.collected = Math.round((bucket.collected + payBaseAmount) * 100) / 100;
    bucket.collectedCount += 1;
  }

  // Sort period buckets chronologically
  periodBuckets.sort((a, b) => a.key.localeCompare(b.key));

  let grandInvoiced = 0;
  let grandCollected = 0;
  let grandInvoicesCount = 0;
  let grandPaymentsCount = 0;

  for (const b of periodBuckets) {
    b.invoiced = Math.round(b.invoiced * 100) / 100;
    b.collected = Math.round(b.collected * 100) / 100;
    b.uncollected = Math.max(0, Math.round((b.invoiced - b.collected) * 100) / 100);
    b.collectionRate = b.invoiced > 0
      ? Math.round((b.collected / b.invoiced) * 1000) / 10
      : (b.collected > 0 ? 100 : 0);

    grandInvoiced += b.invoiced;
    grandCollected += b.collected;
    grandInvoicesCount += b.invoicedCount;
    grandPaymentsCount += b.collectedCount;
  }

  grandInvoiced = Math.round(grandInvoiced * 100) / 100;
  grandCollected = Math.round(grandCollected * 100) / 100;
  const uncollectedBalance = Math.max(0, Math.round((grandInvoiced - grandCollected) * 100) / 100);
  const overallCollectionRate = grandInvoiced > 0
    ? Math.round((grandCollected / grandInvoiced) * 1000) / 10
    : (grandCollected > 0 ? 100 : 0);

  return {
    period: activePeriod,
    startDate: sDate,
    endDate: eDate,
    baseCurrency,
    totalInvoiced: grandInvoiced,
    totalCollected: grandCollected,
    uncollectedBalance,
    overallCollectionRate,
    invoicesCount: grandInvoicesCount,
    paymentsCount: grandPaymentsCount,
    hasForeignCurrency,
    periods: periodBuckets,
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
  const creditInv = getInvoice(invoiceId);
  addAuditEntry({
    entityType: 'credit_note',
    entityRef: creditNoteNumber || 'Credit note',
    action: 'credit_note_issued',
    description: 'Issued credit note ' + (creditNoteNumber || '') + ' for ' + amount.toFixed(2) + ' ' + (creditInv.currency || '') + ' on invoice ' + (creditInv.invoice_number || '') + (reason ? ' (' + reason + ')' : ''),
  });
  return { ok: true, credit_note: creditNote, invoice: creditInv };
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
         invoice_number, quote_id, client_id, contact_id, project_id, status,
         date_created, date_due, date_sent,
         subtotal, tax_amount, discount_amount, total, amount_paid, balance_due,
         currency, exchange_rate,
         notes, terms, recurring_profile_id, is_recurring, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        null,
        source.client_id,
        source.contact_id || null,
        source.project_id || null,
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

// ─── Revenue Report ──────────────────────────────────────────────────────────

function getRevenueReport({ startDate, endDate, period = 'month' } = {}) {
  // Resolve base reporting currency
  const profileRes = db.exec(`SELECT reporting_currency, default_currency FROM company_profile WHERE id = 1`);
  let reportingCurrency = 'USD';
  if (profileRes.length && profileRes[0].values.length) {
    const [rc, dc] = profileRes[0].values[0];
    reportingCurrency = rc || dc || 'USD';
  }

  // Determine date bounds if not supplied
  if (!startDate || !endDate) {
    const boundsRes = db.exec(`
      SELECT
        MIN(i.date_created) AS minInvoice,
        MAX(i.date_created) AS maxInvoice,
        MIN(p.payment_date) AS minPay,
        MAX(p.payment_date) AS maxPay
      FROM invoices i
      LEFT JOIN payments p ON p.invoice_id = i.id
    `);
    let minDate = null;
    let maxDate = null;
    if (boundsRes.length && boundsRes[0].values.length) {
      const [minInv, maxInv, minP, maxP] = boundsRes[0].values[0];
      const dates = [minInv, maxInv, minP, maxP].filter(Boolean);
      if (dates.length) {
        minDate = dates.reduce((a, b) => (a < b ? a : b));
        maxDate = dates.reduce((a, b) => (a > b ? a : b));
      }
    }
    if (!minDate) {
      // No data — default to current year
      const y = new Date().getFullYear();
      startDate = startDate || `${y}-01-01`;
      endDate = endDate || `${y}-12-31`;
    } else {
      startDate = startDate || minDate.slice(0, 10);
      endDate = endDate || maxDate.slice(0, 10);
    }
  }

  // Query invoiced amounts (grouped by period of invoice creation)
  const invoiceRows = db.exec(`
    SELECT
      date_created,
      total,
      COALESCE(exchange_rate, 1.0) AS rate
    FROM invoices
    WHERE date_created >= ? AND date_created <= ?
      AND status NOT IN ('draft')
  `, [startDate, endDate + 'T23:59:59']);

  // Query collected payments (joined to invoices for exchange rate)
  const paymentRows = db.exec(`
    SELECT
      p.payment_date,
      p.amount,
      COALESCE(i.exchange_rate, 1.0) AS rate
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
    WHERE p.payment_date >= ? AND p.payment_date <= ?
  `, [startDate, endDate + 'T23:59:59']);

  // Helper: format date into period bucket key
  function dateToBucket(dateStr) {
    const d = new Date(dateStr);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth(); // 0-based
    const day = d.getUTCDate();
    if (period === 'week') {
      // ISO week: Monday-anchored
      const tmp = new Date(Date.UTC(y, m, day));
      const dow = tmp.getUTCDay() || 7; // Mon=1..Sun=7
      tmp.setUTCDate(tmp.getUTCDate() - (dow - 1));
      const wy = tmp.getUTCFullYear();
      const wm = tmp.getUTCMonth();
      const wd = tmp.getUTCDate();
      return `${wy}-W${String(wm + 1).padStart(2, '0')}-${String(wd).padStart(2, '0')}`;
    } else if (period === 'month') {
      return `${y}-${String(m + 1).padStart(2, '0')}`;
    } else if (period === 'quarter') {
      const q = Math.floor(m / 3) + 1;
      return `${y}-Q${q}`;
    } else { // year
      return `${y}`;
    }
  }

  // Generate all buckets between startDate and endDate so gaps show zero
  function generateBuckets(start, end) {
    const buckets = [];
    const seen = new Set();
    const startD = new Date(start + 'T00:00:00Z');
    const endD = new Date(end + 'T23:59:59Z');

    let cur;
    if (period === 'week') {
      cur = new Date(startD);
      const dow = cur.getUTCDay() || 7;
      cur.setUTCDate(cur.getUTCDate() - (dow - 1));
    } else if (period === 'month') {
      cur = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth(), 1));
    } else if (period === 'quarter') {
      const qM = Math.floor(startD.getUTCMonth() / 3) * 3;
      cur = new Date(Date.UTC(startD.getUTCFullYear(), qM, 1));
    } else {
      cur = new Date(Date.UTC(startD.getUTCFullYear(), 0, 1));
    }

    const endKey = dateToBucket(endD.toISOString());
    while (cur <= endD || (!seen.has(endKey) && cur.getTime() <= endD.getTime() + 90 * 86400000)) {
      const key = dateToBucket(cur.toISOString());
      if (!seen.has(key)) {
        seen.add(key);
        buckets.push(key);
      }
      if (key === endKey) break;

      // Advance by period
      if (period === 'week') {
        cur.setUTCDate(cur.getUTCDate() + 7);
      } else if (period === 'month') {
        cur.setUTCMonth(cur.getUTCMonth() + 1);
      } else if (period === 'quarter') {
        cur.setUTCMonth(cur.getUTCMonth() + 3);
      } else {
        cur.setUTCFullYear(cur.getUTCFullYear() + 1);
      }
    }

    // Safety: include any keys that exist in invMap or payMap
    for (const k of [...Object.keys(invMap), ...Object.keys(payMap)]) {
      if (!seen.has(k)) {
        seen.add(k);
        buckets.push(k);
      }
    }

    buckets.sort();
    return buckets;
  }

  // Human-readable label for a bucket key
  function bucketLabel(key) {
    if (period === 'week') {
      // key = YYYY-WMM-DD → Monday date
      const parts = key.split('-');
      const y = parseInt(parts[0], 10);
      const mo = parseInt(parts[1].slice(1), 10) - 1;
      const d = parseInt(parts[2], 10);
      const monday = new Date(Date.UTC(y, mo, d));
      const sunday = new Date(Date.UTC(y, mo, d + 6));
      const fmt = (dt) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      return `${fmt(monday)} – ${fmt(sunday)}`;
    } else if (period === 'month') {
      const [y, mo] = key.split('-');
      const d = new Date(Date.UTC(parseInt(y), parseInt(mo) - 1, 1));
      return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    } else if (period === 'quarter') {
      const [y, q] = key.split('-');
      const qNum = parseInt(q.slice(1), 10);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const startM = (qNum - 1) * 3;
      return `${q} ${y} (${monthNames[startM]}–${monthNames[startM + 2]})`;
    } else {
      return key;
    }
  }

  // Aggregate invoice data per bucket
  const invMap = {};
  const invCountMap = {};
  let hasForeignCurrency = false;
  if (invoiceRows.length && invoiceRows[0].values.length) {
    const cols = invoiceRows[0].columns;
    invoiceRows[0].values.forEach(row => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      const bucket = dateToBucket(obj.date_created);
      const normalized = (obj.total || 0) * (obj.rate !== 1.0 ? obj.rate : 1);
      if (obj.rate !== 1.0) hasForeignCurrency = true;
      invMap[bucket] = (invMap[bucket] || 0) + normalized;
      invCountMap[bucket] = (invCountMap[bucket] || 0) + 1;
    });
  }

  // Aggregate payment data per bucket
  const payMap = {};
  const payCountMap = {};
  if (paymentRows.length && paymentRows[0].values.length) {
    const cols = paymentRows[0].columns;
    paymentRows[0].values.forEach(row => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      const bucket = dateToBucket(obj.payment_date);
      const normalized = (obj.amount || 0) * (obj.rate !== 1.0 ? obj.rate : 1);
      if (obj.rate !== 1.0) hasForeignCurrency = true;
      payMap[bucket] = (payMap[bucket] || 0) + normalized;
      payCountMap[bucket] = (payCountMap[bucket] || 0) + 1;
    });
  }

  const bucketKeys = generateBuckets(startDate, endDate);
  let totalInvoiced = 0;
  let totalCollected = 0;
  let totalInvoiceCount = 0;
  let totalPaymentCount = 0;

  const buckets = bucketKeys.map(key => {
    const invoiced = invMap[key] || 0;
    const collected = payMap[key] || 0;
    const invCount = invCountMap[key] || 0;
    const payCount = payCountMap[key] || 0;
    totalInvoiced += invoiced;
    totalCollected += collected;
    totalInvoiceCount += invCount;
    totalPaymentCount += payCount;
    return {
      key,
      label: bucketLabel(key),
      invoiced,
      collected,
      invoiceCount: invCount,
      paymentCount: payCount,
      difference: invoiced - collected,
      collectionRate: invoiced > 0 ? (collected / invoiced) * 100 : null,
    };
  });

  return {
    period,
    startDate,
    endDate,
    reportingCurrency,
    hasForeignCurrency,
    buckets,
    summary: {
      totalInvoiced,
      totalCollected,
      uncollected: totalInvoiced - totalCollected,
      collectionRate: totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : null,
      invoiceCount: totalInvoiceCount,
      paymentCount: totalPaymentCount,
    },
  };
}

// ─── Client Profitability Report ─────────────────────────────────────────────

function getClientProfitabilityReport({ startDate, endDate, sort = 'collected_desc', includeInactive = false } = {}) {
  function execRows(sql, params = []) {
    const res = db.exec(sql, params);
    if (!res.length || !res[0].values.length) return [];
    const cols = res[0].columns;
    return res[0].values.map(row => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      return obj;
    });
  }

  // Resolve base reporting currency
  const profileRes = db.exec(`SELECT reporting_currency, default_currency FROM company_profile WHERE id = 1`);
  let reportingCurrency = 'USD';
  if (profileRes.length && profileRes[0].values.length) {
    const [rc, dc] = profileRes[0].values[0];
    reportingCurrency = rc || dc || 'USD';
  }

  // Handle date bounds
  let startBound = null;
  let endBound = null;
  if (startDate && endDate) {
    startBound = startDate.length === 10 ? startDate : startDate.slice(0, 10);
    endBound = endDate.length === 10 ? endDate + 'T23:59:59.999Z' : endDate;
  }

  // Query all clients
  const clients = execRows(`
    SELECT id, name, company_name, email, phone, created_at
    FROM clients
    ORDER BY name COLLATE NOCASE ASC
  `);

  // Query non-draft invoices in date range
  let invSql = `
    SELECT
      id,
      client_id,
      invoice_number,
      date_created,
      total,
      currency,
      COALESCE(exchange_rate, 1.0) AS rate
    FROM invoices
    WHERE status NOT IN ('draft')
  `;
  const invParams = [];
  if (startBound && endBound) {
    invSql += ` AND date_created >= ? AND date_created <= ?`;
    invParams.push(startBound, endBound);
  }
  const invoiceRows = execRows(invSql, invParams);

  // Query payments in date range
  let paySql = `
    SELECT
      p.id,
      p.invoice_id,
      p.amount,
      p.payment_date,
      i.client_id,
      COALESCE(i.exchange_rate, 1.0) AS rate
    FROM payments p
    JOIN invoices i ON i.id = p.invoice_id
  `;
  const payParams = [];
  if (startBound && endBound) {
    paySql += ` WHERE p.payment_date >= ? AND p.payment_date <= ?`;
    payParams.push(startBound, endBound);
  }
  const paymentRows = execRows(paySql, payParams);

  let hasForeignCurrency = false;

  // Aggregate invoice data by client_id
  const clientInvMap = {};
  for (const inv of invoiceRows) {
    const cid = inv.client_id;
    if (!clientInvMap[cid]) {
      clientInvMap[cid] = { totalBilled: 0, invoiceCount: 0 };
    }
    const rate = Number(inv.rate) || 1.0;
    if (rate !== 1.0 || (inv.currency && inv.currency !== reportingCurrency)) {
      hasForeignCurrency = true;
    }
    const norm = (Number(inv.total) || 0) * rate;
    clientInvMap[cid].totalBilled += norm;
    clientInvMap[cid].invoiceCount += 1;
  }

  // Aggregate payment data by client_id
  const clientPayMap = {};
  for (const pay of paymentRows) {
    const cid = pay.client_id;
    if (!clientPayMap[cid]) {
      clientPayMap[cid] = { totalCollected: 0, paymentCount: 0 };
    }
    const rate = Number(pay.rate) || 1.0;
    if (rate !== 1.0) {
      hasForeignCurrency = true;
    }
    const norm = (Number(pay.amount) || 0) * rate;
    clientPayMap[cid].totalCollected += norm;
    clientPayMap[cid].paymentCount += 1;
  }

  // Build per-client metrics
  let reportClients = [];
  let sumBilled = 0;
  let sumCollected = 0;
  let activeCount = 0;

  for (const cl of clients) {
    const invData = clientInvMap[cl.id] || { totalBilled: 0, invoiceCount: 0 };
    const payData = clientPayMap[cl.id] || { totalCollected: 0, paymentCount: 0 };

    const totalBilled = Math.round(invData.totalBilled * 100) / 100;
    const totalCollected = Math.round(payData.totalCollected * 100) / 100;
    const outstandingBalance = Math.max(0, Math.round((totalBilled - totalCollected) * 100) / 100);
    const collectionRate = totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 1000) / 10 : null;

    const hasActivity = invData.invoiceCount > 0 || payData.paymentCount > 0;
    if (hasActivity) {
      activeCount += 1;
      sumBilled += totalBilled;
      sumCollected += totalCollected;
    }

    if (hasActivity || includeInactive) {
      reportClients.push({
        clientId: cl.id,
        clientName: cl.name,
        companyName: cl.company_name || '',
        email: cl.email || '',
        phone: cl.phone || '',
        totalBilled,
        totalCollected,
        outstandingBalance,
        collectionRate,
        invoiceCount: invData.invoiceCount,
        paymentCount: payData.paymentCount,
        hasActivity,
      });
    }
  }

  // Sorting
  reportClients.sort((a, b) => {
    switch (sort) {
      case 'collected_asc':
        return a.totalCollected - b.totalCollected || a.totalBilled - b.totalBilled;
      case 'billed_desc':
        return b.totalBilled - a.totalBilled || b.totalCollected - a.totalCollected;
      case 'billed_asc':
        return a.totalBilled - b.totalBilled || a.totalCollected - b.totalCollected;
      case 'outstanding_desc':
        return b.outstandingBalance - a.outstandingBalance || b.totalBilled - a.totalBilled;
      case 'outstanding_asc':
        return a.outstandingBalance - b.outstandingBalance || a.totalBilled - b.totalBilled;
      case 'name_asc':
        return a.clientName.localeCompare(b.clientName, undefined, { sensitivity: 'base' });
      case 'name_desc':
        return b.clientName.localeCompare(a.clientName, undefined, { sensitivity: 'base' });
      case 'rate_desc':
        return (b.collectionRate ?? -1) - (a.collectionRate ?? -1);
      case 'rate_asc':
        return (a.collectionRate ?? 9999) - (b.collectionRate ?? 9999);
      case 'collected_desc':
      default:
        return b.totalCollected - a.totalCollected || b.totalBilled - a.totalBilled;
    }
  });

  // Assign ranks
  reportClients.forEach((cl, idx) => {
    cl.rank = idx + 1;
  });

  const totalOutstanding = Math.max(0, Math.round((sumBilled - sumCollected) * 100) / 100);
  const overallCollectionRate = sumBilled > 0 ? Math.round((sumCollected / sumBilled) * 1000) / 10 : null;

  // Find top client by collected
  let topClient = null;
  const topCandidate = [...reportClients].sort((a, b) => b.totalCollected - a.totalCollected)[0];
  if (topCandidate && topCandidate.totalCollected > 0) {
    topClient = {
      id: topCandidate.clientId,
      name: topCandidate.clientName,
      company: topCandidate.companyName,
      totalCollected: topCandidate.totalCollected,
      totalBilled: topCandidate.totalBilled,
    };
  }

  return {
    startDate: startDate || null,
    endDate: endDate || null,
    reportingCurrency,
    hasForeignCurrency,
    clients: reportClients,
    summary: {
      totalBilled: Math.round(sumBilled * 100) / 100,
      totalCollected: Math.round(sumCollected * 100) / 100,
      totalOutstanding,
      overallCollectionRate,
      activeClientsCount: activeCount,
      totalClientsCount: clients.length,
      topClient,
    },
  };
}

// ---------- App Lock (PIN) ----------

function getAppLockRow() {
  const res = db.exec('SELECT is_enabled, pin_hash, pin_salt, inactivity_minutes FROM app_lock WHERE id = 1');
  if (!res.length || res[0].values.length === 0) {
    return { is_enabled: 0, pin_hash: '', pin_salt: '', inactivity_minutes: 5 };
  }
  const cols = res[0].columns;
  const row = {};
  cols.forEach((c, i) => { row[c] = res[0].values[0][i]; });
  return row;
}

function getAppLockSettings() {
  const row = getAppLockRow();
  return {
    is_enabled: Number(row.is_enabled) === 1,
    pin_set: Boolean(row.pin_hash),
    inactivity_minutes: Number(row.inactivity_minutes) || 5,
  };
}

function hashAppLockPin(pin, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.scryptSync(String(pin), salt, 16).toString('hex');
}

function verifyAppLockPin(pin) {
  const row = getAppLockRow();
  if (!row.pin_hash || !row.pin_salt) return false;
  const expected = Buffer.from(row.pin_hash, 'hex');
  const actual = Buffer.from(hashAppLockPin(pin, row.pin_salt), 'hex');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function setAppLockPin({ pin, currentPin = null, inactivityMinutes } = {}) {
  const pinStr = String(pin || '');
  if (pinStr.length < 4) return { ok: false, error: 'PIN must be at least 4 characters.' };
  if (pinStr.length > 64) return { ok: false, error: 'PIN must be 64 characters or fewer.' };

  const row = getAppLockRow();
  const hasPin = Boolean(row.pin_hash);
  if (hasPin && !verifyAppLockPin(currentPin)) {
    return { ok: false, error: 'Current PIN is incorrect.' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashAppLockPin(pinStr, salt);
  const minutes = Math.max(0, parseInt(inactivityMinutes, 10) || 0);
  const now = new Date().toISOString();

  const existing = getAppLockRow();
  if (existing.pin_hash) {
    db.run(
      `UPDATE app_lock SET is_enabled = 1, pin_hash = ?, pin_salt = ?, inactivity_minutes = ?, updated_at = ? WHERE id = 1`,
      [hash, salt, minutes, now]
    );
  } else {
    db.run(
      `INSERT INTO app_lock (id, is_enabled, pin_hash, pin_salt, inactivity_minutes, updated_at)
       VALUES (1, 1, ?, ?, ?, ?)`,
      [hash, salt, minutes, now]
    );
  }
  saveToDisk();
  return { ok: true, settings: getAppLockSettings() };
}

function disableAppLock({ currentPin = null } = {}) {
  const row = getAppLockRow();
  if (Number(row.is_enabled) === 0) return { ok: true, settings: getAppLockSettings() };
  if (!row.pin_hash || !verifyAppLockPin(currentPin)) {
    return { ok: false, error: 'Current PIN is incorrect.' };
  }
  db.run(`UPDATE app_lock SET is_enabled = 0, updated_at = ? WHERE id = 1`, [new Date().toISOString()]);
  saveToDisk();
  return { ok: true, settings: getAppLockSettings() };
}

// ---------- Automatic Backups ----------

function getAutoBackupSettings() {
  const res = db.exec('SELECT enabled, schedule, folder, retain_count, last_backup_at FROM auto_backup_settings WHERE id = 1');
  if (!res.length || res[0].values.length === 0) {
    return { enabled: false, schedule: 'daily', folder: '', retainCount: 7, lastBackupAt: null };
  }
  const cols = res[0].columns;
  const row = {};
  cols.forEach((c, i) => { row[c] = res[0].values[0][i]; });
  return {
    enabled: Number(row.enabled) === 1,
    schedule: row.schedule === 'on_close' ? 'on_close' : 'daily',
    folder: row.folder || '',
    retainCount: Math.max(1, parseInt(row.retain_count, 10) || 7),
    lastBackupAt: row.last_backup_at || null,
  };
}

function saveAutoBackupSettings({ enabled, schedule, folder, retainCount, lastBackupAt } = {}) {
  const enableFlag = enabled ? 1 : 0;
  const sched = schedule === 'on_close' ? 'on_close' : 'daily';

  let retain = retainCount === undefined || retainCount === null ? 7 : parseInt(retainCount, 10);
  if (Number.isNaN(retain)) retain = 7;
  if (retain < 1) retain = 1;
  if (retain > 30) retain = 30;

  const folderStr = String(folder || '').trim();
  if (enableFlag === 1) {
    if (!folderStr) {
      return { ok: false, error: 'Choose a folder to store automatic backups.' };
    }
  }
  if (retain < 1) {
    return { ok: false, error: 'Keep at least 1 backup.' };
  }

  const now = new Date().toISOString();
  const last = lastBackupAt ? String(lastBackupAt) : '';

  const existingRes = db.exec('SELECT * FROM auto_backup_settings WHERE id = 1');
  if (existingRes.length && existingRes[0].values.length > 0) {
    db.run(
      `UPDATE auto_backup_settings SET enabled = ?, schedule = ?, folder = ?, retain_count = ?, last_backup_at = ?, updated_at = ? WHERE id = 1`,
      [enableFlag, sched, folderStr, retain, last, now]
    );
  } else {
    db.run(
      `INSERT INTO auto_backup_settings (id, enabled, schedule, folder, retain_count, last_backup_at, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?)`,
      [enableFlag, sched, folderStr, retain, last, now]
    );
  }
  saveToDisk();
  return { ok: true, settings: getAutoBackupSettings() };
}

// ---------- Audit Trail ----------

// Records one entry in the audit log. Runs best-effort: a logging failure must
// never break the real action it describes. The caller's saveToDisk() persists
// both the action and this row together.
function addAuditEntry({ entityType, entityRef = '', action, description }) {
  try {
    db.run(
      `INSERT INTO audit_log_entries (entity_type, entity_ref, action, description, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [String(entityType || ''), String(entityRef || ''), String(action || ''), String(description || ''), new Date().toISOString()]
    );
  } catch (e) {
    /* ignore */
  }
}

function getAuditLogEntries({ recordType, from, to, limit = 500 } = {}) {
  const conditions = [];
  const params = [];

  if (recordType && recordType !== 'all') {
    conditions.push('entity_type = ?');
    params.push(String(recordType));
  }
  if (from) {
    conditions.push('created_at >= ?');
    params.push(String(from) + 'T00:00:00.000Z');
  }
  if (to) {
    conditions.push('created_at <= ?');
    params.push(String(to) + 'T23:59:59.999Z');
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const max = Math.max(1, parseInt(limit, 10) || 500);
  const res = db.exec(
    `SELECT id, entity_type, entity_ref, action, description, created_at
     FROM audit_log_entries
     ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT ${max}`,
    params
  );
  return rowsToArray(res);
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
  getProjectOverview,
  PROJECT_STATUSES,
  listProjects,
  getProject,
  addProject,
  updateProject,
  archiveProject,
  deleteProject,
  countProjectHistory,
  createQuote,
  duplicateQuote,
  updateQuote,
  getQuote,
  getQuoteVersionHistory,
  listQuotes,
  setQuoteStatus,
  markQuoteAccepted,
  markQuoteDeclined,
  parsePaymentTermsDays,
  convertQuoteToInvoice,
  createFinalInvoiceFromDeposit,
  createInvoiceFromTimeEntries,
  unbillTimeEntriesForInvoice,
  duplicateInvoice,
  getInvoice,
  getInvoiceByQuote,
  listInvoices,
  setInvoiceStatus,
  markInvoicesSent,
  addPayment,
  getPaymentHistory,
  getPaymentsReport,
  getProfitLossReport,
  getRevenueReport,
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
  resolveTimeEntryRate,
  getTimeEntry,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  listTimeEntries,
  getTimeEntriesSummary,
  markTimeEntriesBilled,
  getTimerSettings,
  saveTimerSettings,
  getLiveTimer,
  startLiveTimer,
  stopLiveTimer,
  discardLiveTimer,
  PAYMENT_METHODS,
  getEmailSettings,
  getEmailSettingsInternal,
  saveEmailSettings,
  logDocumentEmail,
  getDocumentEmailLogs,
  getReminderSettings,
  saveReminderSettings,
  getReminderRules,
  saveReminderRule,
  deleteReminderRule,
  resetDefaultReminderRules,
  getDueReminders,
  logReminderSent,
  getRevenueReport,
  getClientProfitabilityReport,
  getAppLockSettings,
  setAppLockPin,
  verifyAppLockPin,
  disableAppLock,
  getAutoBackupSettings,
  saveAutoBackupSettings,
  addAuditEntry,
  getAuditLogEntries,
};
