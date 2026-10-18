/**
 * QuoteCraft Standalone HTML Receipt & Document Template Compiler
 * 
 * Generates self-contained, responsive, beautifully styled HTML documents
 * for invoices, quotes, and payment receipts. Zero external CSS/JS dependencies.
 * Ready for in-app sandboxed previews, mobile browsers, and offline archival.
 */

const { CURRENCIES, getCurrencyByCode, computeBaseAmountCents } = require('../shared/constants');

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  try {
    const parts = String(isoStr).split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day} ${months[month - 1] || ''} ${year}`;
    }
  } catch (_) {}
  return String(isoStr);
}

function formatMoney(amount, currencyCode) {
  const num = Number(amount) || 0;
  const curr = getCurrencyByCode(currencyCode || 'USD');
  const symbol = curr ? curr.symbol : '$';
  return `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getBankDetails(profile, currencyCode) {
  if (!profile) return null;
  const isForeign = currencyCode && currencyCode !== (profile.default_currency || 'USD') && currencyCode !== 'NGN';

  const domAcc = profile.dom_account_number || profile.domiciliary_account_number;
  const domBank = profile.dom_bank_name || profile.domiciliary_bank_name;
  if (isForeign && (domAcc || domBank)) {
    return {
      type: 'domiciliary',
      badge: 'Foreign Currency Wire / SWIFT',
      currency: currencyCode,
      bankName: domBank || '',
      accountNumber: domAcc || '',
      accountName: profile.dom_account_name || profile.domiciliary_account_name || profile.business_name || '',
      swiftCode: profile.dom_swift_code || profile.domiciliary_swift_code || '',
      intermediaryBank: profile.dom_intermediary_bank || profile.domiciliary_intermediary_bank || '',
      notes: profile.domiciliary_notes || '',
    };
  }

  const nubanAcc = profile.account_number || profile.bank_account_number;
  const nubanBank = profile.bank_name;
  if (nubanAcc || nubanBank) {
    return {
      type: 'nuban',
      badge: 'Direct Bank Transfer',
      currency: profile.default_currency || currencyCode || 'USD',
      bankName: nubanBank || '',
      accountNumber: nubanAcc || '',
      accountName: profile.account_name || profile.bank_account_name || profile.business_name || '',
      notes: profile.payment_instructions || '',
    };
  }

  if (profile.payment_instructions) {
    return {
      type: 'instructions',
      badge: 'Payment Instructions',
      notes: profile.payment_instructions,
    };
  }

  return null;
}

