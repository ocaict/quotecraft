(function () {
  const modal = document.getElementById('whatsappModal');
  const modalTitle = document.getElementById('whatsappModalTitle');
  const modalClose = document.getElementById('whatsappModalClose');
  const cancelBtn = document.getElementById('whatsappCancelBtn');
  const form = document.getElementById('whatsappForm');
  const phoneInput = document.getElementById('whatsappPhoneInput');
  const normalizedSpan = document.getElementById('whatsappNormalizedPhone');
  const contactSelect = document.getElementById('whatsappContactSelect');
  const contactSelectField = document.getElementById('whatsappContactSelectField');
  const messageInput = document.getElementById('whatsappMessageText');
  const revealPdfBtn = document.getElementById('whatsappRevealPdfBtn');
  const copyBtn = document.getElementById('whatsappCopyBtn');
  const sendBtn = document.getElementById('whatsappSendBtn');

  let currentContext = null; // { documentType: 'invoice' | 'quote', doc, client, profile }

  function toast(msg, type) {
    if (window.QuoteCraftUtils && window.QuoteCraftUtils.showToast) {
      window.QuoteCraftUtils.showToast(msg, type);
    }
  }

  function updateNormalizedDisplay() {
    if (!phoneInput || !normalizedSpan) return;
    const raw = phoneInput.value || '';
    const digits = window.QuoteCraftUtils ? window.QuoteCraftUtils.formatWhatsAppPhone(raw) : raw.replace(/\D/g, '');
    if (digits) {
      normalizedSpan.textContent = digits;
      normalizedSpan.style.color = '#16a34a';
    } else {
      normalizedSpan.textContent = 'None';
      normalizedSpan.style.color = 'var(--text-muted, #64748b)';
    }
  }

  function closeModal() {
    if (modal) {
      modal.classList.add('hidden');
    }
    currentContext = null;
  }

  async function openShareModal({ documentType, doc, client, profile } = {}) {
    if (!doc) return;

    // Load client if not provided
    let fullClient = client;
    if (!fullClient && doc.client_id && window.electronAPI && window.electronAPI.getClient) {
      try {
        const res = await window.electronAPI.getClient(doc.client_id);
        if (res.ok) fullClient = res.client;
      } catch (e) {
        /* ignore */
      }
    }

    // Load company profile if not provided
    let fullProfile = profile;
    if (!fullProfile && window.electronAPI && window.electronAPI.getCompanyProfile) {
      try {
        const res = await window.electronAPI.getCompanyProfile();
        if (res.ok) fullProfile = res.profile;
      } catch (e) {
        /* ignore */
      }
    }

    currentContext = {
      documentType: documentType || 'invoice',
      doc,
      client: fullClient,
      profile: fullProfile,
    };

    // Set modal title
    const docNumber = (documentType === 'quote') ? (doc.quote_number || 'Quote') : (doc.invoice_number || 'Invoice');
    if (modalTitle) {
      modalTitle.textContent = `💬 Share ${documentType === 'quote' ? 'Quote' : 'Invoice'} ${docNumber} via WhatsApp`;
    }

    // Build contacts list
    if (contactSelect) {
      contactSelect.innerHTML = '';
      const options = [];

      // 1. Primary client phone
      if (fullClient && fullClient.phone && fullClient.phone.trim()) {
        options.push({
          label: `${fullClient.name || 'Client'} (Main: ${fullClient.phone})`,
          phone: fullClient.phone.trim(),
        });
      }

      // 2. Client contacts
      if (fullClient && Array.isArray(fullClient.contacts)) {
        fullClient.contacts.forEach((ct) => {
          if (ct.phone && ct.phone.trim()) {
            options.push({
              label: `${ct.name || 'Contact'}${ct.role ? ` (${ct.role})` : ''}: ${ct.phone}`,
              phone: ct.phone.trim(),
            });
          }
        });
      }

      // Add custom option
      const customOpt = document.createElement('option');
      customOpt.value = '';
      customOpt.textContent = options.length > 0 ? 'Custom number…' : 'Enter number manually…';

      options.forEach((opt, idx) => {
        const el = document.createElement('option');
        el.value = opt.phone;
        el.textContent = opt.label;
        if (idx === 0) el.selected = true;
        contactSelect.appendChild(el);
      });
      contactSelect.appendChild(customOpt);

      if (options.length === 0 && contactSelectField) {
        contactSelectField.style.display = 'none';
      } else if (contactSelectField) {
        contactSelectField.style.display = 'block';
      }
    }

    // Pre-fill phone number
    let initialPhone = '';
    if (fullClient && fullClient.phone && fullClient.phone.trim()) {
      initialPhone = fullClient.phone.trim();
    } else if (fullClient && Array.isArray(fullClient.contacts)) {
      const primary = fullClient.contacts.find((c) => c.is_primary && c.phone && c.phone.trim());
      if (primary) initialPhone = primary.phone.trim();
      else {
        const anyPhone = fullClient.contacts.find((c) => c.phone && c.phone.trim());
        if (anyPhone) initialPhone = anyPhone.phone.trim();
      }
    }

    if (phoneInput) {
      phoneInput.value = initialPhone ? (window.QuoteCraftUtils ? window.QuoteCraftUtils.normalizeNigerianPhone(initialPhone) : initialPhone) : '';
    }
    updateNormalizedDisplay();

    // Pre-fill message template
    if (messageInput) {
      let msg = '';
      if (documentType === 'quote') {
        msg = window.QuoteCraftUtils ? window.QuoteCraftUtils.buildWhatsAppQuoteMessage({
          quote: doc,
          client: fullClient,
          profile: fullProfile,
        }) : '';
      } else {
        msg = window.QuoteCraftUtils ? window.QuoteCraftUtils.buildWhatsAppInvoiceMessage({
          invoice: doc,
          client: fullClient,
          profile: fullProfile,
        }) : '';
      }
      messageInput.value = msg;
    }

    if (modal) {
      modal.classList.remove('hidden');
    }
    if (phoneInput && !phoneInput.value) {
      phoneInput.focus();
    }
  }

  // Event Listeners
  if (phoneInput) {
    phoneInput.addEventListener('input', updateNormalizedDisplay);
    phoneInput.addEventListener('blur', () => {
      if (phoneInput.value && window.QuoteCraftUtils) {
        phoneInput.value = window.QuoteCraftUtils.normalizeNigerianPhone(phoneInput.value);
        updateNormalizedDisplay();
      }
    });
  }

  if (contactSelect) {
    contactSelect.addEventListener('change', () => {
      if (contactSelect.value) {
        phoneInput.value = window.QuoteCraftUtils ? window.QuoteCraftUtils.normalizeNigerianPhone(contactSelect.value) : contactSelect.value;
      }
      updateNormalizedDisplay();
    });
  }

  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const text = messageInput ? messageInput.value : '';
      if (!text) {
        toast('Message is empty.', 'error');
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        toast('WhatsApp message copied to clipboard!', 'success');
      } catch (err) {
        toast('Could not copy to clipboard: ' + err.message, 'error');
      }
    });
  }

  if (revealPdfBtn) {
    revealPdfBtn.addEventListener('click', async () => {
      if (!currentContext || !currentContext.doc) return;
      try {
        if (window.QuoteCraftUtils && window.QuoteCraftUtils.showBusy) {
          window.QuoteCraftUtils.showBusy('Preparing PDF for WhatsApp…');
        }
        const isQuote = currentContext.documentType === 'quote';
        const res = isQuote
          ? await window.electronAPI.revealQuotePdf(currentContext.doc.id)
          : await window.electronAPI.revealInvoicePdf(currentContext.doc.id);
        if (res.ok) {
          toast('PDF generated and revealed in File Explorer!', 'success');
        } else {
          toast(res.errors && res.errors.general ? res.errors.general : 'Could not reveal PDF.', 'error');
        }
      } catch (err) {
        toast('Could not reveal PDF: ' + err.message, 'error');
      } finally {
        if (window.QuoteCraftUtils && window.QuoteCraftUtils.hideBusy) {
          window.QuoteCraftUtils.hideBusy();
        }
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawPhone = phoneInput ? phoneInput.value : '';
      const digits = window.QuoteCraftUtils ? window.QuoteCraftUtils.formatWhatsAppPhone(rawPhone) : rawPhone.replace(/\D/g, '');
      if (!digits) {
        toast('Please enter a valid recipient phone number.', 'error');
        if (phoneInput) phoneInput.focus();
        return;
      }

      const text = messageInput ? messageInput.value : '';
      const encoded = encodeURIComponent(text);
      const waUrl = `https://wa.me/${digits}?text=${encoded}`;

      try {
        // Also reveal the PDF so user has it immediately ready in Explorer
        if (currentContext && currentContext.doc) {
          const isQuote = currentContext.documentType === 'quote';
          if (isQuote && window.electronAPI && window.electronAPI.revealQuotePdf) {
            window.electronAPI.revealQuotePdf(currentContext.doc.id).catch(() => {});
          } else if (window.electronAPI && window.electronAPI.revealInvoicePdf) {
            window.electronAPI.revealInvoicePdf(currentContext.doc.id).catch(() => {});
          }
        }

        await window.electronAPI.openExternal(waUrl);
        toast('Opening WhatsApp with pre-filled message & PDF revealed!', 'success');
        closeModal();
      } catch (err) {
        toast('Could not open WhatsApp: ' + err.message, 'error');
      }
    });
  }

  window.QuoteCraftWhatsApp = {
    openShareModal,
    closeModal,
  };
})();
