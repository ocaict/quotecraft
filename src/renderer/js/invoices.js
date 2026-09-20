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
  const invoiceShareHtmlBtn = document.getElementById('invoiceShareHtmlBtn');
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

  // Invoice Form View (Edit Mode) Elements
  const formView = document.getElementById('invoiceFormView');
  const invoiceEditBtn = document.getElementById('invoiceEditBtn');
  const invoiceFormBackBtn = document.getElementById('invoiceFormBackBtn');
  const invoiceForm = document.getElementById('invoiceForm');
  const invoiceFormId = document.getElementById('invoiceFormId');
  const invoiceFormClient = document.getElementById('invoiceFormClient');
  const invoiceFormClientSearch = document.getElementById('invoiceFormClientSearch');
  const invoiceFormProject = document.getElementById('invoiceFormProject');
  const invoiceFormContact = document.getElementById('invoiceFormContact');
  const invoiceFormDate = document.getElementById('invoiceFormDate');
  const invoiceFormDueDate = document.getElementById('invoiceFormDueDate');
  const invoiceFormCurrency = document.getElementById('invoiceFormCurrency');
  const invoiceFormExchangeRateField = document.getElementById('invoiceFormExchangeRateField');
  const invoiceFormExchangeRate = document.getElementById('invoiceFormExchangeRate');
  const invoiceFormLibrarySelect = document.getElementById('invoiceFormLibrarySelect');
  const invoiceAddLineItemBtn = document.getElementById('invoiceAddLineItemBtn');
  const invoiceItemsBody = document.getElementById('invoiceItemsBody');
  const invoiceDiscountType = document.getElementById('invoiceDiscountType');
  const invoiceDiscountValue = document.getElementById('invoiceDiscountValue');
  const invoiceDiscountLabel = document.getElementById('invoiceDiscountLabel');
  const invoiceTaxRate = document.getElementById('invoiceTaxRate');
  const invoiceTotalsSubtotal = document.getElementById('invoiceTotalsSubtotal');
  const invoiceTotalsDiscount = document.getElementById('invoiceTotalsDiscount');
  const invoiceTotalsTaxBreakdown = document.getElementById('invoiceTotalsTaxBreakdown');
  const invoiceTotalsGrand = document.getElementById('invoiceTotalsGrand');
  const invoiceFormNotes = document.getElementById('invoiceFormNotes');
  const invoiceFormTerms = document.getElementById('invoiceFormTerms');
  const saveInvoiceBtn = document.getElementById('saveInvoiceBtn');
  const cancelInvoiceBtn = document.getElementById('cancelInvoiceBtn');

  const invoiceTaxLinesEnabled = document.getElementById('invoiceTaxLinesEnabled');
  const invoiceTaxLinesSection = document.getElementById('invoiceTaxLinesSection');
  const invoiceTaxLinesList = document.getElementById('invoiceTaxLinesList');
  const invoiceAddTaxLineBtn = document.getElementById('invoiceAddTaxLineBtn');

  function addInvoiceTaxLineRow(name = '', rate = '') {
    if (!invoiceTaxLinesList) return null;
    const row = document.createElement('div');
    row.className = 'tax-line-row';
    row.innerHTML = `
      <input type="text" class="tax-line-name" placeholder="Tax name (e.g. GST)" value="${escapeHtml(name)}">
      <div class="tax-line-rate-wrap">
        <input type="number" class="tax-line-rate" placeholder="0" min="0" max="100" step="0.01" value="${rate !== '' && rate !== null && !isNaN(rate) ? rate : ''}">
        <span style="color: var(--text-muted); font-size: 13px;">%</span>
      </div>
      <span class="tax-line-amount">$0.00</span>
      <button type="button" class="tax-line-remove" title="Remove tax line">✕</button>
    `;

    row.querySelector('.tax-line-remove').addEventListener('click', () => {
      row.remove();
      recalcInvoiceTotals();
    });

    row.querySelector('.tax-line-name').addEventListener('input', () => {
      recalcInvoiceTotals();
    });

    row.querySelector('.tax-line-rate').addEventListener('input', () => {
      recalcInvoiceTotals();
    });

    invoiceTaxLinesList.appendChild(row);
    recalcInvoiceTotals();
    return row;
  }

  let currentRecurringProfile = null;
  let currentEditingInvoice = null;
  let invoiceFormClients = [];
  let formCurrencyCode = 'USD';

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
    if (formView) formView.classList.remove('active');
  }

  function showDetail() {
    listView.classList.remove('active');
    if (formView) formView.classList.remove('active');
    detailView.classList.add('active');
  }

  function showForm() {
    listView.classList.remove('active');
    detailView.classList.remove('active');
    if (formView) formView.classList.add('active');
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

  function renderInvoiceTaxBreakdown(containerEl, lineItems, subtotal, discountAmount, customCurrency, taxLines) {
    if (!containerEl) return;
    containerEl.innerHTML = '';
    const curr = customCurrency || currencyCode;

    let parsedTaxLines = taxLines;
    if (typeof parsedTaxLines === 'string') {
      try { parsedTaxLines = JSON.parse(parsedTaxLines); } catch (_) { parsedTaxLines = null; }
    }
    if (Array.isArray(parsedTaxLines) && parsedTaxLines.length > 0) {
      let totalTax = 0;
      parsedTaxLines.forEach((tl) => {
        const name = tl.name || tl.label || 'Tax';
        const rateStr = tl.rate !== undefined && tl.rate !== null && !isNaN(Number(tl.rate)) ? `${tl.rate}%` : '';
        const label = rateStr ? `${name} (${rateStr})` : name;
        let amt = Number(tl.amount);
        if (isNaN(amt) || amt === 0) {
          const taxableBase = Math.max(0, (Number(subtotal) || 0) - (Number(discountAmount) || 0));
          amt = Math.round(taxableBase * (Number(tl.rate) || 0)) / 100;
        }
        totalTax += amt;
        const row = document.createElement('div');
        row.className = 'tax-breakdown-row';
        row.innerHTML = `<span class="tax-label">${escapeHtml(label)}</span><span class="tax-val">${money(amt, curr)}</span>`;
        containerEl.appendChild(row);
      });
      if (parsedTaxLines.length > 1) {
        const totalRow = document.createElement('div');
        totalRow.className = 'tax-breakdown-row';
        totalRow.style.fontWeight = '600';
        totalRow.style.borderTop = '1px dashed var(--border)';
        totalRow.style.paddingTop = '4px';
        totalRow.style.marginTop = '2px';
        totalRow.innerHTML = `<span class="tax-label">Total Tax</span><span class="tax-val">${money(totalTax, curr)}</span>`;
        containerEl.appendChild(totalRow);
      }
      return;
    }

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

  let sortField = 'date';
  let sortDirection = 'desc';

  function sortInvoices(list) {
    return list.slice().sort((a, b) => {
      let res = 0;
      switch (sortField) {
        case 'number':
          res = (a.invoice_number || '').localeCompare(b.invoice_number || '', undefined, { numeric: true });
          break;
        case 'client':
          res = clientDisplayName(a.client).localeCompare(clientDisplayName(b.client));
          break;
        case 'date':
          res = new Date(a.date_created || 0).getTime() - new Date(b.date_created || 0).getTime();
          break;
        case 'due_date':
          res = new Date(a.date_due || '9999-12-31').getTime() - new Date(b.date_due || '9999-12-31').getTime();
          break;
        case 'total':
          res = (Number(a.total) || 0) - (Number(b.total) || 0);
          break;
        case 'paid':
          res = (Number(a.amount_paid) || 0) - (Number(b.amount_paid) || 0);
          break;
        case 'balance':
          res = (Number(a.balance_due) || 0) - (Number(b.balance_due) || 0);
          break;
        case 'status':
          res = effectiveInvoiceStatus(a).localeCompare(effectiveInvoiceStatus(b));
          break;
        default:
          res = 0;
      }
      return sortDirection === 'asc' ? res : -res;
    });
  }

  function renderList() {
    const filtered = sortInvoices(filterInvoices());

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

    function makeTh(label, field, extraClass = '') {
      const isCurrent = sortField === field;
      const indicator = isCurrent ? (sortDirection === 'asc' ? '▲' : '▼') : '▲';
      const sortedClass = isCurrent ? ` sorted-${sortDirection}` : '';
      return `<th class="sortable${sortedClass} ${extraClass}" data-sort="${field}" title="Sort by ${label}">${label}<span class="sort-indicator">${indicator}</span></th>`;
    }

    const table = document.createElement('table');
    table.className = 'data-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr>' +
      '<th class="th-select"><input type="checkbox" id="invoiceSelectAll" title="Select all invoices"></th>' +
      makeTh('Number', 'number') +
      makeTh('Client', 'client') +
      makeTh('Date', 'date') +
      makeTh('Due date', 'due_date') +
      makeTh('Total', 'total') +
      makeTh('Paid', 'paid') +
      makeTh('Balance', 'balance') +
      makeTh('Status', 'status') +
      '<th class="th-actions">Actions</th>' +
      '</tr>';
    table.appendChild(thead);

    thead.querySelectorAll('th.sortable').forEach((th) => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (sortField === field) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortField = field;
          sortDirection = (field === 'date' || field === 'due_date' || field === 'total' || field === 'paid' || field === 'balance') ? 'desc' : 'asc';
        }
        renderList();
      });
    });

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

      // Row Actions Dropdown (···)
      const dropdownWrap = document.createElement('div');
      dropdownWrap.className = 'row-actions-dropdown';

      const triggerBtn = document.createElement('button');
      triggerBtn.type = 'button';
      triggerBtn.className = 'row-actions-trigger';
      triggerBtn.title = 'More actions';
      triggerBtn.innerHTML = '•••';

      const menu = document.createElement('div');
      menu.className = 'row-actions-menu hidden';

      const payItem = document.createElement('button');
      payItem.type = 'button';
      payItem.className = 'row-action-item';
      payItem.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg> Record Payment';
      payItem.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('hidden');
        triggerBtn.classList.remove('active');
        openPaymentModal(inv.id);
      });

      const pdfItem = document.createElement('button');
      pdfItem.type = 'button';
      pdfItem.className = 'row-action-item';
      pdfItem.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download PDF';
      pdfItem.addEventListener('click', async (e) => {
        e.stopPropagation();
        menu.classList.add('hidden');
        triggerBtn.classList.remove('active');
        try {
          window.QuoteCraftUtils.showBusy('Generating PDF…');
          const res = await window.electronAPI.exportInvoicePdf(inv.id);
          if (res && res.ok && !res.cancelled && res.savedPath) {
            window.QuoteCraftUtils.showToast('PDF saved to ' + res.savedPath, 'success');
          }
        } catch (err) {
          window.QuoteCraftUtils.showToast('Failed to export PDF: ' + err.message, 'error');
        } finally {
          window.QuoteCraftUtils.hideBusy();
        }
      });

      const dupItem = document.createElement('button');
      dupItem.type = 'button';
      dupItem.className = 'row-action-item';
      dupItem.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Duplicate';
      dupItem.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('hidden');
        triggerBtn.classList.remove('active');
        runDuplicateInvoice(inv.id, false);
      });

      const emailItem = document.createElement('button');
      emailItem.type = 'button';
      emailItem.className = 'row-action-item';
      emailItem.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> Send Email';
      emailItem.addEventListener('click', async (e) => {
        e.stopPropagation();
        menu.classList.add('hidden');
        triggerBtn.classList.remove('active');
        if (window.QuoteCraftDocumentEmail) {
          window.QuoteCraftDocumentEmail.openSendModal({
            documentType: 'invoice',
            documentId: inv.id,
            doc: inv,
            onSuccess: async () => { await loadInvoices(); }
          });
        }
      });

      menu.appendChild(payItem);
      menu.appendChild(pdfItem);
      menu.appendChild(dupItem);
      menu.appendChild(emailItem);

      triggerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !menu.classList.contains('hidden');
        document.querySelectorAll('.row-actions-menu:not(.hidden)').forEach((m) => m.classList.add('hidden'));
        document.querySelectorAll('.row-actions-trigger.active').forEach((t) => t.classList.remove('active'));
        if (!isOpen) {
          menu.classList.remove('hidden');
          triggerBtn.classList.add('active');
        }
      });

      dropdownWrap.appendChild(triggerBtn);
      dropdownWrap.appendChild(menu);

      actionsTd.appendChild(viewBtn);
      actionsTd.appendChild(dropdownWrap);

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
    renderInvoiceTaxBreakdown(invTaxBreakdownEl, inv.line_items, inv.subtotal, inv.discount_amount, invCurr, inv.tax_lines);

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

    const isLocked = inv.edit_locked === 1 || (inv.payments && inv.payments.length > 0) || Number(inv.amount_paid) > 0;
    if (invoiceEditBtn) {
      invoiceEditBtn.style.display = isLocked ? 'none' : '';
      invoiceEditBtn.title = isLocked ? 'Invoice has recorded payments and cannot be edited' : 'Edit line items, notes, terms, and invoice details';
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

  if (invoiceShareHtmlBtn) {
    invoiceShareHtmlBtn.addEventListener('click', async () => {
      if (!currentInvoiceId) return;
      invoiceShareHtmlBtn.disabled = true;
      window.QuoteCraftUtils.showBusy('Exporting shareable HTML invoice\u2026');
      try {
        const res = await window.electronAPI.exportShareableInvoiceHtml(currentInvoiceId);
        if (res.ok && res.cancelled) return;
        if (res.ok) {
          toast('Shareable HTML invoice saved to ' + res.savedPath, 'success');
        } else {
          toast(res.errors && res.errors.general ? res.errors.general : 'Could not export HTML invoice.', 'error');
        }
      } catch (e) {
        toast('Could not export HTML invoice: ' + e.message, 'error');
      } finally {
        window.QuoteCraftUtils.hideBusy();
        invoiceShareHtmlBtn.disabled = false;
      }
    });
  }

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

  // ---------- Invoice Edit Mode Functions ----------
  function toCents(value) {
    if (value === '' || value === null || value === undefined || isNaN(Number(value))) return 0;
    return Math.round(Number(value) * 100);
  }

  function lineRawCents(qty, price) {
    return Math.round(toCents(qty) * toCents(price) / 100);
  }

  function lineDiscountCents(rawCents, discType, discValue) {
    if (!discType || discType === 'none' || isNaN(discValue) || discValue <= 0) return 0;
    let dc = discType === 'fixed' ? toCents(discValue) : Math.round(rawCents * discValue / 100);
    if (dc > rawCents) dc = rawCents;
    return dc;
  }

  function lineNetCents(qty, price, discType, discValue) {
    const raw = lineRawCents(qty, price);
    return raw - lineDiscountCents(raw, discType, discValue);
  }

  function formatLineTotal(qty, price, discType, discValue) {
    const net = lineNetCents(qty, price, discType, discValue);
    return window.QuoteCraftUtils.formatCurrency(net / 100, formCurrencyCode);
  }

  function recalcInvoiceTotals() {
    if (!invoiceItemsBody) return;
    let subtotalCents = 0;
    const rows = Array.from(invoiceItemsBody.querySelectorAll('tr.item-row'));
    const lineItemsData = [];

    for (const tr of rows) {
      const desc = tr.querySelector('input[name="item_description"]').value;
      const qty = tr.querySelector('input[name="item_quantity"]').value;
      const price = tr.querySelector('input[name="item_unit_price"]').value;
      const dType = tr.querySelector('select[name="item_discount_type"]').value;
      const dVal = Number(tr.querySelector('input[name="item_discount_value"]').value);
      const taxInput = tr.querySelector('input[name="item_tax_rate"]');
      const taxRateVal = taxInput && !isNaN(Number(taxInput.value)) ? Number(taxInput.value) : 0;

      const netCents = lineNetCents(qty, price, dType, dVal);
      subtotalCents += netCents;

      lineItemsData.push({
        description: desc,
        quantity: Number(qty) || 0,
        unit_price: Number(price) || 0,
        discount_type: dType,
        discount_value: dVal || 0,
        tax_rate: taxRateVal,
        amount: netCents / 100,
      });
    }

    const docType = invoiceDiscountType ? invoiceDiscountType.value : 'none';
    const docVal = invoiceDiscountValue ? Number(invoiceDiscountValue.value) : 0;
    let docDiscCents = 0;
    if (docType !== 'none' && !isNaN(docVal) && docVal > 0) {
      docDiscCents = docType === 'fixed' ? toCents(docVal) : Math.round(subtotalCents * docVal / 100);
      if (docDiscCents > subtotalCents) docDiscCents = subtotalCents;
    }

    const ratio = subtotalCents > 0 ? (subtotalCents - docDiscCents) / subtotalCents : 1;
    let totalTaxCents = 0;
    const multiTaxActive = invoiceTaxLinesEnabled && invoiceTaxLinesEnabled.checked;
    let currentTaxLines = null;

    if (multiTaxActive) {
      const taxableBasisCents = Math.max(0, subtotalCents - docDiscCents);
      const rows = invoiceTaxLinesList ? invoiceTaxLinesList.querySelectorAll('.tax-line-row') : [];
      currentTaxLines = [];
      rows.forEach((row) => {
        const name = (row.querySelector('.tax-line-name')?.value || '').trim() || 'Tax';
        const rate = Number(row.querySelector('.tax-line-rate')?.value) || 0;
        const taxCents = rate > 0 ? Math.round(taxableBasisCents * rate / 100) : 0;
        totalTaxCents += taxCents;
        const amtSpan = row.querySelector('.tax-line-amount');
        if (amtSpan) {
          amtSpan.textContent = window.QuoteCraftUtils.formatCurrency(taxCents / 100, formCurrencyCode);
        }
        currentTaxLines.push({
          name,
          label: name,
          rate,
          amount: taxCents / 100,
        });
      });
    } else {
      const brackets = new Map();
      for (const item of lineItemsData) {
        const rate = Number(item.tax_rate) || 0;
        const amountCents = Math.round(item.amount * 100);
        if (!brackets.has(rate)) brackets.set(rate, 0);
        brackets.set(rate, brackets.get(rate) + amountCents);
      }
      for (const [rate, bNet] of brackets.entries()) {
        const basisCents = Math.round(bNet * ratio);
        const tCents = rate > 0 ? Math.round(basisCents * rate / 100) : 0;
        totalTaxCents += tCents;
      }
    }

    const grandTotalCents = Math.max(0, subtotalCents - docDiscCents + totalTaxCents);

    if (invoiceTotalsSubtotal) invoiceTotalsSubtotal.textContent = window.QuoteCraftUtils.formatCurrency(subtotalCents / 100, formCurrencyCode);
    if (invoiceTotalsDiscount) invoiceTotalsDiscount.textContent = window.QuoteCraftUtils.formatCurrency(docDiscCents / 100, formCurrencyCode);
    if (invoiceTotalsGrand) invoiceTotalsGrand.textContent = window.QuoteCraftUtils.formatCurrency(grandTotalCents / 100, formCurrencyCode);

    renderInvoiceTaxBreakdown(invoiceTotalsTaxBreakdown, lineItemsData, subtotalCents / 100, docDiscCents / 100, formCurrencyCode, currentTaxLines);

    return {
      subtotal: subtotalCents / 100,
      discount_amount: docDiscCents / 100,
      tax_amount: totalTaxCents / 100,
      tax_lines: currentTaxLines,
      total: grandTotalCents / 100,
      line_items: lineItemsData,
    };
  }

  function createInvoiceItemRow(data = {}) {
    const tr = document.createElement('tr');
    tr.className = 'item-row';

    const tdDesc = document.createElement('td');
    tdDesc.className = 'col-description';
    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.name = 'item_description';
    descInput.placeholder = 'Item or service description';
    descInput.value = data.description || '';
    tdDesc.appendChild(descInput);

    const tdQty = document.createElement('td');
    tdQty.className = 'col-qty';
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.name = 'item_quantity';
    qtyInput.min = '0';
    qtyInput.step = 'any';
    qtyInput.placeholder = '0';
    qtyInput.value = data.quantity !== undefined && data.quantity !== null ? data.quantity : '';
    tdQty.appendChild(qtyInput);

    const tdPrice = document.createElement('td');
    tdPrice.className = 'col-price';
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.name = 'item_unit_price';
    priceInput.min = '0';
    priceInput.step = '0.01';
    priceInput.placeholder = '0.00';
    priceInput.value = data.unit_price !== undefined && data.unit_price !== null ? data.unit_price : '';
    tdPrice.appendChild(priceInput);

    const tdDisc = document.createElement('td');
    tdDisc.className = 'cell-line-discount';
    const discWrap = document.createElement('div');
    discWrap.className = 'line-discount-wrap';

    const discTypeSelect = document.createElement('select');
    discTypeSelect.name = 'item_discount_type';
    discTypeSelect.className = 'line-disc-type';
    discTypeSelect.innerHTML = '<option value="none">None</option><option value="percent">%</option><option value="fixed">Fixed</option>';
    discTypeSelect.value = data.discount_type || 'none';

    const discValueInput = document.createElement('input');
    discValueInput.type = 'number';
    discValueInput.name = 'item_discount_value';
    discValueInput.className = 'line-disc-value';
    discValueInput.min = '0';
    discValueInput.step = '0.01';
    discValueInput.placeholder = '0';
    discValueInput.value = (data.discount_value !== undefined && data.discount_value !== null && data.discount_type && data.discount_type !== 'none') ? data.discount_value : '';
    discValueInput.disabled = !data.discount_type || data.discount_type === 'none';

    discTypeSelect.addEventListener('change', () => {
      const isNone = discTypeSelect.value === 'none';
      discValueInput.disabled = isNone;
      if (isNone) discValueInput.value = '';
      recalc();
    });

    discWrap.appendChild(discTypeSelect);
    discWrap.appendChild(discValueInput);
    tdDisc.appendChild(discWrap);

    const tdTax = document.createElement('td');
    tdTax.className = 'cell-tax';
    const taxInput = document.createElement('input');
    taxInput.type = 'number';
    taxInput.name = 'item_tax_rate';
    taxInput.className = 'line-tax-input';
    taxInput.min = '0';
    taxInput.max = '100';
    taxInput.step = '0.01';
    taxInput.placeholder = '0';
    if (data.tax_rate !== undefined && data.tax_rate !== null && data.tax_rate !== '') {
      taxInput.value = data.tax_rate;
    } else if (invoiceTaxRate && invoiceTaxRate.value !== '') {
      taxInput.value = invoiceTaxRate.value;
    } else {
      taxInput.value = '0';
    }
    tdTax.appendChild(taxInput);

    const tdTotal = document.createElement('td');
    tdTotal.className = 'item-total';
    tdTotal.textContent = formatLineTotal(qtyInput.value, priceInput.value, discTypeSelect.value, Number(discValueInput.value));

    const tdRemove = document.createElement('td');
    tdRemove.className = 'col-remove';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn btn-small btn-danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      tr.remove();
      if (invoiceItemsBody.children.length === 0) {
        invoiceItemsBody.appendChild(createInvoiceItemRow({}));
      }
      recalcInvoiceTotals();
    });
    tdRemove.appendChild(removeBtn);

    tr.appendChild(tdDesc);
    tr.appendChild(tdQty);
    tr.appendChild(tdPrice);
    tr.appendChild(tdDisc);
    tr.appendChild(tdTax);
    tr.appendChild(tdTotal);
    tr.appendChild(tdRemove);

    const recalc = () => {
      tdTotal.textContent = formatLineTotal(qtyInput.value, priceInput.value, discTypeSelect.value, Number(discValueInput.value));
      recalcInvoiceTotals();
    };
    qtyInput.addEventListener('input', recalc);
    priceInput.addEventListener('input', recalc);
    discValueInput.addEventListener('input', recalc);
    taxInput.addEventListener('input', recalc);

    return tr;
  }

  function updateInvoiceDiscountControls() {
    if (!invoiceDiscountType || !invoiceDiscountValue) return;
    const type = invoiceDiscountType.value;
    const isDisabled = type === 'none';
    invoiceDiscountValue.disabled = isDisabled;
    if (isDisabled) {
      invoiceDiscountValue.value = '';
      if (invoiceDiscountLabel) invoiceDiscountLabel.textContent = 'Discount';
    } else if (type === 'percent') {
      if (invoiceDiscountLabel) invoiceDiscountLabel.textContent = 'Discount (%)';
      invoiceDiscountValue.placeholder = '0';
      invoiceDiscountValue.step = '0.01';
    } else {
      if (invoiceDiscountLabel) invoiceDiscountLabel.textContent = 'Discount (amount)';
      invoiceDiscountValue.placeholder = `0.00 (${formCurrencyCode})`;
      invoiceDiscountValue.step = '0.01';
    }
    recalcInvoiceTotals();
  }

  function populateInvoiceClients(filterText, selectedClientId) {
    if (!invoiceFormClient) return;
    const q = (filterText || '').trim().toLowerCase();
    const options = invoiceFormClients
      .filter((c) => !q || String(c.name || '').toLowerCase().includes(q) || String(c.company_name || '').toLowerCase().includes(q))
      .map((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.company_name ? `${c.name} (${c.company_name})` : c.name;
        return opt;
      });

    invoiceFormClient.innerHTML = '<option value="">Select a client…</option>';
    options.forEach((o) => invoiceFormClient.appendChild(o));
    if (selectedClientId) {
      invoiceFormClient.value = String(selectedClientId);
    }
  }

  async function populateInvoiceContacts(clientId, selectedContactId) {
    if (!invoiceFormContact) return;
    invoiceFormContact.innerHTML = '<option value="">Default / No specific contact</option>';
    if (!clientId) return;
    try {
      const res = await window.electronAPI.listContacts(clientId);
      if (res.ok && Array.isArray(res.contacts)) {
        res.contacts.forEach((c) => {
          const opt = document.createElement('option');
          opt.value = c.id;
          const rolePart = c.role ? ` — ${c.role}` : '';
          const primaryTag = c.is_primary ? ' (Primary)' : '';
          opt.textContent = `${c.name}${rolePart}${primaryTag}`;
          invoiceFormContact.appendChild(opt);
        });
        if (selectedContactId) {
          invoiceFormContact.value = String(selectedContactId);
        }
      }
    } catch (e) { /* ignore */ }
  }

  async function populateInvoiceProjects(clientId, selectedProjectId) {
    if (!invoiceFormProject) return;
    invoiceFormProject.innerHTML = '<option value="">No project / job</option>';
    if (!clientId) return;
    try {
      const res = await window.electronAPI.listProjects({ client_id: Number(clientId) });
      if (res.ok && Array.isArray(res.projects)) {
        res.projects.forEach((p) => {
          const opt = document.createElement('option');
          opt.value = p.id;
          const holdTag = p.status === 'on_hold' ? ' (On hold)' : p.status === 'completed' ? ' (Completed)' : '';
          opt.textContent = p.name + holdTag;
          invoiceFormProject.appendChild(opt);
        });
        if (selectedProjectId) {
          invoiceFormProject.value = String(selectedProjectId);
        }
      }
    } catch (e) { /* ignore */ }
  }

  function populateInvoiceCurrencySelect(selectedCode) {
    if (invoiceFormCurrency && window.prepareCurrencySelect) {
      window.prepareCurrencySelect(invoiceFormCurrency, selectedCode || formCurrencyCode);
    }
    updateInvoiceExchangeRateVisibility();
  }

  function updateInvoiceExchangeRateVisibility() {
    if (!invoiceFormExchangeRateField || !invoiceFormCurrency) return;
    const selected = invoiceFormCurrency.value;
    const baseCode = currencyCode || 'USD';
    const label = invoiceFormExchangeRateField.querySelector('label');
    const hint = invoiceFormExchangeRateField.querySelector('.hint');
    if (label) label.textContent = `Exchange rate (${selected} to base ${baseCode})`;
    if (hint) hint.textContent = `1 ${selected} = [rate] ${baseCode}. Used only for reporting.`;
    if (selected === baseCode) {
      invoiceFormExchangeRateField.style.display = 'none';
      if (invoiceFormExchangeRate) invoiceFormExchangeRate.value = '1';
    } else {
      invoiceFormExchangeRateField.style.display = '';
    }
  }

  async function populateInvoiceLibrarySelect() {
    if (!invoiceFormLibrarySelect) return;
    invoiceFormLibrarySelect.innerHTML = '<option value="">+ Add from Library…</option>';
    try {
      const res = await window.electronAPI.getLineItemTemplates();
      if (res.ok && Array.isArray(res.templates)) {
        res.templates.forEach((t) => {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = `${t.title || t.description} (${money(t.unit_price, formCurrencyCode)})`;
          opt.dataset.desc = t.description;
          opt.dataset.price = t.unit_price;
          opt.dataset.tax = t.tax_rate;
          invoiceFormLibrarySelect.appendChild(opt);
        });
      }
    } catch (e) { /* ignore */ }
  }

  async function openEditInvoice(inv) {
    if (!inv) return;
    currentEditingInvoice = inv;
    formCurrencyCode = inv.currency || currencyCode || 'USD';

    // Clear previous field errors
    if (invoiceForm) {
      invoiceForm.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
    }

    if (invoiceFormId) invoiceFormId.value = inv.id;
    const titleEl = document.getElementById('invoiceFormTitle');
    if (titleEl) titleEl.textContent = `Edit Invoice ${inv.invoice_number}`;

    // Load clients
    try {
      const cRes = await window.electronAPI.listClients();
      invoiceFormClients = (cRes && cRes.clients) || [];
      populateInvoiceClients('', inv.client_id);
    } catch (e) { /* ignore */ }

    // Load contacts and projects
    await populateInvoiceContacts(inv.client_id, inv.contact_id);
    await populateInvoiceProjects(inv.client_id, inv.project_id);

    // Dates
    if (invoiceFormDate) invoiceFormDate.value = inv.date_created || '';
    if (invoiceFormDueDate) invoiceFormDueDate.value = inv.date_due || '';

    // Currency
    populateInvoiceCurrencySelect(inv.currency);
    if (invoiceFormExchangeRate) {
      invoiceFormExchangeRate.value = inv.exchange_rate || 1;
    }

    // Notes & terms
    if (invoiceFormNotes) invoiceFormNotes.value = inv.notes || '';
    if (invoiceFormTerms) invoiceFormTerms.value = inv.terms || '';

    // Discount & tax
    if (invoiceDiscountType) invoiceDiscountType.value = inv.discount_type || 'none';
    if (invoiceDiscountValue) {
      invoiceDiscountValue.value = (inv.discount_value !== undefined && inv.discount_value !== null && inv.discount_type && inv.discount_type !== 'none') ? inv.discount_value : '';
    }
    if (invoiceTaxRate) invoiceTaxRate.value = inv.tax_rate || 0;
    updateInvoiceDiscountControls();

    // Populate line items
    if (invoiceItemsBody) {
      invoiceItemsBody.innerHTML = '';
      const items = inv.line_items || [];
      if (items.length > 0) {
        items.forEach((it) => {
          invoiceItemsBody.appendChild(createInvoiceItemRow(it));
        });
      } else {
        invoiceItemsBody.appendChild(createInvoiceItemRow({}));
      }
    }

    if (inv.tax_lines) {
      let lines = inv.tax_lines;
      if (typeof lines === 'string') {
        try { lines = JSON.parse(lines); } catch (_) { lines = null; }
      }
      if (Array.isArray(lines) && lines.length > 0) {
        if (invoiceTaxLinesEnabled) invoiceTaxLinesEnabled.checked = true;
        if (invoiceTaxLinesSection) invoiceTaxLinesSection.classList.remove('hidden');
        if (invoiceTaxLinesList) invoiceTaxLinesList.innerHTML = '';
        lines.forEach((l) => addInvoiceTaxLineRow(l.name || l.label, l.rate));
      } else {
        if (invoiceTaxLinesEnabled) invoiceTaxLinesEnabled.checked = false;
        if (invoiceTaxLinesSection) invoiceTaxLinesSection.classList.add('hidden');
        if (invoiceTaxLinesList) invoiceTaxLinesList.innerHTML = '';
      }
    } else {
      if (invoiceTaxLinesEnabled) invoiceTaxLinesEnabled.checked = false;
      if (invoiceTaxLinesSection) invoiceTaxLinesSection.classList.add('hidden');
      if (invoiceTaxLinesList) invoiceTaxLinesList.innerHTML = '';
    }

    await populateInvoiceLibrarySelect();
    recalcInvoiceTotals();
    showForm();
  }

  async function handleSaveInvoice() {
    if (!currentEditingInvoice) return;
    const invId = currentEditingInvoice.id;

    if (!invoiceForm) return;
    invoiceForm.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));

    const clientId = Number(invoiceFormClient.value);
    const projectId = invoiceFormProject && invoiceFormProject.value ? Number(invoiceFormProject.value) : null;
    const contactId = invoiceFormContact && invoiceFormContact.value ? Number(invoiceFormContact.value) : null;
    const dateCreated = invoiceFormDate ? invoiceFormDate.value : '';
    const dateDue = invoiceFormDueDate ? invoiceFormDueDate.value : '';
    const currency = (invoiceFormCurrency && invoiceFormCurrency.value) || formCurrencyCode;
    const exchangeRate = (invoiceFormExchangeRate && Number(invoiceFormExchangeRate.value)) || 1.0;
    const notes = invoiceFormNotes ? invoiceFormNotes.value : '';
    const terms = invoiceFormTerms ? invoiceFormTerms.value : '';
    const discountType = invoiceDiscountType ? invoiceDiscountType.value : 'none';
    const discountValue = (invoiceDiscountValue && Number(invoiceDiscountValue.value)) || 0;
    const taxRate = (invoiceTaxRate && Number(invoiceTaxRate.value)) || 0;

    const totals = recalcInvoiceTotals();
    const lineItems = [];
    let hasItemError = false;

    Array.from(invoiceItemsBody.querySelectorAll('tr.item-row')).forEach((tr) => {
      const desc = tr.querySelector('input[name="item_description"]').value.trim();
      const qty = Number(tr.querySelector('input[name="item_quantity"]').value);
      const price = Number(tr.querySelector('input[name="item_unit_price"]').value);
      const dType = tr.querySelector('select[name="item_discount_type"]').value;
      const dVal = Number(tr.querySelector('input[name="item_discount_value"]').value) || 0;
      const tRate = Number(tr.querySelector('input[name="item_tax_rate"]').value) || 0;
      const amount = lineNetCents(qty, price, dType, dVal) / 100;

      if (!desc || !(qty > 0) || !(price > 0)) {
        hasItemError = true;
      }

      lineItems.push({
        description: desc,
        quantity: qty,
        unit_price: price,
        discount_type: dType,
        discount_value: dVal,
        tax_rate: tRate,
        amount: amount,
      });
    });

    if (!clientId) {
      const errEl = invoiceForm.querySelector('[data-error-for="client_id"]');
      if (errEl) errEl.textContent = 'Please select a client.';
      toast('Please select a client.', 'error');
      return;
    }

    if (lineItems.length === 0 || hasItemError) {
      toast('Please provide a valid description, quantity, and unit price for all line items.', 'error');
      return;
    }

    const payloadData = {
      client_id: clientId,
      project_id: projectId,
      contact_id: contactId,
      date_created: dateCreated,
      date_due: dateDue,
      currency: currency,
      exchange_rate: exchangeRate,
      notes: notes,
      terms: terms,
      discount_type: discountType,
      discount_value: discountValue,
      discount: totals.discount_amount,
      tax_rate: taxRate,
      tax_lines: totals.tax_lines,
      tax: totals.tax_amount,
      subtotal: totals.subtotal,
      total: totals.total,
    };

    window.QuoteCraftUtils.showBusy('Saving invoice…');
    try {
      const res = await window.electronAPI.updateInvoice(invId, payloadData, lineItems);
      if (res.ok) {
        toast('Invoice updated successfully.', 'success');
        await loadInvoices();
        await openDetail(invId);
      } else {
        if (res.errors) {
          Object.keys(res.errors).forEach((key) => {
            const el = invoiceForm.querySelector(`[data-error-for="${key}"]`);
            if (el) el.textContent = res.errors[key];
          });
          toast(res.errors.general || 'Failed to update invoice.', 'error');
        } else {
          toast('Failed to update invoice.', 'error');
        }
      }
    } catch (e) {
      toast('Error saving invoice: ' + e.message, 'error');
    } finally {
      window.QuoteCraftUtils.hideBusy();
    }
  }

  // ---------- Invoice Edit Event Listeners ----------
  if (invoiceEditBtn) {
    invoiceEditBtn.addEventListener('click', async () => {
      if (!currentInvoiceId) return;
      try {
        const res = await window.electronAPI.getInvoice(currentInvoiceId);
        if (res.ok && res.invoice) {
          openEditInvoice(res.invoice);
        }
      } catch (e) {
        toast('Could not load invoice for editing: ' + e.message, 'error');
      }
    });
  }

  if (invoiceFormBackBtn) invoiceFormBackBtn.addEventListener('click', showDetail);
  if (cancelInvoiceBtn) cancelInvoiceBtn.addEventListener('click', showDetail);
  if (saveInvoiceBtn) saveInvoiceBtn.addEventListener('click', handleSaveInvoice);
  if (invoiceAddLineItemBtn) {
    invoiceAddLineItemBtn.addEventListener('click', () => {
      invoiceItemsBody.appendChild(createInvoiceItemRow({}));
      recalcInvoiceTotals();
    });
  }
  if (invoiceDiscountType) {
    invoiceDiscountType.addEventListener('change', updateInvoiceDiscountControls);
  }
  if (invoiceDiscountValue) {
    invoiceDiscountValue.addEventListener('input', recalcInvoiceTotals);
  }
  if (invoiceTaxRate) {
    invoiceTaxRate.addEventListener('input', recalcInvoiceTotals);
  }
  if (invoiceTaxLinesEnabled) {
    invoiceTaxLinesEnabled.addEventListener('change', () => {
      if (invoiceTaxLinesSection) {
        invoiceTaxLinesSection.classList.toggle('hidden', !invoiceTaxLinesEnabled.checked);
      }
      if (invoiceTaxLinesEnabled.checked && invoiceTaxLinesList && invoiceTaxLinesList.children.length === 0) {
        addInvoiceTaxLineRow('GST', 5);
        addInvoiceTaxLineRow('PST', 7);
      }
      recalcInvoiceTotals();
    });
  }
  if (invoiceAddTaxLineBtn) {
    invoiceAddTaxLineBtn.addEventListener('click', () => {
      const row = addInvoiceTaxLineRow('', '');
      if (row) row.querySelector('.tax-line-name')?.focus();
    });
  }
  if (invoiceFormCurrency) {
    invoiceFormCurrency.addEventListener('change', () => {
      formCurrencyCode = invoiceFormCurrency.value;
      updateInvoiceExchangeRateVisibility();
      recalcInvoiceTotals();
    });
  }
  if (invoiceFormClient) {
    invoiceFormClient.addEventListener('change', async () => {
      const cId = Number(invoiceFormClient.value);
      await populateInvoiceContacts(cId, null);
      await populateInvoiceProjects(cId, null);
    });
  }
  if (invoiceFormClientSearch) {
    invoiceFormClientSearch.addEventListener('input', () => {
      populateInvoiceClients(invoiceFormClientSearch.value, invoiceFormClient.value);
    });
  }
  if (invoiceFormLibrarySelect) {
    invoiceFormLibrarySelect.addEventListener('change', () => {
      const selOpt = invoiceFormLibrarySelect.selectedOptions[0];
      if (!selOpt || !selOpt.value) return;
      const desc = selOpt.dataset.desc || '';
      const price = selOpt.dataset.price || 0;
      const tax = selOpt.dataset.tax || 0;
      invoiceItemsBody.appendChild(createInvoiceItemRow({
        description: desc,
        quantity: 1,
        unit_price: Number(price) || 0,
        tax_rate: Number(tax) || 0,
      }));
      invoiceFormLibrarySelect.value = '';
      recalcInvoiceTotals();
    });
  }

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
