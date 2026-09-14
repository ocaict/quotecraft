(function () {
  const modal = document.getElementById('sendEmailModal');
  const modalTitle = document.getElementById('sendEmailModalTitle');
  const modalClose = document.getElementById('sendEmailModalClose');
  const cancelBtn = document.getElementById('sendEmailCancelBtn');
  const form = document.getElementById('sendEmailForm');
  const toInput = document.getElementById('sendEmailTo');
  const ccInput = document.getElementById('sendEmailCc');
  const subjectInput = document.getElementById('sendEmailSubject');
  const messageInput = document.getElementById('sendEmailMessage');
  const attachmentBadgeName = document.getElementById('sendEmailAttachmentName');
  const errorNotice = document.getElementById('sendEmailErrorNotice');
  const submitBtn = document.getElementById('sendEmailSubmitBtn');

  let currentContext = null; // { documentType, documentId, doc, onSuccess }

  function resolvePrimaryContactEmail(doc) {
    if (!doc) return '';
    if (doc.contact && doc.contact.email && doc.contact.email.trim()) {
      return doc.contact.email.trim();
    }
    if (doc.client && Array.isArray(doc.client.contacts)) {
      const primary = doc.client.contacts.find((c) => c.is_primary && c.email && c.email.trim());
      if (primary) return primary.email.trim();
      const anyWithEmail = doc.client.contacts.find((c) => c.email && c.email.trim());
      if (anyWithEmail) return anyWithEmail.email.trim();
    }
    if (doc.client && doc.client.email && doc.client.email.trim()) {
      return doc.client.email.trim();
    }
    return '';
  }

  function closeModal() {
    if (modal) {
      modal.classList.add('hidden');
    }
    currentContext = null;
    hideError();
  }

  function showError(msg) {
    if (errorNotice) {
      errorNotice.textContent = msg;
      errorNotice.classList.remove('hidden');
      errorNotice.style.display = 'block';
    }
  }

  function hideError() {
    if (errorNotice) {
      errorNotice.textContent = '';
      errorNotice.classList.add('hidden');
      errorNotice.style.display = 'none';
    }
  }

  async function openSendModal(context) {
    currentContext = context;
    const { documentType, doc } = context;

    // Check if user has email settings configured
    try {
      const settingsRes = await window.electronAPI.getEmailSettings();
      const s = settingsRes?.settings;
      const isConfigured = settingsRes?.ok && s && s.smtp_host && s.smtp_username && (s.has_password || s.password_saved);

      if (!isConfigured) {
        const confirm = await window.QuoteCraftUtils.confirmAction({
          title: 'Email Configuration Required',
          message: 'You have not configured your outgoing email settings yet. Please configure your SMTP credentials before sending documents.',
          confirmText: 'Configure Email Settings',
          cancelText: 'Cancel',
        });
        if (confirm) {
          window.QuoteCraftUtils.goToPage('email-settings');
        }
        return;
      }

      const emailSettings = settingsRes.settings || {};
      let companyProfile = {};
      try {
        const profRes = await window.electronAPI.getCompanyProfile();
        if (profRes && profRes.ok && profRes.profile) {
          companyProfile = profRes.profile;
        }
      } catch (e) {
        // ignore profile fetch failure fallback
      }

      const companyName = companyProfile.company_name || 'QuoteCraft';
      const senderName = emailSettings.sender_name || companyProfile.company_name || 'Accounts';
      const recipientName = doc.contact?.name || doc.client?.name || 'Valued Client';
      const prefilledEmail = resolvePrimaryContactEmail(doc);

      toInput.value = prefilledEmail;
      ccInput.value = '';
      hideError();

      const docCurrency = doc.currency || 'USD';

      if (documentType === 'quote') {
        modalTitle.textContent = `Send Quote ${doc.quote_number} by Email`;
        subjectInput.value = `Quote ${doc.quote_number} from ${companyName}`;
        const formattedTotal = window.QuoteCraftUtils.formatCurrency(doc.total, docCurrency);
        const formattedExpiry = doc.valid_until ? window.QuoteCraftUtils.formatDate(doc.valid_until) : '30 days from date of issue';

        messageInput.value =
`Dear ${recipientName},

Please find attached Quote ${doc.quote_number} for your review.

Quote Total: ${formattedTotal}
Valid Until: ${formattedExpiry}

If you have any questions or would like to proceed with this quote, please reply to this email.

Best regards,
${senderName}
${companyName}`;

        const safeNum = String(doc.quote_number || 'quote').replace(/[^\w-]+/g, '_');
        if (attachmentBadgeName) {
          attachmentBadgeName.textContent = `Quote_${safeNum}.pdf`;
        }
      } else {
        modalTitle.textContent = `Send Invoice ${doc.invoice_number} by Email`;
        subjectInput.value = `Invoice ${doc.invoice_number} from ${companyName}`;
        const balance = doc.balance_due !== undefined ? doc.balance_due : doc.total;
        const formattedBalance = window.QuoteCraftUtils.formatCurrency(balance, docCurrency);
        const formattedDue = doc.date_due ? window.QuoteCraftUtils.formatDate(doc.date_due) : 'Upon receipt';

        messageInput.value =
`Dear ${recipientName},

Please find attached Invoice ${doc.invoice_number} for your records.

Amount Due: ${formattedBalance}
Due Date: ${formattedDue}

Thank you for your business!

Best regards,
${senderName}
${companyName}`;

        const safeNum = String(doc.invoice_number || 'invoice').replace(/[^\w-]+/g, '_');
        if (attachmentBadgeName) {
          attachmentBadgeName.textContent = `Invoice_${safeNum}.pdf`;
        }
      }

      modal.classList.remove('hidden');
      if (!toInput.value) {
        toInput.focus();
      } else {
        subjectInput.focus();
      }
    } catch (err) {
      window.QuoteCraftUtils.showToast('Could not open email dialog: ' + err.message, 'error');
    }
  }

  async function handleSendEmail(e) {
    e.preventDefault();
    if (!currentContext) return;

    const to = toInput.value.trim();
    const cc = ccInput.value.trim();
    const subject = subjectInput.value.trim();
    const message = messageInput.value.trim();

    if (!to) {
      showError('Please enter a recipient email address.');
      toInput.focus();
      return;
    }

    if (!subject) {
      showError('Please enter an email subject.');
      subjectInput.focus();
      return;
    }

    submitBtn.disabled = true;
    const origText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="btn-spinner"></span> Sending...';
    hideError();

    try {
      const payload = {
        documentType: currentContext.documentType,
        documentId: currentContext.documentId,
        to,
        cc,
        subject,
        message,
      };

      const res = await window.electronAPI.sendDocumentEmail(payload);

      if (!res.ok) {
        showError(res.error || 'Failed to send email. Please check your SMTP settings.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = origText;
        return;
      }

      window.QuoteCraftUtils.showToast(`Email sent successfully to ${to}`, 'success');
      const cb = currentContext.onSuccess;
      closeModal();
      if (typeof cb === 'function') {
        cb(res);
      }
    } catch (err) {
      showError(`Error sending email: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origText;
    }
  }

  function renderEmailActivityList(containerEl, logs) {
    if (!containerEl) return;
    if (!logs || logs.length === 0) {
      containerEl.innerHTML = '<p class="empty">No emails sent yet for this document.</p>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'email-activity-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width: 160px;">Sent At</th>
          <th>Recipient</th>
          <th>Subject</th>
          <th style="width: 90px;">Status</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');
    logs.forEach((log) => {
      const tr = document.createElement('tr');

      const dateTd = document.createElement('td');
      dateTd.className = 'cell-date';
      const d = new Date(log.sent_at);
      dateTd.textContent = isNaN(d.getTime()) ? log.sent_at : d.toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const recipientTd = document.createElement('td');
      recipientTd.className = 'email-recipient-cell';
      const toDiv = document.createElement('div');
      toDiv.className = 'email-recipient-to';
      toDiv.textContent = log.recipient_to;
      recipientTd.appendChild(toDiv);

      if (log.recipient_cc) {
        const ccDiv = document.createElement('div');
        ccDiv.className = 'email-recipient-cc';
        ccDiv.textContent = `CC: ${log.recipient_cc}`;
        recipientTd.appendChild(ccDiv);
      }

      const subjectTd = document.createElement('td');
      subjectTd.textContent = log.subject || '—';

      const statusTd = document.createElement('td');
      statusTd.innerHTML = '<span class="email-badge-sent">✓ Sent</span>';

      tr.appendChild(dateTd);
      tr.appendChild(recipientTd);
      tr.appendChild(subjectTd);
      tr.appendChild(statusTd);
      tbody.appendChild(tr);
    });

    containerEl.innerHTML = '';
    containerEl.appendChild(table);
  }

  // Setup DOM event listeners
  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
  if (form) {
    form.addEventListener('submit', handleSendEmail);
  }

  window.QuoteCraftDocumentEmail = {
    openSendModal,
    renderEmailActivityList,
    resolvePrimaryContactEmail,
  };
})();
