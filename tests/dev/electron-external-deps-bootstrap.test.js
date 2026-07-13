const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const bootstrapPath = path.join(repoRoot, 'scripts', 'electron-external-deps-bootstrap.js');
const dependencyRoot = process.env.ENTERPRISE_POS_TEST_EXTERNAL_NODE_MODULES
  || 'D:\\Enterprise-POS-Billing-Receipt\\node_modules';

test('external dependency bootstrap resolves modules from the configured dependency root', () => {
  const result = spawnSync(process.execPath, [
    '-e',
    [
      `require(${JSON.stringify(bootstrapPath)});`,
      'const dotenv = require.resolve("dotenv");',
      'const pg = require.resolve("pg");',
      'console.log(JSON.stringify({ dotenv, pg }));',
    ].join(''),
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ENTERPRISE_POS_EXTERNAL_NODE_MODULES: dependencyRoot,
    },
    encoding: 'utf8',
  });

  assert.strictEqual(result.status, 0, result.stderr);

  const resolved = JSON.parse(result.stdout.trim());
  const expectedRoot = path.resolve(dependencyRoot).toLowerCase();

  assert.ok(resolved.dotenv.toLowerCase().startsWith(expectedRoot), resolved.dotenv);
  assert.ok(resolved.pg.toLowerCase().startsWith(expectedRoot), resolved.pg);
});
