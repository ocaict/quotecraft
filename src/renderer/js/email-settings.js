/* =====================================================================
   Email Settings  – renderer logic
   ===================================================================== */

const EMAIL_PROVIDERS = {
  gmail: {
    label: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    hint: 'Gmail requires an <strong>App Password</strong>. You cannot use your regular Google password here.',
    link: 'https://myaccount.google.com/apppasswords',
    linkLabel: 'Create Gmail App Password',
  },
  outlook: {
    label: 'Outlook / Hotmail',
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    hint: 'Outlook uses STARTTLS on port 587. Enable 2-factor authentication, then create an app password.',
    link: 'https://account.live.com/proofs/manage',
    linkLabel: 'Manage Outlook Security',
  },
  yahoo: {
    label: 'Yahoo Mail',
    host: 'smtp.mail.yahoo.com',
    port: 465,
    secure: true,
    hint: 'Yahoo requires an <strong>App Password</strong>. Go to your Yahoo Account Security page to generate one.',
    link: 'https://login.yahoo.com/account/security',
    linkLabel: 'Yahoo Account Security',
  },
  icloud: {
    label: 'iCloud',
    host: 'smtp.mail.me.com',
    port: 587,
    secure: false,
    hint: 'iCloud Mail requires an <strong>App-Specific Password</strong> from your Apple ID settings.',
    link: 'https://appleid.apple.com/account/manage',
    linkLabel: 'Apple ID — App Passwords',
  },
  ethereal: {
    label: 'Ethereal (Test)',
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    hint: 'Ethereal is a free mock SMTP service for safe testing. No emails are sent to real people. Log in at ethereal.email to view sent test messages.',
    link: 'https://ethereal.email',
    linkLabel: 'Create Ethereal Account',
  },
  custom: {
    label: 'Other / Custom',
    host: '',
    port: 587,
    secure: false,
    hint: null,
    link: null,
    linkLabel: null,
  },
};

let currentSettings = null;
let hasPasswordSaved = false;

// ── Bootstrap ──────────────────────────────────────────────────────────────
async function initEmailSettings() {
  renderProviderPills();
  bindEvents();
  await loadSettings();
  await initReminderRules();
}

// ── Render provider quick-fill pills ──────────────────────────────────────
function renderProviderPills() {
  const wrap = document.getElementById('email-provider-pills');
  if (!wrap) return;
  wrap.innerHTML = Object.entries(EMAIL_PROVIDERS).map(([key, p]) =>
    `<button class="provider-pill" data-provider="${key}" type="button">${p.label}</button>`
  ).join('');

  wrap.querySelectorAll('.provider-pill').forEach(btn => {
    btn.addEventListener('click', () => applyProviderPreset(btn.dataset.provider));
  });
}

// ── Apply provider preset ─────────────────────────────────────────────────
function applyProviderPreset(key) {
  const p = EMAIL_PROVIDERS[key];
  if (!p) return;

  // Update pills active state
  document.querySelectorAll('.provider-pill').forEach(b =>
    b.classList.toggle('active', b.dataset.provider === key)
  );

  const host = document.getElementById('es-smtp-host');
  const port = document.getElementById('es-smtp-port');
  const secure = document.getElementById('es-smtp-secure');

  if (host) host.value = p.host;
  if (port) port.value = p.port;
  if (secure) secure.checked = p.secure;

  // Show/hide app-password notice
  const notice = document.getElementById('es-app-password-notice');
  const noticeText = document.getElementById('es-app-password-text');
  const noticeLinks = document.getElementById('es-app-password-links');

  if (notice) {
    if (p.hint) {
      notice.style.display = 'block';
      if (noticeText) noticeText.innerHTML = p.hint;
      if (noticeLinks && p.link) {
        noticeLinks.innerHTML = `<button class="provider-link-btn" onclick="openProviderLink('${p.link}')">🔗 ${p.linkLabel}</button>`;
      } else if (noticeLinks) {
        noticeLinks.innerHTML = '';
      }
    } else {
      notice.style.display = 'none';
    }
  }
}

