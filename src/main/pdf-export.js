const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { CURRENCIES } = require('../shared/constants');

const PAGE_SIZE = 'A4';
const MARGIN = 48;
const FOOTER_ZONE = 46;

const COLORS = {
  ink: '#1F2937',
  muted: '#6B7280',
  line: '#E5E7EB',
  headerFill: '#F3F4F6',
  altFill: '#FAFAFA',
  grandFill: '#F9FAFB',
  paid: '#166534',
  overdue: '#B91C1C',
};

const QUOTE_STATUS_LABELS = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
};

const INVOICE_STATUS_LABELS = {
  draft: 'Draft',
  sent: 'Sent',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
};

const LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg'];

// ---------- Shared formatting helpers ----------

function formatAmount(amount) {
  const n = Math.round((Number(amount || 0) + 1e-9) * 100) / 100;
  const parts = n.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function currencySymbol(code) {
  const c = (CURRENCIES || []).find((item) => item.code === code);
  return c ? c.symbol : null;
}

function isWinAnsiSafe(text) {
  return Array.from(text).every((ch) => {
    const c = ch.codePointAt(0);
    return (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || c === 0x20ac;
  });
}

function money(amount, currencyCode) {
  const code = currencyCode || 'USD';
  const symbol = currencySymbol(code);
  const value = formatAmount(amount);
  if (symbol && isWinAnsiSafe(symbol)) {
    return symbol + value;
  }
  return code + ' ' + value;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + (dateStr.includes('T') || dateStr.includes('Z') ? '' : 'T00:00:00'));
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function normalizeQty(value) {
  const n = Number(value);
  if (isNaN(n)) return '0';
  return String(Math.round(n * 100) / 100);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Overdue is calculated here too, mirroring the renderer logic: past its due
// date with a balance still owed. Paid wins when the balance is settled.
function effectiveInvoiceStatus(invoice) {
  if (Number(invoice.balance_due) <= 0.0001) return 'paid';
  if (invoice.date_due) {
    const due = new Date(String(invoice.date_due) + 'T00:00:00');
    if (!isNaN(due.getTime()) && due < startOfToday()) return 'overdue';
  }
  return invoice.status || 'draft';
}

function buildCompanyLines(profile) {
  const lines = [];
  if (!profile) return lines;
  const cityLine = [profile.address_line1, profile.address_line2].filter(Boolean);
  const stateLine = [profile.city, profile.state, profile.postal_code].filter(Boolean).join(', ');
  if (cityLine.length) lines.push(cityLine.join('\n'));
  if (stateLine) lines.push(stateLine);
  if (profile.country) lines.push(profile.country);
  return lines;
}

function buildClientLines(client) {
  const lines = [];
  if (!client) return lines;
  if (client.email) lines.push(client.email);
  if (client.phone) lines.push(client.phone);
  const cityLine = [client.address_line1, client.address_line2].filter(Boolean);
  const stateLine = [client.city, client.state, client.postal_code].filter(Boolean).join(', ');
  if (cityLine.length) lines.push(cityLine.join('\n'));
  if (stateLine) lines.push(stateLine);
  if (client.country) lines.push(client.country);
  return lines;
}

// ---------- Shared layout engine ----------

function createDocument({ title, author, subject }) {
  const doc = new PDFDocument({
    size: PAGE_SIZE,
    margin: MARGIN,
    bufferPages: true,
    info: { Title: title, Author: author, Subject: subject },
  });

  const chunks = [];
  const done = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageW = doc.page.width;
  const W = pageW - MARGIN * 2;
  return {
    doc,
    done,
    W,
    rightX: MARGIN + W - 210,
    rightW: 210,
    pageBottom: doc.page.height - MARGIN - FOOTER_ZONE,
    y: doc.y,
  };
}

function drawHeaderBrand(ctx, opts) {
  const { doc, W, rightX, rightW } = ctx;
  const { profile, businessName, rightLabel, rightNumber, metaRows } = opts;
  let y = ctx.y;

  const logoPath = profile && profile.logo_path;
  const embedLogo =
    logoPath &&
    LOGO_EXTENSIONS.includes(path.extname(String(logoPath)).toLowerCase()) &&
    fs.existsSync(logoPath);

  if (embedLogo) {
    try {
      doc.image(logoPath, MARGIN, y, { width: 130, height: 42 });
      doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.ink);
      doc.text(businessName, MARGIN, y + 50, { width: Math.max(180, W - rightW - 90), lineGap: 0 });
      y = doc.y + 9;
    } catch (err) {
      doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.ink);
      doc.text(businessName, MARGIN, y, { width: W - rightW, lineGap: 0 });
      y = doc.y + 8;
    }
  } else {
    doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.ink);
    doc.text(businessName, MARGIN, y, { width: W - rightW, lineGap: 0 });
    y = doc.y + 8;
  }

  const companyLines = buildCompanyLines(profile);
  if (companyLines.join('').trim()) {
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted);
    doc.text(companyLines.join('\n'), MARGIN, y, { width: Math.max(180, W - rightW - 90), lineGap: 2 });
    y = doc.y + 6;
  }

  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted).text(rightLabel.toUpperCase(), rightX, doc.y, { width: rightW, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.ink).text(rightNumber, rightX, doc.y + 2, { width: rightW, align: 'right' });

  let my = doc.y + 14;
  for (const [label, value] of metaRows) {
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.muted).text(label.toUpperCase(), rightX, my, { width: rightW, align: 'right', lineGap: 0 });
    my = doc.y + 2;
    doc.font('Helvetica').fontSize(10.5).fillColor(COLORS.ink).text(value, rightX, my, { width: rightW, align: 'right', lineGap: 0 });
    my = doc.y + 9;
  }

  ctx.y = Math.max(doc.y + 4, y + 26);
}

