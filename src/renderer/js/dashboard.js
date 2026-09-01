(function () {
  const section = document.getElementById('page-dashboard');
  if (!section) return;

  const statOutstanding = document.getElementById('statOutstanding');
  const statOverdue = document.getElementById('statOverdue');
  const statOverdueCount = document.getElementById('statOverdueCount');
  const statInvoicedMonth = document.getElementById('statInvoicedMonth');
  const statInvoicedYear = document.getElementById('statInvoicedYear');
  const statPaidMonth = document.getElementById('statPaidMonth');
  const statPaidYear = document.getElementById('statPaidYear');
  const activityEl = document.getElementById('dashboardActivity');
  const overdueCard = document.getElementById('overdueCard');
  const dashNewQuoteBtn = document.getElementById('dashNewQuoteBtn');
  const dashNewInvoiceBtn = document.getElementById('dashNewInvoiceBtn');

  let currencyCode = 'USD';

  function money(amount) {
    return window.QuoteCraftUtils.formatCurrency(amount, currencyCode);
  }

  function statusBadge(label, className) {
    const s = document.createElement('span');
    s.className = 'badge status-' + (className || '');
    s.textContent = label;
    return s;
  }

  function renderStats(stats) {
    if (stats.reporting_currency) {
      currencyCode = stats.reporting_currency;
    }
    const noticeEl = document.getElementById('dashboardCurrencyNotice');
    if (noticeEl) {
      noticeEl.innerHTML = `
        <span class="currency-notice-icon">ℹ️</span>
        <span id="dashboardCurrencyNoticeText">Dashboard totals converted to reporting base currency (<strong id="dashBaseCurrencyCode">${currencyCode}</strong>). Multi-currency totals are approximate conversions based on exchange rates entered at invoice creation time.</span>
      `;
    }

    statOutstanding.textContent = money(stats.outstanding_balance);
    statOverdue.textContent = money(stats.overdue_balance);
    statOverdueCount.textContent = String(stats.overdue_count);
    statInvoicedMonth.textContent = money(stats.invoiced_month);
    statInvoicedYear.textContent = money(stats.invoiced_year);
    statPaidMonth.textContent = money(stats.paid_month);
    statPaidYear.textContent = money(stats.paid_year);
  }

  function renderActivity(activity) {
    if (!activity || activity.length === 0) {
      activityEl.innerHTML = window.QuoteCraftUtils.emptyStateHTML({
        icon: 'activity',
        title: 'No recent activity yet',
        message: 'Quotes and invoices you create will show up here.',
      });
      return;
    }

    const list = document.createElement('ul');
    list.className = 'activity-list';

    for (const item of activity) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'activity-item';

      const kind = document.createElement('span');
      kind.className = 'activity-kind ' + item.kind;
      kind.textContent = item.kind === 'quote' ? 'Quote' : 'Invoice';

      const main = document.createElement('span');
      main.className = 'activity-main';
      const title = document.createElement('span');
      title.className = 'activity-title';
      title.textContent = item.kind === 'quote' ? item.number + ' — ' + (item.client_name || 'Unknown client') : (item.number + ' — ' + (item.client_name || 'Unknown client'));
      const meta = document.createElement('span');
      meta.className = 'activity-meta';
      if (item.kind === 'quote') {
        meta.appendChild(statusBadge(item.status === 'accepted' ? 'Accepted' : item.status === 'declined' ? 'Declined' : item.status === 'sent' ? 'Sent' : 'Draft', item.status));
      } else {
        const st = window.QuoteCraftUtils.effectiveInvoiceStatus(item);
        meta.appendChild(statusBadge(window.QuoteCraftUtils.invoiceStatusLabel(st), st));
      }
      main.appendChild(title);
      main.appendChild(meta);

      const side = document.createElement('span');
      side.className = 'activity-side';
      const amount = document.createElement('span');
      amount.className = 'activity-amount';
      amount.textContent = window.QuoteCraftUtils.formatCurrency(item.total, item.currency || currencyCode);
      const date = document.createElement('span');
      date.className = 'activity-date';
      date.textContent = window.QuoteCraftUtils.formatDate(item.ts || item.created_at);
      side.appendChild(amount);
      side.appendChild(document.createElement('br'));
      side.appendChild(date);

      btn.appendChild(kind);
      btn.appendChild(main);
      btn.appendChild(side);

      btn.addEventListener('click', () => {
        if (item.kind === 'quote') {
          window.dispatchEvent(new CustomEvent('qc-open-quote', { detail: item.id }));
          window.QuoteCraftUtils.goToPage('quotes');
        } else {
          window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: item.id }));
          window.QuoteCraftUtils.goToPage('invoices');
        }
      });

      li.appendChild(btn);
      list.appendChild(li);
    }

    activityEl.innerHTML = '';
    activityEl.appendChild(list);
  }

  async function loadStats() {
    try {
      const res = await window.electronAPI.getDashboardStats();
      if (res.ok) {
        renderStats(res.stats);
        renderActivity(res.stats.activity);
      } else {
        throw new Error(res.errors && res.errors.general ? res.errors.general : 'Could not load dashboard.');
      }
    } catch (e) {
      activityEl.innerHTML = '<p class="empty">Could not load dashboard: ' + e.message + '</p>';
    }
  }

  async function checkDueRecurringDashboard() {
    const banner = document.getElementById('dashboardRecurringBanner');
    if (!banner) return;
    try {
      const res = await window.electronAPI.checkDueRecurring();
      if (res && res.ok && res.generatedCount > 0) {
        banner.classList.remove('hidden');
        banner.innerHTML = `
          <span>⚡ <strong>${res.generatedCount}</strong> recurring draft invoice${res.generatedCount > 1 ? 's were' : ' was'} generated automatically.</span>
          <button type="button" class="btn btn-small btn-primary" id="btnDismissDashBanner">View Invoices</button>
        `;
        const btn = banner.querySelector('#btnDismissDashBanner');
        if (btn) {
          btn.addEventListener('click', () => {
            banner.classList.add('hidden');
            window.QuoteCraftUtils.goToPage('invoices');
          });
        }
      }
    } catch (e) { /* ignore */ }
  }

  async function init() {
    try {
      const profile = await window.electronAPI.getCompanyProfile();
      if (profile.ok && profile.profile) {
        currencyCode = profile.profile.reporting_currency || profile.profile.default_currency || 'USD';
      }
    } catch (e) { /* keep default */ }
    await checkDueRecurringDashboard();
    await loadStats();
  }

  document.addEventListener('pagechange', async (e) => {
    if (e.detail === 'dashboard') {
      await checkDueRecurringDashboard();
      loadStats();
    }
  });

  overdueCard.addEventListener('click', () => {
    const filter = document.getElementById('invoiceStatusFilter');
    if (filter) {
      filter.value = 'overdue';
      filter.dispatchEvent(new Event('change'));
    }
    window.QuoteCraftUtils.goToPage('invoices');
  });

  overdueCard.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      overdueCard.click();
    }
  });

  dashNewQuoteBtn.addEventListener('click', () => {
    window.QuoteCraftUtils.goToPage('quotes');
    const btn = document.getElementById('newQuoteBtn');
    if (btn) btn.click();
  });

  dashNewInvoiceBtn.addEventListener('click', () => {
    window.QuoteCraftUtils.goToPage('invoices');
    window.QuoteCraftUtils.showToast('Invoices are created by converting an accepted quote.', 'success');
  });

  init();
})();