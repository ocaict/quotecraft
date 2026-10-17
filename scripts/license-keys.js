/**
 * license-keys.js — Ed25519 key loading for the vendor tooling.
 *
 * Resolution order for the PRIVATE key:
 *   1. env QC_LICENSE_PRIVATE_KEY  (PEM, either real newlines or literal "\n")
 *   2. file scripts/.license-private-key.pem   (gitignored)
 *   3. DEV fallback keypair (committed, dev-only — rotate before production)
 *
 * The DEV public key is embedded in src/main/license-public-key.js so the app can
 * verify tokens produced by this tooling out of the box.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// DEV-ONLY keypair. Scripts are never packaged into the installer (build.files is
// src/** + package.json), but rotate for production via env QC_LICENSE_PRIVATE_KEY.
const DEV_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIHqE0SnR6rMoBr4biI7KErngMuXONykLBh+hSouo8e28
-----END PRIVATE KEY-----
`;

const PRIVATE_KEY_FILE = path.join(__dirname, '.license-private-key.pem');

function normalizePem(value) {
  if (!value) return null;
  return String(value).replace(/\\n/g, '\n').trim() + '\n';
}

function getPrivateKeyPem() {
  const fromEnv = normalizePem(process.env.QC_LICENSE_PRIVATE_KEY);
  if (fromEnv) return fromEnv;

  if (fs.existsSync(PRIVATE_KEY_FILE)) {
    return fs.readFileSync(PRIVATE_KEY_FILE, 'utf8');
  }

  return DEV_PRIVATE_KEY_PEM;
}

function getPublicKeyPem() {
  const priv = crypto.createPrivateKey(getPrivateKeyPem());
  return crypto.createPublicKey(priv)
    .export({ type: 'spki', format: 'pem' });
}

/** True when the DEV fallback private key is in use (i.e. no env/file override). */
function isUsingDevKey() {
  if (normalizePem(process.env.QC_LICENSE_PRIVATE_KEY)) return false;
  return !fs.existsSync(PRIVATE_KEY_FILE);
}

module.exports = {
  getPrivateKeyPem,
  getPublicKeyPem,
  isUsingDevKey,
  PRIVATE_KEY_FILE,
};