function drawDivider(ctx) {
  const { doc, W } = ctx;
  doc.moveTo(MARGIN, ctx.y).lineTo(MARGIN + W, ctx.y).strokeColor(COLORS.line).lineWidth(1).stroke();
  ctx.y += 24;
}

function drawClientBlock(ctx, client, label) {
  const { doc, W } = ctx;
  let y = ctx.y;

  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted).text(label.toUpperCase(), MARGIN, y, { lineGap: 0 });
  y = doc.y + 6;

  const clientName = (client && client.name) || '—';
  doc.font('Helvetica-Bold').fontSize(12.5).fillColor(COLORS.ink).text(clientName, MARGIN, y, { lineGap: 1 });
  y = doc.y + 3;

  if (client && client.company_name) {
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.ink).text(client.company_name, MARGIN, y, { lineGap: 1 });
    y = doc.y + 2;
  }

  const clientLines = buildClientLines(client);
  if (clientLines.join('').trim()) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
    doc.text(clientLines.join('\n'), MARGIN, y, { lineGap: 2 });
    y = doc.y + 6;
  }

  ctx.y = Math.max(y + 10, MARGIN + 150);
}

function drawItemsTable(ctx, items, currency) {
  const { doc, W } = ctx;
  const qtyW = 60;
  const priceW = 72;
  const totalW = 88;
  const descW = W - qtyW - priceW - totalW;
  const qtyX = MARGIN + descW;
  const priceX = qtyX + qtyW;
  const totalX = priceX + priceW;
  const rowPadY = 5.5;
  const headerH = 22;

  function drawTableHeader(yPos) {
    doc.rect(MARGIN, yPos, W, headerH).fill(COLORS.headerFill);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted);
    doc.text('DESCRIPTION', MARGIN + 6, yPos + 7.5, { width: descW - 12, lineGap: 0 });
    doc.text('QTY', qtyX, yPos + 7.5, { width: qtyW - 8, align: 'right', lineGap: 0 });
    doc.text('UNIT PRICE', priceX, yPos + 7.5, { width: priceW - 8, align: 'right', lineGap: 0 });
    doc.text('LINE TOTAL', totalX, yPos + 7.5, { width: totalW - 8, align: 'right', lineGap: 0 });
    doc.moveTo(MARGIN, yPos + headerH).lineTo(MARGIN + W, yPos + headerH).strokeColor(COLORS.line).lineWidth(1).stroke();
  }

  function ensureSpace(needed) {
    if (ctx.y + needed > ctx.pageBottom) {
      doc.addPage();
      ctx.y = doc.y;
      drawTableHeader(ctx.y);
      ctx.y += headerH;
    }
  }

  drawTableHeader(ctx.y);
  ctx.y += headerH;

  if (!items.length) {
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(COLORS.muted).text('No line items.', MARGIN + 6, ctx.y + 7, { width: W - 12 });
    ctx.y += 30;
    return;
  }

  items.forEach((item, idx) => {
    const desc = String(item.description || '');
    doc.font('Helvetica').fontSize(9.5);
    const descH = doc.heightOfString(desc, { width: descW - 12 }) + rowPadY * 2;
    const rowH = Math.max(24, Math.ceil(descH));

    ensureSpace(rowH + 2);
    if (idx % 2 === 1) {
      doc.rect(MARGIN, ctx.y, W, rowH).fill(COLORS.altFill);
    }

    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.ink);
    doc.text(desc, MARGIN + 6, ctx.y + rowPadY, { width: descW - 12, lineGap: 1, height: rowH - rowPadY * 2 });
    doc.text(normalizeQty(item.quantity), qtyX, ctx.y + rowPadY + 1.5, { width: qtyW - 8, align: 'right', lineGap: 0 });
    doc.text(money(item.unit_price, currency), priceX, ctx.y + rowPadY + 1.5, { width: priceW - 8, align: 'right', lineGap: 0 });
    doc.font('Helvetica-Bold').fillColor(COLORS.ink);
    doc.text(money(item.amount, currency), totalX, ctx.y + rowPadY + 1.5, { width: totalW - 8, align: 'right', lineGap: 0 });

    ctx.y += rowH;
    doc.moveTo(MARGIN, ctx.y).lineTo(MARGIN + W, ctx.y).strokeColor(COLORS.line).lineWidth(0.75).stroke();
    ctx.y += 1;
  });

  ctx.y += 20;
}

