// Profit & Loss Report Controller
(function () {
  'use strict';

  let currentReport = null;
  let activeBasis = 'cash'; // 'cash' or 'accrual'

  // DOM Elements
  const datePresetSelect = document.getElementById('plDatePreset');
  const startDateInput = document.getElementById('plStartDate');
  const endDateInput = document.getElementById('plEndDate');
  const resetBtn = document.getElementById('plResetBtn');
  const exportCsvBtn = document.getElementById('plExportCsvBtn');
  const printBtn = document.getElementById('plPrintBtn');

  // Basis Controls
  const basisCashBtn = document.getElementById('plBasisCashBtn');
  const basisAccrualBtn = document.getElementById('plBasisAccrualBtn');
  const basisExplainerEl = document.getElementById('plBasisExplainer');
  const basisExplainerText = document.getElementById('plBasisExplainerText');
  const varianceBadgeEl = document.getElementById('plVarianceBadge');

  // KPIs
  const totalIncomeEl = document.getElementById('plTotalIncome');
  const totalIncomeBadge = document.getElementById('plTotalIncomeBadge');
  const totalIncomeSub = document.getElementById('plTotalIncomeSub');
  const totalExpensesEl = document.getElementById('plTotalExpenses');
  const totalExpensesSub = document.getElementById('plTotalExpensesSub');
  const netProfitCard = document.getElementById('plNetProfitCard');
  const netProfitEl = document.getElementById('plNetProfit');
  const netProfitSub = document.getElementById('plNetProfitSub');
  const varianceCard = document.getElementById('plVarianceCard');
  const varianceEl = document.getElementById('plVarianceValue');
  const varianceSub = document.getElementById('plVarianceSub');

  // Table
  const thActiveIncome = document.getElementById('plThActiveIncome');
  const tableBodyEl = document.getElementById('plTableBody');
  const tfInvoiced = document.getElementById('plTfInvoiced');
  const tfPaid = document.getElementById('plTfPaid');
  const tfActiveIncome = document.getElementById('plTfActiveIncome');
  const tfExpenses = document.getElementById('plTfExpenses');
  const tfNetProfit = document.getElementById('plTfNetProfit');
  const tfMargin = document.getElementById('plTfMargin');
  const tfRunning = document.getElementById('plTfRunning');
  const emptyStateEl = document.getElementById('plEmptyState');
  const tableWrapperEl = document.getElementById('plTableWrapper');

  function getISODate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function applyPreset(preset) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (preset === 'this_year') {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
    } else if (preset === 'last_year') {
      const start = new Date(year - 1, 0, 1);
      const end = new Date(year - 1, 11, 31);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
    } else if (preset === 'last_12_months') {
      const start = new Date(year, month - 11, 1);
      const end = new Date(year, month + 1, 0);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
    } else if (preset === 'this_quarter') {
      const qMonth = Math.floor(month / 3) * 3;
      const start = new Date(year, qMonth, 1);
      const end = new Date(year, qMonth + 3, 0);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
    } else if (preset === 'this_month') {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
    } else if (preset === 'last_month') {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
    } else if (preset === 'all') {
      startDateInput.value = '';
      endDateInput.value = '';
    }
  }

  function setBasis(newBasis) {
    if (newBasis !== 'cash' && newBasis !== 'accrual') return;
    activeBasis = newBasis;

    basisCashBtn.classList.toggle('active', activeBasis === 'cash');
    basisAccrualBtn.classList.toggle('active', activeBasis === 'accrual');

    loadReport();
  }

  function getFilterPayload() {
    return {
      startDate: startDateInput.value ? startDateInput.value.trim() : '',
      endDate: endDateInput.value ? endDateInput.value.trim() : '',
      basis: activeBasis,
    };
  }

  async function loadReport() {
    try {
      const filter = getFilterPayload();
      const res = await window.electronAPI.getProfitLossReport(filter);
      if (!res.ok) {
        console.error('Failed to load profit & loss report:', res.errors);
        return;
      }

      currentReport = res.report;
      renderReport(res.report);
    } catch (err) {
      console.error('Error fetching profit & loss report:', err);
    }
  }

  function formatMoney(amount, currency) {
    return window.QuoteCraftUtils.formatCurrency(amount, currency || (currentReport && currentReport.baseCurrency) || 'USD');
  }

  function renderReport(report) {
    const currency = report.baseCurrency || 'USD';
    const isAccrual = report.basis === 'accrual';

    // 1. Basis Explainer banner
    if (isAccrual) {
      basisExplainerEl.className = 'pl-basis-explainer accrual-mode';
      basisExplainerText.innerHTML = `
        <strong>Accrual Basis Active:</strong> Income is recognized when an invoice is issued to a client, regardless of when payment is collected. 
        Profit = <strong>Invoiced Total (${formatMoney(report.totalInvoiced, currency)})</strong> − Expenses (${formatMoney(report.totalExpenses, currency)}) = <strong>${formatMoney(report.netProfit, currency)}</strong>. 
        Best for evaluating overall sales performance.
      `;
    } else {
      basisExplainerEl.className = 'pl-basis-explainer';
      basisExplainerText.innerHTML = `
        <strong>Cash Basis Active:</strong> Income is recognized only when actual payment is received into your account. 
        Profit = <strong>Collected Payments (${formatMoney(report.totalPaid, currency)})</strong> − Expenses (${formatMoney(report.totalExpenses, currency)}) = <strong>${formatMoney(report.netProfit, currency)}</strong>. 
        Best for real-time cash flow management.
      `;
    }

    // Variance badge in explainer
    const diff = report.variance || 0;
    if (Math.abs(diff) > 0.01) {
      varianceBadgeEl.innerHTML = `
        <span>Difference (uncollected invoiced revenue): <strong>${formatMoney(diff, currency)}</strong> (Invoiced ${formatMoney(report.totalInvoiced, currency)} vs Paid ${formatMoney(report.totalPaid, currency)})</span>
      `;
      varianceBadgeEl.style.display = 'inline-flex';
    } else {
      varianceBadgeEl.innerHTML = `
        <span>All invoiced revenue has been collected (100% collection rate).</span>
      `;
      varianceBadgeEl.style.display = 'inline-flex';
    }

    // 2. Summary KPIs
    totalIncomeEl.textContent = formatMoney(report.totalIncome, currency);
    if (isAccrual) {
      totalIncomeBadge.textContent = 'Accrual (Invoiced)';
      totalIncomeBadge.className = 'pl-kpi-badge accrual';
      totalIncomeSub.textContent = `Actual cash collected: ${formatMoney(report.totalPaid, currency)}`;
    } else {
      totalIncomeBadge.textContent = 'Cash (Paid)';
      totalIncomeBadge.className = 'pl-kpi-badge cash';
      totalIncomeSub.textContent = `Total billed to clients: ${formatMoney(report.totalInvoiced, currency)}`;
    }

    totalExpensesEl.textContent = formatMoney(report.totalExpenses, currency);
    const expCount = (report.months || []).reduce((acc, m) => acc + (m.expensesCount || 0), 0);
    totalExpensesSub.textContent = `${expCount} expense item${expCount === 1 ? '' : 's'} recorded`;

    netProfitEl.textContent = formatMoney(report.netProfit, currency);
    const isPosProfit = report.netProfit >= 0;
    netProfitEl.className = 'kpi-value ' + (isPosProfit ? 'profit-positive' : 'profit-negative');
    netProfitCard.className = 'pl-kpi-card profit-card ' + (isPosProfit ? '' : 'loss');
    netProfitSub.textContent = `${report.profitMargin}% profit margin on ${isAccrual ? 'invoiced' : 'collected'} revenue`;

    varianceEl.textContent = formatMoney(report.variance, currency);
    varianceSub.textContent = report.variance > 0
      ? `Billed but not yet collected`
      : `Paid exceeds newly invoiced`;

    // 3. Table column header
    thActiveIncome.textContent = isAccrual ? 'Active Income (Invoiced)' : 'Active Income (Paid)';

    // 4. Render Table Rows
    const months = report.months || [];
    if (!months.length) {
      tableWrapperEl.style.display = 'none';
      emptyStateEl.style.display = 'block';
      return;
    }

    tableWrapperEl.style.display = 'block';
    emptyStateEl.style.display = 'none';

    tableBodyEl.innerHTML = '';
    for (const row of months) {
      const tr = document.createElement('tr');

      const isRowProfitPos = row.activeProfit >= 0;
      const isRunProfitPos = row.activeRunningProfit >= 0;

      // Calculate mini visual bar (income vs expense proportion)
      const inc = row.activeIncome || 0;
      const exp = row.expenses || 0;
      const sum = inc + exp;
      const incPercent = sum > 0 ? Math.min(100, Math.max(0, Math.round((inc / sum) * 100))) : 50;

      let marginPillClass = 'neutral';
      if (row.margin > 0) marginPillClass = 'positive';
      else if (row.margin < 0) marginPillClass = 'negative';

      tr.innerHTML = `
        <td class="col-month">${row.fullMonthLabel || row.monthLabel}</td>
        <td class="col-num">${formatMoney(row.invoiced, currency)}</td>
        <td class="col-num">${formatMoney(row.paid, currency)}</td>
        <td class="col-num col-active-income">${formatMoney(row.activeIncome, currency)}</td>
        <td class="col-num expense-value">${formatMoney(row.expenses, currency)}</td>
        <td class="col-num ${isRowProfitPos ? 'profit-positive' : 'profit-negative'}" style="font-weight:600;">
          ${row.activeProfit > 0 ? '+' : ''}${formatMoney(row.activeProfit, currency)}
        </td>
        <td class="col-num">
          <span class="pl-margin-pill ${marginPillClass}">${row.margin}%</span>
        </td>
        <td class="col-num col-running ${isRunProfitPos ? 'profit-positive' : 'profit-negative'}">
          ${row.activeRunningProfit > 0 ? '+' : ''}${formatMoney(row.activeRunningProfit, currency)}
        </td>
        <td class="pl-balance-bar-cell">
          <div class="pl-balance-track" title="Income: ${formatMoney(inc, currency)} | Expenses: ${formatMoney(exp, currency)}">
            <div class="pl-balance-fill" style="width: ${incPercent}%;"></div>
          </div>
        </td>
      `;

      tableBodyEl.appendChild(tr);
    }

    // 5. Table Footer Totals
    tfInvoiced.textContent = formatMoney(report.totalInvoiced, currency);
    tfPaid.textContent = formatMoney(report.totalPaid, currency);
    tfActiveIncome.textContent = formatMoney(report.totalIncome, currency);
    tfExpenses.textContent = formatMoney(report.totalExpenses, currency);

    const isTotalProfitPos = report.netProfit >= 0;
    tfNetProfit.textContent = (report.netProfit > 0 ? '+' : '') + formatMoney(report.netProfit, currency);
    tfNetProfit.className = 'col-num ' + (isTotalProfitPos ? 'profit-positive' : 'profit-negative');

    tfMargin.innerHTML = `<span class="pl-margin-pill ${report.profitMargin >= 0 ? 'positive' : 'negative'}">${report.profitMargin}%</span>`;
    tfRunning.textContent = (report.netProfit > 0 ? '+' : '') + formatMoney(report.netProfit, currency);
    tfRunning.className = 'col-num col-running ' + (isTotalProfitPos ? 'profit-positive' : 'profit-negative');
  }

  function exportCsv() {
    if (!currentReport || !currentReport.months || !currentReport.months.length) {
      alert('No data available to export.');
      return;
    }

    const report = currentReport;
    const isAccrual = report.basis === 'accrual';
    const currency = report.baseCurrency || 'USD';

    const headers = [
      'Month',
      'Invoiced Amount (' + currency + ')',
      'Invoices Count',
      'Paid Amount (' + currency + ')',
      'Payments Count',
      'Basis Used',
      'Active Income (' + currency + ')',
      'Expenses (' + currency + ')',
      'Expenses Count',
      'Monthly Net Profit (' + currency + ')',
      'Profit Margin (%)',
      'Running Cumulative Profit (' + currency + ')',
    ];

    const rows = report.months.map((m) => [
      `"${m.fullMonthLabel || m.monthLabel}"`,
      (Number(m.invoiced) || 0).toFixed(2),
      m.invoicesCount || 0,
      (Number(m.paid) || 0).toFixed(2),
      m.paymentsCount || 0,
      `"${isAccrual ? 'Accrual (Invoiced)' : 'Cash (Paid)'}"`,
      (Number(m.activeIncome) || 0).toFixed(2),
      (Number(m.expenses) || 0).toFixed(2),
      m.expensesCount || 0,
      (Number(m.activeProfit) || 0).toFixed(2),
      m.margin || 0,
      (Number(m.activeRunningProfit) || 0).toFixed(2),
    ]);

    // Summary line
    rows.push([
      '"TOTAL / SUMMARY"',
      (Number(report.totalInvoiced) || 0).toFixed(2),
      '',
      (Number(report.totalPaid) || 0).toFixed(2),
      '',
      `"${isAccrual ? 'Accrual' : 'Cash'}"`,
      (Number(report.totalIncome) || 0).toFixed(2),
      (Number(report.totalExpenses) || 0).toFixed(2),
      '',
      (Number(report.netProfit) || 0).toFixed(2),
      report.profitMargin,
      (Number(report.netProfit) || 0).toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `QuoteCraft_Profit_Loss_${isAccrual ? 'Accrual' : 'Cash'}_${report.startDate}_to_${report.endDate}.csv`;

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Event Listeners
  if (datePresetSelect) {
    datePresetSelect.addEventListener('change', () => {
      applyPreset(datePresetSelect.value);
      loadReport();
    });
  }

  if (startDateInput) {
    startDateInput.addEventListener('change', () => {
      datePresetSelect.value = 'custom';
      loadReport();
    });
  }

  if (endDateInput) {
    endDateInput.addEventListener('change', () => {
      datePresetSelect.value = 'custom';
      loadReport();
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      datePresetSelect.value = 'this_year';
      applyPreset('this_year');
      loadReport();
    });
  }

  if (basisCashBtn) {
    basisCashBtn.addEventListener('click', () => setBasis('cash'));
  }

  if (basisAccrualBtn) {
    basisAccrualBtn.addEventListener('click', () => setBasis('accrual'));
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', exportCsv);
  }

  const plExportPdfBtn = document.getElementById('plExportPdfBtn');
  if (plExportPdfBtn) {
    plExportPdfBtn.addEventListener('click', async () => {
      try {
        const filter = getFilterPayload();
        await window.electronAPI.exportProfitLossPdf(filter);
      } catch (err) {
        console.error('Failed to export profit & loss PDF:', err);
      }
    });
  }

  if (printBtn) {
    printBtn.addEventListener('click', () => window.print());
  }

  // Refresh on page navigation
  document.addEventListener('pagechange', (e) => {
    if (e.detail === 'profit-loss') {
      loadReport();
    }
  });

  // Initial preset
  applyPreset('this_year');

  const plChipBar = document.getElementById('plChipBar');
  if (plChipBar && datePresetSelect && window.QuoteCraftUtils && window.QuoteCraftUtils.initDateChips) {
    window.QuoteCraftUtils.initDateChips(plChipBar, datePresetSelect);
  }
})();
