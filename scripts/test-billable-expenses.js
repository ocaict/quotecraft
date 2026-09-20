// scripts/test-billable-expenses.js
// Unit tests for Billable Expenses -> Invoice generation (Phase B)

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const tempDbPath = path.join(os.tmpdir(), `test-billable-exp-${Date.now()}-${Math.random().toString(36).substring(2)}.sqlite`);
process.env.TEST_DB_PATH = tempDbPath;

const {
  initializeDatabase,
  closeDatabase,
  getDb,
  addClient,
  addProject,
  createExpense,
  getExpense,
  updateExpense,
  deleteExpense,
  listExpenses,
  getUnbilledExpenses,
  createInvoiceFromExpenses,
  getInvoice,
} = require('../src/main/database');

async function runTests() {
  console.log('--- Starting Billable Expenses Unit Tests (Phase B) ---');

  try {
    await initializeDatabase();
    console.log('✓ Database initialized with Migration 30');

    // 1. Verify schema columns on expenses table
    const db = getDb();
    const cols = db.exec('PRAGMA table_info(expenses)')[0].values.map((v) => v[1]);
    assert(cols.includes('client_id'), 'expenses must have client_id');
    assert(cols.includes('project_id'), 'expenses must have project_id');
    assert(cols.includes('billable'), 'expenses must have billable');
    assert(cols.includes('billed'), 'expenses must have billed');
    assert(cols.includes('invoice_id'), 'expenses must have invoice_id');
    console.log('✓ Migration 30 columns verified on expenses table');

    // 2. Set up test client and project
    const client = addClient({
      name: 'Acme Corp',
      email: 'finance@acme.com',
      company_name: 'Acme Global Inc',
    });
    assert(client && client.id, 'Client creation must succeed');
    const clientId = client.id;

    const projectRes = addProject({
      name: 'Website Redesign',
      client_id: clientId,
      status: 'active',
      start_date: '2026-09-01',
    });
    assert(projectRes && projectRes.ok, 'Project creation must succeed: ' + JSON.stringify(projectRes));
    const projectId = projectRes.project.id;
    console.log('✓ Test client and project created');

    // 3. Validation: Billable expense requires a valid client
    const invalidExp = createExpense({
      amount: 45.0,
      date: '2026-09-20',
      category: 'Software',
      billable: 1,
      // client_id missing
    });
    assert(!invalidExp.ok, 'Billable expense without client must fail validation');
    assert(invalidExp.errors && invalidExp.errors.client_id, 'Must report client_id error');
    console.log('✓ Validation correctly enforced for billable expenses without client');

    // 4. Create two billable expenses and one non-billable expense
    const exp1Res = createExpense({
      amount: 150.0,
      date: '2026-09-18',
      category: 'Software',
      notes: 'Monthly Figma seat',
      currency: 'USD',
      billable: 1,
      client_id: clientId,
      project_id: projectId,
    });
    assert(exp1Res.ok, 'Creating exp1 must succeed');
    const exp1Id = exp1Res.expense.id;
    assert.strictEqual(exp1Res.expense.billable, 1);
    assert.strictEqual(exp1Res.expense.billed, 0);
    assert.strictEqual(exp1Res.expense.invoice_id, null);

    const exp2Res = createExpense({
      amount: 225.5,
      date: '2026-09-19',
      category: 'Travel',
      notes: 'Train ticket to client HQ',
      currency: 'USD',
      billable: 1,
      client_id: clientId,
      project_id: projectId,
    });
    assert(exp2Res.ok, 'Creating exp2 must succeed');
    const exp2Id = exp2Res.expense.id;

    const exp3Res = createExpense({
      amount: 50.0,
      date: '2026-09-19',
      category: 'Supplies',
      notes: 'Office stationery (internal)',
      currency: 'USD',
      billable: 0,
    });
    assert(exp3Res.ok, 'Creating internal expense must succeed');
    const exp3Id = exp3Res.expense.id;
    console.log('✓ Expenses created: 2 billable ($150 + $225.50), 1 non-billable ($50)');

    // 5. Test getUnbilledExpenses
    const unbilled = getUnbilledExpenses(clientId);
    assert.strictEqual(unbilled.length, 2, 'Should return exactly 2 unbilled expenses for client');
    assert(unbilled.some((e) => e.id === exp1Id));
    assert(unbilled.some((e) => e.id === exp2Id));
    assert(!unbilled.some((e) => e.id === exp3Id), 'Non-billable expense should not appear');
    console.log('✓ getUnbilledExpenses returned correct records for client');

    // 6. Test update on unbilled expense (should succeed)
    const updateRes = updateExpense(exp1Id, {
      amount: 160.0,
      date: '2026-09-18',
      category: 'Software',
      notes: 'Monthly Figma Pro seat',
      currency: 'USD',
      billable: 1,
      client_id: clientId,
      project_id: projectId,
    });
    assert(updateRes.ok, 'Unbilled expense should be editable');
    assert.strictEqual(updateRes.expense.amount, 160.0);
    console.log('✓ Unbilled expense edited successfully');

    // 7. Create invoice from expenses
    const invRes = createInvoiceFromExpenses({
      client_id: clientId,
      project_id: projectId,
      expense_ids: [exp1Id, exp2Id],
      date_due: '2026-10-15',
    });
    assert(invRes && invRes.ok, 'Invoice creation from expenses must succeed: ' + JSON.stringify(invRes));
    const invoice = invRes.invoice;
    assert(invoice.id > 0);
    assert(invoice.invoice_number);
    assert.strictEqual(invoice.client_id, clientId);
    assert.strictEqual(invoice.project_id, projectId);
    // Subtotal: 160.00 + 225.50 = 385.50
    assert.strictEqual(invoice.subtotal, 385.5);
    assert.strictEqual(invoice.total, 385.5);
    assert.strictEqual(invoice.line_items.length, 2);
    console.log(`✓ Invoice #${invoice.invoice_number} created with total $${invoice.total} and 2 line items`);

    // 8. Verify expenses are now marked billed = 1 and invoice_id set
    const exp1After = getExpense(exp1Id);
    const exp2After = getExpense(exp2Id);
    assert.strictEqual(exp1After.billed, 1, 'Expense 1 must be marked billed');
    assert.strictEqual(exp1After.invoice_id, invoice.id);
    assert.strictEqual(exp1After.invoice_number, invoice.invoice_number);
    assert.strictEqual(exp2After.billed, 1, 'Expense 2 must be marked billed');
    assert.strictEqual(exp2After.invoice_id, invoice.id);
    console.log('✓ Expenses flagged as billed with invoice_id and invoice_number populated');

    // 9. Verify getUnbilledExpenses now returns 0
    const unbilledAfter = getUnbilledExpenses(clientId);
    assert.strictEqual(unbilledAfter.length, 0, 'No unbilled expenses should remain for client');
    console.log('✓ getUnbilledExpenses now returns 0 unbilled expenses');

    // 10. Verify billed expenses CANNOT be modified or deleted
    const editBilledRes = updateExpense(exp1Id, {
      amount: 200.0,
      date: '2026-09-18',
      category: 'Software',
      billable: 1,
      client_id: clientId,
    });
    assert(!editBilledRes.ok, 'Editing a billed expense must fail');
    assert.strictEqual(editBilledRes.locked, true, 'Must return locked: true');

    const deleteBilledRes = deleteExpense(exp1Id);
    assert(!deleteBilledRes.ok, 'Deleting a billed expense must fail');
    assert.strictEqual(deleteBilledRes.locked, true, 'Must return locked: true');
    console.log('✓ Lock guard prevents updating or deleting billed expenses');

    // 11. Attempting to bill already-billed expenses fails
    const reBillRes = createInvoiceFromExpenses({
      client_id: clientId,
      expense_ids: [exp1Id],
    });
    assert(!reBillRes.ok, 'Re-billing already billed expense must fail');
    console.log('✓ Prevented duplicate billing of already invoiced expenses');

    console.log('--- ALL PHASE B TESTS PASSED ---');
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
  console.error('Test execution failed:', err);
  process.exit(1);
});
