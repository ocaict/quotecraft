const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { CURRENCIES } = require('../shared/constants');

const PAGE_SIZE = 'A4';
const MARGIN = 48;
const FOOTER_ZONE = 46;

const THEMES = {
  classic: {
    ink: '#1F2937',
    muted: '#6B7280',
    line: '#E5E7EB',
    headerFill: '#F3F4F6',
    altFill: '#FAFAFA',
    grandFill: '#F9FAFB',
    paid: '#166534',
    overdue: '#B91C1C',
    primary: '#1F2937',
  },
  modern: {
    ink: '#0F172A',
    muted: '#64748B',
    line: '#E2E8F0',
    headerFill: '#EEF2FF',
    altFill: '#F8FAFC',
    grandFill: '#F1F5F9',
    paid: '#15803D',
    overdue: '#BE123C',
    primary: '#4F46E5',
  },
  minimal: {
    ink: '#111827',
    muted: '#9CA3AF',
    line: '#E5E7EB',
    headerFill: '#FFFFFF',
    altFill: '#FFFFFF',
    grandFill: '#FAFAFA',
    paid: '#166534',
    overdue: '#DC2626',
    primary: '#111827',
  },
  dark: {
    ink: '#1F2937',
    muted: '#4B5563',
    line: '#374151',
    headerFill: '#111827',
    headerText: '#FFFFFF',
    altFill: '#F3F4F6',
    grandFill: '#E5E7EB',
    paid: '#16A34A',
    overdue: '#EF4444',
    primary: '#6366F1',
  },
};

let activeThemeColors = THEMES.classic;
const COLORS = new Proxy(THEMES.classic, {
  get(target, prop) {
    return (activeThemeColors && activeThemeColors[prop]) !== undefined ? activeThemeColors[prop] : target[prop];
  },
});

function getThemeColors(themeName) {
  return THEMES[themeName] || THEMES.classic;
}

const QUOTE_STATUS_LABELS = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
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

function createDocument({ title, author, subject, theme }) {
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
  const themeKey = theme && THEMES[theme] ? theme : 'classic';
  const colors = getThemeColors(themeKey);
  activeThemeColors = colors;

  return {
    doc,
    done,
    W,
    rightX: MARGIN + W - 210,
    rightW: 210,
    pageBottom: doc.page.height - MARGIN - FOOTER_ZONE,
    y: doc.y,
    theme: themeKey,
    colors,
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
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.primary || COLORS.ink).text(rightNumber, rightX, doc.y + 2, { width: rightW, align: 'right' });

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

function drawClientBlock(ctx, client, label, contact) {
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

  if (contact && contact.name) {
    const contactLine = `Attn: ${contact.name}${contact.role ? ` (${contact.role})` : ''}`;
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.ink).text(contactLine, MARGIN, y, { lineGap: 1 });
    y = doc.y + 2;
    if (contact.email || contact.phone) {
      const contactInfo = [contact.email, contact.phone].filter(Boolean).join(' • ');
      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(contactInfo, MARGIN, y, { lineGap: 1 });
      y = doc.y + 3;
    }
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
  const qtyW = 42;
  const priceW = 62;
  const discW = 50;
  const taxW = 46;
  const totalW = 74;
  const descW = W - qtyW - priceW - discW - taxW - totalW;
  const qtyX = MARGIN + descW;
  const priceX = qtyX + qtyW;
  const discX = priceX + priceW;
  const taxX = discX + discW;
  const totalX = taxX + taxW;
  const rowPadY = 5.5;
  const headerH = 22;

  function drawTableHeader(yPos) {
    doc.rect(MARGIN, yPos, W, headerH).fill(COLORS.headerFill);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.headerText || COLORS.muted);
    doc.text('DESCRIPTION', MARGIN + 6, yPos + 7.5, { width: descW - 12, lineGap: 0 });
    doc.text('QTY', qtyX, yPos + 7.5, { width: qtyW - 8, align: 'right', lineGap: 0 });
    doc.text('UNIT PRICE', priceX, yPos + 7.5, { width: priceW - 8, align: 'right', lineGap: 0 });
    doc.text('DISC', discX, yPos + 7.5, { width: discW - 8, align: 'right', lineGap: 0 });
    doc.text('TAX', taxX, yPos + 7.5, { width: taxW - 8, align: 'right', lineGap: 0 });
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

    // Discount column
    let discLabel = '\u2014';
    if (item.discount_type && item.discount_type !== 'none' && Number(item.discount_value) > 0) {
      discLabel = item.discount_type === 'percent'
        ? `${Number(item.discount_value)}%`
        : `\u2212${money(item.discount_value, currency)}`;
    }
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
    doc.text(discLabel, discX, ctx.y + rowPadY + 1.5, { width: discW - 8, align: 'right', lineGap: 0 });

    // Tax rate column
    const taxRateLabel = Number(item.tax_rate) > 0 ? `${item.tax_rate}%` : '0%';
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
    doc.text(taxRateLabel, taxX, ctx.y + rowPadY + 1.5, { width: taxW - 8, align: 'right', lineGap: 0 });

    doc.font('Helvetica-Bold').fillColor(COLORS.ink);
    doc.text(money(item.amount, currency), totalX, ctx.y + rowPadY + 1.5, { width: totalW - 8, align: 'right', lineGap: 0 });

    ctx.y += rowH;
    doc.moveTo(MARGIN, ctx.y).lineTo(MARGIN + W, ctx.y).strokeColor(COLORS.line).lineWidth(0.75).stroke();
    ctx.y += 1;
  });

  ctx.y += 20;
}

function buildPdfTaxRows(lineItems, subtotal, discountAmount, currency, taxLines) {
  let parsedTaxLines = taxLines;
  if (typeof parsedTaxLines === 'string' && parsedTaxLines.trim()) {
    try { parsedTaxLines = JSON.parse(parsedTaxLines); } catch (_) { parsedTaxLines = null; }
  }
  if (Array.isArray(parsedTaxLines) && parsedTaxLines.length > 0) {
    const rows = [];
    let totalTax = 0;
    for (const tl of parsedTaxLines) {
      const name = tl.name || tl.label || 'Tax';
      const rateStr = tl.rate !== undefined && tl.rate !== null && !isNaN(Number(tl.rate)) ? `${tl.rate}%` : '';
      const label = rateStr ? `${name} (${rateStr})` : name;
      let amt = Number(tl.amount);
      if (isNaN(amt) || amt === 0) {
        const taxableBase = Math.max(0, (Number(subtotal) || 0) - (Number(discountAmount) || 0));
        amt = Math.round(taxableBase * (Number(tl.rate) || 0)) / 100;
      }
      totalTax += amt;
      rows.push([label, money(amt, currency)]);
    }
    if (parsedTaxLines.length > 1) {
      rows.push(['Total Tax', money(totalTax, currency)]);
    }
    return rows;
  }

  const subtotalCents = Math.round((Number(subtotal) || 0) * 100);
  const docDiscCents = Math.round((Number(discountAmount) || 0) * 100);
  const ratio = subtotalCents > 0 ? (subtotalCents - docDiscCents) / subtotalCents : 1;

  const brackets = new Map();
  for (const item of (lineItems || [])) {
    const rate = Number(item.tax_rate) || 0;
    const amountCents = Math.round((Number(item.amount) || 0) * 100);
    if (!brackets.has(rate)) {
      brackets.set(rate, { rate, netCents: 0 });
    }
    brackets.get(rate).netCents += amountCents;
  }

  const list = [];
  let totalTaxCents = 0;
  const sortedRates = Array.from(brackets.keys()).sort((a, b) => a - b);
  for (const rate of sortedRates) {
    const b = brackets.get(rate);
    const taxableBasisCents = Math.round(b.netCents * ratio);
    const taxCents = rate > 0 ? Math.round(taxableBasisCents * rate / 100) : 0;
    totalTaxCents += taxCents;
    list.push({
      rate,
      taxableBasis: taxableBasisCents / 100,
      taxAmount: taxCents / 100,
    });
  }

  const rows = [];
  if (list.length === 0) {
    rows.push(['Tax', money(0, currency)]);
  } else if (list.length === 1 && list[0].rate === 0) {
    rows.push([`Tax-exempt (0% on ${money(list[0].taxableBasis, currency)})`, money(0, currency)]);
  } else {
    for (const item of list) {
      if (item.rate === 0) {
        rows.push([`Tax-exempt (0% on ${money(item.taxableBasis, currency)})`, money(0, currency)]);
      } else {
        rows.push([`Tax (${item.rate}% on ${money(item.taxableBasis, currency)})`, money(item.taxAmount, currency)]);
      }
    }
    if (list.length > 1) {
      rows.push(['Total Tax', money(totalTaxCents / 100, currency)]);
    }
  }
  return rows;
}

