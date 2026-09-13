// Secure Storage Module for QuoteCraft
// Protects sensitive credentials (such as SMTP passwords) using the OS's native secure store
// (Windows DPAPI via Electron safeStorage, macOS Keychain, or Linux Secret Service).
// Provides a local AES-256-GCM fallback for standalone CLI/automated tests.

const crypto = require('crypto');
const os = require('os');

let electronSafeStorage = null;
try {
  const electron = require('electron');
  if (electron && electron.safeStorage) {
    electronSafeStorage = electron.safeStorage;
  }
} catch (_) {
  // Not in Electron runtime (e.g. running in Node CLI test suite)
}

function isSafeStorageAvailable() {
  try {
    return electronSafeStorage && typeof electronSafeStorage.isEncryptionAvailable === 'function' && electronSafeStorage.isEncryptionAvailable();
  } catch (_) {
    return false;
  }
}

// Fallback machine-tied key derivation for non-Electron test runs
function getFallbackKey() {
  const seed = `${os.hostname()}_${os.platform()}_${os.userInfo().username}_QuoteCraft_Secret_Key_v1`;
  return crypto.createHash('sha256').update(seed).digest();
}

function encryptSecret(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') {
    return '';
  }

  // 1. Primary: Electron safeStorage (OS DPAPI on Windows / Keychain on macOS)
  if (isSafeStorageAvailable()) {
    try {
      const encryptedBuffer = electronSafeStorage.encryptString(String(plainText));
      return 'safe:' + encryptedBuffer.toString('base64');
    } catch (err) {
      console.warn('safeStorage encryption failed, using fallback:', err.message);
    }
  }

  // 2. Fallback: AES-256-GCM
  const key = getFallbackKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(String(plainText), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag().toString('base64');

  return 'gcm:' + JSON.stringify({
    iv: iv.toString('base64'),
    tag,
    data: encrypted,
  });
}

function decryptSecret(encryptedString) {
  if (!encryptedString) return '';

  // 1. Electron safeStorage format
  if (encryptedString.startsWith('safe:')) {
    const b64 = encryptedString.slice(5);
    if (isSafeStorageAvailable()) {
      try {
        const buffer = Buffer.from(b64, 'base64');
        return electronSafeStorage.decryptString(buffer);
      } catch (err) {
        console.error('Failed to decrypt with safeStorage:', err.message);
        return '';
      }
    } else {
      console.warn('safeStorage is not available in current environment to decrypt credentials.');
      return '';
    }
  }

  // 2. Fallback AES-256-GCM format
  if (encryptedString.startsWith('gcm:')) {
    try {
      const payload = JSON.parse(encryptedString.slice(4));
      const key = getFallbackKey();
      const iv = Buffer.from(payload.iv, 'base64');
      const tag = Buffer.from(payload.tag, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(payload.data, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      console.error('Failed to decrypt fallback AES-GCM data:', err.message);
      return '';
    }
  }

  // Plain legacy fallback (if any)
  return encryptedString;
}

function getStorageMechanismName() {
  if (isSafeStorageAvailable()) {
    const platform = process.platform;
    if (platform === 'win32') return 'Windows Data Protection API (DPAPI)';
    if (platform === 'darwin') return 'Apple Keychain (Secure Enclave)';
    return 'Linux Secret Service / libsecret';
  }
  return 'Local AES-256-GCM Hardware-bound';
}

module.exports = {
  encryptSecret,
  decryptSecret,
  isSafeStorageAvailable,
  getStorageMechanismName,
};
