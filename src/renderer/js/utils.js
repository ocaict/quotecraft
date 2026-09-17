window.QuoteCraftUtils = {
  goToPage(pageName) {
    document.querySelectorAll('#nav a').forEach((a) => {
      a.classList.toggle('active', a.dataset.page === pageName);
    });
    document.querySelectorAll('.page').forEach((p) => {
      p.classList.toggle('active', p.id === 'page-' + pageName);
    });
    document.dispatchEvent(new CustomEvent('pagechange', { detail: pageName }));
  },

  // Overdue is calculated, not stored: past due date with a balance still owed.
  // When money has been refunded via credit notes, net paid (paid - credited) determines partial payment.
  effectiveInvoiceStatus(inv) {
    if (Number(inv.balance_due) <= 0.0001) return 'paid';
    if (inv.date_due) {
      const due = new Date(String(inv.date_due) + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (!isNaN(due.getTime()) && due < today) return 'overdue';
    }
    const netPaid = Math.max(0, Math.round(((Number(inv.amount_paid) || 0) - (Number(inv.amount_credited) || 0)) * 100) / 100);
    if (netPaid > 0.0001) return 'partially_paid';
    return inv.status || 'draft';
  },

  invoiceStatusLabel(status) {
    const map = {
      draft: 'Draft',
      sent: 'Sent',
      partially_paid: 'Partially paid',
      paid: 'Paid',
      overdue: 'Overdue',
    };
    return map[status] || status;
  },

  formatCurrency(amount, currencyCode) {
    const currency = (window.CURRENCIES || []).find((c) => c.code === currencyCode);
    const symbol = currency ? currency.symbol : (currencyCode || '') + ' ';
    const value = Number(amount || 0).toFixed(2);
    return symbol + value;
  },

  formatDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString();
  },

  formatDateTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString();
  },

  showToast(message, type) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // Renders a friendly centered empty state (icon, title, message, optional action
  // button). Returns an HTML string; wire the button up with querySelector after.
  emptyStateHTML({ icon, title, message, actionLabel }) {
    const esc = (s) => String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const glyphs = {
      clients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      quotes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
      invoices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>',
      items: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>',
      search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
      activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    };

    return (
      '<div class="empty-state">' +
        '<div class="empty-state-icon">' + (glyphs[icon] || glyphs.quotes) + '</div>' +
        '<p class="empty-state-title">' + esc(title) + '</p>' +
        '<p class="empty-state-message">' + esc(message || '') + '</p>' +
        (actionLabel
          ? '<button type="button" class="btn btn-primary empty-state-action" data-empty-action>' + esc(actionLabel) + '</button>'
          : '') +
      '</div>'
    );
  },

  // Promise-based confirm dialog. Resolves true if the user confirms, false otherwise.
  confirmAction({ title, message, confirmText, cancelText, danger }) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirmModal');
      if (!modal) {
        resolve(false);
        return;
      }
      const closeBtn = document.getElementById('confirmModalClose');
      const cancelBtn = document.getElementById('confirmCancelBtn');
      const okBtn = document.getElementById('confirmOkBtn');
      const titleEl = document.getElementById('confirmModalTitle');
      const msgEl = document.getElementById('confirmModalMessage');

      const cleanup = () => {
        modal.classList.add('hidden');
        closeBtn.removeEventListener('click', onClose);
        cancelBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
        okBtn.removeEventListener('click', onOk);
      };
      function onOk() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }
      function onClose() { cleanup(); resolve(false); }
      function onBackdrop(e) { if (e.target === modal) { cleanup(); resolve(false); } }

      titleEl.textContent = title || 'Are you sure?';
      msgEl.textContent = message || '';
      okBtn.textContent = confirmText || 'Confirm';
      okBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
      cancelBtn.textContent = cancelText || 'Cancel';

      modal.classList.remove('hidden');
      okBtn.focus();
      closeBtn.addEventListener('click', onClose);
      cancelBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
      okBtn.addEventListener('click', onOk);
    });
  },

  // Downloads an array-of-arrays as a CSV file. Headers are the first row.
  // Every cell is quoted/escaped so commas, quotes, and newlines survive;
  // a UTF-8 BOM is prepended so Excel opens the file cleanly. Pass money
  // values as plain numbers (e.g. 1234.56), not formatted strings.
  downloadCSV(filename, rows) {
    const quote = (val) =>
      '"' + String(val === null || val === undefined ? '' : val).replace(/"/g, '""') + '"';
    const csv = rows.map((row) => row.map(quote).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  showBusy(label) {
    const overlay = document.getElementById('busyOverlay');
    if (!overlay) return;
    const labelEl = document.getElementById('busyLabel');
    if (labelEl && label) labelEl.textContent = label;
    overlay.classList.remove('hidden');
  },

  hideBusy() {
    const overlay = document.getElementById('busyOverlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
  },
};