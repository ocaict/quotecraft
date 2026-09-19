// Global keyboard shortcuts controller.
// Loaded after utils.js; registers one keydown listener for the whole app.
//  Ctrl/Cmd+K — Open Command Palette
//  N          — New quote
//  I          — New invoice
//  C          — New client
//  Ctrl/Cmd+S — Save the current form/dialog
//  /          — Focus the current screen's search box
//  ?          — Open the Keyboard Shortcuts reference (Settings)
(function () {
  'use strict';

  // [modalId, saveButtonId] — save target for each dialog.
  // Destructive/confirmation dialogs are intentionally excluded.
  const SAVE_TARGETS = [
    ['clientModal', 'clientSubmitBtn'],
    ['projectModal', 'projectSubmitBtn'],
    ['itemModal', 'itemSubmitBtn'],
    ['expenseModal', 'expenseSubmitBtn'],
    ['paymentModal', 'paymentSubmitBtn'],
    ['creditNoteModal', 'creditNoteSubmitBtn'],
    ['recurringModal', 'recurringSubmitBtn'],
    ['convertQuoteModal', 'convertQuoteSubmitBtn'],
    ['quoteAcceptModal', 'quoteAcceptSubmitBtn'],
    ['sendEmailModal', 'sendEmailSubmitBtn'],
    ['reminderRuleModal', 'reminderRuleSubmitBtn'],
  ];

  // page → search input id for the "/" shortcut.
  const SEARCH_INPUTS = {
    clients: 'clientSearch',
    projects: 'projectSearch',
    items: 'itemSearch',
    quotes: 'quoteSearch',
    invoices: 'invoiceSearch',
    payments: 'paymentsSearch',
    expenses: 'expensesSearch',
    'client-profitability': 'cpSearchInput',
  };

  function isLocked() {
    const overlay = document.getElementById('appLockOverlay');
    return overlay && overlay.getAttribute('aria-hidden') === 'false';
  }

  function isEditable(target) {
    const el = target && target.nodeType === 1 ? target : null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
  }

  function anyModalOpen() {
    return document.querySelector('.modal-overlay:not(.hidden)') !== null;
  }

  function currentPage() {
    const active = document.querySelector('.page.active');
    return active ? active.id.replace('page-', '') : '';
  }

  // ---------- Actions ----------

  function newQuote() {
    const btn = document.getElementById('dashNewQuoteBtn');
    if (btn) btn.click();
  }

  function newInvoice() {
    const btn = document.getElementById('dashNewInvoiceBtn');
    if (btn) btn.click();
  }

  function newClient() {
    const btn = document.getElementById('addClientBtn');
    if (btn) btn.click();
  }

  function focusSearch() {
    const page = currentPage();
    const inputId = SEARCH_INPUTS[page];
    if (inputId) {
      const input = document.getElementById(inputId);
      if (input) {
        input.focus();
        input.select();
        return;
      }
    }
    // No search box on this screen → go to Clients and focus there.
    window.QuoteCraftUtils.goToPage('clients');
    const input = document.getElementById('clientSearch');
    if (input) input.focus();
  }

  function openShortcutsReference() {
    window.QuoteCraftUtils.goToPage('settings');
    const card = document.getElementById('shortcutsCard');
    if (card) {
      card.classList.add('shortcuts-highlight');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => card.classList.remove('shortcuts-highlight'), 2600);
    }
  }

  function saveCurrent() {
    // 1. Open dialog → its primary save button.
    for (const [modalId, btnId] of SAVE_TARGETS) {
      const modal = document.getElementById(modalId);
      if (modal && !modal.classList.contains('hidden')) {
        const btn = document.getElementById(btnId);
        if (btn) {
          btn.click();
          return;
        }
      }
    }

    // 2. Quote editor open → Save quote.
    const formView = document.getElementById('quoteFormView');
    if (formView && formView.classList.contains('active')) {
      const btn = document.getElementById('saveQuoteBtn');
      if (btn) {
        btn.click();
        return;
      }
    }

    // 3. Settings page → main Save settings submit button.
    if (currentPage() === 'settings') {
      const submit = document.querySelector('#page-settings .settings-form button[type="submit"]');
      if (submit) {
        submit.click();
        return;
      }
    }

    // 4. Email Settings page → its save button.
    if (currentPage() === 'email-settings') {
      const btn = document.getElementById('es-save-btn');
      if (btn) {
        btn.click();
        return;
      }
    }

    window.QuoteCraftUtils.showToast('Nothing to save on this screen.', '');
  }

  // ---------- Handler ----------

  document.addEventListener('keydown', (e) => {
    if (isLocked()) return;

    const withModifier = e.ctrlKey || e.metaKey;

    // Ctrl/Cmd+S — Save (allow while typing; that's the point).
    if (withModifier && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveCurrent();
      return;
    }

    // Ctrl/Cmd+K — Command Palette
    if (withModifier && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('qc-open-command-palette'));
      return;
    }

    // Single-character shortcuts require no modifiers and must not fire while
    // the user is typing in a field or interacting with a dialog.
    if (withModifier || e.altKey) return;
    if (isEditable(e.target)) return;
    if (anyModalOpen()) return;
    if (e.repeat) return;

    const key = e.key;

    if (key === '?') {
      e.preventDefault();
      openShortcutsReference();
      return;
    }

    const lower = key.toLowerCase();
    if (lower === 'n') {
      e.preventDefault();
      newQuote();
    } else if (lower === 'i') {
      e.preventDefault();
      newInvoice();
    } else if (lower === 'c') {
      e.preventDefault();
      newClient();
    } else if (key === '/') {
      e.preventDefault();
      focusSearch();
    }
  });
})();