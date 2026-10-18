/**
 * QuoteCraft Standalone Unit Tests: Phase 2 Visual Dashboard Analytics & Cash Flow Timeline
 * Tests cash flow timeline aggregation, multi-currency conversion,
 * credit note adjustments, net profit calculations, and range filters.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Point to test db path
const testDbPath = path.join(__dirname, 'test-cashflow-analytics.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  saveCompanyProfile,
  addClient,
  createInvoice,
  addPayment,
  issueCreditNote,
  createExpense,
  getCashFlowTimeline,
} = require('../src/main/database');

async function runTests() {
  console.log('--- Starting Phase 2 Cash Flow Analytics Unit Tests ---');

  await initializeDatabase();

  saveCompanyProfile({
    business_name: 'Acme Global Ventures',
    default_currency: 'USD',
    reporting_currency: 'USD',
  });

  // 1. Test Empty State
  console.log('1. Testing Empty State Timeline...');
  const empty6m = getCashFlowTimeline({ range: '6m' });
  assert.strictEqual(empty6m.ok, true);
  assert.strictEqual(empty6m.range, '6m');
  assert.strictEqual(empty6m.currency, 'USD');
  assert.strictEqual(empty6m.timeline.length, 6);
  assert.strictEqual(empty6m.totalMoneyIn, 0);
  assert.strictEqual(empty6m.totalMoneyOut, 0);
  assert.strictEqual(empty6m.totalNetProfit, 0);
  assert.strictEqual(empty6m.hasActivity, false);

  const empty12m = getCashFlowTimeline({ range: '12m' });
  assert.strictEqual(empty12m.timeline.length, 12);

  const emptyYtd = getCashFlowTimeline({ range: 'ytd' });
  const currentMonthNum = new Date().getMonth() + 1;
  assert.strictEqual(emptyYtd.timeline.length, currentMonthNum);

  console.log('✓ Empty state correctly generates 6m, 12m, and YTD slots with hasActivity: false.');

  // 2. Add client, invoices, payments, credit notes, and expenses
  console.log('2. Testing Aggregations & Calculations...');

  const client = addClient({
    name: 'Atlas Corp',
    email: 'billing@atlas.com',
  });

  // Target current month and previous month
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const currentMonthKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  const currentDate = `${currentMonthKey}-10`;

  const prevD = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthKey = `${prevD.getFullYear()}-${pad(prevD.getMonth() + 1)}`;
  const prevDate = `${prevMonthKey}-15`;

  // Create invoice in current month
  const invRes = createInvoice({
    client_id: client.id,
    date_created: currentDate,
    date_due: `${currentMonthKey}-25`,
    currency: 'USD',
    exchange_rate: 1.0,
  }, [
    { description: 'Cloud Architecture', quantity: 1, unit_price: 3000, tax_rate: 0 },
  ]);
  assert.strictEqual(invRes.ok, true);
  const inv = invRes.invoice;

  // Record payment in current month: $2,000
  const payRes = addPayment(inv.id, {
    amount: 2000,
    payment_date: currentDate,
    payment_method: 'Wire Transfer',
  });
  assert.strictEqual(payRes.ok, true);

  // Issue credit note on invoice: $200
  // issueCreditNote(invoiceId, { amount, reason })
  const cnRes = issueCreditNote(inv.id, {
    amount: 200,
    reason: 'Consulting rebate',
  });
  assert.strictEqual(cnRes.ok, true, `issueCreditNote failed: ${JSON.stringify(cnRes.errors)}`);

  // Record an expense in current month: $600
  const expRes = createExpense({
    amount: 600,
    date: currentDate,
    category: 'Software',
    currency: 'USD',
    exchange_rate: 1.0,
    notes: 'Server infrastructure',
  });
  assert.strictEqual(expRes.ok, true);

  // Record an expense in previous month: $450
  const prevExpRes = createExpense({
    amount: 450,
    date: prevDate,
    category: 'Office Supplies',
    currency: 'USD',
    exchange_rate: 1.0,
  });
  assert.strictEqual(prevExpRes.ok, true);

  // Now query cash flow timeline
  const active6m = getCashFlowTimeline({ range: '6m' });
  assert.strictEqual(active6m.ok, true);
  assert.strictEqual(active6m.hasActivity, true);

  // Current month:
  // Gross paid: 2000, Credit note: 200 => Net Money In = 1800
  // Expense: 600 => Net Money Out = 600
  // Net profit = 1800 - 600 = 1200
  const curSlot = active6m.timeline.find((t) => t.monthKey === currentMonthKey);
  assert.ok(curSlot, `Current month slot ${currentMonthKey} must exist`);
  assert.strictEqual(curSlot.moneyIn, 1800);
  assert.strictEqual(curSlot.moneyOut, 600);
  assert.strictEqual(curSlot.netProfit, 1200);

  // Previous month:
  // Gross paid: 0, Credit: 0 => Money In = 0
  // Expense: 450 => Money Out = 450
  // Net profit = 0 - 450 = -450
  const prevSlot = active6m.timeline.find((t) => t.monthKey === prevMonthKey);
  assert.ok(prevSlot, `Previous month slot ${prevMonthKey} must exist`);
  assert.strictEqual(prevSlot.moneyIn, 0);
  assert.strictEqual(prevSlot.moneyOut, 450);
  assert.strictEqual(prevSlot.netProfit, -450);

  // Verify total sums match
  assert.strictEqual(active6m.totalMoneyIn, 1800);
  assert.strictEqual(active6m.totalMoneyOut, 1050); // 600 + 450
  assert.strictEqual(active6m.totalNetProfit, 750); // 1800 - 1050

  console.log('✓ Net calculations, credit note deductions, and monthly aggregations verified.');

  // 3. Multi-Currency Foreign Exchange Conversion
  console.log('3. Testing Multi-Currency Exchange Rate Conversion...');

  // Create EUR invoice with exchange rate 1.10 to USD
  const eurInvRes = createInvoice({
    client_id: client.id,
    date_created: currentDate,
    date_due: `${currentMonthKey}-28`,
    currency: 'EUR',
    exchange_rate: 1.10,
  }, [
    { description: 'European Consulting', quantity: 1, unit_price: 1000, tax_rate: 0 },
  ]);
  assert.strictEqual(eurInvRes.ok, true);

  // Pay 1000 EUR => in base USD should be 1000 * 1.10 = 1100 USD
  addPayment(eurInvRes.invoice.id, {
    amount: 1000,
    payment_date: currentDate,
    payment_method: 'Stripe',
  });

  const converted6m = getCashFlowTimeline({ range: '6m' });
  const updatedCurSlot = converted6m.timeline.find((t) => t.monthKey === currentMonthKey);
  // Previous 1800 USD + (1000 EUR * 1.10 = 1100 USD) = 2900 USD
  assert.strictEqual(updatedCurSlot.moneyIn, 2900);
  assert.strictEqual(updatedCurSlot.netProfit, 2300); // 2900 - 600

  console.log('✓ Multi-currency exchange rate conversion accurately reflected in base currency.');

  // Cleanup
  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('--- All Phase 2 Cash Flow Analytics Unit Tests Passed Successfully! ---');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
