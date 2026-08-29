(function () {
  const form = document.getElementById('settingsForm');
  if (!form) return;

  const currencySelect = document.getElementById('default_currency');
  const chooseLogoBtn = document.getElementById('chooseLogoBtn');
  const removeLogoBtn = document.getElementById('removeLogoBtn');
  const logoPreview = document.getElementById('logoPreview');
  const logoPathInput = document.getElementById('logo_path');

  let currentLogoPath = null;

  window.prepareCurrencySelect(currencySelect, 'USD');

  function clearFieldError(field) {
    const el = form.elements[field];
    if (el) el.classList.remove('invalid');
    const errEl = document.querySelector(`[data-error-for="${field}"]`);
    if (errEl) errEl.textContent = '';
  }

  function showFieldError(field, message) {
    const el = form.elements[field];
    if (el) el.classList.add('invalid');
    const errEl = document.querySelector(`[data-error-for="${field}"]`);
    if (errEl) errEl.textContent = message || '';
  }

  function updateLogoDisplay(logoPath) {
    if (logoPath) {
      logoPreview.src = logoPath;
      logoPreview.classList.remove('hidden');
      removeLogoBtn.classList.remove('hidden');
    } else {
      logoPreview.removeAttribute('src');
      logoPreview.classList.add('hidden');
      removeLogoBtn.classList.add('hidden');
    }
    logoPathInput.value = logoPath || '';
  }

  function fillForm(profile) {
    const defaults = {
      business_name: '',
      tax_id: '',
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      postal_code: '',
      country: '',
      phone: '',
      email: '',
      website: '',
      default_tax_rate: 0,
      default_terms: '',
      payment_details: '',
      invoice_prefix: 'INV-',
      invoice_start_number: 1,
      quote_prefix: 'Q-',
      quote_start_number: 1,
      default_currency: 'USD',
    };
    const data = Object.assign({}, defaults, profile || {});
    for (const key of Object.keys(form.elements)) {
      const el = form.elements[key];
      if (el && el.name && el.name !== 'logo_path') {
        el.value = data[el.name] !== undefined && data[el.name] !== null ? data[el.name] : '';
      }
    }
    window.prepareCurrencySelect(currencySelect, data.default_currency || 'USD');
    currentLogoPath = data.logo_path || null;
    updateLogoDisplay(currentLogoPath);
  }

  async function loadSettings() {
    try {
      const res = await window.electronAPI.getCompanyProfile();
      if (res.ok) {
        fillForm(res.profile);
      }
    } catch (e) {
      window.QuoteCraftUtils.showToast('Could not load settings: ' + e.message, 'error');
    }
  }

  function collectForm() {
    const data = {};
    for (const key of Object.keys(form.elements)) {
      const el = form.elements[key];
      if (el && el.name) {
        data[el.name] = el.value;
      }
    }
    data.default_tax_rate = data.default_tax_rate === '' ? '' : Number(data.default_tax_rate);
    data.invoice_start_number = data.invoice_start_number === '' ? '' : Number(data.invoice_start_number);
    data.quote_start_number = data.quote_start_number === '' ? '' : Number(data.quote_start_number);
    return data;
  }

  chooseLogoBtn.addEventListener('click', async () => {
    try {
      const res = await window.electronAPI.pickLogo();
      if (res.ok && !res.cancelled) {
        currentLogoPath = res.logoPath;
        updateLogoDisplay(currentLogoPath);
      }
    } catch (e) {
      window.QuoteCraftUtils.showToast('Failed to choose logo: ' + e.message, 'error');
    }
  });

  removeLogoBtn.addEventListener('click', () => {
    currentLogoPath = null;
    updateLogoDisplay(null);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = collectForm();
    data.logo_path = currentLogoPath;

    let valid = true;
    for (const key of Object.keys(form.elements)) {
      const el = form.elements[key];
      if (el && el.name) clearFieldError(el.name);
    }

    try {
      const res = await window.electronAPI.saveCompanyProfile(data);
      if (res.ok) {
        fillForm(res.profile);
        window.QuoteCraftUtils.showToast('Settings saved successfully.', 'success');
      } else {
        valid = false;
        if (res.errors) {
          for (const [field, msg] of Object.entries(res.errors)) {
            if (field === 'general') {
              window.QuoteCraftUtils.showToast(msg, 'error');
            } else {
              showFieldError(field, msg);
              valid = valid && false;
            }
          }
        }
        if (!res.errors || Object.keys(res.errors).length === 0) {
          window.QuoteCraftUtils.showToast('Could not save settings.', 'error');
        }
      }
    } catch (err) {
      valid = false;
      window.QuoteCraftUtils.showToast('Could not save settings: ' + err.message, 'error');
    }
  });

  const exportBackupBtn = document.getElementById('exportBackupBtn');
  const restoreBackupBtn = document.getElementById('restoreBackupBtn');
  const restoreModal = document.getElementById('restoreModal');
  const restoreModalClose = document.getElementById('restoreModalClose');
  const restoreCancelBtn = document.getElementById('restoreCancelBtn');
  const restoreConfirmBtn = document.getElementById('restoreConfirmBtn');

  let pendingRestore = null;

  function openRestoreModal() {
    restoreModal.classList.remove('hidden');
  }

  function closeRestoreModal() {
    restoreModal.classList.add('hidden');
  }

  exportBackupBtn.addEventListener('click', async () => {
    exportBackupBtn.disabled = true;
    window.QuoteCraftUtils.showBusy('Saving backup\u2026');
    try {
      const res = await window.electronAPI.exportBackup();
      if (res.ok && res.cancelled) return;
      if (res.ok) {
        window.QuoteCraftUtils.showToast('Backup saved to: ' + res.savedPath, 'success');
      } else {
        window.QuoteCraftUtils.showToast(
          (res.errors && res.errors.general) || 'Could not export backup.',
          'error'
        );
      }
    } catch (e) {
      window.QuoteCraftUtils.showToast('Could not export backup: ' + e.message, 'error');
    } finally {
      window.QuoteCraftUtils.hideBusy();
      exportBackupBtn.disabled = false;
    }
  });

  restoreBackupBtn.addEventListener('click', async () => {
    restoreBackupBtn.disabled = true;
    try {
      const res = await window.electronAPI.prepareRestore();
      if (res.ok && res.cancelled) return;
      if (!res.ok) {
        window.QuoteCraftUtils.showToast(res.error || 'That file is not a valid QuoteCraft backup.', 'error');
        return;
      }

      pendingRestore = { filePath: res.filePath };
      const created = res.createdAt
        ? window.QuoteCraftUtils.formatDate(new Date(res.createdAt))
        : 'unknown date';
      const counts = res.counts || {};
      document.getElementById('restoreFileInfo').textContent =
        res.fileName +
        '\nCreated: ' + created +
        '\nContents: ' +
        counts.clients + ' client(s), ' +
        counts.quotes + ' quote(s), ' +
        counts.invoices + ' invoice(s), ' +
        counts.payments + ' payment(s)';
      openRestoreModal();
    } catch (e) {
      window.QuoteCraftUtils.showToast('Could not read backup: ' + e.message, 'error');
    } finally {
      restoreBackupBtn.disabled = false;
    }
  });

  restoreModalClose.addEventListener('click', closeRestoreModal);
  restoreCancelBtn.addEventListener('click', closeRestoreModal);
  restoreModal.addEventListener('click', (e) => {
    if (e.target === restoreModal) closeRestoreModal();
  });

  restoreConfirmBtn.addEventListener('click', async () => {
    if (!pendingRestore) return;
    restoreConfirmBtn.disabled = true;
    window.QuoteCraftUtils.showBusy('Restoring backup\u2026');
    try {
      const res = await window.electronAPI.restoreBackup(pendingRestore.filePath);
      if (res.ok) {
        closeRestoreModal();
        window.QuoteCraftUtils.showToast('Backup restored. Your data has been reloaded.', 'success');
        setTimeout(() => window.location.reload(), 900);
      } else {
        window.QuoteCraftUtils.showToast(
          (res.errors && res.errors.general) || 'Could not restore backup.',
          'error'
        );
      }
    } catch (e) {
      window.QuoteCraftUtils.showToast('Could not restore backup: ' + e.message, 'error');
    } finally {
      window.QuoteCraftUtils.hideBusy();
      restoreConfirmBtn.disabled = false;
    }
  });

  loadSettings();
})();
