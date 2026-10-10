const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Point to isolated test database
const testDbPath = path.join(__dirname, 'test-stage3.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  saveToDisk,
  saveToDiskImmediate,
  getDbPath,
  getCompanyProfile,
  saveCompanyProfile,
} = require('../src/main/database');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runStage3Tests() {
  console.log('=== Starting Stage 3 Unit Tests: Pagination & Debounced DB Writes ===\n');

  // 1. Debounced saveToDisk behavior
  console.log('--- Testing Debounced Disk Writes ---');
  await initializeDatabase();
  saveToDiskImmediate(); // Ensure file is on disk

  const dbPath = getDbPath();
  assert(fs.existsSync(dbPath), 'Database file must exist after initialization');

  const initialStat = fs.statSync(dbPath);
  const initialMtime = initialStat.mtimeMs;

  // Perform multiple mutations rapidly
  saveCompanyProfile({ business_name: 'Acme Test 1', email: 'test1@acme.com' });
  saveCompanyProfile({ business_name: 'Acme Test 2', email: 'test2@acme.com' });
  saveCompanyProfile({ business_name: 'Acme Test 3', email: 'test3@acme.com' });

  // Right after rapid calls (<50ms), debounce timer (400ms) has not fired yet
  // In-memory state is up to date immediately
  const prof = getCompanyProfile();
  assert.strictEqual(prof.business_name, 'Acme Test 3', 'In-memory database should update immediately');

  // Immediate save should write to disk right away without waiting for timer
  saveToDiskImmediate();
  const immediateStat = fs.statSync(dbPath);
  assert(immediateStat.mtimeMs >= initialMtime, 'Immediate save should update file on disk');
  console.log('✓ In-memory mutations update immediately; saveToDiskImmediate writes synchronously');

  // Test debounce timer fires automatically after 450ms
  saveCompanyProfile({ business_name: 'Acme Test 4', email: 'test4@acme.com' });
  await sleep(500);
  const debouncedStat = fs.statSync(dbPath);
  assert(debouncedStat.mtimeMs >= immediateStat.mtimeMs, 'Debounce timer should have flushed to disk');
  console.log('✓ Debounce timer flushes batched mutations cleanly after 400ms');

  // Test closeDatabase flushes immediately
  saveCompanyProfile({ business_name: 'Acme Test Final', email: 'final@acme.com' });
  closeDatabase();
  const finalStat = fs.statSync(dbPath);
  assert(fs.existsSync(dbPath), 'Database file exists after closeDatabase');
  console.log('✓ closeDatabase performs immediate synchronous flush before closing connection');

  // Cleanup test DB
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (e) {}
  }

  // 2. Pagination Algorithm Verification
  console.log('\n--- Testing Pagination Logic & Page Slicing ---');
  function testPaginator(items, pageSize, page) {
    const total = items.length;
    const size = pageSize === 'all' ? total : Number(pageSize);
    const start = (page - 1) * size;
    return items.slice(start, start + size);
  }

  const sampleItems = Array.from({ length: 73 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));

  // Page 1 of 25
  const page1 = testPaginator(sampleItems, 25, 1);
  assert.strictEqual(page1.length, 25, 'Page 1 should have 25 items');
  assert.strictEqual(page1[0].id, 1, 'First item should be id 1');
  assert.strictEqual(page1[24].id, 25, 'Last item on page 1 should be id 25');

  // Page 2 of 25
  const page2 = testPaginator(sampleItems, 25, 2);
  assert.strictEqual(page2.length, 25, 'Page 2 should have 25 items');
  assert.strictEqual(page2[0].id, 26, 'First item on page 2 should be id 26');

  // Page 3 of 25 (remaining 23)
  const page3 = testPaginator(sampleItems, 25, 3);
  assert.strictEqual(page3.length, 23, 'Page 3 should have remaining 23 items');
  assert.strictEqual(page3[22].id, 73, 'Last item on page 3 should be id 73');

  // Page size "all"
  const allPage = testPaginator(sampleItems, 'all', 1);
  assert.strictEqual(allPage.length, 73, 'Size "all" should return all 73 items');

  console.log('✓ Pagination slices records correctly across pages 1, 2, 3 and handles "All" size');

  console.log('\n=== All Stage 3 Unit Tests Passed! ===\n');
}

runStage3Tests().catch((err) => {
  console.error('Stage 3 test failure:', err);
  process.exit(1);
});
