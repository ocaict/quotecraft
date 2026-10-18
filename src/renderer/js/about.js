(function () {
  'use strict';

  let cachedDiagnosticsText = '';
  let cachedDbPath = '';

  function formatOsName(diag) {
    if (!diag) return 'Unknown OS';
    const p = diag.platform;
    const arch = diag.arch ? ` (${diag.arch})` : '';
    if (p === 'win32') return `Windows${arch}`;
    if (p === 'darwin') return `macOS${arch}`;
    if (p === 'linux') return `Linux${arch}`;
    return `${p || 'Unknown'}${arch}`;
  }

  async function openAboutModal() {
    const modal = document.getElementById('aboutModal');
    if (!modal) return;

    modal.classList.remove('hidden');

    // Load diagnostics and license info
    try {
      const [diagRes, licenseRes] = await Promise.all([
        window.electronAPI && window.electronAPI.getDiagnostics ? window.electronAPI.getDiagnostics() : null,
        window.electronAPI && window.electronAPI.getLicense ? window.electronAPI.getLicense() : null,
      ]);

      const diag = diagRes && diagRes.ok ? diagRes.diagnostics : null;
      const isPro = Boolean(licenseRes && licenseRes.isPro);
      const licenseObj = licenseRes && licenseRes.license;

      // Version & Title
      const versionEl = document.getElementById('aboutVersionBadge');
      if (versionEl && diag && diag.appVersion) {
        versionEl.textContent = `v${diag.appVersion}`;
      }

      // License pill
      const licensePill = document.getElementById('aboutLicensePill');
      const licenseLabel = document.getElementById('aboutLicenseLabel');
      if (licensePill && licenseLabel) {
        licensePill.classList.toggle('pro', isPro);
        licensePill.classList.toggle('community', !isPro);

        if (isPro) {
          const holder = (licenseObj && (licenseObj.holder_name || licenseObj.licensee_name)) || '';
          licenseLabel.textContent = holder ? `⚡ QuoteCraft Pro — ${holder}` : '⚡ QuoteCraft Pro (Activated)';
          licensePill.title = 'Commercial license active. Click to manage license.';
        } else {
          licenseLabel.textContent = '🛡️ Free Community Edition';
          licensePill.title = 'Offline-first edition. Click to view or enter Pro license key.';
        }
      }

      // Environment grid
      if (diag) {
        cachedDbPath = diag.databasePath || '';

        const osVal = document.getElementById('aboutOsVal');
        if (osVal) osVal.textContent = formatOsName(diag);

        const runtimeVal = document.getElementById('aboutRuntimeVal');
        if (runtimeVal) {
          runtimeVal.textContent = `Electron ${diag.electronVersion} • Node ${diag.nodeVersion} • Chrome ${diag.chromeVersion}`;
        }

        const dbVal = document.getElementById('aboutDbVal');
        if (dbVal) {
          dbVal.textContent = `SQLite / WASM (${diag.databaseIntegrity || 'Healthy'})`;
        }

        const dataPathVal = document.getElementById('aboutDataPathVal');
        if (dataPathVal && diag.databasePath) {
          dataPathVal.title = diag.databasePath;
        }

        // Cache markdown for "Copy System Info"
        cachedDiagnosticsText = [
          `- QuoteCraft: v${diag.appVersion || 'Unknown'}`,
          `- OS: ${formatOsName(diag)} (${diag.osRelease || ''})`,
          `- Electron: ${diag.electronVersion || 'N/A'}`,
          `- Chrome: ${diag.chromeVersion || 'N/A'}`,
          `- Node.js: ${diag.nodeVersion || 'N/A'}`,
          `- License: ${isPro ? 'Pro' : 'Community Edition'}`,
          `- Database: SQLite / WASM (${diag.databaseIntegrity || 'OK'})`,
          `- Database Size: ${diag.databaseSizeMB || '0'} MB`,
        ].join('\n');
      }
    } catch (err) {
      console.error('[About] Failed to populate about modal:', err);
    }
  }

  function closeAboutModal() {
    const modal = document.getElementById('aboutModal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  function initAboutModal() {
    const modal = document.getElementById('aboutModal');
    if (!modal) return;

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeAboutModal();
    });

    // Close button
    const closeBtn = document.getElementById('aboutModalClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeAboutModal);
    }

    // License pill click -> Settings License tab
    const licensePill = document.getElementById('aboutLicensePill');
    if (licensePill) {
      licensePill.addEventListener('click', (e) => {
        e.preventDefault();
        closeAboutModal();
        if (window.QuoteCraftUtils && window.QuoteCraftUtils.goToPage) {
          window.QuoteCraftUtils.goToPage('settings');
        }
        if (window.QuoteCraftSettings && window.QuoteCraftSettings.switchSubtab) {
          window.QuoteCraftSettings.switchSubtab('license');
        }
      });
    }

    // Open data folder button
    const openDataFolderBtn = document.getElementById('aboutOpenDataFolderBtn');
    if (openDataFolderBtn) {
      openDataFolderBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (cachedDbPath && window.electronAPI && window.electronAPI.showItemInFolder) {
          window.electronAPI.showItemInFolder(cachedDbPath);
        } else if (window.electronAPI && window.electronAPI.getDiagnostics) {
          window.electronAPI.getDiagnostics().then((res) => {
            if (res && res.ok && res.diagnostics && res.diagnostics.databasePath) {
              window.electronAPI.showItemInFolder(res.diagnostics.databasePath);
            }
          });
        }
      });
    }

    // Copy system info button
    const copyBtn = document.getElementById('aboutCopySystemInfoBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        if (!cachedDiagnosticsText) {
          // If not cached yet, fetch diagnostics on demand
          try {
            const res = await window.electronAPI.getDiagnostics();
            if (res && res.ok && res.diagnostics) {
              const d = res.diagnostics;
              cachedDiagnosticsText = [
                `- QuoteCraft: v${d.appVersion}`,
                `- OS: ${formatOsName(d)}`,
                `- Electron: ${d.electronVersion}`,
                `- Chrome: ${d.chromeVersion}`,
                `- Node.js: ${d.nodeVersion}`,
              ].join('\n');
            }
          } catch (_) {}
        }

        if (cachedDiagnosticsText) {
          try {
            await navigator.clipboard.writeText(cachedDiagnosticsText);
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span>✓</span> Copied!';
            copyBtn.classList.add('btn-success');
            if (window.QuoteCraftUtils && window.QuoteCraftUtils.showToast) {
              window.QuoteCraftUtils.showToast('System info copied to clipboard', 'info');
            }
            setTimeout(() => {
              copyBtn.innerHTML = originalHtml;
              copyBtn.classList.remove('btn-success');
            }, 2000);
          } catch (err) {
            if (window.QuoteCraftUtils && window.QuoteCraftUtils.showToast) {
              window.QuoteCraftUtils.showToast('Could not copy to clipboard', 'error');
            }
          }
        }
      });
    }

    // Check updates button
    const updatesBtn = document.getElementById('aboutCheckUpdatesBtn');
    if (updatesBtn) {
      updatesBtn.addEventListener('click', () => {
        closeAboutModal();
        if (window.QuoteCraftUtils && window.QuoteCraftUtils.goToPage) {
          window.QuoteCraftUtils.goToPage('settings');
        }
        if (window.QuoteCraftSettings && window.QuoteCraftSettings.switchSubtab) {
          window.QuoteCraftSettings.switchSubtab('updates');
        }
      });
    }

    // GitHub repository link
    const githubBtn = document.getElementById('aboutGithubBtn');
    if (githubBtn) {
      githubBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.electronAPI && window.electronAPI.openExternal) {
          window.electronAPI.openExternal('https://github.com/ocaict/quotecraft');
        }
      });
    }
  }

  // Global API
  window.QuoteCraftAbout = {
    open: openAboutModal,
    close: closeAboutModal,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAboutModal);
  } else {
    initAboutModal();
  }
})();
