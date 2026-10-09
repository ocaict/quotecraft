const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function runTest(file) {
  return new Promise((resolve) => {
    const start = Date.now();
    const fullPath = path.join(__dirname, file);

    const child = spawn(process.execPath, [fullPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env),
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - start;
      resolve({
        file,
        ok: code === 0,
        code,
        durationMs,
        stdout,
        stderr,
      });
    });
  });
}

async function main() {
  const scriptsDir = __dirname;
  const files = fs
    .readdirSync(scriptsDir)
    .filter((f) => f.startsWith('test-') && f.endsWith('.js'))
    .sort();

  console.log(`\n========================================`);
  console.log(` Running QuoteCraft Test Suite (${files.length} suites)`);
  console.log(`========================================\n`);

  let passed = 0;
  let failed = 0;
  const failures = [];
  const suiteStart = Date.now();

  for (const file of files) {
    const res = await runTest(file);
    const secs = (res.durationMs / 1000).toFixed(2);
    if (res.ok) {
      passed++;
      console.log(` \x1b[32m✔\x1b[0m ${file.padEnd(35)} (${secs}s)`);
    } else {
      failed++;
      console.log(` \x1b[31m✖\x1b[0m ${file.padEnd(35)} (${secs}s) [exit code ${res.code}]`);
      failures.push(res);
    }
  }

  const totalSecs = ((Date.now() - suiteStart) / 1000).toFixed(2);
  console.log(`\n----------------------------------------`);
  console.log(` Results: ${passed} passed, ${failed} failed (${totalSecs}s total)`);
  console.log(`----------------------------------------\n`);

  if (failed > 0) {
    console.log(`\n=== Failure Details ===\n`);
    for (const fail of failures) {
      console.log(`\x1b[31m--- ${fail.file} ---\x1b[0m`);
      if (fail.stdout) console.log(fail.stdout);
      if (fail.stderr) console.error(fail.stderr);
    }
    process.exit(1);
  } else {
    console.log(`\x1b[32mAll test suites passed successfully!\x1b[0m\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
