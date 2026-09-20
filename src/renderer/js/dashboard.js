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
  const statRecurringActive = document.getElementById('statRecurringActive');
  const statRecurringBadge = document.getElementById('statRecurringBadge');
  const statRecurringSub = document.getElementById('statRecurringSub');
  const statRecurringNext = document.getElementById('statRecurringNext');
  const dashRecurringCard = document.getElementById('dashRecurringCard');
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

  // ── Utility: MoM trend badge ──────────────────────────────────────────────
  function renderTrendBadge(el, current, prev) {
    if (!el) return;
    if (!prev || prev === 0) {
      if (current === 0) { el.classList.add('hidden'); return; }
      el.className = 'kpi-trend-badge trend-up';
      el.textContent = 'New';
      el.classList.remove('hidden');
      return;
    }
    const pct = ((current - prev) / prev) * 100;
    const abs = Math.abs(pct).toFixed(1);
    if (Math.abs(pct) < 0.05) {
      el.className = 'kpi-trend-badge trend-neutral';
      el.textContent = '→ 0%';
    } else if (pct > 0) {
      el.className = 'kpi-trend-badge trend-up';
      el.textContent = '▲ ' + abs + '%';
    } else {
      el.className = 'kpi-trend-badge trend-down';
      el.textContent = '▼ ' + abs + '%';
    }
    el.classList.remove('hidden');
  }

  // ── Utility: SVG sparkline ─────────────────────────────────────────────────
  function drawSparkline(svgEl, dataPoints, className) {
    if (!svgEl || !dataPoints || dataPoints.length < 2) return;
    svgEl.innerHTML = '';
    if (className) svgEl.classList.add(className);

    const W = 80, H = 28, PAD = 2;
    const maxVal = Math.max(...dataPoints, 1);
    const xs = dataPoints.map((_, i) => PAD + (i / (dataPoints.length - 1)) * (W - PAD * 2));
    const ys = dataPoints.map(v => H - PAD - ((v / maxVal) * (H - PAD * 2)));

    const polyPts = xs.map((x, i) => x + ',' + ys[i]).join(' ');
    const areaPts = xs[0] + ',' + H + ' ' + polyPts + ' ' + xs[xs.length - 1] + ',' + H;

    const area = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    area.setAttribute('points', areaPts);
    area.setAttribute('class', 'spark-area');
    svgEl.appendChild(area);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', polyPts);
    line.setAttribute('class', 'spark-line');
    svgEl.appendChild(line);
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

    // ── MoM trend badges ──────────────────────────────────────────────────────
    renderTrendBadge(
      document.getElementById('trendInvoicedMonth'),
      Number(stats.invoiced_month) || 0,
      Number(stats.invoiced_prev_month) || 0
    );
    renderTrendBadge(
      document.getElementById('trendPaidMonth'),
      Number(stats.paid_month) || 0,
      Number(stats.paid_prev_month) || 0
    );

    // ── Sparklines ────────────────────────────────────────────────────────────
    if (Array.isArray(stats.sparkline_data) && stats.sparkline_data.length >= 2) {
      const invoicedPts = stats.sparkline_data.map(d => Number(d.invoiced) || 0);
      const paidPts = stats.sparkline_data.map(d => Number(d.paid) || 0);
      drawSparkline(document.getElementById('sparkInvoiced'), invoicedPts, null);
      drawSparkline(document.getElementById('sparkPaid'), paidPts, 'spark-paid');
    }

    // ── Collection ratio bar ──────────────────────────────────────────────────
    const totalInvoiced = Number(stats.invoiced_year) || 0;
    const totalPaid = Number(stats.paid_year) || 0;
    const ratioWrap = document.getElementById('collectionRatioWrap');
    const ratioBar = document.getElementById('collectionRatioBar');
    const ratioText = document.getElementById('collectionRatioText');
    const ratioPct = document.getElementById('collectionRatioPct');
    if (ratioWrap && totalInvoiced > 0) {
      const pct = Math.min(100, Math.round((totalPaid / totalInvoiced) * 1000) / 10);
      ratioText.textContent = 'Collected ' + money(totalPaid) + ' / ' + money(totalInvoiced);
      ratioPct.textContent = pct + '%';
      ratioWrap.classList.remove('hidden');
      // Animate after a brief paint delay
      setTimeout(() => { if (ratioBar) ratioBar.style.width = pct + '%'; }, 80);
    } else if (ratioWrap) {
      ratioWrap.classList.add('hidden');
    }
  }

  // ── Utility: relative time ─────────────────────────────────────────────────
  function relativeTime(tsStr) {
    if (!tsStr) return '';
    const now = Date.now();
    const then = new Date(String(tsStr).includes('T') ? tsStr : tsStr + 'T00:00:00').getTime();
    if (isNaN(then)) return '';
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 2) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    if (hours < 24) return hours + 'h ago';
    if (days === 1) return 'Yesterday';
    if (days < 7) return days + 'd ago';
    if (days < 31) return Math.floor(days / 7) + 'w ago';
    return window.QuoteCraftUtils.formatDate(tsStr);
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

      // ── Timeline dot ──
      const dot = document.createElement('span');
      dot.className = 'activity-dot dot-' + item.kind;
      btn.appendChild(dot);

      // ── Kind pill ──
      const kind = document.createElement('span');
      kind.className = 'activity-kind ' + item.kind;
      if (item.kind === 'quote') kind.textContent = 'Quote';
      else if (item.kind === 'invoice') kind.textContent = 'Invoice';
      else kind.textContent = 'Payment';
      btn.appendChild(kind);

      // ── Main content ──
      const main = document.createElement('span');
      main.className = 'activity-main';

      const title = document.createElement('span');
      title.className = 'activity-title';
      title.textContent = (item.number || '') + (item.client_name ? ' — ' + item.client_name : '');

      const meta = document.createElement('span');
      meta.className = 'activity-meta';
      if (item.kind === 'quote') {
        meta.appendChild(statusBadge(item.status === 'accepted' ? 'Accepted' : item.status === 'declined' ? 'Declined' : item.status === 'sent' ? 'Sent' : 'Draft', item.status));
      } else if (item.kind === 'invoice') {
        const st = window.QuoteCraftUtils.effectiveInvoiceStatus(item);
        meta.appendChild(statusBadge(window.QuoteCraftUtils.invoiceStatusLabel(st), st));
      } else {
        // payment
        const pBadge = statusBadge('Received', 'paid');
        meta.appendChild(pBadge);
      }
      main.appendChild(title);
      main.appendChild(meta);
      btn.appendChild(main);

      // ── Amount + relative time ──
      const side = document.createElement('span');
      side.className = 'activity-side';

      const amount = document.createElement('span');
      amount.className = 'activity-amount';
      amount.textContent = window.QuoteCraftUtils.formatCurrency(item.total, item.currency || currencyCode);
      side.appendChild(amount);

      const relTime = document.createElement('span');
      relTime.className = 'activity-rel-time';
      relTime.textContent = relativeTime(item.ts || item.created_at);
      side.appendChild(document.createElement('br'));
      side.appendChild(relTime);
      btn.appendChild(side);

      // ── Click handler ──
      btn.addEventListener('click', () => {
        if (item.kind === 'quote') {
          window.dispatchEvent(new CustomEvent('qc-open-quote', { detail: item.id }));
          window.QuoteCraftUtils.goToPage('quotes');
        } else if (item.kind === 'invoice') {
          window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: item.id }));
          window.QuoteCraftUtils.goToPage('invoices');
        } else {
          // payment — navigate to the invoice it belongs to
          window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: item.invoice_id }));
          window.QuoteCraftUtils.goToPage('invoices');
        }
      });

      li.appendChild(btn);
      list.appendChild(li);
    }

    // ── "View all" footer ──
    const footer = document.createElement('div');
    footer.className = 'activity-footer';
    const viewAll = document.createElement('button');
    viewAll.type = 'button';
    viewAll.className = 'activity-view-all';
    viewAll.textContent = 'View all invoices →';
    viewAll.addEventListener('click', () => window.QuoteCraftUtils.goToPage('invoices'));
    footer.appendChild(viewAll);

    activityEl.innerHTML = '';
    activityEl.appendChild(list);
    activityEl.appendChild(footer);
  }

  async function loadRecurringSummary() {
    if (!statRecurringActive) return;
    try {
      const res = await window.electronAPI.getRecurringSummary();
      if (!res || !res.ok || !res.summary) {
        statRecurringActive.textContent = '—';
        if (statRecurringBadge) statRecurringBadge.classList.add('hidden');
        if (statRecurringNext) statRecurringNext.textContent = '';
        return;
      }
      const s = res.summary;
      const count = s.active_count || 0;
      statRecurringActive.textContent = count === 1 ? '1 active' : `${count} active`;

      if (s.monthly_expected > 0) {
        const cur = s.reporting_currency || currencyCode;
        statRecurringSub.textContent = `~${window.QuoteCraftUtils.formatCurrency(s.monthly_expected, cur)}/mo expected →`;
      } else {
        statRecurringSub.textContent = 'Active recurring schedules →';
      }

      if (s.overdue_count > 0) {
        if (statRecurringBadge) {
          statRecurringBadge.className = 'kpi-trend-badge trend-down';
          statRecurringBadge.textContent = `${s.overdue_count} due`;
          statRecurringBadge.classList.remove('hidden');
        }
      } else if (count > 0) {
        if (statRecurringBadge) {
          statRecurringBadge.className = 'kpi-trend-badge trend-up';
          statRecurringBadge.textContent = 'Active';
          statRecurringBadge.classList.remove('hidden');
        }
      } else {
        if (statRecurringBadge) statRecurringBadge.classList.add('hidden');
      }

      if (statRecurringNext) {
        if (s.next_fire_date) {
          const formattedNext = window.QuoteCraftUtils.formatDate(s.next_fire_date);
          const nextAmt = s.next_amount > 0 ? window.QuoteCraftUtils.formatCurrency(s.next_amount, s.next_currency || currencyCode) : '';
          statRecurringNext.textContent = nextAmt ? `Next: ${formattedNext} (${nextAmt})` : `Next: ${formattedNext}`;
        } else {
          statRecurringNext.textContent = count > 0 ? 'No upcoming dates' : 'None configured';
        }
      }
    } catch (e) {
      console.warn('Error loading recurring summary:', e);
    }
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
    await loadRecurringSummary();
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
    const btn = document.getElementById('newInvoiceBtn');
    if (btn) btn.click();
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

  if (dashRecurringCard) {
    dashRecurringCard.addEventListener('click', () => {
      window.QuoteCraftUtils.goToPage('invoices');
    });
    dashRecurringCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.QuoteCraftUtils.goToPage('invoices');
      }
    });
  }

  init();
})();