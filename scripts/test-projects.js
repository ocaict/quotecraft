const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Isolated temp DB — MUST be set BEFORE require('../src/main/database')
const testDbPath = path.join(__dirname, 'test-projects.sqlite');
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}
process.env.TEST_DB_PATH = testDbPath;

const {
  initializeDatabase,
  closeDatabase,
  addClient,
  addProject,
  getProject,
  listProjects,
  updateProject,
  archiveProject,
  deleteProject,
  countProjectHistory,
  getProjectOverview,
  createQuote,
  getQuote,
  setQuoteStatus,
  convertQuoteToInvoice,
  addPayment,
} = require('../src/main/database');

async function runTests() {
  console.log('--- Starting Projects / Jobs Tests ---');
  await initializeDatabase();
  console.log('✓ Database initialized (projects table + quotes/invoices project_id)');

  // ---------- Fixtures ----------
  const clientA = addClient({ name: 'Acme Corp', email: 'billing@acme.example', status: 'active' });
  assert.ok(clientA && clientA.id, 'Client A should be created');
  const clientB = addClient({ name: 'Globex', status: 'active' });
  assert.ok(clientB && clientB.id, 'Client B should be created');
  console.log('✓ Fixture clients created');

  // ---------- 1. listProjects (empty) ----------
  let projects = listProjects({});
  assert.ok(Array.isArray(projects), 'listProjects should return an array');
  assert.strictEqual(projects.length, 0, 'Should start with no projects');
  console.log('✓ listProjects returns empty list');

  // ---------- 2. addProject: missing client ----------
  const noClient = addProject({ name: 'Orphan Job', status: 'active' });
  assert.strictEqual(noClient.ok, false, 'Project without client should be rejected');
  console.log('✓ Missing client rejected');

  // ---------- 3. addProject: missing name ----------
  const noName = addProject({ client_id: clientA.id, name: '', status: 'active' });
  assert.strictEqual(noName.ok, false, 'Project without name should be rejected');
  console.log('✓ Missing name rejected');

  // ---------- 4. addProject: success ----------
  const addRes = addProject({
    client_id: clientA.id,
    name: 'Website Redesign',
    description: 'Full restructure of acme.com',
    status: 'active',
    start_date: '2026-01-05',
    end_date: '2026-03-30',
  });
  assert.strictEqual(addRes.ok, true, 'Project should be created');
  assert.ok(addRes.project && addRes.project.id, 'Created project needs an id');
  const projectId = addRes.project.id;
  assert.strictEqual(addRes.project.status, 'active', 'Default status should be active');
  console.log('✓ addProject created project #' + projectId);

  // ---------- 5. getProject ----------
  const got = getProject(projectId);
  assert.ok(got && got.id, 'getProject should return the project');
  assert.strictEqual(got.client_id, clientA.id, 'Project should belong to Acme');
  console.log('✓ getProject verified');

  // ---------- 6. Client filter ----------
  const acmeOnly = listProjects({ clientId: clientA.id });
  assert.strictEqual(acmeOnly.length, 1, 'Client A → 1 project');
  const globexOnly = listProjects({ clientId: clientB.id });
  assert.strictEqual(globexOnly.length, 0, 'Client B → 0 projects');
  console.log('✓ listProjects client filter (clientId key)');

  // Renderer callers send the snake_case `client_id` key — must filter too.
  const acmeOnlySnake = listProjects({ client_id: clientA.id });
  assert.strictEqual(acmeOnlySnake.length, 1, 'client_id key → Client A still 1 project');
  const globexOnlySnake = listProjects({ client_id: clientB.id });
  assert.strictEqual(globexOnlySnake.length, 0, 'client_id key → Client B still 0 projects');
  assert.deepStrictEqual(acmeOnly.map(p => p.id), acmeOnlySnake.map(p => p.id), 'Both keys return the same rows');
  console.log('✓ listProjects client filter (client_id / renderer key)');

  // ---------- 7. Status filter ----------
  const activeOnly = listProjects({ status: 'active' });
  assert.strictEqual(activeOnly.length, 1, 'Active → 1 project');
  const onHoldOnly = listProjects({ status: 'on_hold' });
  assert.strictEqual(onHoldOnly.length, 0, 'On-hold → 0 projects');
  console.log('✓ listProjects status filter');

  // ---------- 8. updateProject ----------
  const updRes = updateProject(projectId, {
    client_id: clientA.id,
    name: 'Website Redesign v2',
    status: 'on_hold',
    start_date: addRes.project.start_date,
    end_date: addRes.project.end_date,
    description: 'Paused pending budget approval',
  });
  assert.strictEqual(updRes.ok, true, 'updateProject should succeed');
  const afterUpd = getProject(projectId);
  assert.strictEqual(afterUpd.name, 'Website Redesign v2', 'Name should update');
  assert.strictEqual(afterUpd.status, 'on_hold', 'Status should update');
  console.log('✓ updateProject verified');

  // ---------- 9. countProjectHistory (nothing linked yet) ----------
  let hist = countProjectHistory(projectId);
  assert.strictEqual(hist.quoteCount, 0, '0 quotes linked');
  assert.strictEqual(hist.invoiceCount, 0, '0 invoices linked');
  console.log('✓ countProjectHistory (empty)');

  // ---------- 10. Quote linked to project ----------
  const quoteRes = createQuote(
    {
      client_id: clientA.id,
      project_id: projectId,
      date_created: '2026-01-10',
      valid_until: '2026-02-10',
      status: 'draft',
      currency: 'USD',
      tax_rate: 0,
      terms: 'Net 30',
      discount_type: 'none',
      discount_value: 0,
    },
    [
      {
        description: 'Design',
        quantity: 1,
        unit_price: 500,
        tax_rate: 0,
        discount_type: 'none',
        discount_value: 0,
      },
    ]
  );
  assert.strictEqual(quoteRes.ok, true, 'Quote should be created');
  const quote = quoteRes.quote;
  assert.strictEqual(quote.project_id, projectId, 'Quote should carry project_id');
  hist = countProjectHistory(projectId);
  assert.strictEqual(hist.quoteCount, 1, 'quoteCount should reflect the linked quote');
  console.log('✓ Quote → project linkage + countProjectHistory verified');

  // ---------- 11. deleteProject BLOCKED (quote linked) ----------
  const blocked = deleteProject(projectId);
  assert.strictEqual(blocked.ok, false, 'Delete should be blocked');
  assert.strictEqual(blocked.blocked, true, 'Should report blocked');
  assert.strictEqual(blocked.quoteCount, 1, 'Should report 1 linked quote');
  console.log('✓ deleteProject blocked when quote linked');

  // ---------- 12. archiveProject allowed even when linked ----------
  const archRes = archiveProject(projectId);
  assert.strictEqual(archRes.ok, true, 'Archive should succeed when linked');
  const afterArch = getProject(projectId);
  assert.strictEqual(afterArch.status, 'archived', 'Project should be archived');
  console.log('✓ archiveProject allowed (correct alternative path)');

  // ---------- 13. Delete stays blocked after archive ----------
  const stillBlocked = deleteProject(projectId);
  assert.strictEqual(stillBlocked.ok, false, 'Delete should remain blocked after archive');
  assert.strictEqual(stillBlocked.quoteCount, 1, 'Still reports 1 linked quote');
  console.log('✓ deleteProject stays blocked after archive');

  // ---------- 14. Quote→Invoice conversion project linkage ----------
  const project2Res = addProject({ client_id: clientA.id, name: 'Website Redesign — Maintenance', status: 'active', start_date: '2026-02-01' });
  assert.strictEqual(project2Res.ok, true, 'Second project (client A) should be created');
  const project2Id = project2Res.project.id;
  const projectBRes = addProject({ client_id: clientB.id, name: 'Globex Internal Tool', status: 'active', start_date: '2026-02-01' });
  assert.strictEqual(projectBRes.ok, true, 'Project for client B should be created');
  const projectBId = projectBRes.project.id;
  console.log('✓ Extra fixture projects created');

  function makeAcceptedQuote(clientId, projectRef) {
    const r = createQuote(
      {
        client_id: clientId,
        project_id: projectRef,
        date_created: '2026-02-01',
        valid_until: '2026-03-01',
        status: 'draft',
        currency: 'USD',
        tax_rate: 0,
        terms: 'Net 30',
        discount_type: 'none',
        discount_value: 0,
      },
      [{ description: 'Service', quantity: 1, unit_price: 400, tax_rate: 0, discount_type: 'none', discount_value: 0 }]
    );
    assert.strictEqual(r.ok, true, 'Quote should be created');
    const accepted = setQuoteStatus(r.quote.id, 'accepted');
    assert.strictEqual(accepted.ok, true, 'Quote should be accept-able');
    return r.quote;
  }

  // 14a. No override → invoice inherits the quote's project.
  const inheritQuote = makeAcceptedQuote(clientA.id, projectId);
  const inheritRes = convertQuoteToInvoice(inheritQuote.id);
  assert.strictEqual(inheritRes.ok, true, 'Conversion with no override should succeed');
  assert.strictEqual(inheritRes.invoice.project_id, projectId, 'Invoice inherits quote project by default');
  console.log('✓ Conversion defaults to the quote project');

  // 14b. Override to another project of the SAME client.
  const overrideQuote = makeAcceptedQuote(clientA.id, projectId);
  const overrideRes = convertQuoteToInvoice(overrideQuote.id, { project_id: project2Id });
  assert.strictEqual(overrideRes.ok, true, 'Conversion with same-client project override should succeed');
  assert.strictEqual(overrideRes.invoice.project_id, project2Id, 'Invoice takes the overridden project');
  const hist2 = countProjectHistory(project2Id);
  assert.strictEqual(hist2.quoteCount, 0, 'project2 has no linked quotes');
  assert.strictEqual(hist2.invoiceCount, 1, 'project2 now has 1 linked invoice');
  console.log('✓ Same-client project override applied + counted');

  // 14c. Explicit no-project ("No project" selection) → invoice project_id null.
  const clearQuote = makeAcceptedQuote(clientA.id, projectId);
  const clearRes = convertQuoteToInvoice(clearQuote.id, { project_id: null });
  assert.strictEqual(clearRes.ok, true, 'Conversion with project_id null should succeed');
  assert.strictEqual(clearRes.invoice.project_id, null, 'Invoice should have no project');
  console.log('✓ Explicit no-project override honored');

  // 14d. Cross-client project → rejected, no invoice created.
  const crossQuote = makeAcceptedQuote(clientA.id, projectId);
  const crossRes = convertQuoteToInvoice(crossQuote.id, { project_id: projectBId });
  assert.strictEqual(crossRes.ok, false, 'Cross-client project override should be rejected');
  assert.ok(crossRes.errors && crossRes.errors.project_id, 'Should report a project_id error');
  console.log('✓ Cross-client project rejected');

  // 14e. Legacy documents: quote/invoice created with NO project at all
  // (exactly how a pre-project quote/invoice row looks) must stay project-less
  // and keep working — no error, no forced project.
  const noProjQuote = createQuote(
    {
      client_id: clientA.id,
      date_created: '2026-02-01',
      valid_until: '2026-03-01',
      status: 'draft',
      currency: 'USD',
      tax_rate: 0,
      terms: 'Net 30',
      discount_type: 'none',
      discount_value: 0,
    },
    [{ description: 'Legacy service', quantity: 1, unit_price: 100, tax_rate: 0, discount_type: 'none', discount_value: 0 }]
  );
  assert.strictEqual(noProjQuote.ok, true, 'No-project quote creation must succeed');
  assert.strictEqual(noProjQuote.quote.project_id, null, 'Quote project_id should stay null');
  const loadedNoProjQuote = getQuote(noProjQuote.quote.id);
  assert.strictEqual(loadedNoProjQuote.project, null, 'getQuote should surface project as null');
  setQuoteStatus(noProjQuote.quote.id, 'accepted');
  const noProjInv = convertQuoteToInvoice(noProjQuote.quote.id, {});
  assert.strictEqual(noProjInv.ok, true, 'No-project quote should convert normally');
  assert.strictEqual(noProjInv.invoice.project_id, null, 'Converted invoice should stay project-less');
  console.log('✓ Legacy (no-project) quote/invoice still work end-to-end');

  // ---------- 15. getProjectOverview stats over a mix of documents ----------
  const ovProjRes = addProject({ client_id: clientA.id, name: 'Overview Mix Project', status: 'active', start_date: '2026-03-01' });
  assert.strictEqual(ovProjRes.ok, true, 'Overview project should be created');
  const ovProjId = ovProjRes.project.id;

  function makeQuoteWithTotal(total) {
    const r = createQuote(
      {
        client_id: clientA.id,
        project_id: ovProjId,
        date_created: '2026-03-01',
        valid_until: '2026-03-31',
        status: 'draft',
        currency: 'USD',
        tax_rate: 0,
        terms: 'Net 30',
        discount_type: 'none',
        discount_value: 0,
        subtotal: total,
        discount_amount: 0,
        tax_amount: 0,
        total: total,
      },
      [{ description: 'Service', quantity: 1, unit_price: total, tax_rate: 0, discount_type: 'none', discount_value: 0 }]
    );
    assert.strictEqual(r.ok, true, 'Quote creation should succeed');
    return r.quote;
  }

  // One draft quote kept as-is; three accepted quotes that become invoices.
  makeQuoteWithTotal(500); // stays draft => counts toward totalQuoted only
  const q1 = makeQuoteWithTotal(1000);
  const q2 = makeQuoteWithTotal(2000);
  const q3 = makeQuoteWithTotal(300);

  const acc1 = setQuoteStatus(q1.id, 'accepted');
  const acc2 = setQuoteStatus(q2.id, 'accepted');
  const acc3 = setQuoteStatus(q3.id, 'accepted');
  assert.strictEqual(acc1.ok && acc2.ok && acc3.ok, true, 'Quotes should be accepted');

  // I1: $1000, partially paid ($400) → balance $600.
  const conv1 = convertQuoteToInvoice(q1.id, { status: 'sent' });
  assert.strictEqual(conv1.ok, true, 'q1 should convert');
  const i1 = conv1.invoice.id;
  const pay1 = addPayment(i1, { amount: 400, payment_method: 'Bank Transfer', reference_number: 'OV-1' });
  assert.strictEqual(pay1.ok, true, 'Payment on I1 should record');

  // I2: $2000, no payments → fully outstanding.
  const conv2 = convertQuoteToInvoice(q2.id, { status: 'sent' });
  assert.strictEqual(conv2.ok, true, 'q2 should convert');

  // I3: $300, fully paid → balance $0.
  const conv3 = convertQuoteToInvoice(q3.id, { status: 'sent' });
  assert.strictEqual(conv3.ok, true, 'q3 should convert');
  const i3 = conv3.invoice.id;
  const pay3 = addPayment(i3, { amount: 300, payment_method: 'Bank Transfer', reference_number: 'OV-3' });
  assert.strictEqual(pay3.ok, true, 'Payment on I3 should record');

  const ov = getProjectOverview(ovProjId);
  assert.ok(ov && ov.project, 'Overview should load a project');
  assert.strictEqual(ov.stats.quoteCount, 4, '4 quotes linked');
  assert.strictEqual(ov.stats.invoiceCount, 3, '3 invoices linked');
  assert.strictEqual(ov.stats.totalQuoted, 3800, 'totalQuoted = 500+1000+2000+300');
  assert.strictEqual(ov.stats.totalInvoiced, 3300, 'totalInvoiced = 1000+2000+300');
  assert.strictEqual(ov.stats.totalPaid, 700, 'totalPaid = 400+300');
  assert.strictEqual(ov.stats.outstandingBalance, 2600, 'outstanding = 600+2000');

  assert.strictEqual(ov.quotes.length, 4, 'all 4 quotes in overview rows');
  assert.ok(ov.quotes.some((q) => q.status === 'draft'), 'draft quote present in rows');
  assert.strictEqual(ov.invoices.length, 3, 'all 3 invoices in overview rows');
  const invById = {};
  ov.invoices.forEach((inv) => { invById[inv.id] = inv; });
  assert.strictEqual(invById[i1].balance_due, 600, 'I1 balance is 600 after partial payment');
  assert.strictEqual(invById[i3].balance_due, 0, 'I3 balance is 0 after full payment');
  console.log('✓ getProjectOverview stats: quoted 3800, invoiced 3300, paid 700, outstanding 2600');

  console.log('✓ Projects CRUD, filters, archive, and delete-block all pass');
  console.log('');
  console.log('PASS (test-projects)');
  console.log('');

  closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
}

runTests().catch((err) => {
  console.error('FAIL (test-projects)');
  console.error(err);
  try {
    closeDatabase();
  } catch (e) { /* ignore */ }
  process.exit(1);
});
