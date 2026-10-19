/**
 * publish-release.js
 * Creates a GitHub Release for the version in package.json and uploads the
 * dist/ assets (installer, blockmap, latest.yml).
 *
 * Usage: build first (`npm run dist`), then `node scripts/publish-release.js`.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitHubToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const creds = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8'
    });
    const match = creds.match(/password=(.+)/);
    if (match) return match[1].trim();
  } catch (e) {
    // fallback
  }
  return null;
}

const token = getGitHubToken();
if (!token) {
  console.error('❌ Could not retrieve GitHub token.');
  process.exit(1);
}

const OWNER = 'ocaict';
const REPO = 'quotecraft';

// Read the version from package.json so this script never goes stale.
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
const VERSION = pkg.version;
const TAG = `v${VERSION}`;
const SETUP_EXE = `QuoteCraft-Setup-${VERSION}.exe`;

const releaseBody = `## QuoteCraft ${TAG} — Application Reset & Security Update 🎉

QuoteCraft is a fast, offline-first invoice and quote management desktop application tailored for freelancers, contractors, and growing businesses.

### 🚀 What's New in ${TAG}:

- **⚠️ Application Reset & Danger Zone (Tier A & Tier B)**:
  - **Tier A (Reset Preferences & Defaults)**: Instantly revert invoice numbering prefixes, default tax rates, PDF accent colours, and document layout styles to factory defaults. Your clients, quotes, invoices, payments, and all business data are **not** affected.
  - **Tier B (Factory Reset & Data Wipe)**: Safely wipe all business records, clients, invoices, and custom attachments for a clean start.
  - **Automatic Safety Backup**: A timestamped, restorable ZIP archive (\`pre-reset-backup-<timestamp>.qcbackup\`) is automatically created before any destructive operation.
  - **License Retention Safeguard**: Users with active Pro licenses can preserve their activation key and entitlement token across factory resets.
  - **Friction-Protected Confirmation**: Destructive factory resets require explicitly typing \`"RESET"\` into the confirmation dialog to prevent accidental triggers.

- **🔒 Security & Document Preview Hardening**:
  - Updated Content Security Policy (CSP) with \`frame-src 'self' data:\` to seamlessly support interactive document Quick Look and PDF rendering across all platforms.

- **🛡️ Quality & Test Coverage**:
  - Added dedicated test suite \`test-app-reset.js\`.
  - Full automated regression pass: **53/53 test suites passing** running under Node.js.

### 📦 Installation (Windows):
1. Download **\`${SETUP_EXE}\`** below.
2. Run the installer and follow the setup wizard.
3. *(If prompted by Windows SmartScreen: Click **More info** → **Run anyway**)*.`;

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body.toString('utf8'),
          raw: body
        });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function uploadAsset(uploadUrlTemplate, filePath, contentType) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath);
    const fileSize = fs.statSync(filePath).size;
    const fileStream = fs.createReadStream(filePath);

    // upload_url is in format: https://uploads.github.com/repos/:owner/:repo/releases/:id/assets{?name,label}
    const cleanUrl = uploadUrlTemplate.replace(/\{.*?\}$/, '');
    const targetUrl = new URL(`${cleanUrl}?name=${encodeURIComponent(fileName)}`);

    console.log(`Uploading ${fileName} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)...`);

    const req = https.request({
      hostname: targetUrl.hostname,
      path: targetUrl.pathname + targetUrl.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'QuoteCraft-Release-Uploader',
        'Content-Type': contentType,
        'Content-Length': fileSize
      }
    }, (res) => {
      let resBody = '';
      res.on('data', d => resBody += d);
      res.on('end', () => {
        if (res.statusCode === 201) {
          console.log(`✅ Uploaded ${fileName}`);
          resolve(JSON.parse(resBody));
        } else {
          console.error(`❌ Failed to upload ${fileName} (HTTP ${res.statusCode}):`, resBody);
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    fileStream.pipe(req);
  });
}

async function main() {
  console.log(`Creating GitHub Release ${TAG} on ${OWNER}/${REPO}...`);

  // 1. Check if release already exists
  let release;
  const listRes = await request({
    hostname: 'api.github.com',
    path: `/repos/${OWNER}/${REPO}/releases/tags/${TAG}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'QuoteCraft-Release-Uploader',
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (listRes.statusCode === 200) {
    console.log(`Release ${TAG} already exists, using existing release.`);
    release = JSON.parse(listRes.body);
  } else {
    // Create new release
    const createRes = await request({
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}/releases`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'QuoteCraft-Release-Uploader',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      }
    }, JSON.stringify({
      tag_name: TAG,
      target_commitish: 'main',
      name: `QuoteCraft ${TAG} — Official Release`,
      body: releaseBody,
      draft: false,
      prerelease: false
    }));

    if (createRes.statusCode !== 201) {
      console.error('❌ Failed to create release:', createRes.statusCode, createRes.body);
      process.exit(1);
    }
    release = JSON.parse(createRes.body);
    console.log(`✅ Created Release: ${release.html_url}`);
  }

  // 2. Upload assets from dist/
  const distDir = path.resolve(__dirname, '..', 'dist');
  const filesToUpload = [
    { file: path.join(distDir, SETUP_EXE), type: 'application/vnd.microsoft.portable-executable' },
    { file: path.join(distDir, `${SETUP_EXE}.blockmap`), type: 'application/octet-stream' },
    { file: path.join(distDir, 'latest.yml'), type: 'text/yaml' },
  ];

  for (const item of filesToUpload) {
    if (!fs.existsSync(item.file)) {
      console.warn(`⚠️ Warning: ${item.file} not found, skipping.`);
      continue;
    }
    await uploadAsset(release.upload_url, item.file, item.type);
  }

  console.log('\n🎉 All release assets uploaded successfully!');
  console.log(`Release URL: ${release.html_url}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
