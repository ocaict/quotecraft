const assert = require('assert');
const path = require('path');
const fs = require('fs');

const logger = require('../src/main/logger');
const updater = require('../src/main/updater');
const pkg = require('../package.json');

async function runStage1Tests() {
  console.log('=== Starting Stage 1 Unit Tests: Packaging, Logging & Auto-Updates ===\n');

  // 1. Package Configuration Validation
  console.log('--- Testing package.json Build & Update Configurations ---');
  assert(pkg.build, 'package.json must contain build configuration');
  assert(pkg.build.asar === true, 'build.asar must be true');
  assert(Array.isArray(pkg.build.asarUnpack), 'build.asarUnpack must be an array');
  assert(pkg.build.asarUnpack.includes('**/*.wasm'), 'build.asarUnpack must include **/*.wasm');
  assert(pkg.build.publish, 'build.publish must be configured');
  assert.strictEqual(pkg.build.publish.provider, 'github', 'build.publish.provider must be github');
  console.log('✓ ASAR unpack (.wasm) and update publish settings verified.');

  // 2. Logger Module Verification
  console.log('\n--- Testing Logger Module ---');
  logger.info('Test stage 1 info message');
  logger.warn('Test stage 1 warning message');
  logger.error('Test stage 1 error message');

  const logPath = logger.getLogFilePath();
  assert(typeof logPath === 'string' && logPath.length > 0, 'Log file path must be non-empty string');
  console.log(`✓ Log file path resolved: ${logPath}`);

  // Test log export
  const tempExportPath = path.join(__dirname, `test-export-${Date.now()}.log`);
  // Ensure log directory and a dummy log entry exist for test
  const logDir = path.dirname(logPath);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(logPath, '[TEST] Unit test log entry\n');

  const exportRes = logger.exportLogs(tempExportPath);
  assert.strictEqual(exportRes.ok, true, 'exportLogs should succeed');
  assert(fs.existsSync(tempExportPath), 'Exported file must exist on disk');
  const exportedContent = fs.readFileSync(tempExportPath, 'utf8');
  assert(exportedContent.includes('[TEST] Unit test log entry'), 'Exported log must match log content');
  fs.unlinkSync(tempExportPath);
  console.log('✓ Log export to external destination verified.');

  const recentLogs = logger.getRecentLogs(50);
  assert(typeof recentLogs === 'string', 'getRecentLogs should return string');
  assert(recentLogs.length > 0, 'Recent logs should not be empty');
  console.log('✓ Recent logs reader verified.');

  // 3. Auto-Updater Module Verification
  console.log('\n--- Testing Auto-Updater Module ---');
  const initialStatus = updater.getStatus();
  assert(initialStatus, 'getStatus must return an object');
  assert(['idle', 'not-available', 'checking'].includes(initialStatus.status), 'Initial status must be valid');
  console.log(`✓ Auto-updater status verified (initial state: ${initialStatus.status})`);

  const checkRes = await updater.checkForUpdates(false);
  assert(checkRes.ok, 'checkForUpdates should return ok: true');
  console.log('✓ Non-packaged dev environment handled safely without crash.');

  console.log('\n========================================');
  console.log(' ALL STAGE 1 UNIT TESTS PASSED (100%)');
  console.log('========================================');
}

runStage1Tests().catch((err) => {
  console.error('Stage 1 test failure:', err);
  process.exit(1);
});
