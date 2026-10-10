// Structured Application Logger for QuoteCraft
// Wraps electron-log with automated file rotation, crash recording, and log export utilities.

const path = require('path');
const fs = require('fs');
let log = null;

try {
  log = require('electron-log');
} catch (e) {
  // Fallback console logger if electron-log is unavailable
  log = {
    info: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
    transports: {
      file: {
        getFile: () => ({ path: '' }),
      },
    },
  };
}

let app = null;
try {
  const electron = require('electron');
  if (electron && electron.app) {
    app = electron.app;
  }
} catch (_) {}

function getLogDir() {
  if (app && typeof app.getPath === 'function') {
    return path.join(app.getPath('userData'), 'logs');
  }
  return path.join(__dirname, '../../data/logs');
}

function getLogFilePath() {
  return path.join(getLogDir(), 'quotecraft.log');
}

// Configure log file transport if electron-log is loaded
if (log && log.transports && log.transports.file) {
  try {
    const logDir = getLogDir();
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    log.transports.file.resolvePathFn = () => getLogFilePath();
    log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB per file
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
    
    // Set level based on environment
    const isDev = process.env.NODE_ENV === 'development' || !app || (app && !app.isPackaged);
    log.transports.file.level = 'info';
    if (log.transports.console) {
      log.transports.console.level = isDev ? 'debug' : 'info';
    }

    // Start catching uncaught errors automatically if available
    if (log.errorHandler && typeof log.errorHandler.startCatching === 'function') {
      log.errorHandler.startCatching({
        showDialog: false,
        onError({ error }) {
          log.error('[QuoteCraft Process Crash]', error);
        },
      });
    }
  } catch (err) {
    console.error('Failed to configure electron-log transports:', err);
  }
}

function info(...args) {
  log.info(...args);
}

function warn(...args) {
  log.warn(...args);
}

function error(...args) {
  log.error(...args);
}

function debug(...args) {
  log.debug(...args);
}

function exportLogs(destPath) {
  const sourcePath = getLogFilePath();
  if (!fs.existsSync(sourcePath)) {
    return { ok: false, error: 'Log file not found.' };
  }
  try {
    fs.copyFileSync(sourcePath, destPath);
    return { ok: true, path: destPath };
  } catch (err) {
    log.error('Failed to export logs:', err);
    return { ok: false, error: err.message };
  }
}

function getRecentLogs(maxLines = 200) {
  const logFile = getLogFilePath();
  if (!fs.existsSync(logFile)) {
    return '';
  }
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n');
    return lines.slice(-maxLines).join('\n');
  } catch (err) {
    return `Error reading logs: ${err.message}`;
  }
}

module.exports = {
  info,
  warn,
  error,
  debug,
  getLogDir,
  getLogFilePath,
  exportLogs,
  getRecentLogs,
  raw: log,
};