function drawTotals(ctx, opts) {
  const { doc, W } = ctx;
  const { rows, grandLabel, grandValue, extra } = opts;
  const grandColor = opts.grandColor || COLORS.ink;
  const totalsW = 250;
  const totalsX = MARGIN + W - totalsW;
  const labelW = totalsW * 0.60;
  const valueW = totalsW * 0.40;

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
  doc.moveTo(totalsX, ctx.y).lineTo(totalsX + totalsW, ctx.y).strokeColor(COLORS.primary || COLORS.ink).lineWidth(1.5).stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor(grandColor);
  doc.text(grandLabel, totalsX + 10, ctx.y + 11, { width: labelW, lineGap: 0 });
  doc.text(grandValue, totalsX + labelW - 10, ctx.y + 11, { width: valueW + 10, align: 'right', lineGap: 0 });
  ctx.y += grandH + 8;

  for (const [label, value, color] of extra) {
    if (ctx.y + 22 > ctx.pageBottom) {
      doc.addPage();
      ctx.y = doc.y;
    }
    doc.font('Helvetica').fontSize(9.5).fillColor(color || (label === 'Balance due' ? COLORS.ink : COLORS.muted));
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
  doc.text(text, cx - 220, cy - 30, { width: 440, align: 'center', lineGap: 0, lineBreak: false });
  doc.rotate(0);
  doc.restore();
}

function drawFooter(ctx, leftText) {
  const { doc, W } = ctx;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - MARGIN + 6;
    doc.moveTo(MARGIN, fy - 8).lineTo(MARGIN + W, fy - 8).strokeColor(COLORS.line).lineWidth(0.75).stroke();
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
    doc.text(leftText, MARGIN, fy, { width: W / 2, lineGap: 0, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN + W / 2, fy, { width: W / 2, align: 'right', lineGap: 0, lineBreak: false });
    doc.page.margins.bottom = oldBottom;
  }
}

function drawQuoteAcceptanceSection(ctx, quote, client, profile) {
  const { doc, W } = ctx;
  const isAccepted = quote.status === 'accepted';
  const estimatedH = isAccepted ? 65 : 100;
  if (ctx.y + estimatedH > ctx.pageBottom) {
    doc.addPage();
    ctx.y = doc.y;
  } else {
    ctx.y += 14;
  }

  const boxW = W;
  const boxPadding = 12;

  // Section Header
  doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted).text('ACCEPTANCE & CONFIRMATION', MARGIN, ctx.y, { lineGap: 0 });
  ctx.y = doc.y + 6;

  if (isAccepted) {
    const acceptMethodLabels = {
      email: 'Email reply',
      phone: 'Phone call',
      signed_document: 'Signed document',
      purchase_order: 'Purchase Order',
      in_person: 'In-person confirmation',
      other: 'Direct confirmation',
    };
    const methodStr = acceptMethodLabels[quote.acceptance_method] || quote.acceptance_method || 'Direct confirmation';
    const acceptedByStr = quote.accepted_by ? ` by ${quote.accepted_by}` : '';
    const acceptedDateStr = formatDate(quote.date_accepted);

    const bannerH = quote.acceptance_note ? 48 : 36;
    doc.rect(MARGIN, ctx.y, boxW, bannerH).fill('#F0FDF4');
    doc.rect(MARGIN, ctx.y, boxW, bannerH).strokeColor('#86EFAC').lineWidth(1).stroke();

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#166534');
    doc.text(`\u2713 FORMALLY ACCEPTED (${methodStr}${acceptedByStr} on ${acceptedDateStr})`, MARGIN + 12, ctx.y + 9, { width: boxW - 24 });

    if (quote.acceptance_note) {
      doc.font('Helvetica').fontSize(8.5).fillColor('#14532D');
      doc.text(`Paper Trail Note: ${quote.acceptance_note}`, MARGIN + 12, ctx.y + 25, { width: boxW - 24 });
    }
    ctx.y += bannerH + 10;
  } else {
    const boxInnerH = 92;
    doc.rect(MARGIN, ctx.y, boxW, boxInnerH).fill('#F9FAFB');
    doc.rect(MARGIN, ctx.y, boxW, boxInnerH).strokeColor(COLORS.line).lineWidth(1).stroke();

    const instructions = quote.acceptance_instructions
      || (profile && profile.default_quote_acceptance_instructions)
      || 'To accept this quote, please reply to confirm via email or phone.';

    const senderEmail = (profile && profile.email) || '';
    const senderPhone = (profile && profile.phone) || '';
    let contactLine = '';
    if (senderEmail && senderPhone) {
      contactLine = `Reply to: ${senderEmail}  |  Phone: ${senderPhone}`;
    } else if (senderEmail) {
      contactLine = `Reply to: ${senderEmail}`;
    } else if (senderPhone) {
      contactLine = `Phone: ${senderPhone}`;
    }

    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink);
    doc.text(instructions, MARGIN + boxPadding, ctx.y + 8, { width: boxW - boxPadding * 2 });

    if (contactLine) {
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
      doc.text(contactLine, MARGIN + boxPadding, doc.y + 2, { width: boxW - boxPadding * 2 });
    }

    const sigY = ctx.y + 44;
    const colW = (boxW - boxPadding * 3) / 2;
    const col1X = MARGIN + boxPadding;
    const col2X = col1X + colW + boxPadding;

    // Line 1: Signature & Date
    doc.moveTo(col1X, sigY + 14).lineTo(col1X + colW - 10, sigY + 14).strokeColor('#CBD5E1').lineWidth(0.8).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text('Authorized Client Signature', col1X, sigY + 17);

    doc.moveTo(col2X, sigY + 14).lineTo(col2X + colW - 10, sigY + 14).strokeColor('#CBD5E1').lineWidth(0.8).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text('Date', col2X, sigY + 17);

    // Line 2: Printed Name & PO / Ref
    const sigY2 = sigY + 28;
    doc.moveTo(col1X, sigY2 + 14).lineTo(col1X + colW - 10, sigY2 + 14).strokeColor('#CBD5E1').lineWidth(0.8).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text('Printed Name & Title', col1X, sigY2 + 17);

    doc.moveTo(col2X, sigY2 + 14).lineTo(col2X + colW - 10, sigY2 + 14).strokeColor('#CBD5E1').lineWidth(0.8).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text('PO / Reference # (optional)', col2X, sigY2 + 17);

    ctx.y += boxInnerH + 10;
  }
}

// ---------- Quote PDF ----------

