// Payments Reconciliation Report Controller
(function () {
  'use strict';

  let currentReport = null;
  let debounceTimeout = null;

  // Elements
  const datePresetSelect = document.getElementById('paymentsDatePreset');
  const startDateInput = document.getElementById('paymentsStartDate');
  const endDateInput = document.getElementById('paymentsEndDate');
  const methodSelect = document.getElementById('paymentsMethodFilter');
  const searchInput = document.getElementById('paymentsSearch');
  const resetBtn = document.getElementById('paymentsResetBtn');
  const exportCsvBtn = document.getElementById('paymentsExportCsvBtn');

  const totalReceivedEl = document.getElementById('paymentsTotalReceived');
  const periodLabelEl = document.getElementById('paymentsPeriodLabel');
  const transactionCountEl = document.getElementById('paymentsTransactionCount');
  const methodsGridEl = document.getElementById('paymentsMethodsGrid');
  const tableBodyEl = document.getElementById('paymentsTableBody');
  const invoicesViewPaymentsBtn = document.getElementById('invoicesViewPaymentsBtn');

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

    if (preset === 'this_month') {
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
      periodLabelEl.textContent = `This month (${startDateInput.value} to ${endDateInput.value})`;
    } else if (preset === 'last_month') {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
      periodLabelEl.textContent = `Last month (${startDateInput.value} to ${endDateInput.value})`;
    } else if (preset === 'this_quarter') {
      const qMonth = Math.floor(month / 3) * 3;
      const start = new Date(year, qMonth, 1);
      const end = new Date(year, qMonth + 3, 0);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
      periodLabelEl.textContent = `This quarter (${startDateInput.value} to ${endDateInput.value})`;
    } else if (preset === 'this_year') {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      startDateInput.value = getISODate(start);
      endDateInput.value = getISODate(end);
      periodLabelEl.textContent = `This year (${year})`;
    } else if (preset === 'all') {
      startDateInput.value = '';
      endDateInput.value = '';
      periodLabelEl.textContent = 'All time';
    } else {
      periodLabelEl.textContent = startDateInput.value || endDateInput.value
        ? `Custom (${startDateInput.value || '…'} to ${endDateInput.value || '…'})`
        : 'All time';
    }
  }

  function getFilterPayload() {
    return {
      startDate: startDateInput.value || '',
      endDate: endDateInput.value || '',
      paymentMethod: methodSelect.value || 'all',
      search: searchInput.value ? searchInput.value.trim() : '',
    };
  }

  async function loadReport() {
    try {
      const filter = getFilterPayload();
      const res = await window.electronAPI.getPaymentsReport(filter);
      if (!res.ok) {
        console.error('Failed to load payments report:', res.errors);
        return;
      }

      currentReport = res.report;
      renderReport(res.report);
    } catch (err) {
      console.error('Error fetching payments report:', err);
    }
  }

  function getMethodSlug(method) {
    if (!method || method === 'Unspecified') return 'unspecified';
    return method.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function renderReport(report) {
    const baseCurrency = report.baseCurrency || 'USD';

    // 1. Total Received
    totalReceivedEl.textContent = window.QuoteCraftUtils.formatCurrency(report.totalReceived, baseCurrency);
    transactionCountEl.textContent = `${report.count} payment${report.count === 1 ? '' : 's'}`;

    // 2. Populate available methods in dropdown if not already populated
    if (report.availableMethods && report.availableMethods.length) {
      const currentSelected = methodSelect.value;
      const existingOptions = Array.from(methodSelect.options).map((o) => o.value);

      report.availableMethods.forEach((m) => {
        if (!existingOptions.includes(m)) {
          const opt = document.createElement('option');
          opt.value = m;
          opt.textContent = m;
          methodSelect.appendChild(opt);
        }
      });
      methodSelect.value = currentSelected;
    }

    // 3. Render Per-Method Subtotals Grid
    methodsGridEl.innerHTML = '';
    if (!report.byMethod || report.byMethod.length === 0) {
      methodsGridEl.innerHTML = '<p class="text-muted" style="grid-column: 1 / -1; font-size: 13px;">No payment methods recorded for this period.</p>';
    } else {
      report.byMethod.forEach((m) => {
        const slug = getMethodSlug(m.method);
        const card = document.createElement('div');
        card.className = 'method-subtotal-card';
        card.style.cursor = 'pointer';
        card.title = `Click to filter by ${m.method}`;

        card.innerHTML = `
          <div class="method-subtotal-header">
            <span class="method-name">
              <span class="badge-method badge-method-${slug}">${escapeHtml(m.method)}</span>
            </span>
            <span class="method-count-badge">${m.count} txn${m.count === 1 ? '' : 's'}</span>
          </div>
          <div class="method-amount">${window.QuoteCraftUtils.formatCurrency(m.totalAmount, baseCurrency)}</div>
          <div class="method-percentage-bar-wrapper">
            <div class="method-percentage-bar" style="width: ${Math.min(100, Math.max(0, m.percentage))}%;"></div>
          </div>
          <div class="method-percentage-text">
            <span>${m.percentage}% of total</span>
            <span>${window.QuoteCraftUtils.formatCurrency(m.totalAmount, baseCurrency)}</span>
          </div>
        `;

        card.addEventListener('click', () => {
          methodSelect.value = m.method;
          loadReport();
        });

        methodsGridEl.appendChild(card);
      });
    }

    // 4. Render Payments Ledger Table
    tableBodyEl.innerHTML = '';
    if (!report.payments || report.payments.length === 0) {
      tableBodyEl.innerHTML = `
        <tr>
          <td colspan="7" class="payments-empty">
            <p>No payments match the selected criteria.</p>
          </td>
        </tr>
      `;
      return;
    }

    report.payments.forEach((p) => {
      const tr = document.createElement('tr');
      const slug = getMethodSlug(p.payment_method);
      const displayMethod = (p.payment_method || '').trim() || 'Unspecified';
      const formattedDate = window.QuoteCraftUtils.formatDate(p.payment_date);

      const isMultiCurrency = p.currency && p.currency !== baseCurrency && Number(p.exchange_rate) !== 1.0;
      const nativeAmountStr = window.QuoteCraftUtils.formatCurrency(p.amount, p.currency || baseCurrency);
      let convertedSub = '';
      if (isMultiCurrency) {
        const converted = Math.round((Number(p.amount) || 0) * Number(p.exchange_rate) * 100) / 100;
        convertedSub = `<span class="payment-amount-original">≈ ${window.QuoteCraftUtils.formatCurrency(converted, baseCurrency)} (${baseCurrency})</span>`;
      }

      tr.innerHTML = `
        <td>${formattedDate}</td>
        <td>
          <a href="#" class="invoice-link" data-invoice-id="${p.invoice_id}">${escapeHtml(p.invoice_number)}</a>
        </td>
        <td>
          <span>${escapeHtml(p.client_name || '—')}</span>
          ${p.client_company ? `<span class="client-meta-company">${escapeHtml(p.client_company)}</span>` : ''}
        </td>
        <td>
          <span class="badge-method badge-method-${slug}">${escapeHtml(displayMethod)}</span>
        </td>
        <td>${escapeHtml(p.reference_number || '—')}</td>
        <td>${escapeHtml(p.notes || '—')}</td>
        <td style="text-align: right;" class="payment-amount-cell">
          ${nativeAmountStr}
          ${convertedSub}
        </td>
      `;

      const link = tr.querySelector('.invoice-link');
      if (link) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          window.QuoteCraftUtils.goToPage('invoices');
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: p.invoice_id }));
          }, 60);
        });
      }

      tableBodyEl.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function exportCsv() {
    if (!currentReport || !currentReport.payments || currentReport.payments.length === 0) {
      window.QuoteCraftUtils.showToast('No payments data available to export.', 'warning');
      return;
    }

    const headers = [
      'Date',
      'Invoice Number',
      'Client',
      'Company',
      'Payment Method',
      'Reference Number',
      'Notes',
      'Amount',
      'Currency',
      'Exchange Rate',
      'Base Currency Amount',
    ];

    const rows = currentReport.payments.map((p) => {
      const rate = Number(p.exchange_rate) || 1.0;
      const baseAmount = Math.round((Number(p.amount) || 0) * rate * 100) / 100;
      return [
        p.payment_date || '',
        p.invoice_number || '',
        p.client_name || '',
        p.client_company || '',
        p.payment_method || 'Unspecified',
        p.reference_number || '',
        p.notes || '',
        Number(p.amount || 0).toFixed(2),
        p.currency || currentReport.baseCurrency,
        rate.toFixed(4),
        baseAmount.toFixed(2),
      ].map((val) => `"${String(val).replace(/"/g, '""')}"`);
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = getISODate(new Date());
    a.href = url;
    a.download = `payments-reconciliation-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.QuoteCraftUtils.showToast('Payments CSV exported successfully.', 'success');
  }

  // Event Listeners
  datePresetSelect.addEventListener('change', () => {
    applyPreset(datePresetSelect.value);
    loadReport();
  });

  startDateInput.addEventListener('change', () => {
    datePresetSelect.value = 'custom';
    applyPreset('custom');
    loadReport();
  });

  endDateInput.addEventListener('change', () => {
    datePresetSelect.value = 'custom';
    applyPreset('custom');
    loadReport();
  });

  methodSelect.addEventListener('change', () => {
    loadReport();
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      loadReport();
    }, 250);
  });

  resetBtn.addEventListener('click', () => {
    datePresetSelect.value = 'all';
    startDateInput.value = '';
    endDateInput.value = '';
    methodSelect.value = 'all';
    searchInput.value = '';
    applyPreset('all');
    loadReport();
  });

  exportCsvBtn.addEventListener('click', exportCsv);

  if (invoicesViewPaymentsBtn) {
    invoicesViewPaymentsBtn.addEventListener('click', () => {
      window.QuoteCraftUtils.goToPage('payments');
    });
  }

  document.addEventListener('pagechange', (e) => {
    if (e.detail === 'payments') {
      loadReport();
    }
  });

  // Initial setup
  applyPreset('all');
})();
