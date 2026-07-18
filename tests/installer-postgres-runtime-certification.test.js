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
