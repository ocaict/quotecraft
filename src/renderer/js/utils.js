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

  _settings: {
    date_format: 'MMM D, YYYY',
    decimal_separator: '.',
  },

  setSettings(profile) {
    if (!profile) return;
    if (profile.date_format) this._settings.date_format = profile.date_format;
    if (profile.decimal_separator) this._settings.decimal_separator = profile.decimal_separator;
  },

  formatNumber(val, decimals = 2) {
    const num = Math.round((Number(val || 0) + 1e-9) * Math.pow(10, decimals)) / Math.pow(10, decimals);
    const sep = (this._settings && this._settings.decimal_separator) || '.';
    const thousandSep = sep === ',' ? '.' : ',';
    const parts = num.toFixed(decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep);
    return decimals > 0 ? parts.join(sep) : parts[0];
  },

  formatCurrency(amount, currencyCode) {
    const currency = (window.CURRENCIES || []).find((c) => c.code === currencyCode);
    const symbol = currency ? currency.symbol : (currencyCode ? currencyCode + ' ' : '');
    return symbol + this.formatNumber(amount, 2);
  },

  formatDate(isoString, customFormat) {
    if (!isoString) return '';
    const datePart = String(isoString).split('T')[0];
    const parts = datePart.split('-');
    let d;
    if (parts.length === 3) {
      d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    } else {
      d = new Date(isoString);
    }
    if (isNaN(d.getTime())) return String(isoString);

    const fmt = customFormat || (this._settings && this._settings.date_format) || 'MMM D, YYYY';
    const year = d.getFullYear();
    const month = d.getMonth();
    const day = d.getDate();
    const pad = (n) => (n < 10 ? '0' + n : String(n));

    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthsFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    switch (fmt) {
      case 'DD/MM/YYYY':
        return `${pad(day)}/${pad(month + 1)}/${year}`;
      case 'MM/DD/YYYY':
        return `${pad(month + 1)}/${pad(day)}/${year}`;
      case 'YYYY-MM-DD':
        return `${year}-${pad(month + 1)}-${pad(day)}`;
      case 'D MMMM YYYY':
        return `${day} ${monthsFull[month]} ${year}`;
      case 'MMM D, YYYY':
      default:
        return `${monthsShort[month]} ${day}, ${year}`;
    }
  },

  formatDateTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const dateFormatted = this.formatDate(isoString);
    const timeFormatted = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${dateFormatted} ${timeFormatted}`;
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
      projects: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
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

  openPdfPreview(options) {
    const opts = options || {};
    const modal = document.getElementById('pdfPreviewModal');
    const titleEl = document.getElementById('pdfPreviewTitle');
    const iframe = document.getElementById('pdfPreviewIframe');
    const dlBtn = document.getElementById('pdfPreviewDownloadBtn');
    const closeBtn = document.getElementById('pdfPreviewCloseBtn');
    if (!modal || !iframe) return;

    if (titleEl) titleEl.textContent = opts.title || 'PDF Preview';
    iframe.src = opts.dataUrl || 'about:blank';

    function close() {
      modal.classList.add('hidden');
      iframe.src = 'about:blank';
      modal.removeEventListener('click', onBackdrop);
      if (closeBtn) closeBtn.removeEventListener('click', close);
      if (dlBtn) dlBtn.onclick = null;
    }

    function onBackdrop(e) {
      if (e.target === modal) close();
    }

    modal.classList.remove('hidden');
    modal.addEventListener('click', onBackdrop);
    if (closeBtn) closeBtn.addEventListener('click', close, { once: true });

    if (dlBtn) {
      dlBtn.onclick = () => {
        if (typeof opts.onDownload === 'function') {
          opts.onDownload();
        }
      };
    }
  },

  // Mounts the "Unbilled Time" card used by the client and project overview
  // screens: lists unbilled time entries in the given scope with per-row
  // checkboxes, then creates one standard draft invoice (one grouped line per
  // distinct rate) from the selected entries. Selected entries are marked
  // Billed and locked by the main process. Returns { reload } or null.
  mountUnbilledTimeCard(config) {
    const opts = config || {};
    const bodyEl = document.getElementById(opts.bodyId);
    const countEl = document.getElementById(opts.countId);
    const selectAllEl = document.getElementById(opts.selectAllId);
    const createBtn = document.getElementById(opts.createBtnId);
    const summaryEl = document.getElementById(opts.summaryId);
    if (!bodyEl) return null;

    const showProject = opts.showProject !== false;
    const scope = opts.scope || {};
    const currency = opts.currency || 'USD';
    const colCount = showProject ? 7 : 6;

    let entries = [];
    let selected = new Set();
    let taxRate = 0;
    let taxLoaded = false;

    const money = (v) => QuoteCraftUtils.formatCurrency(v, currency);
    const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

    function updateControls() {
      const chosen = entries.filter((e) => selected.has(e.id));
      const hours = chosen.reduce((s, e) => s + (Number(e.hours) || 0), 0);
      const amount = chosen.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      if (createBtn) {
        createBtn.disabled = chosen.length === 0;
        createBtn.textContent = chosen.length === 0
          ? 'Create Invoice from Selected'
          : 'Create Invoice from Selected (' + chosen.length + ')';
      }
      if (summaryEl) {
        summaryEl.textContent = chosen.length === 0
          ? ''
          : chosen.length + ' selected · ' + round2(hours).toFixed(2) + ' h · ' + money(amount);
      }
      if (selectAllEl) {
        selectAllEl.checked = entries.length > 0 && chosen.length === entries.length;
        selectAllEl.indeterminate = chosen.length > 0 && chosen.length < entries.length;
      }
    }

    function render() {
      bodyEl.innerHTML = '';
      if (countEl) countEl.textContent = entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies');
      if (entries.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = colCount;
        td.style.textAlign = 'center';
        td.style.color = 'var(--text-muted)';
        td.style.padding = '24px';
        td.textContent = opts.emptyText || 'No unbilled time entries in this scope.';
        tr.appendChild(td);
        bodyEl.appendChild(tr);
        return;
      }

      entries.forEach((e) => {
        const tr = document.createElement('tr');

        const checkTd = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selected.has(e.id);
        cb.setAttribute('aria-label', 'Select time entry');
        cb.onchange = () => {
          if (cb.checked) selected.add(e.id); else selected.delete(e.id);
          updateControls();
        };
        checkTd.appendChild(cb);

        const dateTd = document.createElement('td');
        dateTd.textContent = QuoteCraftUtils.formatDate(e.date);

        const descTd = document.createElement('td');
        descTd.className = 'cell-name';
        descTd.textContent = e.description || '—';

        tr.appendChild(checkTd);
        tr.appendChild(dateTd);
        tr.appendChild(descTd);

        if (showProject) {
          const projTd = document.createElement('td');
          projTd.textContent = e.project_name || '—';
          tr.appendChild(projTd);
        }

        const hoursTd = document.createElement('td');
        hoursTd.textContent = Number(e.hours).toFixed(2);

        const rateTd = document.createElement('td');
        rateTd.textContent = money(e.hourly_rate);

        const amountTd = document.createElement('td');
        amountTd.className = 'cell-balance';
        amountTd.textContent = money(e.amount);

        tr.appendChild(hoursTd);
        tr.appendChild(rateTd);
        tr.appendChild(amountTd);
        bodyEl.appendChild(tr);
      });
    }

    async function reload() {
      selected = new Set();
      try {
        const filter = { billed: 'unbilled' };
        if (scope.clientId) filter.client_id = scope.clientId;
        if (scope.projectId) filter.project_id = scope.projectId;
        const res = await window.electronAPI.listTimeEntries(filter);
        entries = res && res.ok && Array.isArray(res.entries) ? res.entries : [];
      } catch (e) {
        entries = [];
      }
      if (!taxLoaded) {
        taxLoaded = true;
        try {
          const p = await window.electronAPI.getCompanyProfile();
          taxRate = p && p.ok && p.profile ? Math.max(0, Number(p.profile.default_tax_rate) || 0) : 0;
        } catch (e) { /* ignore */ }
      }
      render();
      updateControls();
    }

    async function create() {
      const chosen = entries.filter((e) => selected.has(e.id));
      if (chosen.length === 0) return;

      const hours = round2(chosen.reduce((s, e) => s + (Number(e.hours) || 0), 0));
      const subtotal = round2(chosen.reduce((s, e) => s + (Number(e.amount) || 0), 0));
      const tax = round2(subtotal * (taxRate / 100));
      const total = round2(subtotal + tax);
      const rates = new Set(chosen.map((e) => Number(e.hourly_rate) || 0));

      const ok = await QuoteCraftUtils.confirmAction({
        title: 'Create invoice from time?',
        message:
          'Bill ' + chosen.length + ' time entr' + (chosen.length === 1 ? 'y' : 'ies') +
          ' (' + hours.toFixed(2) + ' h across ' + rates.size + ' rate' + (rates.size === 1 ? '' : 's') + '). ' +
          'Subtotal ' + money(subtotal) + ' + tax ' + money(tax) + ' = ' + money(total) + '. ' +
          'This creates a draft invoice and locks the selected entries.',
        confirmText: 'Create invoice',
      });
      if (!ok) return;

      try {
        const res = await window.electronAPI.createInvoiceFromTimeEntries({
          client_id: scope.clientId,
          project_id: scope.projectId || null,
          entry_ids: chosen.map((e) => e.id),
        });
        if (!res || !res.ok || !res.invoice) {
          const msg = res && res.errors && res.errors.general ? res.errors.general : 'Could not create invoice from time.';
          QuoteCraftUtils.showToast(msg, 'error');
          return;
        }
        QuoteCraftUtils.showToast('Invoice ' + res.invoice.invoice_number + ' created · ' + money(res.invoice.total), 'success');
        if (typeof opts.onCreated === 'function') opts.onCreated(res.invoice);
        else await reload();
      } catch (e) {
        QuoteCraftUtils.showToast('Could not create invoice: ' + e.message, 'error');
      }
    }

    if (selectAllEl) {
      selectAllEl.onchange = () => {
        selected = new Set();
        if (selectAllEl.checked) entries.forEach((e) => selected.add(e.id));
        render();
        updateControls();
      };
    }
    if (createBtn) createBtn.onclick = create;

    reload();
    return { reload };
  },

  // Initializes quick date preset chip bar associated with a preset <select> element
  initDateChips(chipBarEl, selectEl, onSelect) {
    if (!chipBarEl || !selectEl) return null;
    const chips = chipBarEl.querySelectorAll('.date-chip');

    function sync() {
      const val = selectEl.value;
      chips.forEach((c) => {
        c.classList.toggle('active', c.dataset.preset === val);
      });
    }

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const preset = chip.dataset.preset;
        if (!preset) return;
        selectEl.value = preset;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        sync();
        if (typeof onSelect === 'function') {
          onSelect(preset);
        }
      });
    });

    selectEl.addEventListener('change', sync);
    sync();

    return { sync };
  },

  /**
   * Adds keyboard navigation to a <tbody> element.
   * - Arrow Up / Down: moves focus to prev/next row
   * - Home / End: jump to first / last row
   * - Enter / Space: activates the first actionable button in the focused row
   *
   * @param {HTMLElement} tbody - the <tbody> to attach navigation to
   * @param {object} [opts]
   * @param {string} [opts.actionSelector] - CSS selector for primary action (default: 'button:not([disabled])')
   * @param {Function} [opts.onActivate] - optional callback(row, event) instead of clicking primary action
   */
  addTableKeyNav(tbody, opts) {
    if (!tbody) return;
    opts = opts || {};
    const actionSel = opts.actionSelector || 'button:not([disabled])';

    function rows() {
      return Array.from(tbody.querySelectorAll('tr[tabindex]'));
    }

    function focusRow(tr) {
      if (tr) tr.focus();
    }

    function refreshTabIndex() {
      tbody.querySelectorAll('tr').forEach(function (tr) {
        if (!tr.hasAttribute('tabindex')) {
          tr.setAttribute('tabindex', '0');
        }
      });
    }

    var observer = new MutationObserver(refreshTabIndex);
    observer.observe(tbody, { childList: true });
    refreshTabIndex();

    tbody.addEventListener('keydown', function (e) {
      var all = rows();
      var focused = document.activeElement;
      var idx = all.indexOf(focused);
      if (idx === -1) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusRow(all[Math.min(idx + 1, all.length - 1)]);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusRow(all[Math.max(idx - 1, 0)]);
      } else if (e.key === 'Home') {
        e.preventDefault();
        focusRow(all[0]);
      } else if (e.key === 'End') {
        e.preventDefault();
        focusRow(all[all.length - 1]);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (typeof opts.onActivate === 'function') {
          opts.onActivate(focused, e);
        } else {
          var btn = focused.querySelector(actionSel);
          if (btn) btn.click();
        }
      }
    });
  },

  /**
   * Creates a reusable paginator.
   *
   * @param {object} opts
   *   - containerEl   {HTMLElement}  Where to render pagination controls
   *   - pageSizes     {number[]}     Available page sizes (default [25, 50, 100])
   *   - defaultSize   {number}       Initial page size (default 25)
   *   - onNavigate    {Function}     Called when the user changes page or page size
   * @returns {{ paginate, reset, currentPage, pageSize }}
   */
  createPaginator(opts = {}) {
    const containerEl = opts.containerEl;
    const pageSizes = opts.pageSizes || [25, 50, 100];
    let pageSize = opts.defaultSize || pageSizes[0] || 25;
    let currentPage = 1;
    let totalItems = 0;

    function totalPages() {
      return Math.max(1, Math.ceil(totalItems / pageSize));
    }

    function renderControls() {
      if (!containerEl) return;
      const pages = totalPages();

      if (totalItems <= pageSizes[0]) {
        containerEl.innerHTML = '';
        return;
      }

      // Build page window (show at most 5 page numbers)
      const windowSize = 5;
      let start = Math.max(1, currentPage - Math.floor(windowSize / 2));
      let end = Math.min(pages, start + windowSize - 1);
      if (end - start + 1 < windowSize) start = Math.max(1, end - windowSize + 1);

      const pageNums = [];
      if (start > 1) pageNums.push({ label: '1', page: 1 });
      if (start > 2) pageNums.push({ label: '…', page: null });
      for (let p = start; p <= end; p++) pageNums.push({ label: String(p), page: p });
      if (end < pages - 1) pageNums.push({ label: '…', page: null });
      if (end < pages) pageNums.push({ label: String(pages), page: pages });

      const from = Math.min((currentPage - 1) * pageSize + 1, totalItems);
      const to = Math.min(currentPage * pageSize, totalItems);

      containerEl.innerHTML = `
        <div class="pagination-bar">
          <span class="pagination-info">${from}–${to} of ${totalItems}</span>
          <div class="pagination-controls">
            <button class="pg-btn pg-prev" ${currentPage <= 1 ? 'disabled' : ''} title="Previous page">&#8249;</button>
            ${pageNums.map(n => n.page === null
              ? `<span class="pg-ellipsis">…</span>`
              : `<button class="pg-btn pg-num${n.page === currentPage ? ' pg-active' : ''}" data-page="${n.page}">${n.label}</button>`
            ).join('')}
            <button class="pg-btn pg-next" ${currentPage >= pages ? 'disabled' : ''} title="Next page">&#8250;</button>
          </div>
          <select class="pg-size-select" title="Items per page">
            ${pageSizes.map(s => `<option value="${s}"${s === pageSize ? ' selected' : ''}>${s} / page</option>`).join('')}
            <option value="all"${pageSize === 'all' ? ' selected' : ''}>All</option>
          </select>
        </div>`;

      containerEl.querySelector('.pg-prev').addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; notify(); }
      });
      containerEl.querySelector('.pg-next').addEventListener('click', () => {
        if (currentPage < pages) { currentPage++; notify(); }
      });
      containerEl.querySelectorAll('.pg-num').forEach(btn => {
        btn.addEventListener('click', () => {
          currentPage = Number(btn.dataset.page);
          notify();
        });
      });
      containerEl.querySelector('.pg-size-select').addEventListener('change', e => {
        pageSize = e.target.value === 'all' ? 'all' : Number(e.target.value);
        currentPage = 1;
        notify();
      });
    }

    function notify() {
      renderControls();
      if (typeof opts.onNavigate === 'function') opts.onNavigate();
    }

    return {
      /** Slice `items` to the current page and refresh controls. Returns the page slice. */
      paginate(items) {
        totalItems = items.length;
        renderControls();
        if (pageSize === 'all') return items;
        const start = (currentPage - 1) * pageSize;
        return items.slice(start, start + pageSize);
      },
      /** Reset to page 1 (call before applying a new filter/sort). */
      reset() {
        currentPage = 1;
      },
      get currentPage() { return currentPage; },
      get pageSize() { return pageSize; },
    };
  },
};