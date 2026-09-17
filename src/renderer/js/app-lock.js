(function () {
  const overlay = document.getElementById('appLockOverlay');
  if (!overlay) return;

  const pinInput = document.getElementById('lockPinInput');
  const unlockBtn = document.getElementById('lockUnlockBtn');
  const errorEl = document.getElementById('lockError');

  let enabled = false;
  let inactivityMinutes = 5;
  let isLocked = false;
  let lastActivity = Date.now();

  function showError(msg) {
    if (errorEl) {
      errorEl.textContent = msg || '';
      errorEl.style.minHeight = '18px';
    }
  }

  function showOverlay() {
    isLocked = true;
    showError('');
    if (pinInput) {
      pinInput.value = '';
      setTimeout(() => pinInput.focus(), 50);
    }
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function hideOverlay() {
    isLocked = false;
    lastActivity = Date.now();
    overlay.classList.remove('active');
    overlay.setAttribute('aria-hidden', 'true');
  }

  function touch() {
    if (isLocked) return;
    lastActivity = Date.now();
  }

  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'scroll'].forEach(function (evt) {
    window.addEventListener(evt, touch, { passive: true });
  });

  async function refresh() {
    try {
      const res = await window.electronAPI.getAppLockSettings();
      if (!res || !res.ok) {
        enabled = false;
        return;
      }
      enabled = Boolean(res.settings.is_enabled);
      inactivityMinutes = Number(res.settings.inactivity_minutes) || 5;
    } catch (e) {
      enabled = false;
    }
    return enabled;
  }

  async function tryUnlock() {
    const pin = (pinInput && pinInput.value) || '';
    if (!pin) {
      showError('Enter your PIN.');
      return;
    }
    try {
      const res = await window.electronAPI.verifyAppLockPin(pin);
      if (res && res.ok && res.unlocked) {
        hideOverlay();
        window.dispatchEvent(new CustomEvent('qc-app-unlocked'));
      } else {
        showError('Incorrect PIN. Try again.');
        if (pinInput) {
          pinInput.value = '';
          pinInput.focus();
        }
      }
    } catch (e) {
      showError('Could not verify PIN: ' + (e.message || 'unknown error'));
    }
  }

  if (unlockBtn) unlockBtn.addEventListener('click', tryUnlock);
  if (pinInput) {
    pinInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryUnlock();
    });
  }

  async function lockFromSettingsChange() {
    const isEnabled = await refresh();
    if (isEnabled) {
      showOverlay();
    } else {
      hideOverlay();
    }
  }

  window.addEventListener('qc-app-lock-changed', lockFromSettingsChange);

  setInterval(function () {
    if (!enabled || isLocked) return;
    if (inactivityMinutes <= 0) return;
    if (Date.now() - lastActivity >= inactivityMinutes * 60 * 1000) {
      showOverlay();
    }
  }, 30000);

  refresh().then(function (isEnabled) {
    if (isEnabled) showOverlay();
  });

  window.QuoteCraftLock = { refresh, lockNow: showOverlay };
})();