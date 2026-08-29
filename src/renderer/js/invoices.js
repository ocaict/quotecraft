(function () {
  const section = document.getElementById('page-invoices');
  if (!section) return;

  const listView = document.getElementById('invoiceListView');
  const detailView = document.getElementById('invoiceDetailView');
  const invoiceListEl = document.getElementById('invoiceList');
  const invoiceSearch = document.getElementById('invoiceSearch');
  const invoiceStatusFilter = document.getElementById('invoiceStatusFilter');

  const invoiceBackBtn = document.getElementById('invoiceBackBtn');
  const invoiceExportBtn = document.getElementById('invoiceExportBtn');
  const invoiceRecordPaymentBtn = document.getElementById('invoiceRecordPaymentBtn');
  const invoiceDetailStatusSelect = document.getElementById('invoiceDetailStatusSelect');

  const paymentModal = document.getElementById('paymentModal');
  const paymentForm = document.getElementById('paymentForm');
  const paymentModalTitle = document.getElementById('paymentModalTitle');
  const paymentBalanceDisplay = document.getElementById('paymentBalanceDisplay');
  const paymentAmountInput = document.getElementById('paymentAmount');
  const paymentDateInput = document.getElementById('paymentDate');
  const paymentMethodSelect = document.getElementById('paymentMethod');
  const paymentReferenceInput = document.getElementById('paymentReference');
  const paymentNotesInput = document.getElementById('paymentNotes');

  let invoices = [];
  let currencyCode = 'USD';
  let currentInvoiceId = null;
  let searchTerm = '';
  let statusFilter = 'all';

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

  function money(amount) {
    return window.QuoteCraftUtils.formatCurrency(amount, currencyCode);
  }

  // ---------- List ----------
  function statusBadge(status) {
    const s = document.createElement('span');
    s.className = 'badge status-' + status;
    s.textContent = formatInvoiceStatus(status);
    return s;
  }

  function renderList() {
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

      const numTd = document.createElement('td');
      numTd.className = 'cell-name';
      numTd.textContent = inv.invoice_number;

      const clientTd = document.createElement('td');
      clientTd.textContent = clientDisplayName(inv.client);

      const dateTd = document.createElement('td');
      dateTd.className = 'cell-date';
      dateTd.textContent = window.QuoteCraftUtils.formatDate(inv.date_created);

      const dueTd = document.createElement('td');
      dueTd.className = 'cell-date';
      dueTd.textContent = window.QuoteCraftUtils.formatDate(inv.date_due);

      const totalTd = document.createElement('td');
      totalTd.textContent = money(inv.total);

      const paidTd = document.createElement('td');
      paidTd.textContent = money(inv.amount_paid);

      const balanceTd = document.createElement('td');
      balanceTd.className = 'cell-balance';
      balanceTd.textContent = money(inv.balance_due);

      const statusTd = document.createElement('td');
      statusTd.appendChild(statusBadge(effectiveInvoiceStatus(inv)));

      const actionsTd = document.createElement('td');
      actionsTd.className = 'cell-actions';
      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.className = 'btn btn-small btn-secondary';
      viewBtn.textContent = 'View';
      viewBtn.addEventListener('click', () => openDetail(inv.id));
      const payBtn = document.createElement('button');
      payBtn.type = 'button';
      payBtn.className = 'btn btn-small btn-secondary';
      payBtn.textContent = 'Record Payment';
      payBtn.addEventListener('click', () => openPaymentModal(inv.id));
      actionsTd.appendChild(viewBtn);
      actionsTd.appendChild(payBtn);

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
  }

  async function loadInvoices() {
    try {
      const res = await window.electronAPI.listInvoices();
      if (res.ok) {
        invoices = res.invoices || [];
        renderList();
      } else {
        toast('Could not load invoices.', 'error');
      }
    } catch (e) {
      toast('Could not load invoices: ' + e.message, 'error');
    }
  }

  // ---------- Detail ----------
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
    const statusBadge = document.getElementById('invoiceDetailStatus');
    statusBadge.textContent = formatInvoiceStatus(eff);
    statusBadge.className = 'badge status-' + eff;

    // Manual statuses limited to Draft / Sent; paid/partial/overdue are derived.
    invoiceDetailStatusSelect.value = inv.status === 'sent' ? 'sent' : 'draft';
    invoiceDetailStatusSelect.style.display = '';

    document.getElementById('invoiceDetailClient').textContent = clientDisplayName(inv.client);
    document.getElementById('invoiceDetailDate').textContent = window.QuoteCraftUtils.formatDate(inv.date_created);
    document.getElementById('invoiceDetailDue').textContent = window.QuoteCraftUtils.formatDate(inv.date_due);
    document.getElementById('invoiceDetailQuote').textContent = inv.quote_id ? '#' + inv.quote_id : '—';

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
      tdPrice.textContent = money(item.unit_price);
      const tdTotal = document.createElement('td');
      tdTotal.className = 'item-total';
      tdTotal.textContent = money(item.amount);
      tr.appendChild(tdDesc);
      tr.appendChild(tdQty);
      tr.appendChild(tdPrice);
      tr.appendChild(tdTotal);
      itemsBody.appendChild(tr);
    }

    document.getElementById('invoiceDetailSubtotal').textContent = money(inv.subtotal);
    document.getElementById('invoiceDetailDiscount').textContent = money(inv.discount_amount);
    document.getElementById('invoiceDetailTax').textContent = money(inv.tax_amount);
    document.getElementById('invoiceDetailTotal').textContent = money(inv.total);
    document.getElementById('invoiceDetailPaid').textContent = money(inv.amount_paid);
    document.getElementById('invoiceDetailBalance').textContent = money(inv.balance_due);
    document.getElementById('invoiceDetailTerms').textContent = inv.terms || '—';

    renderPaymentHistory(inv.payments || []);
    invoiceRecordPaymentBtn.disabled = Number(inv.balance_due) <= 0.0001;
    currentInvoiceBalance = Number(inv.balance_due) || 0;
  }

  let currentInvoiceBalance = 0;

  function renderPaymentHistory(payments) {
    const el = document.getElementById('invoicePaymentHistory');
    if (!payments || payments.length === 0) {
      el.innerHTML = '<p class="empty">No payments recorded yet.</p>';
      return;
    }
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
      amtTd.textContent = money(p.amount);
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

  // ---------- Record Payment modal ----------
  function openPaymentModal(invoiceId) {
    const inv = invoices.find((i) => i.id === invoiceId) ||
      (currentInvoiceId === invoiceId ? { balance_due: currentInvoiceBalance } : null);
    const balance = inv ? Number(inv.balance_due) : 0;

    paymentForm.reset();
    clearPaymentErrors();
    if (balance <= 0) {
      toast('This invoice has already been fully paid.', 'error');
      return;
    }
    paymentModalTitle.textContent = 'Record Payment';
    paymentBalanceDisplay.textContent = money(balance);
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

  // ---------- Events ----------
  invoiceBackBtn.addEventListener('click', () => { currentInvoiceId = null; loadInvoices(); showList(); });
  invoiceRecordPaymentBtn.addEventListener('click', () => {
    if (currentInvoiceId) openPaymentModal(currentInvoiceId);
  });

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

  invoiceDetailStatusSelect.addEventListener('change', () => {
    changeInvoiceStatus(invoiceDetailStatusSelect.value);
  });

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

  document.getElementById('paymentModalClose').addEventListener('click', closePaymentModal);
  document.getElementById('paymentCancelBtn').addEventListener('click', closePaymentModal);
  paymentModal.addEventListener('click', (e) => {
    if (e.target === paymentModal) closePaymentModal();
  });
  paymentForm.addEventListener('submit', handleRecordPayment);
  paymentAmountInput.addEventListener('input', clearPaymentErrors);
  paymentDateInput.addEventListener('input', clearPaymentErrors);

  // ---------- Init ----------
  async function init() {
    try {
      const profile = await window.electronAPI.getCompanyProfile();
      if (profile.ok && profile.profile && profile.profile.default_currency) {
        currencyCode = profile.profile.default_currency;
      }
    } catch (e) { /* keep default */ }
    await loadInvoices();
    showList();
  }

  init();
})();
