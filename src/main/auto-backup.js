const fs = require('fs');
const path = require('path');
const {
  getDatabaseBuffer,
  getCompanyProfile,
  getAutoBackupSettings,
  saveAutoBackupSettings,
} = require('./database');
const { buildBackupAttachments } = require('./attachments');

const AUTO_PREFIX = 'quoteCraft-auto-';
const AUTO_EXT = '.json';
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BACKUP_VERSION = 2;

function createBackupPayload(profile) {
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

  // Attachments live on disk, so embed their bytes too — otherwise a restored
  // database would reference files that no longer exist. Version 1 backups had
  // no attachments and still restore (with none).
  const attachmentBackup = buildBackupAttachments();
  return {
    app: 'QuoteCraft',
    magic: 'QUOTECRAFT_BACKUP',
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    database: dbBytes.toString('base64'),
    logo,
    logoFileName,
    attachments: attachmentBackup.files,
    attachmentsMissing: attachmentBackup.missing,
  };
}

function buildAutoBackupFilename(now) {
  const p = (n, len) => String(n).padStart(len, '0');
  const stamp =
    p(now.getFullYear(), 4) +
    p(now.getMonth() + 1, 2) +
    p(now.getDate(), 2) +
    '-' +
    p(now.getHours(), 2) +
    p(now.getMinutes(), 2) +
    p(now.getSeconds(), 2) +
    p(now.getMilliseconds(), 3);
  return AUTO_PREFIX + stamp + AUTO_EXT;
}

function isAutoBackupName(name) {
  return name.startsWith(AUTO_PREFIX) && name.endsWith(AUTO_EXT);
}

function listAutoBackups(folder) {
  if (!folder || !fs.existsSync(folder)) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(folder);
  } catch (e) {
    return [];
  }
  return entries
    .filter((name) => isAutoBackupName(name))
    .map((name) => {
      const full = path.join(folder, name);
      let size = 0;
      let modifiedAt = null;
      try {
        const st = fs.statSync(full);
        size = st.size;
        modifiedAt = st.mtime.toISOString();
      } catch (e) {
        /* skip unreadable */
      }
      return { name, path: full, size, modifiedAt };
    })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function pruneAutoBackups(folder, retainCount) {
  const keep = Math.max(1, parseInt(retainCount, 10) || 7);
  const all = listAutoBackups(folder);
  const toDelete = all.slice(0, Math.max(0, all.length - keep));
  let deleted = 0;
  for (const item of toDelete) {
    try {
      fs.unlinkSync(item.path);
      deleted++;
    } catch (e) {
      /* skip locked files */
    }
  }
  return deleted;
}

function writeAutoBackup({ folder, retainCount, now }) {
  if (!folder || !String(folder).trim()) {
    return { ok: false, error: 'No backup folder is configured.' };
  }
  try {
    fs.mkdirSync(folder, { recursive: true });
    const payload = createBackupPayload(getCompanyProfile());
    const filePath = path.join(folder, buildAutoBackupFilename(now || new Date()));
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    pruneAutoBackups(folder, retainCount);
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function runNow() {
  const settings = getAutoBackupSettings();
  if (!settings.folder) {
    return { ok: false, error: 'Choose a folder to store automatic backups first.' };
  }
  const res = writeAutoBackup({ folder: settings.folder, retainCount: settings.retainCount });
  if (res.ok) {
    saveAutoBackupSettings({
      enabled: settings.enabled,
      schedule: settings.schedule,
      folder: settings.folder,
      retainCount: settings.retainCount,
      lastBackupAt: new Date().toISOString(),
    });
  }
  return res;
}

function runDailyIfDue(now) {
  const settings = getAutoBackupSettings();
  if (!settings.enabled) return { ok: true, skipped: 'disabled' };
  if (settings.schedule !== 'daily') return { ok: true, skipped: 'off' };
  if (!settings.folder) return { ok: false, error: 'No backup folder is configured.' };

  const reference = now || new Date();
  let lastTs = 0;
  if (settings.lastBackupAt) {
    lastTs = Date.parse(settings.lastBackupAt) || 0;
  }
  if (lastTs && reference.getTime() - lastTs < DAILY_INTERVAL_MS) {
    return { ok: true, skipped: 'recent' };
  }

  const res = writeAutoBackup({ folder: settings.folder, retainCount: settings.retainCount, now: reference });
  if (!res.ok) return res;
  saveAutoBackupSettings({
    enabled: settings.enabled,
    schedule: settings.schedule,
    folder: settings.folder,
    retainCount: settings.retainCount,
    lastBackupAt: reference.toISOString(),
  });
  return { ok: true, skipped: false, path: res.path };
}

function runOnCloseIfEnabled() {
  const settings = getAutoBackupSettings();
  if (!settings.enabled) return { ok: true, skipped: 'disabled' };
  if (settings.schedule !== 'on_close') return { ok: true, skipped: 'off' };
  if (!settings.folder) return { ok: false, error: 'No backup folder is configured.' };
  return writeAutoBackup({ folder: settings.folder, retainCount: settings.retainCount });
}

let schedulerTimer = null;

function startAutoBackupScheduler() {
  if (schedulerTimer) return;
  const tick = () => {
    try {
      runDailyIfDue();
    } catch (e) {
      /* silent: never surface background errors */
    }
  };
  setTimeout(tick, 30 * 1000);
  schedulerTimer = setInterval(tick, 15 * 60 * 1000);
  if (schedulerTimer.unref) schedulerTimer.unref();
}

function stopAutoBackupScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

module.exports = {
  AUTO_PREFIX,
  createBackupPayload,
  buildAutoBackupFilename,
  listAutoBackups,
  pruneAutoBackups,
  writeAutoBackup,
  runNow,
  runDailyIfDue,
  runOnCloseIfEnabled,
  startAutoBackupScheduler,
  stopAutoBackupScheduler,
};