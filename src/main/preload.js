const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => 'pong',

  getCompanyProfile: () => ipcRenderer.invoke('company:get'),
  getDashboardStats: () => ipcRenderer.invoke('dashboard:stats'),
  pickLogo: () => ipcRenderer.invoke('company:pickLogo'),
  saveCompanyProfile: (profile) => ipcRenderer.invoke('company:save', profile),

  listClients: () => ipcRenderer.invoke('clients:list'),
  addClient: (client) => ipcRenderer.invoke('clients:add', client),
  updateClient: (id, client) => ipcRenderer.invoke('clients:update', id, client),
  tryDeleteClient: (id) => ipcRenderer.invoke('clients:tryDelete', id),
  archiveClient: (id) => ipcRenderer.invoke('clients:archive', id),

  createQuote: (data, lineItems) => ipcRenderer.invoke('quotes:create', data, lineItems),
  updateQuote: (id, data, lineItems) => ipcRenderer.invoke('quotes:update', id, data, lineItems),
  listQuotes: () => ipcRenderer.invoke('quotes:list'),
  getQuote: (id) => ipcRenderer.invoke('quotes:get', id),
  setQuoteStatus: (id, status) => ipcRenderer.invoke('quotes:setStatus', id, status),
  exportQuotePdf: (quoteId) => ipcRenderer.invoke('quotes:exportPdf', quoteId),

  convertQuoteToInvoice: (quoteId, overrides) => ipcRenderer.invoke('invoices:convertFromQuote', quoteId, overrides),
  getInvoiceByQuote: (quoteId) => ipcRenderer.invoke('invoices:getByQuote', quoteId),
  listInvoices: () => ipcRenderer.invoke('invoices:list'),
  getInvoice: (id) => ipcRenderer.invoke('invoices:get', id),
  exportInvoicePdf: (invoiceId) => ipcRenderer.invoke('invoices:exportPdf', invoiceId),
  setInvoiceStatus: (id, status) => ipcRenderer.invoke('invoices:setStatus', id, status),
  recordPayment: (id, payment) => ipcRenderer.invoke('invoices:recordPayment', id, payment),
  getInvoicePayments: (id) => ipcRenderer.invoke('invoices:payments', id),
  getPaymentMethods: () => ipcRenderer.invoke('invoices:methods'),

  exportBackup: () => ipcRenderer.invoke('backup:export'),
  prepareRestore: () => ipcRenderer.invoke('backup:prepareRestore'),
  restoreBackup: (filePath) => ipcRenderer.invoke('backup:restore', filePath),
});
