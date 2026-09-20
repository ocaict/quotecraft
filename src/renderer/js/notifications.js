(function () {
  const bellBtn = document.getElementById('notificationBellBtn');
  const bellBadge = document.getElementById('notifBellBadge');
  const panel = document.getElementById('notificationPanel');
  const backdrop = document.getElementById('notifBackdrop');
  const listEl = document.getElementById('notifPanelList');
  const countBadge = document.getElementById('notifPanelCountBadge');
  const closeBtn = document.getElementById('notifCloseBtn');
  const refreshBtn = document.getElementById('notifRefreshBtn');
  const dismissAllBtn = document.getElementById('notifMarkAllSeenBtn');
  const viewInvoicesBtn = document.getElementById('notifViewInvoicesBtn');
  const tabs = document.querySelectorAll('.notif-tab');

  let activeFilter = 'all';
  let notifications = [];
  const DISMISSED_STORAGE_KEY = 'quotecraft_dismissed_notifications';

  function getDismissedIds() {
    try {
      const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function setDismissedIds(ids) {
    try {
      localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(ids));
    } catch (e) {
      console.warn('Failed to save dismissed notification IDs:', e);
    }
  }

  function openPanel() {
    if (!panel) return;
    panel.classList.remove('hidden');
    if (backdrop) backdrop.classList.remove('hidden');
    if (bellBtn) bellBtn.classList.add('active');
    refresh();
  }

  function closePanel() {
    if (!panel) return;
    panel.classList.add('hidden');
    if (backdrop) backdrop.classList.add('hidden');
    if (bellBtn) bellBtn.classList.remove('active');
  }

  function togglePanel() {
    if (panel && panel.classList.contains('hidden')) {
      openPanel();
    } else {
      closePanel();
    }
  }

  function toDateString(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function fetchAllNotifications() {
    const items = [];
    const todayStr = toDateString(new Date());

    // 1. Overdue Invoices
    try {
      const invRes = await window.electronAPI.getInvoices();
      if (invRes && invRes.ok && Array.isArray(invRes.invoices)) {
        for (const inv of invRes.invoices) {
          const bal = Number(inv.balance_due) || 0;
          if (bal > 0.001 && inv.date_due && inv.date_due < todayStr && inv.status !== 'void' && inv.status !== 'cancelled') {
            const formattedBal = window.QuoteCraftUtils.formatCurrency(bal, inv.currency || 'USD');
            items.push({
              id: `overdue_inv_${inv.id}`,
              category: 'invoices',
              priority: 'high',
              type: 'overdue',
              title: `Overdue Invoice: ${inv.number || 'Invoice'}`,
              desc: `${inv.client_name || 'Client'} • ${formattedBal} was due on ${window.QuoteCraftUtils.formatDate(inv.date_due)}`,
              time: inv.date_due,
              actionText: 'View Invoice',
              onAction: () => {
                window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: inv.id }));
                window.QuoteCraftUtils.goToPage('invoices');
                closePanel();
              },
            });
          }
        }
      }
    } catch (e) {
      console.warn('Error fetching invoices for notifications:', e);
    }

    // 2. Due Reminders
    try {
      const remRes = await window.electronAPI.getDueReminders();
      if (remRes && remRes.ok && Array.isArray(remRes.reminders)) {
        for (const rem of remRes.reminders) {
          let timingLabel = 'Payment reminder ready';
          if (rem.timing_type === 'before_due') timingLabel = `Due in ${rem.days_until_due}d`;
          else if (rem.timing_type === 'on_due') timingLabel = 'Due today';
          else if (rem.timing_type === 'after_due') timingLabel = `${rem.days_overdue}d overdue`;

          const formattedBal = window.QuoteCraftUtils.formatCurrency(rem.balance_due, rem.currency || 'USD');
          items.push({
            id: `due_reminder_${rem.invoice_id}_${rem.rule_id || 0}`,
            category: 'reminders',
            priority: rem.timing_type === 'after_due' ? 'high' : 'normal',
            type: 'reminder',
            title: `Reminder: ${rem.invoice_number}`,
            desc: `${rem.client_name || 'Client'} • ${timingLabel} (${formattedBal})`,
            time: rem.date_due || todayStr,
            actionText: 'Review & Send',
            onAction: async () => {
              const fullInvRes = await window.electronAPI.getInvoice(rem.invoice_id);
              if (!fullInvRes || !fullInvRes.ok || !fullInvRes.invoice) {
                window.QuoteCraftUtils.showToast('Could not load invoice details', 'error');
                return;
              }
              closePanel();
              if (window.QuoteCraftDocumentEmail && window.QuoteCraftDocumentEmail.openSendModal) {
                window.QuoteCraftDocumentEmail.openSendModal({
                  documentType: 'invoice',
                  documentId: rem.invoice_id,
                  doc: fullInvRes.invoice,
                  modalTitle: `Payment Reminder: ${rem.invoice_number}`,
                  prefillTo: rem.recipient_to,
                  prefillSubject: rem.subject,
                  prefillMessage: rem.message,
                  reminderRuleId: rem.rule_id,
                  onSuccess: async () => {
                    refresh();
                  },
                });
              }
            },
          });
        }
      }
    } catch (e) {
      console.warn('Error fetching reminders for notifications:', e);
    }

    // 3. Expired Quotes
    try {
      const qRes = await window.electronAPI.getQuotes();
      if (qRes && qRes.ok && Array.isArray(qRes.quotes)) {
        for (const q of qRes.quotes) {
          if (q.valid_until && q.valid_until < todayStr && (q.status === 'sent' || q.status === 'draft')) {
            const formattedTotal = window.QuoteCraftUtils.formatCurrency(q.total, q.currency || 'USD');
            items.push({
              id: `expired_quote_${q.id}`,
              category: 'quotes',
              priority: 'normal',
              type: 'quote',
              title: `Expired Quote: ${q.number || 'Quote'}`,
              desc: `${q.client_name || 'Client'} • ${formattedTotal} expired on ${window.QuoteCraftUtils.formatDate(q.valid_until)}`,
              time: q.valid_until,
              actionText: 'View Quote',
              onAction: () => {
                window.dispatchEvent(new CustomEvent('qc-open-quote', { detail: q.id }));
                window.QuoteCraftUtils.goToPage('quotes');
                closePanel();
              },
            });
          }
        }
      }
    } catch (e) {
      console.warn('Error fetching quotes for notifications:', e);
    }

    // 4. Recurring Invoices Due
    try {
      const recRes = await window.electronAPI.getRecurringSummary();
      if (recRes && recRes.ok && recRes.summary && recRes.summary.overdue_count > 0) {
        items.push({
          id: `recurring_overdue_${todayStr}`,
          category: 'invoices',
          priority: 'high',
          type: 'recurring',
          title: 'Recurring Invoices Ready',
          desc: `${recRes.summary.overdue_count} recurring profile(s) ready to generate next occurrence.`,
          time: todayStr,
          actionText: 'View Recurring',
          onAction: () => {
            window.QuoteCraftUtils.goToPage('invoices');
            closePanel();
          },
        });
      }
    } catch (e) {
      console.warn('Error fetching recurring summary for notifications:', e);
    }

    return items;
  }

  function renderList() {
    if (!listEl) return;
    const dismissed = new Set(getDismissedIds());
    const visible = notifications.filter(n => !dismissed.has(n.id));

    const filtered = activeFilter === 'all'
      ? visible
      : visible.filter(n => n.category === activeFilter);

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="notif-empty">
          <div class="notif-empty-icon">🔔</div>
          <div class="notif-empty-title">All caught up!</div>
          <div class="notif-empty-desc">No outstanding notifications or action items at this time.</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';
    for (const item of filtered) {
      const row = document.createElement('div');
      row.className = `notif-item ${item.priority === 'high' ? 'priority-high' : ''}`;

      let iconHtml = '⚠️';
      if (item.type === 'overdue') iconHtml = '🚨';
      else if (item.type === 'reminder') iconHtml = '⏰';
      else if (item.type === 'quote') iconHtml = '📄';
      else if (item.type === 'recurring') iconHtml = '🔄';

      row.innerHTML = `
        <div class="notif-icon-wrap type-${item.type}">
          ${iconHtml}
        </div>
        <div class="notif-content">
          <div class="notif-row-top">
            <span class="notif-title">${item.title}</span>
            <span class="notif-time">${item.time ? window.QuoteCraftUtils.formatDate(item.time) : ''}</span>
          </div>
          <div class="notif-desc">${item.desc}</div>
          <div class="notif-actions">
            <button type="button" class="notif-action-btn primary btn-notif-action">${item.actionText}</button>
            <button type="button" class="notif-action-btn btn-notif-dismiss" title="Dismiss notification">Dismiss</button>
          </div>
        </div>
      `;

      const actBtn = row.querySelector('.btn-notif-action');
      if (actBtn && item.onAction) {
        actBtn.addEventListener('click', item.onAction);
      }

      const disBtn = row.querySelector('.btn-notif-dismiss');
      if (disBtn) {
        disBtn.addEventListener('click', () => {
          const current = getDismissedIds();
          current.push(item.id);
          setDismissedIds(current);
          updateBadge();
          renderList();
        });
      }

      listEl.appendChild(row);
    }
  }

  function updateBadge() {
    const dismissed = new Set(getDismissedIds());
    const unread = notifications.filter(n => !dismissed.has(n.id));
    const count = unread.length;

    if (bellBadge) {
      if (count > 0) {
        bellBadge.textContent = count > 99 ? '99+' : String(count);
        bellBadge.classList.remove('hidden');
      } else {
        bellBadge.textContent = '0';
        bellBadge.classList.add('hidden');
      }
    }

    if (countBadge) {
      countBadge.textContent = String(count);
    }
  }

  async function refresh() {
    if (listEl) {
      listEl.innerHTML = '<p class="placeholder" style="padding:20px;text-align:center;">Checking for notifications…</p>';
    }
    notifications = await fetchAllNotifications();
    updateBadge();
    renderList();
  }

  // ── Event Listeners ──
  if (bellBtn) {
    bellBtn.addEventListener('click', (e) => {
      e.preventDefault();
      togglePanel();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closePanel);
  }

  if (backdrop) {
    backdrop.addEventListener('click', closePanel);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', refresh);
  }

  if (dismissAllBtn) {
    dismissAllBtn.addEventListener('click', () => {
      const allIds = notifications.map(n => n.id);
      setDismissedIds(allIds);
      updateBadge();
      renderList();
      window.QuoteCraftUtils.showToast('All notifications dismissed', 'info');
    });
  }

  if (viewInvoicesBtn) {
    viewInvoicesBtn.addEventListener('click', () => {
      closePanel();
      window.QuoteCraftUtils.goToPage('invoices');
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.getAttribute('data-filter') || 'all';
      renderList();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && !panel.classList.contains('hidden')) {
      closePanel();
    }
  });

  document.addEventListener('pagechange', () => {
    refresh();
  });

  window.addEventListener('qc-invoice-saved', () => refresh());
  window.addEventListener('qc-quote-saved', () => refresh());

  // Initialize on load
  refresh();

  // Expose global controller
  window.QuoteCraftNotifications = {
    refresh,
    open: openPanel,
    close: closePanel,
    toggle: togglePanel,
  };
})();
