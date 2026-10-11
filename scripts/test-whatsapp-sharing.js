const assert = require('assert');
const {
  normalizeNigerianPhone,
  formatWhatsAppPhone,
  buildWhatsAppInvoiceMessage,
  buildWhatsAppQuoteMessage,
  formatWhatsAppMoney,
} = require('../src/shared/constants');

console.log('--- Testing Stage 4: 1-Click WhatsApp Invoice & Quote Sharing ---');

// Test 1: Phone number normalization
console.log('Test 1: normalizeNigerianPhone');
assert.strictEqual(
  normalizeNigerianPhone('08031234567'),
  '+2348031234567',
  'Standard 11-digit 080... Nigerian mobile should normalize to +234...'
);
assert.strictEqual(
  normalizeNigerianPhone('07012345678'),
  '+2347012345678',
  '11-digit 070... Nigerian mobile should normalize to +234...'
);
assert.strictEqual(
  normalizeNigerianPhone('09098765432'),
  '+2349098765432',
  '11-digit 090... Nigerian mobile should normalize to +234...'
);
assert.strictEqual(
  normalizeNigerianPhone('09123456789'),
  '+2349123456789',
  '11-digit 091... Nigerian mobile should normalize to +234...'
);
assert.strictEqual(
  normalizeNigerianPhone('+2348031234567'),
  '+2348031234567',
  'Already international +234 number should be preserved'
);
assert.strictEqual(
  normalizeNigerianPhone('+23408031234567'),
  '+2348031234567',
  'Erroneous +2340... should strip the redundant zero'
);
assert.strictEqual(
  normalizeNigerianPhone('0803 123 4567'),
  '+2348031234567',
  'Spaced Nigerian number should normalize cleanly'
);
assert.strictEqual(
  normalizeNigerianPhone('2348031234567'),
  '+2348031234567',
  '234 without plus should gain leading +'
);
assert.strictEqual(
  normalizeNigerianPhone('8031234567'),
  '+2348031234567',
  '10-digit number without leading 0 should normalize to +234...'
);
assert.strictEqual(
  normalizeNigerianPhone('+1 555 123 4567'),
  '+1 555 123 4567',
  'Foreign numbers should remain untouched'
);
assert.strictEqual(normalizeNigerianPhone(''), '', 'Empty string returns empty');
assert.strictEqual(normalizeNigerianPhone(null), '', 'Null returns empty');
console.log('✓ normalizeNigerianPhone passed.');

// Test 2: WhatsApp digits extraction
console.log('Test 2: formatWhatsAppPhone');
assert.strictEqual(
  formatWhatsAppPhone('08031234567'),
  '2348031234567',
  'wa.me digits should be pure international digits without +'
);
assert.strictEqual(
  formatWhatsAppPhone('+234 803 123 4567'),
  '2348031234567',
  'wa.me digits should strip whitespace and plus'
);
assert.strictEqual(
  formatWhatsAppPhone('+1 (555) 123-4567'),
  '15551234567',
  'wa.me digits for US number should be pure digits'
);
assert.strictEqual(formatWhatsAppPhone(''), '', 'Empty string returns empty');
assert.strictEqual(formatWhatsAppPhone(null), '', 'Null returns empty');
console.log('✓ formatWhatsAppPhone passed.');

// Test 3: formatWhatsAppMoney
console.log('Test 3: formatWhatsAppMoney');
assert.strictEqual(
  formatWhatsAppMoney(150000, 'NGN'),
  '₦150,000.00',
  'NGN currency should use ₦ symbol and commas'
);
assert.strictEqual(
  formatWhatsAppMoney(2500.5, 'USD'),
  '$2,500.50',
  'USD currency should use $ symbol'
);
console.log('✓ formatWhatsAppMoney passed.');

// Test 4: Invoice WhatsApp message compilation
console.log('Test 4: buildWhatsAppInvoiceMessage');
const mockProfile = {
  business_name: 'Apex Digital Solutions Ltd',
  bank_name: 'Zenith Bank',
  account_number: '1012345678',
  account_name: 'Apex Digital Solutions Ltd',
  default_currency: 'NGN',
};

