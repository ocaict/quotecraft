const { Menu, app, shell, dialog } = require('electron');
const path = require('path');

function buildAppMenu(mainWindow) {
  const isMac = process.platform === 'darwin';
  const isDev = !app.isPackaged;
  const version = app.getVersion();

  const sendNavigate = (page, subtab = null, action = null) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('menu:navigate', { page, subtab, action });
    }
  };

  const sendAction = (action, payload = null) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('menu:action', action, payload);
    }
  };

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              {
                label: 'Preferences…',
                accelerator: 'CmdOrCtrl+,',
                click: () => sendNavigate('settings', 'profile'),
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Quote',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendNavigate('quotes', null, 'new-quote'),
        },
        {
          label: 'New Invoice',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => sendNavigate('invoices', null, 'new-invoice'),
        },
        {
          label: 'New Client',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => sendNavigate('clients', null, 'new-client'),
        },
        { type: 'separator' },
        {
          label: 'Command Palette…',
          accelerator: 'CmdOrCtrl+K',
          click: () => sendAction('command-palette'),
        },
        ...(!isMac
          ? [
              {
                label: 'Settings…',
                accelerator: 'CmdOrCtrl+,',
                click: () => sendNavigate('settings', 'profile'),
              },
            ]
          : []),
        {
          label: 'Export Backup…',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => sendNavigate('settings', 'backup'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', accelerator: 'CmdOrCtrl+Q' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Quick Search',
          accelerator: 'CmdOrCtrl+F',
          click: () => sendAction('quick-search'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => sendNavigate('dashboard'),
        },
        {
          label: 'Quotes',
          accelerator: 'CmdOrCtrl+2',
          click: () => sendNavigate('quotes'),
        },
        {
          label: 'Invoices',
          accelerator: 'CmdOrCtrl+3',
          click: () => sendNavigate('invoices'),
        },
        {
          label: 'Clients',
          accelerator: 'CmdOrCtrl+4',
          click: () => sendNavigate('clients'),
        },
        {
          label: 'Revenue Report',
          accelerator: 'CmdOrCtrl+5',
          click: () => sendNavigate('revenue-report'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Dark / Light Theme',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => sendAction('toggle-theme'),
        },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev
          ? [
              { type: 'separator' },
              { role: 'reload' },
              { role: 'forceReload' },
              { role: 'toggleDevTools' },
            ]
          : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
          : [{ role: 'close' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts Reference',
          accelerator: 'CmdOrCtrl+/',
          click: () => sendNavigate('settings', 'shortcuts'),
        },
        {
          label: 'Check for Software Updates…',
          click: () => sendNavigate('settings', 'updates'),
        },
        {
          label: 'QuoteCraft Pro License…',
          click: () => sendNavigate('settings', 'license'),
        },
        {
          label: 'System Diagnostics & Health…',
          click: () => sendNavigate('settings', 'diagnostics'),
        },
        { type: 'separator' },
        {
          label: 'Documentation & Guides',
          click: async () => {
            await shell.openExternal('https://github.com/ocaict/quotecraft');
          },
        },
        {
          label: 'About QuoteCraft',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About QuoteCraft',
              message: `QuoteCraft v${version}`,
              detail: `Professional quote, invoice, expense, and time tracking management for freelancers and small businesses.\n\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\nChrome: ${process.versions.chrome}`,
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = {
  buildAppMenu,
};