function drawTotals(ctx, opts) {
  const { doc, W } = ctx;
  const { rows, grandLabel, grandValue, extra } = opts;
  const totalsW = 230;
  const totalsX = MARGIN + W - totalsW;
  const labelW = totalsW * 0.55;
  const valueW = totalsW * 0.45;

  function totalsRow(label, value) {
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.ink);
    doc.text(label, totalsX, ctx.y + 3, { width: labelW, lineGap: 0 });
    doc.text(value, totalsX + labelW, ctx.y + 3, { width: valueW, align: 'right', lineGap: 0 });
    ctx.y += 22;
  }

  for (const [label, value] of rows) {
    totalsRow(label, value);
  }

  ctx.y += 2;
  doc.moveTo(totalsX, ctx.y).lineTo(totalsX + totalsW, ctx.y).strokeColor(COLORS.line).lineWidth(1).stroke();
  ctx.y += 8;

  if (ctx.y + 46 > ctx.pageBottom) {
    doc.addPage();
    ctx.y = doc.y;
  }

  const grandH = 34;
  doc.rect(totalsX, ctx.y, totalsW, grandH).fill(COLORS.grandFill);
  doc.moveTo(totalsX, ctx.y).lineTo(totalsX + totalsW, ctx.y).strokeColor(COLORS.ink).lineWidth(1.5).stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.ink);
  doc.text(grandLabel, totalsX + 10, ctx.y + 11, { width: labelW, lineGap: 0 });
  doc.text(grandValue, totalsX + labelW - 10, ctx.y + 11, { width: valueW + 10, align: 'right', lineGap: 0 });
  ctx.y += grandH + 8;

  for (const [label, value] of extra) {
    if (ctx.y + 22 > ctx.pageBottom) {
      doc.addPage();
      ctx.y = doc.y;
    }
    doc.font('Helvetica').fontSize(9.5).fillColor(label === 'Balance due' ? COLORS.ink : COLORS.muted);
    doc.text(label, totalsX, ctx.y + 3, { width: labelW, lineGap: 0 });
    doc.text(value, totalsX + labelW, ctx.y + 3, { width: valueW, align: 'right', lineGap: 0 });
    ctx.y += 22;
  }

  ctx.y += 18;
}

function drawTextSection(ctx, title, body) {
  const { doc, W } = ctx;
  if (!body || !String(body).trim()) return;
  if (ctx.y + 30 > ctx.pageBottom) {
    doc.addPage();
    ctx.y = doc.y;
  }
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted).text(title.toUpperCase(), MARGIN, ctx.y, { lineGap: 0 });
  ctx.y = doc.y + 6;
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink);
  doc.text(String(body).trim(), MARGIN, ctx.y, { width: W, lineGap: 2 });
}

function drawStampOnFirstPage(ctx, text, color) {
  const { doc } = ctx;
  const cx = doc.page.width / 2;
  const cy = doc.page.height * 0.42;
  doc.switchToPage(0);
  doc.save();
  doc.opacity(0.12);
  doc.font('Helvetica-Bold').fontSize(64).fillColor(color);
  doc.rotate(-24, { origin: [cx, cy] });
  doc.text(text, cx - 220, cy - 30, { width: 440, align: 'center', lineGap: 0 });
  doc.rotate(0);
  doc.restore();
}

