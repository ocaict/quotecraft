const { ipcMain, dialog, app, shell, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const {
  renderQuotePdf,
  renderInvoicePdf,
  renderCreditNotePdf,
  renderQuoteHtml,
  renderQuotePrintHtml,
  renderInvoicePrintHtml,
} = require('./pdf-export');
const {
  getCompanyProfile,
  saveCompanyProfile,
  getDashboardStats,
  getClients,
  getClient,
  addClient,
  updateClient,
  countClientHistory,
  archiveClient,
  deleteClient,
  createQuote,
  duplicateQuote,
  updateQuote,
  getQuote,
  getQuoteVersionHistory,
  listQuotes,
  setQuoteStatus,
  markQuoteAccepted,
  markQuoteDeclined,
  convertQuoteToInvoice,
  createFinalInvoiceFromDeposit,
  duplicateInvoice,
  getInvoice,
  getInvoiceByQuote,
  listInvoices,
  setInvoiceStatus,
  markInvoicesSent,
  addPayment,
  getPaymentHistory,
  getPaymentsReport,
  getProfitLossReport,
  issueCreditNote,
  getCreditNotesForInvoice,
  getCreditNotesForClient,
  getCreditNote,
  getRecurringProfile,
  getRecurringProfileByInvoice,
  setRecurringProfile,
  pauseRecurringProfile,
  resumeRecurringProfile,
  cancelRecurringProfile,
  triggerRecurringOccurrence,
  processDueRecurringInvoices,
  getLineItemTemplates,
  getLineItemTemplate,
  addLineItemTemplate,
  updateLineItemTemplate,
  deleteLineItemTemplate,
  getClientContacts,
  getContactById,
  saveClientContacts,
  getClientNotes,
  getClientNote,
  addClientNote,
  updateClientNote,
  deleteClientNote,
  getClientOverview,
  PROJECT_STATUSES,
  listProjects,
  getProject,
  addProject,
  updateProject,
  archiveProject,
  deleteProject,
  countProjectHistory,
  validateBackupBuffer,
  restoreDatabaseFromBuffer,
  PAYMENT_METHODS,
  EXPENSE_CATEGORIES,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  getExpensesSummary,
  getEmailSettings,
  getEmailSettingsInternal,
  saveEmailSettings,
  logDocumentEmail,
  getDocumentEmailLogs,
  getReminderSettings,
  saveReminderSettings,
  getReminderRules,
  saveReminderRule,
  deleteReminderRule,
  resetDefaultReminderRules,
  getDueReminders,
  logReminderSent,
  getRevenueReport,
  getClientProfitabilityReport,
  getAppLockSettings,
  setAppLockPin,
  verifyAppLockPin,
  disableAppLock,
  getAutoBackupSettings,
  saveAutoBackupSettings,
  addAuditEntry,
  getAuditLogEntries,
} = require('./database');
const { sendTestEmail, sendDocumentEmail } = require('./email-service');
const {
  createBackupPayload,
  runNow: runAutoBackupNow,
  listAutoBackups,
} = require('./auto-backup');

const LOGO_DIR = () => path.join(app.getPath('userData'), 'logo');
const BACKUPS_DIR = () => path.join(app.getPath('userData'), 'backups');

// Adds an on-screen toolbar to a print-ready HTML document so the OS print
// dialog can always be re-opened from the preview (window.print()), even when
// the auto-triggered dialog fails to come to the foreground on Windows.
const PRINT_TOOLBAR_SNIPPET = `
<style>
  .qc-print-toolbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 999999;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 48px;
    padding: 0 16px;
    background: #0F172A;
    color: #FFFFFF;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .qc-print-toolbar .qc-print-title {
    font-size: 14px;
    font-weight: 600;
    margin-right: auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .qc-print-toolbar button {
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    border: none;
    border-radius: 6px;
    padding: 7px 16px;
    cursor: pointer;
  }
  .qc-print-toolbar .qc-print-btn { background: #22C55E; color: #FFFFFF; }
  .qc-print-toolbar .qc-print-btn:hover { background: #16A34A; }
  .qc-print-toolbar .qc-close-btn { background: #EF4444; color: #FFFFFF; }
  .qc-print-toolbar .qc-close-btn:hover { background: #DC2626; }
  body { padding-top: 88px !important; }
  @media print {
    .qc-print-toolbar { display: none !important; }
  }
</style>
<div class="qc-print-toolbar">
  <span class="qc-print-title">Print preview</span>
  <button type="button" class="qc-print-btn">Print</button>
  <button type="button" class="qc-close-btn">Close</button>
</div>
<script>
(function () {
  var printBtn = document.querySelector('.qc-print-btn');
  var closeBtn = document.querySelector('.qc-close-btn');
  var doPrint = function () {
    try { window.print(); } catch (err) { /* ignore */ }
  };
  if (printBtn) printBtn.addEventListener('click', doPrint);
  if (closeBtn) closeBtn.addEventListener('click', function () { window.close(); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      doPrint();
    }
  });
})();
</script>
`;

function withPrintToolbar(html) {
  if (html.includes('.qc-print-toolbar')) return html;
  const bodyEnd = html.lastIndexOf('</body>');
  if (bodyEnd === -1) return html + PRINT_TOOLBAR_SNIPPET;
  return html.slice(0, bodyEnd) + PRINT_TOOLBAR_SNIPPET + html.slice(bodyEnd);
}

// Opens the OS print dialog for an HTML document loaded in a temporary window.
// The document reuses the PDF-export layout so the printed output matches it.
function printHtmlWindow(html, title) {
  return new Promise((resolve, reject) => {
    let win;
    try {
      win = new BrowserWindow({
        show: false,
        width: 820,
        height: 1100,
        title: title || 'Print',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
    } catch (err) {
      reject(err);
      return;
    }

    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      try {
        if (!win.isDestroyed()) win.destroy();
      } catch (err) {
        /* ignore */
      }
      if (error) reject(error);
      else resolve(result || { ok: true });
    };

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      finish(new Error(`Could not load the document for printing: ${errorDescription}`));
    });

    win.on('closed', () => {
      if (!settled) finish(null, { ok: true, cancelled: true });
    });

    win.webContents.on('did-finish-load', () => {
      // Show the preview so the on-screen Print toolbar is always available,
      // then give the window focus so Windows attaches the system dialog to it.
      win.once('show', () => {
        setTimeout(() => {
          win.focus();
          win.webContents.focus();
          win.webContents.print({ silent: false, printBackground: true }, (success) => {
            if (success) {
              finish(null, { ok: true });
            }
            // Otherwise (cancelled or the dialog could not open) keep the
            // preview open so the user can print via the toolbar or Ctrl+P.
          });
        }, 250);
      });
      win.show();
      win.focus();
    });

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(withPrintToolbar(html))).catch((err) => finish(err));
  });
}

