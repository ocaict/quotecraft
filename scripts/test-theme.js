const assert = require('assert');

// theme.js is DOM-free; requiring it in Node exposes the pure helpers.
const { THEME_KEY, normalizeMode, resolveTheme } = require('../src/renderer/js/theme.js');

function runTests() {
  console.log('--- Starting Theme Unit Tests ---');

  // ── 1. normalizeMode ───────────────────────────────────────
  assert.strictEqual(normalizeMode('light'), 'light', 'light preserved');
  assert.strictEqual(normalizeMode('dark'), 'dark', 'dark preserved');
  assert.strictEqual(normalizeMode('system'), 'system', 'system preserved');
  assert.strictEqual(normalizeMode(null), 'dark', 'null => dark');
  assert.strictEqual(normalizeMode(undefined), 'dark', 'undefined => dark');
  assert.strictEqual(normalizeMode(''), 'dark', 'empty => dark');
  assert.strictEqual(normalizeMode('blue'), 'dark', 'unknown => dark');
  console.log('✓ normalizeMode handles valid and invalid modes (default dark)');

  // ── 2. resolveTheme ────────────────────────────────────────
  assert.strictEqual(resolveTheme('light', true), 'light', 'explicit light stays light');
  assert.strictEqual(resolveTheme('light', false), 'light', 'explicit light stays light');
  assert.strictEqual(resolveTheme('dark', true), 'dark', 'explicit dark stays dark');
  assert.strictEqual(resolveTheme('dark', false), 'dark', 'explicit dark stays dark');
  assert.strictEqual(resolveTheme('system', false), 'dark', 'system + OS light-off => dark');
  assert.strictEqual(resolveTheme('system', true), 'light', 'system + OS light-on => light');
  console.log('✓ resolveTheme resolves explicit and system modes correctly');

  // ── 3. Storage key ─────────────────────────────────────────
  assert.strictEqual(THEME_KEY, 'qc-theme', 'persistence key is qc-theme');
  console.log('✓ Persistence key is stable:', THEME_KEY);

  console.log('\n--- Theme: ALL TESTS PASSED ---');
}

runTests();