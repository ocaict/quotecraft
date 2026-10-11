const path = require('path');
const fs = require('fs');
const assert = require('assert');

// ---- Isolated test DB ----
const testDbPath = path.join(__dirname, 'test-stage1-nigeria.sqlite');
if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  saveCompanyProfile,
  getCompanyProfile,
  addClient,
  createInvoice,
  getInvoice,
  setInvoiceWhtCredit,
  addPayment,
  computeDocumentTotals,
} = require('../src/main/database');

// Mirrors renderer integer-cents arithmetic
function toCents(v) {
  if (v === '' || v === null || v === undefined || isNaN(Number(v))) return 0;
  return Math.round(Number(v) * 100);
}
function lineNetCents(qty, price, discType, discValue) {
  const raw = Math.round(toCents(qty) * toCents(price) / 100);
  let dc = 0;
  if (discType && discType !== 'none' && !isNaN(discValue) && discValue > 0) {
    dc = discType === 'fixed' ? toCents(discValue) : Math.round(raw * discValue / 100);
    if (dc > raw) dc = raw;
  }
  return raw - dc;
}

const SAMPLE_LINE_ITEMS = [
  { description: 'Web Design Service', quantity: 1, unit_price: 500000, discount_type: 'none', discount_value: 0, tax_rate: 7.5, amount: 500000 },
  { description: 'Logo Design', quantity: 2, unit_price: 50000, discount_type: 'none', discount_value: 0, tax_rate: 7.5, amount: 100000 },
];

