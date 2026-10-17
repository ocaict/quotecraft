#!/usr/bin/env node
/**
 * generate-license.js — Vendor CLI to mint QuoteCraft activation keys (v1 format).
 *
 * Usage:
 *   node scripts/generate-license.js --plan lifetime --name "Acme Ltd" --email a@b.com
 *   node scripts/generate-license.js --plan annual --days 365 --name "Ada" --email ada@x.ng
 *   node scripts/generate-license.js --plan annual --expiry 2027-12-31 --name "Ada" --email ada@x.ng
 *   node scripts/generate-license.js --plan lifetime --name "Acme" --email a@b.com --emit-token
 *   node scripts/generate-license.js --print-public-key
 *   node scripts/generate-license.js            (interactive mode)
 *
 * Writes/appends the record to ./licenses.json (gitignored) so an activation store
 * can be seeded later (KV/D1).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const { generateSerial, validateKeyFormat } = require('../src/shared/license-key');
const { signEntitlement, buildEntitlement } = require('../src/main/entitlement');
const { getPrivateKeyPem, getPublicKeyPem, isUsingDevKey } = require('./license-keys');

const STORE_PATH = path.join(__dirname, '..', 'licenses.json');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--emit-token') out.emitToken = true;
    else if (arg === '--print-public-key') out.printPublicKey = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else { out[key] = true; }
    }
  }
  return out;
}

function prompt(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (ans) => { rl.close(); resolve(ans.trim()); }));
}

function usage() {
  console.log(`
QuoteCraft activation key generator (v1)

  --plan <annual|lifetime|trial>   License plan (default: lifetime)
  --name <licensee name>           Required unless --print-public-key / interactive
  --email <licensee email>         Required unless --print-public-key / interactive
  --expiry <YYYY-MM-DD>            Annual only; overrides --days
  --days <n>                       Annual validity in days (default: 365)
  --device <device_id>             Optional device binding for the sample token
  --emit-token                     Also print a signed entitlement token (for testing)
  --print-public-key               Print the public key to embed in the app
  --out <file>                     Store path (default: ./licenses.json)
  -h, --help                       Show this help

Examples:
  node scripts/generate-license.js --plan lifetime --name "Acme Ltd" --email a@b.com
  node scripts/generate-license.js --plan annual --days 365 --name "Ada" --email ada@x.ng
`);
}

function randomDeviceId() {
  return 'dev_' + crypto.randomBytes(8).toString('hex');
}

function resolveExpiry(args, plan) {
  if (plan !== 'annual') return null;
  if (args.expiry) return args.expiry;
  const days = args.days ? parseInt(args.days, 10) : 365;
  const d = new Date();
  d.setDate(d.getDate() + (Number.isFinite(days) ? days : 365));
  return d.toISOString().split('T')[0];
}

function appendRecord(record, outPath) {
  const target = outPath ? path.resolve(outPath) : STORE_PATH;
  let list = [];
  if (fs.existsSync(target)) {
    try {
      const raw = fs.readFileSync(target, 'utf8').trim();
      list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
    } catch (_e) {
      list = [];
    }
  }
  list.push(record);
  fs.writeFileSync(target, JSON.stringify(list, null, 2) + '\n');
  return target;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) { usage(); return; }

  if (args.printPublicKey) {
    console.log(getPublicKeyPem());
    return;
  }

  let name = args.name;
  let email = args.email;
  let plan = args.plan;
  const interactive = process.stdin.isTTY && (!name || !email || !plan);

  if (interactive) {
    console.log('\n======================================================');
    console.log('       QuoteCraft — Activation Key Generator          ');
    console.log('======================================================\n');
    if (!name) name = await prompt('Licensee Full Name (or Business): ');
    if (!email) email = await prompt('Licensee Email Address: ');
    if (!plan) {
      const choice = await prompt('Plan [1 = Lifetime, 2 = Annual] (default: 1): ');
      plan = choice === '2' ? 'annual' : 'lifetime';
    }
  }

  plan = plan || 'lifetime';
  if (!['annual', 'lifetime', 'trial'].includes(plan)) {
    console.error(`Error: invalid --plan "${plan}". Use annual, lifetime or trial.`);
    process.exit(1);
  }
  if (!name || !email) {
    console.error('Error: --name and --email are required (or run in a TTY for interactive mode).\n');
    usage();
    process.exit(1);
  }

  const expiry = resolveExpiry(args, plan);

  let key;
  try {
    key = generateSerial({ plan, expiry });
  } catch (err) {
    console.error('Error: ' + err.message);
    process.exit(1);
  }

  // Self-verification sanity check (format + checksum)
  const parsed = validateKeyFormat(key);
  if (!parsed.ok) {
    console.error('Error: generated key failed self-check:', parsed.reason);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const record = {
    serial: parsed.serial,
    key,
    name,
    email: String(email).toLowerCase(),
    plan: parsed.plan,
    expiry: parsed.expiry,
    status: 'active',
    devices: [],
    max_devices: 2,
    activation_count: 0,
    issued_at: now,
    updated_at: now,
    paystack_reference: null,
  };

  const target = appendRecord(record, args.out);

  console.log('');
  console.log('  ✅ Activation key generated');
  console.log('  ─────────────────────────────────────────────');
  console.log('  Key:      ' + key);
  console.log('  Plan:     ' + parsed.plan);
  console.log('  Expiry:   ' + (parsed.expiry || 'never (lifetime)'));
  console.log('  Serial:   ' + parsed.serial);
  console.log('  Licensee: ' + name + ' <' + record.email + '>');
  console.log('  Store:    ' + target);
  if (isUsingDevKey()) {
    console.log('  Signing:  ⚠ DEV key (set QC_LICENSE_PRIVATE_KEY for production)');
  }

  if (args.emitToken) {
    const payload = buildEntitlement({
      serial: parsed.serial,
      name,
      plan: parsed.plan,
      expiry: parsed.expiry,
      device_id: args.device || randomDeviceId(),
    });
    console.log('  Token:    ' + signEntitlement(payload, getPrivateKeyPem()));
  }
  console.log('');
}

main().catch((err) => {
  console.error('\nFatal error generating license key:', err.message);
  process.exit(1);
});
