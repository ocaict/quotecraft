const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  renderQuotePdf,
  renderInvoicePdf,
  money,
} = require('../src/main/pdf-export');

async function runStage2Tests() {
  console.log('=== Starting Stage 2 Unit Tests: PDF Engine & Universal Typography ===\n');

  // 1. Verify Font Assets
  console.log('--- Testing Bundled TrueType Font Files ---');
  const fontsDir = path.join(__dirname, '../src/main/assets/fonts');
  const regularFont = path.join(fontsDir, 'QuoteCraft-Regular.ttf');
  const boldFont = path.join(fontsDir, 'QuoteCraft-Bold.ttf');
  const obliqueFont = path.join(fontsDir, 'QuoteCraft-Oblique.ttf');

  assert(fs.existsSync(regularFont), 'QuoteCraft-Regular.ttf must exist in assets/fonts');
  assert(fs.existsSync(boldFont), 'QuoteCraft-Bold.ttf must exist in assets/fonts');
  assert(fs.existsSync(obliqueFont), 'QuoteCraft-Oblique.ttf must exist in assets/fonts');

  const regStat = fs.statSync(regularFont);
  const boldStat = fs.statSync(boldFont);
  assert(regStat.size > 100000, 'Regular font file should be > 100KB');
  assert(boldStat.size > 100000, 'Bold font file should be > 100KB');
  console.log(`✓ TrueType fonts present (${Math.round(regStat.size / 1024)} KB regular, ${Math.round(boldStat.size / 1024)} KB bold)`);

  // 2. Testing Currency Formatting Output
  console.log('\n--- Testing Unicode Currency Formatting ---');
  assert.strictEqual(money(50000, 'NGN'), '₦50,000.00', 'NGN must format with ₦ symbol');
  assert.strictEqual(money(1200, 'GBP'), '£1,200.00', 'GBP must format with £ symbol');
  assert.strictEqual(money(2500, 'EUR'), '€2,500.00', 'EUR must format with € symbol');
  assert.strictEqual(money(75000, 'INR'), '₹75,000.00', 'INR must format with ₹ symbol');
  assert.strictEqual(money(100, 'USD'), '$100.00', 'USD must format with $ symbol');
  console.log('✓ Currency symbols (₦, £, €, ₹, $) formatted natively without fallback text');

  // 3. Test Full Quote PDF Generation with NGN
  console.log('\n--- Testing Full Quote PDF Generation (NGN) ---');
  const mockQuote = {
    quote_number: 'Q-2026-001',
    date_created: '2026-10-10',
    valid_until: '2026-11-10',
    status: 'sent',
    currency: 'NGN',
    subtotal: 100000,
    discount_amount: 0,
    tax_rate: 7.5,
    tax_amount: 7500,
    total: 107500,
    notes: 'Payment via local bank transfer.',
    line_items: [
      { description: 'Consulting Services', quantity: 2, unit_price: 50000, amount: 100000, unit_label: 'sessions' },
    ],
  };

  const mockClient = {
    name: 'Chidi & Associates',
    company_name: 'Chidi Global Ltd',
    email: 'chidi@example.com',
    address_line1: '14 Marina Street',
    city: 'Lagos',
    country: 'Nigeria',
  };

  const mockProfile = {
    business_name: 'QuoteCraft Creative Studio',
    email: 'billing@quotecraft.test',
    default_currency: 'NGN',
  };

  const quotePdfBuffer = await renderQuotePdf(mockQuote, mockClient, mockProfile);
  assert(Buffer.isBuffer(quotePdfBuffer), 'Result must be a Buffer');
  assert(quotePdfBuffer.length > 5000, 'Quote PDF must have substantial byte size');
  console.log(`✓ Quote PDF with Naira (₦) generated successfully (${quotePdfBuffer.length} bytes)`);

  // 4. Test Full Invoice PDF Generation with INR and Multi-byte Characters
  console.log('\n--- Testing Full Invoice PDF Generation (INR & International Characters) ---');
  const mockInvoice = {
    invoice_number: 'INV-2026-099',
    date_created: '2026-10-10',
    date_due: '2026-10-24',
    status: 'sent',
    currency: 'INR',
    subtotal: 50000,
    discount_amount: 0,
    tax_rate: 18,
    tax_amount: 9000,
    total: 59000,
    amount_paid: 0,
    balance_due: 59000,
    line_items: [
      { description: 'Full-Stack Software Architecture', quantity: 1, unit_price: 50000, amount: 50000, unit_label: 'sprints' },
    ],
  };

  const mockClientIndia = {
    name: 'Rajesh Sharma',
    company_name: 'Sharma Tech Innovations',
    email: 'rajesh@example.com',
    city: 'Bengaluru',
    country: 'India',
  };

  const invoicePdfBuffer = await renderInvoicePdf(mockInvoice, mockClientIndia, mockProfile);
  assert(Buffer.isBuffer(invoicePdfBuffer), 'Result must be a Buffer');
  assert(invoicePdfBuffer.length > 5000, 'Invoice PDF must have substantial byte size');
  console.log(`✓ Invoice PDF with Rupee (₹) generated successfully (${invoicePdfBuffer.length} bytes)`);

  console.log('\n========================================');
  console.log(' ALL STAGE 2 UNIT TESTS PASSED (100%)');
  console.log('========================================');
}

runStage2Tests().catch((err) => {
  console.error('Stage 2 test failure:', err);
  process.exit(1);
});