function getThemeStyles(profile) {
  const accent = (profile && profile.pdf_accent_color) || '#0ea5e9';
  const layout = (profile && profile.pdf_layout_style) || 'standard';

  return `
    :root {
      --primary: ${accent};
      --primary-dark: #0369a1;
      --primary-light: #e0f2fe;
      --text: #0f172a;
      --text-muted: #64748b;
      --border: #e2e8f0;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --badge-bg: #f1f5f9;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-family);
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 32px 16px;
      -webkit-font-smoothing: antialiased;
    }
    .document-wrapper {
      max-width: 840px;
      margin: 0 auto;
      background: var(--card-bg);
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .document-header-stripe {
      height: 6px;
      background: var(--primary);
      width: 100%;
    }
    .document-body {
      padding: 40px;
    }
    .header-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 36px;
      gap: 24px;
      flex-wrap: wrap;
    }
    .brand-col h1 {
      font-size: 24px;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }
    .brand-meta {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.4;
    }
    .doc-meta-col {
      text-align: right;
    }
    .doc-type-pill {
      display: inline-block;
      padding: 4px 12px;
      background: var(--primary-light);
      color: var(--primary);
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-radius: 9999px;
      margin-bottom: 8px;
    }
    .doc-number {
      font-size: 20px;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.01em;
      margin-bottom: 8px;
    }
    .meta-list {
      font-size: 13px;
      color: var(--text-muted);
      list-style: none;
    }
    .meta-list li {
      margin-bottom: 2px;
    }
    .meta-list strong {
      color: var(--text);
    }
    .parties-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 24px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px 24px;
      margin-bottom: 32px;
    }
    .party-card-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .party-name {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 4px;
    }
    .party-details {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.4;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
    }
    .items-table th {
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      border-bottom: 2px solid var(--border);
      padding: 12px 14px;
      background: #fafafa;
    }
    .items-table th.col-right, .items-table td.col-right {
      text-align: right;
    }
    .items-table td {
      padding: 14px;
      font-size: 13px;
      border-bottom: 1px solid var(--border);
      color: var(--text);
      vertical-align: top;
    }
    .item-desc {
      font-weight: 600;
      color: var(--text);
    }
    .item-subtext {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .summary-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 32px;
    }
    .totals-box {
      width: 320px;
      max-width: 100%;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 13px;
      color: var(--text-muted);
    }
    .total-row.highlight {
      color: var(--text);
      font-weight: 600;
    }
    .total-row.grand {
      border-top: 2px solid var(--border);
      margin-top: 8px;
      padding-top: 12px;
      font-size: 17px;
      font-weight: 800;
      color: var(--primary);
    }
    .total-row.base-equiv {
      font-size: 12px;
      font-style: italic;
      color: var(--text-muted);
      border-top: 1px dashed var(--border);
      padding-top: 6px;
      margin-top: 4px;
    }
    .status-banner {
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 28px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
    }
    .status-banner.paid {
      background: #ecfdf5;
      border: 1px solid #10b981;
      color: #065f46;
    }
    .status-banner.overdue {
      background: #fef2f2;
      border: 1px solid #ef4444;
      color: #991b1b;
    }
    .status-banner.draft {
      background: #f8fafc;
      border: 1px solid var(--border);
      color: var(--text-muted);
    }
    .status-banner.sent {
      background: #f0f9ff;
      border: 1px solid #0ea5e9;
      color: #0369a1;
    }
    .bank-card {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 18px 20px;
      margin-bottom: 28px;
    }
    .bank-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .bank-badge {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--primary);
    }
    .bank-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      font-size: 13px;
    }
    .bank-item-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
    }
    .bank-item-val {
      font-weight: 700;
      color: var(--text);
    }
    .paystack-action-card {
      margin-bottom: 28px;
      padding: 18px 22px;
      background: linear-gradient(135deg, #091e3a 0%, #0c2d53 100%);
      border: 1px solid #00c3f5;
      border-radius: 8px;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
    }
    .paystack-btn {
      display: inline-block;
      background: #00c3f5;
      color: #001e2b;
      font-weight: 700;
      font-size: 14px;
      padding: 10px 22px;
      border-radius: 6px;
      text-decoration: none;
      box-shadow: 0 4px 12px rgba(0, 195, 245, 0.3);
      cursor: pointer;
    }
    .notes-card {
      border-top: 1px solid var(--border);
      padding-top: 20px;
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.6;
    }
    .receipt-stamp {
      display: inline-block;
      border: 2px dashed #10b981;
      color: #10b981;
      text-transform: uppercase;
      font-weight: 800;
      font-size: 14px;
      letter-spacing: 0.1em;
      padding: 4px 12px;
      border-radius: 6px;
      transform: rotate(-3deg);
    }
    .print-bar {
      max-width: 840px;
      margin: 0 auto 16px auto;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .print-btn {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 13px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .print-btn:hover {
      background: #f1f5f9;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .print-bar {
        display: none !important;
      }
      .document-wrapper {
        border: none;
        box-shadow: none;
        border-radius: 0;
        max-width: 100%;
      }
      .document-body {
        padding: 20px;
      }
    }
  `;
}

/**
 * Compiles a standalone HTML Invoice / Receipt document
 */
