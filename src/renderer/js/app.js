(function () {
  'use strict';

  // Navigation link click handling
  document.querySelectorAll('#nav a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.QuoteCraftUtils.goToPage(link.dataset.page);
    });
  });

  // Dynamic Sidebar Badges Refresher
  async function refreshSidebarBadges() {
    try {
      if (!window.electronAPI || !window.electronAPI.getDashboardStats) return;
      const res = await window.electronAPI.getDashboardStats();
      const overdueBadge = document.getElementById('sidebarOverdueBadge');
      if (!overdueBadge) return;

      if (res && res.ok && res.stats) {
        const count = Number(res.stats.overdue_count) || 0;
        if (count > 0) {
          overdueBadge.textContent = String(count);
          overdueBadge.title = count + ' overdue invoice' + (count === 1 ? '' : 's');
          overdueBadge.classList.remove('hidden');
        } else {
          overdueBadge.classList.add('hidden');
        }
      } else {
        overdueBadge.classList.add('hidden');
      }
    } catch (err) {
      /* silent fallback */
    }
  }

  // Expose on global utils
  if (window.QuoteCraftUtils) {
    window.QuoteCraftUtils.refreshSidebarBadges = refreshSidebarBadges;
  }

  // Initial load
  refreshSidebarBadges();

  // Refresh on page changes and custom update events
  document.addEventListener('pagechange', () => {
    refreshSidebarBadges();
  });
  window.addEventListener('qc-invoices-updated', refreshSidebarBadges);
  window.addEventListener('qc-payments-updated', refreshSidebarBadges);

  // Periodic refresh every 60s
  setInterval(refreshSidebarBadges, 60000);
})();