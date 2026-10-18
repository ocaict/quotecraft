/**
 * QuoteCraft Document Quick Look Preview & Standalone Receipt Hub
 * 
 * Provides an instant in-app modal preview of quotes, invoices, and receipts
 * with direct actions: Print, Download PDF, Export HTML, Send Email, and Share WhatsApp.
 */

(function () {
  const modal = document.getElementById('docPreviewModal');
  const badgeEl = document.getElementById('docPreviewBadge');
  const titleEl = document.getElementById('docPreviewTitle');
  const subtitleEl = document.getElementById('docPreviewSubtitle');
  const iframeEl = document.getElementById('docPreviewIframe');
  const frameWrapEl = document.getElementById('docPreviewFrameWrap');
  const loadingEl = document.getElementById('docPreviewLoading');

  const closeBtn = document.getElementById('docPreviewCloseBtn');
  const printBtn = document.getElementById('docPreviewPrintBtn');
  const pdfBtn = document.getElementById('docPreviewPdfBtn');
  const htmlBtn = document.getElementById('docPreviewHtmlBtn');
  const emailBtn = document.getElementById('docPreviewEmailBtn');
  const whatsappBtn = document.getElementById('docPreviewWhatsAppBtn');

  const zoomOutBtn = document.getElementById('docPreviewZoomOutBtn');
  const zoomInBtn = document.getElementById('docPreviewZoomInBtn');
  const zoomResetBtn = document.getElementById('docPreviewZoomResetBtn');

  let currentContext = null; // { type: 'quote' | 'invoice', id, doc, client, profile, paymentId }
  let currentZoom = 1.0;

  function toast(msg, type) {
    if (window.QuoteCraftUtils && window.QuoteCraftUtils.showToast) {
      window.QuoteCraftUtils.showToast(msg, type);
    }
  }

  function setZoom(val) {
    currentZoom = Math.max(0.6, Math.min(1.8, Math.round(val * 10) / 10));
    if (frameWrapEl) {
      frameWrapEl.style.transform = `scale(${currentZoom})`;
    }
    if (zoomResetBtn) {
      zoomResetBtn.textContent = `${Math.round(currentZoom * 100)}%`;
    }
  }

  function closeModal() {
    if (modal) {
      modal.classList.add('hidden');
    }
    if (iframeEl) {
      iframeEl.srcdoc = '';
    }
    currentContext = null;
    setZoom(1.0);
  }

  async function openPreview(options = {}) {
    if (!modal) return;
    const { type, id, paymentId } = options;
    if (!type || !id) return;

    currentContext = { type, id, paymentId, doc: null, client: null, profile: null };
    modal.classList.remove('hidden');
    if (loadingEl) loadingEl.style.display = 'flex';
    setZoom(1.0);

    try {
      let res;
      if (type === 'quote') {
        res = await window.electronAPI.getQuotePreviewData(id);
      } else if (type === 'invoice' && paymentId) {
        res = await window.electronAPI.getPaymentReceiptData(id, paymentId);
      } else {
        res = await window.electronAPI.getInvoicePreviewData(id);
      }

      if (!res || !res.ok) {
        toast((res && res.errors && res.errors.general) || 'Could not load preview', 'error');
        closeModal();
        return;
      }

      currentContext.doc = res.doc;
      currentContext.client = res.client;
      currentContext.profile = res.profile;

      // Update header details
      const doc = res.doc;
      const client = res.client;
      let badgeText = type.toUpperCase();
      let docNumber = '';

      if (type === 'quote') {
        badgeText = 'Quotation';
        docNumber = doc.quote_number || `Quote #${id}`;
      } else if (paymentId) {
        badgeText = 'Payment Receipt';
        docNumber = `Receipt for ${doc.invoice_number || 'Invoice'}`;
      } else {
        if (doc.invoice_type === 'deposit') badgeText = 'Deposit Invoice';
        else if (doc.invoice_type === 'final') badgeText = 'Final Invoice';
        else if (doc.status === 'paid') badgeText = 'Paid Receipt';
        else badgeText = 'Invoice';
        docNumber = doc.invoice_number || `Invoice #${id}`;
      }

      if (badgeEl) badgeEl.textContent = badgeText;
      if (titleEl) titleEl.textContent = docNumber;
      if (subtitleEl) {
        const clientName = client ? client.name : 'Valued Client';
        const dateStr = doc.date_created || doc.created_at || '';
        subtitleEl.textContent = `${clientName} • ${dateStr ? dateStr.split('T')[0] : ''}`;
      }

      // Render document inside iframe
      if (iframeEl) {
        iframeEl.srcdoc = res.html;
      }
    } catch (err) {
      toast('Failed to generate preview: ' + err.message, 'error');
      closeModal();
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  // Action handlers
  async function handlePrint() {
    if (!currentContext) return;
    try {
      if (iframeEl && iframeEl.contentWindow) {
        iframeEl.contentWindow.focus();
        iframeEl.contentWindow.print();
        return;
      }
    } catch (_) {}

    // Fallback to electronAPI print
    if (currentContext.type === 'quote') {
      await window.electronAPI.printQuote(currentContext.id);
    } else {
      await window.electronAPI.printInvoice(currentContext.id);
    }
  }

  async function handleDownloadPdf() {
    if (!currentContext) return;
    try {
      window.QuoteCraftUtils.showBusy('Exporting PDF…');
      let res;
      if (currentContext.type === 'quote') {
        res = await window.electronAPI.exportQuotePdf(currentContext.id);
      } else {
        res = await window.electronAPI.exportInvoicePdf(currentContext.id);
      }
      if (res && res.ok && !res.cancelled && res.savedPath) {
        toast('PDF saved to ' + res.savedPath, 'success');
      }
    } catch (err) {
      toast('PDF export failed: ' + err.message, 'error');
    } finally {
      window.QuoteCraftUtils.hideBusy();
    }
  }

  async function handleExportHtml() {
    if (!currentContext) return;
    try {
      window.QuoteCraftUtils.showBusy('Exporting Standalone HTML Receipt…');
      let res;
      if (currentContext.type === 'quote') {
        res = await window.electronAPI.exportShareableQuoteHtml(currentContext.id);
      } else {
        res = await window.electronAPI.exportShareableInvoiceHtml(currentContext.id);
      }
      if (res && res.ok && !res.cancelled && res.savedPath) {
        toast('HTML Receipt saved to ' + res.savedPath, 'success');
      }
    } catch (err) {
      toast('HTML export failed: ' + err.message, 'error');
    } finally {
      window.QuoteCraftUtils.hideBusy();
    }
  }

  function handleSendEmail() {
    if (!currentContext || !window.QuoteCraftDocumentEmail) return;
    const { type, id, doc } = currentContext;
    closeModal();
    window.QuoteCraftDocumentEmail.openSendModal({
      documentType: type,
      documentId: id,
      doc: doc,
      onSuccess: () => {
        toast('Email sent successfully!', 'success');
      }
    });
  }

  function handleShareWhatsApp() {
    if (!currentContext || !window.QuoteCraftWhatsApp) return;
    const { type, doc, client, profile } = currentContext;
    closeModal();
    window.QuoteCraftWhatsApp.openShareModal({
      documentType: type,
      doc: doc,
      client: client,
      profile: profile
    });
  }

  // Wire event listeners
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  if (printBtn) printBtn.addEventListener('click', handlePrint);
  if (pdfBtn) pdfBtn.addEventListener('click', handleDownloadPdf);
  if (htmlBtn) htmlBtn.addEventListener('click', handleExportHtml);
  if (emailBtn) emailBtn.addEventListener('click', handleSendEmail);
  if (whatsappBtn) whatsappBtn.addEventListener('click', handleShareWhatsApp);

  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => setZoom(currentZoom - 0.15));
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => setZoom(currentZoom + 0.15));
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => setZoom(1.0));

  document.addEventListener('keydown', (e) => {
    if (modal && !modal.classList.contains('hidden') && e.key === 'Escape') {
      closeModal();
    }
  });

  // Global API export
  window.QuoteCraftDocPreview = {
    open: openPreview,
    close: closeModal,
    setZoom: setZoom,
  };
})();
