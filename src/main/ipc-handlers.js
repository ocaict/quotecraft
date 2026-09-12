const { ipcMain, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { renderQuotePdf, renderInvoicePdf, renderCreditNotePdf } = require('./pdf-export');
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
  updateQuote,
  getQuote,
  getQuoteVersionHistory,
  listQuotes,
  setQuoteStatus,
  convertQuoteToInvoice,
  createFinalInvoiceFromDeposit,
  getInvoice,
  getInvoiceByQuote,
  listInvoices,
  setInvoiceStatus,
  addPayment,
  getPaymentHistory,
  getPaymentsReport,
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
  getDatabaseBuffer,
  validateBackupBuffer,
  restoreDatabaseFromBuffer,
  PAYMENT_METHODS,
} = require('./database');

const LOGO_DIR = () => path.join(app.getPath('userData'), 'logo');
const BACKUPS_DIR = () => path.join(app.getPath('userData'), 'backups');

function buildBackupPayload(profile) {
  const dbBytes = getDatabaseBuffer();
  let logo = null;
  let logoFileName = null;
  if (profile && profile.logo_path) {
    const lp = profile.logo_path;
    if (fs.existsSync(lp)) {
      try {
        logo = fs.readFileSync(lp).toString('base64');
        logoFileName = path.basename(lp);
      } catch (e) {
        /* skip logo if unreadable */
      }
    }
  }
  return {
    app: 'QuoteCraft',
    magic: 'QUOTECRAFT_BACKUP',
    version: 1,
    createdAt: new Date().toISOString(),
    database: dbBytes.toString('base64'),
    logo,
    logoFileName,
  };
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

    if (history.quoteCount > 0 || history.invoiceCount > 0) {
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

  ipcMain.handle('invoices:setStatus', async (event, id, status) => {
    try {
      const result = setInvoiceStatus(id, status);
      return result;
    } catch (err) {
      return { ok: false, errors: { general: `Failed to update status: ${err.message}` } };
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
      const payload = buildBackupPayload(getCompanyProfile());
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
      fs.writeFileSync(autoPath, JSON.stringify(buildBackupPayload(getCompanyProfile()), null, 2));

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
}

module.exports = { registerIpcHandlers };