async function runTests() {
  console.log('=== Stage 1 Nigeria: Business Profile & Tax Compliance Tests ===\n');
  await initializeDatabase();
  console.log('✓ Database initialized\n');

  // ---- 1. CAC & TIN persistence ----
  console.log('--- Test 1: CAC Number & TIN persistence ---');
  saveCompanyProfile({
    business_name: 'Acme Nigeria Ltd',
    default_currency: 'NGN',
    cac_number: 'RC-1234567',
    tin: '12345678-0001',
    default_tax_rate: 7.5,
  });
  const pf = getCompanyProfile();
  assert.strictEqual(pf.cac_number, 'RC-1234567', 'CAC number must persist');
  assert.strictEqual(pf.tin, '12345678-0001', 'TIN must persist');
  assert.strictEqual(pf.business_name, 'Acme Nigeria Ltd', 'Business name must persist');
  console.log('✓ CAC number and TIN saved and retrieved correctly');
  console.log(`  cac_number = ${pf.cac_number}`);
  console.log(`  tin        = ${pf.tin}\n`);

  // ---- 2. Default tax rate 7.5% ----
  console.log('--- Test 2: Default 7.5% Nigerian statutory VAT rate ---');
  assert.strictEqual(pf.default_tax_rate, 7.5, 'Default tax rate must be 7.5%');
  console.log('✓ Default tax rate = 7.5% (Nigerian statutory VAT)\n');

  // ---- 3. Client setup ----
  const createdClient = addClient({ name: 'Dangote Group', email: 'accounts@dangote.com' });
  assert(createdClient && createdClient.id, 'Client must be created');
  const clientId = createdClient.id;

  // ---- 4. Invoice with 7.5% VAT, no WHT ----
  console.log('--- Test 3: Invoice with 7.5% VAT (no WHT) ---');
  const lineItems0 = [
    { description: 'IT Consulting', quantity: 1, unit_price: 200000, discount_type: 'none', discount_value: 0, tax_rate: 7.5, amount: 200000 },
  ];
  const data0 = {
    client_id: clientId,
    date_created: '2024-10-01',
    currency: 'NGN',
    exchange_rate: 1,
    tax_rate: 7.5,
    discount_type: 'none',
    discount_value: 0,
    wht_rate: 0,
  };
  const res0 = createInvoice(data0, lineItems0);
  assert(res0.ok, `Invoice creation must succeed: ${JSON.stringify(res0.errors || {})}`);
  const inv0 = getInvoice(res0.invoice.id);
  assert.strictEqual(Number(inv0.wht_rate), 0, 'WHT rate should be 0');
  assert.strictEqual(Number(inv0.wht_amount), 0, 'WHT amount should be 0');
  const expectedSubtotal0 = 200000;
  const expectedTax0 = Math.round(expectedSubtotal0 * 7.5 / 100);
  const expectedTotal0 = expectedSubtotal0 + expectedTax0;
  assert.strictEqual(Number(inv0.subtotal), expectedSubtotal0, `Subtotal must be ${expectedSubtotal0}`);
  assert.strictEqual(Number(inv0.total), expectedTotal0, `Total must be ${expectedTotal0} (subtotal + 7.5% VAT)`);
  console.log(`✓ Subtotal: ₦${inv0.subtotal.toLocaleString()}, VAT (7.5%): ₦${expectedTax0.toLocaleString()}, Gross Total: ₦${inv0.total.toLocaleString()}`);
  console.log(`✓ Net Payable (no WHT) = ₦${inv0.total.toLocaleString()}\n`);

  // ---- 5. Invoice with 5% WHT (Goods & Contracts) ----
  console.log('--- Test 4: Invoice with 7.5% VAT + 5% WHT (Goods) ---');
  const lineItems5 = [
    { description: 'Software Supply', quantity: 1, unit_price: 400000, discount_type: 'none', discount_value: 0, tax_rate: 7.5, amount: 400000 },
  ];
  const data5 = {
    client_id: clientId,
    date_created: '2024-10-02',
    currency: 'NGN',
    exchange_rate: 1,
    tax_rate: 7.5,
    discount_type: 'none',
    discount_value: 0,
    wht_rate: 5,
  };
  const res5 = createInvoice(data5, lineItems5);
  assert(res5.ok, `Invoice with 5% WHT must succeed: ${JSON.stringify(res5.errors || {})}`);
  const inv5 = getInvoice(res5.invoice.id);
  const subtotal5 = 400000;
  const vat5 = Math.round(subtotal5 * 7.5 / 100);
  const grossTotal5 = subtotal5 + vat5;
  const wht5 = Math.round(subtotal5 * 5 / 100); // WHT on net subtotal (excl. VAT)
  const netPayable5 = grossTotal5 - wht5;

  assert.strictEqual(Number(inv5.subtotal), subtotal5, `Subtotal must be ${subtotal5}`);
  assert.strictEqual(Number(inv5.total), grossTotal5, `Gross total must be ${grossTotal5}`);
  assert.strictEqual(Number(inv5.wht_rate), 5, 'WHT rate must be 5');
  assert.strictEqual(Number(inv5.wht_amount), wht5, `WHT amount must be ${wht5}`);
  console.log(`✓ Subtotal: ₦${subtotal5.toLocaleString()}, VAT (7.5%): ₦${vat5.toLocaleString()}, Gross: ₦${grossTotal5.toLocaleString()}`);
  console.log(`✓ WHT (5%): -₦${wht5.toLocaleString()}, Net Payable: ₦${netPayable5.toLocaleString()}`);

  // balance_due on fresh invoice should equal net_payable
  const expectedBalance5 = netPayable5;
  assert.strictEqual(Number(inv5.balance_due), expectedBalance5, `Initial balance_due must equal net_payable (${expectedBalance5})`);
  console.log(`✓ Initial balance_due = ₦${inv5.balance_due.toLocaleString()} (equals net payable)\n`);

  // ---- 6. Invoice with 10% WHT (Professional Services) ----
  console.log('--- Test 5: Invoice with 7.5% VAT + 10% WHT (Professional Services) ---');
  const lineItems10 = [
    { description: 'Legal Consultancy', quantity: 1, unit_price: 1000000, discount_type: 'none', discount_value: 0, tax_rate: 7.5, amount: 1000000 },
  ];
  const data10 = {
    client_id: clientId,
    date_created: '2024-10-03',
    currency: 'NGN',
    exchange_rate: 1,
    tax_rate: 7.5,
    discount_type: 'none',
    discount_value: 0,
    wht_rate: 10,
  };
  const res10 = createInvoice(data10, lineItems10);
  assert(res10.ok, `Invoice with 10% WHT must succeed`);
  const inv10 = getInvoice(res10.invoice.id);
  const subtotal10 = 1000000;
  const vat10 = Math.round(subtotal10 * 7.5 / 100);
  const grossTotal10 = subtotal10 + vat10;
  const wht10 = Math.round(subtotal10 * 10 / 100);
  const netPayable10 = grossTotal10 - wht10;

  assert.strictEqual(Number(inv10.wht_rate), 10, 'WHT rate must be 10');
  assert.strictEqual(Number(inv10.wht_amount), wht10, `WHT amount must be ${wht10}`);
  assert.strictEqual(Number(inv10.balance_due), netPayable10, `balance_due must equal net_payable (${netPayable10})`);
  console.log(`✓ Subtotal: ₦${subtotal10.toLocaleString()}, VAT (7.5%): ₦${vat10.toLocaleString()}, Gross: ₦${grossTotal10.toLocaleString()}`);
  console.log(`✓ WHT (10%): -₦${wht10.toLocaleString()}, Net Payable: ₦${netPayable10.toLocaleString()}`);
  console.log(`✓ balance_due = ₦${inv10.balance_due.toLocaleString()} (equals net payable)\n`);

  // ---- 7. Paying net payable zeroes the balance ----
  console.log('--- Test 6: Paying net payable amount zeroes balance_due ---');
  const paymentRes = addPayment(inv10.id, {
    amount: netPayable10,
    payment_date: '2024-10-10',
    payment_method: 'Bank Transfer',
    reference_number: 'TRF-001',
    notes: 'Client paid net of WHT',
  });
  assert(paymentRes.ok, `Payment must succeed: ${JSON.stringify(paymentRes.errors || {})}`);
  const inv10AfterPay = getInvoice(inv10.id);
  assert.strictEqual(Number(inv10AfterPay.balance_due), 0, 'Balance due must be 0 after net payable is paid');
  assert.strictEqual(inv10AfterPay.status, 'paid', 'Invoice status must be "paid"');
  console.log(`✓ After paying net payable ₦${netPayable10.toLocaleString()}, balance_due = 0`);
  console.log(`✓ Invoice status = "${inv10AfterPay.status}"\n`);

  // ---- 8. WHT Credit Certificate tracking ----
  console.log('--- Test 7: WHT Credit Certificate (FIRS) tracking ---');
  // Initially no certificate
  assert.strictEqual(Number(inv10AfterPay.wht_credit_received), 0, 'Initially WHT credit not received');
  assert.strictEqual(inv10AfterPay.wht_credit_note_ref || '', '', 'Initially WHT credit ref is empty');

  const whtUpdateRes = setInvoiceWhtCredit(inv10.id, {
    wht_credit_received: true,
    wht_credit_note_ref: 'FIRS-WHT-2024-001',
  });
  assert(whtUpdateRes.ok, `setInvoiceWhtCredit must succeed: ${JSON.stringify(whtUpdateRes)}`);
  const inv10WithCert = getInvoice(inv10.id);
  assert.strictEqual(Number(inv10WithCert.wht_credit_received), 1, 'WHT credit must be marked as received');
  assert.strictEqual(inv10WithCert.wht_credit_note_ref, 'FIRS-WHT-2024-001', 'WHT credit ref must be saved');
  console.log(`✓ WHT certificate received = ${inv10WithCert.wht_credit_received === 1 ? 'Yes' : 'No'}`);
  console.log(`✓ WHT credit note ref = ${inv10WithCert.wht_credit_note_ref}`);

  // Clear certificate
  const whtClearRes = setInvoiceWhtCredit(inv10.id, {
    wht_credit_received: false,
    wht_credit_note_ref: '',
  });
  assert(whtClearRes.ok, 'Clearing WHT credit must succeed');
  const inv10Cleared = getInvoice(inv10.id);
  assert.strictEqual(Number(inv10Cleared.wht_credit_received), 0, 'WHT credit must be cleared');
  console.log(`✓ WHT certificate cleared successfully\n`);

  // ---- 9. Backward compatibility: invoice with no WHT ----
  console.log('--- Test 8: Backward compatibility (wht_rate = 0) ---');
  const resLegacy = createInvoice({
    client_id: clientId,
    date_created: '2024-10-04',
    currency: 'NGN',
    exchange_rate: 1,
    tax_rate: 0,
    discount_type: 'none',
    discount_value: 0,
    // NO wht_rate field — should default to 0
  }, [{ description: 'Standard Service', quantity: 1, unit_price: 100000, tax_rate: 0, amount: 100000 }]);
  assert(resLegacy.ok, 'Legacy invoice without wht_rate must succeed');
  const invLegacy = getInvoice(resLegacy.invoice.id);
  assert.strictEqual(Number(invLegacy.wht_rate), 0, 'Default wht_rate must be 0');
  assert.strictEqual(Number(invLegacy.wht_amount), 0, 'Default wht_amount must be 0');
  assert.strictEqual(Number(invLegacy.balance_due), 100000, 'balance_due must equal gross total (100000) when no WHT');
  console.log(`✓ Legacy invoice (no WHT) behaves identically to before`);
  console.log(`  wht_rate = ${invLegacy.wht_rate}, wht_amount = ${invLegacy.wht_amount}, balance_due = ₦${invLegacy.balance_due.toLocaleString()}\n`);

  // ---- 10. computeDocumentTotals helper ----
  console.log('--- Test 9: computeDocumentTotals WHT calculation ---');
  const totals = computeDocumentTotals(
    { discount_type: 'none', discount_value: 0, tax_rate: 7.5, wht_rate: 10 },
    [{ quantity: 1, unit_price: 200000, discount_type: 'none', discount_value: 0, tax_rate: 7.5 }]
  );
  const expectedSub = 200000;
  const expectedVat = Math.round(expectedSub * 7.5 / 100);
  const expectedGross = expectedSub + expectedVat;
  const expectedWht = Math.round(expectedSub * 10 / 100);
  const expectedNet = expectedGross - expectedWht;
  assert.strictEqual(totals.subtotal, expectedSub, `computeDocumentTotals subtotal must be ${expectedSub}`);
  assert.strictEqual(totals.wht_rate, 10, 'computeDocumentTotals wht_rate must be 10');
  assert.strictEqual(totals.wht_amount, expectedWht, `computeDocumentTotals wht_amount must be ${expectedWht}`);
  assert.strictEqual(totals.net_payable, expectedNet, `computeDocumentTotals net_payable must be ${expectedNet}`);
  console.log(`✓ computeDocumentTotals: subtotal=${totals.subtotal}, wht_amount=${totals.wht_amount}, net_payable=${totals.net_payable}\n`);

  // ---- Summary ----
  console.log('========================================');
  console.log(' ALL STAGE 1 NIGERIA TESTS PASSED (100%)');
  console.log('========================================');
  console.log('\nStage 1 features verified:');
  console.log('  [✓] CAC Registration (RC/BN) & TIN saved to company_profile');
  console.log('  [✓] 7.5% Nigerian statutory VAT default rate');
  console.log('  [✓] 5% WHT calculation (Goods & Contracts)');
  console.log('  [✓] 10% WHT calculation (Professional Services & Agency)');
  console.log('  [✓] Net Payable = Gross Total − WHT');
  console.log('  [✓] balance_due initialises to Net Payable (not Gross Total)');
  console.log('  [✓] Paying net payable amount clears balance to zero');
  console.log('  [✓] FIRS WHT Credit Certificate tracking (received flag & ref)');
  console.log('  [✓] Backward compatibility: invoices without WHT unaffected');
  console.log('  [✓] computeDocumentTotals returns wht_rate, wht_amount, net_payable');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILURE:', err.message || err);
  process.exit(1);
}).finally(() => {
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
});
