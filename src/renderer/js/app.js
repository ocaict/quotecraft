(function () {
  'use strict';

  // Global Renderer Error Boundary & Logging
  window.addEventListener('error', (event) => {
    try {
      const errorMsg = (event && event.error && event.error.stack) || event.message || 'Unknown renderer error';
      if (window.electronAPI && window.electronAPI.logWrite) {
        window.electronAPI.logWrite({ level: 'error', message: 'Uncaught Renderer Error', details: errorMsg });
      }
      if (window.QuoteCraftUtils && window.QuoteCraftUtils.showToast) {
        window.QuoteCraftUtils.showToast('An unexpected error occurred. Check diagnostics log.', 'error');
      }
    } catch (_) {}
  });

  window.addEventListener('unhandledrejection', (event) => {
    try {
      const reason = event.reason;
      const errorMsg = (reason && reason.stack) || (reason && reason.message) || String(reason || '');
      if (window.electronAPI && window.electronAPI.logWrite) {
        window.electronAPI.logWrite({ level: 'error', message: 'Unhandled Promise Rejection', details: errorMsg });
      }
    } catch (_) {}
  });

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

  // Global Error Boundary & Telemetry Ring Buffer (max 50 recent errors)
  window.__QuoteCraftErrors = window.__QuoteCraftErrors || [];
  window.addEventListener('error', (event) => {
    try {
      window.__QuoteCraftErrors.push({
        type: 'error',
        message: event.message || 'Unknown error',
        filename: event.filename || '',
        lineno: event.lineno,
        colno: event.colno,
        time: new Date().toISOString(),
      });
      if (window.__QuoteCraftErrors.length > 50) window.__QuoteCraftErrors.shift();
    } catch (e) {}
  });

  window.addEventListener('unhandledrejection', (event) => {
    try {
      const reason = event.reason;
      window.__QuoteCraftErrors.push({
        type: 'unhandledrejection',
        message: reason ? (reason.message || String(reason)) : 'Unhandled rejection',
        stack: reason && reason.stack ? String(reason.stack) : '',
        time: new Date().toISOString(),
      });
      if (window.__QuoteCraftErrors.length > 50) window.__QuoteCraftErrors.shift();
    } catch (e) {}
  });

  // Check if database was auto-recovered on startup
  async function checkDatabaseRecovery() {
    try {
      if (!window.electronAPI || !window.electronAPI.getRecoveryInfo) return;
      const res = await window.electronAPI.getRecoveryInfo();
      if (res && res.ok && res.recovery && res.recovery.recovered) {
        const banner = document.getElementById('dbRecoveryBanner');
        if (banner) {
          banner.innerHTML =
            '<div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">' +
              '<span>⚠️ <strong>Database Self-Healed:</strong> QuoteCraft detected a corrupted database on startup and safely restored your data from your recent automatic backup (<strong>' +
              (res.recovery.sourceBackup || 'latest backup') + '</strong>). Your previous file was preserved as <code>' +
              (res.recovery.corruptPreservedAs || 'backup copy') + '</code>.</span>' +
              '<button type="button" class="btn btn-ghost btn-small" id="dismissRecoveryBannerBtn" title="Dismiss" aria-label="Dismiss">&times;</button>' +
            '</div>';
          banner.classList.remove('hidden');
          const dismissBtn = document.getElementById('dismissRecoveryBannerBtn');
          if (dismissBtn) {
            dismissBtn.addEventListener('click', () => banner.classList.add('hidden'));
          }
        }
      }
    } catch (e) {
      /* ignore */
    }
  }

  // Load and apply company locale preferences (date_format, decimal_separator)
  async function initLocaleSettings() {
    try {
      if (!window.electronAPI || !window.electronAPI.getCompanyProfile) return;
      const res = await window.electronAPI.getCompanyProfile();
      if (res && res.ok && res.profile && window.QuoteCraftUtils) {
        window.QuoteCraftUtils.setSettings(res.profile);
      }
    } catch (e) {
      /* ignore */
    }
  }

  checkDatabaseRecovery();
  initLocaleSettings();
})();