const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const harness = require('../scripts/certify-managed-postgres-runtime');
const provisioningService = require('../src/main/installer/postgres-provisioning.service');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('runtime certification harness requires an explicit certification flag', async () => {
  await assert.rejects(
    () =>
      harness.runCertification({ archive: 'missing.zip', output: tempDir('epos-cert-output-') }),
    /Refusing to run/
  );

  const parsed = harness.parseArgs([
    '--certify-managed-postgres-runtime',
    '--archive',
    'D:\\payload.zip',
    '--output',
    'D:\\out',
    '--clean-environment',
  ]);
  assert.equal(parsed.explicit, true);
  assert.equal(parsed.cleanEnvironment, true);
  assert.equal(parsed.archive, 'D:\\payload.zip');

  const withVcRoot = harness.parseArgs([
    '--certify-managed-postgres-runtime',
    '--archive',
    'D:\\payload.zip',
    '--vc-runtime-root',
    'D:\\vc-runtime',
  ]);
  assert.equal(withVcRoot.vcRuntimeRoot, 'D:\\vc-runtime');
});

test('runtime certification harness refuses tracked source output directories', () => {
  assert.throws(
    () => harness.assertSafeOutputPath(path.join(process.cwd(), 'src')),
    /tracked source/
  );
  assert.throws(
    () => harness.assertSafeOutputPath(path.join(process.cwd(), 'tests', 'tmp')),
    /tracked source/
  );
  assert.doesNotThrow(() =>
    harness.assertSafeOutputPath(path.join(process.cwd(), 'test-artifacts', 'runtime-cert-test'))
  );
});

test('runtime certification harness builds localhost-only PostgreSQL commands', () => {
  const dataDir = 'D:\\runtime\\data';
  const logPath = 'D:\\runtime\\postgres.log';
  assert.deepEqual(harness.buildInitdbArgs(dataDir), [
    '-D',
    dataDir,
    '-U',
    'epos_cert',
    '-A',
    'trust',
    '--no-sync',
  ]);
  assert.deepEqual(harness.buildPgCtlStartArgs(dataDir, logPath, 55439), [
    '-D',
    dataDir,
    '-l',
    logPath,
    '-o',
    '-h 127.0.0.1 -p 55439',
    '-w',
    '-t',
    '30',
    'start',
  ]);
  assert.deepEqual(harness.buildPgCtlStopArgs(dataDir), [
    '-D',
    dataDir,
    '-m',
    'fast',
    '-w',
    '-t',
    '30',
    'stop',
  ]);
  assert.deepEqual(harness.buildPsqlArgs({ port: 55439, database: 'postgres', sql: 'SELECT 1' }), [
    '-h',
    '127.0.0.1',
    '-p',
    '55439',
    '-U',
    'epos_cert',
    '-d',
    'postgres',
    '-Atc',
    'SELECT 1',
  ]);
  assert.deepEqual(harness.buildCreatedbArgs(55439, 'epos_runtime_cert'), [
    '-h',
    '127.0.0.1',
    '-p',
    '55439',
    '-U',
    'epos_cert',
    'epos_runtime_cert',
  ]);
});

test('runtime certification harness resolves executable paths inside staged runtime only', () => {
  const stagedRoot = path.join('D:\\cert', 'runtime');
  const paths = harness.executablePaths(stagedRoot);
  assert.equal(paths.postgres, path.join(stagedRoot, 'pgsql', 'bin', 'postgres.exe'));
  assert.equal(paths.initdb, path.join(stagedRoot, 'pgsql', 'bin', 'initdb.exe'));
  assert.equal(paths.pgCtl, path.join(stagedRoot, 'pgsql', 'bin', 'pg_ctl.exe'));
  assert.equal(paths.psql, path.join(stagedRoot, 'pgsql', 'bin', 'psql.exe'));
  assert.equal(paths.createdb, path.join(stagedRoot, 'pgsql', 'bin', 'createdb.exe'));
});

test('runtime certification harness chooses an available localhost port', async () => {
  const port = await harness.getFreeLocalPort();
  assert.equal(Number.isInteger(port), true);
  assert.ok(port > 0 && port <= 65535);
});

test('production managed PostgreSQL provisioning remains disabled after certification harness work', async () => {
  const result = await provisioningService.startManagedPostgresProvisioning({
    userDataPath: tempDir('epos-provisioning-disabled-'),
  });
  assert.equal(result.ok, false);
  assert.notEqual(result.code, undefined);
});

