const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const { getPackageVersion } = require('../../src/main/app-version');

test('package version is the authoritative upgrade candidate version', () => {
  assert.equal(getPackageVersion(), '1.1.0');
});

test('tracked runtime source no longer hardcodes the old installer default', () => {
  const root = path.join(__dirname, '..', '..');
  const files = execFileSync('git', ['ls-files', 'src', 'scripts', 'resources', 'package.json'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const stale = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    if (
      /installerVersion:\s*['"]1\.0\.0['"]/.test(text) ||
      /installerVersion[^;\n]+1\.0\.0/.test(text) ||
      /value="1\.0\.0"/.test(text)
    ) {
      stale.push(file);
    }
  }
  assert.deepEqual(stale, []);
});
