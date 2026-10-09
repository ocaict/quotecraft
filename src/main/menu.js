const { Menu, app, shell, dialog } = require('electron');
const path = require('path');

function buildAppMenu(mainWindow) {
  const isMac = process.platform === 'darwin';
  const version = app.getVersion();

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
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
          label: 'Export Backup',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('menu:navigate', 'settings');
            }
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
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
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
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
          label: 'QuoteCraft Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/ocaict/quotecraft');
          },
        },
        { type: 'separator' },
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
