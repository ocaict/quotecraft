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

const releaseBody = `## QuoteCraft ${TAG} — Official Release 🎉

QuoteCraft is a fast, offline-first invoice and quote management desktop application tailored for freelancers, contractors, and growing businesses.

### 🚀 What's New in ${TAG}:
- **Modern Auto-Hide Menu Bar**: The menu bar on Windows/Linux now automatically hides for a clean, distraction-free interface (press **Alt** to toggle), while preserving full native macOS application menus.
- **Global Keyboard Shortcuts & Navigation**: Fast shortcuts for document creation (**Ctrl+N** for quotes, **Ctrl+Shift+N** for invoices, **Ctrl+Shift+C** for clients), quick search (**Ctrl+F**), and direct view navigation.
- **Redesigned About Window**: Replaced legacy OS dialogs with a native, themed in-app modal featuring real-time environment diagnostics, SQLite/WASM engine integrity, local storage directory viewer, copy system info tool, and dynamic license tier status.
- **License Key Display & Wrap Fix**: Fixed license serial key text overflow on high-resolution displays and compact panes with responsive word-breaking.
- **Performance & Polish**: Refined dark and light mode aesthetics, card styling, and overall desktop responsiveness.

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
