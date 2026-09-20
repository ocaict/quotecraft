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
  renderQuotePdf,
  renderInvoicePdf,
} = require('../src/main/pdf-export');

async function runTests() {
  console.log('--- Starting PDF Template Themes Unit Tests ---');

  await initializeDatabase();
  console.log('✓ Database initialized with Migration 32');

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
  console.log('✓ Default profile pdf_theme is classic');

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
