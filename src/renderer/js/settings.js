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
      default_quote_acceptance_instructions: 'To accept this quote, please reply to confirm via email or phone.',
      payment_details: '',
      invoice_prefix: 'INV-',
      invoice_start_number: 1,
      quote_prefix: 'Q-',
      quote_start_number: 1,
      credit_note_prefix: 'CN-',
      credit_note_start_number: 1,
      default_currency: 'USD',
      reporting_currency: 'USD',
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
        el.type !== 'radio' &&
        !isRadioGroup(el)
      ) {
        el.value = data[el.name] !== undefined && data[el.name] !== null ? data[el.name] : '';
      }
    }
    if (window.QuoteCraftTheme) {
      const activeMode = window.QuoteCraftTheme.getMode();
      themeInputs.forEach((el) => {
        el.checked = el.value === activeMode;
      });
    }
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

  function isRadioGroup(el) {
    return typeof RadioNodeList !== 'undefined' && el instanceof RadioNodeList;
  }

  function collectForm() {
    const data = {};
    for (const key of Object.keys(form.elements)) {
      const el = form.elements[key];
      // Skip radio inputs (e.g. themeMode) — they are app preferences, not company profile database fields.
      if (
        el &&
        el.name &&
        el.name !== 'themeMode' &&
        el.type !== 'radio' &&
        !isRadioGroup(el)
      ) {
        data[el.name] = el.value;
      }
    }
    data.default_tax_rate = data.default_tax_rate === '' ? '' : Number(data.default_tax_rate);
    data.invoice_start_number = data.invoice_start_number === '' ? '' : Number(data.invoice_start_number);
    data.quote_start_number = data.quote_start_number === '' ? '' : Number(data.quote_start_number);
    data.credit_note_start_number = data.credit_note_start_number === '' ? '' : Number(data.credit_note_start_number);
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

  if (abEnabled) {
    abEnabled.addEventListener('change', () => {
      abShowMsg('');
      abConfig.classList.toggle('hidden', !abEnabled.checked);
      abUpdateStatus();
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
})();
