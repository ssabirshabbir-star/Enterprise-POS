const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { assessInstallerReproducibility } = require('../scripts/installer-reproducibility-policy');

function makeFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'epos-repro-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const leftUnpacked = path.join(root, 'left', 'win-unpacked');
  const rightUnpacked = path.join(root, 'right', 'win-unpacked');
  fs.mkdirSync(path.join(leftUnpacked, 'resources'), { recursive: true });
  fs.mkdirSync(path.join(rightUnpacked, 'resources'), { recursive: true });

  fs.writeFileSync(path.join(leftUnpacked, 'Enterprise POS.exe'), 'app exe');
  fs.writeFileSync(path.join(rightUnpacked, 'Enterprise POS.exe'), 'app exe');
  fs.writeFileSync(path.join(leftUnpacked, 'resources', 'app.asar'), 'asar payload');
  fs.writeFileSync(path.join(rightUnpacked, 'resources', 'app.asar'), 'asar payload');

  const leftInstaller = path.join(root, 'left', 'Enterprise POS Setup.exe');
  const rightInstaller = path.join(root, 'right', 'Enterprise POS Setup.exe');
  fs.writeFileSync(leftInstaller, 'installer wrapper');
  fs.writeFileSync(rightInstaller, 'installer wrapper');

  return {
    leftInstaller,
    rightInstaller,
    leftUnpacked,
    rightUnpacked,
  };
}

test('strict reproducibility passes when installer and packaged payload match', (t) => {
  const fixture = makeFixture(t);

  const result = assessInstallerReproducibility(fixture);

  assert.equal(result.decision, 'STRICT_REPRODUCIBILITY_PASS');
  assert.equal(result.phase1Pass, true);
  assert.equal(result.installerByteIdentical, true);
  assert.equal(result.packagedPayloadByteIdentical, true);
  assert.equal(result.firstDifferingLayer, 'NONE');
});

test('payload reproducibility passes when only the unsigned NSIS wrapper differs', (t) => {
  const fixture = makeFixture(t);
  fs.writeFileSync(fixture.rightInstaller, 'different unsigned wrapper');

  const result = assessInstallerReproducibility(fixture);

  assert.equal(result.decision, 'PAYLOAD_REPRODUCIBILITY_PASS');
  assert.equal(result.phase1Pass, true);
  assert.equal(result.installerByteIdentical, false);
  assert.equal(result.packagedPayloadByteIdentical, true);
  assert.equal(result.firstDifferingLayer, 'NSIS_WRAPPER');
  assert.match(result.policy, /final signed artifact hash/i);
});

test('application payload differences fail Phase 1', (t) => {
  const fixture = makeFixture(t);
  fs.writeFileSync(path.join(fixture.rightUnpacked, 'resources', 'app.asar'), 'changed app');

  const result = assessInstallerReproducibility(fixture);

  assert.equal(result.decision, 'FAIL');
  assert.equal(result.phase1Pass, false);
  assert.equal(result.packagedPayloadByteIdentical, false);
  assert.equal(result.firstDifferingLayer, 'PACKAGED_APPLICATION');
  assert.equal(result.unpackedPayload.differenceCount, 1);
  assert.equal(result.unpackedPayload.firstDifference.relativePath, 'resources/app.asar');
});
