(function () {
  const section = document.getElementById('page-invoices');
  if (!section) return;

  const listView = document.getElementById('invoiceListView');
  const detailView = document.getElementById('invoiceDetailView');
  const invoiceListEl = document.getElementById('invoiceList');
  const invoiceSearch = document.getElementById('invoiceSearch');
  const invoiceStatusFilter = document.getElementById('invoiceStatusFilter');
  const invoicesExportCsvBtn = document.getElementById('invoicesExportCsvBtn');

  const invoiceBulkBar = document.getElementById('invoiceBulkBar');
  const invoiceBulkCount = document.getElementById('invoiceBulkCount');
  const invoiceBulkMarkSentBtn = document.getElementById('invoiceBulkMarkSentBtn');
  const invoiceBulkExportPdfBtn = document.getElementById('invoiceBulkExportPdfBtn');
  const invoiceBulkClearBtn = document.getElementById('invoiceBulkClearBtn');

  const invoiceBackBtn = document.getElementById('invoiceBackBtn');
  const invoiceExportBtn = document.getElementById('invoiceExportBtn');
  const invoicePrintBtn = document.getElementById('invoicePrintBtn');
  const invoiceSendEmailBtn = document.getElementById('invoiceSendEmailBtn');
  const invoiceRecurringBtn = document.getElementById('invoiceRecurringBtn');
  const invoiceRecordPaymentBtn = document.getElementById('invoiceRecordPaymentBtn');
  const invoiceDetailStatusSelect = document.getElementById('invoiceDetailStatusSelect');
  const invoiceIssueCreditBtn = document.getElementById('invoiceIssueCreditBtn');
  const invoiceDuplicateBtn = document.getElementById('invoiceDuplicateBtn');

  const creditNoteModal = document.getElementById('creditNoteModal');
  const creditNoteForm = document.getElementById('creditNoteForm');
  const creditNotePaidDisplay = document.getElementById('creditNotePaidDisplay');
  const creditNoteAmountInput = document.getElementById('creditNoteAmount');
  const creditNoteReasonInput = document.getElementById('creditNoteReason');
  const invoiceCreditNotesList = document.getElementById('invoiceCreditNotesList');

  const invoiceRecurringCard = document.getElementById('invoiceRecurringCard');
  const recurringStatusBadge = document.getElementById('recurringStatusBadge');
  const recurringFrequencyDisplay = document.getElementById('recurringFrequencyDisplay');
  const recurringNextDateDisplay = document.getElementById('recurringNextDateDisplay');
  const recurringEndDateDisplay = document.getElementById('recurringEndDateDisplay');
  const recurringTriggerBtn = document.getElementById('recurringTriggerBtn');
  const recurringPauseBtn = document.getElementById('recurringPauseBtn');
  const recurringCancelBtn = document.getElementById('recurringCancelBtn');
  const recurringInvoicesList = document.getElementById('recurringInvoicesList');

  // Deposit / Final invoice card elements
  const invoiceDepositCard = document.getElementById('invoiceDepositCard');
  const invoiceDepositCardTitle = document.getElementById('invoiceDepositCardTitle');
  const invoiceDepositTypeBadge = document.getElementById('invoiceDepositTypeBadge');
  const depositQuoteField = document.getElementById('depositQuoteField');
  const depositQuoteDisplay = document.getElementById('depositQuoteDisplay');
  const depositOriginalTotalField = document.getElementById('depositOriginalTotalField');
  const depositOriginalTotalDisplay = document.getElementById('depositOriginalTotalDisplay');
  const depositAmountField = document.getElementById('depositAmountField');
  const depositAmountDisplay = document.getElementById('depositAmountDisplay');
  const depositRemainderField = document.getElementById('depositRemainderField');
  const depositRemainderDisplay = document.getElementById('depositRemainderDisplay');
  const generateFinalInvoiceBtn = document.getElementById('generateFinalInvoiceBtn');
  const linkedFinalInvoiceBanner = document.getElementById('linkedFinalInvoiceBanner');
  const linkedDepositInvoiceBanner = document.getElementById('linkedDepositInvoiceBanner');

  const recurringModal = document.getElementById('recurringModal');
  const recurringForm = document.getElementById('recurringForm');
  const recurringFrequencySelect = document.getElementById('recurringFrequency');
  const recurringNextDateInput = document.getElementById('recurringNextDate');
  const recurringEndDateInput = document.getElementById('recurringEndDate');
  const invoicesRecurringBanner = document.getElementById('invoicesRecurringBanner');

  const paymentModal = document.getElementById('paymentModal');
  const paymentForm = document.getElementById('paymentForm');
  const paymentModalTitle = document.getElementById('paymentModalTitle');
  const paymentBalanceDisplay = document.getElementById('paymentBalanceDisplay');
  const paymentAmountInput = document.getElementById('paymentAmount');
  const paymentDateInput = document.getElementById('paymentDate');
  const paymentMethodSelect = document.getElementById('paymentMethod');
  const paymentReferenceInput = document.getElementById('paymentReference');
  const paymentNotesInput = document.getElementById('paymentNotes');

  let currentRecurringProfile = null;

  let invoices = [];
  let currencyCode = 'USD';
  let currentInvoiceId = null;
  let currentInvoiceCurrency = 'USD';
  let searchTerm = '';
  let statusFilter = 'all';
  const selectedInvoiceIds = new Set();

  function toast(message, type) {
    window.QuoteCraftUtils.showToast(message, type);
  }

  // ---------- View switching ----------
  function showList() {
    listView.classList.add('active');
    detailView.classList.remove('active');
  }

  function showDetail() {
    listView.classList.remove('active');
    detailView.classList.add('active');
  }

  // ---------- Status helpers ----------
  function formatInvoiceStatus(status) {
    const map = {
      draft: 'Draft',
      sent: 'Sent',
      partially_paid: 'Partially paid',
      paid: 'Paid',
      overdue: 'Overdue',
    };
    return map[status] || status;
  }

  // Overdue is calculated, not stored: past due date with a balance still owed.
  function effectiveInvoiceStatus(inv) {
    if (Number(inv.balance_due) <= 0.0001) return 'paid';
    if (inv.date_due) {
      const due = new Date(inv.date_due + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (due < today) return 'overdue';
    }
    return inv.status || 'draft';
  }

  function clientDisplayName(client) {
    if (!client) return '—';
    return client.company_name ? `${client.name} (${client.company_name})` : client.name;
  }

  function money(amount, customCurrency) {
    return window.QuoteCraftUtils.formatCurrency(amount, customCurrency || currencyCode);
  }

  function renderInvoiceTaxBreakdown(containerEl, lineItems, subtotal, discountAmount, customCurrency) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    const curr = customCurrency || currencyCode;

    const subtotalCents = Math.round((Number(subtotal) || 0) * 100);
    const docDiscCents = Math.round((Number(discountAmount) || 0) * 100);
    const ratio = subtotalCents > 0 ? (subtotalCents - docDiscCents) / subtotalCents : 1;

    const brackets = new Map();
    for (const item of (lineItems || [])) {
      const rate = Number(item.tax_rate) || 0;
      const amountCents = Math.round((Number(item.amount) || 0) * 100);
      if (!brackets.has(rate)) {
        brackets.set(rate, { rate, netCents: 0 });
      }
      brackets.get(rate).netCents += amountCents;
    }

    const list = [];
    let totalTaxCents = 0;
    const sortedRates = Array.from(brackets.keys()).sort((a, b) => a - b);
    for (const rate of sortedRates) {
      const b = brackets.get(rate);
      const taxableBasisCents = Math.round(b.netCents * ratio);
      const taxCents = rate > 0 ? Math.round(taxableBasisCents * rate / 100) : 0;
      totalTaxCents += taxCents;
      list.push({
        rate,
        netCents: b.netCents,
        taxableBasisCents,
        taxCents,
      });
    }

    if (list.length === 0) {
      const row = document.createElement('div');
      row.className = 'tax-breakdown-row';
      row.innerHTML = `<span class="tax-label">Tax</span><span class="tax-val">${money(0, curr)}</span>`;
      containerEl.appendChild(row);
      return;
    }

    if (list.length === 1 && list[0].rate === 0) {
      const basisStr = money(list[0].taxableBasisCents / 100, curr);
      const row = document.createElement('div');
      row.className = 'tax-breakdown-row';
      row.innerHTML = `<span class="tax-label">Tax-exempt (0% on ${basisStr})</span><span class="tax-val">${money(0, curr)}</span>`;
      containerEl.appendChild(row);
      return;
    }

    for (const item of list) {
      const row = document.createElement('div');
      row.className = 'tax-breakdown-row';
      const basisStr = money(item.taxableBasisCents / 100, curr);
      const taxStr = money(item.taxCents / 100, curr);
      if (item.rate === 0) {
        row.innerHTML = `<span class="tax-label">Tax-exempt (0% on ${basisStr})</span><span class="tax-val">${taxStr}</span>`;
      } else {
        row.innerHTML = `<span class="tax-label">Tax (${item.rate}% on ${basisStr})</span><span class="tax-val">${taxStr}</span>`;
      }
      containerEl.appendChild(row);
    }

    if (list.length > 1) {
      const totalRow = document.createElement('div');
      totalRow.className = 'tax-breakdown-row';
      totalRow.style.fontWeight = '600';
      totalRow.style.borderTop = '1px dashed var(--border)';
      totalRow.style.paddingTop = '4px';
      totalRow.style.marginTop = '2px';
      totalRow.innerHTML = `<span class="tax-label">Total Tax</span><span class="tax-val">${money(totalTaxCents / 100, curr)}</span>`;
      containerEl.appendChild(totalRow);
    }
  }

  // ---------- List ----------
  function statusBadge(status) {
    const s = document.createElement('span');
    s.className = 'badge status-' + status;
    s.textContent = formatInvoiceStatus(status);
    return s;
  }

  function filterInvoices() {
    let filtered = invoices.slice();
    const q = searchTerm.trim().toLowerCase();
    if (q || statusFilter !== 'all') {
      filtered = filtered.filter((inv) => {
        if (q) {
          const hay = `${inv.invoice_number || ''} ${clientDisplayName(inv.client)}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (statusFilter !== 'all' && effectiveInvoiceStatus(inv) !== statusFilter) return false;
        return true;
      });
    }
    return filtered;
  }

  function renderList() {
    const filtered = filterInvoices();

    if (filtered.length === 0) {
      if (invoices.length === 0) {
        invoiceListEl.innerHTML = window.QuoteCraftUtils.emptyStateHTML({
          icon: 'invoices',
          title: 'No invoices yet',
          message: 'Invoices are created from accepted quotes. Convert an accepted quote to get started.',
          actionLabel: 'Go to Quotes',
        });
        const action = invoiceListEl.querySelector('[data-empty-action]');
        if (action) {
          action.addEventListener('click', () => window.QuoteCraftUtils.goToPage('quotes'));
        }
      } else {
        invoiceListEl.innerHTML = window.QuoteCraftUtils.emptyStateHTML({
          icon: 'search',
          title: 'No matching invoices',
          message: 'Nothing matches your search or status filter. Try different terms or clear the filters.',
          actionLabel: 'Clear filters',
        });
        const action = invoiceListEl.querySelector('[data-empty-action]');
        if (action) {
          action.addEventListener('click', () => {
            invoiceSearch.value = '';
            searchTerm = '';
            invoiceStatusFilter.value = 'all';
            statusFilter = 'all';
            renderList();
          });
        }
      }
      return;
    }

    const table = document.createElement('table');
    table.className = 'data-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr>' +
      '<th class="th-select"><input type="checkbox" id="invoiceSelectAll" title="Select all invoices"></th>' +
      '<th>Number</th>' +
      '<th>Client</th>' +
      '<th>Date</th>' +
      '<th>Due date</th>' +
      '<th>Total</th>' +
      '<th>Paid</th>' +
      '<th>Balance</th>' +
      '<th>Status</th>' +
      '<th class="th-actions">Actions</th>' +
      '</tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const inv of filtered) {
      const tr = document.createElement('tr');

      const selectTd = document.createElement('td');
      selectTd.className = 'cell-select';
      const rowCheckbox = document.createElement('input');
      rowCheckbox.type = 'checkbox';
      rowCheckbox.className = 'invoice-row-check';
      rowCheckbox.checked = selectedInvoiceIds.has(inv.id);
      rowCheckbox.addEventListener('change', () => {
        if (rowCheckbox.checked) {
          selectedInvoiceIds.add(inv.id);
        } else {
          selectedInvoiceIds.delete(inv.id);
        }
        updateBulkBar();
        syncSelectAll();
      });
      selectTd.appendChild(rowCheckbox);

      const numTd = document.createElement('td');
      numTd.className = 'cell-name';
      numTd.textContent = inv.invoice_number;
      if (inv.invoice_type === 'deposit') {
        const depBadge = document.createElement('span');
        depBadge.className = 'badge badge-deposit';
        depBadge.textContent = `Deposit (${inv.deposit_percent || 0}%)`;
        depBadge.style.marginLeft = '6px';
        numTd.appendChild(depBadge);
      } else if (inv.invoice_type === 'final') {
        const finBadge = document.createElement('span');
        finBadge.className = 'badge badge-final';
        finBadge.textContent = 'Final Balance';
        finBadge.style.marginLeft = '6px';
        numTd.appendChild(finBadge);
      }

      const clientTd = document.createElement('td');
      clientTd.textContent = clientDisplayName(inv.client);

      const dateTd = document.createElement('td');
      dateTd.className = 'cell-date';
      dateTd.textContent = window.QuoteCraftUtils.formatDate(inv.date_created);

      const dueTd = document.createElement('td');
      dueTd.className = 'cell-date';
      dueTd.textContent = window.QuoteCraftUtils.formatDate(inv.date_due);

      const invCurr = inv.currency || currencyCode;
      const totalTd = document.createElement('td');
      totalTd.textContent = money(inv.total, invCurr);

      const paidTd = document.createElement('td');
      paidTd.textContent = money(inv.amount_paid, invCurr);

      const balanceTd = document.createElement('td');
      balanceTd.className = 'cell-balance';
      balanceTd.textContent = money(inv.balance_due, invCurr);

      const statusTd = document.createElement('td');
      statusTd.appendChild(statusBadge(effectiveInvoiceStatus(inv)));

      const actionsTd = document.createElement('td');
      actionsTd.className = 'cell-actions';
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn btn-small btn-secondary';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', () => openDetail(inv.id));
      const dupBtn = document.createElement('button');
      dupBtn.type = 'button';
      dupBtn.className = 'btn btn-small btn-secondary';
      dupBtn.textContent = 'Duplicate';
      dupBtn.addEventListener('click', () => runDuplicateInvoice(inv.id, false));
      const payBtn = document.createElement('button');
      payBtn.type = 'button';
      payBtn.className = 'btn btn-small btn-secondary';
      payBtn.textContent = 'Record Payment';
      payBtn.addEventListener('click', () => openPaymentModal(inv.id));
      actionsTd.appendChild(viewBtn);
      actionsTd.appendChild(dupBtn);
      actionsTd.appendChild(payBtn);

      tr.appendChild(selectTd);
      tr.appendChild(numTd);
      tr.appendChild(clientTd);
      tr.appendChild(dateTd);
      tr.appendChild(dueTd);
      tr.appendChild(totalTd);
      tr.appendChild(paidTd);
      tr.appendChild(balanceTd);
      tr.appendChild(statusTd);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    invoiceListEl.innerHTML = '';
    invoiceListEl.appendChild(table);

    const selectAll = document.getElementById('invoiceSelectAll');
    if (selectAll) {
      selectAll.addEventListener('change', () => {
        if (selectAll.checked) {
          filtered.forEach((inv) => selectedInvoiceIds.add(inv.id));
        } else {
          filtered.forEach((inv) => selectedInvoiceIds.delete(inv.id));
        }
        renderList();
      });
    }
    syncSelectAll();
    updateBulkBar();
  }

  function syncSelectAll() {
    const filtered = filterInvoices();
    const selectAll = document.getElementById('invoiceSelectAll');
    if (!selectAll) return;
    if (filtered.length === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
      return;
    }
    const allSelected = filtered.every((inv) => selectedInvoiceIds.has(inv.id));
    const someSelected = filtered.some((inv) => selectedInvoiceIds.has(inv.id));
    selectAll.checked = allSelected;
    selectAll.indeterminate = someSelected && !allSelected;
  }

  function updateBulkBar() {
    const count = selectedInvoiceIds.size;
    if (invoiceBulkBar) {
      invoiceBulkBar.classList.toggle('hidden', count === 0);
    }
    if (invoiceBulkCount) {
      invoiceBulkCount.textContent = count === 1 ? '1 selected' : `${count} selected`;
    }
    const disabled = count === 0;
    if (invoiceBulkMarkSentBtn) invoiceBulkMarkSentBtn.disabled = disabled;
    if (invoiceBulkExportPdfBtn) invoiceBulkExportPdfBtn.disabled = disabled;
  }

  async function handleBulkMarkSent() {
    const ids = Array.from(selectedInvoiceIds);
    if (ids.length === 0) return;
    try {
      const res = await window.electronAPI.markInvoicesSentBatch(ids);
      if (res.ok) {
        const skipped = (res.skipped || []).length;
        const msg = skipped > 0
          ? `${res.marked} marked as sent, ${skipped} skipped (only Drafts are promoted).`
          : `${res.marked} invoice${res.marked === 1 ? '' : 's'} marked as sent.`;
        toast(msg, res.marked > 0 ? 'success' : 'warning');
        selectedInvoiceIds.clear();
        await loadInvoices();
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not update statuses.', 'error');
      }
    } catch (e) {
      toast('Could not update statuses: ' + e.message, 'error');
    }
  }

  async function handleBulkExportPdfs() {
    const ids = Array.from(selectedInvoiceIds);
    if (ids.length === 0) return;
    window.QuoteCraftUtils.showBusy('Generating PDFs…');
    try {
      const res = await window.electronAPI.exportInvoicesPdfBatch(ids);
      if (res.ok && res.cancelled) return;
      if (res.ok) {
        toast(`Exported ${res.savedCount} of ${ids.length} PDFs to ${res.folder}`, 'success');
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not export PDFs.', 'error');
      }
    } catch (e) {
      toast('Could not export PDFs: ' + e.message, 'error');
    } finally {
      window.QuoteCraftUtils.hideBusy();
    }
  }

  function exportInvoicesCsv() {
    const filtered = filterInvoices();
    if (filtered.length === 0) {
      toast('No invoices available to export.', 'warning');
      return;
    }

    const headers = ['Number', 'Client', 'Date', 'Due Date', 'Total', 'Paid', 'Balance', 'Status', 'Currency'];
    const rows = filtered.map((inv) => [
      inv.invoice_number || '',
      clientDisplayName(inv.client),
      inv.date_created || '',
      inv.date_due || '',
      Number(inv.total || 0).toFixed(2),
      Number(inv.amount_paid || 0).toFixed(2),
      Number(inv.balance_due || 0).toFixed(2),
      formatInvoiceStatus(effectiveInvoiceStatus(inv)),
      inv.currency || currencyCode,
    ]);

    window.QuoteCraftUtils.downloadCSV(`invoices-${new Date().toISOString().slice(0, 10)}.csv`, [headers].concat(rows));
    toast('Invoices CSV exported successfully.', 'success');
  }

  async function loadInvoices() {
    try {
      const res = await window.electronAPI.listInvoices();
      if (res.ok) {
        invoices = res.invoices || [];
        renderList();
        if (window.QuoteCraftUtils && window.QuoteCraftUtils.refreshSidebarBadges) {
          window.QuoteCraftUtils.refreshSidebarBadges();
        }
      } else {
        toast('Could not load invoices.', 'error');
      }
    } catch (e) {
      toast('Could not load invoices: ' + e.message, 'error');
    }
  }

  // ---------- Detail ----------
  async function runDuplicateInvoice(id, openAfter) {
    try {
      const res = await window.electronAPI.duplicateInvoice(id);
      if (res.ok) {
        toast('Duplicate created: ' + res.invoice.invoice_number, 'success');
        await loadInvoices();
        if (openAfter) openDetail(res.invoice.id);
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not duplicate invoice.', 'error');
      }
    } catch (e) {
      toast('Could not duplicate invoice: ' + e.message, 'error');
    }
  }

  async function openDetail(id) {
    currentInvoiceId = id;
    try {
      const res = await window.electronAPI.getInvoice(id);
      if (!res.ok) {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not load invoice.', 'error');
        return;
      }
      renderDetail(res.invoice);
      showDetail();
    } catch (e) {
      toast('Could not load invoice: ' + e.message, 'error');
    }
  }

  function renderDetail(inv) {
    document.getElementById('invoiceDetailNumber').textContent = inv.invoice_number;
    const eff = effectiveInvoiceStatus(inv);

    if (window.QuoteCraftAttachments) {
      window.QuoteCraftAttachments.mount(document.getElementById('invoiceAttachmentsPanel'), {
        entityType: 'invoice',
        entityId: inv.id,
      });
    }
    const statusBadge = document.getElementById('invoiceDetailStatus');
    statusBadge.textContent = formatInvoiceStatus(eff);
    statusBadge.className = 'badge status-' + eff;

    // Manual statuses limited to Draft / Sent; paid/partial/overdue are derived.
    invoiceDetailStatusSelect.value = inv.status === 'sent' ? 'sent' : 'draft';
    invoiceDetailStatusSelect.style.display = '';

    document.getElementById('invoiceDetailClient').textContent = clientDisplayName(inv.client);
    const contactEl = document.getElementById('invoiceDetailContact');
    if (contactEl) {
      if (inv.contact) {
        contactEl.textContent = inv.contact.name + (inv.contact.role ? ` (${inv.contact.role})` : '');
      } else {
        contactEl.textContent = '—';
      }
    }
    document.getElementById('invoiceDetailDate').textContent = window.QuoteCraftUtils.formatDate(inv.date_created);
    document.getElementById('invoiceDetailDue').textContent = window.QuoteCraftUtils.formatDate(inv.date_due);
    document.getElementById('invoiceDetailQuote').textContent = inv.quote_id ? '#' + inv.quote_id : '—';
    const invoiceDetailProjectEl = document.getElementById('invoiceDetailProject');
    if (invoiceDetailProjectEl) {
      invoiceDetailProjectEl.textContent = inv.project ? inv.project.name : 'No project';
    }

    const invCurr = inv.currency || currencyCode;
    currentInvoiceCurrency = invCurr;

    const detailCurrencyEl = document.getElementById('invoiceDetailCurrency');
    if (detailCurrencyEl) {
      const cObj = (window.CURRENCIES || []).find(c => c.code === invCurr);
      detailCurrencyEl.textContent = cObj ? `${invCurr} (${cObj.symbol})` : invCurr;
    }

    const itemsBody = document.getElementById('invoiceDetailItems');
    itemsBody.innerHTML = '';
    for (const item of inv.line_items || []) {
      const tr = document.createElement('tr');
      tr.className = 'item-row';
      const tdDesc = document.createElement('td');
      tdDesc.textContent = item.description;
      const tdQty = document.createElement('td');
      tdQty.textContent = item.quantity;
      const tdPrice = document.createElement('td');
      tdPrice.textContent = money(item.unit_price, invCurr);
      const tdDisc = document.createElement('td');
      if (item.discount_type && item.discount_type !== 'none' && Number(item.discount_value) > 0) {
        tdDisc.textContent = item.discount_type === 'percent'
          ? `${Number(item.discount_value)}%`
          : `−${money(item.discount_value, invCurr)}`;
      } else {
        tdDisc.textContent = '—';
      }
      const tdTax = document.createElement('td');
      tdTax.textContent = Number(item.tax_rate) > 0 ? `${item.tax_rate}%` : '0% (Exempt)';
      const tdTotal = document.createElement('td');
      tdTotal.className = 'item-total';
      tdTotal.textContent = money(item.amount, invCurr);
      tr.appendChild(tdDesc);
      tr.appendChild(tdQty);
      tr.appendChild(tdPrice);
      tr.appendChild(tdDisc);
      tr.appendChild(tdTax);
      tr.appendChild(tdTotal);
      itemsBody.appendChild(tr);
    }

    document.getElementById('invoiceDetailSubtotal').textContent = money(inv.subtotal, invCurr);
    document.getElementById('invoiceDetailDiscount').textContent = money(inv.discount_amount, invCurr);

    // Render multi-rate tax breakdown
    const invTaxBreakdownEl = document.getElementById('invoiceDetailTaxBreakdown');
    renderInvoiceTaxBreakdown(invTaxBreakdownEl, inv.line_items, inv.subtotal, inv.discount_amount, invCurr);

    document.getElementById('invoiceDetailTotal').textContent = money(inv.total, invCurr);
    document.getElementById('invoiceDetailPaid').textContent = money(inv.amount_paid, invCurr);
    const credited = Number(inv.amount_credited) || 0;
    const netPaid = Math.max(0, Math.round(((Number(inv.amount_paid) || 0) - credited) * 100) / 100);
    const creditedRow = document.getElementById('invoiceDetailCreditedRow');
    const netRow = document.getElementById('invoiceDetailNetRow');
    if (credited > 0.0001) {
      document.getElementById('invoiceDetailCredited').textContent = '−' + money(credited, invCurr);
      document.getElementById('invoiceDetailNet').textContent = money(netPaid, invCurr);
      if (creditedRow) creditedRow.style.display = '';
      if (netRow) netRow.style.display = '';
    } else {
      if (creditedRow) creditedRow.style.display = 'none';
      if (netRow) netRow.style.display = 'none';
    }
    document.getElementById('invoiceDetailBalance').textContent = money(inv.balance_due, invCurr);
    document.getElementById('invoiceDetailTerms').textContent = inv.terms || '—';

    renderPaymentHistory(inv.payments || [], invCurr);
    renderCreditNotes(inv.credit_notes || [], invCurr);
    invoiceRecordPaymentBtn.disabled = Number(inv.balance_due) <= 0.0001;
    currentInvoiceBalance = Number(inv.balance_due) || 0;

    if (invoiceIssueCreditBtn) {
      invoiceIssueCreditBtn.disabled = netPaid <= 0.0001;
      invoiceIssueCreditBtn.title = netPaid <= 0.0001
        ? (Number(inv.amount_paid) <= 0.0001 ? 'No payments recorded on this invoice' : 'Invoice has been fully credited')
        : 'Issue Credit Note';
    }

    // Recurring profile & series handling
    currentRecurringProfile = inv.recurring_profile || null;
    renderRecurringSection(currentRecurringProfile);

    // Deposit / Retainer & Final Invoice handling
    renderDepositSection(inv, invCurr);

    // Last sent metadata display
    const sentRow = document.getElementById('invoiceDetailSentRow');
    const sentVal = document.getElementById('invoiceDetailSent');
    if (sentRow && sentVal) {
      if (inv.last_sent_at) {
        sentRow.style.display = '';
        const dt = new Date(inv.last_sent_at);
        const dateStr = isNaN(dt.getTime()) ? inv.last_sent_at : dt.toLocaleString([], {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        sentVal.textContent = `${dateStr} to ${inv.last_sent_to || 'Recipient'}`;
      } else {
        sentRow.style.display = 'none';
        sentVal.textContent = '—';
      }
    }

    // Email Activity history list
    const emailListEl = document.getElementById('invoiceEmailActivityList');
    if (window.QuoteCraftDocumentEmail && emailListEl) {
      window.QuoteCraftDocumentEmail.renderEmailActivityList(emailListEl, inv.email_logs);
    }
  }

  function renderRecurringSection(profile) {
    if (!invoiceRecurringCard) return;
    if (!profile) {
      invoiceRecurringCard.classList.add('hidden');
      if (invoiceRecurringBtn) invoiceRecurringBtn.textContent = 'Make Recurring';
      return;
    }

    invoiceRecurringCard.classList.remove('hidden');
    if (invoiceRecurringBtn) invoiceRecurringBtn.textContent = 'Recurring Settings';

    const freqMap = { weekly: 'Weekly (every 7 days)', monthly: 'Monthly (every month)', yearly: 'Yearly (every year)' };
    recurringFrequencyDisplay.textContent = freqMap[profile.frequency] || profile.frequency;
    recurringNextDateDisplay.textContent = profile.status === 'completed'
      ? 'Completed (End date reached)'
      : window.QuoteCraftUtils.formatDate(profile.next_issue_date);
    recurringEndDateDisplay.textContent = profile.end_date ? window.QuoteCraftUtils.formatDate(profile.end_date) : 'No end date (Indefinite)';

    recurringStatusBadge.textContent = profile.status.charAt(0).toUpperCase() + profile.status.slice(1);
    recurringStatusBadge.className = 'badge status-' + profile.status;

    // Pause/Resume button
    if (profile.status === 'paused') {
      recurringPauseBtn.textContent = 'Resume Series';
      recurringPauseBtn.className = 'btn btn-small btn-primary';
      recurringPauseBtn.style.display = '';
    } else if (profile.status === 'active') {
      recurringPauseBtn.textContent = 'Pause Series';
      recurringPauseBtn.className = 'btn btn-small btn-secondary';
      recurringPauseBtn.style.display = '';
    } else {
      recurringPauseBtn.style.display = 'none';
    }

    // Cancel button
    if (profile.status === 'cancelled' || profile.status === 'completed') {
      recurringCancelBtn.style.display = 'none';
      recurringTriggerBtn.style.display = 'none';
    } else {
      recurringCancelBtn.style.display = '';
      recurringTriggerBtn.style.display = '';
    }

    // Series invoices list
    renderSeriesInvoices(profile.series_invoices || []);
  }

  function renderSeriesInvoices(seriesList) {
    if (!recurringInvoicesList) return;
    if (!seriesList || seriesList.length === 0) {
      recurringInvoicesList.innerHTML = '<p class="empty">No invoices generated in this series yet.</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr><th>Invoice #</th><th>Issue date</th><th>Due date</th><th>Total</th><th>Status</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');

    seriesList.forEach((item) => {
      const tr = document.createElement('tr');
      const numTd = document.createElement('td');
      numTd.className = 'cell-name';
      numTd.innerHTML = item.id === currentInvoiceId
        ? `<strong>${item.invoice_number}</strong> <span style="font-size:11px;color:var(--accent);">(Current)</span>`
        : item.invoice_number;

      const dateTd = document.createElement('td');
      dateTd.className = 'cell-date';
      dateTd.textContent = window.QuoteCraftUtils.formatDate(item.date_created);

      const dueTd = document.createElement('td');
      dueTd.className = 'cell-date';
      dueTd.textContent = window.QuoteCraftUtils.formatDate(item.date_due);

      const totalTd = document.createElement('td');
      totalTd.textContent = money(item.total, item.currency || currencyCode);

      const statusTd = document.createElement('td');
      statusTd.appendChild(statusBadge(effectiveInvoiceStatus(item)));

      const actionTd = document.createElement('td');
      actionTd.className = 'cell-actions';
      if (item.id !== currentInvoiceId) {
        const viewBtn = document.createElement('button');
        viewBtn.type = 'button';
        viewBtn.className = 'btn btn-small btn-secondary';
        viewBtn.textContent = 'View';
        viewBtn.addEventListener('click', () => openDetail(item.id));
        actionTd.appendChild(viewBtn);
      }

      tr.appendChild(numTd);
      tr.appendChild(dateTd);
      tr.appendChild(dueTd);
      tr.appendChild(totalTd);
      tr.appendChild(statusTd);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    recurringInvoicesList.innerHTML = '';
    recurringInvoicesList.appendChild(table);
  }

  function renderDepositSection(inv, invCurr) {
    if (!invoiceDepositCard) return;

    if (inv.invoice_type === 'deposit') {
      invoiceDepositCard.classList.remove('hidden');
      invoiceDepositCardTitle.textContent = 'Deposit / Retainer Details';
      invoiceDepositTypeBadge.textContent = `Deposit Invoice (${inv.deposit_percent || 0}%)`;
      invoiceDepositTypeBadge.className = 'badge badge-deposit';

      depositQuoteDisplay.innerHTML = '';
      if (inv.quote) {
        const qLink = document.createElement('a');
        qLink.href = '#';
        qLink.className = 'client-primary-name';
        qLink.textContent = inv.quote.quote_number;
        qLink.addEventListener('click', (e) => {
          e.preventDefault();
          window.QuoteCraftUtils.goToPage('quotes');
          setTimeout(() => window.dispatchEvent(new CustomEvent('qc-open-quote', { detail: inv.quote.id })), 50);
        });
        depositQuoteDisplay.appendChild(qLink);
      } else {
        depositQuoteDisplay.textContent = inv.quote_id ? '#' + inv.quote_id : '—';
      }

      depositOriginalTotalDisplay.textContent = money(inv.original_quote_total, invCurr);
      depositAmountDisplay.textContent = money(inv.total, invCurr);
      const remainder = Math.max(0, Math.round(((Number(inv.original_quote_total) || 0) - (Number(inv.total) || 0)) * 100) / 100);
      depositRemainderDisplay.textContent = money(remainder, invCurr);

      linkedDepositInvoiceBanner.classList.add('hidden');
      const eff = effectiveInvoiceStatus(inv);

      if (eff === 'paid' || Number(inv.balance_due) <= 0.0001) {
        if (inv.final_invoice) {
          generateFinalInvoiceBtn.classList.add('hidden');
          linkedFinalInvoiceBanner.classList.remove('hidden');
          linkedFinalInvoiceBanner.innerHTML = '';
          const infoSpan = document.createElement('span');
          infoSpan.innerHTML = `Linked Final Invoice: <strong>${inv.final_invoice.invoice_number}</strong> (${money(inv.final_invoice.total, invCurr)}) — Status: <span class="badge status-${inv.final_invoice.status}">${inv.final_invoice.status}</span>`;
          const viewFinalBtn = document.createElement('button');
          viewFinalBtn.type = 'button';
          viewFinalBtn.className = 'btn btn-small btn-secondary';
          viewFinalBtn.textContent = 'View Final Invoice';
          viewFinalBtn.style.marginLeft = '10px';
          viewFinalBtn.addEventListener('click', () => openDetail(inv.final_invoice.id));
          linkedFinalInvoiceBanner.appendChild(infoSpan);
          linkedFinalInvoiceBanner.appendChild(viewFinalBtn);
        } else {
          linkedFinalInvoiceBanner.classList.add('hidden');
          generateFinalInvoiceBtn.classList.remove('hidden');
          generateFinalInvoiceBtn.textContent = `✨ Generate Final Invoice (${money(remainder, invCurr)})`;
        }
      } else {
        generateFinalInvoiceBtn.classList.add('hidden');
        linkedFinalInvoiceBanner.classList.add('hidden');
      }
    } else if (inv.invoice_type === 'final') {
      invoiceDepositCard.classList.remove('hidden');
      invoiceDepositCardTitle.textContent = 'Final Remainder Invoice Details';
      invoiceDepositTypeBadge.textContent = 'Final Invoice';
      invoiceDepositTypeBadge.className = 'badge badge-final';

      depositQuoteDisplay.innerHTML = '';
      if (inv.quote) {
        const qLink = document.createElement('a');
        qLink.href = '#';
        qLink.className = 'client-primary-name';
        qLink.textContent = inv.quote.quote_number;
        qLink.addEventListener('click', (e) => {
          e.preventDefault();
          window.QuoteCraftUtils.goToPage('quotes');
          setTimeout(() => window.dispatchEvent(new CustomEvent('qc-open-quote', { detail: inv.quote.id })), 50);
        });
        depositQuoteDisplay.appendChild(qLink);
      } else {
        depositQuoteDisplay.textContent = inv.quote_id ? '#' + inv.quote_id : '—';
      }

      depositOriginalTotalDisplay.textContent = money(inv.original_quote_total, invCurr);
      depositAmountDisplay.textContent = `−${money(inv.deposit_amount, invCurr)} (Deposit Paid)`;
      depositRemainderDisplay.textContent = money(inv.total, invCurr);

      generateFinalInvoiceBtn.classList.add('hidden');
      linkedFinalInvoiceBanner.classList.add('hidden');

      if (inv.deposit_invoice) {
        linkedDepositInvoiceBanner.classList.remove('hidden');
        linkedDepositInvoiceBanner.innerHTML = '';
        const infoSpan = document.createElement('span');
        infoSpan.innerHTML = `Initial Deposit Invoice: <strong>${inv.deposit_invoice.invoice_number}</strong> (${money(inv.deposit_amount, invCurr)} Paid)`;
        const viewDepBtn = document.createElement('button');
        viewDepBtn.type = 'button';
        viewDepBtn.className = 'btn btn-small btn-secondary';
        viewDepBtn.textContent = 'View Deposit Invoice';
        viewDepBtn.style.marginLeft = '10px';
        viewDepBtn.addEventListener('click', () => openDetail(inv.deposit_invoice.id));
        linkedDepositInvoiceBanner.appendChild(infoSpan);
        linkedDepositInvoiceBanner.appendChild(viewDepBtn);
      } else {
        linkedDepositInvoiceBanner.classList.add('hidden');
      }
    } else {
      invoiceDepositCard.classList.add('hidden');
      generateFinalInvoiceBtn.classList.add('hidden');
      linkedFinalInvoiceBanner.classList.add('hidden');
      linkedDepositInvoiceBanner.classList.add('hidden');
    }
  }

  async function handleGenerateFinalInvoice() {
    if (!currentInvoiceId) return;
    const confirmed = await window.QuoteCraftUtils.confirmAction({
      title: 'Generate Final Remainder Invoice?',
      message: 'This will create the final invoice for the remaining balance, referencing this deposit invoice and the original quote deliverables.',
      confirmText: 'Create Final Invoice',
    });
    if (!confirmed) return;

    generateFinalInvoiceBtn.disabled = true;
    try {
      const res = await window.electronAPI.createFinalInvoiceFromDeposit(currentInvoiceId);
      if (res.ok && res.invoice) {
        toast(`Final Invoice ${res.invoice.invoice_number} created successfully.`, 'success');
        await loadInvoices();
        openDetail(res.invoice.id);
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not generate final invoice.', 'error');
      }
    } catch (e) {
      toast('Failed to generate final invoice: ' + e.message, 'error');
    } finally {
      generateFinalInvoiceBtn.disabled = false;
    }
  }

  let currentInvoiceBalance = 0;

  function renderPaymentHistory(payments, customCurrency) {
    const el = document.getElementById('invoicePaymentHistory');
    if (!payments || payments.length === 0) {
      el.innerHTML = '<p class="empty">No payments recorded yet.</p>';
      return;
    }
    const curr = customCurrency || currentInvoiceCurrency || currencyCode;
    const table = document.createElement('table');
    table.className = 'data-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const p of payments) {
      const tr = document.createElement('tr');
      const dateTd = document.createElement('td');
      dateTd.className = 'cell-date';
      dateTd.textContent = window.QuoteCraftUtils.formatDate(p.payment_date);
      const amtTd = document.createElement('td');
      amtTd.textContent = money(p.amount, curr);
      const methodTd = document.createElement('td');
      methodTd.textContent = p.payment_method || '—';
      const refTd = document.createElement('td');
      refTd.textContent = p.reference_number || '—';
      tr.appendChild(dateTd);
      tr.appendChild(amtTd);
      tr.appendChild(methodTd);
      tr.appendChild(refTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    el.innerHTML = '';
    el.appendChild(table);
  }

  function renderCreditNotes(creditNotes, customCurrency) {
    const el = invoiceCreditNotesList;
    if (!el) return;
    const curr = customCurrency || currentInvoiceCurrency || currencyCode;
    if (!creditNotes || creditNotes.length === 0) {
      el.innerHTML = '<p class="empty">No credit notes issued against this invoice.</p>';
      return;
    }
    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr><th>Credit Note #</th><th>Date</th><th>Amount</th><th>Reason</th><th class="th-actions">Action</th></tr></thead>';

    const tbody = document.createElement('tbody');
    for (const cn of creditNotes) {
      const tr = document.createElement('tr');
      const numTd = document.createElement('td');
      numTd.className = 'cell-name';
      numTd.textContent = cn.credit_note_number;

      const dateTd = document.createElement('td');
      dateTd.className = 'cell-date';
      dateTd.textContent = window.QuoteCraftUtils.formatDate(cn.date_created);

      const amtTd = document.createElement('td');
      amtTd.textContent = money(cn.amount, curr);
      amtTd.style.color = 'var(--danger)';

      const reasonTd = document.createElement('td');
      reasonTd.textContent = cn.reason || '—';

      const actionTd = document.createElement('td');
      actionTd.className = 'cell-actions';
      const pdfBtn = document.createElement('button');
      pdfBtn.type = 'button';
      pdfBtn.className = 'btn btn-small btn-secondary';
      pdfBtn.textContent = 'Download PDF';
      pdfBtn.addEventListener('click', () => handleExportCreditNote(cn.id));
      actionTd.appendChild(pdfBtn);

      tr.appendChild(numTd);
      tr.appendChild(dateTd);
      tr.appendChild(amtTd);
      tr.appendChild(reasonTd);
      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    el.innerHTML = '';
    el.appendChild(table);
  }

  async function handleExportCreditNote(creditNoteId) {
    try {
      const res = await window.electronAPI.exportCreditNotePdf(creditNoteId);
      if (res.ok && res.cancelled) return;
      if (res.ok) {
        toast('PDF saved to ' + res.savedPath, 'success');
      } else {
        toast((res.errors && res.errors.general) || 'Could not export PDF.', 'error');
      }
    } catch (e) {
      toast('Could not export PDF: ' + e.message, 'error');
    }
  }

  // ---------- Credit Note modal ----------
  function openCreditNoteModal() {
    if (!currentInvoiceId) return;
    const inv = invoices.find((i) => i.id === currentInvoiceId);
    const paid = inv ? Number(inv.amount_paid || 0) : 0;
    const credited = inv ? Number(inv.amount_credited || 0) : 0;
    const creditable = Math.max(0, Math.round((paid - credited) * 100) / 100);
    const curr = (inv && inv.currency) || currentInvoiceCurrency || currencyCode;

    if (creditable <= 0.0001) {
      if (paid <= 0.0001) {
        toast('This invoice has no payments recorded. A credit note can only be issued against paid amounts.', 'error');
      } else {
        toast('This invoice has already been fully credited. No remaining paid balance is available to credit.', 'error');
      }
      return;
    }

    creditNoteForm.reset();
    clearCreditNoteErrors();
    const paidLabel = document.getElementById('creditNotePaidLabel');
    if (paidLabel) {
      paidLabel.textContent = credited > 0 ? 'Remaining creditable amount' : 'Amount already paid';
    }
    creditNotePaidDisplay.textContent = money(creditable, curr);
    creditNoteAmountInput.max = String(creditable);
    creditNoteAmountInput.placeholder = creditable.toFixed(2);
    creditNoteModal.classList.remove('hidden');
    creditNoteAmountInput.focus();
  }

  function closeCreditNoteModal() {
    creditNoteModal.classList.add('hidden');
  }

  function clearCreditNoteErrors() {
    const el = creditNoteForm.elements['amount'];
    if (el) el.classList.remove('invalid');
    const errEl = document.querySelector('[data-error-for="amount"]');
    if (errEl) errEl.textContent = '';
  }

  async function handleIssueCreditNote(e) {
    e.preventDefault();
    if (!currentInvoiceId) return;
    clearCreditNoteErrors();

    const inv = invoices.find((i) => i.id === currentInvoiceId);
    const paid = inv ? Number(inv.amount_paid || 0) : 0;
    const credited = inv ? Number(inv.amount_credited || 0) : 0;
    const creditable = Math.max(0, Math.round((paid - credited) * 100) / 100);
    const curr = (inv && inv.currency) || currentInvoiceCurrency || currencyCode;

    const amt = Number(creditNoteAmountInput.value);
    if (!(amt > 0)) {
      const el = creditNoteForm.elements['amount'];
      if (el) el.classList.add('invalid');
      const errEl = document.querySelector('[data-error-for="amount"]');
      if (errEl) errEl.textContent = 'Credit note amount must be greater than zero.';
      return;
    }
    if (amt > creditable + 0.0001) {
      const el = creditNoteForm.elements['amount'];
      if (el) el.classList.add('invalid');
      const errEl = document.querySelector('[data-error-for="amount"]');
      if (errEl) errEl.textContent = `Credit note amount cannot exceed the remaining creditable amount (${money(creditable, curr)}).`;
      return;
    }

    const payload = {
      amount: creditNoteAmountInput.value,
      reason: creditNoteReasonInput.value,
    };

    const submitBtn = document.getElementById('creditNoteSubmitBtn');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await window.electronAPI.issueCreditNote(currentInvoiceId, payload);
      if (res.ok) {
        closeCreditNoteModal();
        toast(`Credit note ${res.credit_note.credit_note_number} issued.`, 'success');
        await loadInvoices();
        await openDetail(currentInvoiceId);
      } else if (res.errors) {
        if (res.errors.general) {
          toast(res.errors.general, 'error');
        } else if (res.errors.amount) {
          const el = creditNoteForm.elements['amount'];
          if (el) el.classList.add('invalid');
          const errEl = document.querySelector('[data-error-for="amount"]');
          if (errEl) errEl.textContent = res.errors.amount;
        }
      } else {
        toast('Could not issue credit note.', 'error');
      }
    } catch (err) {
      toast('Could not issue credit note: ' + err.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  // ---------- Record Payment modal ----------
  function openPaymentModal(invoiceId) {
    currentInvoiceId = invoiceId;
    const inv = invoices.find((i) => i.id === invoiceId) ||
      (currentInvoiceId === invoiceId ? { balance_due: currentInvoiceBalance, currency: currentInvoiceCurrency } : null);
    const balance = inv ? Number(inv.balance_due) : 0;
    const curr = (inv && inv.currency) || currentInvoiceCurrency || currencyCode;

    paymentForm.reset();
    clearPaymentErrors();
    if (balance <= 0) {
      toast('This invoice has already been fully paid.', 'error');
      return;
    }
    paymentModalTitle.textContent = 'Record Payment';
    paymentBalanceDisplay.textContent = money(balance, curr);
    paymentAmountInput.max = balance;
    paymentAmountInput.value = '';
    paymentDateInput.value = new Date().toISOString().slice(0, 10);
    paymentMethodSelect.value = '';
    paymentReferenceInput.value = '';
    paymentNotesInput.value = '';
    paymentModal.classList.remove('hidden');
    paymentAmountInput.focus();
  }

  function closePaymentModal() {
    paymentModal.classList.add('hidden');
  }

  function clearPaymentErrors() {
    const el = paymentForm.elements['amount'];
    if (el) el.classList.remove('invalid');
    const errEl = document.querySelector('[data-error-for="amount"]');
    if (errEl) errEl.textContent = '';
    const dateEl = paymentForm.elements['payment_date'];
    if (dateEl) dateEl.classList.remove('invalid');
    const dateErrEl = document.querySelector('[data-error-for="payment_date"]');
    if (dateErrEl) dateErrEl.textContent = '';
  }

  async function handleRecordPayment(e) {
    e.preventDefault();
    if (!currentInvoiceId) return;
    clearPaymentErrors();

    const payload = {
      amount: paymentAmountInput.value,
      payment_date: paymentDateInput.value || new Date().toISOString().slice(0, 10),
      payment_method: paymentMethodSelect.value,
      reference_number: paymentReferenceInput.value,
      notes: paymentNotesInput.value,
    };

    const submitBtn = document.getElementById('paymentSubmitBtn');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await window.electronAPI.recordPayment(currentInvoiceId, payload);
      if (res.ok) {
        closePaymentModal();
        toast('Payment recorded.', 'success');
        await loadInvoices();
        await openDetail(currentInvoiceId);
      } else {
        if (res.errors && res.errors.general) {
          toast(res.errors.general, 'error');
        } else if (res.errors) {
          for (const [field, msg] of Object.entries(res.errors)) {
            if (field === 'general') toast(msg, 'error');
            else if (field === 'amount') showPaymentAmountError(msg);
            else if (field === 'payment_date') showPaymentDateError(msg);
          }
        } else {
          toast('Could not record payment.', 'error');
        }
      }
    } catch (err) {
      toast('Could not record payment: ' + err.message, 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function showPaymentAmountError(message) {
    const el = paymentForm.elements['amount'];
    if (el) el.classList.add('invalid');
    const errEl = document.querySelector('[data-error-for="amount"]');
    if (errEl) errEl.textContent = message || '';
  }

  function showPaymentDateError(message) {
    const el = paymentForm.elements['payment_date'];
    if (el) el.classList.add('invalid');
    const errEl = document.querySelector('[data-error-for="payment_date"]');
    if (errEl) errEl.textContent = message || '';
  }

  // ---------- Status change ----------
  async function changeInvoiceStatus(status) {
    if (!currentInvoiceId) return;
    // Paid must not be forced when the balance isn't zero.
    const inv = await window.electronAPI.getInvoice(currentInvoiceId);
    if (inv.ok && status === 'paid' && Number(inv.invoice.balance_due) > 0.0001) {
      toast('Cannot mark as Paid while a balance is still due.', 'error');
      renderDetail(inv.invoice);
      return;
    }
    try {
      const res = await window.electronAPI.setInvoiceStatus(currentInvoiceId, status);
      if (res.ok) {
        toast(`Invoice marked as ${formatInvoiceStatus(status)}.`, 'success');
        await loadInvoices();
        await openDetail(currentInvoiceId);
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not update status.', 'error');
      }
    } catch (err) {
      toast('Could not update status: ' + err.message, 'error');
    }
  }

  // ---------- Recurring Modal & Actions ----------
  function openRecurringModal() {
    if (!currentInvoiceId) return;
    recurringForm.reset();
    clearFieldError('next_issue_date');

    const inv = invoices.find((i) => i.id === currentInvoiceId);
    const today = new Date();
    const defaultNext = new Date(today);
    defaultNext.setMonth(defaultNext.getMonth() + 1);

    if (currentRecurringProfile) {
      recurringFrequencySelect.value = currentRecurringProfile.frequency || 'monthly';
      recurringNextDateInput.value = currentRecurringProfile.next_issue_date || toDateInputValue(defaultNext);
      recurringEndDateInput.value = currentRecurringProfile.end_date || '';
    } else {
      recurringFrequencySelect.value = 'monthly';
      recurringNextDateInput.value = toDateInputValue(defaultNext);
      recurringEndDateInput.value = '';
    }

    recurringModal.classList.remove('hidden');
  }

  function closeRecurringModal() {
    recurringModal.classList.add('hidden');
  }

  function toDateInputValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async function handleSaveRecurring(e) {
    e.preventDefault();
    if (!currentInvoiceId) return;

    const nextDate = recurringNextDateInput.value;
    const endDate = recurringEndDateInput.value;
    if (!nextDate) {
      showFieldError('next_issue_date', 'Next occurrence date is required.');
      return;
    }
    if (endDate && endDate < nextDate) {
      showFieldError('end_date', 'End date cannot be before next occurrence date.');
      return;
    }

    try {
      const res = await window.electronAPI.setRecurringProfile(currentInvoiceId, {
        frequency: recurringFrequencySelect.value,
        next_issue_date: nextDate,
        end_date: endDate || null,
      });

      if (res.ok) {
        toast('Recurring schedule saved.', 'success');
        closeRecurringModal();
        currentRecurringProfile = res.profile;
        renderRecurringSection(res.profile);
        await loadInvoices();
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not save recurring schedule.', 'error');
      }
    } catch (err) {
      toast('Could not save recurring schedule: ' + err.message, 'error');
    }
  }

  async function handleTriggerRecurringNow() {
    if (!currentRecurringProfile) return;
    const confirmed = await window.QuoteCraftUtils.confirmAction({
      title: 'Generate next occurrence now?',
      message: 'This will immediately generate the next Draft invoice in this series with an incremented invoice number and advance the schedule.',
      confirmText: 'Generate Draft Now',
    });
    if (!confirmed) return;

    window.QuoteCraftUtils.showBusy('Generating recurring draft invoice\u2026');
    try {
      const res = await window.electronAPI.triggerRecurringNow(currentRecurringProfile.id);
      if (res.ok) {
        toast(`Draft invoice ${res.invoice.invoice_number} generated from recurring series.`, 'success');
        currentRecurringProfile = res.profile;
        renderRecurringSection(res.profile);
        await loadInvoices();
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Failed to generate recurring invoice.', 'error');
      }
    } catch (err) {
      toast('Failed to generate recurring invoice: ' + err.message, 'error');
    } finally {
      window.QuoteCraftUtils.hideBusy();
    }
  }

  async function handlePauseResumeRecurring() {
    if (!currentRecurringProfile) return;
    const isPaused = currentRecurringProfile.status === 'paused';
    try {
      const res = isPaused
        ? await window.electronAPI.resumeRecurringProfile(currentRecurringProfile.id)
        : await window.electronAPI.pauseRecurringProfile(currentRecurringProfile.id);
      if (res.ok) {
        toast(`Recurring series ${isPaused ? 'resumed' : 'paused'}.`, 'success');
        currentRecurringProfile = res.profile;
        renderRecurringSection(res.profile);
      }
    } catch (err) {
      toast('Could not update series: ' + err.message, 'error');
    }
  }

  async function handleCancelRecurring() {
    if (!currentRecurringProfile) return;
    const confirmed = await window.QuoteCraftUtils.confirmAction({
      title: 'Cancel recurring series?',
      message: 'Future invoices will no longer be generated for this series. Existing invoices already created will not be affected.',
      confirmText: 'Cancel Series',
    });
    if (!confirmed) return;

    try {
      const res = await window.electronAPI.cancelRecurringProfile(currentRecurringProfile.id);
      if (res.ok) {
        toast('Recurring series cancelled.', 'success');
        currentRecurringProfile = res.profile;
        renderRecurringSection(res.profile);
      }
    } catch (err) {
      toast('Could not cancel series: ' + err.message, 'error');
    }
  }

  async function checkDueRecurring() {
    try {
      const res = await window.electronAPI.checkDueRecurring();
      if (res && res.ok && res.generatedCount > 0) {
        if (invoicesRecurringBanner) {
          invoicesRecurringBanner.classList.remove('hidden');
          invoicesRecurringBanner.innerHTML = `
            <span>⚡ <strong>${res.generatedCount}</strong> recurring draft invoice${res.generatedCount > 1 ? 's were' : ' was'} generated automatically.</span>
            <button type="button" class="btn btn-small btn-primary" id="btnDismissInvBanner">Refresh list</button>
          `;
          const btn = invoicesRecurringBanner.querySelector('#btnDismissInvBanner');
          if (btn) {
            btn.addEventListener('click', async () => {
              invoicesRecurringBanner.classList.add('hidden');
              await loadInvoices();
            });
          }
        }
        toast(`${res.generatedCount} recurring draft invoice${res.generatedCount > 1 ? 's' : ''} generated.`, 'success');
        await loadInvoices();
      }
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- Events ----------
  invoiceBackBtn.addEventListener('click', () => { currentInvoiceId = null; currentRecurringProfile = null; loadInvoices(); showList(); });
  if (invoiceDuplicateBtn) {
    invoiceDuplicateBtn.addEventListener('click', () => runDuplicateInvoice(currentInvoiceId, true));
  }
  invoiceRecordPaymentBtn.addEventListener('click', () => {
    if (currentInvoiceId) openPaymentModal(currentInvoiceId);
  });
  if (invoiceRecurringBtn) {
    invoiceRecurringBtn.addEventListener('click', openRecurringModal);
  }
  if (recurringTriggerBtn) {
    recurringTriggerBtn.addEventListener('click', handleTriggerRecurringNow);
  }
  if (recurringPauseBtn) {
    recurringPauseBtn.addEventListener('click', handlePauseResumeRecurring);
  }
  if (recurringCancelBtn) {
    recurringCancelBtn.addEventListener('click', handleCancelRecurring);
  }
  if (recurringForm) {
    recurringForm.addEventListener('submit', handleSaveRecurring);
  }
  const recurringCloseBtn = document.getElementById('recurringModalClose');
  if (recurringCloseBtn) recurringCloseBtn.addEventListener('click', closeRecurringModal);
  const recurringCancelModalBtn = document.getElementById('recurringCancelModalBtn');
  if (recurringCancelModalBtn) recurringCancelModalBtn.addEventListener('click', closeRecurringModal);
  if (recurringModal) {
    recurringModal.addEventListener('click', (e) => {
      if (e.target === recurringModal) closeRecurringModal();
    });
  }

  invoiceExportBtn.addEventListener('click', async () => {
    if (!currentInvoiceId) return;
    invoiceExportBtn.disabled = true;
    window.QuoteCraftUtils.showBusy('Generating PDF\u2026');
    try {
      const res = await window.electronAPI.exportInvoicePdf(currentInvoiceId);
      if (res.ok && res.cancelled) return;
      if (res.ok) {
        toast('PDF saved to ' + res.savedPath, 'success');
      } else {
        toast(res.errors && res.errors.general ? res.errors.general : 'Could not export PDF.', 'error');
      }
    } catch (e) {
      toast('Could not export PDF: ' + e.message, 'error');
    } finally {
      window.QuoteCraftUtils.hideBusy();
      invoiceExportBtn.disabled = false;
    }
  });

  if (invoicePrintBtn) {
    invoicePrintBtn.addEventListener('click', async () => {
      if (!currentInvoiceId) return;
      invoicePrintBtn.disabled = true;
      try {
        const res = await window.electronAPI.printInvoice(currentInvoiceId);
        if (res.ok && res.cancelled) return;
        if (res.ok) {
          toast('Print sent to the printer.', 'success');
        } else {
          toast(res.errors && res.errors.general ? res.errors.general : 'Could not print invoice.', 'error');
        }
      } catch (e) {
        toast('Could not print invoice: ' + e.message, 'error');
      } finally {
        invoicePrintBtn.disabled = false;
      }
    });
  }

  if (invoiceSendEmailBtn) {
    invoiceSendEmailBtn.addEventListener('click', async () => {
      if (!currentInvoiceId) return;
      try {
        const res = await window.electronAPI.getInvoice(currentInvoiceId);
        if (!res.ok || !res.invoice) {
          toast('Invoice not found.', 'error');
          return;
        }
        if (window.QuoteCraftDocumentEmail) {
          window.QuoteCraftDocumentEmail.openSendModal({
            documentType: 'invoice',
            documentId: currentInvoiceId,
            doc: res.invoice,
            onSuccess: async () => {
              await loadInvoices();
              if (currentInvoiceId) {
                const updated = await window.electronAPI.getInvoice(currentInvoiceId);
                if (updated.ok && updated.invoice) {
                  renderDetail(updated.invoice);
                }
              }
            },
          });
        }
      } catch (err) {
        toast('Could not initiate email: ' + err.message, 'error');
      }
    });
  }

  invoiceDetailStatusSelect.addEventListener('change', () => {
    changeInvoiceStatus(invoiceDetailStatusSelect.value);
  });

  generateFinalInvoiceBtn?.addEventListener('click', handleGenerateFinalInvoice);

  window.addEventListener('qc-open-invoice', (e) => {
    if (e.detail) openDetail(e.detail);
  });

  invoiceSearch.addEventListener('input', () => {
    searchTerm = invoiceSearch.value;
    renderList();
  });

  invoiceStatusFilter.addEventListener('change', () => {
    statusFilter = invoiceStatusFilter.value;
    renderList();
  });

  if (invoicesExportCsvBtn) {
    invoicesExportCsvBtn.addEventListener('click', exportInvoicesCsv);
  }

  if (invoiceBulkMarkSentBtn) {
    invoiceBulkMarkSentBtn.addEventListener('click', handleBulkMarkSent);
  }
  if (invoiceBulkExportPdfBtn) {
    invoiceBulkExportPdfBtn.addEventListener('click', handleBulkExportPdfs);
  }
  if (invoiceBulkClearBtn) {
    invoiceBulkClearBtn.addEventListener('click', () => {
      selectedInvoiceIds.clear();
      renderList();
    });
  }

  document.getElementById('paymentModalClose').addEventListener('click', closePaymentModal);
  document.getElementById('paymentCancelBtn').addEventListener('click', closePaymentModal);
  paymentModal.addEventListener('click', (e) => {
    if (e.target === paymentModal) closePaymentModal();
  });
  paymentForm.addEventListener('submit', handleRecordPayment);
  paymentAmountInput.addEventListener('input', clearPaymentErrors);
  paymentDateInput.addEventListener('input', clearPaymentErrors);

  if (invoiceIssueCreditBtn) {
    invoiceIssueCreditBtn.addEventListener('click', openCreditNoteModal);
  }
  document.getElementById('creditNoteModalClose').addEventListener('click', closeCreditNoteModal);
  document.getElementById('creditNoteCancelBtn').addEventListener('click', closeCreditNoteModal);
  creditNoteModal.addEventListener('click', (e) => {
    if (e.target === creditNoteModal) closeCreditNoteModal();
  });
  creditNoteForm.addEventListener('submit', handleIssueCreditNote);
  creditNoteAmountInput.addEventListener('input', clearCreditNoteErrors);

  // ---------- Init ----------
  async function init() {
    try {
      const profile = await window.electronAPI.getCompanyProfile();
      if (profile.ok && profile.profile && profile.profile.default_currency) {
        currencyCode = profile.profile.default_currency;
      }
    } catch (e) { /* keep default */ }
    await checkDueRecurring();
    await loadInvoices();
    showList();
  }

  init();
})();
