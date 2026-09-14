// Client Profitability Report Controller
(function () {
  'use strict';

  let currentReport = null;
  let currentSort = 'collected_desc';
  let searchTerm = '';

  // ── DOM References ──────────────────────────────────────────
  const cpPresetSelect     = document.getElementById('cpPresetSelect');
  const cpStartDate        = document.getElementById('cpStartDate');
  const cpEndDate          = document.getElementById('cpEndDate');
  const cpSearchInput      = document.getElementById('cpSearchInput');
  const cpIncludeInactive  = document.getElementById('cpIncludeInactive');
  const cpExportCsvBtn     = document.getElementById('cpExportCsvBtn');
  const cpPrintBtn         = document.getElementById('cpPrintBtn');

  // KPIs
  const cpKpiBilled        = document.getElementById('cpKpiBilled');
  const cpKpiBilledSub     = document.getElementById('cpKpiBilledSub');
  const cpKpiCollected     = document.getElementById('cpKpiCollected');
  const cpKpiCollectedSub  = document.getElementById('cpKpiCollectedSub');
  const cpKpiOutstanding   = document.getElementById('cpKpiOutstanding');
  const cpKpiOutstandingSub= document.getElementById('cpKpiOutstandingSub');
  const cpKpiTopClient     = document.getElementById('cpKpiTopClient');
  const cpKpiTopClientSub  = document.getElementById('cpKpiTopClientSub');
  const cpCurrencyBadge    = document.getElementById('cpCurrencyBadge');

  // Notice & Table
  const cpFxNotice         = document.getElementById('cpFxNotice');
  const cpTableCount       = document.getElementById('cpTableCount');
  const cpTableBody        = document.getElementById('cpTableBody');
  const cpTableFoot        = document.getElementById('cpTableFoot');

  // ── Currency Formatting ─────────────────────────────────────
  const CURRENCY_SYMBOLS = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$',
    CHF: 'Fr', CNY: '¥', INR: '₹', MXN: '$', BRL: 'R$', KRW: '₩',
    NGN: '₦', ZAR: 'R', TRY: '₺', SEK: 'kr', NOK: 'kr', DKK: 'kr',
    NZD: 'NZ$', HKD: 'HK$', SGD: 'S$',
  };

  function fmtCurrency(amount, currency) {
    const sym = CURRENCY_SYMBOLS[currency] || currency + ' ';
    const val = Number(amount) || 0;
    return sym + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtRate(rate) {
    if (rate === null || rate === undefined) return '—';
    return Number(rate).toFixed(1) + '%';
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
      cpStartDate.value = `${y}-01-01`;
      cpEndDate.value   = `${y}-12-31`;
    } else if (preset === 'last_year') {
      cpStartDate.value = `${y - 1}-01-01`;
      cpEndDate.value   = `${y - 1}-12-31`;
    } else if (preset === 'last_12_months') {
      const s = new Date(y, m - 11, 1);
      const e = new Date(y, m + 1, 0);
      cpStartDate.value = getISODate(s);
      cpEndDate.value   = getISODate(e);
    } else if (preset === 'this_quarter') {
      const qm = Math.floor(m / 3) * 3;
      cpStartDate.value = getISODate(new Date(y, qm, 1));
      cpEndDate.value   = getISODate(new Date(y, qm + 3, 0));
    } else if (preset === 'this_month') {
      cpStartDate.value = getISODate(new Date(y, m, 1));
      cpEndDate.value   = getISODate(new Date(y, m + 1, 0));
    } else if (preset === 'all_time') {
      cpStartDate.value = '';
      cpEndDate.value   = '';
    }
  }

  // ── Load Report ─────────────────────────────────────────────
  async function loadReport() {
    const filter = {
      startDate: cpStartDate.value || undefined,
      endDate:   cpEndDate.value   || undefined,
      sort:      currentSort,
      includeInactive: cpIncludeInactive ? cpIncludeInactive.checked : false,
    };

    renderLoading();

    try {
      const result = await window.electronAPI.getClientProfitabilityReport(filter);
      if (!result.ok) {
        renderError(result.error || 'Failed to load client profitability report.');
        return;
      }
      currentReport = result.report;
      renderReport(currentReport);
    } catch (err) {
      renderError(err.message || 'An unexpected error occurred while loading client profitability.');
    }
  }

  // ── Render States ───────────────────────────────────────────
  function renderLoading() {
    if (cpTableBody) {
      cpTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="cp-empty-state">
            <div class="cp-empty-icon">⏳</div>
            <div>Loading client profitability data...</div>
          </td>
        </tr>
      `;
    }
    if (cpTableFoot) cpTableFoot.innerHTML = '';
  }

  function renderError(msg) {
    if (cpTableBody) {
      cpTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="cp-empty-state" style="color: #ef4444;">
            <div class="cp-empty-icon">⚠️</div>
            <div>${escapeHtml(msg)}</div>
          </td>
        </tr>
      `;
    }
    if (cpTableFoot) cpTableFoot.innerHTML = '';
  }

  // ── Render Main Report ──────────────────────────────────────
  function renderReport(report) {
    const curr = report.reportingCurrency || 'USD';
    const sum = report.summary || {};

    // Currency badges
    if (cpCurrencyBadge) cpCurrencyBadge.textContent = curr;

    // FX Notice
    if (cpFxNotice) {
      cpFxNotice.classList.toggle('hidden', !report.hasForeignCurrency);
    }

    // KPIs
    if (cpKpiBilled) cpKpiBilled.textContent = fmtCurrency(sum.totalBilled || 0, curr);
    if (cpKpiBilledSub) {
      const activeCount = sum.activeClientsCount || 0;
      cpKpiBilledSub.textContent = `${activeCount} active client${activeCount === 1 ? '' : 's'}`;
    }

    if (cpKpiCollected) cpKpiCollected.textContent = fmtCurrency(sum.totalCollected || 0, curr);
    if (cpKpiCollectedSub) {
      const rate = sum.overallCollectionRate;
      cpKpiCollectedSub.textContent = rate !== null ? `${rate.toFixed(1)}% collected` : 'No billings';
    }

    if (cpKpiOutstanding) cpKpiOutstanding.textContent = fmtCurrency(sum.totalOutstanding || 0, curr);
    if (cpKpiOutstandingSub) {
      const uncolRate = sum.totalBilled > 0
        ? ((sum.totalOutstanding / sum.totalBilled) * 100).toFixed(1) + '% unpaid'
        : 'Fully cleared';
      cpKpiOutstandingSub.textContent = uncolRate;
    }

    if (cpKpiTopClient) {
      if (sum.topClient) {
        cpKpiTopClient.textContent = sum.topClient.name;
        cpKpiTopClient.title = `${sum.topClient.name} (${fmtCurrency(sum.topClient.totalCollected, curr)} collected)`;
      } else {
        cpKpiTopClient.textContent = 'None';
        cpKpiTopClient.title = '';
      }
    }
    if (cpKpiTopClientSub) {
      if (sum.topClient) {
        cpKpiTopClientSub.textContent = `${fmtCurrency(sum.topClient.totalCollected, curr)} collected`;
      } else {
        cpKpiTopClientSub.textContent = 'No payments in period';
      }
    }

    // Render Table
    renderTable(report.clients || [], curr, sum);
  }

  // ── Render Table ────────────────────────────────────────────
  function renderTable(clients, currency, summary) {
    if (!cpTableBody) return;

    // Filter by client search
    let filtered = clients;
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      filtered = clients.filter(c =>
        c.clientName.toLowerCase().includes(q) ||
        (c.companyName && c.companyName.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
      );
    }

    if (cpTableCount) {
      cpTableCount.textContent = `Showing ${filtered.length} of ${clients.length} client${clients.length === 1 ? '' : 's'}`;
    }

    if (filtered.length === 0) {
      cpTableBody.innerHTML = `
        <tr>
          <td colspan="7" class="cp-empty-state">
            <div class="cp-empty-icon">👥</div>
            <div>${searchTerm.trim() ? 'No clients match your search filter.' : 'No client activity found for the selected date range.'}</div>
          </td>
        </tr>
      `;
      if (cpTableFoot) cpTableFoot.innerHTML = '';
      return;
    }

    const rowsHtml = filtered.map(c => {
      // Rank badge styling
      let rankClass = '';
      if (c.rank === 1) rankClass = 'rank-1';
      else if (c.rank === 2) rankClass = 'rank-2';
      else if (c.rank === 3) rankClass = 'rank-3';

      // Collection rate badge
      let rateClass = 'none';
      if (c.collectionRate !== null) {
        if (c.collectionRate >= 85) rateClass = 'high';
        else if (c.collectionRate >= 50) rateClass = 'mid';
        else rateClass = 'low';
      }

      const rateBadge = c.collectionRate !== null
        ? `<span class="cp-badge-rate ${rateClass}">${c.collectionRate.toFixed(1)}%</span>`
        : `<span class="cp-badge-rate none">—</span>`;

      // Outstanding color styling
      const outStyle = c.outstandingBalance > 0
        ? 'color: #fbbf24; font-weight: 600;'
        : 'color: var(--text-muted);';

      const companyMeta = c.companyName ? `<span class="cp-client-meta">${escapeHtml(c.companyName)}</span>` : '';

      return `
        <tr data-client-id="${c.clientId}">
          <td style="width: 50px;">
            <span class="cp-rank-badge ${rankClass}">${c.rank}</span>
          </td>
          <td>
            <span class="cp-client-name">${escapeHtml(c.clientName)}</span>
            ${companyMeta}
          </td>
          <td class="num">
            <span style="font-weight:600;">${fmtCurrency(c.totalBilled, currency)}</span>
            <span class="cp-cell-sub">${c.invoiceCount} inv${c.invoiceCount === 1 ? '' : 's'}</span>
          </td>
          <td class="num">
            <span style="font-weight:600; color:#34d399;">${fmtCurrency(c.totalCollected, currency)}</span>
            <span class="cp-cell-sub">${c.paymentCount} pmt${c.paymentCount === 1 ? '' : 's'}</span>
          </td>
          <td class="num">
            <span style="${outStyle}">${fmtCurrency(c.outstandingBalance, currency)}</span>
          </td>
          <td class="num" style="text-align: center;">
            ${rateBadge}
          </td>
          <td style="text-align: right;">
            <button type="button" class="cp-btn-view" data-action="view-client" data-id="${c.clientId}">View Client</button>
          </td>
        </tr>
      `;
    }).join('');

    cpTableBody.innerHTML = rowsHtml;

    // Attach view client buttons
    cpTableBody.querySelectorAll('[data-action="view-client"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cid = btn.dataset.id;
        if (window.QuoteCraftUtils && window.QuoteCraftUtils.goToPage) {
          window.QuoteCraftUtils.goToPage('clients');
          // If selectClient exists in global scope
          setTimeout(() => {
            if (window.selectClientById) {
              window.selectClientById(cid);
            }
          }, 100);
        }
      });
    });

    // Render Table Foot (Totals)
    if (cpTableFoot) {
      const totBilled = summary.totalBilled || 0;
      const totCollected = summary.totalCollected || 0;
      const totOutstanding = summary.totalOutstanding || 0;
      const totRate = summary.overallCollectionRate !== null
        ? `<span class="cp-badge-rate ${summary.overallCollectionRate >= 85 ? 'high' : summary.overallCollectionRate >= 50 ? 'mid' : 'low'}">${summary.overallCollectionRate.toFixed(1)}%</span>`
        : '—';

      cpTableFoot.innerHTML = `
        <tr>
          <td colspan="2">Overall Period Total</td>
          <td class="num">${fmtCurrency(totBilled, currency)}</td>
          <td class="num" style="color:#34d399;">${fmtCurrency(totCollected, currency)}</td>
          <td class="num" style="color:#fbbf24;">${fmtCurrency(totOutstanding, currency)}</td>
          <td class="num" style="text-align: center;">${totRate}</td>
          <td></td>
        </tr>
      `;
    }
  }

  // ── Column Sorting ──────────────────────────────────────────
  function setupSorting() {
    const headers = document.querySelectorAll('.cp-th-sortable');
    headers.forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (!col) return;

        // Toggle asc / desc
        if (currentSort === `${col}_desc`) {
          currentSort = `${col}_asc`;
        } else if (currentSort === `${col}_asc`) {
          currentSort = `${col}_desc`;
        } else {
          currentSort = (col === 'name') ? `${col}_asc` : `${col}_desc`;
        }

        // Update header UI
        headers.forEach(h => {
          h.classList.remove('sorted');
          const icon = h.querySelector('.sort-icon');
          if (icon) icon.textContent = '↕';
        });

        th.classList.add('sorted');
        const icon = th.querySelector('.sort-icon');
        if (icon) {
          icon.textContent = currentSort.endsWith('_asc') ? '↑' : '↓';
        }

        loadReport();
      });
    });
  }

  // ── CSV Export ──────────────────────────────────────────────
  function exportCsv() {
    if (!currentReport || !currentReport.clients || !currentReport.clients.length) {
      alert('No data available to export.');
      return;
    }

    const curr = currentReport.reportingCurrency || 'USD';
    const headers = ['Rank', 'Client Name', 'Company', 'Email', 'Phone', `Total Billed (${curr})`, 'Invoices', `Total Collected (${curr})`, 'Payments', `Outstanding Balance (${curr})`, 'Collection Rate (%)'];

    const rows = currentReport.clients.map(c => [
      c.rank,
      `"${(c.clientName || '').replace(/"/g, '""')}"`,
      `"${(c.companyName || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      c.totalBilled.toFixed(2),
      c.invoiceCount,
      c.totalCollected.toFixed(2),
      c.paymentCount,
      c.outstandingBalance.toFixed(2),
      c.collectionRate !== null ? c.collectionRate.toFixed(1) : '',
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const startStr = currentReport.startDate || 'all';
    const endStr = currentReport.endDate || 'time';
    a.download = `client-profitability-${startStr}-to-${endStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── Event Setup ─────────────────────────────────────────────
  function init() {
    if (cpPresetSelect) {
      cpPresetSelect.addEventListener('change', () => {
        applyPreset(cpPresetSelect.value);
        loadReport();
      });
    }

    if (cpStartDate) {
      cpStartDate.addEventListener('change', () => {
        if (cpPresetSelect) cpPresetSelect.value = 'custom';
        loadReport();
      });
    }

    if (cpEndDate) {
      cpEndDate.addEventListener('change', () => {
        if (cpPresetSelect) cpPresetSelect.value = 'custom';
        loadReport();
      });
    }

    if (cpSearchInput) {
      cpSearchInput.addEventListener('input', () => {
        searchTerm = cpSearchInput.value;
        if (currentReport) {
          renderTable(currentReport.clients || [], currentReport.reportingCurrency || 'USD', currentReport.summary || {});
        }
      });
    }

    if (cpIncludeInactive) {
      cpIncludeInactive.addEventListener('change', () => {
        loadReport();
      });
    }

    if (cpExportCsvBtn) {
      cpExportCsvBtn.addEventListener('click', exportCsv);
    }

    if (cpPrintBtn) {
      cpPrintBtn.addEventListener('click', () => window.print());
    }

    setupSorting();

    // Default preset: This Year
    if (cpPresetSelect) {
      cpPresetSelect.value = 'this_year';
      applyPreset('this_year');
    }

    // Lazy load on navigation
    function onPageChange(e) {
      if (e.detail === 'client-profitability') {
        loadReport();
      }
    }
    document.addEventListener('pagechange', onPageChange);

    // Initial check if opened directly
    const pageEl = document.getElementById('page-client-profitability');
    if (pageEl && pageEl.classList.contains('active')) {
      loadReport();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