function renderQuotePdf(quote, client, profile, opts) {
  const currency = quote.currency || (profile && profile.default_currency) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';
  const theme = (opts && opts.theme) || (profile && profile.pdf_theme) || 'classic';

  const ctx = createDocument({
    title: `Quote ${quote.quote_number}`,
    author: businessName,
    subject: 'Quotation',
    theme,
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
  drawClientBlock(ctx, client, 'PREPARED FOR', quote.contact);
  drawItemsTable(ctx, quote.line_items || [], currency);

  const totalRows = [['Subtotal', money(quote.subtotal, currency)]];
  if (Number(quote.discount_amount) > 0) totalRows.push(['Discount', `\u2212${money(quote.discount_amount, currency)}`]);
  const taxRows = buildPdfTaxRows(quote.line_items || [], quote.subtotal, quote.discount_amount, currency, quote.tax_lines);
  taxRows.forEach((r) => totalRows.push(r));

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

  drawQuoteAcceptanceSection(ctx, quote, client, profile);

  drawFooter(ctx, `Prepared by ${businessName}`);
  doc.end();
  return ctx.done;
}

// ---------- Invoice PDF ----------

function renderInvoicePdf(invoice, client, profile, opts) {
  const currency = invoice.currency || (profile && profile.default_currency) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';
  const status = effectiveInvoiceStatus(invoice);
  const theme = (opts && opts.theme) || (profile && profile.pdf_theme) || 'classic';

  let docLabel = 'INVOICE';
  let grandLabel = 'TOTAL DUE';
  if (invoice.invoice_type === 'deposit') {
    docLabel = 'DEPOSIT INVOICE';
    grandLabel = 'DEPOSIT DUE';
  } else if (invoice.invoice_type === 'final') {
    docLabel = 'FINAL INVOICE';
    grandLabel = 'FINAL BALANCE DUE';
  }

  const ctx = createDocument({
    title: `${docLabel} ${invoice.invoice_number}`,
    author: businessName,
    subject: docLabel,
    theme,
  });
  const { doc } = ctx;

  const metaRows = [
    ['Issue date', formatDate(invoice.date_created)],
    ['Due date', formatDate(invoice.date_due)],
    ['Status', INVOICE_STATUS_LABELS[status] || status || ''],
  ];

  if (invoice.original_quote_total && (invoice.invoice_type === 'deposit' || invoice.invoice_type === 'final')) {
    metaRows.push(['Full Quote Value', money(invoice.original_quote_total, currency)]);
  }

  drawHeaderBrand(ctx, {
    profile,
    businessName,
    rightLabel: docLabel,
    rightNumber: invoice.invoice_number || '',
    metaRows,
  });
  drawDivider(ctx);
  drawClientBlock(ctx, client, 'BILLED TO', invoice.contact);
  drawItemsTable(ctx, invoice.line_items || [], currency);

  const totalRows = [['Subtotal', money(invoice.subtotal, currency)]];
  if (Number(invoice.discount_amount) > 0) totalRows.push(['Discount', `\u2212${money(invoice.discount_amount, currency)}`]);
  const taxRows = buildPdfTaxRows(invoice.line_items || [], invoice.subtotal, invoice.discount_amount, currency, invoice.tax_lines);
  taxRows.forEach((r) => totalRows.push(r));

  const paid = Number(invoice.amount_paid) || 0;
  const credited = Number(invoice.amount_credited) || 0;
  const balance = Number(invoice.balance_due) || 0;
  const netPaid = Math.max(0, Math.round((paid - credited) * 100) / 100);
  const extraRows = [];
  if (paid > 0.0001) {
    extraRows.push(['Amount paid', money(paid, currency)]);
    if (credited > 0.0001) {
      extraRows.push(['Credited', `\u2212${money(credited, currency)}`]);
      extraRows.push(['Net paid', money(netPaid, currency)]);
    }
    extraRows.push(['Balance due', money(Math.max(balance, 0), currency)]);
  } else if (balance > 0.0001) {
    extraRows.push(['Balance due', money(balance, currency)]);
  } else if (credited > 0.0001) {
    extraRows.push(['Credited', `\u2212${money(credited, currency)}`]);
    extraRows.push(['Net paid', money(netPaid, currency)]);
  }

  drawTotals(ctx, {
    rows: totalRows,
    grandLabel,
    grandValue: money(invoice.total, currency),
    extra: extraRows,
  });

  if (invoice.notes || invoice.terms) {
    const blocks = [];
    if (invoice.notes) blocks.push(invoice.notes);
    if (invoice.terms) blocks.push(invoice.terms);
    drawTextSection(ctx, 'Notes & Terms', blocks.join('\n\n'));
  }

  drawFooter(ctx, `Prepared by ${businessName}`);

  if (status === 'paid' || status === 'overdue') {
    drawStampOnFirstPage(ctx, status === 'paid' ? 'PAID' : 'OVERDUE', status === 'paid' ? COLORS.paid : COLORS.overdue);
  }

  doc.end();
  return ctx.done;
}

// ---------- Print HTML (mirrors the PDF export layout) ----------

function imageToDataUrl(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function buildPrintHeaderHtml({ profile, businessName, pageLabel, docNumber, metaRows }) {
  const logoPath = profile && profile.logo_path;
  let logoHtml = '';
  let businessNameSize = 20;
  if (logoPath && LOGO_EXTENSIONS.includes(path.extname(String(logoPath)).toLowerCase()) && fs.existsSync(logoPath)) {
    try {
      logoHtml = `<img src="${imageToDataUrl(logoPath)}" alt="" class="logo">`;
      businessNameSize = 15;
    } catch (err) {
      logoHtml = '';
    }
  }

  const companyLines = buildCompanyLines(profile);
  const companyHtml = companyLines.join('').trim()
    ? `<div class="company-lines">${companyLines.map(escapeHtml).join('<br>')}</div>`
    : '';

  const metaHtml = (metaRows || [])
    .filter(Boolean)
    .map(([label, value]) =>
      `<div class="meta-pair"><div class="meta-label">${escapeHtml(String(label).toUpperCase())}</div><div class="meta-value">${escapeHtml(value)}</div></div>`
    )
    .join('');

  return `
    <table class="doc-header"><tr>
      <td class="brand-cell">
        ${logoHtml}
        <div class="business-name" style="font-size:${businessNameSize}pt;">${escapeHtml(businessName)}</div>
        ${companyHtml}
      </td>
      <td class="meta-cell">
        <div class="doc-label">${escapeHtml(String(pageLabel).toUpperCase())}</div>
        <div class="doc-number">${escapeHtml(docNumber || '')}</div>
        ${metaHtml}
      </td>
    </tr></table>
    <div class="divider"></div>`;
}

function buildPrintClientHtml(clientLabel, client, contact) {
  const clientName = (client && client.name) || '\u2014';
  let html = '<div class="client-block">';
  html += `<div class="client-label">${escapeHtml(String(clientLabel).toUpperCase())}</div>`;
  html += `<div class="client-name">${escapeHtml(clientName)}</div>`;
  if (client && client.company_name) {
    html += `<div class="client-company">${escapeHtml(client.company_name)}</div>`;
  }
  if (contact && contact.name) {
    html += `<div class="client-attn"><strong>Attn: ${escapeHtml(contact.name)}${contact.role ? ` (${escapeHtml(contact.role)})` : ''}</strong></div>`;
    if (contact.email || contact.phone) {
      html += `<div class="client-attn-info">${escapeHtml([contact.email, contact.phone].filter(Boolean).join(' \u2022 '))}</div>`;
    }
  }
  const clientLines = buildClientLines(client);
  if (clientLines.join('').trim()) {
    html += `<div class="client-address">${clientLines.map(escapeHtml).join('<br>')}</div>`;
  }
  html += '</div>';
  return html;
}

function buildPrintItemsHtml(items, currency) {
  if (!items || !items.length) {
    return '<table class="items"><tbody><tr><td class="no-items">No line items.</td></tr></tbody></table>';
  }

  const rows = items.map((item, idx) => {
    let discLabel = '\u2014';
    if (item.discount_type && item.discount_type !== 'none' && Number(item.discount_value) > 0) {
      discLabel = item.discount_type === 'percent'
        ? `${Number(item.discount_value)}%`
        : `\u2212${money(item.discount_value, currency)}`;
    }
    const taxLabel = Number(item.tax_rate) > 0 ? `${item.tax_rate}%` : '0%';
    return `<tr${idx % 2 === 1 ? ' class="alt"' : ''}>
      <td class="col-desc">${escapeHtml(String(item.description || ''))}</td>
      <td class="col-num">${escapeHtml(normalizeQty(item.quantity))}</td>
      <td class="col-num">${money(item.unit_price, currency)}</td>
      <td class="col-num">${escapeHtml(discLabel)}</td>
      <td class="col-num">${escapeHtml(taxLabel)}</td>
      <td class="col-num"><strong>${money(item.amount, currency)}</strong></td>
    </tr>`;
  }).join('');

  return `<table class="items">
    <thead><tr>
      <th class="col-desc">DESCRIPTION</th>
      <th class="col-num">QTY</th>
      <th class="col-num">UNIT PRICE</th>
      <th class="col-num">DISC</th>
      <th class="col-num">TAX</th>
      <th class="col-num">LINE TOTAL</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildPrintTotalsHtml(totalRows, grandLabel, grandValue, extraRows) {
  const rowHtml = (totalRows || []).map(([label, value]) =>
    `<div class="t-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`
  ).join('');
  const extraHtml = (extraRows || []).map(([label, value]) =>
    `<div class="t-row ${label === 'Balance due' ? 'due' : 'muted'}"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`
  ).join('');
  return `<div class="totals">
    ${rowHtml}
    <div class="t-divider"></div>
    <div class="grand"><span>${escapeHtml(grandLabel)}</span><span>${escapeHtml(grandValue)}</span></div>
    ${extraHtml}
  </div>`;
}

function buildPrintNotesHtml(notesTerms) {
  if (!notesTerms || !String(notesTerms).trim()) return '';
  return `<div class="notes">
    <div class="notes-title">NOTES &amp; TERMS</div>
    <div class="notes-body">${escapeHtml(notesTerms)}</div>
  </div>`;
}

function buildPrintAcceptanceHtml(quote, profile) {
  const acceptMethodLabels = {
    email: 'Email reply',
    phone: 'Phone call',
    signed_document: 'Signed document',
    purchase_order: 'Purchase Order',
    in_person: 'In-person confirmation',
    other: 'Direct confirmation',
  };

  if (quote.status === 'accepted') {
    const methodStr = acceptMethodLabels[quote.acceptance_method] || quote.acceptance_method || 'Direct confirmation';
    const acceptedByStr = quote.accepted_by ? ` by ${quote.accepted_by}` : '';
    const acceptedDateStr = formatDate(quote.date_accepted);
    return `<div class="acceptance accepted">
      <div class="accept-title">&#10003; FORMALLY ACCEPTED (${escapeHtml(methodStr)}${escapeHtml(acceptedByStr)} on ${escapeHtml(acceptedDateStr)})</div>
      ${quote.acceptance_note ? `<div class="accept-note"><strong>Paper Trail Note:</strong> ${escapeHtml(quote.acceptance_note)}</div>` : ''}
    </div>`;
  }

  const instructions = quote.acceptance_instructions
    || (profile && profile.default_quote_acceptance_instructions)
    || 'To accept this quote, please reply to confirm via email or phone.';
  const senderEmail = (profile && profile.email) || '';
  const senderPhone = (profile && profile.phone) || '';
  let contactLine = '';
  if (senderEmail && senderPhone) {
    contactLine = `Reply to: ${senderEmail}  |  Phone: ${senderPhone}`;
  } else if (senderEmail) {
    contactLine = `Reply to: ${senderEmail}`;
  } else if (senderPhone) {
    contactLine = `Phone: ${senderPhone}`;
  }

  return `<div class="acceptance pending">
    <div class="accept-title">ACCEPTANCE &amp; CONFIRMATION</div>
    <div class="accept-instructions"><strong>${escapeHtml(instructions)}</strong></div>
    ${contactLine ? `<div class="accept-contact">${escapeHtml(contactLine)}</div>` : ''}
    <div class="sig-grid">
      <div class="sig-field"><div class="sig-line"></div><label>Authorized Client Signature</label></div>
      <div class="sig-field"><div class="sig-line"></div><label>Date</label></div>
      <div class="sig-field"><div class="sig-line"></div><label>Printed Name &amp; Title</label></div>
      <div class="sig-field"><div class="sig-line"></div><label>PO / Reference # (optional)</label></div>
    </div>
  </div>`;
}

function renderDocumentPrintHtml(opts) {
  const {
    pageLabel,
    docNumber,
    businessName,
    profile,
    metaRows,
    clientLabel,
    client,
    contact,
    items,
    currency,
    totalRows,
    grandLabel,
    grandValue,
    extraRows,
    notesTerms,
    footerLeft,
    acceptanceHtml,
    stamp,
  } = opts;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(`${pageLabel} ${docNumber}`)}</title>
<style>
  @page { size: A4; margin: 46px 46px 62px 46px; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    position: relative;
    font-family: Helvetica, Arial, 'Segoe UI', sans-serif;
    color: #1F2937;
    font-size: 9.5pt;
    line-height: 1.35;
  }
  .doc-header { width: 100%; border-collapse: collapse; }
  .doc-header td { vertical-align: top; padding: 0; }
  .brand-cell { width: 100%; }
  .logo { max-height: 42px; max-width: 260px; margin-bottom: 8px; }
  .business-name { font-size: 20pt; font-weight: bold; color: #1F2937; }
  .company-lines { font-size: 8.5pt; color: #6B7280; margin-top: 4px; line-height: 1.5; }
  .meta-cell { text-align: right; white-space: nowrap; padding-left: 24px; }
  .doc-label { font-size: 8pt; font-weight: bold; color: #6B7280; letter-spacing: 0.5px; }
  .doc-number { font-size: 20pt; font-weight: bold; color: #1F2937; margin: 2px 0 10px; }
  .meta-pair { margin-bottom: 6px; }
  .meta-label { font-size: 7pt; font-weight: bold; color: #6B7280; text-transform: uppercase; letter-spacing: 0.4px; }
  .meta-value { font-size: 10.5pt; color: #1F2937; }
  .divider { border-top: 1px solid #E5E7EB; margin: 22px 0 24px; }
  .client-block { margin-bottom: 26px; }
  .client-label { font-size: 8pt; font-weight: bold; color: #6B7280; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 6px; }
  .client-name { font-size: 12.5pt; font-weight: bold; color: #1F2937; margin-bottom: 3px; }
  .client-company { font-size: 10pt; color: #1F2937; }
  .client-attn { font-size: 9.5pt; color: #1F2937; margin-top: 2px; }
  .client-attn-info { font-size: 8.5pt; color: #6B7280; }
  .client-address { font-size: 9pt; color: #6B7280; margin-top: 4px; line-height: 1.5; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 26px; }
  table.items th {
    background: #F3F4F6; color: #6B7280; font-size: 8pt; font-weight: bold;
    letter-spacing: 0.4px; padding: 7px 8px; text-align: left;
    border-bottom: 1px solid #E5E7EB;
  }
  table.items td {
    padding: 7px 8px; font-size: 9.5pt; color: #1F2937;
    border-bottom: 0.75px solid #E5E7EB; vertical-align: top;
  }
  table.items tbody tr.alt { background: #FAFAFA; }
  table.items td.col-num, table.items th.col-num { text-align: right; }
  table.items td.no-items { color: #6B7280; font-style: italic; }
  .totals { width: 270px; margin-left: auto; page-break-inside: avoid; }
  .t-row { display: flex; justify-content: space-between; font-size: 9.5pt; color: #1F2937; padding: 2.5px 0; }
  .t-row.muted { color: #6B7280; }
  .t-row.due { color: #1F2937; font-weight: bold; }
  .t-divider { border-top: 1px solid #E5E7EB; margin: 6px 0; }
  .grand {
    display: flex; justify-content: space-between; background: #F9FAFB;
    border-top: 1.5px solid #1F2937; font-size: 11pt; font-weight: bold;
    color: #1F2937; padding: 11px 10px; margin-top: 8px;
  }
  .notes { margin-top: 26px; page-break-inside: avoid; }
  .notes-title { font-size: 8pt; font-weight: bold; color: #6B7280; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 6px; }
  .notes-body { font-size: 9pt; color: #1F2937; white-space: pre-wrap; }
  .acceptance { margin-top: 26px; page-break-inside: avoid; }
  .acceptance.accepted { background: #F0FDF4; border: 1px solid #86EFAC; padding: 14px 16px; }
  .acceptance.accepted .accept-title { color: #166534; }
  .acceptance.pending { background: #F9FAFB; border: 1px solid #E5E7EB; padding: 12px 16px 16px; }
  .acceptance.pending .accept-title { color: #1F2937; margin-bottom: 8px; }
  .accept-title { font-size: 9.5pt; font-weight: bold; }
  .accept-note { font-size: 8.5pt; color: #14532D; margin-top: 6px; }
  .accept-instructions { font-size: 11pt; color: #1F2937; margin-bottom: 4px; }
  .accept-contact { font-size: 8pt; color: #6B7280; margin-bottom: 10px; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 34px; row-gap: 22px; margin-top: 10px; }
  .sig-line { border-top: 1px solid #CBD5E1; margin-bottom: 12px; }
  .sig-field label { font-size: 7.5pt; color: #6B7280; }
  .doc-footer {
    position: fixed; bottom: 0; left: 46px; right: 46px;
    display: flex; justify-content: space-between;
    border-top: 0.75px solid #E5E7EB; padding-top: 6px;
    font-size: 8pt; color: #6B7280;
  }
  .stamp {
    position: absolute; top: 40%; left: 0; right: 0; text-align: center;
    font-size: 64pt; font-weight: bold; letter-spacing: 6px;
    opacity: 0.12; transform: rotate(-24deg);
    pointer-events: none; z-index: 0;
  }
</style>
</head>
<body>
${stamp ? `<div class="stamp" style="color:#${String(stamp.color).replace(/^#/, '')}">${escapeHtml(stamp.text)}</div>` : ''}
${buildPrintHeaderHtml({ profile, businessName, pageLabel, docNumber, metaRows })}
${buildPrintClientHtml(clientLabel, client, contact)}
${buildPrintItemsHtml(items, currency)}
${buildPrintTotalsHtml(totalRows, grandLabel, grandValue, extraRows)}
${buildPrintNotesHtml(notesTerms)}
${acceptanceHtml || ''}
<div class="doc-footer"><span>${escapeHtml(footerLeft)}</span></div>
</body>
</html>`;
}

function renderQuotePrintHtml(quote, client, profile) {
  const currency = quote.currency || (profile && profile.default_currency) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';

  const totalRows = [['Subtotal', money(quote.subtotal, currency)]];
  if (Number(quote.discount_amount) > 0) totalRows.push(['Discount', `\u2212${money(quote.discount_amount, currency)}`]);
  buildPdfTaxRows(quote.line_items || [], quote.subtotal, quote.discount_amount, currency, quote.tax_lines).forEach((r) => totalRows.push(r));
  const notesTerms = [quote.notes, quote.terms].filter(Boolean).join('\n\n') || null;

  return renderDocumentPrintHtml({
    pageLabel: 'QUOTE',
    docNumber: quote.quote_number || '',
    businessName,
    profile,
    metaRows: [
      ['Issue date', formatDate(quote.date_created)],
      ['Valid until', formatDate(quote.valid_until)],
      ['Status', QUOTE_STATUS_LABELS[quote.status] || quote.status || ''],
    ],
    clientLabel: 'PREPARED FOR',
    client,
    contact: quote.contact,
    items: quote.line_items || [],
    currency,
    totalRows,
    grandLabel: 'GRAND TOTAL',
    grandValue: money(quote.total, currency),
    extraRows: [],
    notesTerms,
    footerLeft: `Prepared by ${businessName}`,
    acceptanceHtml: buildPrintAcceptanceHtml(quote, profile),
    stamp: null,
  });
}

function renderInvoicePrintHtml(invoice, client, profile) {
  const currency = invoice.currency || (profile && profile.default_currency) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';
  const status = effectiveInvoiceStatus(invoice);

  let docLabel = 'INVOICE';
  let grandLabel = 'TOTAL DUE';
  if (invoice.invoice_type === 'deposit') {
    docLabel = 'DEPOSIT INVOICE';
    grandLabel = 'DEPOSIT DUE';
  } else if (invoice.invoice_type === 'final') {
    docLabel = 'FINAL INVOICE';
    grandLabel = 'FINAL BALANCE DUE';
  }

  const metaRows = [
    ['Issue date', formatDate(invoice.date_created)],
    ['Due date', formatDate(invoice.date_due)],
    ['Status', INVOICE_STATUS_LABELS[status] || status || ''],
  ];
  if (invoice.original_quote_total && (invoice.invoice_type === 'deposit' || invoice.invoice_type === 'final')) {
    metaRows.push(['Full Quote Value', money(invoice.original_quote_total, currency)]);
  }

  const totalRows = [['Subtotal', money(invoice.subtotal, currency)]];
  if (Number(invoice.discount_amount) > 0) totalRows.push(['Discount', `\u2212${money(invoice.discount_amount, currency)}`]);
  buildPdfTaxRows(invoice.line_items || [], invoice.subtotal, invoice.discount_amount, currency, invoice.tax_lines).forEach((r) => totalRows.push(r));

  const paid = Number(invoice.amount_paid) || 0;
  const credited = Number(invoice.amount_credited) || 0;
  const balance = Number(invoice.balance_due) || 0;
  const netPaid = Math.max(0, Math.round((paid - credited) * 100) / 100);
  const extraRows = [];
  if (paid > 0.0001) {
    extraRows.push(['Amount paid', money(paid, currency)]);
    if (credited > 0.0001) {
      extraRows.push(['Credited', `\u2212${money(credited, currency)}`]);
      extraRows.push(['Net paid', money(netPaid, currency)]);
    }
    extraRows.push(['Balance due', money(Math.max(balance, 0), currency)]);
  } else if (balance > 0.0001) {
    extraRows.push(['Balance due', money(balance, currency)]);
  } else if (credited > 0.0001) {
    extraRows.push(['Credited', `\u2212${money(credited, currency)}`]);
    extraRows.push(['Net paid', money(netPaid, currency)]);
  }

  const notesTerms = [invoice.notes, invoice.terms].filter(Boolean).join('\n\n') || null;
  let stamp = null;
  if (status === 'paid') stamp = { text: 'PAID', color: '#166534' };
  else if (status === 'overdue') stamp = { text: 'OVERDUE', color: '#B91C1C' };

  return renderDocumentPrintHtml({
    pageLabel: docLabel,
    docNumber: invoice.invoice_number || '',
    businessName,
    profile,
    metaRows,
    clientLabel: 'BILLED TO',
    client,
    contact: invoice.contact,
    items: invoice.line_items || [],
    currency,
    totalRows,
    grandLabel,
    grandValue: money(invoice.total, currency),
    extraRows,
    notesTerms,
    footerLeft: `Prepared by ${businessName}`,
    acceptanceHtml: '',
    stamp,
  });
}

// ---------- Credit Note PDF ----------

function renderCreditNotePdf(creditNote, invoice, client, profile, opts) {
  const currency = (invoice && invoice.currency) || (profile && profile.default_currency) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';
  const theme = (opts && opts.theme) || (profile && profile.pdf_theme) || 'classic';

  const ctx = createDocument({
    title: `Credit Note ${creditNote.credit_note_number}`,
    author: businessName,
    subject: 'Credit Note',
    theme,
  });
  const { doc, W } = ctx;

  drawHeaderBrand(ctx, {
    profile,
    businessName,
    rightLabel: 'CREDIT NOTE',
    rightNumber: creditNote.credit_note_number || '',
    metaRows: [
      ['Issue date', formatDate(creditNote.date_created)],
      ['Related invoice', invoice ? invoice.invoice_number : '—'],
    ],
  });
  drawDivider(ctx);
  drawClientBlock(ctx, client, 'CREDIT ISSUED TO');

  // Credit note body
  const creditBody = [
    `This credit note reduces the outstanding balance on invoice ${invoice ? invoice.invoice_number : '—'}.`,
  ];
  if (creditNote.reason) {
    creditBody.push(`Reason: ${creditNote.reason}`);
  }
  drawTextSection(ctx, 'Details', creditBody.join('\n\n'));

  // Simple totals: just the credit amount
  const totalsW = 250;
  const totalsX = MARGIN + W - totalsW;
  const labelW = totalsW * 0.60;
  const valueW = totalsW * 0.40;

  if (ctx.y + 46 > ctx.pageBottom) {
    doc.addPage();
    ctx.y = doc.y;
  }

  const grandH = 34;
  doc.rect(totalsX, ctx.y, totalsW, grandH).fill(COLORS.grandFill);
  doc.moveTo(totalsX, ctx.y).lineTo(totalsX + totalsW, ctx.y).strokeColor(COLORS.ink).lineWidth(1.5).stroke();
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.ink);
  doc.text('CREDIT AMOUNT', totalsX + 10, ctx.y + 11, { width: labelW, lineGap: 0 });
  doc.text(money(creditNote.amount, currency), totalsX + labelW - 10, ctx.y + 11, { width: valueW + 10, align: 'right', lineGap: 0 });
  ctx.y += grandH + 8;

  ctx.y += 18;

  drawFooter(ctx, `Prepared by ${businessName}`);
  doc.end();
  return ctx.done;
}

// ---------- Client Statement PDF ----------

const STATEMENT_TYPE_LABELS = {
  invoice: 'Invoice',
  payment: 'Payment',
  credit_note: 'Credit Note',
};

// Transaction ledger for a statement: DATE / TYPE / REFERENCE / DESCRIPTION /
// CHARGE / CREDIT / BALANCE. Mirrors drawItemsTable's header fill, alt rows and
// repeated-header page breaks, but with statement-specific columns.
function drawStatementTable(ctx, rows, currency) {
  const { doc, W } = ctx;
  const dateW = 58;
  const typeW = 70;
  const refW = 80;
  const chargeW = 66;
  const creditW = 66;
  const balanceW = 72;
  const descW = W - dateW - typeW - refW - chargeW - creditW - balanceW;
  const dateX = MARGIN;
  const typeX = dateX + dateW;
  const refX = typeX + typeW;
  const descX = refX + refW;
  const chargeX = descX + descW;
  const creditX = chargeX + chargeW;
  const balanceX = creditX + creditW;
  const rowPadY = 5.5;
  const headerH = 22;

  function drawTableHeader(yPos) {
    doc.rect(MARGIN, yPos, W, headerH).fill(COLORS.headerFill);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.muted);
    doc.text('DATE', dateX + 6, yPos + 8, { width: dateW - 8, lineGap: 0 });
    doc.text('TYPE', typeX, yPos + 8, { width: typeW - 6, lineGap: 0 });
    doc.text('REFERENCE', refX, yPos + 8, { width: refW - 6, lineGap: 0 });
    doc.text('DESCRIPTION', descX, yPos + 8, { width: descW - 8, lineGap: 0 });
    doc.text('CHARGE', chargeX, yPos + 8, { width: chargeW - 6, align: 'right', lineGap: 0 });
    doc.text('CREDIT', creditX, yPos + 8, { width: creditW - 6, align: 'right', lineGap: 0 });
    doc.text('BALANCE', balanceX, yPos + 8, { width: balanceW - 6, align: 'right', lineGap: 0 });
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

  if (!rows.length) {
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(COLORS.muted).text('No account activity in this period.', MARGIN + 6, ctx.y + 7, { width: W - 12 });
    ctx.y += 30;
    return;
  }

  rows.forEach((row, idx) => {
    const description = String(row.description || '');
    doc.font('Helvetica').fontSize(9);
    const descH = doc.heightOfString(description, { width: descW - 8 }) + rowPadY * 2;
    const rowH = Math.max(22, Math.ceil(descH));

    ensureSpace(rowH + 2);
    if (idx % 2 === 1) {
      doc.rect(MARGIN, ctx.y, W, rowH).fill(COLORS.altFill);
    }

    const textY = ctx.y + rowPadY;

    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted);
    doc.text(formatDate(row.date), dateX + 6, textY + 0.5, { width: dateW - 8, lineGap: 0 });

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.ink);
    doc.text(STATEMENT_TYPE_LABELS[row.type] || String(row.type || ''), typeX, textY + 0.5, { width: typeW - 6, lineGap: 0 });

    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted);
    doc.text(String(row.reference || '\u2014'), refX, textY + 0.5, { width: refW - 6, lineGap: 0 });

    doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink);
    doc.text(description, descX, textY, { width: descW - 8, lineGap: 1, height: rowH - rowPadY * 2 });

    const charge = Number(row.charge) || 0;
    const credit = Number(row.credit) || 0;
    const balance = Number(row.balance) || 0;

    if (charge > 0.0001) {
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink);
      doc.text(money(charge, currency), chargeX, textY + 0.5, { width: chargeW - 6, align: 'right', lineGap: 0 });
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
      doc.text('\u2014', chargeX, textY + 0.5, { width: chargeW - 6, align: 'right', lineGap: 0 });
    }

    if (credit > 0.0001) {
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.paid);
      doc.text(money(credit, currency), creditX, textY + 0.5, { width: creditW - 6, align: 'right', lineGap: 0 });
    } else {
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
      doc.text('\u2014', creditX, textY + 0.5, { width: creditW - 6, align: 'right', lineGap: 0 });
    }

    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink);
    doc.text(money(balance, currency), balanceX, textY + 0.5, { width: balanceW - 6, align: 'right', lineGap: 0 });

    ctx.y += rowH;
    doc.moveTo(MARGIN, ctx.y).lineTo(MARGIN + W, ctx.y).strokeColor(COLORS.line).lineWidth(0.75).stroke();
    ctx.y += 1;
  });

  ctx.y += 20;
}

function renderClientStatementPdf(statement, profile, opts) {
  const currency = statement.currency || (profile && profile.default_currency) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';
  const client = statement.client || {};
  const overdue = statement.overdue || {};
  const generatedOn = new Date().toISOString().slice(0, 10);
  const theme = (opts && opts.theme) || (profile && profile.pdf_theme) || 'classic';

  const ctx = createDocument({
    title: `Statement of Account - ${client.name || 'Client'}`,
    author: businessName,
    subject: 'Statement of Account',
    theme,
  });
  const { doc } = ctx;

  drawHeaderBrand(ctx, {
    profile,
    businessName,
    rightLabel: 'STATEMENT OF ACCOUNT',
    rightNumber: '',
    metaRows: [
      ['Period', `${formatDate(statement.startDate)} to ${formatDate(statement.endDate)}`],
      ['Generated', formatDate(generatedOn)],
      ['Currency', currency],
    ],
  });
  drawDivider(ctx);
  drawClientBlock(ctx, client, 'STATEMENT FOR');

  // Opening balance, highlighted in a totals panel to match the closing panel.
  drawTotals(ctx, {
    rows: [],
    grandLabel: 'OPENING BALANCE',
    grandValue: money(statement.openingBalance, currency),
    extra: [],
  });

  drawStatementTable(ctx, statement.rows || [], currency);

  const totals = statement.totals || {};
  const extraRows = [];
  if (overdue.hasOverdue) {
    const since = overdue.earliestDueDate ? ` (oldest due ${formatDate(overdue.earliestDueDate)})` : '';
    extraRows.push([`Overdue${since}`, money(overdue.balance, currency), COLORS.overdue]);
  }

  drawTotals(ctx, {
    rows: [
      ['Total invoiced', money(totals.invoiced, currency)],
      ['Payments received', `\u2212${money(totals.paid, currency)}`],
      ['Credit notes', money(totals.credited, currency)],
    ],
    grandLabel: 'CLOSING BALANCE',
    grandValue: money(statement.closingBalance, currency),
    grandColor: overdue.hasOverdue ? COLORS.overdue : COLORS.ink,
    extra: extraRows,
  });

  drawFooter(ctx, `Statement generated by ${businessName}`);

  if (overdue.hasOverdue) {
    drawStampOnFirstPage(ctx, 'OVERDUE', COLORS.overdue);
  }

  doc.end();
  return ctx.done;
}

// ---------- Payments Reconciliation PDF ----------

function drawPaymentsTable(ctx, payments, currency) {
  const { doc, W } = ctx;
  const dateW = 60;
  const invW = 75;
  const methodW = 80;
  const refW = 75;
  const amtW = 80;
  const clientW = W - dateW - invW - methodW - refW - amtW;

  const dateX = MARGIN;
  const invX = dateX + dateW;
  const clientX = invX + invW;
  const methodX = clientX + clientW;
  const refX = methodX + methodW;
  const amtX = refX + refW;

  const rowPadY = 5.5;
  const headerH = 22;

  function drawTableHeader(yPos) {
    doc.rect(MARGIN, yPos, W, headerH).fill(COLORS.headerFill);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.muted);
    doc.text('DATE', dateX + 6, yPos + 8, { width: dateW - 8, lineGap: 0 });
    doc.text('INVOICE #', invX, yPos + 8, { width: invW - 6, lineGap: 0 });
    doc.text('CLIENT', clientX, yPos + 8, { width: clientW - 6, lineGap: 0 });
    doc.text('METHOD', methodX, yPos + 8, { width: methodW - 6, lineGap: 0 });
    doc.text('REFERENCE', refX, yPos + 8, { width: refW - 6, lineGap: 0 });
    doc.text('AMOUNT', amtX, yPos + 8, { width: amtW - 6, align: 'right', lineGap: 0 });
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

  if (!payments || !payments.length) {
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(COLORS.muted).text('No payment records found for this period.', MARGIN + 6, ctx.y + 7, { width: W - 12 });
    ctx.y += 30;
    return;
  }

  payments.forEach((p, idx) => {
    const clientName = String(p.client_name || p.client_company || 'Client');
    doc.font('Helvetica').fontSize(8.5);
    const clientH = doc.heightOfString(clientName, { width: clientW - 8 }) + rowPadY * 2;
    const rowH = Math.max(20, Math.ceil(clientH));

    ensureSpace(rowH + 2);
    if (idx % 2 === 1) {
      doc.rect(MARGIN, ctx.y, W, rowH).fill(COLORS.altFill);
    }

    const textY = ctx.y + rowPadY;

    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted);
    doc.text(formatDate(p.payment_date), dateX + 6, textY + 0.5, { width: dateW - 8, lineGap: 0 });

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.ink);
    doc.text(String(p.invoice_number || '\u2014'), invX, textY + 0.5, { width: invW - 6, lineGap: 0 });

    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.ink);
    doc.text(clientName, clientX, textY + 0.5, { width: clientW - 8, lineGap: 0 });

    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted);
    doc.text(String(p.payment_method || 'Unspecified'), methodX, textY + 0.5, { width: methodW - 6, lineGap: 0 });

    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted);
    doc.text(String(p.reference_number || '\u2014'), refX, textY + 0.5, { width: refW - 6, lineGap: 0 });

    const pAmt = Number(p.amount) || 0;
    const pCur = p.currency || currency;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink);
    doc.text(money(pAmt, pCur), amtX, textY + 0.5, { width: amtW - 6, align: 'right', lineGap: 0 });

    ctx.y += rowH;
    doc.moveTo(MARGIN, ctx.y).lineTo(MARGIN + W, ctx.y).strokeColor(COLORS.line).lineWidth(0.75).stroke();
    ctx.y += 1;
  });

  ctx.y += 16;
}

function renderPaymentsPdf(report, profile, opts) {
  const currency = (report && report.baseCurrency) || (profile && (profile.reporting_currency || profile.default_currency)) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';
  const theme = (opts && opts.theme) || (profile && profile.pdf_theme) || 'classic';
  const generatedOn = new Date().toISOString().slice(0, 10);

  const ctx = createDocument({
    title: 'Payments Reconciliation Report',
    author: businessName,
    subject: 'Payments Reconciliation',
    theme,
  });
  const { doc } = ctx;

  const filter = (report && report.filter) || {};
  let periodStr = 'All time';
  if (filter.startDate && filter.endDate) {
    periodStr = `${formatDate(filter.startDate)} to ${formatDate(filter.endDate)}`;
  } else if (filter.startDate) {
    periodStr = `From ${formatDate(filter.startDate)}`;
  } else if (filter.endDate) {
    periodStr = `Until ${formatDate(filter.endDate)}`;
  }

  drawHeaderBrand(ctx, {
    profile,
    businessName,
    rightLabel: 'PAYMENTS RECONCILIATION',
    rightNumber: '',
    metaRows: [
      ['Period', periodStr],
      ['Generated', formatDate(generatedOn)],
      ['Method filter', filter.paymentMethod && filter.paymentMethod !== 'all' ? filter.paymentMethod : 'All methods'],
    ],
  });
  drawDivider(ctx);

  const methodRows = (report && report.byMethod ? report.byMethod : []).map((m) => [
    `${m.method} (${m.count})`,
    `${money(m.totalAmount, currency)} (${m.percentage}%)`,
  ]);

  drawTotals(ctx, {
    rows: methodRows,
    grandLabel: 'TOTAL RECEIVED',
    grandValue: money((report && report.totalReceived) || 0, currency),
    extra: [['Total transactions', String((report && report.count) || 0)]],
  });

  drawPaymentsTable(ctx, (report && report.payments) || [], currency);

  drawFooter(ctx, `Payments report generated by ${businessName}`);

  doc.end();
  return ctx.done;
}

// ---------- Shareable Standalone HTML Quote & Invoice ----------

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderQuoteHtml(quote, client, profile) {
  const currency = quote.currency || (profile && profile.default_currency) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';
  const isAccepted = quote.status === 'accepted';
  const instructions = quote.acceptance_instructions
    || (profile && profile.default_quote_acceptance_instructions)
    || 'To accept this quote, please reply to confirm via email or phone.';

  const companyLines = buildCompanyLines(profile);
  const clientLines = buildClientLines(client);

  const totalRows = [['Subtotal', money(quote.subtotal, currency)]];
  if (Number(quote.discount_amount) > 0) totalRows.push(['Discount', `\u2212${money(quote.discount_amount, currency)}`]);
  const taxRows = buildPdfTaxRows(quote.line_items || [], quote.subtotal, quote.discount_amount, currency, quote.tax_lines);
  taxRows.forEach((r) => totalRows.push(r));

  const acceptMethodLabels = {
    email: 'Email reply',
    phone: 'Phone call',
    signed_document: 'Signed document',
    purchase_order: 'Purchase Order',
    in_person: 'In-person confirmation',
    other: 'Direct confirmation',
  };

  const lineItemsHtml = (quote.line_items || []).map((item) => {
    let discText = '—';
    if (item.discount_type === 'percent' && Number(item.discount_value) > 0) {
      discText = `${item.discount_value}% (${money(item.discount_amount, currency)})`;
    } else if (item.discount_type === 'amount' && Number(item.discount_value) > 0) {
      discText = money(item.discount_amount, currency);
    }
    const taxText = Number(item.tax_rate) > 0 ? `${item.tax_rate}%` : '0% (Exempt)';
    return `
      <tr>
        <td class="col-desc">${escapeHtml(item.description)}</td>
        <td class="col-qty">${normalizeQty(item.quantity)}</td>
        <td class="col-price">${money(item.unit_price, currency)}</td>
        <td class="col-disc">${escapeHtml(discText)}</td>
        <td class="col-tax">${escapeHtml(taxText)}</td>
        <td class="col-total">${money(item.amount, currency)}</td>
      </tr>
    `;
  }).join('');

  const totalsHtml = totalRows.map(([label, val]) => `
    <div class="totals-row">
      <span class="label">${escapeHtml(label)}</span>
      <span class="value">${escapeHtml(val)}</span>
    </div>
  `).join('');

  let acceptanceBlockHtml = '';
  if (isAccepted) {
    const methodStr = acceptMethodLabels[quote.acceptance_method] || quote.acceptance_method || 'Direct confirmation';
    const acceptedByStr = quote.accepted_by ? ` by <strong>${escapeHtml(quote.accepted_by)}</strong>` : '';
    const acceptedDateStr = formatDate(quote.date_accepted);
    acceptanceBlockHtml = `
      <div class="acceptance-card accepted">
        <div class="badge-status accepted">&#10003; Formally Accepted</div>
        <p class="acceptance-summary">Confirmed via <strong>${escapeHtml(methodStr)}</strong>${acceptedByStr} on <strong>${escapeHtml(acceptedDateStr)}</strong>.</p>
        ${quote.acceptance_note ? `<div class="acceptance-note"><strong>Paper Trail Note:</strong> ${escapeHtml(quote.acceptance_note)}</div>` : ''}
      </div>
    `;
  } else {
    const senderEmail = (profile && profile.email) || '';
    const senderPhone = (profile && profile.phone) || '';
    let contactHtml = '';
    if (senderEmail && senderPhone) {
      contactHtml = `<p class="contact-line">Reply directly to: <a href="mailto:${escapeHtml(senderEmail)}">${escapeHtml(senderEmail)}</a> &bull; Phone: <strong>${escapeHtml(senderPhone)}</strong></p>`;
    } else if (senderEmail) {
      contactHtml = `<p class="contact-line">Reply directly to: <a href="mailto:${escapeHtml(senderEmail)}">${escapeHtml(senderEmail)}</a></p>`;
    } else if (senderPhone) {
      contactHtml = `<p class="contact-line">Phone: <strong>${escapeHtml(senderPhone)}</strong></p>`;
    }

    acceptanceBlockHtml = `
      <div class="acceptance-card pending">
        <h3>Acceptance &amp; Confirmation</h3>
        <div class="offline-callout">
          <span class="callout-icon">&#128274;</span>
          <p><strong>Offline Quotation:</strong> QuoteCraft operates 100% locally with no cloud servers or tracking. To formally accept this quote, please reply directly or sign below.</p>
        </div>
        <div class="instruction-box">
          <p class="instruction-text">${escapeHtml(instructions)}</p>
          ${contactHtml}
        </div>
        <div class="signoff-grid">
          <div class="signoff-field">
            <div class="line"></div>
            <label>Authorized Client Signature</label>
          </div>
          <div class="signoff-field">
            <div class="line"></div>
            <label>Date</label>
          </div>
          <div class="signoff-field">
            <div class="line"></div>
            <label>Printed Name &amp; Title</label>
          </div>
          <div class="signoff-field">
            <div class="line"></div>
            <label>Purchase Order / Reference # (optional)</label>
          </div>
        </div>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quote ${escapeHtml(quote.quote_number)} - ${escapeHtml(businessName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #F8FAFC;
      color: #1E293B;
      line-height: 1.5;
      padding: 32px 16px;
    }
    .quote-container {
      max-width: 860px;
      margin: 0 auto;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
      padding: 40px;
    }
    .quote-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #F1F5F9;
      padding-bottom: 28px;
      margin-bottom: 28px;
    }
    .company-info h1 {
      font-size: 24px;
      font-weight: 700;
      color: #0F172A;
      margin-bottom: 6px;
    }
    .company-details, .client-details {
      font-size: 13.5px;
      color: #64748B;
      line-height: 1.6;
    }
    .doc-meta {
      text-align: right;
    }
    .doc-badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: #EFF6FF;
      color: #2563EB;
      padding: 4px 10px;
      border-radius: 6px;
      margin-bottom: 8px;
    }
    .doc-number {
      font-size: 22px;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 6px;
    }
    .meta-table {
      margin-left: auto;
      font-size: 13.5px;
    }
    .meta-table td {
      padding: 2px 4px;
    }
    .meta-table td:first-child {
      color: #64748B;
      text-align: right;
      padding-right: 8px;
    }
    .meta-table td:last-child {
      font-weight: 600;
      color: #1E293B;
    }
    .parties-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 32px;
      gap: 24px;
    }
    .client-card {
      flex: 1;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 16px;
    }
    .card-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94A3B8;
      margin-bottom: 6px;
    }
    .client-name {
      font-size: 16px;
      font-weight: 700;
      color: #0F172A;
      margin-bottom: 4px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 13.5px;
    }
    .items-table th {
      background: #F8FAFC;
      color: #475569;
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      border-top: 1px solid #E2E8F0;
      border-bottom: 1px solid #CBD5E1;
    }
    .items-table td {
      padding: 12px;
      border-bottom: 1px solid #F1F5F9;
    }
    .items-table tr:nth-child(even) { background-color: #FAFAFA; }
    .col-qty, .col-price, .col-disc, .col-tax, .col-total { text-align: right; }
    .items-table th.col-qty, .items-table th.col-price, .items-table th.col-disc, .items-table th.col-tax, .items-table th.col-total { text-align: right; }
    .col-desc { font-weight: 500; }
    .totals-wrapper {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 32px;
    }
    .totals-box {
      width: 320px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 14px 18px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      font-size: 13.5px;
      padding: 4px 0;
      color: #475569;
    }
    .totals-row.grand {
      border-top: 2px solid #E2E8F0;
      margin-top: 8px;
      padding-top: 8px;
      font-size: 16px;
      font-weight: 800;
      color: #0F172A;
    }
    .notes-terms {
      margin-bottom: 32px;
      padding: 16px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
    }
    .notes-terms h4 {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748B;
      margin-bottom: 6px;
    }
    .notes-terms p {
      font-size: 13.5px;
      color: #334155;
      white-space: pre-wrap;
    }
    .acceptance-card {
      border-radius: 8px;
      padding: 24px;
      margin-top: 32px;
    }
    .acceptance-card.pending {
      background: #F8FAFC;
      border: 1px solid #CBD5E1;
    }
    .acceptance-card.accepted {
      background: #F0FDF4;
      border: 1px solid #86EFAC;
    }
    .acceptance-card h3 {
      font-size: 15px;
      font-weight: 700;
      color: #0F172A;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .offline-callout {
      display: flex;
      align-items: flex-start;
      background: #EFF6FF;
      border: 1px solid #BFDBFE;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-size: 12.5px;
      color: #1E40AF;
    }
    .callout-icon { margin-right: 8px; font-size: 16px; line-height: 1.2; }
    .instruction-box {
      margin-bottom: 24px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 6px;
      padding: 12px 16px;
    }
    .instruction-text {
      font-size: 14px;
      font-weight: 600;
      color: #1E293B;
      margin-bottom: 4px;
    }
    .contact-line {
      font-size: 13px;
      color: #64748B;
    }
    .contact-line a { color: #2563EB; text-decoration: none; }
    .signoff-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px 32px;
      margin-top: 20px;
    }
    .signoff-field .line {
      height: 1px;
      background: #94A3B8;
      margin-bottom: 6px;
      margin-top: 28px;
    }
    .signoff-field label {
      font-size: 11.5px;
      color: #64748B;
      text-transform: uppercase;
      font-weight: 600;
    }
    .badge-status.accepted {
      display: inline-block;
      background: #DCFCE7;
      color: #15803D;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 6px;
      margin-bottom: 8px;
    }
    .acceptance-summary {
      font-size: 14px;
      color: #166534;
      margin-bottom: 6px;
    }
    .acceptance-note {
      font-size: 13px;
      color: #14532D;
      background: #DCFCE7;
      padding: 8px 12px;
      border-radius: 6px;
      margin-top: 8px;
    }
    .footer-note {
      text-align: center;
      font-size: 12px;
      color: #94A3B8;
      margin-top: 32px;
      border-top: 1px solid #E2E8F0;
      padding-top: 16px;
    }
    @media print {
      body { background: #FFF; padding: 0; }
      .quote-container { border: none; box-shadow: none; padding: 0; max-width: 100%; }
      .acceptance-card { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="quote-container">
    <div class="quote-header">
      <div class="company-info">
        <h1>${escapeHtml(businessName)}</h1>
        <div class="company-details">
          ${companyLines.map(l => `<div>${escapeHtml(l)}</div>`).join('')}
          ${profile && profile.phone ? `<div>Tel: ${escapeHtml(profile.phone)}</div>` : ''}
          ${profile && profile.email ? `<div>Email: ${escapeHtml(profile.email)}</div>` : ''}
          ${profile && profile.tax_id ? `<div>Tax ID: ${escapeHtml(profile.tax_id)}</div>` : ''}
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-badge">Quotation</div>
        <div class="doc-number">${escapeHtml(quote.quote_number)}</div>
        <table class="meta-table">
          <tr><td>Issue Date:</td><td>${escapeHtml(formatDate(quote.date_created))}</td></tr>
          <tr><td>Valid Until:</td><td>${escapeHtml(formatDate(quote.valid_until))}</td></tr>
          <tr><td>Status:</td><td>${escapeHtml(QUOTE_STATUS_LABELS[quote.status] || quote.status)}</td></tr>
        </table>
      </div>
    </div>

    <div class="parties-section">
      <div class="client-card">
        <div class="card-label">Prepared For</div>
        <div class="client-name">${escapeHtml(client ? client.name : 'Client')}</div>
        ${client && client.company_name ? `<div>${escapeHtml(client.company_name)}</div>` : ''}
        ${quote.contact ? `<div>Attn: ${escapeHtml(quote.contact.name)}${quote.contact.role ? ` (${escapeHtml(quote.contact.role)})` : ''}</div>` : ''}
        <div class="client-details">
          ${clientLines.map(l => `<div>${escapeHtml(l)}</div>`).join('')}
        </div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">Description</th>
          <th class="col-qty">Qty</th>
          <th class="col-price">Unit Price</th>
          <th class="col-disc">Discount</th>
          <th class="col-tax">Tax</th>
          <th class="col-total">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>

    <div class="totals-wrapper">
      <div class="totals-box">
        ${totalsHtml}
        <div class="totals-row grand">
          <span class="label">Grand Total</span>
          <span class="value">${money(quote.total, currency)}</span>
        </div>
      </div>
    </div>

    ${quote.notes || quote.terms ? `
      <div class="notes-terms">
        <h4>Notes &amp; Terms</h4>
        <p>${escapeHtml([quote.notes, quote.terms].filter(Boolean).join('\n\n'))}</p>
      </div>
    ` : ''}

    ${acceptanceBlockHtml}

    <div class="footer-note">
      Prepared by ${escapeHtml(businessName)} &bull; Generated locally with QuoteCraft
    </div>
  </div>
</body>
</html>`;
}

function renderInvoiceHtml(invoice, client, profile) {
  const currency = invoice.currency || (profile && profile.default_currency) || 'USD';
  const businessName = (profile && profile.business_name) || 'QuoteCraft';
  const status = effectiveInvoiceStatus(invoice);

  let docLabel = 'INVOICE';
  if (invoice.invoice_type === 'deposit') {
    docLabel = 'DEPOSIT INVOICE';
  } else if (invoice.invoice_type === 'final') {
    docLabel = 'FINAL INVOICE';
  }

  const companyLines = buildCompanyLines(profile);
  const clientLines = buildClientLines(client);

  const totalRows = [['Subtotal', money(invoice.subtotal, currency)]];
  if (Number(invoice.discount_amount) > 0) {
    totalRows.push(['Discount', `\u2212${money(invoice.discount_amount, currency)}`]);
  }
  const taxRows = buildPdfTaxRows(invoice.line_items || [], invoice.subtotal, invoice.discount_amount, currency, invoice.tax_lines);
  taxRows.forEach((r) => totalRows.push(r));

  const paid = Number(invoice.amount_paid) || 0;
  const credited = Number(invoice.amount_credited) || 0;
  const balance = Number(invoice.balance_due) || 0;
  const netPaid = Math.max(0, Math.round((paid - credited) * 100) / 100);

  const extraRows = [];
  if (paid > 0.0001) {
    extraRows.push(['Amount Paid', money(paid, currency)]);
    if (credited > 0.0001) {
      extraRows.push(['Credited', `\u2212${money(credited, currency)}`]);
      extraRows.push(['Net Paid', money(netPaid, currency)]);
    }
    extraRows.push(['Balance Due', money(Math.max(balance, 0), currency), true]);
  } else if (balance > 0.0001) {
    extraRows.push(['Balance Due', money(balance, currency), true]);
  } else if (credited > 0.0001) {
    extraRows.push(['Credited', `\u2212${money(credited, currency)}`]);
    extraRows.push(['Net Paid', money(netPaid, currency)]);
  }

  const lineItemsHtml = (invoice.line_items || []).map((item) => {
    let discText = '—';
    if (item.discount_type === 'percent' && Number(item.discount_value) > 0) {
      discText = `${item.discount_value}% (${money(item.discount_amount, currency)})`;
    } else if (item.discount_type === 'amount' && Number(item.discount_value) > 0) {
      discText = money(item.discount_amount, currency);
    }
    const taxText = Number(item.tax_rate) > 0 ? `${item.tax_rate}%` : '0% (Exempt)';
    return `
      <tr>
        <td class="col-desc">${escapeHtml(item.description)}</td>
        <td class="col-qty">${normalizeQty(item.quantity)}</td>
        <td class="col-price">${money(item.unit_price, currency)}</td>
        <td class="col-disc">${escapeHtml(discText)}</td>
        <td class="col-tax">${escapeHtml(taxText)}</td>
        <td class="col-total">${money(item.amount, currency)}</td>
      </tr>
    `;
  }).join('');

  const totalsHtml = totalRows.map(([label, val]) => `
    <div class="totals-row">
      <span class="label">${escapeHtml(label)}</span>
      <span class="value">${escapeHtml(val)}</span>
    </div>
  `).join('');

  const extraTotalsHtml = extraRows.map(([label, val, isHighlight]) => `
    <div class="totals-row ${isHighlight ? 'grand highlight' : ''}">
      <span class="label">${escapeHtml(label)}</span>
      <span class="value">${escapeHtml(val)}</span>
    </div>
  `).join('');

  let statusBannerHtml = '';
  if (status === 'paid') {
    statusBannerHtml = `
      <div class="payment-status-card paid">
        <div class="status-badge-pill paid">&#10003; Paid in Full</div>
        <p class="status-message">This invoice has been settled in full. Thank you for your payment!</p>
      </div>
    `;
  } else if (status === 'overdue') {
    statusBannerHtml = `
      <div class="payment-status-card overdue">
        <div class="status-badge-pill overdue">&#9888; Payment Overdue</div>
        <p class="status-message">This invoice was due on <strong>${escapeHtml(formatDate(invoice.date_due))}</strong>. Please remit the outstanding balance of <strong>${escapeHtml(money(balance, currency))}</strong> at your earliest convenience.</p>
      </div>
    `;
  } else if (status === 'partially_paid') {
    statusBannerHtml = `
      <div class="payment-status-card partial">
        <div class="status-badge-pill partial">&#9203; Partially Paid</div>
        <p class="status-message">Received <strong>${escapeHtml(money(paid, currency))}</strong>. Remaining balance due: <strong>${escapeHtml(money(balance, currency))}</strong> by <strong>${escapeHtml(formatDate(invoice.date_due))}</strong>.</p>
      </div>
    `;
  } else {
    statusBannerHtml = `
      <div class="payment-status-card due">
        <div class="status-badge-pill due">&#128197; Payment Due</div>
        <p class="status-message">Payment of <strong>${escapeHtml(money(invoice.total, currency))}</strong> is due on or before <strong>${escapeHtml(formatDate(invoice.date_due))}</strong>.</p>
      </div>
    `;
  }

  const paymentDetails = (profile && profile.payment_details) || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${escapeHtml(invoice.invoice_number)} - ${escapeHtml(businessName)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #F8FAFC;
      color: #1E293B;
      line-height: 1.5;
      padding: 32px 16px;
    }
    .invoice-container {
      max-width: 860px;
      margin: 0 auto;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
      padding: 40px;
    }
    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #F1F5F9;
      padding-bottom: 28px;
      margin-bottom: 28px;
    }
    .company-info h1 {
      font-size: 24px;
      font-weight: 700;
      color: #0F172A;
      margin-bottom: 6px;
    }
    .company-details, .client-details {
      font-size: 13.5px;
      color: #64748B;
      line-height: 1.6;
    }
    .doc-meta {
      text-align: right;
    }
    .doc-badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: #EFF6FF;
      color: #2563EB;
      padding: 4px 10px;
      border-radius: 6px;
      margin-bottom: 8px;
    }
    .doc-badge.deposit { background: #FAF5FF; color: #7E22CE; }
    .doc-badge.final { background: #F0FDF4; color: #15803D; }
    .doc-number {
      font-size: 22px;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 6px;
    }
    .meta-table {
      margin-left: auto;
      font-size: 13.5px;
    }
    .meta-table td {
      padding: 2px 4px;
    }
    .meta-table td:first-child {
      color: #64748B;
      text-align: right;
      padding-right: 8px;
    }
    .meta-table td:last-child {
      font-weight: 600;
      color: #1E293B;
    }
    .parties-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 32px;
      gap: 24px;
    }
    .client-card {
      flex: 1;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 16px;
    }
    .card-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94A3B8;
      margin-bottom: 6px;
    }
    .client-name {
      font-size: 16px;
      font-weight: 700;
      color: #0F172A;
      margin-bottom: 4px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      font-size: 13.5px;
    }
    .items-table th {
      background: #F8FAFC;
      color: #475569;
      font-weight: 600;
      text-align: left;
      padding: 10px 12px;
      border-top: 1px solid #E2E8F0;
      border-bottom: 1px solid #CBD5E1;
    }
    .items-table td {
      padding: 12px;
      border-bottom: 1px solid #F1F5F9;
    }
    .items-table tr:nth-child(even) { background-color: #FAFAFA; }
    .col-qty, .col-price, .col-disc, .col-tax, .col-total { text-align: right; }
    .items-table th.col-qty, .items-table th.col-price, .items-table th.col-disc, .items-table th.col-tax, .items-table th.col-total { text-align: right; }
    .col-desc { font-weight: 500; }
    .totals-wrapper {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 32px;
    }
    .totals-box {
      width: 320px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 14px 18px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      font-size: 13.5px;
      padding: 4px 0;
      color: #475569;
    }
    .totals-row.grand {
      border-top: 2px solid #E2E8F0;
      margin-top: 8px;
      padding-top: 8px;
      font-size: 16px;
      font-weight: 800;
      color: #0F172A;
    }
    .totals-row.highlight {
      color: #2563EB;
      border-top: 1px dashed #CBD5E1;
      margin-top: 6px;
      padding-top: 6px;
    }
    .payment-status-card {
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .payment-status-card.paid { background: #F0FDF4; border: 1px solid #86EFAC; color: #166534; }
    .payment-status-card.overdue { background: #FEF2F2; border: 1px solid #FCA5A5; color: #991B1B; }
    .payment-status-card.partial { background: #FFFBEB; border: 1px solid #FCD34D; color: #92400E; }
    .payment-status-card.due { background: #EFF6FF; border: 1px solid #BFDBFE; color: #1E40AF; }
    .status-badge-pill {
      display: inline-block;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 3px 8px;
      border-radius: 999px;
      margin-bottom: 6px;
    }
    .status-badge-pill.paid { background: #DCFCE7; color: #15803D; }
    .status-badge-pill.overdue { background: #FEE2E2; color: #B91C1C; }
    .status-badge-pill.partial { background: #FEF3C7; color: #D97706; }
    .status-badge-pill.due { background: #DBEAFE; color: #2563EB; }
    .status-message { font-size: 13.5px; line-height: 1.5; }
    .payment-instructions {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 18px 20px;
      margin-bottom: 24px;
    }
    .payment-instructions h4 {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748B;
      margin-bottom: 8px;
    }
    .payment-instructions p {
      font-size: 13.5px;
      color: #334155;
      white-space: pre-wrap;
    }
    .notes-terms {
      margin-bottom: 32px;
      padding: 16px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
    }
    .notes-terms h4 {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #64748B;
      margin-bottom: 6px;
    }
    .notes-terms p {
      font-size: 13.5px;
      color: #334155;
      white-space: pre-wrap;
    }
    .footer-note {
      text-align: center;
      font-size: 12px;
      color: #94A3B8;
      margin-top: 32px;
      border-top: 1px solid #E2E8F0;
      padding-top: 16px;
    }
    @media print {
      body { background: #FFF; padding: 0; }
      .invoice-container { border: none; box-shadow: none; padding: 0; max-width: 100%; }
      .payment-status-card { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="invoice-header">
      <div class="company-info">
        <h1>${escapeHtml(businessName)}</h1>
        <div class="company-details">
          ${companyLines.map(l => `<div>${escapeHtml(l)}</div>`).join('')}
          ${profile && profile.phone ? `<div>Tel: ${escapeHtml(profile.phone)}</div>` : ''}
          ${profile && profile.email ? `<div>Email: ${escapeHtml(profile.email)}</div>` : ''}
          ${profile && profile.tax_id ? `<div>Tax ID: ${escapeHtml(profile.tax_id)}</div>` : ''}
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-badge ${invoice.invoice_type || ''}">${escapeHtml(docLabel)}</div>
        <div class="doc-number">${escapeHtml(invoice.invoice_number)}</div>
        <table class="meta-table">
          <tr><td>Invoice Date:</td><td>${escapeHtml(formatDate(invoice.date_created))}</td></tr>
          <tr><td>Due Date:</td><td>${escapeHtml(formatDate(invoice.date_due))}</td></tr>
          <tr><td>Status:</td><td>${escapeHtml(INVOICE_STATUS_LABELS[status] || status)}</td></tr>
        </table>
      </div>
    </div>

    ${statusBannerHtml}

    <div class="parties-section">
      <div class="client-card">
        <div class="card-label">Billed To</div>
        <div class="client-name">${escapeHtml(client ? client.name : 'Client')}</div>
        ${client && client.company_name ? `<div>${escapeHtml(client.company_name)}</div>` : ''}
        ${invoice.contact ? `<div>Attn: ${escapeHtml(invoice.contact.name)}${invoice.contact.role ? ` (${escapeHtml(invoice.contact.role)})` : ''}</div>` : ''}
        <div class="client-details">
          ${clientLines.map(l => `<div>${escapeHtml(l)}</div>`).join('')}
        </div>
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th class="col-desc">Description</th>
          <th class="col-qty">Qty</th>
          <th class="col-price">Unit Price</th>
          <th class="col-disc">Discount</th>
          <th class="col-tax">Tax</th>
          <th class="col-total">Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>

    <div class="totals-wrapper">
      <div class="totals-box">
        ${totalsHtml}
        <div class="totals-row grand">
          <span class="label">Total</span>
          <span class="value">${money(invoice.total, currency)}</span>
        </div>
        ${extraTotalsHtml}
      </div>
    </div>

    ${paymentDetails ? `
      <div class="payment-instructions">
        <h4>Payment Instructions / Bank Details</h4>
        <p>${escapeHtml(paymentDetails)}</p>
      </div>
    ` : ''}

    ${invoice.notes || invoice.terms ? `
      <div class="notes-terms">
        <h4>Notes &amp; Payment Terms</h4>
        <p>${escapeHtml([invoice.notes, invoice.terms].filter(Boolean).join('\n\n'))}</p>
      </div>
    ` : ''}

    <div class="footer-note">
      Prepared by ${escapeHtml(businessName)} &bull; Generated locally with QuoteCraft
    </div>
  </div>
</body>
</html>`;
}

module.exports = {
  THEMES,
  renderQuotePdf,
  renderInvoicePdf,
  renderCreditNotePdf,
  renderClientStatementPdf,
  renderPaymentsPdf,
  renderQuoteHtml,
  renderInvoiceHtml,
  renderQuotePrintHtml,
  renderInvoicePrintHtml,
};