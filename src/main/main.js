const { app, BrowserWindow } = require('electron');
const path = require('path');

// Pin all user data (SQLite DB, logo, backups) to %APPDATA%\quotecraft.
// Uses the lowercase folder in both dev and packaged builds so data survives
// installs/uninstalls and is never stored inside the install directory.
app.setPath('userData', path.join(app.getPath('appData'), 'quotecraft'));

const { initializeDatabase, closeDatabase } = require('./database');
const { registerIpcHandlers } = require('./ipc-handlers');

let mainWindow = null;

async function createWindow() {
  const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'icons', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'QuoteCraft',
    icon: iconPath,
    backgroundColor: '#0f1117',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await initializeDatabase();
  registerIpcHandlers();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