test('runtime certification harness writes structured failure artifacts', async () => {
  const output = tempDir('epos-runtime-cert-report-');
  const report = await harness.runCertification({
    explicit: true,
    archive: path.join(output, 'missing-postgresql.zip'),
    output,
    cleanEnvironment: false,
    readinessTimeoutMs: 1000,
  });
  assert.equal(report.status, 'failed');
  assert.equal(report.provisioningActivation.enabled, false);
  assert.ok(report.failures.some((failure) => failure.code === 'CERTIFICATION_ARCHIVE_MISSING'));
  assert.equal(
    fs.existsSync(path.join(output, 'managed-postgres-runtime-certification.json')),
    true
  );
  assert.equal(
    fs.existsSync(path.join(output, 'managed-postgres-runtime-certification.txt')),
    true
  );
  const persisted = JSON.parse(
    fs.readFileSync(path.join(output, 'managed-postgres-runtime-certification.json'), 'utf8')
  );
  assert.equal(persisted.status, 'failed');
  assert.equal(persisted.provisioningActivation.certifiedForActivation, false);
});

function vcReport(output) {
  return {
    outputRoot: output,
    dependencies: {
      evidence: [],
    },
  };
}

test('runtime certification harness skips VC installer when compatible runtime is present', async () => {
  const output = tempDir('epos-runtime-vc-present-');
  let installCalled = false;
  const report = vcReport(output);
  const result = await harness.ensureVisualCppRuntimeReady(
    { vcRuntimeRoot: 'D:\\vc-runtime' },
    report,
    {
      vcRuntimePrerequisite: {
        defaultPrerequisiteRoot: () => 'D:\\default-vc',
        assessVcRuntimePrerequisite: () => ({
          ok: true,
          code: 'VC_RUNTIME_AVAILABLE',
          detection: { compatible: true },
        }),
        installVcRuntimePrerequisite: async () => {
          installCalled = true;
          return { ok: false };
        },
      },
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.code, 'VC_RUNTIME_ALREADY_AVAILABLE');
  assert.equal(installCalled, false);
  assert.equal(report.dependencies.ready, true);
  assert.equal(report.dependencies.visualCppRuntimePreinstalled, 'yes');
});

test('runtime certification harness installs and revalidates pinned VC Runtime before PostgreSQL launch', async () => {
  const output = tempDir('epos-runtime-vc-install-');
  const report = vcReport(output);
  const calls = [];
  const result = await harness.ensureVisualCppRuntimeReady(
    { vcRuntimeRoot: 'D:\\vc-runtime' },
    report,
    {
      vcRuntimePrerequisite: {
        defaultPrerequisiteRoot: () => 'D:\\default-vc',
        assessVcRuntimePrerequisite: () => {
          calls.push('assess');
          return { ok: false, code: 'VC_RUNTIME_NOT_INSTALLED' };
        },
        installVcRuntimePrerequisite: async ({ root, logPath }) => {
          calls.push('install');
          assert.equal(root, path.resolve('D:\\vc-runtime'));
          assert.match(logPath, /vc-redist-install\.log$/);
          return {
            ok: true,
            code: 'VC_RUNTIME_INSTALLED',
            payload: { ok: true, code: 'VC_RUNTIME_PAYLOAD_VERIFIED' },
            install: { exitCode: 0 },
            postInstallDetection: { compatible: true },
            restartRequired: false,
          };
        },
      },
    }
  );
  assert.deepEqual(calls, ['assess', 'install']);
  assert.equal(result.ok, true);
  assert.equal(report.dependencies.payloadVerified, true);
  assert.equal(report.dependencies.installAttempted, true);
  assert.equal(report.dependencies.installExitCode, 0);
  assert.equal(report.dependencies.ready, true);
});

test('runtime certification harness blocks before PostgreSQL launch when VC payload is missing', async () => {
  const output = tempDir('epos-runtime-vc-missing-');
  const report = vcReport(output);
  await assert.rejects(
    () =>
      harness.ensureVisualCppRuntimeReady({ vcRuntimeRoot: 'D:\\vc-runtime' }, report, {
        vcRuntimePrerequisite: {
          defaultPrerequisiteRoot: () => 'D:\\default-vc',
          assessVcRuntimePrerequisite: () => ({ ok: false, code: 'VC_RUNTIME_NOT_INSTALLED' }),
          installVcRuntimePrerequisite: async () => ({
            ok: false,
            code: 'VC_RUNTIME_PAYLOAD_MISSING',
            payload: { ok: false, code: 'VC_RUNTIME_PAYLOAD_MISSING' },
          }),
        },
      }),
    /Visual C\+\+ Runtime prerequisite is not ready/
  );
  assert.equal(report.dependencies.installAttempted, true);
  assert.equal(report.dependencies.ready, false);
  assert.equal(report.dependencies.evidence.at(-1).result.code, 'VC_RUNTIME_PAYLOAD_MISSING');
});

test('runtime certification harness blocks before PostgreSQL launch on VC hash mismatch', async () => {
  const output = tempDir('epos-runtime-vc-hash-');
  const report = vcReport(output);
  await assert.rejects(
    () =>
      harness.ensureVisualCppRuntimeReady({ vcRuntimeRoot: 'D:\\vc-runtime' }, report, {
        vcRuntimePrerequisite: {
          defaultPrerequisiteRoot: () => 'D:\\default-vc',
          assessVcRuntimePrerequisite: () => ({ ok: false, code: 'VC_RUNTIME_NOT_INSTALLED' }),
          installVcRuntimePrerequisite: async () => ({
            ok: false,
            code: 'VC_RUNTIME_PAYLOAD_HASH_MISMATCH',
            payload: { ok: false, code: 'VC_RUNTIME_PAYLOAD_HASH_MISMATCH' },
          }),
        },
      }),
    (error) => error.code === 'VC_RUNTIME_PAYLOAD_HASH_MISMATCH'
  );
  assert.equal(report.dependencies.ready, false);
});

test('runtime certification harness blocks before PostgreSQL launch on VC installer failure', async () => {
  const output = tempDir('epos-runtime-vc-fail-');
  const report = vcReport(output);
  await assert.rejects(
    () =>
      harness.ensureVisualCppRuntimeReady({ vcRuntimeRoot: 'D:\\vc-runtime' }, report, {
        vcRuntimePrerequisite: {
          defaultPrerequisiteRoot: () => 'D:\\default-vc',
          assessVcRuntimePrerequisite: () => ({ ok: false, code: 'VC_RUNTIME_NOT_INSTALLED' }),
          installVcRuntimePrerequisite: async () => ({
            ok: false,
            code: 'VC_RUNTIME_INSTALL_FAILED',
            payload: { ok: true },
            install: { exitCode: 1603 },
          }),
        },
      }),
    (error) => error.code === 'VC_RUNTIME_INSTALL_FAILED'
  );
  assert.equal(report.dependencies.installExitCode, 1603);
  assert.equal(report.dependencies.ready, false);
});

test('runtime certification harness blocks before PostgreSQL launch on post-install verification failure', async () => {
  const output = tempDir('epos-runtime-vc-post-verify-');
  const report = vcReport(output);
  await assert.rejects(
    () =>
      harness.ensureVisualCppRuntimeReady({ vcRuntimeRoot: 'D:\\vc-runtime' }, report, {
        vcRuntimePrerequisite: {
          defaultPrerequisiteRoot: () => 'D:\\default-vc',
          assessVcRuntimePrerequisite: () => ({ ok: false, code: 'VC_RUNTIME_NOT_INSTALLED' }),
          installVcRuntimePrerequisite: async () => ({
            ok: false,
            code: 'VC_RUNTIME_POST_VERIFY_FAILED',
            payload: { ok: true },
            install: { exitCode: 0 },
            postInstallDetection: { compatible: false },
          }),
        },
      }),
    (error) => error.code === 'VC_RUNTIME_POST_VERIFY_FAILED'
  );
  assert.equal(report.dependencies.ready, false);
});

test('runtime certification harness preserves restart-required VC classification', async () => {
  const output = tempDir('epos-runtime-vc-restart-');
  const report = vcReport(output);
  await assert.rejects(
    () =>
      harness.ensureVisualCppRuntimeReady({ vcRuntimeRoot: 'D:\\vc-runtime' }, report, {
        vcRuntimePrerequisite: {
          defaultPrerequisiteRoot: () => 'D:\\default-vc',
          assessVcRuntimePrerequisite: () => ({ ok: false, code: 'VC_RUNTIME_NOT_INSTALLED' }),
          installVcRuntimePrerequisite: async () => ({
            ok: false,
            code: 'VC_RUNTIME_INSTALL_RESTART_REQUIRED',
            payload: { ok: true },
            install: { exitCode: 3010 },
            restartRequired: true,
          }),
        },
      }),
    (error) => error.code === 'VC_RUNTIME_INSTALL_RESTART_REQUIRED'
  );
  assert.equal(report.dependencies.restartRequired, true);
  assert.equal(report.dependencies.installExitCode, 3010);
});

test('runtime certification harness checks VC Runtime before PostgreSQL executable launch', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'certify-managed-postgres-runtime.js'),
    'utf8'
  );
  const prerequisiteIndex = source.indexOf('ensureVisualCppRuntimeReady(args, report');
  const postgresLaunchIndex = source.indexOf("runCommand(paths.postgres, ['--version']");
  assert.ok(prerequisiteIndex > 0);
  assert.ok(postgresLaunchIndex > prerequisiteIndex);
});
