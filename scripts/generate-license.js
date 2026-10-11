#!/usr/bin/env node
/**
 * scripts/generate-license.js
 *
 * Developer tool to generate cryptographically signed QuoteCraft Pro license keys.
 *
 * Usage:
 *   node scripts/generate-license.js --name "Adewale Johnson" --email "adewale@agency.ng" --plan lifetime
 *   node scripts/generate-license.js --name "Chioma Okon" --email "chioma@freelance.ng" --plan annual --days 365
 *   node scripts/generate-license.js  (interactive mode)
 */

'use strict';

const readline = require('readline');
const { generateLicenseKey, verifyLicenseKey, PLANS } = require('../src/main/licensing');

// Parse CLI flags
function parseArgs(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

function prompt(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans.trim());
  }));
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  let name = flags.name;
  let email = flags.email;
  let plan = flags.plan;
  let days = flags.days ? parseInt(flags.days, 10) : 365;
  let expiry = flags.expiry;

  // Interactive prompts if arguments are missing
  if (!name || !email) {
    console.log('\n======================================================');
    console.log('       QuoteCraft Pro — License Key Generator        ');
    console.log('======================================================\n');

    if (!name) name = await prompt('Licensee Full Name (or Business): ');
    if (!email) email = await prompt('Licensee Email Address: ');
    if (!plan) {
      const planChoice = await prompt('Plan [1 = Lifetime, 2 = Annual] (default: 1): ');
      plan = planChoice === '2' ? 'annual' : 'lifetime';
    }
    if (plan === 'annual' && !expiry && !flags.days) {
      const daysInput = await prompt('Validity in days (default: 365): ');
      if (daysInput) days = parseInt(daysInput, 10) || 365;
    }
  }

  // Normalize plan
  const normalizedPlan = (plan || 'annual').toLowerCase() === 'lifetime' ? PLANS.LIFETIME : PLANS.ANNUAL;

  let expiryDate = null;
  if (normalizedPlan === PLANS.ANNUAL) {
    if (expiry) {
      expiryDate = expiry;
    } else {
      const d = new Date();
      d.setDate(d.getDate() + days);
      expiryDate = d.toISOString().split('T')[0];
    }
  }

  if (!name || !email) {
    console.error('\n❌ Error: Licensee name and email are required.');
    process.exit(1);
  }

  // Generate key
  const key = generateLicenseKey({
    licensee_name: name,
    licensee_email: email,
    plan: normalizedPlan,
    expiry_date: expiryDate,
  });

  // Self-verification sanity check
  const verification = verifyLicenseKey(key);
  if (!verification.ok) {
    console.error('\n❌ Generation error: Self-verification failed:', verification.message);
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('  🎉 License Key Generated Successfully!');
  console.log('======================================================\n');
  console.log(`  Licensee:    ${name}`);
  console.log(`  Email:       ${email}`);
  console.log(`  Plan:        QuoteCraft Pro (${normalizedPlan.toUpperCase()})`);
  console.log(`  Expiry:      ${expiryDate || 'Permanent / Lifetime'}`);
  console.log(`  Status:      Verified & Ready for Activation\n`);
  console.log('------------------------------------------------------');
  console.log('  ACTIVATION KEY:');
  console.log(`  ${key}`);
  console.log('------------------------------------------------------\n');
  console.log('Copy and send this key to the customer via Email or WhatsApp.\n');
}

main().catch((err) => {
  console.error('\nFatal error generating license key:', err.message);
  process.exit(1);
});
