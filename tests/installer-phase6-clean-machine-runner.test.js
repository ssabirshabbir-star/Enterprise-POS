const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const runnerPath = path.join(__dirname, '..', 'scripts', 'run-phase6-clean-machine-runtime.ps1');

function runnerSource() {
  return fs.readFileSync(runnerPath, 'utf8');
}

test('phase 6 clean-machine runner is tracked and invokes the runtime harness with clean-environment', () => {
  const source = runnerSource();
  assert.match(source, /certify-managed-postgres-runtime\.js/);
  assert.match(source, /--certify-managed-postgres-runtime/);
  assert.match(source, /--clean-environment/);
  assert.match(source, /--vc-runtime-root/);
  assert.match(source, /managed-postgres-runtime-certification\.json/);
});

test('phase 6 clean-machine runner treats missing VC registry as baseline evidence', () => {
  const source = runnerSource();
  assert.match(source, /function Capture-NativeCommand/);
  assert.match(source, /\$previousErrorActionPreference = \$ErrorActionPreference/);
  assert.match(source, /\$ErrorActionPreference = 'Continue'/);
  assert.match(source, /\$ErrorActionPreference = \$previousErrorActionPreference/);
  assert.match(source, /reg\.exe/);
  assert.match(source, /HKLM\\SOFTWARE\\Microsoft\\VisualStudio\\14\.0\\VC\\Runtimes\\x64/);

  const registryIndex = source.indexOf('$vcRegistry = Capture-NativeCommand');
  const harnessIndex = source.indexOf('Start-Process');
  assert.ok(registryIndex > 0);
  assert.ok(harnessIndex > registryIndex);
  assert.doesNotMatch(source, /vcRegistry\s*=\s*@\(reg\.exe query/);
});

test('phase 6 clean-machine runner records non-authorizing production decisions', () => {
  const source = runnerSource();
  assert.match(source, /managedPostgresProductionStatus = 'blocked\/not enabled'/);
  assert.match(source, /productionRestoreStatus = 'blocked\/not enabled'/);
  assert.match(source, /productionReleaseDecision = 'DO NOT RELEASE'/);
  assert.match(
    source,
    /redistributionStatus = 'PostgreSQL not-certified; VC Runtime not-certified/
  );
});