function generateInvoiceHtml(invoice, client, profile, options = {}) {
  const currency = invoice.currency || (profile && profile.default_currency) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';
  const balanceDue = Number(invoice.balance_due) || 0;
  const isPaid = (invoice.status === 'paid') || (balanceDue <= 0.0001 && Number(invoice.amount_paid) > 0);

  const bankInfo = getBankDetails(profile, currency);
  const paystackUrl = invoice.paystack_url || (profile && profile.paystack_enabled ? profile.paystack_page_url : null);

  // Line items
  const items = invoice.line_items || [];
  const lineItemsRows = items.map((item, idx) => {
    return `
      <tr>
        <td>
          <div class="item-desc">${escapeHtml(item.description)}</div>
        </td>
        <td class="col-right">${Number(item.quantity) || 1}${item.unit_label ? ' ' + escapeHtml(item.unit_label) : ''}</td>
        <td class="col-right">${formatMoney(item.unit_price, currency)}</td>
        <td class="col-right">${formatMoney(item.amount, currency)}</td>
      </tr>
    `;
  }).join('');

  // Status message
  let statusBanner = '';
  if (isPaid) {
    statusBanner = `
      <div class="status-banner paid">
        <span class="receipt-stamp">&#10003; PAID IN FULL</span>
        <div>This invoice has been settled in full. Thank you for your business!</div>
      </div>
    `;
  } else if (invoice.status === 'overdue') {
    statusBanner = `
      <div class="status-banner overdue">
        <strong>&#9888; OVERDUE:</strong> Payment of <strong>${formatMoney(balanceDue, currency)}</strong> was due on ${escapeHtml(formatDate(invoice.date_due))}.
      </div>
    `;
  }

  // Base currency equivalent snapshot (Multi-Currency)
  let baseEquivRow = '';
  if (invoice.exchange_rate && Number(invoice.exchange_rate) !== 1.0 && profile && profile.default_currency && profile.default_currency !== currency) {
    const baseCents = invoice.base_amount_cents != null
      ? Number(invoice.base_amount_cents)
      : computeBaseAmountCents(invoice.total, invoice.exchange_rate);
    const baseAmount = baseCents / 100;
    baseEquivRow = `
      <div class="total-row base-equiv">
        <span>Base Equiv (${escapeHtml(profile.default_currency)} @ ${Number(invoice.exchange_rate).toFixed(4)}):</span>
        <span>${formatMoney(baseAmount, profile.default_currency)}</span>
      </div>
    `;
  }

  // Bank Info Card
  let bankCard = '';
  if (bankInfo) {
    if (bankInfo.type === 'nuban') {
      bankCard = `
        <div class="bank-card">
          <div class="bank-header">
            <span class="bank-badge">${escapeHtml(bankInfo.badge)}</span>
            <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(bankInfo.currency)}</span>
          </div>
          <div class="bank-grid">
            <div>
              <div class="bank-item-label">Bank</div>
              <div class="bank-item-val">${escapeHtml(bankInfo.bankName || '—')}</div>
            </div>
            <div>
              <div class="bank-item-label">Account Number</div>
              <div class="bank-item-val">${escapeHtml(bankInfo.accountNumber || '—')}</div>
            </div>
            <div>
              <div class="bank-item-label">Account Name</div>
              <div class="bank-item-val">${escapeHtml(bankInfo.accountName || '—')}</div>
            </div>
          </div>
          ${bankInfo.notes ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">${escapeHtml(bankInfo.notes)}</div>` : ''}
        </div>
      `;
    } else if (bankInfo.type === 'domiciliary') {
      bankCard = `
        <div class="bank-card">
          <div class="bank-header">
            <span class="bank-badge">${escapeHtml(bankInfo.badge)}</span>
            <span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(bankInfo.currency)}</span>
          </div>
          <div class="bank-grid">
            <div>
              <div class="bank-item-label">Bank Name</div>
              <div class="bank-item-val">${escapeHtml(bankInfo.bankName || '—')}</div>
            </div>
            <div>
              <div class="bank-item-label">Account / IBAN</div>
              <div class="bank-item-val">${escapeHtml(bankInfo.accountNumber || '—')}</div>
            </div>
            <div>
              <div class="bank-item-label">Beneficiary</div>
              <div class="bank-item-val">${escapeHtml(bankInfo.accountName || '—')}</div>
            </div>
            ${bankInfo.swiftCode ? `
              <div>
                <div class="bank-item-label">SWIFT / BIC</div>
                <div class="bank-item-val">${escapeHtml(bankInfo.swiftCode)}</div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }
  }

  // Paystack online payment card
  let paystackCard = '';
  if (paystackUrl && !isPaid) {
    paystackCard = `
      <div class="paystack-action-card">
        <div>
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #00c3f5; font-weight: 700; margin-bottom: 2px;">Instant Online Settlement</div>
          <div style="font-size: 15px; font-weight: 700;">Pay securely with Debit Card or Bank Transfer</div>
        </div>
        <a href="${escapeHtml(paystackUrl)}" target="_blank" rel="noopener noreferrer" class="paystack-btn">
          💳 Pay Online (${formatMoney(balanceDue > 0 ? balanceDue : invoice.total, currency)})
        </a>
      </div>
    `;
  }

  let docLabel = 'INVOICE';
  if (invoice.invoice_type === 'deposit') docLabel = 'DEPOSIT INVOICE';
  else if (invoice.invoice_type === 'final') docLabel = 'FINAL INVOICE';
  else if (isPaid) docLabel = 'RECEIPT';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(docLabel)} - ${escapeHtml(invoice.invoice_number)}</title>
  <style>${getThemeStyles(profile)}</style>
</head>
<body>
  <div class="print-bar">
    <button type="button" class="print-btn" onclick="window.print()">
      🖨️ Print Document
    </button>
  </div>
  <div class="document-wrapper">
    <div class="document-header-stripe"></div>
    <div class="document-body">
      <div class="header-section">
        <div class="brand-col">
          <h1>${escapeHtml(businessName)}</h1>
          <div class="brand-meta">
            ${profile && profile.address ? `<div>${escapeHtml(profile.address)}</div>` : ''}
            ${profile && profile.city ? `<div>${escapeHtml(profile.city)}${profile.state ? ', ' + escapeHtml(profile.state) : ''}</div>` : ''}
            ${profile && profile.email ? `<div>Email: ${escapeHtml(profile.email)}</div>` : ''}
            ${profile && profile.phone ? `<div>Tel: ${escapeHtml(profile.phone)}</div>` : ''}
          </div>
        </div>
        <div class="doc-meta-col">
          <span class="doc-type-pill">${escapeHtml(docLabel)}</span>
          <div class="doc-number">${escapeHtml(invoice.invoice_number)}</div>
          <ul class="meta-list">
            <li>Date: <strong>${escapeHtml(formatDate(invoice.date_created))}</strong></li>
            <li>Due: <strong>${escapeHtml(formatDate(invoice.date_due))}</strong></li>
            <li>Status: <strong>${escapeHtml(invoice.status || 'Draft')}</strong></li>
          </ul>
        </div>
      </div>

      <div class="parties-grid">
        <div>
          <div class="party-card-title">Billed To</div>
          <div class="party-name">${escapeHtml(client ? client.name : 'Valued Client')}</div>
          <div class="party-details">
            ${client && client.company_name ? `<div>${escapeHtml(client.company_name)}</div>` : ''}
            ${client && client.address ? `<div>${escapeHtml(client.address)}</div>` : ''}
            ${client && client.email ? `<div>${escapeHtml(client.email)}</div>` : ''}
            ${client && client.phone ? `<div>${escapeHtml(client.phone)}</div>` : ''}
          </div>
        </div>
      </div>

      ${statusBanner}

      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th class="col-right">Qty</th>
            <th class="col-right">Unit Price</th>
            <th class="col-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsRows}
        </tbody>
      </table>

      <div class="summary-section">
        <div class="totals-box">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>${formatMoney(invoice.subtotal, currency)}</span>
          </div>
          ${Number(invoice.discount_amount) > 0 ? `
            <div class="total-row">
              <span>Discount:</span>
              <span>-${formatMoney(invoice.discount_amount, currency)}</span>
            </div>
          ` : ''}
          ${Number(invoice.tax_amount) > 0 ? `
            <div class="total-row">
              <span>Tax (${invoice.tax_rate || 0}%):</span>
              <span>${formatMoney(invoice.tax_amount, currency)}</span>
            </div>
          ` : ''}
          <div class="total-row grand">
            <span>Total:</span>
            <span>${formatMoney(invoice.total, currency)}</span>
          </div>
          ${baseEquivRow}
          ${Number(invoice.amount_paid) > 0 ? `
            <div class="total-row highlight">
              <span>Amount Paid:</span>
              <span>${formatMoney(invoice.amount_paid, currency)}</span>
            </div>
            <div class="total-row highlight">
              <span>Balance Due:</span>
              <span>${formatMoney(Math.max(0, balanceDue), currency)}</span>
            </div>
          ` : ''}
        </div>
      </div>

      ${paystackCard}
      ${bankCard}

      ${invoice.notes || invoice.terms ? `
        <div class="notes-card">
          <strong>Notes &amp; Terms:</strong><br>
          ${escapeHtml([invoice.notes, invoice.terms].filter(Boolean).join(' — '))}
        </div>
      ` : ''}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Compiles a standalone HTML Quotation document
 */
function generateQuoteHtml(quote, client, profile, options = {}) {
  const currency = quote.currency || (profile && profile.default_currency) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';

  const items = quote.line_items || [];
  const lineItemsRows = items.map((item) => `
    <tr>
      <td>
        <div class="item-desc">${escapeHtml(item.description)}</div>
      </td>
      <td class="col-right">${Number(item.quantity) || 1}${item.unit_label ? ' ' + escapeHtml(item.unit_label) : ''}</td>
      <td class="col-right">${formatMoney(item.unit_price, currency)}</td>
      <td class="col-right">${formatMoney(item.amount, currency)}</td>
    </tr>
  `).join('');

  let baseEquivRow = '';
  if (quote.exchange_rate && Number(quote.exchange_rate) !== 1.0 && profile && profile.default_currency && profile.default_currency !== currency) {
    const baseCents = quote.base_amount_cents != null
      ? Number(quote.base_amount_cents)
      : computeBaseAmountCents(quote.total, quote.exchange_rate);
    const baseAmount = baseCents / 100;
    baseEquivRow = `
      <div class="total-row base-equiv">
        <span>Base Equiv (${escapeHtml(profile.default_currency)} @ ${Number(quote.exchange_rate).toFixed(4)}):</span>
        <span>${formatMoney(baseAmount, profile.default_currency)}</span>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quotation - ${escapeHtml(quote.quote_number)}</title>
  <style>${getThemeStyles(profile)}</style>
</head>
<body>
  <div class="print-bar">
    <button type="button" class="print-btn" onclick="window.print()">
      🖨️ Print Quotation
    </button>
  </div>
  <div class="document-wrapper">
    <div class="document-header-stripe"></div>
    <div class="document-body">
      <div class="header-section">
        <div class="brand-col">
          <h1>${escapeHtml(businessName)}</h1>
          <div class="brand-meta">
            ${profile && profile.address ? `<div>${escapeHtml(profile.address)}</div>` : ''}
            ${profile && profile.city ? `<div>${escapeHtml(profile.city)}${profile.state ? ', ' + escapeHtml(profile.state) : ''}</div>` : ''}
            ${profile && profile.email ? `<div>Email: ${escapeHtml(profile.email)}</div>` : ''}
          </div>
        </div>
        <div class="doc-meta-col">
          <span class="doc-type-pill">Quotation</span>
          <div class="doc-number">${escapeHtml(quote.quote_number)}</div>
          <ul class="meta-list">
            <li>Date: <strong>${escapeHtml(formatDate(quote.date_created))}</strong></li>
            <li>Valid Until: <strong>${escapeHtml(formatDate(quote.valid_until))}</strong></li>
            <li>Status: <strong>${escapeHtml(quote.status || 'Draft')}</strong></li>
          </ul>
        </div>
      </div>

      <div class="parties-grid">
        <div>
          <div class="party-card-title">Prepared For</div>
          <div class="party-name">${escapeHtml(client ? client.name : 'Valued Client')}</div>
          <div class="party-details">
            ${client && client.company_name ? `<div>${escapeHtml(client.company_name)}</div>` : ''}
            ${client && client.email ? `<div>${escapeHtml(client.email)}</div>` : ''}
          </div>
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th class="col-right">Qty</th>
            <th class="col-right">Unit Price</th>
            <th class="col-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItemsRows}
        </tbody>
      </table>

      <div class="summary-section">
        <div class="totals-box">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>${formatMoney(quote.subtotal, currency)}</span>
          </div>
          ${Number(quote.discount_amount) > 0 ? `
            <div class="total-row">
              <span>Discount:</span>
              <span>-${formatMoney(quote.discount_amount, currency)}</span>
            </div>
          ` : ''}
          ${Number(quote.tax_amount) > 0 ? `
            <div class="total-row">
              <span>Tax:</span>
              <span>${formatMoney(quote.tax_amount, currency)}</span>
            </div>
          ` : ''}
          <div class="total-row grand">
            <span>Total:</span>
            <span>${formatMoney(quote.total, currency)}</span>
          </div>
          ${baseEquivRow}
        </div>
      </div>

      ${quote.notes || quote.terms ? `
        <div class="notes-card">
          <strong>Notes &amp; Terms:</strong><br>
          ${escapeHtml([quote.notes, quote.terms].filter(Boolean).join(' — '))}
        </div>
      ` : ''}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Compiles a standalone Official Payment Receipt
 */
function generatePaymentReceiptHtml(payment, invoice, client, profile, options = {}) {
  const currency = (invoice && invoice.currency) || (profile && profile.default_currency) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt - ${escapeHtml(payment ? payment.reference_number || payment.id : 'Receipt')}</title>
  <style>${getThemeStyles(profile)}</style>
</head>
<body>
  <div class="print-bar">
    <button type="button" class="print-btn" onclick="window.print()">
      🖨️ Print Receipt
    </button>
  </div>
  <div class="document-wrapper">
    <div class="document-header-stripe" style="background: #10b981;"></div>
    <div class="document-body">
      <div class="header-section">
        <div class="brand-col">
          <h1>${escapeHtml(businessName)}</h1>
          <div class="brand-meta">
            ${profile && profile.email ? `<div>Email: ${escapeHtml(profile.email)}</div>` : ''}
            ${profile && profile.phone ? `<div>Tel: ${escapeHtml(profile.phone)}</div>` : ''}
          </div>
        </div>
        <div class="doc-meta-col">
          <span class="doc-type-pill" style="background: #ecfdf5; color: #065f46;">Payment Receipt</span>
          <div class="doc-number">RCP-${escapeHtml(payment ? payment.id : '1')}</div>
          <ul class="meta-list">
            <li>Receipt Date: <strong>${escapeHtml(formatDate(payment ? payment.payment_date : new Date().toISOString()))}</strong></li>
            <li>Ref: <strong>${escapeHtml(payment ? payment.reference_number || 'N/A' : 'N/A')}</strong></li>
          </ul>
        </div>
      </div>

      <div class="status-banner paid" style="justify-content: space-between;">
        <span class="receipt-stamp">&#10003; PAYMENT RECEIVED</span>
        <div style="font-size: 18px; font-weight: 800; color: #065f46;">
          ${formatMoney(payment ? payment.amount : 0, currency)}
        </div>
      </div>

      <div class="parties-grid">
        <div>
          <div class="party-card-title">Received From</div>
          <div class="party-name">${escapeHtml(client ? client.name : 'Valued Client')}</div>
          <div class="party-details">
            ${client && client.company_name ? `<div>${escapeHtml(client.company_name)}</div>` : ''}
            ${client && client.email ? `<div>${escapeHtml(client.email)}</div>` : ''}
          </div>
        </div>
        <div>
          <div class="party-card-title">Applied To Invoice</div>
          <div class="party-name">${escapeHtml(invoice ? invoice.invoice_number : '—')}</div>
          <div class="party-details">
            <div>Invoice Total: ${formatMoney(invoice ? invoice.total : 0, currency)}</div>
            <div>Payment Method: <strong>${escapeHtml(payment ? payment.payment_method || 'Direct Transfer' : 'Direct Transfer')}</strong></div>
          </div>
        </div>
      </div>

      <div class="summary-section">
        <div class="totals-box">
          <div class="total-row">
            <span>Payment Amount:</span>
            <span style="font-weight: 700; color: #10b981;">${formatMoney(payment ? payment.amount : 0, currency)}</span>
          </div>
          ${invoice ? `
            <div class="total-row">
              <span>Total Invoice Amount:</span>
              <span>${formatMoney(invoice.total, currency)}</span>
            </div>
            <div class="total-row">
              <span>Total Paid to Date:</span>
              <span>${formatMoney(invoice.amount_paid, currency)}</span>
            </div>
            <div class="total-row grand">
              <span>Remaining Balance:</span>
              <span>${formatMoney(Math.max(0, Number(invoice.balance_due) || 0), currency)}</span>
            </div>
          ` : ''}
        </div>
      </div>

      ${payment && payment.notes ? `
        <div class="notes-card">
          <strong>Payment Note:</strong> ${escapeHtml(payment.notes)}
        </div>
      ` : ''}
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  generateInvoiceHtml,
  generateQuoteHtml,
  generatePaymentReceiptHtml,
  getBankDetails,
  escapeHtml,
  formatMoney,
  formatDate,
};
