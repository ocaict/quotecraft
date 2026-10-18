const path = require('path');
const fs = require('fs');
const assert = require('assert');

const testDbPath = path.join(__dirname, 'test-pdf-theme.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  getCompanyProfile,
  saveCompanyProfile,
  addClient,
  createQuote,
  convertQuoteToInvoice,
  getQuote,
  getInvoice,
} = require('../src/main/database');

const {
  THEMES,
  LAYOUT_STYLES,
  renderQuotePdf,
  renderInvoicePdf,
} = require('../src/main/pdf-export');

async function runTests() {
  console.log('--- Starting PDF Template Themes Unit Tests ---');

  await initializeDatabase();
  console.log('✓ Database initialized with Migration 32 & 49');

  // 1. Verify themes definition
  assert(THEMES.classic, 'Theme classic should exist');
  assert(THEMES.modern, 'Theme modern should exist');
  assert(THEMES.minimal, 'Theme minimal should exist');
  assert(THEMES.dark, 'Theme dark should exist');
  console.log('✓ All 4 themes defined in pdf-export.js');

  // 2. Check profile creation with default theme
  saveCompanyProfile({
    business_name: 'Acme Studio',
  });
  const initialProfile = getCompanyProfile();
  assert.strictEqual(initialProfile.pdf_theme, 'classic', 'Default theme should be classic');
  assert.strictEqual(initialProfile.pdf_accent_color, null, 'Default accent color should be null');
  assert.strictEqual(initialProfile.pdf_layout_style, 'standard', 'Default layout style should be standard');
  console.log('✓ Default profile pdf_theme is classic, accent is null, layout is standard');

  // 3. Save profile with new theme
  saveCompanyProfile({
    business_name: 'Studio Indigo',
    pdf_theme: 'modern',
  });
  const updatedProfile = getCompanyProfile();
  assert.strictEqual(updatedProfile.pdf_theme, 'modern', 'Updated theme should be modern');
  console.log('✓ Company profile pdf_theme updated to modern');

  // 4. Test rendering Quote & Invoice PDFs with themes
  const clientRes = addClient({
    name: 'Acme Design Corp',
    email: 'acme@example.com',
  });
  const clientId = clientRes.id;

  const quoteRes = createQuote(
    {
      client_id: clientId,
      currency: 'USD',
      date_created: '2026-09-20',
    },
    [
      { description: 'Design Mockups', quantity: 2, unit_price: 150 },
    ]
  );
  if (!quoteRes.ok) {
    console.error('Quote create errors:', quoteRes.errors);
  }
  assert(quoteRes.ok, 'Quote should be created');
  const quote = quoteRes.quote;

  // Render quote with modern theme from profile
  const quotePdfBytes = await renderQuotePdf(quote, { name: 'Acme Design Corp' }, updatedProfile);
  assert(quotePdfBytes && quotePdfBytes.length > 0, 'Quote PDF buffer should be generated');
  console.log(`✓ Quote PDF generated with profile theme (bytes: ${quotePdfBytes.length})`);

  // Render quote with minimal theme override in opts
  const minimalQuotePdfBytes = await renderQuotePdf(quote, { name: 'Acme Design Corp' }, updatedProfile, { theme: 'minimal' });
  assert(minimalQuotePdfBytes && minimalQuotePdfBytes.length > 0, 'Minimal Quote PDF buffer should be generated');
  console.log(`✓ Minimal Quote PDF generated with opts override (bytes: ${minimalQuotePdfBytes.length})`);

  // Convert quote to invoice
  const { setQuoteStatus } = require('../src/main/database');
  setQuoteStatus(quote.id, 'accepted');
  const invRes = convertQuoteToInvoice(quote.id);
  assert(invRes.ok, 'Conversion should succeed');
  const invoice = invRes.invoice;

  // Render invoice with dark theme
  const darkInvoicePdfBytes = await renderInvoicePdf(invoice, { name: 'Acme Design Corp' }, updatedProfile, { theme: 'dark' });
  assert(darkInvoicePdfBytes && darkInvoicePdfBytes.length > 0, 'Dark Invoice PDF buffer should be generated');
  console.log(`✓ Dark Invoice PDF generated with opts override (bytes: ${darkInvoicePdfBytes.length})`);

  // 5. Test LAYOUT_STYLES export
  assert(LAYOUT_STYLES instanceof Set, 'LAYOUT_STYLES should be a Set');
  assert(LAYOUT_STYLES.has('standard'), 'LAYOUT_STYLES should contain standard');
  assert(LAYOUT_STYLES.has('compact'), 'LAYOUT_STYLES should contain compact');
  assert(LAYOUT_STYLES.has('corporate'), 'LAYOUT_STYLES should contain corporate');
  console.log('✓ LAYOUT_STYLES exported and contains standard, compact, corporate');

  // 6. Test pdf_accent_color is saved and validated
  saveCompanyProfile({ business_name: 'Brand Co', pdf_accent_color: '#E11D48' });
  const brandProfile = getCompanyProfile();
  assert.strictEqual(brandProfile.pdf_accent_color, '#E11D48', 'pdf_accent_color should match valid hex');
  console.log('✓ Valid pdf_accent_color saved successfully');

  // 7. Invalid hex is rejected (stored as null)
  saveCompanyProfile({ business_name: 'Brand Co', pdf_accent_color: 'not-a-color' });
  const invalidProfile = getCompanyProfile();
  assert.strictEqual(invalidProfile.pdf_accent_color, null, 'Invalid hex should be normalized to null');
  console.log('✓ Invalid pdf_accent_color rejected to null');

  // 8. pdf_layout_style is saved and defaults verified
  saveCompanyProfile({ business_name: 'Brand Co', pdf_layout_style: 'compact' });
  assert.strictEqual(getCompanyProfile().pdf_layout_style, 'compact', 'pdf_layout_style should update to compact');

  saveCompanyProfile({ business_name: 'Brand Co', pdf_layout_style: 'corporate' });
  assert.strictEqual(getCompanyProfile().pdf_layout_style, 'corporate', 'pdf_layout_style should update to corporate');

  saveCompanyProfile({ business_name: 'Brand Co', pdf_layout_style: 'invalid_layout' });
  assert.strictEqual(getCompanyProfile().pdf_layout_style, 'standard', 'Invalid layout should fall back to standard');
  console.log('✓ pdf_layout_style saved and validated with standard fallback');

  // 9. Render invoice with accent color and compact layout
  const compactPdfBytes = await renderInvoicePdf(invoice, { name: 'Acme Design Corp' }, brandProfile, {
    accentColor: '#E11D48',
    layoutStyle: 'compact',
  });
  assert(compactPdfBytes && compactPdfBytes.length > 0, 'Compact Invoice PDF should be generated');
  console.log(`✓ Invoice PDF generated with accent color & compact layout (bytes: ${compactPdfBytes.length})`);

  // 10. Render invoice with corporate layout
  const corporatePdfBytes = await renderInvoicePdf(invoice, { name: 'Acme Design Corp' }, brandProfile, {
    accentColor: '#059669',
    layoutStyle: 'corporate',
  });
  assert(corporatePdfBytes && corporatePdfBytes.length > 0, 'Corporate Invoice PDF should be generated');
  console.log(`✓ Invoice PDF generated with accent color & corporate banner layout (bytes: ${corporatePdfBytes.length})`);

  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('--- All PDF Theme Unit Tests Passed! ---');
}

runTests().catch((err) => {
  console.error('Test failed:', err.stack || err);
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  process.exit(1);
});
