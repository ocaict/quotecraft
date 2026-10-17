(function () {
  const form = document.getElementById('settingsForm');
  if (!form) return;

  // ---------- Theme (Appearance) ----------
  const themeInputs = document.querySelectorAll('input[name="themeMode"]');
  if (themeInputs.length && window.QuoteCraftTheme) {
    const syncThemeInputs = (activeMode) => {
      themeInputs.forEach((el) => {
        el.checked = el.value === activeMode;
      });
    };

    syncThemeInputs(window.QuoteCraftTheme.getMode());

    themeInputs.forEach((el) => {
      el.addEventListener('change', () => {
        if (el.checked && el.value) {
          window.QuoteCraftTheme.setMode(el.value);
        }
      });
    });

    document.addEventListener('themechange', (e) => {
      syncThemeInputs(e.detail);
    });
  }

  const currencySelect = document.getElementById('default_currency');
  const reportingCurrencySelect = document.getElementById('reporting_currency');
  const chooseLogoBtn = document.getElementById('chooseLogoBtn');
  const removeLogoBtn = document.getElementById('removeLogoBtn');
  const logoPreview = document.getElementById('logoPreview');
  const logoPathInput = document.getElementById('logo_path');

  let currentLogoPath = null;

  window.prepareCurrencySelect(currencySelect, 'USD');
  if (reportingCurrencySelect) {
    window.prepareCurrencySelect(reportingCurrencySelect, 'USD');
  }

  if (currencySelect && reportingCurrencySelect) {
    let lastDefault = currencySelect.value;
    currencySelect.addEventListener('change', () => {
      if (!reportingCurrencySelect.dataset.userChanged || reportingCurrencySelect.value === lastDefault) {
        reportingCurrencySelect.value = currencySelect.value;
      }
      lastDefault = currencySelect.value;
    });
    reportingCurrencySelect.addEventListener('change', () => {
      reportingCurrencySelect.dataset.userChanged = 'true';
    });
  }

  function clearFieldError(field) {
    const el = form.elements[field];
    if (el) {
      if (el.classList) {
        el.classList.remove('invalid');
      } else if (typeof el.length === 'number') {
        for (let i = 0; i < el.length; i++) {
          if (el[i] && el[i].classList) el[i].classList.remove('invalid');
        }
      }
    }
    const errEl = document.querySelector(`[data-error-for="${field}"]`);
    if (errEl) errEl.textContent = '';
  }

  function showFieldError(field, message) {
    const el = form.elements[field];
    if (el) {
      if (el.classList) {
        el.classList.add('invalid');
      } else if (typeof el.length === 'number') {
        for (let i = 0; i < el.length; i++) {
          if (el[i] && el[i].classList) el[i].classList.add('invalid');
        }
      }
    }
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
      default_quote_acceptance_instructions: 'To accept this quote, please reply to confirm via email or phone.',
      payment_details: '',
      invoice_prefix: 'INV-',
      invoice_start_number: 1,
      quote_prefix: 'Q-',
      quote_start_number: 1,
      credit_note_prefix: 'CN-',
      credit_note_start_number: 1,
      cac_number: '',
      tin: '',
      bank_name: '',
      account_number: '',
      account_name: '',
      dom_bank_name: '',
      dom_account_name: '',
      dom_account_number: '',
      dom_swift_code: '',
      dom_intermediary_bank: '',
      paystack_enabled: 0,
      paystack_public_key: '',
      paystack_page_url: '',
      default_currency: 'USD',
      reporting_currency: 'USD',
      date_format: 'MMM D, YYYY',
      decimal_separator: '.',
      pdf_theme: 'classic',
      number_padding: 4,
      number_include_year: 1,
    };
    const data = Object.assign({}, defaults, profile || {});
    if (!data.reporting_currency) {
      data.reporting_currency = data.default_currency || 'USD';
    }
    for (const key of Object.keys(form.elements)) {
      const el = form.elements[key];
      if (
        el &&
        el.name &&
        el.name !== 'logo_path' &&
        el.name !== 'themeMode' &&
        el.name !== 'pdf_theme' &&
        el.type !== 'radio' &&
        !isRadioGroup(el)
      ) {
        if (el.type === 'checkbox') {
          el.checked = Boolean(Number(data[el.name]));
        } else {
          el.value = data[el.name] !== undefined && data[el.name] !== null ? data[el.name] : '';
        }
      }
    }
    if (window.QuoteCraftTheme) {
      const activeMode = window.QuoteCraftTheme.getMode();
      themeInputs.forEach((el) => {
        el.checked = el.value === activeMode;
      });
    }
    const pdfThemeInputs = document.querySelectorAll('input[name="pdf_theme"]');
    pdfThemeInputs.forEach((el) => {
      el.checked = el.value === (data.pdf_theme || 'classic');
    });
    window.prepareCurrencySelect(currencySelect, data.default_currency || 'USD');
    if (reportingCurrencySelect) {
      window.prepareCurrencySelect(reportingCurrencySelect, data.reporting_currency || data.default_currency || 'USD');
      if (data.reporting_currency && data.reporting_currency !== data.default_currency) {
        reportingCurrencySelect.dataset.userChanged = 'true';
      } else {
        delete reportingCurrencySelect.dataset.userChanged;
      }
    }
    currentLogoPath = data.logo_path || null;
    updateLogoDisplay(currentLogoPath);

    const paystackSecretInput = document.getElementById('_paystack_secret_key_plain');
    if (paystackSecretInput) {
      paystackSecretInput.value = '';
    }
    const paystackKeyBadge = document.getElementById('paystackKeyStatusBadge');
    if (window.electronAPI && window.electronAPI.paystackHasSecretKey) {
      window.electronAPI.paystackHasSecretKey().then((res) => {
        if (res && res.hasKey) {
          if (paystackKeyBadge) paystackKeyBadge.style.display = 'inline-block';
          if (paystackSecretInput) paystackSecretInput.placeholder = '•••••••••••••••• (Key saved - enter new key to replace)';
        } else {
          if (paystackKeyBadge) paystackKeyBadge.style.display = 'none';
          if (paystackSecretInput) paystackSecretInput.placeholder = 'sk_live_... or sk_test_...';
        }
      }).catch(() => {});
    }
  }

  async function loadSettings() {
    try {
      const res = await window.electronAPI.getCompanyProfile();
      if (res.ok) {
        fillForm(res.profile);
        if (window.QuoteCraftUtils) {
          window.QuoteCraftUtils.setSettings(res.profile);
        }
      }
    } catch (e) {
      window.QuoteCraftUtils.showToast('Could not load settings: ' + e.message, 'error');
    }
  }

  function isRadioGroup(el) {
    return typeof RadioNodeList !== 'undefined' && el instanceof RadioNodeList;
  }

  function collectForm() {
    const data = {};
    for (const key of Object.keys(form.elements)) {
      const el = form.elements[key];
      // Skip radio inputs (e.g. themeMode, pdf_theme) — handled separately
      if (
        el &&
        el.name &&
        el.name !== 'themeMode' &&
        el.name !== 'pdf_theme' &&
        el.type !== 'radio' &&
        !isRadioGroup(el)
      ) {
        if (el.type === 'checkbox') {
          data[el.name] = el.checked ? 1 : 0;
        } else {
          data[el.name] = el.value;
        }
      }
    }
    const selectedPdfTheme = document.querySelector('input[name="pdf_theme"]:checked');
    if (selectedPdfTheme) {
      data.pdf_theme = selectedPdfTheme.value;
    }
    data.default_tax_rate = data.default_tax_rate === '' ? '' : Number(data.default_tax_rate);
    data.invoice_start_number = data.invoice_start_number === '' ? '' : Number(data.invoice_start_number);
    data.quote_start_number = data.quote_start_number === '' ? '' : Number(data.quote_start_number);
    data.credit_note_start_number = data.credit_note_start_number === '' ? '' : Number(data.credit_note_start_number);
    data.number_padding = data.number_padding === '' ? 4 : Number(data.number_padding);
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

  const accountNumberInput = document.getElementById('account_number');
  const nubanHint = document.getElementById('nubanValidationHint');
  if (accountNumberInput) {
    accountNumberInput.addEventListener('input', () => {
      accountNumberInput.value = accountNumberInput.value.replace(/\D/g, '').slice(0, 10);
      if (nubanHint) {
        if (!accountNumberInput.value) {
          nubanHint.textContent = '10 digits, validated on save.';
          nubanHint.style.color = '';
        } else if (accountNumberInput.value.length === 10) {
          nubanHint.textContent = '✓ 10-digit NUBAN entered.';
          nubanHint.style.color = '#059669';
        } else {
          nubanHint.textContent = `${accountNumberInput.value.length}/10 digits entered.`;
          nubanHint.style.color = '';
        }
      }
    });
  }

  const paystackTestBtn = document.getElementById('paystackTestBtn');
  const paystackTestStatus = document.getElementById('paystackTestStatus');
  if (paystackTestBtn) {
    paystackTestBtn.addEventListener('click', async () => {
      const secretInput = document.getElementById('_paystack_secret_key_plain');
      const customKey = secretInput ? secretInput.value.trim() : '';

      paystackTestBtn.disabled = true;
      if (paystackTestStatus) {
        paystackTestStatus.textContent = 'Testing connection with Paystack...';
        paystackTestStatus.style.color = 'var(--text-muted)';
      }

      try {
        const res = await window.electronAPI.paystackTestConnection(customKey || null);
        if (res.ok) {
          if (paystackTestStatus) {
            paystackTestStatus.textContent = '✓ ' + (res.message || 'Connected successfully!');
            paystackTestStatus.style.color = '#10b981';
          }
          window.QuoteCraftUtils.showToast(res.message || 'Connected to Paystack!', 'success');
        } else {
          if (paystackTestStatus) {
            paystackTestStatus.textContent = '✗ ' + (res.message || 'Connection failed.');
            paystackTestStatus.style.color = '#ef4444';
          }
          window.QuoteCraftUtils.showToast(res.message || 'Paystack test failed.', 'error');
        }
      } catch (err) {
        if (paystackTestStatus) {
          paystackTestStatus.textContent = '✗ ' + err.message;
          paystackTestStatus.style.color = '#ef4444';
        }
        window.QuoteCraftUtils.showToast('Test failed: ' + err.message, 'error');
      } finally {
        paystackTestBtn.disabled = false;
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = collectForm();
    data.logo_path = currentLogoPath;

    let valid = true;
    const cleared = new Set();
    for (const key of Object.keys(form.elements)) {
      const el = form.elements[key];
      if (el && el.name && !cleared.has(el.name)) {
        cleared.add(el.name);
        clearFieldError(el.name);
      }
    }

    try {
      const res = await window.electronAPI.saveCompanyProfile(data);
      if (res.ok) {
        fillForm(res.profile);
        if (window.QuoteCraftUtils) {
          window.QuoteCraftUtils.setSettings(res.profile);
        }
        window.dispatchEvent(new CustomEvent('qc-settings-updated', { detail: res.profile }));
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
      let contentsSummary =
        counts.clients + ' client(s), ' +
        counts.quotes + ' quote(s), ' +
        counts.invoices + ' invoice(s), ' +
        counts.payments + ' payment(s)';
      if (counts.attachments) {
        contentsSummary += ', ' + counts.attachments + ' attachment(s)';
      }
      document.getElementById('restoreFileInfo').textContent =
        res.fileName +
        '\nCreated: ' + created +
        '\nContents: ' + contentsSummary;
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

  // ---------- App Lock ----------
  const lockToggle = document.getElementById('appLockToggle');
  const lockConfig = document.getElementById('appLockConfig');
  const lockStatus = document.getElementById('appLockStatus');
  const lockCurrentPin = document.getElementById('appLockCurrentPin');
  const lockNewPin = document.getElementById('appLockNewPin');
  const lockNewPinConfirm = document.getElementById('appLockNewPinConfirm');
  const lockInactivity = document.getElementById('appLockInactivity');
  const lockSaveBtn = document.getElementById('appLockSaveBtn');
  const lockDisableBtn = document.getElementById('appLockDisableBtn');
  const lockMsg = document.getElementById('appLockMsg');

  let lockEnabled = false;

  function showLockMsg(msg, type) {
    if (!lockMsg) return;
    lockMsg.textContent = msg || '';
    lockMsg.className = 'app-lock-msg' + (type ? ' ' + type : '');
  }

  function setLockConfigVisibility() {
    if (!lockConfig) return;
    lockConfig.classList.toggle('hidden', !lockToggle.checked);
    if (!lockToggle.checked) return;
    const currentField = lockConfig.querySelector('.app-lock-current-field');
    if (currentField) currentField.classList.toggle('hidden', !lockEnabled);
    if (lockStatus) {
      lockStatus.innerHTML = lockEnabled
        ? '<span class="lock-on">Lock is ON.</span> Enter your current PIN to change it, or to turn the lock off.'
        : '<span class="lock-off">Lock is OFF.</span> Choose a PIN below to enable it.';
    }
  }

  async function applyLockSettings(settings) {
    if (!settings) return;
    lockEnabled = Boolean(settings.is_enabled);
    lockToggle.checked = lockEnabled;
    const minutes = String(Number(settings.inactivity_minutes) || 5);
    if (lockInactivity.querySelector('option[value="' + minutes + '"]')) {
      lockInactivity.value = minutes;
    } else {
      lockInactivity.value = '0';
    }
    setLockConfigVisibility();
  }

  async function loadLockState() {
    try {
      const res = await window.electronAPI.getAppLockSettings();
      if (res && res.ok) applyLockSettings(res.settings);
    } catch (e) {
      /* ignore */
    }
  }

  if (lockToggle) {
    lockToggle.addEventListener('change', () => {
      showLockMsg('');
      setLockConfigVisibility();
      if (lockToggle.checked) {
        setTimeout(() => lockNewPin && lockNewPin.focus(), 50);
      }
    });
  }

  if (lockSaveBtn) {
    lockSaveBtn.addEventListener('click', async () => {
      showLockMsg('');
      const current = (lockCurrentPin && lockCurrentPin.value) || '';
      const newPin = (lockNewPin && lockNewPin.value) || '';
      const confirm = (lockNewPinConfirm && lockNewPinConfirm.value) || '';

      if (lockEnabled && !current) {
        showLockMsg('Enter your current PIN.', 'error');
        return;
      }
      if (newPin.length < 4) {
        showLockMsg('PIN must be at least 4 characters.', 'error');
        return;
      }
      if (newPin !== confirm) {
        showLockMsg('The two PINs do not match.', 'error');
        return;
      }

      lockSaveBtn.disabled = true;
      try {
        const res = await window.electronAPI.setAppLockPin({
          pin: newPin,
          currentPin: lockEnabled ? current : null,
          inactivityMinutes: Number(lockInactivity.value) || 0,
        });
        if (res.ok) {
          if (lockCurrentPin) lockCurrentPin.value = '';
          if (lockNewPin) lockNewPin.value = '';
          if (lockNewPinConfirm) lockNewPinConfirm.value = '';
          applyLockSettings(res.settings);
          showLockMsg('PIN saved and the lock is now on.', 'success');
          window.dispatchEvent(new CustomEvent('qc-app-lock-changed'));
        } else {
          showLockMsg(res.error || 'Could not save PIN.', 'error');
        }
      } catch (e) {
        showLockMsg('Could not save PIN: ' + e.message, 'error');
      } finally {
        lockSaveBtn.disabled = false;
      }
    });
  }

  if (lockDisableBtn) {
    lockDisableBtn.addEventListener('click', async () => {
      showLockMsg('');
      const current = (lockCurrentPin && lockCurrentPin.value) || '';
      if (!current) {
        showLockMsg('Enter your current PIN to turn the lock off.', 'error');
        return;
      }
      lockDisableBtn.disabled = true;
      try {
        const res = await window.electronAPI.disableAppLock(current);
        if (res.ok) {
          if (lockCurrentPin) lockCurrentPin.value = '';
          applyLockSettings(res.settings);
          showLockMsg('Lock is now off.', 'success');
          window.dispatchEvent(new CustomEvent('qc-app-lock-changed'));
        } else {
          showLockMsg(res.error || 'Could not turn the lock off.', 'error');
        }
      } catch (e) {
        showLockMsg('Could not disable lock: ' + e.message, 'error');
      } finally {
        lockDisableBtn.disabled = false;
      }
    });
  }

  loadLockState();

  // ---------- Automatic backups ----------
  const abEnabled = document.getElementById('autobackupEnabled');
  const abConfig = document.getElementById('autobackupConfig');
  const abSchedule = document.getElementById('autobackupSchedule');
  const abRetainCount = document.getElementById('autobackupRetainCount');
  const abFolder = document.getElementById('autobackupFolder');
  const abFolderBtn = document.getElementById('autobackupFolderBtn');
  const abSaveBtn = document.getElementById('autobackupSaveBtn');
  const abNowBtn = document.getElementById('autobackupNowBtn');
  const abStatus = document.getElementById('autobackupStatus');
  const abRecent = document.getElementById('autobackupRecent');
  const abMsg = document.getElementById('autobackupMsg');

  let abSettings = { enabled: false, schedule: 'daily', folder: '', retainCount: 7, lastBackupAt: null };

  if (abConfig) {
    abConfig.classList.toggle('hidden', !abEnabled.checked);
  }

  function abShowMsg(msg, type) {
    if (!abMsg) return;
    abMsg.textContent = msg || '';
    abMsg.className = 'app-lock-msg' + (type ? ' ' + type : '');
  }

  async function abRefreshRecent() {
    if (!abRecent || !abFolder) return;
    const folder = (abFolder.value || '').trim();
    if (!folder) {
      abRecent.classList.add('hidden');
      return;
    }
    try {
      const res = await window.electronAPI.listAutoBackups(folder);
      if (!res || !res.ok || !res.backups || res.backups.length === 0) {
        abRecent.classList.add('hidden');
        return;
      }
      const lines = res.backups
        .map((b) => '<li>' + (b.name || '') + ' — ' + (b.size || 0) + ' bytes</li>')
        .join('');
      abRecent.innerHTML = '<strong>Recent automatic backups (' + res.backups.length + ')</strong><ul>' + lines + '</ul>';
      abRecent.classList.remove('hidden');
    } catch (e) {
      abRecent.classList.add('hidden');
    }
  }

  function abUpdateStatus() {
    if (!abStatus || !abSettings) return;
    const parts = [];
    if (!abSettings.enabled) {
      abStatus.textContent = 'Automatic backups are off.';
      abStatus.classList.remove('backup-ok');
      return;
    }
    if (!abSettings.folder) {
      abStatus.textContent = 'Choose a folder, then Save.';
      abStatus.classList.remove('backup-ok');
      return;
    }
    if (!abStatus.dataset.saved) {
      abStatus.textContent = 'Settings changed — press Save to apply.';
      abStatus.classList.remove('backup-ok');
      return;
    }
    parts.push(abSettings.schedule === 'on_close' ? 'On app close' : 'Daily');
    parts.push('· keep ' + abSettings.retainCount);
    if (abSettings.lastBackupAt) {
      parts.push('· last backup ' + window.QuoteCraftUtils.formatDateTime(new Date(abSettings.lastBackupAt)));
    } else {
      parts.push('· no backup yet');
    }
    abStatus.textContent = parts.join(' ');
    abStatus.classList.add('backup-ok');
  }

  async function abApplySettings(settings, saved) {
    if (!settings) return;
    abSettings = settings;
    abEnabled.checked = Boolean(settings.enabled);
    abSchedule.value = settings.schedule === 'on_close' ? 'on_close' : 'daily';
    abRetainCount.value = String(settings.retainCount || 7);
    abFolder.value = settings.folder || '';
    if (abConfig) abConfig.classList.toggle('hidden', !abEnabled.checked);
    abStatus.dataset.saved = saved ? '1' : '';
    abUpdateStatus();
    await abRefreshRecent();
  }

  async function abLoad() {
    try {
      const res = await window.electronAPI.getAutoBackupSettings();
      if (res && res.ok) await abApplySettings(res.settings, true);
    } catch (e) {
      /* ignore */
    }
  }

  const abDefaultFolderBtn = document.getElementById('autobackupDefaultFolderBtn');

  if (abEnabled) {
    abEnabled.addEventListener('change', async () => {
      abShowMsg('');
      abConfig.classList.toggle('hidden', !abEnabled.checked);
      if (abEnabled.checked && !(abFolder.value || '').trim()) {
        try {
          const defRes = await window.electronAPI.getDefaultAutoBackupFolder();
          if (defRes && defRes.ok && defRes.folder) {
            abFolder.value = defRes.folder;
            abStatus.dataset.saved = '';
            await abRefreshRecent();
          }
        } catch (e) {}
      }
      abUpdateStatus();
    });
  }

  if (abDefaultFolderBtn) {
    abDefaultFolderBtn.addEventListener('click', async () => {
      abShowMsg('');
      try {
        const defRes = await window.electronAPI.getDefaultAutoBackupFolder();
        if (defRes && defRes.ok && defRes.folder) {
          abFolder.value = defRes.folder;
          abStatus.dataset.saved = '';
          abUpdateStatus();
          await abRefreshRecent();
        }
      } catch (e) {
        abShowMsg('Could not fetch default folder: ' + e.message, 'error');
      }
    });
  }

  if (abFolderBtn) {
    abFolderBtn.addEventListener('click', async () => {
      abShowMsg('');
      try {
        const res = await window.electronAPI.chooseAutoBackupFolder();
        if (res && res.ok && res.folder) {
          abFolder.value = res.folder;
          abStatus.dataset.saved = '';
          abUpdateStatus();
          await abRefreshRecent();
        } else if (res && res.error) {
          abShowMsg(res.error, 'error');
        }
      } catch (e) {
        abShowMsg('Could not open folder picker: ' + e.message, 'error');
      }
    });
  }

  if (abSaveBtn) {
    abSaveBtn.addEventListener('click', async () => {
      abShowMsg('');
      if (abEnabled.checked && !(abFolder.value || '').trim()) {
        abShowMsg('Choose a folder to store automatic backups.', 'error');
        return;
      }
      abSaveBtn.disabled = true;
      try {
        const res = await window.electronAPI.saveAutoBackupSettings({
          enabled: abEnabled.checked,
          schedule: abSchedule.value,
          folder: (abFolder.value || '').trim(),
          retainCount: Number(abRetainCount.value) || 7,
          lastBackupAt: abSettings.lastBackupAt || '',
        });
        if (res.ok) {
          await abApplySettings(res.settings, true);
          abShowMsg(
            abEnabled.checked
              ? 'Automatic backups are on — they run in the background without interrupting you.'
              : 'Automatic backups are off.',
            'success'
          );
        } else {
          abShowMsg(res.error || 'Could not save automatic backup settings.', 'error');
        }
      } catch (e) {
        abShowMsg('Could not save automatic backup settings: ' + e.message, 'error');
      } finally {
        abSaveBtn.disabled = false;
      }
    });
  }

  if (abNowBtn) {
    abNowBtn.addEventListener('click', async () => {
      abShowMsg('');
      if (!(abFolder.value || '').trim()) {
        abShowMsg('Choose a folder and Save before backing up now.', 'error');
        return;
      }
      abNowBtn.disabled = true;
      try {
        const res = await window.electronAPI.runAutoBackupNow();
        if (res && res.ok) {
          const s = await window.electronAPI.getAutoBackupSettings();
          await abApplySettings(s && s.ok ? s.settings : abSettings, true);
          abShowMsg('Backup created successfully.', 'success');
        } else {
          abShowMsg((res && res.error) || 'Could not create the backup.', 'error');
        }
      } catch (e) {
        abShowMsg('Could not create the backup: ' + e.message, 'error');
      } finally {
        abNowBtn.disabled = false;
      }
    });
  }

  abLoad();
  loadSettings();

  // ---------- Time Tracking (live timer rounding) ----------
  const timerRounding = document.getElementById('timerRounding');
  const timerRoundingStatus = document.getElementById('timerRoundingStatus');
  const timerRoundingSaveBtn = document.getElementById('timerRoundingSaveBtn');

  function timerLabel(minutes) {
    if (!minutes) return 'Exact (no rounding).';
    if (minutes === 6) return minutes + '-minute rounding (0.1 hour).';
    return minutes + '-minute rounding.';
  }

  async function timerLoad() {
    if (!timerRounding) return;
    try {
      const res = await window.electronAPI.getTimerSettings();
      if (res.ok && res.settings) {
        timerRounding.value = String(res.settings.roundingMinutes);
        if (timerRoundingStatus) timerRoundingStatus.textContent = timerLabel(res.settings.roundingMinutes);
      }
    } catch (e) {
      /* ignore */
    }
  }

  if (timerRounding && timerRoundingSaveBtn) {
    timerRounding.addEventListener('change', () => {
      if (timerRoundingStatus) {
        timerRoundingStatus.textContent = timerLabel(parseInt(timerRounding.value, 10) || 0);
      }
    });

    timerRoundingSaveBtn.addEventListener('click', async () => {
      const value = parseInt(timerRounding.value, 10) || 0;
      try {
        const res = await window.electronAPI.saveTimerSettings({ roundingMinutes: value });
        if (res.ok) {
          if (timerRoundingStatus) timerRoundingStatus.textContent = timerLabel(value);
          window.QuoteCraftUtils.showToast('Timer settings saved.', 'success');
        } else {
          window.QuoteCraftUtils.showToast((res.error) || 'Could not save timer settings.', 'error');
        }
      } catch (e) {
        window.QuoteCraftUtils.showToast('Could not save timer settings: ' + e.message, 'error');
      }
    });
  }

  timerLoad();

  // ---------- Diagnostics & System Health ----------
  const exportDiagnosticsBtn = document.getElementById('exportDiagnosticsBtn');
  const diagAppVersion = document.getElementById('diagAppVersion');
  const diagDbIntegrity = document.getElementById('diagDbIntegrity');
  const diagDbSize = document.getElementById('diagDbSize');
  const diagAttachmentsSize = document.getElementById('diagAttachmentsSize');

  async function loadDiagnostics() {
    try {
      const res = await window.electronAPI.getDiagnostics();
      if (!res || !res.ok) return;
      const d = res.diagnostics;
      if (diagAppVersion) diagAppVersion.textContent = `v${d.appVersion}`;
      if (diagDbIntegrity) {
        diagDbIntegrity.textContent = d.databaseIntegrity;
        diagDbIntegrity.style.color = d.databaseIntegrity.startsWith('Healthy') ? '#3fb950' : '#f85149';
      }
      if (diagDbSize) diagDbSize.textContent = `${d.databaseSizeMB} MB`;
      if (diagAttachmentsSize) diagAttachmentsSize.textContent = `${d.attachmentsSizeMB} MB (${d.attachmentsCount} file${d.attachmentsCount !== 1 ? 's' : ''})`;
    } catch (e) {
      /* silently ignore – non-critical */
    }
  }

  const verifyDbBtn = document.getElementById('verifyDbBtn');
  if (verifyDbBtn) {
    verifyDbBtn.addEventListener('click', async () => {
      verifyDbBtn.disabled = true;
      verifyDbBtn.textContent = 'Verifying…';
      try {
        const res = await window.electronAPI.verifyDatabaseHealth();
        if (res && res.ok) {
          window.QuoteCraftUtils.showToast(`Database healthy: ${res.tablesChecked} tables intact, integrity check passed.`, 'success');
          loadDiagnostics();
        } else {
          window.QuoteCraftUtils.showToast(res.error || 'Database integrity issue detected.', 'error');
        }
      } catch (err) {
        window.QuoteCraftUtils.showToast('Verification failed: ' + err.message, 'error');
      } finally {
        verifyDbBtn.disabled = false;
        verifyDbBtn.textContent = '🔍 Verify Database';
      }
    });
  }

  if (exportDiagnosticsBtn) {
    exportDiagnosticsBtn.addEventListener('click', async () => {
      exportDiagnosticsBtn.disabled = true;
      try {
        const clientErrs = window.__QuoteCraftErrors || [];
        const res = await window.electronAPI.exportDiagnostics(clientErrs);
        if (res && res.ok && !res.cancelled) {
          window.QuoteCraftUtils.showToast('Diagnostics report saved to ' + res.savedPath, 'success');
        } else if (res && !res.ok) {
          window.QuoteCraftUtils.showToast((res.errors && res.errors.general) || 'Could not export diagnostics.', 'error');
        }
      } catch (e) {
        window.QuoteCraftUtils.showToast('Could not export diagnostics: ' + e.message, 'error');
      } finally {
        exportDiagnosticsBtn.disabled = false;
      }
    });
  }

  const exportLogsBtn = document.getElementById('exportLogsBtn');
  if (exportLogsBtn) {
    exportLogsBtn.addEventListener('click', async () => {
      exportLogsBtn.disabled = true;
      try {
        const res = await window.electronAPI.exportLogs();
        if (res && res.ok && !res.cancelled) {
          window.QuoteCraftUtils.showToast('Application logs saved to ' + res.path, 'success');
        } else if (res && !res.ok) {
          window.QuoteCraftUtils.showToast(res.error || 'Could not export logs.', 'error');
        }
      } catch (err) {
        window.QuoteCraftUtils.showToast('Failed to export logs: ' + err.message, 'error');
      } finally {
        exportLogsBtn.disabled = false;
      }
    });
  }

  // ---------- Auto-Updater Controls ----------
  const checkForUpdatesBtn = document.getElementById('checkForUpdatesBtn');
  const installUpdateBtn = document.getElementById('installUpdateBtn');
  const updateStatusMessage = document.getElementById('updateStatusMessage');
  const updateProgressBarContainer = document.getElementById('updateProgressBarContainer');
  const updateProgressBar = document.getElementById('updateProgressBar');
  const updateProgressPercent = document.getElementById('updateProgressPercent');
  const updaterCurrentVersion = document.getElementById('updaterCurrentVersion');

  function updateUpdaterUI(status) {
    if (!status) return;
    if (status.currentVersion && updaterCurrentVersion) {
      updaterCurrentVersion.textContent = `v${status.currentVersion}`;
    }

    if (status.status === 'checking') {
      if (updateStatusMessage) {
        updateStatusMessage.textContent = 'Checking for updates...';
        updateStatusMessage.style.color = 'var(--text-muted, #8b949e)';
      }
      if (checkForUpdatesBtn) checkForUpdatesBtn.disabled = true;
    } else if (status.status === 'available') {
      if (updateStatusMessage) {
        updateStatusMessage.textContent = `Update v${status.version} found! Downloading in background...`;
        updateStatusMessage.style.color = '#38bdf8';
      }
      if (updateProgressBarContainer) updateProgressBarContainer.classList.remove('hidden');
      if (checkForUpdatesBtn) checkForUpdatesBtn.disabled = true;
    } else if (status.status === 'downloading') {
      if (updateProgressBarContainer) updateProgressBarContainer.classList.remove('hidden');
      if (updateProgressBar) updateProgressBar.style.width = `${status.progress}%`;
      if (updateProgressPercent) updateProgressPercent.textContent = `${status.progress}%`;
    } else if (status.status === 'downloaded') {
      if (updateProgressBarContainer) updateProgressBarContainer.classList.add('hidden');
      if (updateStatusMessage) {
        updateStatusMessage.textContent = `Update v${status.version} downloaded and ready to install.`;
        updateStatusMessage.style.color = '#34d399';
      }
      if (installUpdateBtn) installUpdateBtn.classList.remove('hidden');
      if (checkForUpdatesBtn) checkForUpdatesBtn.disabled = false;
    } else if (status.status === 'not-available') {
      if (updateStatusMessage) {
        updateStatusMessage.textContent = status.isDev ? 'Development mode (updates disabled)' : 'QuoteCraft is up to date.';
        updateStatusMessage.style.color = '#34d399';
      }
      if (updateProgressBarContainer) updateProgressBarContainer.classList.add('hidden');
      if (checkForUpdatesBtn) checkForUpdatesBtn.disabled = false;
    } else if (status.status === 'error') {
      if (updateStatusMessage) {
        updateStatusMessage.textContent = status.error ? `Update check error: ${status.error}` : 'Error checking for updates.';
        updateStatusMessage.style.color = '#f87171';
      }
      if (updateProgressBarContainer) updateProgressBarContainer.classList.add('hidden');
      if (checkForUpdatesBtn) checkForUpdatesBtn.disabled = false;
    }
  }

  if (window.electronAPI && window.electronAPI.onUpdateStatus) {
    window.electronAPI.onUpdateStatus(updateUpdaterUI);
    if (window.electronAPI.getUpdateStatus) {
      window.electronAPI.getUpdateStatus().then((res) => {
        if (res && res.ok && res.status) {
          updateUpdaterUI(res.status);
        }
      }).catch(() => {});
    }
  }

  if (checkForUpdatesBtn) {
    checkForUpdatesBtn.addEventListener('click', async () => {
      checkForUpdatesBtn.disabled = true;
      if (updateStatusMessage) updateStatusMessage.textContent = 'Connecting to update server...';
      try {
        const res = await window.electronAPI.checkForUpdates();
        if (res && res.status) {
          updateUpdaterUI(res.status);
        } else if (res && res.isDev) {
          if (updateStatusMessage) updateStatusMessage.textContent = 'Development mode — updates are disabled.';
        } else if (res && !res.ok) {
          if (updateStatusMessage) updateStatusMessage.textContent = res.error || 'Failed to check for updates.';
        }
      } catch (err) {
        if (updateStatusMessage) updateStatusMessage.textContent = err.message;
      } finally {
        checkForUpdatesBtn.disabled = false;
      }
    });
  }

  if (installUpdateBtn) {
    installUpdateBtn.addEventListener('click', async () => {
      try {
        await window.electronAPI.installUpdate();
      } catch (err) {
        window.QuoteCraftUtils.showToast('Failed to restart and install update: ' + err.message, 'error');
      }
    });
  }

  // ---------- Payment Instruction Presets ----------
  const presetsListEl = document.getElementById('paymentPresetsList');
  const addPresetBtn = document.getElementById('addPaymentPresetBtn');
  const presetModal = document.getElementById('paymentPresetModal');
  const presetModalClose = document.getElementById('paymentPresetModalClose');
  const cancelPresetBtn = document.getElementById('cancelPaymentPresetBtn');
  const presetForm = document.getElementById('paymentPresetForm');
  const presetIdInput = document.getElementById('presetId');
  const presetNameInput = document.getElementById('presetName');
  const presetBodyInput = document.getElementById('presetBody');
  const presetModalTitle = document.getElementById('paymentPresetModalTitle');

  function openPresetModal(preset = null) {
    if (!presetModal) return;
    if (preset) {
      if (presetModalTitle) presetModalTitle.textContent = 'Edit Payment Preset';
      if (presetIdInput) presetIdInput.value = preset.id;
      if (presetNameInput) presetNameInput.value = preset.name || '';
      if (presetBodyInput) presetBodyInput.value = preset.body || '';
    } else {
      if (presetModalTitle) presetModalTitle.textContent = 'Add Payment Preset';
      if (presetIdInput) presetIdInput.value = '';
      if (presetNameInput) presetNameInput.value = '';
      if (presetBodyInput) presetBodyInput.value = '';
    }
    presetModal.classList.remove('hidden');
    if (presetNameInput) presetNameInput.focus();
  }

  function closePresetModal() {
    if (!presetModal) return;
    presetModal.classList.add('hidden');
    if (presetForm) presetForm.reset();
  }

  if (addPresetBtn) addPresetBtn.addEventListener('click', () => openPresetModal(null));
  if (presetModalClose) presetModalClose.addEventListener('click', closePresetModal);
  if (cancelPresetBtn) cancelPresetBtn.addEventListener('click', closePresetModal);

  async function loadPaymentPresets() {
    if (!presetsListEl || !window.electronAPI || !window.electronAPI.listPaymentPresets) return;
    try {
      const res = await window.electronAPI.listPaymentPresets();
      if (!res || !res.ok) {
        presetsListEl.innerHTML = '<div class="payment-preset-empty">Failed to load presets</div>';
        return;
      }
      renderPaymentPresets(res.presets || []);
    } catch (err) {
      presetsListEl.innerHTML = '<div class="payment-preset-empty">Error loading presets</div>';
    }
  }

  function renderPaymentPresets(presets) {
    if (!presetsListEl) return;
    if (!presets || presets.length === 0) {
      presetsListEl.innerHTML = '<div class="payment-preset-empty">No payment instruction presets yet. Click "+ Add preset" to create one.</div>';
      return;
    }

    presetsListEl.innerHTML = '';
    presets.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'payment-preset-item';

      const main = document.createElement('div');
      main.className = 'payment-preset-main';

      const title = document.createElement('div');
      title.className = 'payment-preset-title';
      title.textContent = p.name;

      const body = document.createElement('pre');
      body.className = 'payment-preset-body';
      body.textContent = p.body;

      main.appendChild(title);
      main.appendChild(body);

      const actions = document.createElement('div');
      actions.className = 'payment-preset-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-small btn-secondary';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openPresetModal(p));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-small btn-danger';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Delete preset "${p.name}"?`)) return;
        try {
          const dRes = await window.electronAPI.deletePaymentPreset(p.id);
          if (dRes && dRes.ok) {
            window.QuoteCraftUtils.showToast('Preset deleted.', 'success');
            loadPaymentPresets();
            window.dispatchEvent(new CustomEvent('qc-payment-presets-updated'));
          } else {
            window.QuoteCraftUtils.showToast((dRes && dRes.error) || 'Failed to delete preset.', 'error');
          }
        } catch (e) {
          window.QuoteCraftUtils.showToast('Error deleting preset: ' + e.message, 'error');
        }
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      item.appendChild(main);
      item.appendChild(actions);
      presetsListEl.appendChild(item);
    });
  }

  if (presetForm) {
    presetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = presetIdInput.value;
      const name = presetNameInput.value.trim();
      const body = presetBodyInput.value.trim();

      if (!name) {
        window.QuoteCraftUtils.showToast('Preset name is required.', 'error');
        return;
      }
      if (!body) {
        window.QuoteCraftUtils.showToast('Payment instructions cannot be empty.', 'error');
        return;
      }

      try {
        let res;
        if (id) {
          res = await window.electronAPI.updatePaymentPreset(Number(id), { name, body });
        } else {
          res = await window.electronAPI.createPaymentPreset({ name, body });
        }

        if (res && res.ok) {
          closePresetModal();
          window.QuoteCraftUtils.showToast(id ? 'Preset updated.' : 'Preset created.', 'success');
          loadPaymentPresets();
          window.dispatchEvent(new CustomEvent('qc-payment-presets-updated'));
        } else {
          window.QuoteCraftUtils.showToast((res && res.error) || 'Could not save preset.', 'error');
        }
      } catch (err) {
        window.QuoteCraftUtils.showToast('Failed to save preset: ' + err.message, 'error');
      }
    });
  }

  const exportAllDataBtn = document.getElementById('exportAllDataBtn');
  if (exportAllDataBtn) {
    exportAllDataBtn.addEventListener('click', async () => {
      exportAllDataBtn.disabled = true;
      const originalText = exportAllDataBtn.textContent;
      exportAllDataBtn.textContent = '⏳ Preparing export…';
      try {
        const res = await window.electronAPI.exportAllData();
        if (res && res.ok && !res.cancelled) {
          window.QuoteCraftUtils.showToast('Data exported successfully to ' + res.savedPath, 'success');
        } else if (res && !res.ok) {
          window.QuoteCraftUtils.showToast(res.error || 'Export failed.', 'error');
        }
      } catch (e) {
        window.QuoteCraftUtils.showToast('Export failed: ' + e.message, 'error');
      } finally {
        exportAllDataBtn.disabled = false;
        exportAllDataBtn.textContent = originalText;
      }
    });
  }

  const setDefault75VatBtn = document.getElementById('setDefault75VatBtn');
  if (setDefault75VatBtn) {
    setDefault75VatBtn.addEventListener('click', () => {
      const defTaxInput = document.getElementById('default_tax_rate');
      if (defTaxInput) {
        defTaxInput.value = '7.5';
        window.QuoteCraftUtils.showToast('Default tax rate set to 7.5% (Nigerian statutory VAT)', 'info');
      }
    });
  }

  loadDiagnostics();
  loadPaymentPresets();
  document.addEventListener('pagechange', (e) => {
    if (e.detail === 'settings') {
      loadPaymentPresets();
      loadLicenseStatus();
    }
  });

  // ---------------------------------------------------------------------------
  // License Management
  // ---------------------------------------------------------------------------

  /**
   * Refreshes and renders the license status panel.
   */
  async function loadLicenseStatus() {
    const badge = document.getElementById('licenseStatusBadge');
    const activePanel = document.getElementById('licenseActivePanel');
    const activeName = document.getElementById('licenseActiveName');
    const activeEmail = document.getElementById('licenseActiveEmail');
    const activePlan = document.getElementById('licenseActivePlan');
    const activeIssued = document.getElementById('licenseActiveIssued');
    const activeExpiry = document.getElementById('licenseActiveExpiry');
    const expiryWrap = document.getElementById('licenseExpiryWrap');
    const purchasePanel = document.getElementById('licensePurchasePanel');
    const keyInput = document.getElementById('licenseKeyInput');

    if (!window.electronAPI || typeof window.electronAPI.getLicense !== 'function') return;

    try {
      const res = await window.electronAPI.getLicense();
      if (!res || !res.isPro || !res.license) {
        // Free tier
        if (badge) {
          badge.textContent = '\uD83D\uDD12 Free Tier';
          badge.style.background = 'rgba(107,114,128,0.15)';
          badge.style.color = '#9ca3af';
          badge.style.border = '1px solid rgba(107,114,128,0.3)';
        }
        if (activePanel) activePanel.style.display = 'none';
        if (purchasePanel) purchasePanel.style.display = '';
        if (keyInput) keyInput.value = '';
      } else {
        // Pro active
        const lic = res.license;
        if (badge) {
          badge.textContent = '\u26A1 QuoteCraft Pro';
          badge.style.background = 'rgba(16,185,129,0.15)';
          badge.style.color = '#10b981';
          badge.style.border = '1px solid rgba(16,185,129,0.4)';
        }
        if (activePanel) activePanel.style.display = '';
        if (purchasePanel) purchasePanel.style.display = 'none';
        if (activeName) activeName.textContent = `QuoteCraft Pro \u2014 Active`;
        if (activeEmail) activeEmail.textContent = lic.licensee_email || '';
        if (activePlan) activePlan.textContent = lic.plan === 'lifetime' ? 'Lifetime' : 'Annual';
        if (activeIssued) {
          activeIssued.textContent = lic.issued_at ? new Date(lic.issued_at).toLocaleDateString() : '\u2014';
        }
        if (expiryWrap && activeExpiry) {
          if (lic.expiry_date) {
            expiryWrap.style.display = '';
            activeExpiry.textContent = new Date(lic.expiry_date).toLocaleDateString();
          } else {
            expiryWrap.style.display = 'none';
          }
        }
        if (keyInput) keyInput.value = '';
      }
    } catch (err) {
      console.error('[LicensePanel] Failed to load license status:', err);
    }
  }

  const licenseActivateBtn = document.getElementById('licenseActivateBtn');
  if (licenseActivateBtn) {
    licenseActivateBtn.addEventListener('click', async () => {
      const keyInput = document.getElementById('licenseKeyInput');
      const msgEl = document.getElementById('licenseActivateMsg');
      const key = keyInput ? keyInput.value.trim() : '';

      if (!key) {
        if (msgEl) { msgEl.textContent = 'Please enter your license key.'; msgEl.style.color = '#f87171'; }
        return;
      }

      licenseActivateBtn.disabled = true;
      licenseActivateBtn.textContent = '\u23F3 Activating\u2026';
      if (msgEl) { msgEl.textContent = ''; }

      try {
        const res = await window.electronAPI.activateLicense(key);
        if (res && res.ok) {
          if (msgEl) {
            msgEl.textContent = '\u2705 License activated successfully! Welcome to QuoteCraft Pro.';
            msgEl.style.color = '#10b981';
          }
          window.QuoteCraftUtils.showToast('\u26A1 QuoteCraft Pro activated! All premium features are now unlocked.', 'success');
          await loadLicenseStatus();
          // Dispatch event so other parts of the app can update
          document.dispatchEvent(new CustomEvent('licensechange', { detail: { isPro: true } }));
        } else {
          if (msgEl) {
            msgEl.textContent = '\u274C ' + (res.message || 'Invalid license key. Please check and try again.');
            msgEl.style.color = '#f87171';
          }
        }
      } catch (err) {
        if (msgEl) { msgEl.textContent = '\u274C Error: ' + err.message; msgEl.style.color = '#f87171'; }
      } finally {
        licenseActivateBtn.disabled = false;
        licenseActivateBtn.textContent = '\u2705 Activate';
      }
    });
  }

  const licenseDeactivateBtn = document.getElementById('licenseDeactivateBtn');
  if (licenseDeactivateBtn) {
    licenseDeactivateBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to remove your QuoteCraft Pro license? Pro features will be disabled until you re-activate.')) return;
      try {
        await window.electronAPI.deactivateLicense();
        window.QuoteCraftUtils.showToast('License removed. You are now on the Free tier.', 'info');
        await loadLicenseStatus();
        document.dispatchEvent(new CustomEvent('licensechange', { detail: { isPro: false } }));
      } catch (err) {
        window.QuoteCraftUtils.showToast('Failed to remove license: ' + err.message, 'error');
      }
    });
  }

  const licenseUpgradeBtn = document.getElementById('licenseUpgradeBtn');
  if (licenseUpgradeBtn) {
    licenseUpgradeBtn.addEventListener('click', () => {
      // Opens the official QuoteCraft purchase page in the default browser
      const purchaseUrl = 'https://paystack.shop/pay/quotecraft';
      if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal(purchaseUrl);
      } else {
        window.open(purchaseUrl, '_blank');
      }
      window.QuoteCraftUtils.showToast('Opening QuoteCraft Pro purchase page in your browser\u2026', 'info');
    });
  }

  // Load license status on first settings page load
  loadLicenseStatus();
})();
