const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

// Pin all user data (SQLite DB, logo, backups) to %APPDATA%\quotecraft.
// Uses the lowercase folder in both dev and packaged builds so data survives
// installs/uninstalls and is never stored inside the install directory.
app.setPath('userData', path.join(app.getPath('appData'), 'quotecraft'));

// Single Instance Lock: prevents two app instances from corrupting the SQLite file.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

const logger = require('./logger');
const { initializeDatabase, closeDatabase } = require('./database');
const { registerIpcHandlers } = require('./ipc-handlers');
const { startAutoBackupScheduler, stopAutoBackupScheduler, runOnCloseIfEnabled } = require('./auto-backup');
const { loadWindowState, trackWindowState } = require('./window-state');
const { buildAppMenu } = require('./menu');
const { setupTray, destroyTray } = require('./tray');
const { initUpdater } = require('./updater');

let mainWindow = null;

logger.info(`[QuoteCraft] Starting application (v${app.getVersion()}). Platform: ${process.platform}`);

// Catch unhandled errors gracefully in production
process.on('uncaughtException', (err) => {
  logger.error('[QuoteCraft Process Uncaught Exception]', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('[QuoteCraft Process Unhandled Rejection]', reason);
});

async function createWindow() {
  const iconPath = path.join(__dirname, '..', 'renderer', 'assets', 'icons', 'icon.png');
  const windowState = loadWindowState({ width: 1280, height: 800 });

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
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

  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  trackWindowState(mainWindow);

  // Security: Harden external navigation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
        shell.openExternal(url);
      }
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

if (gotTheLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await initializeDatabase();
    registerIpcHandlers();
    await createWindow();
    initUpdater(mainWindow);

    Menu.setApplicationMenu(buildAppMenu(mainWindow));
    setupTray(mainWindow);

    startAutoBackupScheduler();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('before-quit', () => {
  destroyTray();
  stopAutoBackupScheduler();
  try {
    runOnCloseIfEnabled();
  } catch (e) {
    /* silent: a failed backup must never block quitting */
  }
  closeDatabase();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