// ── Load existing settings from the DB ────────────────────────────────────
async function loadSettings() {
  try {
    const res = await window.electronAPI.getEmailSettings();
    if (!res.ok) throw new Error(JSON.stringify(res.errors));

    const s = res.settings;
    currentSettings = s;

    // Default to Gmail if settings are missing or host is empty
    const host = (s && s.smtp_host) ? s.smtp_host : 'smtp.gmail.com';
    const port = (s && s.smtp_port) ? s.smtp_port : 465;
    const isSecure = (s && s.smtp_host) ? !!s.smtp_secure : true;

    setField('es-sender-name', s?.sender_name || '');
    setField('es-sender-email', s?.sender_email || '');
    setField('es-smtp-host', host);
    setField('es-smtp-port', port);
    setField('es-smtp-username', s?.smtp_username || '');

    const secure = document.getElementById('es-smtp-secure');
    if (secure) secure.checked = isSecure;

    hasPasswordSaved = !!s?.password_saved;
    updatePasswordBadge();

    // Determine matching provider preset (defaults to 'gmail')
    let matchedProvider = 'custom';
    const lowerHost = host.toLowerCase();
    if (lowerHost.includes('gmail')) matchedProvider = 'gmail';
    else if (lowerHost.includes('outlook') || lowerHost.includes('office365') || lowerHost.includes('live.com') || lowerHost.includes('hotmail')) matchedProvider = 'outlook';
    else if (lowerHost.includes('yahoo')) matchedProvider = 'yahoo';
    else if (lowerHost.includes('mail.me.com') || lowerHost.includes('icloud')) matchedProvider = 'icloud';
    else if (lowerHost.includes('ethereal')) matchedProvider = 'ethereal';

    // Highlight active preset pill
    document.querySelectorAll('.provider-pill').forEach(b =>
      b.classList.toggle('active', b.dataset.provider === matchedProvider)
    );

    // Show appropriate app password notice (especially for Gmail)
    const p = EMAIL_PROVIDERS[matchedProvider];
    const notice = document.getElementById('es-app-password-notice');
    const noticeText = document.getElementById('es-app-password-text');
    const noticeLinks = document.getElementById('es-app-password-links');

    if (notice) {
      if (p && p.hint) {
        notice.style.display = 'block';
        if (noticeText) noticeText.innerHTML = p.hint;
        if (noticeLinks && p.link) {
          noticeLinks.innerHTML = `<button class="provider-link-btn" onclick="openProviderLink('${p.link}')">🔗 ${p.linkLabel}</button>`;
        } else if (noticeLinks) {
          noticeLinks.innerHTML = '';
        }
      } else {
        notice.style.display = 'none';
      }
    }

    // Pre-fill test-email recipient with sender address if set
    const testInput = document.getElementById('es-test-recipient');
    if (testInput && s && s.sender_email && !testInput.value) {
      testInput.value = s.sender_email;
    }
  } catch (err) {
    showToast('Could not load email settings: ' + err.message, 'error');
  }
}

function setField(id, value) {
  const el = document.getElementById(id);
  if (el && value !== null && value !== undefined) el.value = value;
}

// ── Password badge ─────────────────────────────────────────────────────────
function updatePasswordBadge() {
  const badge = document.getElementById('es-password-badge');
  const pwInput = document.getElementById('es-smtp-password');
  if (!badge) return;

  const currentHost = getField('es-smtp-host').trim();
  const currentUser = getField('es-smtp-username').trim();
  const hostChanged = currentSettings && currentSettings.smtp_host && currentHost !== currentSettings.smtp_host;
  const userChanged = currentSettings && currentSettings.smtp_username && currentUser !== currentSettings.smtp_username;

  if (hostChanged || userChanged) {
    badge.style.display = 'none';
    if (pwInput && !pwInput.value) {
      pwInput.placeholder = 'Enter password for this account';
    }
  } else if (hasPasswordSaved && pwInput && !pwInput.value) {
    badge.style.display = 'inline-flex';
    badge.textContent = '🔒 Stored Securely';
    pwInput.placeholder = 'Enter password (leave blank to keep current)';
  } else {
    badge.style.display = 'none';
  }
}

