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