function validateProfile(profile) {
  const errors = {};

  if (!profile.business_name || !String(profile.business_name).trim()) {
    errors.business_name = 'Business name is required.';
  }

  if (!profile.default_currency || !String(profile.default_currency).trim()) {
    errors.default_currency = 'Default currency is required.';
  }

  if (profile.reporting_currency && !String(profile.reporting_currency).trim()) {
    errors.reporting_currency = 'Reporting currency must be a valid currency code.';
  }

  if (profile.website && !isValidWebsite(profile.website)) {
    errors.website = 'Website must start with http:// or https://';
  }

  if (profile.email && !isValidEmail(profile.email)) {
    errors.email = 'Email address is not valid.';
  }

  const taxRate = Number(profile.default_tax_rate);
  if (profile.default_tax_rate === '' || profile.default_tax_rate === null || profile.default_tax_rate === undefined || isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
    errors.default_tax_rate = 'Tax rate must be a number between 0 and 100.';
  }

  const invStart = Number(profile.invoice_start_number);
  if (profile.invoice_start_number === '' || profile.invoice_start_number === null || profile.invoice_start_number === undefined || !Number.isInteger(invStart) || invStart < 1) {
    errors.invoice_start_number = 'Invoice start number must be a whole number of 1 or more.';
  }

  const quoteStart = Number(profile.quote_start_number);
  if (profile.quote_start_number === '' || profile.quote_start_number === null || profile.quote_start_number === undefined || !Number.isInteger(quoteStart) || quoteStart < 1) {
    errors.quote_start_number = 'Quote start number must be a whole number of 1 or more.';
  }

  const creditNoteStart = Number(profile.credit_note_start_number);
  if (profile.credit_note_start_number !== undefined && (profile.credit_note_start_number === '' || profile.credit_note_start_number === null || !Number.isInteger(creditNoteStart) || creditNoteStart < 1)) {
    errors.credit_note_start_number = 'Credit note start number must be a whole number of 1 or more.';
  }

  if (profile.credit_note_prefix !== undefined && (!profile.credit_note_prefix || !/^[A-Za-z0-9-]+$/.test(profile.credit_note_prefix))) {
    errors.credit_note_prefix = 'Credit note prefix may only contain letters, numbers, and dashes.';
  }

  if (!profile.invoice_prefix || !/^[A-Za-z0-9-]+$/.test(profile.invoice_prefix)) {
    errors.invoice_prefix = 'Invoice prefix may only contain letters, numbers, and dashes.';
  }

  if (!profile.quote_prefix || !/^[A-Za-z0-9-]+$/.test(profile.quote_prefix)) {
    errors.quote_prefix = 'Quote prefix may only contain letters, numbers, and dashes.';
  }

  return errors;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidWebsite(website) {
  return /^(https?:\/\/)/i.test(website);
}

function validateClient(client) {
  const errors = {};

  if (!client.name || !String(client.name).trim()) {
    errors.name = 'Name is required.';
  }

  if (client.email && !isValidEmail(client.email)) {
    errors.email = 'Email address is not valid.';
  }

  return errors;
}

function validateItemTemplate(item) {
  const errors = {};

  if (!item.name || !String(item.name).trim()) {
    errors.name = 'Item name is required.';
  }

  const unitPrice = Number(item.unit_price);
  if (item.unit_price === '' || item.unit_price === null || item.unit_price === undefined || isNaN(unitPrice) || unitPrice < 0) {
    errors.unit_price = 'Unit price must be 0 or a positive number.';
  }

  const taxRate = Number(item.tax_rate);
  if (item.tax_rate !== '' && item.tax_rate !== null && item.tax_rate !== undefined && (isNaN(taxRate) || taxRate < 0 || taxRate > 100)) {
    errors.tax_rate = 'Tax rate must be between 0 and 100.';
  }

  return errors;
}

function registerIpcHandlers() {
  ipcMain.handle('company:get', async () => {
    const profile = getCompanyProfile();
    return { ok: true, profile };
  });

  ipcMain.handle('company:pickLogo', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a logo image',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { ok: true, cancelled: true };
    }

    const src = result.filePaths[0];
    const ext = path.extname(src).toLowerCase();
    fs.mkdirSync(LOGO_DIR(), { recursive: true });
    const dest = path.join(LOGO_DIR(), `logo${ext}`);
    fs.copyFileSync(src, dest);

    return { ok: true, cancelled: false, logoPath: dest, fileName: path.basename(src) };
  });

  ipcMain.handle('company:save', async (event, profile) => {
    const errors = validateProfile(profile);
    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    try {
      const saved = saveCompanyProfile(profile);
      return { ok: true, profile: saved };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to save settings: ${err.message}` } };
    }
  });

  ipcMain.handle('dashboard:stats', async () => {
    try {
      const stats = getDashboardStats();
      return { ok: true, stats };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to load dashboard: ${err.message}` } };
    }
  });

  ipcMain.handle('clients:list', async () => {
    const clients = getClients();
    return { ok: true, clients };
  });

  ipcMain.handle('clients:add', async (event, client) => {
    const errors = validateClient(client);
    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    try {
      const saved = addClient(client);
      return { ok: true, client: saved };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to save client: ${err.message}` } };
    }
  });

  ipcMain.handle('clients:update', async (event, id, client) => {
    const errors = validateClient(client);
    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    try {
      const saved = updateClient(id, client);
      if (!saved) {
        return { ok: false, errors: { general: 'Client not found.' } };
      }
      return { ok: true, client: saved };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to update client: ${err.message}` } };
    }
  });

  ipcMain.handle('clients:tryDelete', async (event, id) => {
    const client = getClient(id);
    const history = countClientHistory(id);

    if (history.quoteCount > 0 || history.invoiceCount > 0 || history.projectCount > 0) {
      return {
        ok: false,
        blocked: true,
        name: client ? client.name : 'Client',
        ...history,
      };
    }

    try {
      const result = deleteClient(id);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to delete client: ${err.message}` } };
    }
  });

  ipcMain.handle('clients:archive', async (event, id) => {
    try {
      const archived = archiveClient(id);
      if (!archived) {
        return { ok: false, errors: { general: 'Client not found.' } };
      }
      return { ok: true, client: archived };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to archive client: ${err.message}` } };
    }
  });

  // ---------- Projects (Jobs) ----------

  ipcMain.handle('projects:list', async (event, opts) => {
    try {
      const projects = listProjects(opts || {});
      return { ok: true, projects };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to load projects: ${err.message}` } };
    }
  });

  ipcMain.handle('projects:get', async (event, id) => {
    try {
      const project = getProject(id);
      if (!project) {
        return { ok: false, errors: { general: 'Project not found.' } };
      }
      return { ok: true, project };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to load project: ${err.message}` } };
    }
  });

  ipcMain.handle('projects:add', async (event, project) => {
    const result = addProject(project);
    return result;
  });

  ipcMain.handle('projects:update', async (event, id, project) => {
    const result = updateProject(id, project);
    return result;
  });

  ipcMain.handle('projects:tryDelete', async (event, id) => {
    const project = getProject(id);
    const history = countProjectHistory(id);

    if (history.quoteCount > 0 || history.invoiceCount > 0) {
      return {
        ok: false,
        blocked: true,
        name: project ? project.name : 'Project',
        ...history,
      };
    }

    try {
      const result = deleteProject(id);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to delete project: ${err.message}` } };
    }
  });

  ipcMain.handle('projects:archive', async (event, id) => {
    try {
      const archived = archiveProject(id);
      if (!archived) {
        return { ok: false, errors: { general: 'Project not found.' } };
      }
      return { ok: true, project: archived };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to archive project: ${err.message}` } };
    }
  });

  ipcMain.handle('clients:get', async (event, id) => {
    try {
      const client = getClient(id);
      if (!client) return { ok: false, errors: { general: 'Client not found.' } };
      return { ok: true, client };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to get client: ${err.message}` } };
    }
  });

  // contacts:list — fetch contacts for a given client
  ipcMain.handle('contacts:list', async (event, clientId) => {
    try {
      const contacts = getClientContacts(clientId);
      return { ok: true, contacts };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to list contacts: ${err.message}` } };
    }
  });

  // contacts:save — replace all contacts for a client atomically
  ipcMain.handle('contacts:save', async (event, clientId, contacts) => {
    try {
      saveClientContacts(clientId, contacts);
      const saved = getClientContacts(clientId);
      return { ok: true, contacts: saved };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to save contacts: ${err.message}` } };
    }
  });

  // clients:getOverview — aggregated portal view for a client
  ipcMain.handle('clients:getOverview', async (event, clientId) => {
    try {
      const overview = getClientOverview(clientId);
      if (!overview) return { ok: false, errors: { general: 'Client not found.' } };
      return { ok: true, overview };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to load client overview: ${err.message}` } };
    }
  });

  // client notes / activity log
  ipcMain.handle('clients:listNotes', async (event, clientId) => {
    try {
      const notes = getClientNotes(clientId);
      return { ok: true, notes };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to load notes: ${err.message}` } };
    }
  });

  ipcMain.handle('clients:addNote', async (event, clientId, text) => {
    try {
      const res = addClientNote(clientId, text);
      return res;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to add note: ${err.message}` } };
    }
  });

  ipcMain.handle('clients:updateNote', async (event, noteId, text) => {
    try {
      const res = updateClientNote(noteId, text);
      return res;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to update note: ${err.message}` } };
    }
  });

  ipcMain.handle('clients:deleteNote', async (event, noteId) => {
    try {
      const res = deleteClientNote(noteId);
      return res;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to delete note: ${err.message}` } };
    }
  });


 ipcMain.handle('items:list', async () => {
    try {
      const items = getLineItemTemplates();
      return { ok: true, items };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to list items: ${err.message}` } };
    }
  });


  ipcMain.handle('items:get', async (event, id) => {
    try {
      const item = getLineItemTemplate(id);
      if (!item) return { ok: false, errors: { general: 'Item not found.' } };
      return { ok: true, item };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to get item: ${err.message}` } };
    }
  });

  ipcMain.handle('items:add', async (event, item) => {
    const errors = validateItemTemplate(item);
    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    try {
      const saved = addLineItemTemplate(item);
      return { ok: true, item: saved };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to save item: ${err.message}` } };
    }
  });

  ipcMain.handle('items:update', async (event, id, item) => {
    const errors = validateItemTemplate(item);
    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    try {
      const saved = updateLineItemTemplate(id, item);
      if (!saved) {
        return { ok: false, errors: { general: 'Item not found.' } };
      }
      return { ok: true, item: saved };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to update item: ${err.message}` } };
    }
  });

  ipcMain.handle('items:delete', async (event, id) => {
    try {
      const result = deleteLineItemTemplate(id);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to delete item: ${err.message}` } };
    }
  });

  ipcMain.handle('quotes:create', async (event, data, lineItems) => {
    try {
      const result = createQuote(data, lineItems);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to save quote: ${err.message}` } };
    }
  });

  ipcMain.handle('quotes:update', async (event, id, data, lineItems) => {
    try {
      const result = updateQuote(id, data, lineItems);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to update quote: ${err.message}` } };
    }
  });

  ipcMain.handle('quotes:list', async () => {
    const quotes = listQuotes();
    return { ok: true, quotes };
  });

  ipcMain.handle('quotes:get', async (event, id) => {
    const quote = getQuote(id);
    if (!quote) return { ok: false, errors: { general: 'Quote not found.' } };
    return { ok: true, quote };
  });

  ipcMain.handle('quotes:duplicate', async (event, id) => {
    try {
      const result = duplicateQuote(id);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to duplicate quote: ${err.message}` } };
    }
  });

  ipcMain.handle('quotes:getVersionHistory', async (event, quoteId) => {
    try {
      const history = getQuoteVersionHistory(quoteId);
      return { ok: true, history };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to load version history: ${err.message}` } };
    }
  });

  ipcMain.handle('quotes:setStatus', async (event, id, status) => {
    try {
      const result = setQuoteStatus(id, status);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to update status: ${err.message}` } };
    }
  });

  ipcMain.handle('quotes:exportPdf', async (event, quoteId) => {
    try {
      const quote = getQuote(quoteId);
      if (!quote) {
        return { ok: false, errors: { general: 'Quote not found.' } };
      }
      const client = getClient(quote.client_id);
      const profile = getCompanyProfile();
      const buffer = await renderQuotePdf(quote, client, profile);

      const safeNumber = String(quote.quote_number || 'quote').replace(/[^\w-]+/g, '_');
      const result = await dialog.showSaveDialog({
        title: 'Save Quote PDF',
        defaultPath: `Quote ${safeNumber}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (result.canceled || !result.filePath) {
        return { ok: true, cancelled: true };
      }
      fs.writeFileSync(result.filePath, buffer);
      return { ok: true, savedPath: result.filePath };
    } catch (err) {
      return { ok: false, errors: { general: `Could not export PDF: ${err.message}` } };
    }
  });

  ipcMain.handle('quotes:print', async (event, quoteId) => {
    try {
      const quote = getQuote(quoteId);
      if (!quote) {
        return { ok: false, errors: { general: 'Quote not found.' } };
      }
      const client = getClient(quote.client_id);
      const profile = getCompanyProfile();
      const html = renderQuotePrintHtml(quote, client, profile);
      return await printHtmlWindow(html, `Print Quote ${quote.quote_number || ''}`);
    } catch (err) {
      return { ok: false, errors: { general: `Could not print quote: ${err.message}` } };
    }
  });

  ipcMain.handle('quotes:markAccepted', async (event, id, data) => {
    try {
      const result = markQuoteAccepted(id, data);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to mark quote accepted: ${err.message}` } };
    }
  });

  ipcMain.handle('quotes:markDeclined', async (event, id, data) => {
    try {
      const result = markQuoteDeclined(id, data);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to mark quote declined: ${err.message}` } };
    }
  });

  ipcMain.handle('quotes:exportShareableHtml', async (event, quoteId) => {
    try {
      const quote = getQuote(quoteId);
      if (!quote) {
        return { ok: false, errors: { general: 'Quote not found.' } };
      }
      const client = getClient(quote.client_id);
      const profile = getCompanyProfile();
      const html = renderQuoteHtml(quote, client, profile);

      const safeNumber = String(quote.quote_number || 'quote').replace(/[^\w-]+/g, '_');
      const result = await dialog.showSaveDialog({
        title: 'Export Shareable Quote (HTML)',
        defaultPath: `Quote_${safeNumber}.html`,
        filters: [{ name: 'HTML Document', extensions: ['html', 'htm'] }],
      });
      if (result.canceled || !result.filePath) {
        return { ok: true, cancelled: true };
      }
      fs.writeFileSync(result.filePath, html, 'utf-8');
      return { ok: true, savedPath: result.filePath };
    } catch (err) {
      return { ok: false, errors: { general: `Could not export HTML: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:convertFromQuote', async (event, quoteId, overrides) => {
    try {
      const result = convertQuoteToInvoice(quoteId, overrides);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to create invoice: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:createFinalFromDeposit', async (event, depositInvoiceId, overrides) => {
    try {
      const result = createFinalInvoiceFromDeposit(depositInvoiceId, overrides);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to create final invoice: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:getByQuote', async (event, quoteId) => {
    const invoice = getInvoiceByQuote(quoteId);
    return { ok: true, invoice };
  });

  ipcMain.handle('invoices:list', async () => {
    const invoices = listInvoices();
    return { ok: true, invoices };
  });

  ipcMain.handle('invoices:get', async (event, id) => {
    const invoice = getInvoice(id);
    if (!invoice) return { ok: false, errors: { general: 'Invoice not found.' } };
    return { ok: true, invoice };
  });

  ipcMain.handle('invoices:duplicate', async (event, id) => {
    try {
      const result = duplicateInvoice(id);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to duplicate invoice: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:exportPdf', async (event, invoiceId) => {
    try {
      const invoice = getInvoice(invoiceId);
      if (!invoice) {
        return { ok: false, errors: { general: 'Invoice not found.' } };
      }
      const client = getClient(invoice.client_id);
      const profile = getCompanyProfile();
      const buffer = await renderInvoicePdf(invoice, client, profile);

      const safeNumber = String(invoice.invoice_number || 'invoice').replace(/[^\w-]+/g, '_');
      const result = await dialog.showSaveDialog({
        title: 'Save Invoice PDF',
        defaultPath: `Invoice ${safeNumber}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (result.canceled || !result.filePath) {
        return { ok: true, cancelled: true };
      }
      fs.writeFileSync(result.filePath, buffer);
      return { ok: true, savedPath: result.filePath };
    } catch (err) {
      return { ok: false, errors: { general: `Could not export PDF: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:print', async (event, invoiceId) => {
    try {
      const invoice = getInvoice(invoiceId);
      if (!invoice) {
        return { ok: false, errors: { general: 'Invoice not found.' } };
      }
      const client = getClient(invoice.client_id);
      const profile = getCompanyProfile();
      const html = renderInvoicePrintHtml(invoice, client, profile);
      return await printHtmlWindow(html, `Print Invoice ${invoice.invoice_number || ''}`);
    } catch (err) {
      return { ok: false, errors: { general: `Could not print invoice: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:exportPdfBatch', async (event, ids) => {
    try {
      const uniqueIds = Array.from(new Set((ids || []).filter((id) => Number(id) > 0).map(Number)));
      if (uniqueIds.length === 0) {
        return { ok: false, errors: { general: 'No invoices selected.' } };
      }
      const folderResult = await dialog.showOpenDialog({
        title: 'Choose a folder to save invoice PDFs',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (folderResult.canceled || folderResult.filePaths.length === 0) {
        return { ok: true, cancelled: true };
      }
      const folder = folderResult.filePaths[0];

      const profile = getCompanyProfile();
      const savedPaths = [];
      const failures = [];
      for (const id of uniqueIds) {
        const invoice = getInvoice(id);
        if (!invoice) {
          failures.push({ id, reason: 'Invoice not found.' });
          continue;
        }
        const client = getClient(invoice.client_id);
        const buffer = await renderInvoicePdf(invoice, client, profile);
        const base = `Invoice ${String(invoice.invoice_number || id).replace(/[^\w-]+/g, '_')}.pdf`;
        let fileName = base;
        let counter = 2;
        while (fs.existsSync(path.join(folder, fileName))) {
          fileName = `${base.slice(0, -4)} (${counter}).pdf`;
          counter++;
        }
        const dest = path.join(folder, fileName);
        fs.writeFileSync(dest, buffer);
        savedPaths.push(dest);
      }
      return { ok: true, folder, savedCount: savedPaths.length, savedPaths, failures };
    } catch (err) {
      return { ok: false, errors: { general: `Could not export PDFs: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:setStatus', async (event, id, status) => {
    try {
      const result = setInvoiceStatus(id, status);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to update status: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:markSentBatch', async (event, ids) => {
    try {
      const result = markInvoicesSent(ids || []);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to update statuses: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:recordPayment', async (event, id, payment) => {
    try {
      const result = addPayment(id, payment);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to record payment: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:payments', async (event, id) => {
    const payments = getPaymentHistory(id);
    return { ok: true, payments };
  });

  ipcMain.handle('invoices:methods', async () => {
    return { ok: true, methods: PAYMENT_METHODS };
  });

  ipcMain.handle('reports:payments', async (event, filter) => {
    try {
      const report = getPaymentsReport(filter);
      return { ok: true, report };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to generate payments report: ${err.message}` } };
    }
  });

  ipcMain.handle('reports:profitLoss', async (event, filter) => {
    try {
      const report = getProfitLossReport(filter);
      return { ok: true, report };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to generate Profit & Loss report: ${err.message}` } };
    }
  });

  // ---------- Expenses ----------
  ipcMain.handle('expenses:list', async (event, filter) => {
    try {
      const expenses = listExpenses(filter);
      return { ok: true, expenses };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to list expenses: ${err.message}` } };
    }
  });

  ipcMain.handle('expenses:get', async (event, id) => {
    try {
      const expense = getExpense(id);
      if (!expense) return { ok: false, errors: { general: 'Expense not found.' } };
      return { ok: true, expense };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to get expense: ${err.message}` } };
    }
  });

  ipcMain.handle('expenses:create', async (event, data) => {
    try {
      const result = createExpense(data);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to create expense: ${err.message}` } };
    }
  });

  ipcMain.handle('expenses:update', async (event, id, data) => {
    try {
      const result = updateExpense(id, data);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to update expense: ${err.message}` } };
    }
  });

  ipcMain.handle('expenses:delete', async (event, id) => {
    try {
      const result = deleteExpense(id);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to delete expense: ${err.message}` } };
    }
  });

  ipcMain.handle('expenses:summary', async (event, filter) => {
    try {
      const summary = getExpensesSummary(filter);
      return { ok: true, summary };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to get expenses summary: ${err.message}` } };
    }
  });

  ipcMain.handle('expenses:categories', async () => {
    return { ok: true, categories: EXPENSE_CATEGORIES };
  });

  ipcMain.handle('creditNotes:issue', async (event, invoiceId, data) => {
    try {
      const result = issueCreditNote(invoiceId, data);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to issue credit note: ${err.message}` } };
    }
  });

  ipcMain.handle('creditNotes:forInvoice', async (event, invoiceId) => {
    try {
      const creditNotes = getCreditNotesForInvoice(invoiceId);
      return { ok: true, creditNotes };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to load credit notes: ${err.message}` } };
    }
  });

  ipcMain.handle('creditNotes:forClient', async (event, clientId) => {
    try {
      const creditNotes = getCreditNotesForClient(clientId);
      return { ok: true, creditNotes };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to load credit notes: ${err.message}` } };
    }
  });

  ipcMain.handle('creditNotes:exportPdf', async (event, creditNoteId) => {
    try {
      const creditNote = getCreditNote(creditNoteId);
      if (!creditNote) {
        return { ok: false, errors: { general: 'Credit note not found.' } };
      }
      const invoice = creditNote.invoice || null;
      const client = creditNote.client || null;
      const profile = getCompanyProfile();
      const buffer = await renderCreditNotePdf(creditNote, invoice, client, profile);

      const safeNumber = String(creditNote.credit_note_number || 'credit-note').replace(/[^\w-]+/g, '_');
      const result = await dialog.showSaveDialog({
        title: 'Save Credit Note PDF',
        defaultPath: `Credit Note ${safeNumber}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (result.canceled || !result.filePath) {
        return { ok: true, cancelled: true };
      }
      fs.writeFileSync(result.filePath, buffer);
      return { ok: true, savedPath: result.filePath };
    } catch (err) {
      return { ok: false, errors: { general: `Could not export PDF: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:getRecurringProfile', async (event, invoiceId) => {
    try {
      const profile = getRecurringProfileByInvoice(invoiceId);
      return { ok: true, profile };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to load recurring schedule: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:setRecurring', async (event, invoiceId, data) => {
    try {
      const res = setRecurringProfile(invoiceId, data);
      return res;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to set recurring schedule: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:pauseRecurring', async (event, profileId) => {
    try {
      const res = pauseRecurringProfile(profileId);
      return res;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to pause recurring series: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:resumeRecurring', async (event, profileId) => {
    try {
      const res = resumeRecurringProfile(profileId);
      return res;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to resume recurring series: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:cancelRecurring', async (event, profileId) => {
    try {
      const res = cancelRecurringProfile(profileId);
      return res;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to cancel recurring series: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:triggerRecurringNow', async (event, profileId) => {
    try {
      const res = triggerRecurringOccurrence(profileId);
      return res;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to trigger recurring invoice: ${err.message}` } };
    }
  });

  ipcMain.handle('invoices:checkRecurringDue', async () => {
    try {
      const res = processDueRecurringInvoices();
      return res;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to process due recurring invoices: ${err.message}` } };
    }
  });

  ipcMain.handle('backup:export', async () => {
    try {
      const payload = createBackupPayload(getCompanyProfile());
      const stamp = new Date().toISOString().slice(0, 10);
      const result = await dialog.showSaveDialog({
        title: 'Export QuoteCraft Backup',
        defaultPath: `QuoteCraft-Backup-${stamp}.json`,
        filters: [{ name: 'QuoteCraft Backup', extensions: ['json', 'qcbackup'] }],
      });
      if (result.canceled || !result.filePath) {
        return { ok: true, cancelled: true };
      }
      fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2));
      return { ok: true, savedPath: result.filePath };
    } catch (err) {
      return { ok: false, errors: { general: `Could not export backup: ${err.message}` } };
    }
  });

  ipcMain.handle('backup:prepareRestore', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select a QuoteCraft backup to restore',
        properties: ['openFile'],
        filters: [{ name: 'QuoteCraft Backup', extensions: ['json', 'qcbackup'] }],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: true, cancelled: true };
      }

      const filePath = result.filePaths[0];
      const buffer = fs.readFileSync(filePath);
      const v = await validateBackupBuffer(buffer);
      if (!v.ok) {
        return { ok: false, error: v.error };
      }

      return {
        ok: true,
        filePath,
        fileName: path.basename(filePath),
        createdAt: v.payload.createdAt || null,
        counts: v.counts,
      };
    } catch (err) {
      return { ok: false, error: `Could not read the backup file: ${err.message}` };
    }
  });

  ipcMain.handle('backup:restore', async (event, filePath) => {
    try {
      if (!filePath) {
        return { ok: false, errors: { general: 'No backup file was selected.' } };
      }
      const buffer = fs.readFileSync(filePath);
      const v = await validateBackupBuffer(buffer);
      if (!v.ok) {
        return { ok: false, errors: { general: v.error } };
      }

      // Timestamped pre-restore copy of current data, so the restore can be undone.
      fs.mkdirSync(BACKUPS_DIR(), { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const autoPath = path.join(BACKUPS_DIR(), `pre-restore-${stamp}.json`);
      fs.writeFileSync(autoPath, JSON.stringify(createBackupPayload(getCompanyProfile()), null, 2));

      await restoreDatabaseFromBuffer(v.dbBytes);

      // Restore the logo image (business data lives in the DB; the logo is a file asset).
      fs.mkdirSync(LOGO_DIR(), { recursive: true });
      let newLogoPath = null;
      if (v.payload && v.payload.logo) {
        const ext = v.payload.logoFileName ? path.extname(v.payload.logoFileName) : '.png';
        newLogoPath = path.join(LOGO_DIR(), `logo${ext}`);
        fs.writeFileSync(newLogoPath, Buffer.from(v.payload.logo, 'base64'));
      }

      const restoredProfile = getCompanyProfile();
      if (restoredProfile) {
        saveCompanyProfile(Object.assign({}, restoredProfile, { logo_path: newLogoPath }));
      }

      return { ok: true, autoBackupPath: autoPath };
    } catch (err) {
      return { ok: false, errors: { general: `Could not restore backup: ${err.message}` } };
    }
  });

  // ---------- Audit Trail ----------
  ipcMain.handle('audit:getEntries', async (event, filter) => {
    try {
      return { ok: true, entries: getAuditLogEntries(filter || {}) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---------- Automatic Backups ----------
  ipcMain.handle('autobackup:getSettings', async () => {
    try {
      return { ok: true, settings: getAutoBackupSettings() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('autobackup:saveSettings', async (event, settings) => {
    try {
      const res = saveAutoBackupSettings(settings || {});
      return res.ok ? { ok: true, settings: res.settings } : { ok: false, error: res.error };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('autobackup:chooseFolder', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Choose a folder for automatic backups',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: true, cancelled: true, folder: null };
      }
      return { ok: true, canceled: false, folder: result.filePaths[0] };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('autobackup:runNow', async () => {
    try {
      const res = runAutoBackupNow();
      return res.ok ? { ok: true, path: res.path } : { ok: false, error: res.error };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('autobackup:list', async (event, folder) => {
    try {
      const backups = listAutoBackups(folder || getAutoBackupSettings().folder);
      return { ok: true, backups };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---------- Email Settings ----------
  ipcMain.handle('email:getSettings', async () => {
    try {
      const settings = getEmailSettings();
      return { ok: true, settings };
    } catch (err) {
      return { ok: false, errors: { general: `Failed to load email settings: ${err.message}` } };
    }
  });

  ipcMain.handle('email:saveSettings', async (event, settings) => {
    try {
      const result = saveEmailSettings(settings);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to save email settings: ${err.message}` } };
    }
  });

  ipcMain.handle('email:sendTest', async (event, recipient) => {
    try {
      const config = getEmailSettingsInternal();
      if (!config) {
        return { ok: false, error: 'No email settings configured yet. Please save your SMTP settings first.' };
      }
      const result = await sendTestEmail(config, recipient);
      return result;
    } catch (err) {
      return { ok: false, error: `Failed to send test email: ${err.message}` };
    }
  });

  ipcMain.handle('email:sendDocument', async (event, payload) => {
    try {
      const { documentType, documentId, to, cc, subject, message } = payload || {};
      if (!documentType || !documentId) {
        return { ok: false, error: 'Document type and ID are required.' };
      }
      if (!to || !to.trim()) {
        return { ok: false, error: 'Recipient email address is required.' };
      }

      const config = getEmailSettingsInternal();
      if (!config) {
        return { ok: false, error: 'No email settings configured. Please configure your SMTP settings first in Settings.' };
      }

      let doc;
      let client;
      let buffer;
      let filename;
      const profile = getCompanyProfile();

      if (documentType === 'quote') {
        doc = getQuote(documentId);
        if (!doc) return { ok: false, error: 'Quote not found.' };
        client = getClient(doc.client_id);
        buffer = await renderQuotePdf(doc, client, profile);
        const safeNumber = String(doc.quote_number || 'quote').replace(/[^\w-]+/g, '_');
        filename = `Quote_${safeNumber}.pdf`;
      } else if (documentType === 'invoice') {
        doc = getInvoice(documentId);
        if (!doc) return { ok: false, error: 'Invoice not found.' };
        client = getClient(doc.client_id);
        buffer = await renderInvoicePdf(doc, client, profile);
        const safeNumber = String(doc.invoice_number || 'invoice').replace(/[^\w-]+/g, '_');
        filename = `Invoice_${safeNumber}.pdf`;
      } else {
        return { ok: false, error: `Unsupported document type: ${documentType}` };
      }

      const attachments = [
        {
          filename,
          content: buffer,
          contentType: 'application/pdf',
        },
      ];

      const sendResult = await sendDocumentEmail(config, {
        to: to.trim(),
        cc: cc && cc.trim() ? cc.trim() : undefined,
        subject: subject || `${documentType === 'quote' ? 'Quote' : 'Invoice'} from ${profile.company_name || 'QuoteCraft'}`,
        text: message || '',
        attachments,
      });

      if (!sendResult.ok) {
        return { ok: false, error: sendResult.error || 'Failed to send email.' };
      }

      // Automatically update status to 'sent' if document is currently 'draft'
      if (doc.status === 'draft') {
        if (documentType === 'quote') {
          setQuoteStatus(documentId, 'sent');
        } else if (documentType === 'invoice') {
          setInvoiceStatus(documentId, 'sent');
        }
      }

      // Log visible send activity
      const logRecord = logDocumentEmail({
        document_type: documentType,
        document_id: documentId,
        recipient_to: to.trim(),
        recipient_cc: cc && cc.trim() ? cc.trim() : null,
        subject: subject || '',
        message_id: sendResult.messageId || null,
        sent_at: new Date().toISOString(),
      });

      const updatedDoc = documentType === 'quote' ? getQuote(documentId) : getInvoice(documentId);
      const logs = getDocumentEmailLogs(documentType, documentId);

      return {
        ok: true,
        messageId: sendResult.messageId,
        document: updatedDoc,
        logs,
        log: logRecord,
      };
    } catch (err) {
      return { ok: false, error: `Failed to send email: ${err.message}` };
    }
  });

  ipcMain.handle('email:getDocumentLogs', async (event, documentType, documentId) => {
    try {
      const logs = getDocumentEmailLogs(documentType, documentId);
      return { ok: true, logs };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---------- Payment Reminder Handlers ----------

  ipcMain.handle('reminders:getRules', async () => {
    try {
      return { ok: true, rules: getReminderRules() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('reminders:saveRule', async (event, rule) => {
    try {
      return saveReminderRule(rule);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('reminders:deleteRule', async (event, id) => {
    try {
      return deleteReminderRule(id);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('reminders:resetDefaults', async () => {
    try {
      return resetDefaultReminderRules();
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('reminders:getSettings', async () => {
    try {
      return { ok: true, settings: getReminderSettings() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('reminders:saveSettings', async (event, settings) => {
    try {
      return saveReminderSettings(settings);
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('reminders:getDue', async (event, referenceDate) => {
    try {
      return { ok: true, reminders: getDueReminders(referenceDate) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('reminders:send', async (event, payload) => {
    try {
      const { invoiceId, ruleId, to, cc, subject, message } = payload;
      const config = getEmailSettingsInternal();
      if (!config || !config.smtp_host || !config.smtp_username || !config.smtp_password) {
        return { ok: false, error: 'Email settings are incomplete. Please configure SMTP in Email Settings.' };
      }

      const inv = getInvoice(invoiceId);
      if (!inv) return { ok: false, error: 'Invoice not found.' };

      const client = getClient(inv.client_id);
      const profile = getCompanyProfile();
      const buffer = await renderInvoicePdf(inv, client, profile);
      const safeNumber = String(inv.invoice_number || 'invoice').replace(/[^\w-]+/g, '_');
      const filename = `Invoice_${safeNumber}.pdf`;

      const recipientTo = to ? to.trim() : '';
      if (!recipientTo) {
        return { ok: false, error: 'No recipient email address found for this reminder.' };
      }

      const sendResult = await sendDocumentEmail(config, {
        to: recipientTo,
        cc: cc && cc.trim() ? cc.trim() : undefined,
        subject: subject || `Payment Reminder: Invoice ${inv.invoice_number}`,
        text: message || '',
        attachments: [
          {
            filename,
            content: buffer,
            contentType: 'application/pdf',
          },
        ],
      });

      if (!sendResult.ok) {
        return { ok: false, error: sendResult.error || 'Failed to send reminder email.' };
      }

      logReminderSent(invoiceId, ruleId, {
        recipient_to: recipientTo,
        recipient_cc: cc && cc.trim() ? cc.trim() : null,
        subject: subject || `Payment Reminder: Invoice ${inv.invoice_number}`,
        message_id: sendResult.messageId || null,
        sent_at: new Date().toISOString(),
      });

      return { ok: true, messageId: sendResult.messageId };
    } catch (err) {
      return { ok: false, error: `Failed to send reminder: ${err.message}` };
    }
  });

  ipcMain.handle('reminders:sendBatch', async (event, reminderList) => {
    try {
      const items = Array.isArray(reminderList) ? reminderList : getDueReminders();
      let sentCount = 0;
      let failedCount = 0;
      const errors = [];

      for (const item of items) {
        try {
          const config = getEmailSettingsInternal();
          if (!config || !config.smtp_host || !config.smtp_username || !config.smtp_password) {
            failedCount++;
            errors.push(`${item.invoice_number}: Email settings not configured`);
            continue;
          }

          const inv = getInvoice(item.invoice_id);
          if (!inv) {
            failedCount++;
            errors.push(`${item.invoice_number}: Invoice not found`);
            continue;
          }

          const to = item.recipient_to ? item.recipient_to.trim() : '';
          if (!to) {
            failedCount++;
            errors.push(`${item.invoice_number}: No recipient email address`);
            continue;
          }

          const client = getClient(inv.client_id);
          const profile = getCompanyProfile();
          const buffer = await renderInvoicePdf(inv, client, profile);
          const safeNumber = String(inv.invoice_number || 'invoice').replace(/[^\w-]+/g, '_');
          const filename = `Invoice_${safeNumber}.pdf`;

          const sendResult = await sendDocumentEmail(config, {
            to,
            cc: item.recipient_cc && item.recipient_cc.trim() ? item.recipient_cc.trim() : undefined,
            subject: item.subject,
            text: item.message,
            attachments: [
              {
                filename,
                content: buffer,
                contentType: 'application/pdf',
              },
            ],
          });

          if (sendResult.ok) {
            sentCount++;
            logReminderSent(item.invoice_id, item.rule_id, {
              recipient_to: to,
              recipient_cc: item.recipient_cc,
              subject: item.subject,
              message_id: sendResult.messageId || null,
              sent_at: new Date().toISOString(),
            });
          } else {
            failedCount++;
            errors.push(`${item.invoice_number}: ${sendResult.error}`);
          }
        } catch (itemErr) {
          failedCount++;
          errors.push(`${item.invoice_number}: ${itemErr.message}`);
        }
      }

      return { ok: true, sentCount, failedCount, errors };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('reminders:checkAutoSend', async () => {
    try {
      const s = getReminderSettings();
      if (!s.auto_send_reminders) {
        return { ok: true, autoSendEnabled: false, sentCount: 0 };
      }

      const config = getEmailSettingsInternal();
      if (!config || !config.smtp_host || !config.smtp_username || !config.smtp_password) {
        return { ok: false, error: 'Email configuration is incomplete for automatic reminder sending.' };
      }

      const due = getDueReminders();
      if (!due.length) {
        return { ok: true, autoSendEnabled: true, sentCount: 0 };
      }

      let sentCount = 0;
      let failedCount = 0;
      const errors = [];

      for (const item of due) {
        try {
          const inv = getInvoice(item.invoice_id);
          if (!inv) continue;
          const to = item.recipient_to ? item.recipient_to.trim() : '';
          if (!to) {
            failedCount++;
            errors.push(`${item.invoice_number}: No recipient email`);
            continue;
          }

          const client = getClient(inv.client_id);
          const profile = getCompanyProfile();
          const buffer = await renderInvoicePdf(inv, client, profile);
          const safeNumber = String(inv.invoice_number || 'invoice').replace(/[^\w-]+/g, '_');
          const filename = `Invoice_${safeNumber}.pdf`;

          const sendResult = await sendDocumentEmail(config, {
            to,
            cc: item.recipient_cc && item.recipient_cc.trim() ? item.recipient_cc.trim() : undefined,
            subject: item.subject,
            text: item.message,
            attachments: [
              {
                filename,
                content: buffer,
                contentType: 'application/pdf',
              },
            ],
          });

          if (sendResult.ok) {
            sentCount++;
            logReminderSent(item.invoice_id, item.rule_id, {
              recipient_to: to,
              recipient_cc: item.recipient_cc,
              subject: item.subject,
              message_id: sendResult.messageId || null,
              sent_at: new Date().toISOString(),
            });
          } else {
            failedCount++;
            errors.push(`${item.invoice_number}: ${sendResult.error}`);
          }
        } catch (e) {
          failedCount++;
          errors.push(`${item.invoice_number}: ${e.message}`);
        }
      }

      return { ok: true, autoSendEnabled: true, sentCount, failedCount, errors };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---------- Revenue Report ----------
  ipcMain.handle('reports:revenue', async (event, filter) => {
    try {
      const report = getRevenueReport(filter || {});
      return { ok: true, report };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---------- Client Profitability Report ----------
  ipcMain.handle('reports:clientProfitability', async (event, filter) => {
    try {
      const report = getClientProfitabilityReport(filter || {});
      return { ok: true, report };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---------- Shell: Open External URLs ----------
  ipcMain.handle('shell:openExternal', async (event, url) => {
    try {
      const allowed = [
        'https://myaccount.google.com/apppasswords',
        'https://account.live.com/proofs/manage',
        'https://login.yahoo.com/account/security',
        'https://appleid.apple.com/account/manage',
        'https://ethereal.email',
      ];
      const isAllowed = allowed.some((prefix) => url.startsWith(prefix));
      if (!isAllowed && !url.startsWith('https://')) {
        return { ok: false, error: 'Only https:// URLs may be opened externally.' };
      }
      await shell.openExternal(url);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---------- App Lock (PIN) ----------
  ipcMain.handle('lock:getSettings', async () => {
    try {
      return { ok: true, settings: getAppLockSettings() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('lock:setPin', async (event, payload) => {
    try {
      const res = setAppLockPin(payload || {});
      return res.ok ? { ok: true, settings: res.settings } : { ok: false, error: res.error };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('lock:verify', async (event, payload) => {
    try {
      const unlocked = verifyAppLockPin((payload && payload.pin) || '');
      return { ok: true, unlocked };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('lock:disable', async (event, payload) => {
    try {
      const res = disableAppLock(payload || {});
      return res.ok ? { ok: true, settings: res.settings } : { ok: false, error: res.error };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { registerIpcHandlers };
