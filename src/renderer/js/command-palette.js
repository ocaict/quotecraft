// Command Palette (Ctrl+K) Controller for QuoteCraft
// Provides fast keyboard-driven navigation, quick actions, and fuzzy search.
(function () {
  'use strict';

  var SVG_WRAPPER_START = '<svg class="cmd-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">';
  var SVG_WRAPPER_END = '</svg>';

  function makeIcon(innerSvg) {
    return SVG_WRAPPER_START + innerSvg + SVG_WRAPPER_END;
  }

  var ICONS = {
    dashboard: makeIcon('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'),
    clients: makeIcon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    projects: makeIcon('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
    timer: makeIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    quotes: makeIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>'),
    invoices: makeIcon('<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/>'),
    payments: makeIcon('<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>'),
    items: makeIcon('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'),
    expenses: makeIcon('<path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><circle cx="18" cy="14" r="2"/>'),
    revenue: makeIcon('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>'),
    profitability: makeIcon('<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>'),
    profitloss: makeIcon('<path d="M12 3v18"/><path d="m3 7 4 7H1l4-7z"/><path d="m15 11 4 7h-6l4-7z"/><path d="M5 7h14"/>'),
    statements: makeIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
    settings: makeIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    email: makeIcon('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
    audit: makeIcon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
    plus: makeIcon('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    play: makeIcon('<polygon points="5 3 19 12 5 21 5 3"/>'),
    theme: makeIcon('<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'),
    search: makeIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
    help: makeIcon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    clock: makeIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>')
  };

  var COMMANDS = [
    // --- Actions ---
    {
      id: 'action-new-quote',
      label: 'New Quote',
      category: 'Actions',
      icon: ICONS.plus,
      shortcut: 'N',
      keywords: 'create quote draft proposal estimate',
      action: function () {
        var btn = document.getElementById('dashNewQuoteBtn') || document.getElementById('newQuoteBtn');
        if (btn) btn.click();
      }
    },
    {
      id: 'action-new-invoice',
      label: 'New Invoice',
      category: 'Actions',
      icon: ICONS.plus,
      shortcut: 'I',
      keywords: 'create invoice bill payment request',
      action: function () {
        var btn = document.getElementById('dashNewInvoiceBtn') || document.getElementById('newInvoiceBtn');
        if (btn) btn.click();
      }
    },
    {
      id: 'action-new-client',
      label: 'New Client',
      category: 'Actions',
      icon: ICONS.plus,
      shortcut: 'C',
      keywords: 'create client customer contact person add',
      action: function () {
        var btn = document.getElementById('addClientBtn');
        if (btn) btn.click();
      }
    },
    {
      id: 'action-new-project',
      label: 'New Project',
      category: 'Actions',
      icon: ICONS.plus,
      shortcut: '',
      keywords: 'create project client job task',
      action: function () {
        window.QuoteCraftUtils.goToPage('projects');
        var btn = document.getElementById('addProjectBtn');
        if (btn) btn.click();
      }
    },
    {
      id: 'action-new-expense',
      label: 'New Expense',
      category: 'Actions',
      icon: ICONS.plus,
      shortcut: '',
      keywords: 'log record expense receipt cost spend',
      action: function () {
        window.QuoteCraftUtils.goToPage('expenses');
        var btn = document.getElementById('addExpenseBtn');
        if (btn) btn.click();
      }
    },
    {
      id: 'action-start-timer',
      label: 'Start Live Timer',
      category: 'Actions',
      icon: ICONS.play,
      shortcut: '',
      keywords: 'time clock tracker stopwatch record hours work',
      action: function () {
        if (window.QuoteCraftTimer && window.QuoteCraftTimer.openStart) {
          window.QuoteCraftTimer.openStart();
        } else {
          window.QuoteCraftUtils.goToPage('time-entries');
        }
      }
    },
    {
      id: 'action-toggle-theme',
      label: 'Toggle Dark / Light Theme',
      category: 'Actions',
      icon: ICONS.theme,
      shortcut: '',
      keywords: 'dark mode light theme appearance color switch',
      action: function () {
        if (window.QuoteCraftTheme) {
          var current = window.QuoteCraftTheme.getMode();
          var next = current === 'light' ? 'dark' : 'light';
          window.QuoteCraftTheme.setMode(next);
          if (window.QuoteCraftUtils && window.QuoteCraftUtils.showToast) {
            window.QuoteCraftUtils.showToast('Theme set to ' + next);
          }
        }
      }
    },
    {
      id: 'action-focus-search',
      label: 'Search Current View',
      category: 'Actions',
      icon: ICONS.search,
      shortcut: '/',
      keywords: 'find filter query lookup',
      action: function () {
        var evt = new KeyboardEvent('keydown', { key: '/', bubbles: true });
        document.dispatchEvent(evt);
      }
    },

    // --- Navigation ---
    {
      id: 'nav-dashboard',
      label: 'Go to Dashboard',
      category: 'Navigation',
      icon: ICONS.dashboard,
      shortcut: '',
      keywords: 'home stats overview kpi',
      action: function () { window.QuoteCraftUtils.goToPage('dashboard'); }
    },
    {
      id: 'nav-clients',
      label: 'Go to Clients',
      category: 'Navigation',
      icon: ICONS.clients,
      shortcut: '',
      keywords: 'customers contacts people address',
      action: function () { window.QuoteCraftUtils.goToPage('clients'); }
    },
    {
      id: 'nav-projects',
      label: 'Go to Projects',
      category: 'Navigation',
      icon: ICONS.projects,
      shortcut: '',
      keywords: 'jobs assignments tasks clients',
      action: function () { window.QuoteCraftUtils.goToPage('projects'); }
    },
    {
      id: 'nav-time-entries',
      label: 'Go to Time Entries',
      category: 'Navigation',
      icon: ICONS.timer,
      shortcut: '',
      keywords: 'hours timesheet logs timer tracked',
      action: function () { window.QuoteCraftUtils.goToPage('time-entries'); }
    },
    {
      id: 'nav-quotes',
      label: 'Go to Quotes',
      category: 'Navigation',
      icon: ICONS.quotes,
      shortcut: '',
      keywords: 'proposals estimates bids drafts',
      action: function () { window.QuoteCraftUtils.goToPage('quotes'); }
    },
    {
      id: 'nav-invoices',
      label: 'Go to Invoices',
      category: 'Navigation',
      icon: ICONS.invoices,
      shortcut: '',
      keywords: 'bills unpaid overdue payments credit notes',
      action: function () { window.QuoteCraftUtils.goToPage('invoices'); }
    },
    {
      id: 'nav-payments',
      label: 'Go to Payments',
      category: 'Navigation',
      icon: ICONS.payments,
      shortcut: '',
      keywords: 'received transactions paid history money',
      action: function () { window.QuoteCraftUtils.goToPage('payments'); }
    },
    {
      id: 'nav-items',
      label: 'Go to Line Item Library',
      category: 'Navigation',
      icon: ICONS.items,
      shortcut: '',
      keywords: 'products services catalog catalog rates inventory',
      action: function () { window.QuoteCraftUtils.goToPage('items'); }
    },
    {
      id: 'nav-expenses',
      label: 'Go to Expenses',
      category: 'Navigation',
      icon: ICONS.expenses,
      shortcut: '',
      keywords: 'receipts spending costs deductions',
      action: function () { window.QuoteCraftUtils.goToPage('expenses'); }
    },
    {
      id: 'nav-revenue-report',
      label: 'Go to Revenue Report',
      category: 'Navigation',
      icon: ICONS.revenue,
      shortcut: '',
      keywords: 'analytics charts sales quarterly monthly earnings',
      action: function () { window.QuoteCraftUtils.goToPage('revenue-report'); }
    },
    {
      id: 'nav-client-profitability',
      label: 'Go to Client Profitability',
      category: 'Navigation',
      icon: ICONS.profitability,
      shortcut: '',
      keywords: 'margin profit top clients performance roi',
      action: function () { window.QuoteCraftUtils.goToPage('client-profitability'); }
    },
    {
      id: 'nav-profit-loss',
      label: 'Go to Profit & Loss',
      category: 'Navigation',
      icon: ICONS.profitloss,
      shortcut: '',
      keywords: 'p&l balance sheet income net tax statement',
      action: function () { window.QuoteCraftUtils.goToPage('profit-loss'); }
    },
    {
      id: 'nav-client-statements',
      label: 'Go to Client Statements',
      category: 'Navigation',
      icon: ICONS.statements,
      shortcut: '',
      keywords: 'statements account statement history client pdf',
      action: function () { window.QuoteCraftUtils.goToPage('client-statements'); }
    },
    {
      id: 'nav-settings',
      label: 'Go to Company Profile / Settings',
      category: 'Navigation',
      icon: ICONS.settings,
      shortcut: '',
      keywords: 'company business logo address currency app lock preferences',
      action: function () { window.QuoteCraftUtils.goToPage('settings'); }
    },
    {
      id: 'nav-email-settings',
      label: 'Go to Email Configuration',
      category: 'Navigation',
      icon: ICONS.email,
      shortcut: '',
      keywords: 'smtp mail email sender templates',
      action: function () { window.QuoteCraftUtils.goToPage('email-settings'); }
    },
    {
      id: 'nav-audit-log',
      label: 'Go to Audit Log',
      category: 'Navigation',
      icon: ICONS.audit,
      shortcut: '',
      keywords: 'activity history security changes events log',
      action: function () { window.QuoteCraftUtils.goToPage('audit-log'); }
    },

    // --- Help ---
    {
      id: 'help-shortcuts',
      label: 'Keyboard Shortcuts Reference',
      category: 'Help',
      icon: ICONS.help,
      shortcut: '?',
      keywords: 'keys hotkeys help cheat sheet documentation',
      action: function () {
        window.QuoteCraftUtils.goToPage('settings');
        var card = document.getElementById('shortcutsCard');
        if (card) {
          card.classList.add('shortcuts-highlight');
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(function () { card.classList.remove('shortcuts-highlight'); }, 2600);
        }
      }
    }
  ];

  var overlay = null;
  var input = null;
  var resultsContainer = null;
  var currentFiltered = [];
  var selectedIndex = 0;

  // In-memory cache for deep entity search
  var cachedClients = [];
  var cachedInvoices = [];
  var cachedQuotes = [];
  var cachedProjects = [];
  var isFetchingEntities = false;
  var lastFetchTime = 0;
  var CACHE_TTL_MS = 20000; // 20s TTL

  // Recents Storage
  var RECENTS_KEY = 'qc-cmd-palette-recents';
  var MAX_RECENTS = 6;

  function getRecents() {
    try {
      var raw = localStorage.getItem(RECENTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecents(list) {
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
    } catch (e) {}
  }

  function clearRecents() {
    try {
      localStorage.removeItem(RECENTS_KEY);
    } catch (e) {}
    filterAndRender(input ? input.value : '');
  }

  function addRecent(cmd) {
    if (!cmd || !cmd.id) return;
    var list = getRecents();
    list = list.filter(function (r) { return r.id !== cmd.id; });
    list.unshift({
      id: cmd.id,
      label: cmd.label,
      sub: cmd.sub || '',
      iconKey: cmd.iconKey || (cmd.category ? cmd.category.toLowerCase() : 'clock'),
      badge: cmd.badge || '',
      badgeClass: cmd.badgeClass || '',
      actionType: cmd.actionType || 'command',
      entityId: cmd.entityId || null
    });
    saveRecents(list);
  }

  async function refreshEntitiesCache() {
    if (!window.electronAPI) return;
    if (Date.now() - lastFetchTime < CACHE_TTL_MS && (cachedClients.length || cachedInvoices.length || cachedQuotes.length)) {
      return;
    }
    if (isFetchingEntities) return;
    isFetchingEntities = true;

    try {
      var results = await Promise.allSettled([
        window.electronAPI.listClients ? window.electronAPI.listClients() : Promise.resolve({ ok: false }),
        window.electronAPI.listInvoices ? window.electronAPI.listInvoices() : Promise.resolve({ ok: false }),
        window.electronAPI.listQuotes ? window.electronAPI.listQuotes() : Promise.resolve({ ok: false }),
        window.electronAPI.listProjects ? window.electronAPI.listProjects() : Promise.resolve({ ok: false })
      ]);

      if (results[0].status === 'fulfilled' && results[0].value && results[0].value.ok) {
        cachedClients = results[0].value.clients || [];
      }
      if (results[1].status === 'fulfilled' && results[1].value && results[1].value.ok) {
        cachedInvoices = results[1].value.invoices || [];
      }
      if (results[2].status === 'fulfilled' && results[2].value && results[2].value.ok) {
        cachedQuotes = results[2].value.quotes || [];
      }
      if (results[3].status === 'fulfilled' && results[3].value && results[3].value.ok) {
        cachedProjects = results[3].value.projects || [];
      }
      lastFetchTime = Date.now();

      // If user is currently typing a search query, update the view with fetched entities
      if (input && input.value.trim().length > 0 && overlay && !overlay.classList.contains('hidden')) {
        filterAndRender(input.value);
      }
    } catch (err) {
      console.warn('Error fetching Command Palette entities:', err);
    } finally {
      isFetchingEntities = false;
    }
  }

  function formatMoney(amount, currencyCode) {
    if (window.QuoteCraftUtils && window.QuoteCraftUtils.formatCurrency) {
      return window.QuoteCraftUtils.formatCurrency(amount, currencyCode);
    }
    return (currencyCode || '$') + ' ' + Number(amount || 0).toFixed(2);
  }

  function buildRecentsItems() {
    var rawRecents = getRecents();
    if (!rawRecents || rawRecents.length === 0) return [];
    var items = [];

    for (var i = 0; i < rawRecents.length; i++) {
      var r = rawRecents[i];
      var actionFn = null;

      if (r.actionType === 'command') {
        for (var c = 0; c < COMMANDS.length; c++) {
          if (COMMANDS[c].id === r.id) {
            actionFn = COMMANDS[c].action;
            break;
          }
        }
      } else if (r.actionType === 'invoice') {
        actionFn = (function (id) {
          return function () {
            window.QuoteCraftUtils.goToPage('invoices');
            setTimeout(function () {
              window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: id }));
            }, 50);
          };
        })(r.entityId);
      } else if (r.actionType === 'quote') {
        actionFn = (function (id) {
          return function () {
            window.QuoteCraftUtils.goToPage('quotes');
            setTimeout(function () {
              window.dispatchEvent(new CustomEvent('qc-open-quote', { detail: id }));
            }, 50);
          };
        })(r.entityId);
      } else if (r.actionType === 'client') {
        actionFn = (function (id) {
          return function () {
            window.QuoteCraftUtils.goToPage('clients');
            setTimeout(function () {
              window.dispatchEvent(new CustomEvent('qc-open-client-overview', { detail: id }));
            }, 50);
          };
        })(r.entityId);
      } else if (r.actionType === 'project') {
        actionFn = (function (id) {
          return function () {
            window.QuoteCraftUtils.goToPage('projects');
            setTimeout(function () {
              window.dispatchEvent(new CustomEvent('qc-open-project-overview', { detail: id }));
            }, 50);
          };
        })(r.entityId);
      }

      if (actionFn) {
        items.push({
          id: r.id,
          label: r.label,
          sub: r.sub,
          category: 'Recent',
          icon: ICONS[r.iconKey] || ICONS.clock,
          iconKey: r.iconKey,
          badge: r.badge || 'Recent',
          badgeClass: r.badgeClass || 'cmd-badge-recent',
          actionType: r.actionType,
          entityId: r.entityId,
          action: actionFn
        });
      }
    }
    return items;
  }

  function initElements() {
    overlay = document.getElementById('commandPalette');
    if (!overlay) return false;
    input = document.getElementById('cmdPaletteInput');
    resultsContainer = document.getElementById('cmdPaletteResults');
    var escBtn = document.getElementById('cmdPaletteEsc');

    if (escBtn) {
      escBtn.addEventListener('click', closePalette);
    }

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        closePalette();
      }
    });

    if (input) {
      input.addEventListener('input', function () {
        filterAndRender(input.value);
      });

      input.addEventListener('keydown', handleKeydown);
    }

    return true;
  }

  function scoreCommand(cmd, query) {
    var q = query.toLowerCase().trim();
    if (!q) return 100;

    var labelLower = cmd.label.toLowerCase();
    var catLower = cmd.category.toLowerCase();
    var kwLower = (cmd.keywords || '').toLowerCase();

    // Exact label prefix match is highest score
    if (labelLower.startsWith(q)) return 1000 - (labelLower.length - q.length);

    // Label words startsWith
    var words = labelLower.split(/\s+/);
    for (var i = 0; i < words.length; i++) {
      if (words[i].startsWith(q)) return 800 - i * 10;
    }

    // Label substring
    var idx = labelLower.indexOf(q);
    if (idx !== -1) return 500 - idx;

    // Shortcut exact match
    if (cmd.shortcut && cmd.shortcut.toLowerCase() === q) return 700;

    // Keywords match
    if (kwLower.indexOf(q) !== -1) return 300;

    // Category match
    if (catLower.indexOf(q) !== -1) return 200;

    return -1;
  }

  function filterAndRender(query) {
    query = (query || '').trim();
    selectedIndex = 0;

    if (!query) {
      var recents = buildRecentsItems();
      currentFiltered = recents.concat(COMMANDS);
      renderResults(query);
      return;
    }

    var q = query.toLowerCase();
    var scored = [];

    // 1. Score Commands
    for (var i = 0; i < COMMANDS.length; i++) {
      var cmdScore = scoreCommand(COMMANDS[i], q);
      if (cmdScore > 0) {
        scored.push({ item: COMMANDS[i], score: cmdScore });
      }
    }

    // 2. Score Invoices
    for (var invIdx = 0; invIdx < cachedInvoices.length; invIdx++) {
      var inv = cachedInvoices[invIdx];
      var invNum = String(inv.invoice_number || '').toLowerCase();
      var clientName = String(inv.client_name || '').toLowerCase();
      var status = String(inv.status || '').toLowerCase();
      var invScore = -1;

      if (invNum.startsWith(q)) invScore = 1200;
      else if (invNum.indexOf(q) !== -1) invScore = 950;
      else if (clientName.startsWith(q)) invScore = 900;
      else if (clientName.indexOf(q) !== -1) invScore = 750;
      else if (status.startsWith(q)) invScore = 450;

      if (invScore > 0) {
        var invItem = {
          id: 'inv-' + inv.id,
          label: 'Invoice ' + (inv.invoice_number || '#' + inv.id),
          sub: (inv.client_name || 'No client') + (inv.total !== undefined ? ' · ' + formatMoney(inv.total, inv.currency) : ''),
          category: 'Invoices',
          icon: ICONS.invoices,
          iconKey: 'invoices',
          badge: inv.status || 'draft',
          badgeClass: 'cmd-badge-' + String(inv.status || 'draft').toLowerCase(),
          actionType: 'invoice',
          entityId: inv.id,
          action: (function (id) {
            return function () {
              window.QuoteCraftUtils.goToPage('invoices');
              setTimeout(function () {
                window.dispatchEvent(new CustomEvent('qc-open-invoice', { detail: id }));
              }, 50);
            };
          })(inv.id)
        };
        scored.push({ item: invItem, score: invScore });
      }
    }

    // 3. Score Quotes
    for (var qIdx = 0; qIdx < cachedQuotes.length; qIdx++) {
      var qu = cachedQuotes[qIdx];
      var quoNum = String(qu.quote_number || '').toLowerCase();
      var quClient = String(qu.client_name || '').toLowerCase();
      var quStatus = String(qu.status || '').toLowerCase();
      var quScore = -1;

      if (quoNum.startsWith(q)) quScore = 1200;
      else if (quoNum.indexOf(q) !== -1) quScore = 950;
      else if (quClient.startsWith(q)) quScore = 900;
      else if (quClient.indexOf(q) !== -1) quScore = 750;
      else if (quStatus.startsWith(q)) quScore = 450;

      if (quScore > 0) {
        var quoItem = {
          id: 'quo-' + qu.id,
          label: 'Quote ' + (qu.quote_number || '#' + qu.id),
          sub: (qu.client_name || 'No client') + (qu.total !== undefined ? ' · ' + formatMoney(qu.total, qu.currency) : ''),
          category: 'Quotes',
          icon: ICONS.quotes,
          iconKey: 'quotes',
          badge: qu.status || 'draft',
          badgeClass: 'cmd-badge-' + String(qu.status || 'draft').toLowerCase(),
          actionType: 'quote',
          entityId: qu.id,
          action: (function (id) {
            return function () {
              window.QuoteCraftUtils.goToPage('quotes');
              setTimeout(function () {
                window.dispatchEvent(new CustomEvent('qc-open-quote', { detail: id }));
              }, 50);
            };
          })(qu.id)
        };
        scored.push({ item: quoItem, score: quScore });
      }
    }

    // 4. Score Clients
    for (var cIdx = 0; cIdx < cachedClients.length; cIdx++) {
      var cl = cachedClients[cIdx];
      var clName = String(cl.name || '').toLowerCase();
      var clCompany = String(cl.company || '').toLowerCase();
      var clEmail = String(cl.email || '').toLowerCase();
      var clPhone = String(cl.phone || '').toLowerCase();
      var clScore = -1;

      if (clName.startsWith(q)) clScore = 1100;
      else if (clName.indexOf(q) !== -1) clScore = 900;
      else if (clCompany.startsWith(q)) clScore = 850;
      else if (clCompany.indexOf(q) !== -1) clScore = 750;
      else if (clEmail.indexOf(q) !== -1) clScore = 650;
      else if (clPhone.indexOf(q) !== -1) clScore = 600;

      if (clScore > 0) {
        var clSub = [cl.company, cl.email, cl.phone].filter(Boolean).join(' · ');
        var clientItem = {
          id: 'client-' + cl.id,
          label: cl.name || 'Unnamed Client',
          sub: clSub,
          category: 'Clients',
          icon: ICONS.clients,
          iconKey: 'clients',
          actionType: 'client',
          entityId: cl.id,
          action: (function (id) {
            return function () {
              window.QuoteCraftUtils.goToPage('clients');
              setTimeout(function () {
                window.dispatchEvent(new CustomEvent('qc-open-client-overview', { detail: id }));
              }, 50);
            };
          })(cl.id)
        };
        scored.push({ item: clientItem, score: clScore });
      }
    }

    // 5. Score Projects
    for (var pIdx = 0; pIdx < cachedProjects.length; pIdx++) {
      var pr = cachedProjects[pIdx];
      var prName = String(pr.name || '').toLowerCase();
      var prClient = String(pr.client_name || '').toLowerCase();
      var prScore = -1;

      if (prName.startsWith(q)) prScore = 1000;
      else if (prName.indexOf(q) !== -1) prScore = 850;
      else if (prClient.indexOf(q) !== -1) prScore = 700;

      if (prScore > 0) {
        var projItem = {
          id: 'proj-' + pr.id,
          label: pr.name || 'Untitled Project',
          sub: pr.client_name ? 'Client: ' + pr.client_name : '',
          category: 'Projects',
          icon: ICONS.projects,
          iconKey: 'projects',
          actionType: 'project',
          entityId: pr.id,
          action: (function (id) {
            return function () {
              window.QuoteCraftUtils.goToPage('projects');
              setTimeout(function () {
                window.dispatchEvent(new CustomEvent('qc-open-project-overview', { detail: id }));
              }, 50);
            };
          })(pr.id)
        };
        scored.push({ item: projItem, score: prScore });
      }
    }

    // Sort by score descending
    scored.sort(function (a, b) {
      return b.score - a.score;
    });

    currentFiltered = scored.slice(0, 50).map(function (s) { return s.item; });
    renderResults(query);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightMatch(text, query) {
    if (!text) return '';
    if (!query) return escapeHtml(text);
    var lower = text.toLowerCase();
    var qLower = query.toLowerCase();
    var idx = lower.indexOf(qLower);
    if (idx === -1) return escapeHtml(text);

    var before = text.substring(0, idx);
    var match = text.substring(idx, idx + query.length);
    var after = text.substring(idx + query.length);

    return escapeHtml(before) + '<span class="cmd-item-match">' + escapeHtml(match) + '</span>' + escapeHtml(after);
  }

  function renderResults(query) {
    if (!resultsContainer) return;
    resultsContainer.innerHTML = '';

    if (currentFiltered.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'cmd-empty-results';
      empty.innerHTML =
        '<svg class="cmd-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
        '</svg>' +
        '<div>No matching commands, records, or pages</div>';
      resultsContainer.appendChild(empty);
      return;
    }

    var lastCategory = null;

    currentFiltered.forEach(function (cmd, idx) {
      if (cmd.category !== lastCategory) {
        lastCategory = cmd.category;
        var groupTitle = document.createElement('div');
        groupTitle.className = 'cmd-group-title';

        var titleSpan = document.createElement('span');
        titleSpan.textContent = cmd.category;
        groupTitle.appendChild(titleSpan);

        if (cmd.category === 'Recent') {
          var clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'cmd-group-action';
          clearBtn.textContent = 'Clear';
          clearBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            clearRecents();
          });
          groupTitle.appendChild(clearBtn);
        }

        resultsContainer.appendChild(groupTitle);
      }

      var item = document.createElement('div');
      item.className = 'cmd-item' + (idx === selectedIndex ? ' active' : '');
      item.setAttribute('data-index', String(idx));

      var iconHtml = cmd.icon || '';
      var labelHtml = highlightMatch(cmd.label, query);
      var subHtml = cmd.sub
        ? '<div class="cmd-item-sub">' + highlightMatch(cmd.sub, query) + '</div>'
        : '';
      var badgeHtml = cmd.badge
        ? '<span class="cmd-item-badge ' + (cmd.badgeClass || '') + '">' + escapeHtml(cmd.badge) + '</span>'
        : '';
      var shortcutHtml = cmd.shortcut
        ? '<kbd class="cmd-item-shortcut">' + escapeHtml(cmd.shortcut) + '</kbd>'
        : '';

      item.innerHTML =
        iconHtml +
        '<div class="cmd-item-body">' +
          '<div class="cmd-item-label">' + labelHtml + '</div>' +
          subHtml +
        '</div>' +
        '<div class="cmd-item-meta">' +
          badgeHtml +
          shortcutHtml +
        '</div>';

      item.addEventListener('mouseenter', function () {
        selectedIndex = idx;
        updateActiveItem();
      });

      item.addEventListener('click', function () {
        executeCommand(cmd);
      });

      resultsContainer.appendChild(item);
    });

    scrollActiveIntoView();
  }

  function updateActiveItem() {
    if (!resultsContainer) return;
    var items = resultsContainer.querySelectorAll('.cmd-item');
    items.forEach(function (el, idx) {
      el.classList.toggle('active', idx === selectedIndex);
    });
  }

  function scrollActiveIntoView() {
    if (!resultsContainer) return;
    var activeEl = resultsContainer.querySelector('.cmd-item.active');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function executeCommand(cmd) {
    closePalette();
    try {
      if (cmd) {
        addRecent(cmd);
        if (typeof cmd.action === 'function') {
          cmd.action();
        }
      }
    } catch (err) {
      console.error('Command Palette execution error:', err);
    }
  }

  function handleKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentFiltered.length > 0) {
        selectedIndex = (selectedIndex + 1) % currentFiltered.length;
        updateActiveItem();
        scrollActiveIntoView();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentFiltered.length > 0) {
        selectedIndex = (selectedIndex - 1 + currentFiltered.length) % currentFiltered.length;
        updateActiveItem();
        scrollActiveIntoView();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentFiltered[selectedIndex]) {
        executeCommand(currentFiltered[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    }
  }

  function openPalette() {
    if (!overlay && !initElements()) return;
    overlay.classList.remove('hidden');
    refreshEntitiesCache();
    if (input) {
      input.value = '';
      input.focus();
    }
    filterAndRender('');
  }

  function closePalette() {
    if (!overlay) return;
    overlay.classList.add('hidden');
    if (input) {
      input.blur();
    }
  }

  function togglePalette() {
    if (overlay && !overlay.classList.contains('hidden')) {
      closePalette();
    } else {
      openPalette();
    }
  }

  // Global listener for opening event
  window.addEventListener('qc-open-command-palette', function () {
    openPalette();
  });

  // Global API
  window.QuoteCraftCommandPalette = {
    open: openPalette,
    close: closePalette,
    toggle: togglePalette
  };

  // Initial check when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initElements);
  } else {
    initElements();
  }
})();

