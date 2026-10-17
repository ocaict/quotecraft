// Auto-Updater Module for QuoteCraft
// Handles checking for updates, downloading in background, and notifying the user.

const logger = require('./logger');

let autoUpdater = null;
let mainWindow = null;
let updateStatus = {
  status: 'idle', // 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version: null,
  releaseNotes: null,
  progress: 0,
  error: null,
};

function getAutoUpdater() {
  if (autoUpdater) return autoUpdater;
  try {
    const electron = require('electron');
    if (electron && electron.app) {
      const updaterModule = require('electron-updater');
      autoUpdater = updaterModule.autoUpdater;
      autoUpdater.logger = logger.raw;
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;
    }
  } catch (err) {
    logger.warn('[AutoUpdater] Failed to initialize electron-updater:', err.message);
  }
  return autoUpdater;
}

function sendToWindow(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    try {
      mainWindow.webContents.send(channel, { currentVersion: getAppVersion(), ...data });
    } catch (_) {}
  }
}

function getAppVersion() {
  try {
    const electron = require('electron');
    if (electron && electron.app) return electron.app.getVersion();
  } catch (_) {}
  return null;
}

function initUpdater(window) {
  mainWindow = window;
  const updater = getAutoUpdater();
  if (!updater) return;

  updater.on('checking-for-update', () => {
    logger.info('[AutoUpdater] Checking for updates...');
    updateStatus.status = 'checking';
    sendToWindow('updater:status', updateStatus);
  });

  updater.on('update-available', (info) => {
    logger.info('[AutoUpdater] Update available:', info.version);
    updateStatus = {
      status: 'available',
      version: info.version,
      releaseNotes: info.releaseNotes || '',
      progress: 0,
      error: null,
    };
    sendToWindow('updater:status', updateStatus);
  });

  updater.on('update-not-available', (info) => {
    logger.info('[AutoUpdater] App is up to date.');
    updateStatus = {
      status: 'not-available',
      version: info ? info.version : null,
      releaseNotes: null,
      progress: 100,
      error: null,
    };
    sendToWindow('updater:status', updateStatus);
  });

  updater.on('error', (err) => {
    logger.error('[AutoUpdater] Error checking/downloading update:', err);
    updateStatus = {
      status: 'error',
      version: null,
      releaseNotes: null,
      progress: 0,
      error: err ? err.message : 'Unknown updater error',
    };
    sendToWindow('updater:status', updateStatus);
  });

  updater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent || 0);
    logger.debug(`[AutoUpdater] Download progress: ${percent}%`);
    updateStatus.status = 'downloading';
    updateStatus.progress = percent;
    sendToWindow('updater:status', updateStatus);
  });

  updater.on('update-downloaded', (info) => {
    logger.info('[AutoUpdater] Update downloaded:', info.version);
    updateStatus = {
      status: 'downloaded',
      version: info.version,
      releaseNotes: info.releaseNotes || '',
      progress: 100,
      error: null,
    };
    sendToWindow('updater:status', updateStatus);
  });

  // Check for updates on startup if packaged
  const electron = require('electron');
  if (electron.app && electron.app.isPackaged) {
    setTimeout(() => {
      checkForUpdates(false);
    }, 5000);
  }
}

async function checkForUpdates(manual = false) {
  let isPackaged = false;
  let currentVersion = getAppVersion();
  try {
    const electron = require('electron');
    if (electron && electron.app) {
      isPackaged = Boolean(electron.app.isPackaged);
    }
  } catch (_) {}

  if (!isPackaged) {
    logger.info('[AutoUpdater] Skipping update check in development/test environment.');
    updateStatus = {
      status: 'not-available',
      version: currentVersion,
      progress: 100,
      error: null,
      isDev: true,
    };
    sendToWindow('updater:status', updateStatus);
    return { ok: true, isDev: true, message: 'Running in development or test environment; updates disabled.' };
  }

  const updater = getAutoUpdater();
  if (!updater) {
    return { ok: false, error: 'Auto-updater not available in current environment.' };
  }

  try {
    logger.info(`[AutoUpdater] Manual check: ${manual}`);
    await updater.checkForUpdates();
    return { ok: true, status: updateStatus };
  } catch (err) {
    logger.error('[AutoUpdater] checkForUpdates error:', err);
    return { ok: false, error: err.message };
  }
}

function quitAndInstall() {
  const updater = getAutoUpdater();
  if (updater) {
    logger.info('[AutoUpdater] Quitting and installing update...');
    updater.quitAndInstall();
  }
}

function getStatus() {
  return { ...updateStatus, currentVersion: getAppVersion() };
}

module.exports = {
  initUpdater,
  checkForUpdates,
  quitAndInstall,
  getStatus,
};
