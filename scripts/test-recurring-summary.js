const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Point to test db path before requiring database
const testDbPath = path.join(__dirname, 'test-recurring-summary.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  saveCompanyProfile,
  addClient,
  createQuote,
  setQuoteStatus,
  convertQuoteToInvoice,
  setRecurringProfile,
  pauseRecurringProfile,
  getRecurringSummary,
} = require('../src/main/database');

async function runTests() {
  console.log('--- Starting Recurring Summary & Dashboard Widget Unit Tests ---');

  await initializeDatabase();
  console.log('✓ Database initialized');

  // 1. Initial empty state
  const emptyRes = getRecurringSummary();
  assert.strictEqual(emptyRes.ok, true, 'getRecurringSummary should return ok: true');
  assert.strictEqual(emptyRes.summary.active_count, 0, 'active_count should be 0');
  assert.strictEqual(emptyRes.summary.next_fire_date, null, 'next_fire_date should be null');
  assert.strictEqual(emptyRes.summary.monthly_expected, 0, 'monthly_expected should be 0');
  assert.strictEqual(emptyRes.summary.overdue_count, 0, 'overdue_count should be 0');
  console.log('✓ Initial empty recurring summary verified');

  // 2. Setup company profile & client
  saveCompanyProfile({
    company_name: 'Acme Studio',
    default_currency: 'USD',
    reporting_currency: 'USD',
  });

  const client = addClient({
    name: 'Retainer Client Inc',
    email: 'client@retainer.com',
    currency: 'USD',
  });
  assert.ok(client && client.id, 'Client created');
  const clientId = client.id;

  // 3. Create Quote and convert to Invoice 1 ($1500)
  const q1Res = createQuote(
    {
      client_id: clientId,
      currency: 'USD',
      date_created: '2026-09-01',
      valid_until: '2026-09-30',
      subtotal: 1500,
      tax: 0,
      total: 1500,
    },
    [
      { description: 'Monthly Retainer - Design', quantity: 1, unit_price: 1500, tax_rate: 0, amount: 1500 },
    ]
  );
  assert.ok(q1Res.ok, 'Quote 1 created');
  setQuoteStatus(q1Res.quote.id, 'accepted');
  const inv1Res = convertQuoteToInvoice(q1Res.quote.id);
  assert.ok(inv1Res.ok, 'Invoice 1 converted');
  const inv1Id = inv1Res.invoice.id;

  // 4. Set recurring profile on Invoice 1 with future next_issue_date
  const p1Res = setRecurringProfile(inv1Id, {
    frequency: 'monthly',
    next_issue_date: '2026-10-15',
  });
  assert.ok(p1Res.ok, 'Recurring profile 1 set');

  const s1 = getRecurringSummary();
  assert.strictEqual(s1.ok, true);
  assert.strictEqual(s1.summary.active_count, 1, 'Should have 1 active profile');
  assert.strictEqual(s1.summary.next_fire_date, '2026-10-15', 'Next fire date should match');
  assert.strictEqual(s1.summary.next_amount, 1500, 'Next amount should be 1500');
  assert.strictEqual(s1.summary.next_currency, 'USD', 'Currency should be USD');
  assert.strictEqual(s1.summary.monthly_expected, 1500, 'Monthly expected should be 1500');
  assert.strictEqual(s1.summary.overdue_count, 0, 'No overdue items since next date is future');
  console.log('✓ Future recurring profile summary verified');

  // 5. Create Quote and Invoice 2 ($800) with past next_issue_date (ready to fire / overdue)
  const q2Res = createQuote(
    {
      client_id: clientId,
      currency: 'USD',
      date_created: '2026-08-01',
      valid_until: '2026-08-31',
      subtotal: 800,
      tax: 0,
      total: 800,
    },
    [
      { description: 'Hosting & Maintenance', quantity: 1, unit_price: 800, tax_rate: 0, amount: 800 },
    ]
  );
  setQuoteStatus(q2Res.quote.id, 'accepted');
  const inv2Res = convertQuoteToInvoice(q2Res.quote.id);
  const inv2Id = inv2Res.invoice.id;

  const p2Res = setRecurringProfile(inv2Id, {
    frequency: 'monthly',
    next_issue_date: '2026-09-01',
  });
  assert.ok(p2Res.ok, 'Recurring profile 2 set');

  const s2 = getRecurringSummary();
  assert.strictEqual(s2.summary.active_count, 2, 'Should have 2 active profiles');
  assert.strictEqual(s2.summary.next_fire_date, '2026-09-01', 'Earlier date should be next_fire_date');
  assert.strictEqual(s2.summary.next_amount, 800, 'Next amount should be 800');
  assert.strictEqual(s2.summary.monthly_expected, 2300, 'Monthly expected should be 1500 + 800 = 2300');
  assert.strictEqual(s2.summary.overdue_count, 1, 'Profile 2 next date is past today, so overdue_count = 1');
  console.log('✓ Multi-profile aggregation and overdue counting verified');

  // 6. Pause profile 2
  const pauseRes = pauseRecurringProfile(inv2Id);
  assert.ok(pauseRes.ok, 'Profile 2 paused');

  const s3 = getRecurringSummary();
  assert.strictEqual(s3.summary.active_count, 1, 'Only 1 active profile after pausing');
  assert.strictEqual(s3.summary.next_fire_date, '2026-10-15', 'Active profile 1 is now next');
  assert.strictEqual(s3.summary.monthly_expected, 1500, 'Monthly expected drops back to 1500');
  assert.strictEqual(s3.summary.overdue_count, 0, 'No active overdue profile');
  console.log('✓ Paused profile correctly excluded from active metrics');

  console.log('\nAll Recurring Summary tests passed successfully! ✓');
}

runTests()
  .then(() => {
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('Test failed:', err);
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
    process.exit(1);
  });
