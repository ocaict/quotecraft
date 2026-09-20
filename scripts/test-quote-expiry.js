// scripts/test-quote-expiry.js
// Unit tests for Quote Expiry / Valid-Until (Phase C)

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const tempDbPath = path.join(os.tmpdir(), `test-quote-expiry-${Date.now()}-${Math.random().toString(36).substring(2)}.sqlite`);
process.env.TEST_DB_PATH = tempDbPath;

const {
  initializeDatabase,
  closeDatabase,
  getDb,
  addClient,
  createQuote,
  getQuote,
  setQuoteStatus,
  checkExpiredQuotes,
} = require('../src/main/database');

async function runTests() {
  console.log('--- Starting Quote Expiry Unit Tests (Phase C) ---');

  try {
    await initializeDatabase();
    console.log('✓ Database initialized with Migration 31');

    const db = getDb();

    // 1. Verify that 'expired' can be stored in quotes table without CHECK constraint violation
    const client = addClient({
      name: 'Acme Corp',
      email: 'contact@acme.com',
    });
    assert(client && client.id, 'Client creation should succeed');
    const clientId = client.id;

    // 2. Create Quote 1: past valid_until, sent status -> should expire
    const q1Res = createQuote(
      {
        client_id: clientId,
        date_created: '2020-01-01',
        valid_until: '2020-01-15',
        currency: 'USD',
        notes: 'Old proposal',
        subtotal: 1000,
        total: 1000,
      },
      [{ description: 'Consulting', quantity: 10, unit_price: 100, amount: 1000 }]
    );
    assert(q1Res.ok, 'Quote 1 creation failed: ' + JSON.stringify(q1Res.errors));
    const q1Id = q1Res.quote.id;
    setQuoteStatus(q1Id, 'sent');
    assert.strictEqual(getQuote(q1Id).status, 'sent');

    // 3. Create Quote 2: future valid_until, sent status -> should NOT expire
    const q2Res = createQuote(
      {
        client_id: clientId,
        date_created: '2026-09-01',
        valid_until: '2099-12-31',
        currency: 'USD',
        notes: 'Future proposal',
        subtotal: 2000,
        total: 2000,
      },
      [{ description: 'Development', quantity: 20, unit_price: 100, amount: 2000 }]
    );
    assert(q2Res.ok, 'Quote 2 creation failed');
    const q2Id = q2Res.quote.id;
    setQuoteStatus(q2Id, 'sent');
    assert.strictEqual(getQuote(q2Id).status, 'sent');

    // 4. Create Quote 3: past valid_until, but status accepted -> should NOT expire
    const q3Res = createQuote(
      {
        client_id: clientId,
        date_created: '2020-01-01',
        valid_until: '2020-01-15',
        currency: 'USD',
        notes: 'Accepted old proposal',
        subtotal: 1500,
        total: 1500,
      },
      [{ description: 'Design', quantity: 15, unit_price: 100, amount: 1500 }]
    );
    assert(q3Res.ok, 'Quote 3 creation failed');
    const q3Id = q3Res.quote.id;
    setQuoteStatus(q3Id, 'accepted');
    assert.strictEqual(getQuote(q3Id).status, 'accepted');

    // 5. Create Quote 4: no valid_until, draft status -> should NOT expire
    const q4Res = createQuote(
      {
        client_id: clientId,
        date_created: '2026-09-01',
        valid_until: null,
        currency: 'USD',
        notes: 'Open draft proposal',
        subtotal: 500,
        total: 500,
      },
      [{ description: 'Discovery', quantity: 5, unit_price: 100, amount: 500 }]
    );
    assert(q4Res.ok, 'Quote 4 creation failed');
    const q4Id = q4Res.quote.id;
    assert.strictEqual(getQuote(q4Id).status, 'draft');

    console.log('✓ Created 4 test quotes with varied dates and statuses');

    // 6. Run checkExpiredQuotes()
    const result = checkExpiredQuotes();
    assert(result.ok, 'checkExpiredQuotes must return ok: true');
    assert.strictEqual(result.count, 1, 'Exactly 1 quote should have expired');
    console.log('✓ checkExpiredQuotes() transitioned expired quote count = 1');

    // 7. Verify post-check statuses
    const q1After = getQuote(q1Id);
    assert.strictEqual(q1After.status, 'expired', 'Quote 1 status must be expired');

    const q2After = getQuote(q2Id);
    assert.strictEqual(q2After.status, 'sent', 'Quote 2 (future) status must remain sent');

    const q3After = getQuote(q3Id);
    assert.strictEqual(q3After.status, 'accepted', 'Quote 3 (accepted) status must remain accepted');

    const q4After = getQuote(q4Id);
    assert.strictEqual(q4After.status, 'draft', 'Quote 4 (no expiry) status must remain draft');

    console.log('✓ Verified Quote 1 is "expired", while future, accepted, and unexpiring quotes remain unchanged');

    // 8. Test setQuoteStatus with 'expired'
    const manualExpire = setQuoteStatus(q2Id, 'expired');
    assert(manualExpire.ok, 'setQuoteStatus to expired must succeed without error');
    assert.strictEqual(getQuote(q2Id).status, 'expired');
    console.log('✓ setQuoteStatus successfully sets status="expired" directly');

    console.log('--- ALL PHASE C TESTS PASSED ---');
  } finally {
    closeDatabase();
    if (fs.existsSync(tempDbPath)) {
      try {
        fs.unlinkSync(tempDbPath);
      } catch (_) {}
    }
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