// ── Bind all interactive events ────────────────────────────────────
function bindEvents() {
  // Password visibility toggle
  const toggleBtn = document.getElementById('es-toggle-password');
  const pwInput = document.getElementById('es-smtp-password');
  if (toggleBtn && pwInput) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = pwInput.type === 'password';
      pwInput.type = isHidden ? 'text' : 'password';
      toggleBtn.textContent = isHidden ? '🙈' : '👁️';
    });
    pwInput.addEventListener('input', updatePasswordBadge);
  }

  // Watch host and username changes to update password badge
  const hostInput = document.getElementById('es-smtp-host');
  const userInput = document.getElementById('es-smtp-username');
  if (hostInput) hostInput.addEventListener('input', updatePasswordBadge);
  if (userInput) userInput.addEventListener('input', updatePasswordBadge);

  // Save buttons (top and bottom)
  const saveBtn = document.getElementById('es-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', () => saveSettings());

  const bottomSaveBtn = document.getElementById('es-save-btn-bottom');
  if (bottomSaveBtn) bottomSaveBtn.addEventListener('click', () => saveSettings());

  // Send test email button
  const testBtn = document.getElementById('es-test-btn');
  if (testBtn) testBtn.addEventListener('click', sendTestEmail);

  // Auto-sync SMTP Username from Sender Email Address if user hasn't set a different username
  const senderEmailEl = document.getElementById('es-sender-email');
  const smtpUserEl = document.getElementById('es-smtp-username');
  if (senderEmailEl && smtpUserEl) {
    let lastSynced = senderEmailEl.value;
    senderEmailEl.addEventListener('input', () => {
      if (!smtpUserEl.value || smtpUserEl.value === lastSynced) {
        smtpUserEl.value = senderEmailEl.value;
        lastSynced = senderEmailEl.value;
        // Also clear any error on smtp-username if it was flagged
        clearFieldErrors('email-settings-section');
      }
    });
  }

  // Clear previous test result message when user edits connection settings
  const watchIds = ['es-sender-email', 'es-smtp-host', 'es-smtp-port', 'es-smtp-username', 'es-smtp-password', 'es-smtp-secure', 'es-test-recipient'];
  watchIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        const testRes = document.getElementById('es-test-result');
        if (testRes && testRes.classList.contains('error')) {
          testRes.style.display = 'none';
        }
      });
    }
  });
}

// ── Save settings ──────────────────────────────────────────────────────────
async function saveSettings(options = {}) {
  const silent = Boolean(options && options.silent);
  clearFieldErrors('email-settings-section');

  const senderEmail = getField('es-sender-email').trim();
  let smtpUser = getField('es-smtp-username').trim();

  // If SMTP Username was left blank, seamlessly auto-populate it from Sender Email!
  if (!smtpUser && senderEmail) {
    smtpUser = senderEmail;
    setField('es-smtp-username', smtpUser);
  }

  let passInput = getField('es-smtp-password').trim();
  const host = getField('es-smtp-host').trim();
  if (host.toLowerCase().includes('gmail') && passInput) {
    passInput = passInput.replace(/\s+/g, '');
  }

  const payload = {
    sender_name:   getField('es-sender-name').trim(),
    sender_email:  senderEmail,
    smtp_host:     host,
    smtp_port:     parseInt(getField('es-smtp-port') || '465', 10),
    smtp_username: smtpUser,
    smtp_password: passInput,   // empty string → keep existing
    smtp_secure:   document.getElementById('es-smtp-secure')?.checked ? 1 : 0,
  };

  // Basic validation
  const errors = {};
  if (!payload.smtp_host.trim()) errors['es-smtp-host'] = 'SMTP host is required';
  if (!payload.smtp_port || payload.smtp_port < 1 || payload.smtp_port > 65535)
    errors['es-smtp-port'] = 'Enter a valid port (1–65535)';
  if (!payload.smtp_username.trim()) errors['es-smtp-username'] = 'Username / email is required';
  if (!payload.sender_email.trim()) errors['es-sender-email'] = 'Sender email is required';

  const hostChanged = currentSettings && currentSettings.smtp_host && host !== currentSettings.smtp_host;
  const userChanged = currentSettings && currentSettings.smtp_username && smtpUser !== currentSettings.smtp_username;
  if ((hostChanged || userChanged || !hasPasswordSaved) && !passInput) {
    errors['es-smtp-password'] = 'Enter the password or app password for this account';
  }

  if (Object.keys(errors).length) {
    Object.entries(errors).forEach(([id, msg]) => showFieldError(id, msg));
    return false;
  }

  const saveBtn = document.getElementById('es-save-btn');
  const bottomSaveBtn = document.getElementById('es-save-btn-bottom');
  if (!silent) {
    setButtonLoading(saveBtn, true, 'Saving…');
    if (bottomSaveBtn) setButtonLoading(bottomSaveBtn, true, 'Saving…');
  }

  try {
    const res = await window.electronAPI.saveEmailSettings(payload);
    if (!res.ok) {
      if (res.errors) {
        Object.entries(res.errors).forEach(([k, v]) => {
          const fieldId = k === 'general' ? null : `es-${k.replace(/_/g, '-')}`;
          if (fieldId) showFieldError(fieldId, v);
          else showToast(v, 'error');
        });
      } else {
        showToast('Failed to save settings.', 'error');
      }
      return false;
    }

    hasPasswordSaved = !!payload.smtp_password || hasPasswordSaved;
    updatePasswordBadge();
    const pwEl = document.getElementById('es-smtp-password');
    if (pwEl && payload.smtp_password) pwEl.value = '';

    if (!silent) {
      showToast('Email settings saved securely.', 'success');
    }
    await loadSettings();
    return true;
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
    return false;
  } finally {
    if (!silent) {
      setButtonLoading(saveBtn, false, '💾 Save Settings');
      if (bottomSaveBtn) setButtonLoading(bottomSaveBtn, false, '💾 Save Settings');
    }
  }
}