function drawFooter(ctx, leftText) {
  const { doc, W } = ctx;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const fy = doc.page.height - MARGIN + 6;
    doc.moveTo(MARGIN, fy - 8).lineTo(MARGIN + W, fy - 8).strokeColor(COLORS.line).lineWidth(0.75).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
    doc.text(leftText, MARGIN, fy, { width: W / 2, lineGap: 0 });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN + W / 2, fy, { width: W / 2, align: 'right', lineGap: 0 });
  }
}

// ---------- Quote PDF ----------

function renderQuotePdf(quote, client, profile, opts) {
  const currency = (opts && opts.currency) || (profile && profile.default_currency) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';

  const ctx = createDocument({
    title: `Quote ${quote.quote_number}`,
    author: businessName,
    subject: 'Quotation',
  });
  const { doc } = ctx;

  drawHeaderBrand(ctx, {
    profile,
    businessName,
    rightLabel: 'QUOTE',
    rightNumber: quote.quote_number || '',
    metaRows: [
      ['Issue date', formatDate(quote.date_created)],
      ['Valid until', formatDate(quote.valid_until)],
      ['Status', QUOTE_STATUS_LABELS[quote.status] || quote.status || ''],
    ],
  });
  drawDivider(ctx);
  drawClientBlock(ctx, client, 'PREPARED FOR');
  drawItemsTable(ctx, quote.line_items || [], currency);

  const totalRows = [['Subtotal', money(quote.subtotal, currency)]];
  if (Number(quote.discount_amount) > 0) totalRows.push(['Discount', money(quote.discount_amount, currency)]);
  if (Number(quote.tax_amount) > 0) totalRows.push(['Tax', money(quote.tax_amount, currency)]);

  drawTotals(ctx, {
    rows: totalRows,
    grandLabel: 'GRAND TOTAL',
    grandValue: money(quote.total, currency),
    extra: [],
  });

  if (quote.notes || quote.terms) {
    const blocks = [];
    if (quote.notes) blocks.push(quote.notes);
    if (quote.terms) blocks.push(quote.terms);
    drawTextSection(ctx, 'Notes & Terms', blocks.join('\n\n'));
  }

  drawFooter(ctx, `Prepared by ${businessName}`);
  doc.end();
  return ctx.done;
}

// ---------- Invoice PDF ----------

function renderInvoicePdf(invoice, client, profile, opts) {
  const currency = (opts && opts.currency) || (profile && profile.default_currency) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';
  const status = effectiveInvoiceStatus(invoice);

  const ctx = createDocument({
    title: `Invoice ${invoice.invoice_number}`,
    author: businessName,
    subject: 'Invoice',
  });
  const { doc } = ctx;

  drawHeaderBrand(ctx, {
    profile,
    businessName,
    rightLabel: 'INVOICE',
    rightNumber: invoice.invoice_number || '',
    metaRows: [
      ['Issue date', formatDate(invoice.date_created)],
      ['Due date', formatDate(invoice.date_due)],
      ['Status', INVOICE_STATUS_LABELS[status] || status || ''],
    ],
  });
  drawDivider(ctx);
  drawClientBlock(ctx, client, 'BILLED TO');
  drawItemsTable(ctx, invoice.line_items || [], currency);

  const totalRows = [['Subtotal', money(invoice.subtotal, currency)]];
  if (Number(invoice.discount_amount) > 0) totalRows.push(['Discount', money(invoice.discount_amount, currency)]);
  if (Number(invoice.tax_amount) > 0) totalRows.push(['Tax', money(invoice.tax_amount, currency)]);

  const paid = Number(invoice.amount_paid) || 0;
  const balance = Number(invoice.balance_due) || 0;
  const extraRows = [];
  if (paid > 0.0001) {
    extraRows.push(['Amount paid', money(paid, currency)]);
    extraRows.push(['Balance due', money(Math.max(balance, 0), currency)]);
  } else if (balance > 0.0001) {
    extraRows.push(['Balance due', money(balance, currency)]);
  }

  drawTotals(ctx, {
    rows: totalRows,
    grandLabel: 'TOTAL DUE',
    grandValue: money(invoice.total, currency),
    extra: extraRows,
  });

  drawFooter(ctx, `Prepared by ${businessName}`);

  if (status === 'paid' || status === 'overdue') {
    drawStampOnFirstPage(ctx, status === 'paid' ? 'PAID' : 'OVERDUE', status === 'paid' ? COLORS.paid : COLORS.overdue);
  }

  doc.end();
  return ctx.done;
}

module.exports = { renderQuotePdf, renderInvoicePdf };