/**
 * test-worker-activation.js — Phase 2 Worker activation, deactivation & durable store test.
 *
 * Runs as part of `npm test` / `node scripts/run-all-tests.js`.
 * Delegates to tools/quotecraft-license-worker/test/test-activation-flow.js.
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const assert = require('assert');

const testFile = path.join(__dirname, '..', 'tools', 'quotecraft-license-worker', 'test', 'test-activation-flow.js');

const res = spawnSync(process.execPath, [testFile], {
  stdio: 'inherit',
  env: Object.assign({}, process.env),
});

assert.strictEqual(res.status, 0, 'Worker activation flow test failed');
