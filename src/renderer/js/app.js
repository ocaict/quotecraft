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

  // Table Density Controller
  const DENSITY_KEY = 'qc-table-density';
  function applyTableDensity(mode) {
    const isCompact = mode === 'compact';
    document.body.classList.toggle('table-density-compact', isCompact);
    document.querySelectorAll('.density-toggle-btn').forEach((btn) => {
      btn.classList.toggle('active', isCompact);
      btn.title = isCompact ? 'Switch to Comfortable view' : 'Switch to Compact view';
      btn.setAttribute('aria-pressed', isCompact ? 'true' : 'false');
    });
    try {
      localStorage.setItem(DENSITY_KEY, isCompact ? 'compact' : 'comfortable');
    } catch (e) {}
  }

  function toggleTableDensity() {
    const isCurrentlyCompact = document.body.classList.contains('table-density-compact');
    applyTableDensity(isCurrentlyCompact ? 'comfortable' : 'compact');
  }

  // Load saved density
  let initialDensity = 'comfortable';
  try {
    initialDensity = localStorage.getItem(DENSITY_KEY) || 'comfortable';
  } catch (e) {}
  applyTableDensity(initialDensity);

  if (window.QuoteCraftUtils) {
    window.QuoteCraftUtils.toggleTableDensity = toggleTableDensity;
    window.QuoteCraftUtils.applyTableDensity = applyTableDensity;
  }

  // Global listener for density buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.density-toggle-btn');
    if (btn) {
      e.preventDefault();
      toggleTableDensity();
      return;
    }

    // Close open row action dropdowns when clicking outside
    if (!e.target.closest('.row-actions-dropdown')) {
      document.querySelectorAll('.row-actions-menu:not(.hidden)').forEach((menu) => {
        menu.classList.add('hidden');
      });
      document.querySelectorAll('.row-actions-trigger.active').forEach((trigger) => {
        trigger.classList.remove('active');
      });
    }
  });
})();