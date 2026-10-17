/**
 * license-public-key.js — Embedded Ed25519 PUBLIC key for entitlement verification.
 *
 * This is the ONLY signing material that ships inside the desktop app. It can verify
 * entitlement tokens but cannot create them, so a leaked copy cannot mint licenses.
 *
 * NOTE: the value below is the DEV keypair's public half. Rotate for production by
 * setting QC_LICENSE_PRIVATE_KEY on the Worker and replacing this PEM with the
 * matching public key (`node scripts/generate-license.js --print-public-key`).
 */

'use strict';

const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA23GGnTyS9KuyzQZuW2XVdHcyUL0m8T3QQCw3P6CUVzM=
-----END PUBLIC KEY-----
`;

module.exports = { LICENSE_PUBLIC_KEY_PEM };
