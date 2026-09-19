// Client Statements Controller
(function () {
  'use strict';

  let clientsLoaded = false;
  let currentStatement = null;

  // ── DOM References ──────────────────────────────────────────
  const csClientSelect = document.getElementById('csClientSelect');
  const csPresetSelect = document.getElementById('csPresetSelect');
  const csStartDate    = document.getElementById('csStartDate');
  const csEndDate      = document.getElementById('csEndDate');
  const csPrintBtn     = document.getElementById('csPrintBtn');

  const csPlaceholder  = document.getElementById('csPlaceholder');
  const csStatement    = document.getElementById('csStatement');

  const csClientName   = document.getElementById('csClientName');
  const csClientMeta   = document.getElementById('csClientMeta');
  const csPeriodLabel  = document.getElementById('csPeriodLabel');
  const csCurrencyBadge = document.getElementById('csCurrencyBadge');
  const csCurrencyBadgeFx = document.getElementById('csCurrencyBadgeFx');

  const csOpeningBalance = document.getElementById('csOpeningBalance');
  const csTotalInvoiced  = document.getElementById('csTotalInvoiced');
  const csTotalPaid      = document.getElementById('csTotalPaid');
  const csTotalCredited  = document.getElementById('csTotalCredited');
  const csClosingBalance = document.getElementById('csClosingBalance');
  const csFxNotice       = document.getElementById('csFxNotice');

  const csTableCount = document.getElementById('csTableCount');
  const csTableBody  = document.getElementById('csTableBody');
  const csTableFoot  = document.getElementById('csTableFoot');

  const TYPE_LABELS = { invoice: 'Invoice', payment: 'Payment', credit_note: 'Credit Note' };

  function fmt(amount, currency) {
    return window.QuoteCraftUtils.formatCurrency(Number(amount) || 0, currency || 'USD');
  }

  function fmtDate(value) {
    return value ? window.QuoteCraftUtils.formatDate(value) : '—';
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getISODate(d) {
    return d.toISOString().slice(0, 10);
  }

  // ── Date Presets ────────────────────────────────────────────
  function applyPreset(preset) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (preset === 'this_year') {
      csStartDate.value = `${y}-01-01`;
      csEndDate.value   = `${y}-12-31`;
    } else if (preset === 'last_year') {
      csStartDate.value = `${y - 1}-01-01`;
      csEndDate.value   = `${y - 1}-12-31`;
    } else if (preset === 'last_12_months') {
      csStartDate.value = getISODate(new Date(y, m - 11, 1));
      csEndDate.value   = getISODate(new Date(y, m + 1, 0));
    } else if (preset === 'this_quarter') {
      const qm = Math.floor(m / 3) * 3;
      csStartDate.value = getISODate(new Date(y, qm, 1));
      csEndDate.value   = getISODate(new Date(y, qm + 3, 0));
    } else if (preset === 'this_month') {
      csStartDate.value = getISODate(new Date(y, m, 1));
      csEndDate.value   = getISODate(new Date(y, m + 1, 0));
    } else if (preset === 'all_time') {
      csStartDate.value = '2000-01-01';
      csEndDate.value   = getISODate(now);
    }
  }

  // ── Client List ─────────────────────────────────────────────
  async function ensureClientsLoaded(force) {
    if (clientsLoaded && !force) return;

    try {
      const res = await window.electronAPI.listClients();
      if (!res.ok) {
        window.QuoteCraftUtils.showToast('Could not load clients.', 'error');
        return;
      }
      const clients = (res.clients || []).slice().sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''))
      );
      const previous = csClientSelect.value;
      csClientSelect.innerHTML = '<option value="">Select a client…</option>';
      clients.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = String(c.id);
        opt.textContent = c.company_name ? `${c.name} — ${c.company_name}` : c.name;
        csClientSelect.appendChild(opt);
      });
      if (previous) csClientSelect.value = previous;
      clientsLoaded = true;
    } catch (e) {
      window.QuoteCraftUtils.showToast('Could not load clients: ' + e.message, 'error');
    }
  }

  // ── Load Statement ──────────────────────────────────────────
  async function loadStatement() {
    const clientId = csClientSelect.value;
    const startDate = csStartDate.value;
    const endDate = csEndDate.value;

    if (!clientId) {
      showPlaceholder();
      return;
    }

    if (!startDate || !endDate || startDate > endDate) {
      renderError('Please choose a valid date range (start date must not be after the end date).');
      return;
    }

    renderLoading();

    try {
      const result = await window.electronAPI.getClientStatement({
        client_id: Number(clientId),
        startDate,
        endDate,
      });

      if (!result || !result.ok) {
        const errors = (result && result.errors) || {};
        renderError(errors.range || errors.client_id || errors.general || 'Failed to generate statement.');
        return;
      }

      currentStatement = result;
      renderStatement(result);
    } catch (err) {
      renderError(err.message || 'An unexpected error occurred while generating the statement.');
    }
  }

  function showPlaceholder() {
    currentStatement = null;
    csPlaceholder.classList.remove('hidden');
    csStatement.classList.add('hidden');
  }

  function showStatement() {
    csPlaceholder.classList.add('hidden');
    csStatement.classList.remove('hidden');
  }

  function renderLoading() {
    showStatement();
    if (csTableBody) {
      csTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="cs-empty-state">
            <div class="cs-empty-icon">⏳</div>
            <div>Generating statement…</div>
          </td>
        </tr>
      `;
    }
    if (csTableFoot) csTableFoot.innerHTML = '';
  }

  function renderError(msg) {
    showStatement();
    if (csTableBody) {
      csTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="cs-empty-state" style="color:#ef4444;">
            <div class="cs-empty-icon">⚠️</div>
            <div>${escapeHtml(msg)}</div>
          </td>
        </tr>
      `;
    }
    if (csTableFoot) csTableFoot.innerHTML = '';
  }

  // ── Render Statement ────────────────────────────────────────
  function renderStatement(statement) {
    showStatement();

    const curr = statement.currency || 'USD';
    const c = statement.client || {};

    csClientName.textContent = c.name || '—';
    const metaParts = [c.company_name, c.email, c.phone].filter(Boolean);
    csClientMeta.textContent = metaParts.length ? metaParts.join(' · ') : 'No contact details on file';
    csPeriodLabel.textContent = `${fmtDate(statement.startDate)} – ${fmtDate(statement.endDate)}`;

    if (csCurrencyBadge) csCurrencyBadge.textContent = curr;
    if (csCurrencyBadgeFx) csCurrencyBadgeFx.textContent = curr;
    if (csFxNotice) csFxNotice.classList.toggle('hidden', !statement.hasForeignCurrency);

    csOpeningBalance.textContent = fmt(statement.openingBalance, curr);
    csTotalInvoiced.textContent = fmt(statement.totals && statement.totals.invoiced, curr);
    csTotalPaid.textContent = fmt(statement.totals && statement.totals.paid, curr);
    csTotalCredited.textContent = fmt(statement.totals && statement.totals.credited, curr);
    csClosingBalance.textContent = fmt(statement.closingBalance, curr);

    renderTable(statement.rows || [], curr);
  }

  function renderTable(rows, currency) {
    if (!csTableBody) return;

    const hasOpening = Boolean(currentStatement) &&
      Math.abs(Number(currentStatement.openingBalance) || 0) > 0.0001;

    if (rows.length === 0 && !hasOpening) {
      csTableCount.textContent = '0 entries';
      csTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="cs-empty-state">
            <div class="cs-empty-icon">🧾</div>
            <div>No account activity in the selected period.</div>
          </td>
        </tr>
      `;
      if (csTableFoot) csTableFoot.innerHTML = '';
      return;
    }

    csTableCount.textContent = `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`;

    const parts = [];

    if (hasOpening) {
      parts.push(`
        <tr class="cs-bring-forward">
          <td>${fmtDate(currentStatement.startDate)}</td>
          <td>—</td>
          <td>—</td>
          <td>Bring forward</td>
          <td class="num">—</td>
          <td class="num">—</td>
          <td class="num cs-balance-pos">${fmt(currentStatement.openingBalance, currency)}</td>
        </tr>
      `);
    }

    rows.forEach((r) => {
      const charge = Number(r.charge) || 0;
      const credit = Number(r.credit) || 0;
      const balance = Number(r.balance) || 0;
      parts.push(`
        <tr class="${r.invoice_id ? 'cs-clickable' : ''}" data-invoice-id="${r.invoice_id || ''}">
          <td>${fmtDate(r.date)}</td>
          <td><span class="cs-type-badge ${r.type}">${TYPE_LABELS[r.type] || r.type}</span></td>
          <td>${escapeHtml(r.reference) || '—'}</td>
          <td>${escapeHtml(r.description)}</td>
          <td class="num">${charge ? `<span class="cs-amount-charge">${fmt(charge, currency)}</span>` : '—'}</td>
          <td class="num">${credit ? `<span class="cs-amount-credit">${fmt(credit, currency)}</span>` : '—'}</td>
          <td class="num ${Math.abs(balance) > 0.0001 ? 'cs-balance-pos' : 'cs-balance-zero'}">${fmt(balance, currency)}</td>
        </tr>
      `);
    });

    csTableBody.innerHTML = parts.join('');

    csTableBody.querySelectorAll('tr.cs-clickable').forEach((tr) => {
      tr.addEventListener('click', () => {
        const invId = tr.dataset.invoiceId;
        if (!invId) return;
        window.QuoteCraftUtils.goToPage('invoices');
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: Number(invId) }));
        }, 50);
      });
    });

    if (csTableFoot) {
      const t = (currentStatement && currentStatement.totals) || {};
      csTableFoot.innerHTML = `
        <tr>
          <td colspan="4">Period Totals</td>
          <td class="num">${fmt(t.invoiced, currency)}</td>
          <td class="num">${fmt(t.paid, currency)}</td>
          <td class="num">${fmt(currentStatement ? currentStatement.closingBalance : 0, currency)}</td>
        </tr>
      `;
    }
  }

  // ── Event Setup ─────────────────────────────────────────────
  function setupEvents() {
    if (csClientSelect) {
      csClientSelect.addEventListener('change', loadStatement);
    }

    if (csPresetSelect) {
      csPresetSelect.addEventListener('change', () => {
        applyPreset(csPresetSelect.value);
        loadStatement();
      });
    }

    if (csStartDate) {
      csStartDate.addEventListener('change', () => {
        if (csPresetSelect) csPresetSelect.value = 'custom';
        loadStatement();
      });
    }

    if (csEndDate) {
      csEndDate.addEventListener('change', () => {
        if (csPresetSelect) csPresetSelect.value = 'custom';
        loadStatement();
      });
    }

    if (csPrintBtn) {
      csPrintBtn.addEventListener('click', () => window.print());
    }

    document.addEventListener('pagechange', (e) => {
      if (e.detail !== 'client-statements') return;
      ensureClientsLoaded().then(() => {
        if (csClientSelect && csClientSelect.value) loadStatement();
      });
    });

    // Prefill from the client overview "Statement" button.
    window.addEventListener('qc-open-client-statement', (e) => {
      const clientId = e.detail;
      ensureClientsLoaded().then(() => {
        if (!csClientSelect || !clientId) return;
        csClientSelect.value = String(clientId);
        loadStatement();
      });
    });
  }

  function init() {
    if (!document.getElementById('page-client-statements')) return;

    setupEvents();

    if (csPresetSelect) {
      csPresetSelect.value = 'this_year';
      applyPreset('this_year');
    }

    if (document.getElementById('page-client-statements').classList.contains('active')) {
      ensureClientsLoaded().then(() => {
        if (csClientSelect && csClientSelect.value) loadStatement();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
