const { ipcMain, dialog, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { renderQuotePdf, renderInvoicePdf } = require('./pdf-export');
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
  listQuotes,
  setQuoteStatus,
  convertQuoteToInvoice,
  getInvoice,
  getInvoiceByQuote,
  listInvoices,
  setInvoiceStatus,
  addPayment,
  getPaymentHistory,
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