// ── Send test email ────────────────────────────────────────────────────────
async function sendTestEmail() {
  const recipient = getField('es-test-recipient').trim();
  if (!recipient) {
    showTestResult('error', '⚠️ Enter a recipient address first.', null);
    return;
  }

  // Auto-save form fields first so test always runs against what is typed on-screen!
  const saved = await saveSettings({ silent: true });
  if (!saved) {
    showTestResult('error', '⚠️ Please resolve configuration errors above before sending.', null);
    return;
  }

  const testBtn = document.getElementById('es-test-btn');
  setButtonLoading(testBtn, true, '⏳ Sending…');
  showTestResult('loading', 'Connecting to your SMTP server…', null);

  try {
    const res = await window.electronAPI.sendTestEmail(recipient);
    if (res.ok) {
      const host = (getField('es-smtp-host') || '').toLowerCase();
      const destNote = host.includes('ethereal')
        ? 'View delivered message at ethereal.email.'
        : 'Check your inbox (and spam folder).';
      showTestResult(
        'success',
        `Test email sent to <strong>${escapeHtml(recipient)}</strong>!`,
        `Message ID: ${res.messageId || 'N/A'}. ${destNote}`
      );
    } else {
      showTestResult(
        'error',
        res.diagnosis?.title || 'Failed to send test email',
        res.error || 'Unknown error. Check your SMTP settings and try again.',
        res.diagnostic
      );
    }
  } catch (err) {
    showTestResult('error', 'Unexpected error', err.message);
  } finally {
    setButtonLoading(testBtn, false, '📨 Send Test Email');
  }
}

function showTestResult(type, headline, detail, diagnostic) {
  const el = document.getElementById('es-test-result');
  if (!el) return;
  el.style.display = 'flex';
  el.className = 'test-result-alert ' + type;

  const icons = { success: '✅', error: '❌', loading: '⏳' };
  el.innerHTML = `
    <span class="test-result-icon">${icons[type] || 'ℹ️'}</span>
    <div class="test-result-detail">
      <strong>${headline}</strong>
      ${detail ? `<div>${detail}</div>` : ''}
      ${diagnostic ? `<div class="raw-error">${escapeHtml(diagnostic)}</div>` : ''}
    </div>`;
}

// ── Open provider link in system browser ──────────────────────────────────
window.openProviderLink = function(url) {
  window.electronAPI.openExternal(url);
};

// ── Helpers ────────────────────────────────────────────────────────────────
function getField(id) {
  return document.getElementById(id)?.value ?? '';
}

function setButtonLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('btn-loading', loading);
  btn.textContent = label;
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('input-error');
  const errEl = document.createElement('p');
  errEl.className = 'field-error';
  errEl.textContent = msg;
  el.closest('.field')?.appendChild(errEl);
}

function clearFieldErrors(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  section.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));
  section.querySelectorAll('.field-error').forEach(el => el.remove());
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Entry point ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initEmailSettings);

document.addEventListener('pagechange', async (e) => {
  if (e.detail === 'email-settings') {
    await loadSettings();
    await loadReminderSettingsAndRules();
  }
});

// ── Payment Reminder Rules & Engine ───────────────────────────────────────

let loadedReminderRules = [];

async function initReminderRules() {
  bindReminderEvents();
  await loadReminderSettingsAndRules();
}

async function loadReminderSettingsAndRules() {
  try {
    const [settingsRes, rulesRes] = await Promise.all([
      window.electronAPI.getReminderSettings(),
      window.electronAPI.getReminderRules(),
    ]);

    if (settingsRes && settingsRes.ok) {
      const autoToggle = document.getElementById('es-auto-send-toggle');
      if (autoToggle) {
        autoToggle.checked = Boolean(settingsRes.settings?.auto_send_reminders);
      }
    }

    if (rulesRes && rulesRes.ok) {
      loadedReminderRules = rulesRes.rules || [];
      renderReminderRulesList(loadedReminderRules);
    }
  } catch (err) {
    console.error('Failed to load reminder rules:', err);
  }
}

function renderReminderRulesList(rules) {
  const container = document.getElementById('reminderRulesContainer');
  if (!container) return;

  if (!rules || !rules.length) {
    container.innerHTML = '<p class="empty" style="text-align:center;padding:20px;">No reminder rules configured. Click "+ Add Reminder Rule" or "Reset Defaults".</p>';
    return;
  }

  container.innerHTML = rules.map((r) => {
    let timingLabel = '';
    let badgeClass = '';
    if (r.timing_type === 'before_due') {
      timingLabel = `${r.days} day${r.days === 1 ? '' : 's'} before due date`;
      badgeClass = 'before';
    } else if (r.timing_type === 'on_due') {
      timingLabel = 'On due date';
      badgeClass = 'on_due';
    } else if (r.timing_type === 'after_due') {
      timingLabel = `${r.days} day${r.days === 1 ? '' : 's'} after due date (overdue)`;
      badgeClass = 'overdue';
    }

    const isEnabled = Boolean(r.is_enabled);
    const isDefault = [1, 2, 3].includes(r.id);

    return `
      <div class="reminder-rule-card ${isEnabled ? '' : 'disabled'}" data-rule-id="${r.id}">
        <div class="reminder-rule-info">
          <div class="reminder-rule-header">
            <span class="reminder-rule-title">${escapeHtml(r.name)}</span>
            <span class="reminder-timing-badge ${badgeClass}">${escapeHtml(timingLabel)}</span>
          </div>
          <div class="reminder-rule-subject">
            <strong>Subject:</strong> ${escapeHtml(r.subject_template)}
          </div>
        </div>
        <div class="reminder-rule-actions">
          <label class="toggle-switch" title="${isEnabled ? 'Disable rule' : 'Enable rule'}">
            <input type="checkbox" class="rule-status-toggle" data-rule-id="${r.id}" ${isEnabled ? 'checked' : ''}>
            <span class="toggle-track"></span>
          </label>
          <button type="button" class="btn btn-small btn-secondary btn-edit-rule" data-rule-id="${r.id}">Edit</button>
          ${!isDefault ? `<button type="button" class="btn btn-small btn-danger btn-delete-rule" data-rule-id="${r.id}">Delete</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.rule-status-toggle').forEach((chk) => {
    chk.addEventListener('change', async () => {
      const ruleId = Number(chk.dataset.ruleId);
      const targetRule = loadedReminderRules.find((r) => r.id === ruleId);
      if (!targetRule) return;
      targetRule.is_enabled = chk.checked;
      const res = await window.electronAPI.saveReminderRule(targetRule);
      if (res && res.ok) {
        loadedReminderRules = res.rules;
        renderReminderRulesList(loadedReminderRules);
        window.QuoteCraftUtils.showToast(chk.checked ? `Enabled "${targetRule.name}"` : `Disabled "${targetRule.name}"`, 'info');
      }
    });
  });

  container.querySelectorAll('.btn-edit-rule').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ruleId = Number(btn.dataset.ruleId);
      const targetRule = loadedReminderRules.find((r) => r.id === ruleId);
      if (targetRule) openRuleModal(targetRule);
    });
  });

  container.querySelectorAll('.btn-delete-rule').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ruleId = Number(btn.dataset.ruleId);
      const targetRule = loadedReminderRules.find((r) => r.id === ruleId);
      if (!targetRule) return;
      const confirm = await window.QuoteCraftUtils.confirmAction({
        title: 'Delete Reminder Rule',
        message: `Are you sure you want to delete the rule "${targetRule.name}"?`,
        confirmText: 'Delete Rule',
        danger: true,
      });
      if (!confirm) return;

      const res = await window.electronAPI.deleteReminderRule(ruleId);
      if (res && res.ok) {
        loadedReminderRules = res.rules;
        renderReminderRulesList(loadedReminderRules);
        window.QuoteCraftUtils.showToast('Reminder rule deleted', 'success');
      }
    });
  });
}

