const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Electron e2e certification command and dependencies are declared', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['test:e2e'], 'playwright test --config=playwright.config.ts');
  assert.equal(pkg.scripts['test:e2e:electron'], 'npm run test:e2e');
  assert.ok(pkg.devDependencies['@playwright/test']);
  assert.ok(pkg.devDependencies.electron);
});

test('mandatory Electron e2e suite has no skipped or placeholder tests', () => {
  const spec = read('tests/e2e/app.spec.js');
  assert.doesNotMatch(spec, /\btest\.skip\b|\bdescribe\.skip\b|\btest\.fixme\b/);
  assert.doesNotMatch(spec, /placeholder|TODO: Use electron/i);
  assert.match(spec, /electron\.launch/);
  assert.match(spec, /window\.posApi\.products\.create/);
  assert.match(spec, /enterprise_pos_e2e_/);
});

test('Playwright configuration records certification artifacts under test-artifacts', () => {
  const config = read('playwright.config.ts');
  assert.match(config, /testDir:\s*['"]\.\/tests\/e2e['"]/);
  assert.match(config, /testMatch:\s*['"]\*\*\/\*\.spec\.js['"]/);
  assert.match(config, /workers:\s*1/);
  assert.match(config, /retries:\s*0/);
  assert.match(config, /json/);
  assert.match(config, /test-artifacts/);
});

test('test-only userData override is unavailable outside NODE_ENV=test and unpackaged runtime', () => {
  const main = read('src/main/main.js');
  assert.match(main, /process\.env\.NODE_ENV !== 'test'/);
  assert.match(main, /app\.isPackaged/);
  assert.match(main, /ENTERPRISE_POS_E2E_USER_DATA_DIR/);
  assert.match(main, /enterprise-pos-e2e/i);
});
