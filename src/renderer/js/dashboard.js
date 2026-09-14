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
  const statExpensesMonth = document.getElementById('statExpensesMonth');
  const statExpensesYear = document.getElementById('statExpensesYear');
  const statProfitMonth = document.getElementById('statProfitMonth');
  const statProfitYear = document.getElementById('statProfitYear');
  const dashExpensesMonthCard = document.getElementById('dashExpensesMonthCard');
  const dashExpensesYearCard = document.getElementById('dashExpensesYearCard');
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

    if (statExpensesMonth) statExpensesMonth.textContent = money(stats.expenses_month || 0);
    if (statExpensesYear) statExpensesYear.textContent = money(stats.expenses_year || 0);

    if (statProfitMonth) {
      const pm = Number(stats.profit_month) || 0;
      statProfitMonth.textContent = money(pm);
      statProfitMonth.className = 'stat-value ' + (pm >= 0 ? 'profit-positive' : 'profit-negative');
    }

    if (statProfitYear) {
      const py = Number(stats.profit_year) || 0;
      statProfitYear.textContent = money(py);
      statProfitYear.className = 'stat-value ' + (py >= 0 ? 'profit-positive' : 'profit-negative');
    }
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

  let currentDueReminders = [];

  async function checkDueRemindersDashboard() {
    const card = document.getElementById('dashboardRemindersCard');
    const listEl = document.getElementById('dashboardRemindersList');
    const badgeEl = document.getElementById('dashRemindersCountBadge');
    const countEl = document.getElementById('dashSendAllCount');
    const sendAllBtn = document.getElementById('dashSendAllRemindersBtn');
    if (!card || !listEl) return;

    try {
      try {
        const autoRes = await window.electronAPI.checkAutoSendReminders();
        if (autoRes && autoRes.ok && autoRes.sentCount > 0) {
          window.QuoteCraftUtils.showToast(`⚡ Automatically dispatched ${autoRes.sentCount} payment reminder${autoRes.sentCount > 1 ? 's' : ''}`, 'info');
        }
      } catch (e) {
        /* ignore */
      }

      const res = await window.electronAPI.getDueReminders();
      if (!res || !res.ok) {
        card.classList.add('hidden');
        return;
      }

      currentDueReminders = res.reminders || [];
      if (!currentDueReminders.length) {
        card.classList.add('hidden');
        return;
      }

      card.classList.remove('hidden');
      if (badgeEl) badgeEl.textContent = `${currentDueReminders.length} due`;
      if (countEl) countEl.textContent = String(currentDueReminders.length);
      if (sendAllBtn) sendAllBtn.disabled = false;

      listEl.innerHTML = '';
      for (const item of currentDueReminders) {
        const row = document.createElement('div');
        row.className = 'reminder-item-card';

        let badgeClass = 'before';
        let badgeText = '';
        if (item.timing_type === 'before_due') {
          badgeText = `⏳ Due in ${item.days_until_due} day${item.days_until_due === 1 ? '' : 's'}`;
          badgeClass = 'before';
        } else if (item.timing_type === 'on_due') {
          badgeText = `📅 Due Today`;
          badgeClass = 'on_due';
        } else if (item.timing_type === 'after_due') {
          badgeText = `⚠️ ${item.days_overdue} day${item.days_overdue === 1 ? '' : 's'} overdue`;
          badgeClass = 'overdue';
        }

        const formattedBal = window.QuoteCraftUtils.formatCurrency(item.balance_due, item.currency || currencyCode);
        const formattedDue = item.date_due ? window.QuoteCraftUtils.formatDate(item.date_due) : '—';

        row.innerHTML = `
          <div class="reminder-item-main">
            <span class="reminder-timing-badge ${badgeClass}">${badgeText}</span>
            <div>
              <a href="#" class="reminder-item-number" data-invoice-id="${item.invoice_id}">${item.invoice_number}</a>
              <div class="reminder-item-client">${item.client_name || 'Client'}</div>
              <div class="reminder-item-email">${item.recipient_to || '<span class="text-danger" style="color:var(--danger)">No email on file</span>'}</div>
            </div>
          </div>
          <div class="reminder-item-amounts">
            <div class="reminder-item-balance">${formattedBal}</div>
            <div class="reminder-item-duedate">Due: ${formattedDue}</div>
          </div>
          <div class="reminder-item-actions">
            <button type="button" class="btn btn-small btn-ghost btn-review-reminder" data-invoice-id="${item.invoice_id}" title="Review drafted reminder email before sending">✏️ Review & Send</button>
            <button type="button" class="btn btn-small btn-primary btn-send-now-reminder" data-invoice-id="${item.invoice_id}">🚀 Send Now</button>
          </div>
        `;

        const numLink = row.querySelector('.reminder-item-number');
        if (numLink) {
          numLink.addEventListener('click', (e) => {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: item.invoice_id }));
            window.QuoteCraftUtils.goToPage('invoices');
          });
        }

        const reviewBtn = row.querySelector('.btn-review-reminder');
        if (reviewBtn) {
          reviewBtn.addEventListener('click', async () => {
            const invRes = await window.electronAPI.getInvoice(item.invoice_id);
            if (!invRes || !invRes.ok || !invRes.invoice) {
              window.QuoteCraftUtils.showToast('Could not load invoice details', 'error');
              return;
            }
            window.QuoteCraftDocumentEmail.openSendModal({
              documentType: 'invoice',
              documentId: item.invoice_id,
              doc: invRes.invoice,
              modalTitle: `Payment Reminder: ${item.invoice_number}`,
              prefillTo: item.recipient_to,
              prefillSubject: item.subject,
              prefillMessage: item.message,
              reminderRuleId: item.rule_id,
              onSuccess: async () => {
                await checkDueRemindersDashboard();
                loadStats();
              },
            });
          });
        }

        const sendNowBtn = row.querySelector('.btn-send-now-reminder');
        if (sendNowBtn) {
          sendNowBtn.addEventListener('click', async () => {
            if (!item.recipient_to) {
              window.QuoteCraftUtils.showToast('No recipient email found for this client/contact. Click Review & Send to enter an email.', 'error');
              return;
            }
            sendNowBtn.disabled = true;
            sendNowBtn.innerHTML = '<span class="btn-spinner"></span>';
            try {
              const res = await window.electronAPI.sendReminder({
                invoiceId: item.invoice_id,
                ruleId: item.rule_id,
                to: item.recipient_to,
                cc: item.recipient_cc,
                subject: item.subject,
                message: item.message,
              });

              if (res && res.ok) {
                window.QuoteCraftUtils.showToast(`Reminder sent to ${item.recipient_to}`, 'success');
                await checkDueRemindersDashboard();
                loadStats();
              } else {
                window.QuoteCraftUtils.showToast(res?.error || 'Failed to send reminder', 'error');
                sendNowBtn.disabled = false;
                sendNowBtn.innerHTML = '🚀 Send Now';
              }
            } catch (err) {
              window.QuoteCraftUtils.showToast(err.message, 'error');
              sendNowBtn.disabled = false;
              sendNowBtn.innerHTML = '🚀 Send Now';
            }
          });
        }

        listEl.appendChild(row);
      }
    } catch (err) {
      console.error('Error in checkDueRemindersDashboard:', err);
      card.classList.add('hidden');
    }
  }

  const sendAllRemindersBtn = document.getElementById('dashSendAllRemindersBtn');
  if (sendAllRemindersBtn) {
    sendAllRemindersBtn.addEventListener('click', async () => {
      if (!currentDueReminders.length) return;
      const count = currentDueReminders.length;
      const confirm = await window.QuoteCraftUtils.confirmAction({
        title: `Send All ${count} Payment Reminders?`,
        message: `QuoteCraft will attach the invoice PDFs and dispatch ${count} reminder email${count > 1 ? 's' : ''} to the primary contacts on file. Continue?`,
        confirmText: `Send All (${count})`,
      });
      if (!confirm) return;

      sendAllRemindersBtn.disabled = true;
      sendAllRemindersBtn.innerHTML = '<span class="btn-spinner"></span> Sending batch...';

      try {
        const res = await window.electronAPI.sendBatchReminders(currentDueReminders);
        if (res && res.ok) {
          if (res.failedCount > 0) {
            window.QuoteCraftUtils.showToast(`Sent ${res.sentCount} reminder(s), ${res.failedCount} failed. Check email settings.`, 'warning');
          } else {
            window.QuoteCraftUtils.showToast(`All ${res.sentCount} payment reminder(s) sent successfully!`, 'success');
          }
          await checkDueRemindersDashboard();
          loadStats();
        } else {
          window.QuoteCraftUtils.showToast(res?.error || 'Batch sending failed', 'error');
        }
      } catch (err) {
        window.QuoteCraftUtils.showToast(err.message, 'error');
      } finally {
        sendAllRemindersBtn.disabled = false;
        sendAllRemindersBtn.innerHTML = `📨 Send All (<span id="dashSendAllCount">${currentDueReminders.length}</span>)`;
      }
    });
  }

  async function init() {
    try {
      const profile = await window.electronAPI.getCompanyProfile();
      if (profile.ok && profile.profile) {
        currencyCode = profile.profile.reporting_currency || profile.profile.default_currency || 'USD';
      }
    } catch (e) { /* keep default */ }
    await checkDueRecurringDashboard();
    await checkDueRemindersDashboard();
    await loadStats();
  }

  document.addEventListener('pagechange', async (e) => {
    if (e.detail === 'dashboard') {
      await checkDueRecurringDashboard();
      await checkDueRemindersDashboard();
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

  if (dashExpensesMonthCard) {
    dashExpensesMonthCard.addEventListener('click', () => {
      window.QuoteCraftUtils.goToPage('expenses');
      window.dispatchEvent(new CustomEvent('qc-set-expenses-preset', { detail: 'this_month' }));
    });
  }

  if (dashExpensesYearCard) {
    dashExpensesYearCard.addEventListener('click', () => {
      window.QuoteCraftUtils.goToPage('expenses');
      window.dispatchEvent(new CustomEvent('qc-set-expenses-preset', { detail: 'this_year' }));
    });
  }

  const dashProfitMonthCard = document.getElementById('dashProfitMonthCard');
  if (dashProfitMonthCard) {
    dashProfitMonthCard.addEventListener('click', () => {
      window.QuoteCraftUtils.goToPage('profit-loss');
      const presetSelect = document.getElementById('plDatePreset');
      if (presetSelect) {
        presetSelect.value = 'this_month';
        presetSelect.dispatchEvent(new Event('change'));
      }
    });
  }

  const dashProfitYearCard = document.getElementById('dashProfitYearCard');
  if (dashProfitYearCard) {
    dashProfitYearCard.addEventListener('click', () => {
      window.QuoteCraftUtils.goToPage('profit-loss');
      const presetSelect = document.getElementById('plDatePreset');
      if (presetSelect) {
        presetSelect.value = 'this_year';
        presetSelect.dispatchEvent(new Event('change'));
      }
    });
  }

  init();
})();