function bindReminderEvents() {
  const autoToggle = document.getElementById('es-auto-send-toggle');
  if (autoToggle) {
    autoToggle.addEventListener('change', async () => {
      const isEnabled = autoToggle.checked;
      if (isEnabled) {
        const confirm = await window.QuoteCraftUtils.confirmAction({
          title: 'Enable Fully Automatic Sending?',
          message: 'When enabled, QuoteCraft will automatically send payment reminder emails in the background whenever due, using your configured email settings without asking for confirmation each time. Are you sure you want to enable this?',
          confirmText: 'Enable Automatic Sending',
        });
        if (!confirm) {
          autoToggle.checked = false;
          return;
        }
      }
      const res = await window.electronAPI.saveReminderSettings({ auto_send_reminders: isEnabled });
      if (res && res.ok) {
        window.QuoteCraftUtils.showToast(isEnabled ? 'Automatic reminder sending enabled' : 'Automatic reminder sending disabled', 'info');
      }
    });
  }

  const btnReset = document.getElementById('btnResetReminderRules');
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      const confirm = await window.QuoteCraftUtils.confirmAction({
        title: 'Reset Reminder Rules to Defaults',
        message: 'This will reset your reminder timing rules to the 3 standard defaults (3 days before, on due date, 7 days after). Any custom rules will be removed. Continue?',
        confirmText: 'Reset to Defaults',
      });
      if (!confirm) return;

      const res = await window.electronAPI.resetDefaultReminderRules();
      if (res && res.ok) {
        loadedReminderRules = res.rules;
        renderReminderRulesList(loadedReminderRules);
        window.QuoteCraftUtils.showToast('Reminder rules reset to defaults', 'success');
      }
    });
  }

  const btnAdd = document.getElementById('btnAddReminderRule');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      openRuleModal(null);
    });
  }

  const modalClose = document.getElementById('reminderRuleModalClose');
  const cancelBtn = document.getElementById('reminderRuleCancelBtn');
  const form = document.getElementById('reminderRuleForm');
  const timingSelect = document.getElementById('ruleTimingType');
  const daysField = document.getElementById('ruleDaysField');
  const daysInput = document.getElementById('ruleDays');
  const bodyTextarea = document.getElementById('ruleBody');

  if (modalClose) modalClose.addEventListener('click', closeRuleModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeRuleModal);

  if (timingSelect && daysField) {
    timingSelect.addEventListener('change', () => {
      if (timingSelect.value === 'on_due') {
        daysField.style.display = 'none';
        if (daysInput) daysInput.value = '0';
      } else {
        daysField.style.display = 'block';
        if (daysInput && Number(daysInput.value) === 0) {
          daysInput.value = timingSelect.value === 'before_due' ? '3' : '7';
        }
      }
    });
  }

  document.querySelectorAll('.template-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;
      if (!tag || !bodyTextarea) return;
      const start = bodyTextarea.selectionStart || bodyTextarea.value.length;
      const end = bodyTextarea.selectionEnd || bodyTextarea.value.length;
      const val = bodyTextarea.value;
      bodyTextarea.value = val.substring(0, start) + tag + val.substring(end);
      bodyTextarea.focus();
      bodyTextarea.selectionStart = bodyTextarea.selectionEnd = start + tag.length;
    });
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('ruleEditId').value;
      const name = document.getElementById('ruleName').value.trim();
      const timingType = document.getElementById('ruleTimingType').value;
      const days = timingType === 'on_due' ? 0 : parseInt(document.getElementById('ruleDays').value, 10) || 0;
      const subject = document.getElementById('ruleSubject').value.trim();
      const body = document.getElementById('ruleBody').value.trim();
      const isEnabled = document.getElementById('ruleEnabled').checked;

      if (!name) {
        showRuleModalError('Please enter a rule name.');
        return;
      }
      if (!subject) {
        showRuleModalError('Please enter an email subject template.');
        return;
      }
      if (!body) {
        showRuleModalError('Please enter a message body template.');
        return;
      }

      hideRuleModalError();
      const payload = {
        id: id ? Number(id) : null,
        name,
        timing_type: timingType,
        days,
        subject_template: subject,
        body_template: body,
        is_enabled: isEnabled,
      };

      const res = await window.electronAPI.saveReminderRule(payload);
      if (res && res.ok) {
        loadedReminderRules = res.rules;
        renderReminderRulesList(loadedReminderRules);
        closeRuleModal();
        window.QuoteCraftUtils.showToast(id ? 'Reminder rule updated' : 'New reminder rule created', 'success');
      } else {
        showRuleModalError(res?.error || 'Failed to save reminder rule.');
      }
    });
  }
}