const mockClient = {
  name: 'Aliko Dangote & Partners',
};

const mockInvoice = {
  invoice_number: 'INV-2026-0042',
  total: 450000,
  currency: 'NGN',
  date_due: '2026-11-15',
  payment_link: 'https://paystack.com/pay/qc_demo123',
};

const invoiceMsg = buildWhatsAppInvoiceMessage({
  invoice: mockInvoice,
  client: mockClient,
  profile: mockProfile,
});

assert(invoiceMsg.includes('Hello Aliko Dangote & Partners,'), 'Should greet client by name');
assert(invoiceMsg.includes('Invoice INV-2026-0042'), 'Should include invoice number');
assert(invoiceMsg.includes('₦450,000.00'), 'Should include formatted amount');
assert(invoiceMsg.includes('Apex Digital Solutions Ltd'), 'Should include business name');
assert(invoiceMsg.includes('• Due Date: 2026-11-15'), 'Should include due date');
assert(invoiceMsg.includes('• Pay Online (Card/Transfer/USSD): https://paystack.com/pay/qc_demo123'), 'Should include Paystack link');
assert(invoiceMsg.includes('• Bank Transfer: Zenith Bank | 1012345678 | Apex Digital Solutions Ltd'), 'Should include bank transfer details');
assert(invoiceMsg.includes('The detailed PDF invoice has been attached.'), 'Should mention attached PDF');
console.log('✓ buildWhatsAppInvoiceMessage passed.');

// Test 5: Quote WhatsApp message compilation
console.log('Test 5: buildWhatsAppQuoteMessage');
const mockQuote = {
  quote_number: 'Q-2026-0015',
  total: 750000,
  currency: 'NGN',
  valid_until: '2026-11-30',
};

const quoteMsg = buildWhatsAppQuoteMessage({
  quote: mockQuote,
  client: mockClient,
  profile: mockProfile,
});

assert(quoteMsg.includes('Hello Aliko Dangote & Partners,'), 'Should greet client by name');
assert(quoteMsg.includes('Quote Q-2026-0015'), 'Should include quote number');
assert(quoteMsg.includes('₦750,000.00'), 'Should include formatted amount');
assert(quoteMsg.includes('• Valid Until: 2026-11-30'), 'Should include validity date');
assert(quoteMsg.includes('• Bank Transfer: Zenith Bank | 1012345678 | Apex Digital Solutions Ltd'), 'Should include bank transfer details');
assert(quoteMsg.includes('The detailed PDF quote has been attached.'), 'Should mention attached PDF');
console.log('✓ buildWhatsAppQuoteMessage passed.');

// Test 6: Domiciliary / Wire WhatsApp message
console.log('Test 6: Domiciliary currency in WhatsApp message');
const domProfile = {
  business_name: 'Apex Global FZE',
  dom_bank_name: 'Standard Chartered Bank',
  dom_account_number: '0039876543',
  dom_account_name: 'Apex Global FZE USD Account',
  dom_swift_code: 'SCBLNGLA',
  default_currency: 'USD',
};

const usdInvoice = {
  invoice_number: 'INV-USD-001',
  total: 5000,
  currency: 'USD',
  date_due: '2026-12-01',
};

const usdMsg = buildWhatsAppInvoiceMessage({
  invoice: usdInvoice,
  client: mockClient,
  profile: domProfile,
});

assert(usdMsg.includes('$5,000.00'), 'Should format USD amount');
assert(usdMsg.includes('Standard Chartered Bank | 0039876543 | Apex Global FZE USD Account (SWIFT: SCBLNGLA)'), 'Should format Domiciliary details with SWIFT');
console.log('✓ Domiciliary WhatsApp message passed.');

console.log('--- ALL WHATSAPP SHARING TESTS PASSED (6/6) ---');
