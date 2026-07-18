const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const vcRuntime = require('../src/main/installer/vc-runtime-prerequisite.service');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function copyManifest(root, overrides = {}) {
  const source = JSON.parse(
    fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'resources',
        'prerequisites',
        'microsoft-vc-runtime',
        'manifest.json'
      ),
      'utf8'
    )
  );
  const manifest = { ...source, ...overrides };
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

test('Visual C++ Runtime prerequisite manifest is pinned and not production-certified', () => {
  const manifest = vcRuntime.readManifest().manifest;
  assert.equal(manifest.id, 'microsoft-vc-runtime-x64-14');
  assert.equal(manifest.architecture, 'x64');
  assert.equal(manifest.filename, 'vc_redist.x64.exe');
  assert.equal(manifest.sha256, '843068991daaa1f73ad9f6239bce4d0f6a07a51f18c37ea2a867e9beca71295c');
  assert.equal(manifest.expectedSigner, 'Microsoft Corporation');
  assert.equal(manifest.redistributionStatus, 'not-certified');
  assert.equal(manifest.payloadPolicy, 'external-build-input');
  assert.deepEqual(manifest.silentArguments, ['/install', '/passive', '/norestart']);
  assert.deepEqual(manifest.restartRequiredExitCodes, [3010, 1641]);
});

test('Visual C++ Runtime payload verifier fails closed when external exe is absent', () => {
  const root = tempDir('epos-vc-runtime-missing-');
  copyManifest(root);
  const result = vcRuntime.verifyVcRuntimePayload({ root });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'VC_RUNTIME_PAYLOAD_MISSING');
  assert.equal(result.state, 'INSTALLATION_REQUIRED');
});

test('Visual C++ Runtime payload verifier rejects wrong hash before execution', () => {
  const root = tempDir('epos-vc-runtime-hash-');
  const payload = Buffer.from('not-the-microsoft-redist', 'utf8');
  const digest = crypto.createHash('sha256').update(payload).digest('hex');
  copyManifest(root, { sha256: '0'.repeat(64) });
  fs.writeFileSync(path.join(root, 'vc_redist.x64.exe'), payload);
  const result = vcRuntime.verifyVcRuntimePayload({ root });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'VC_RUNTIME_PAYLOAD_HASH_MISMATCH');
  assert.equal(result.actual, digest);
});

test('official external Visual C++ Runtime payload verifies when supplied', (t) => {
  const externalRoot = vcRuntime.externalPrerequisiteRoot();
  const payloadPath = path.join(externalRoot, 'vc_redist.x64.exe');
  if (!fs.existsSync(payloadPath)) {
    t.skip('Official Microsoft Visual C++ Runtime payload is not available.');
    return;
  }
  const manifest = vcRuntime.readManifest().manifest;
  const result = vcRuntime.verifyVcRuntimePayload({ root: externalRoot, manifest });
  assert.equal(result.ok, true, result.code);
  assert.equal(result.digest, manifest.sha256);
  assert.match(result.signature.signer, /Microsoft Corporation/);
  assert.equal(result.signature.status, 'Valid');
});

test('Visual C++ Runtime detector reports structured readiness evidence', () => {
  const result = vcRuntime.detectVcRuntime();
  assert.equal(result.architecture, 'x64');
  assert.ok(Object.hasOwn(result, 'installed'));
  assert.ok(Object.hasOwn(result, 'compatible'));
  assert.ok(Array.isArray(result.evidence));
  assert.ok(result.reasonCode);
  assert.ok(result.checkedAt);
});

test('Visual C++ Runtime install exit codes are classified deterministically', () => {
  const manifest = vcRuntime.readManifest().manifest;
  assert.deepEqual(vcRuntime.classifyInstallResult(0, manifest), {
    ok: true,
    state: 'INSTALLED',
    code: 'VC_RUNTIME_INSTALLED',
    restartRequired: false,
  });
  assert.deepEqual(vcRuntime.classifyInstallResult(3010, manifest), {
    ok: true,
    state: 'RESTART_REQUIRED',
    code: 'VC_RUNTIME_INSTALL_RESTART_REQUIRED',
    restartRequired: true,
  });
  assert.equal(
    vcRuntime.classifyInstallResult(1618, manifest).code,
    'VC_RUNTIME_INSTALL_IN_PROGRESS'
  );
  assert.equal(
    vcRuntime.classifyInstallResult(1602, manifest).code,
    'VC_RUNTIME_INSTALL_CANCELLED'
  );
});

test('packaging keeps Visual C++ Runtime exe outside normal production resources', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const prerequisiteResource = pkg.build.extraResources.find(
    (entry) => entry.from === 'resources/prerequisites' && entry.to === 'prerequisites'
  );
  assert.ok(prerequisiteResource);
  assert.ok(prerequisiteResource.filter.includes('**/manifest.json'));
  assert.ok(prerequisiteResource.filter.includes('!**/*.exe'));
});
