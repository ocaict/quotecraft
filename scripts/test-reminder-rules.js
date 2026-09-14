const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Point to test db path
const testDbPath = path.join(__dirname, 'test-reminder.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  getDb,
  closeDatabase,
  saveCompanyProfile,
  addClient,
  saveClientContacts,
  createQuote,
  convertQuoteToInvoice,
  getInvoice,
  setInvoiceStatus,
  getReminderRules,
  saveReminderRule,
  deleteReminderRule,
  resetDefaultReminderRules,
  getReminderSettings,
  saveReminderSettings,
  getDueReminders,
  logReminderSent,
  getDocumentEmailLogs,
} = require('../src/main/database');

async function runTests() {
  console.log('--- Starting Reminder Rules & Drafts Unit Tests ---');

  await initializeDatabase();
  console.log('✓ Database initialized with Migration 21');

  // 1. Check default reminder rules
  const rules = getReminderRules();
  assert.strictEqual(rules.length, 3, 'Should have 3 default reminder rules');
  assert.strictEqual(rules[0].timing_type, 'before_due');
  assert.strictEqual(rules[0].days, 3);
  assert.strictEqual(rules[0].is_enabled, true);

  assert.strictEqual(rules[1].timing_type, 'on_due');
  assert.strictEqual(rules[1].days, 0);

  assert.strictEqual(rules[2].timing_type, 'after_due');
  assert.strictEqual(rules[2].days, 7);
  console.log('✓ 3 default rules verified (3 days before, on due date, 7 days after)');

  // 2. Check default reminder settings (off by default)
  const settings = getReminderSettings();
  assert.strictEqual(settings.auto_send_reminders, false, 'auto_send_reminders must be off by default');
  console.log('✓ auto_send_reminders is OFF by default');

  saveReminderSettings({ auto_send_reminders: true });
  assert.strictEqual(getReminderSettings().auto_send_reminders, true);
  saveReminderSettings({ auto_send_reminders: false });
  assert.strictEqual(getReminderSettings().auto_send_reminders, false);
  console.log('✓ Reminder settings toggle works');

  // 3. Setup company profile & client with contact
  saveCompanyProfile({
    business_name: 'Acme Technologies',
    sender_name: 'Acme Billing Team',
    reporting_currency: 'USD',
    default_currency: 'USD',
  });

  const client = addClient({
    name: 'Global Enterprises Inc',
    email: 'info@globalent.test',
    company_name: 'Global Enterprises',
  });

  saveClientContacts(client.id, [
    {
      name: 'Sarah Connor',
      email: 'sarah.connor@globalent.test',
      phone: '+1 555-0199',
      role: 'Finance Manager',
      is_primary: 1,
    },
  ]);

  // Compute dates relative to local today
  const today = new Date();
  const formatIsoDate = (d) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const dPlus3 = new Date(today);
  dPlus3.setDate(dPlus3.getDate() + 3);
  const dateDueIn3Days = formatIsoDate(dPlus3);

  const dMinus7 = new Date(today);
  dMinus7.setDate(dMinus7.getDate() - 7);
  const dateOverdue7Days = formatIsoDate(dMinus7);

  const dPlus14 = new Date(today);
  dPlus14.setDate(dPlus14.getDate() + 14);
  const dateDueIn14Days = formatIsoDate(dPlus14);

  // Helper to create an invoice directly with specific date_due and status
  const db = getDb();

  function insertInvoice({ number, total, balance, dateDue, status }) {
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO invoices (
        invoice_number, client_id, status, date_created, date_due, total, balance_due, currency, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?)`,
      [number, client.id, status, formatIsoDate(today), dateDue, total, balance, now, now]
    );
    const idRes = db.exec('SELECT last_insert_rowid()');
    return Number(idRes[0].values[0][0]);
  }

  // Invoice 1: Due in 3 days, sent, balance = $500
  const inv1Id = insertInvoice({
    number: 'INV-TEST-001',
    total: 500,
    balance: 500,
    dateDue: dateDueIn3Days,
    status: 'sent',
  });

  // Invoice 2: Overdue 7 days, sent, balance = $1200
  const inv2Id = insertInvoice({
    number: 'INV-TEST-002',
    total: 1200,
    balance: 1200,
    dateDue: dateOverdue7Days,
    status: 'sent',
  });

  // Invoice 3: Due in 14 days, sent, balance = $800 (should not match any default rule)
  const inv3Id = insertInvoice({
    number: 'INV-TEST-003',
    total: 800,
    balance: 800,
    dateDue: dateDueIn14Days,
    status: 'sent',
  });

  // Invoice 4: Due in 3 days, but DRAFT (should be excluded from reminders)
  insertInvoice({
    number: 'INV-TEST-004-DRAFT',
    total: 300,
    balance: 300,
    dateDue: dateDueIn3Days,
    status: 'draft',
  });

  // Invoice 5: 7 days overdue, but PAID (balance 0, should be excluded)
  insertInvoice({
    number: 'INV-TEST-005-PAID',
    total: 400,
    balance: 0,
    dateDue: dateOverdue7Days,
    status: 'paid',
  });

  // 4. Test getDueReminders()
  const due = getDueReminders();
  console.log(`Found ${due.length} due reminders:`);
  due.forEach(r => console.log(` - ${r.invoice_number}: ${r.rule_name} (diff_days=${r.diff_days}) to ${r.recipient_to}`));

  assert.strictEqual(due.length, 2, 'Should find exactly 2 due reminders (one due in 3 days, one 7 days overdue)');

  const rem1 = due.find(r => r.invoice_number === 'INV-TEST-001');
  assert.ok(rem1, 'INV-TEST-001 must be in due reminders');
  assert.strictEqual(rem1.timing_type, 'before_due');
  assert.strictEqual(rem1.diff_days, 3);
  assert.strictEqual(rem1.recipient_to, 'sarah.connor@globalent.test');
  assert.ok(rem1.subject.includes('INV-TEST-001'), 'Subject contains invoice number');
  assert.ok(rem1.subject.includes('3 days'), 'Subject contains 3 days');
  assert.ok(rem1.message.includes('Sarah Connor'), 'Body personalized with contact name');
  assert.ok(rem1.message.includes('$500.00'), 'Body contains formatted balance');
  assert.ok(rem1.message.includes('Acme Technologies'), 'Body contains company name');

  const rem2 = due.find(r => r.invoice_number === 'INV-TEST-002');
  assert.ok(rem2, 'INV-TEST-002 must be in due reminders');
  assert.strictEqual(rem2.timing_type, 'after_due');
  assert.strictEqual(rem2.days_overdue, 7);
  assert.strictEqual(rem2.recipient_to, 'sarah.connor@globalent.test');
  assert.ok(rem2.subject.includes('7 days overdue'), 'Subject indicates 7 days overdue');
  assert.ok(rem2.message.includes('$1,200.00'), 'Body contains $1,200.00');

  console.log('✓ Due reminder detection and template interpolation verified');

  // 5. Test logReminderSent and duplicate suppression
  logReminderSent(inv1Id, rem1.rule_id, {
    recipient_to: rem1.recipient_to,
    recipient_cc: '',
    subject: rem1.subject,
    message_id: '<test-reminder-msg-123@acme.test>',
  });

  const emailLogs = getDocumentEmailLogs('invoice', inv1Id);
  assert.strictEqual(emailLogs.length, 1, 'Should have logged 1 document email');
  assert.strictEqual(emailLogs[0].subject, rem1.subject);

  // Check getDueReminders again: INV-TEST-001 should NO LONGER appear!
  const dueAfterSend = getDueReminders();
  assert.strictEqual(dueAfterSend.length, 1, 'Only 1 reminder should be due after sending INV-TEST-001');
  assert.strictEqual(dueAfterSend[0].invoice_number, 'INV-TEST-002');
  console.log('✓ Sent reminder logged on invoice & suppressed from future duplicate suggestions');

  // 6. Test rule enable/disable
  const rule3 = rules.find(r => r.timing_type === 'after_due');
  saveReminderRule({
    ...rule3,
    is_enabled: false,
  });

  const dueWithDisabledRule = getDueReminders();
  assert.strictEqual(dueWithDisabledRule.length, 0, 'Disabling rule 3 removes INV-TEST-002 from due reminders');

  saveReminderRule({
    ...rule3,
    is_enabled: true,
  });

  const dueReenabled = getDueReminders();
  assert.strictEqual(dueReenabled.length, 1, 'Re-enabling rule restores INV-TEST-002');
  console.log('✓ Rule enable / disable toggling verified');

  // 7. Test custom rules and resetDefaults
  const customRuleRes = saveReminderRule({
    name: 'Custom 14 days reminder',
    timing_type: 'before_due',
    days: 14,
    is_enabled: true,
    subject_template: 'Custom reminder {invoice_number}',
    body_template: 'Hello {client_name}',
  });
  assert.ok(customRuleRes.ok);

  const dueWithCustom = getDueReminders();
  const customMatch = dueWithCustom.find(r => r.invoice_number === 'INV-TEST-003');
  assert.ok(customMatch, 'INV-TEST-003 matches custom 14-day rule');
  console.log('✓ Custom rule created and correctly triggered 14-day invoice');

  resetDefaultReminderRules();
  const resetRules = getReminderRules();
  assert.strictEqual(resetRules.length, 3, 'Reset restores exactly 3 default rules');
  console.log('✓ resetDefaultReminderRules restores default configuration');

  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('\nAll Reminder Rules & Drafts unit tests PASSED successfully! ✨');
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
