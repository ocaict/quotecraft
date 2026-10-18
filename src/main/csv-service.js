/**
 * QuoteCraft CSV Service
 * Native, zero-dependency CSV parser, serializer, column auto-detector,
 * and accounting ledger exporter for Phase 1 Data Portability.
 */

'use strict';

// ---------------------------------------------------------------------------
// 1. Core CSV Parser (RFC 4180 compliant)
// ---------------------------------------------------------------------------

/**
 * Sniffs the delimiter from the first line of CSV text.
 * Defaults to comma (',') if inconclusive.
 */
function sniffDelimiter(text) {
  if (!text || typeof text !== 'string') return ',';
  const firstLine = text.split(/\r\n|\n|\r/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  if (semicolonCount > commaCount && semicolonCount > tabCount) return ';';
  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  return ',';
}

/**
 * Parses raw CSV text into an array of string arrays (rows of cell strings).
 * Handles quoted fields, delimiters inside quotes, escaped quotes (""), and newlines.
 */
function parseCsvGrid(csvText, delimiter = null) {
  if (!csvText || typeof csvText !== 'string') return [];
  // Strip UTF-8 BOM if present
  let text = csvText.charCodeAt(0) === 0xFEFF ? csvText.slice(1) : csvText;
  const delim = delimiter || sniffDelimiter(text);

  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let insideQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (insideQuotes) {
      if (char === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          // Escaped quote: ""
          currentCell += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === delim) {
        currentRow.push(currentCell.trim());
        currentCell = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < len && text[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentCell.trim());
        currentCell = '';
        if (currentRow.some((c) => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        currentCell = '';
        if (currentRow.some((c) => c !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentCell += char;
        i++;
        continue;
      }
    }
  }

  // Final cell & row if remaining
  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parses CSV text into { headers: string[], rows: object[], rawRows: string[][], delimiter: string }
 */
function parseCsv(csvText, options = {}) {
  const delimiter = options.delimiter || sniffDelimiter(csvText);
  const grid = parseCsvGrid(csvText, delimiter);
  if (!grid || grid.length === 0) {
    return { headers: [], rows: [], rawRows: [], delimiter };
  }

  const rawHeaders = grid[0].map((h) => String(h || '').trim());
  const rows = [];

  for (let r = 1; r < grid.length; r++) {
    const rowCells = grid[r];
    const rowObj = {};
    for (let c = 0; c < rawHeaders.length; c++) {
      const headerName = rawHeaders[c] || `col_${c + 1}`;
      rowObj[headerName] = rowCells[c] != null ? rowCells[c] : '';
    }
    rows.push(rowObj);
  }

  return {
    headers: rawHeaders,
    rows,
    rawRows: grid.slice(1),
    delimiter,
  };
}

// ---------------------------------------------------------------------------
// 2. CSV Stringifier
// ---------------------------------------------------------------------------

function escapeCsvCell(value) {
  if (value == null) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function stringifyCsv(headers, rows) {
  if (!headers || !headers.length) return '';
  const lines = [];
  lines.push(headers.map(escapeCsvCell).join(','));

  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (Array.isArray(row)) {
        lines.push(row.map(escapeCsvCell).join(','));
      } else if (typeof row === 'object' && row !== null) {
        lines.push(headers.map((h) => escapeCsvCell(row[h])).join(','));
      }
    }
  }

  return lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// 3. Column Auto-Detection & Mapping
// ---------------------------------------------------------------------------

function normalizeHeaderKey(key) {
  return String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const CLIENT_FIELD_SYNONYMS = {
  name: ['name', 'clientname', 'fullname', 'contactname', 'customer', 'customername', 'client'],
  company_name: ['company', 'companyname', 'business', 'businessname', 'organization', 'organisation', 'org'],
  email: ['email', 'emailaddress', 'mail', 'e_mail', 'primaryemail', 'contactemail'],
  phone: ['phone', 'phonenumber', 'telephone', 'mobile', 'cell', 'tel', 'contactphone'],
  address_line1: ['address', 'address1', 'addressline1', 'street', 'streetaddress', 'billingaddress'],
  address_line2: ['address2', 'addressline2', 'suite', 'unit', 'apartment', 'apt'],
  city: ['city', 'town', 'municipality', 'suburb'],
  state: ['state', 'province', 'region', 'county'],
  postal_code: ['postalcode', 'zip', 'zipcode', 'postcode'],
  country: ['country', 'nation'],
  notes: ['notes', 'note', 'comments', 'comment', 'description', 'memo', 'clientnotes'],
  tags: ['tags', 'tag', 'labels', 'categories', 'category'],
  default_currency: ['currency', 'defaultcurrency', 'billingcurrency'],
  default_hourly_rate: ['hourlyrate', 'rate', 'defaultrate', 'billablerate', 'defaulthourlyrate'],
};

const LINE_ITEM_FIELD_SYNONYMS = {
  name: ['name', 'item', 'itemname', 'title', 'service', 'servicename', 'product', 'productname'],
  description: ['description', 'desc', 'details', 'detail', 'summary', 'memo'],
  unit_price: ['unitprice', 'price', 'rate', 'unitrate', 'cost', 'amount', 'fee'],
  tax_rate: ['taxrate', 'tax', 'vat', 'vatrate', 'taxpercent', 'vatpercent'],
  unit_label: ['unit', 'unitlabel', 'uom', 'unitofmeasure', 'measure'],
};

/**
 * Detects mapping from CSV headers to standard Client fields.
 * Returns { mapping: { [csvHeader]: targetFieldOrEmpty }, unmapped: string[] }
 */
function detectClientColumnMapping(headers) {
  const mapping = {};
  const usedFields = new Set();
  const unmapped = [];

  for (const h of headers) {
    const norm = normalizeHeaderKey(h);
    let matchedField = '';

    for (const [field, synonyms] of Object.entries(CLIENT_FIELD_SYNONYMS)) {
      if (usedFields.has(field)) continue;
      if (synonyms.some((syn) => norm === syn || norm.includes(syn))) {
        matchedField = field;
        usedFields.add(field);
        break;
      }
    }

    mapping[h] = matchedField;
    if (!matchedField) {
      unmapped.push(h);
    }
  }

  return { mapping, unmapped };
}

/**
 * Detects mapping from CSV headers to standard Line Item Template fields.
 */
function detectLineItemColumnMapping(headers) {
  const mapping = {};
  const usedFields = new Set();
  const unmapped = [];

  for (const h of headers) {
    const norm = normalizeHeaderKey(h);
    let matchedField = '';

    for (const [field, synonyms] of Object.entries(LINE_ITEM_FIELD_SYNONYMS)) {
      if (usedFields.has(field)) continue;
      if (synonyms.some((syn) => norm === syn || norm.includes(syn))) {
        matchedField = field;
        usedFields.add(field);
        break;
      }
    }

    mapping[h] = matchedField;
    if (!matchedField) {
      unmapped.push(h);
    }
  }

  return { mapping, unmapped };
}

// ---------------------------------------------------------------------------
// 4. Record Preparation & Cleaning
// ---------------------------------------------------------------------------

/**
 * Transforms parsed CSV rows into clean client objects according to mapping.
 */
function prepareClientRecords(rows, mapping) {
  const clients = [];
  const errors = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const client = {
      name: '',
      company_name: '',
      email: '',
      phone: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      postal_code: '',
      country: '',
      notes: '',
      tags: '',
      default_currency: null,
      default_hourly_rate: null,
    };

    for (const [csvCol, targetField] of Object.entries(mapping)) {
      if (!targetField || row[csvCol] == null) continue;
      const rawVal = String(row[csvCol]).trim();

      if (targetField === 'default_hourly_rate') {
        const cleaned = rawVal.replace(/[^0-9.]/g, '');
        const n = parseFloat(cleaned);
        client.default_hourly_rate = !isNaN(n) && n >= 0 ? n : null;
      } else if (targetField === 'default_currency') {
        const c = rawVal.toUpperCase().slice(0, 5);
        client.default_currency = c.length >= 3 ? c : null;
      } else if (targetField === 'email') {
        client.email = rawVal.toLowerCase();
      } else {
        client[targetField] = rawVal;
      }
    }

    // Name fallback: If name is blank but company_name exists, use company_name
    if (!client.name && client.company_name) {
      client.name = client.company_name;
    }

    // Validation: A client must have at least a Name or Company Name
    if (!client.name) {
      errors.push({
        rowNumber: idx + 2,
        reason: 'Missing client name or company name',
        data: row,
      });
      continue;
    }

    clients.push(client);
  }

  return { clients, errors };
}

/**
 * Transforms parsed CSV rows into clean Line Item Template objects.
 */
function prepareLineItemRecords(rows, mapping) {
  const items = [];
  const errors = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const item = {
      name: '',
      description: '',
      unit_price: 0,
      tax_rate: 0,
      unit_label: '',
    };

    for (const [csvCol, targetField] of Object.entries(mapping)) {
      if (!targetField || row[csvCol] == null) continue;
      const rawVal = String(row[csvCol]).trim();

      if (targetField === 'unit_price') {
        const cleaned = rawVal.replace(/[^0-9.]/g, '');
        const n = parseFloat(cleaned);
        item.unit_price = !isNaN(n) && n >= 0 ? n : 0;
      } else if (targetField === 'tax_rate') {
        const cleaned = rawVal.replace(/[^0-9.]/g, '');
        const n = parseFloat(cleaned);
        item.tax_rate = !isNaN(n) && n >= 0 ? n : 0;
      } else {
        item[targetField] = rawVal;
      }
    }

    if (!item.name && item.description) {
      item.name = item.description.slice(0, 60);
    }

    if (!item.name) {
      errors.push({
        rowNumber: idx + 2,
        reason: 'Missing item name or description',
        data: row,
      });
      continue;
    }

    items.push(item);
  }

  return { items, errors };
}

// ---------------------------------------------------------------------------
// 5. Accounting & Tax Ledger Exports
// ---------------------------------------------------------------------------

function formatMoney(amount, currency = 'USD') {
  const val = Number(amount) || 0;
  return val.toFixed(2);
}

/**
 * Generates an Invoices Ledger CSV.
 */
function generateInvoicesLedgerCsv(invoices = []) {
  const headers = [
    'Invoice Number',
    'Client Name',
    'Company Name',
    'Status',
    'Date Created',
    'Date Sent',
    'Date Due',
    'Currency',
    'Exchange Rate',
    'Subtotal',
    'Tax Amount',
    'Discount Amount',
    'Total Amount',
    'Amount Paid',
    'Balance Due',
    'WHT Rate (%)',
    'WHT Amount',
    'Payment Terms',
    'Notes',
  ];

  const rows = invoices.map((inv) => {
    const client = inv.client || {};
    return [
      inv.invoice_number || '',
      client.name || '',
      client.company_name || '',
      inv.status || 'draft',
      inv.date_created || '',
      inv.date_sent || '',
      inv.date_due || '',
      inv.currency || 'USD',
      inv.exchange_rate || 1.0,
      formatMoney(inv.subtotal),
      formatMoney(inv.tax_amount),
      formatMoney(inv.discount_amount),
      formatMoney(inv.total),
      formatMoney(inv.amount_paid),
      formatMoney(inv.balance_due),
      inv.wht_rate || 0,
      formatMoney(inv.wht_amount),
      inv.terms || '',
      inv.notes || '',
    ];
  });

  return stringifyCsv(headers, rows);
}

/**
 * Generates Payments Received CSV.
 */
function generatePaymentsLedgerCsv(payments = []) {
  const headers = [
    'Payment Date',
    'Invoice Number',
    'Client Name',
    'Company Name',
    'Payment Method',
    'Reference Number',
    'Amount',
    'Currency',
    'Exchange Rate',
    'Notes',
  ];

  const rows = payments.map((p) => [
    p.payment_date || '',
    p.invoice_number || '',
    p.client_name || '',
    p.client_company || '',
    p.payment_method || 'Unspecified',
    p.reference_number || '',
    formatMoney(p.amount),
    p.currency || 'USD',
    p.exchange_rate || 1.0,
    p.notes || '',
  ]);

  return stringifyCsv(headers, rows);
}

/**
 * Generates Expenses Ledger CSV.
 */
function generateExpensesLedgerCsv(expenses = []) {
  const headers = [
    'Date',
    'Category',
    'Amount',
    'Currency',
    'Exchange Rate',
    'Billable',
    'Billed Status',
    'Client Name',
    'Project Name',
    'Linked Invoice',
    'Notes / Vendor',
  ];

  const rows = expenses.map((e) => [
    e.date || '',
    e.category || 'Other',
    formatMoney(e.amount),
    e.currency || 'USD',
    e.exchange_rate || 1.0,
    e.billable ? 'Yes' : 'No',
    e.billed ? 'Billed' : e.billable ? 'Unbilled' : 'N/A',
    e.client_name || '',
    e.project_name || '',
    e.invoice_number || '',
    e.notes || '',
  ]);

  return stringifyCsv(headers, rows);
}

/**
 * Generates Time Tracking Entries CSV.
 */
function generateTimeEntriesLedgerCsv(entries = []) {
  const headers = [
    'Date',
    'Client Name',
    'Project Name',
    'Description',
    'Hours',
    'Hourly Rate',
    'Total Amount',
    'Billed Status',
    'Linked Invoice',
  ];

  const rows = entries.map((t) => [
    t.date || '',
    t.client_name || '',
    t.project_name || '',
    t.description || '',
    t.hours || 0,
    formatMoney(t.hourly_rate),
    formatMoney(t.amount),
    t.billed ? 'Billed' : 'Unbilled',
    t.invoice_number || '',
  ]);

  return stringifyCsv(headers, rows);
}

module.exports = {
  sniffDelimiter,
  parseCsvGrid,
  parseCsv,
  stringifyCsv,
  CLIENT_FIELD_SYNONYMS,
  LINE_ITEM_FIELD_SYNONYMS,
  detectClientColumnMapping,
  detectLineItemColumnMapping,
  prepareClientRecords,
  prepareLineItemRecords,
  generateInvoicesLedgerCsv,
  generatePaymentsLedgerCsv,
  generateExpensesLedgerCsv,
  generateTimeEntriesLedgerCsv,
};
