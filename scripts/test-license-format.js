/**
 * test-license-format.js — Phase 1 unit tests for the new activation key format
 * and Ed25519 entitlement tokens. Pure Node (no DB, no network).
 */

'use strict';

const assert = require('assert');

const {
  CROCKFORD,
  normalizeKey,
  generateSerial,
  formatKey,
  validateKeyFormat,
  isValidKey,
} = require('../src/shared/license-key');

const {
  signEntitlement,
  verifyEntitlementToken,
  isEntitlementValid,
  buildEntitlement,
} = require('../src/main/entitlement');

const { LICENSE_PUBLIC_KEY_PEM } = require('../src/main/license-public-key');
const { getPrivateKeyPem, getPublicKeyPem } = require('./license-keys');

const KEY_RE = /^QC(-[0-9A-HJKMNP-TV-Z]{5}){4}$/;

function payloadOf(key) {
  return normalizeKey(key).slice(2); // drop the "QC" prefix
}

function flipChar(ch) {
  for (const c of CROCKFORD) {
    if (c !== ch) return c;
  }
  return ch;
}

function run() {
  console.log('=== Phase 1: Activation Key Format & Entitlement Tests ===\n');

  // 1. Generation format
  console.log('--- Test 1: Key generation format ---');
  const lifetime = generateSerial({ plan: 'lifetime' });
  const annual = generateSerial({ plan: 'annual', expiry: '2027-12-31' });
  assert.ok(KEY_RE.test(lifetime), `Lifetime key format invalid: ${lifetime}`);
  assert.ok(KEY_RE.test(annual), `Annual key format invalid: ${annual}`);
  console.log('  Lifetime:', lifetime);
  console.log('  Annual:  ', annual);
  console.log('✓ Format correct\n');

  // 2. Parse round-trip
  console.log('--- Test 2: Parse round-trip (plan + expiry) ---');
  const l = validateKeyFormat(lifetime);
  assert.strictEqual(l.ok, true, 'Lifetime key should validate');
  assert.strictEqual(l.plan, 'lifetime', 'Plan should be lifetime');
  assert.strictEqual(l.expiry, null, 'Lifetime has no expiry');
  const a = validateKeyFormat(annual);
  assert.strictEqual(a.ok, true, 'Annual key should validate');
  assert.strictEqual(a.plan, 'annual', 'Plan should be annual');
  assert.strictEqual(a.expiry, '2027-12-31', 'Annual expiry should round-trip');
  console.log('✓ Plan/expiry round-trip verified\n');

  // 3. Uniqueness
  console.log('--- Test 3: Serial uniqueness ---');
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(generateSerial({ plan: 'lifetime' }));
  assert.strictEqual(seen.size, 500, 'All 500 generated keys should be unique');
  console.log('✓ 500 unique keys generated\n');

  // 4. Normalization (case, separators, ambiguous chars)
  console.log('--- Test 4: Input normalization ---');
  const messy = lifetime.toLowerCase().replace(/-/g, ' ');
  assert.strictEqual(validateKeyFormat(messy).ok, true, 'Lowercase/spaced key should validate');
  // O -> 0, I/L -> 1 aliasing
  const hasAliasable = payloadOf(lifetime).match(/[01]/);
  if (hasAliasable) {
    const idx = payloadOf(lifetime).indexOf(hasAliasable[0]);
    const alias = hasAliasable[0] === '0' ? 'O' : 'I';
    const raw = payloadOf(lifetime).split('');
    raw[idx] = alias;
    const aliasedKey = formatKey(raw.join(''));
    assert.strictEqual(validateKeyFormat(aliasedKey).ok, true, 'Aliased key should still validate');
  }
  console.log('✓ Normalization (case/space/O-I-L aliases) verified\n');

  // 5. Checksum catches a single-character typo
  console.log('--- Test 5: Checksum typo detection ---');
  const p = payloadOf(lifetime);
  const tampered = p.slice(0, 10) + flipChar(p[10]) + p.slice(11);
  const chk = validateKeyFormat(formatKey(tampered));
  assert.strictEqual(chk.ok, false, 'Tampered key must fail');
  assert.strictEqual(chk.reason, 'checksum', 'Reason should be checksum');
  console.log('✓ Single-char typo rejected (checksum)\n');

  // 6. Malformed inputs
  console.log('--- Test 6: Malformed inputs ---');
  assert.strictEqual(validateKeyFormat('').reason, 'missing');
  assert.strictEqual(validateKeyFormat(null).reason, 'missing');
  assert.strictEqual(validateKeyFormat('QC-1234').reason, 'length');
  const withU = formatKey(p.slice(0, 5) + 'U' + p.slice(6));
  assert.strictEqual(validateKeyFormat(withU).reason, 'alphabet');
  assert.strictEqual(isValidKey('not-a-key'), false);
  assert.strictEqual(isValidKey(lifetime), true);
  console.log('✓ Malformed inputs rejected safely\n');

  // 7. Entitlement signing/verification with the shipped public key
  console.log('--- Test 7: Entitlement token sign & verify ---');
  assert.strictEqual(
    getPublicKeyPem().trim(),
    LICENSE_PUBLIC_KEY_PEM.trim(),
    'Dev private key must match the embedded app public key'
  );
  const payload = buildEntitlement({
    serial: l.serial, name: 'Chinedu Okafor', plan: 'lifetime', expiry: null, device_id: 'dev_abc123',
  });
  const token = signEntitlement(payload, getPrivateKeyPem());
  const verified = verifyEntitlementToken(token, LICENSE_PUBLIC_KEY_PEM);
  assert.strictEqual(verified.ok, true, 'Token should verify with embedded public key');
  assert.strictEqual(verified.payload.serial, l.serial);
  assert.strictEqual(verified.payload.name, 'Chinedu Okafor');
  console.log('✓ Token verifies against embedded app public key\n');

  // 8. Tampered token rejected
  console.log('--- Test 8: Tampered entitlement rejected ---');
  const parts = token.split('.');
  const badSig = (parts[1][0] === 'A' ? 'B' : 'A') + parts[1].slice(1);
  const tamperedRes = verifyEntitlementToken(parts[0] + '.' + badSig, LICENSE_PUBLIC_KEY_PEM);
  assert.strictEqual(tamperedRes.ok, false, 'Tampered signature must fail');
  assert.strictEqual(tamperedRes.reason, 'signature');
  assert.strictEqual(verifyEntitlementToken('garbage', LICENSE_PUBLIC_KEY_PEM).ok, false);
  assert.strictEqual(verifyEntitlementToken(null, LICENSE_PUBLIC_KEY_PEM).ok, false);
  console.log('✓ Tampered/malformed tokens rejected\n');

  // 9. Validity windows (expired plan vs stale grace)
  console.log('--- Test 9: Entitlement validity windows ---');
  const expired = buildEntitlement({ serial: 's', name: 'X', plan: 'annual', expiry: '2020-01-01' });
  assert.strictEqual(isEntitlementValid(expired).reason, 'expired', 'Past expiry => expired');
  const stale = Object.assign(
    buildEntitlement({ serial: 's', name: 'X', plan: 'lifetime', expiry: null }),
    { valid_until: '2020-01-01T00:00:00.000Z' }
  );
  const staleRes = isEntitlementValid(stale);
  assert.strictEqual(staleRes.ok, false);
  assert.strictEqual(staleRes.reason, 'stale');
  assert.strictEqual(staleRes.needsRefresh, true);
  assert.strictEqual(isEntitlementValid(payload).ok, true, 'Fresh entitlement should be valid');
  console.log('✓ Expiry / offline-grace windows verified\n');

  console.log('======================================================');
  console.log(' All Phase 1 (key format + entitlement) tests passed!');
  console.log('======================================================\n');
}

try {
  run();
} catch (err) {
  console.error('\n❌ Phase 1 license format test failed:', err && err.message);
  process.exit(1);
}