function openRuleModal(rule) {
  const modal = document.getElementById('reminderRuleModal');
  const title = document.getElementById('reminderRuleModalTitle');
  const idInput = document.getElementById('ruleEditId');
  const nameInput = document.getElementById('ruleName');
  const timingSelect = document.getElementById('ruleTimingType');
  const daysField = document.getElementById('ruleDaysField');
  const daysInput = document.getElementById('ruleDays');
  const subjectInput = document.getElementById('ruleSubject');
  const bodyInput = document.getElementById('ruleBody');
  const enabledInput = document.getElementById('ruleEnabled');

  hideRuleModalError();

  if (rule) {
    if (title) title.textContent = `Edit Rule: ${rule.name}`;
    if (idInput) idInput.value = rule.id;
    if (nameInput) nameInput.value = rule.name;
    if (timingSelect) timingSelect.value = rule.timing_type;
    if (daysInput) daysInput.value = rule.days;
    if (subjectInput) subjectInput.value = rule.subject_template;
    if (bodyInput) bodyInput.value = rule.body_template;
    if (enabledInput) enabledInput.checked = Boolean(rule.is_enabled);
  } else {
    if (title) title.textContent = 'Add Reminder Rule';
    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (timingSelect) timingSelect.value = 'before_due';
    if (daysInput) daysInput.value = '3';
    if (subjectInput) subjectInput.value = 'Payment Reminder: Invoice {invoice_number}';
    if (bodyInput) {
      bodyInput.value = `Dear {client_name},\n\nThis is a friendly reminder that Invoice {invoice_number} for {amount_due} is due on {due_date}.\n\nPlease find attached a copy of the invoice for your records.\n\nBest regards,\n{sender_name}\n{company_name}`;
    }
    if (enabledInput) enabledInput.checked = true;
  }

  if (timingSelect && daysField) {
    daysField.style.display = timingSelect.value === 'on_due' ? 'none' : 'block';
  }

  if (modal) modal.classList.remove('hidden');
}

function closeRuleModal() {
  const modal = document.getElementById('reminderRuleModal');
  if (modal) modal.classList.add('hidden');
  hideRuleModalError();
}

function showRuleModalError(msg) {
  const el = document.getElementById('ruleErrorNotice');
  if (el) {
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.display = 'block';
  }
}

function hideRuleModalError() {
  const el = document.getElementById('ruleErrorNotice');
  if (el) {
    el.textContent = '';
    el.classList.add('hidden');
    el.style.display = 'none';
  }
}
