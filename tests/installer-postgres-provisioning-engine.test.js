const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const provisioningRepository = require('../src/main/installer/postgres-provisioning.repository');
const provisioningService = require('../src/main/installer/postgres-provisioning.service');

const ARCHIVE_PATH =
  'D:\\Enterprise-POS-release-inputs\\postgres\\postgresql-17.10-2-windows-x64-binaries.zip';

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function withCertificationEnv(callback) {
  const previousFlag = process.env[provisioningService.CERTIFICATION_ENV];
  const previousToken = process.env[provisioningService.CERTIFICATION_TOKEN_ENV];
  process.env[provisioningService.CERTIFICATION_ENV] = '1';
  process.env[provisioningService.CERTIFICATION_TOKEN_ENV] =
    provisioningService.CERTIFICATION_TOKEN;
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      if (previousFlag === undefined) delete process.env[provisioningService.CERTIFICATION_ENV];
      else process.env[provisioningService.CERTIFICATION_ENV] = previousFlag;
      if (previousToken === undefined)
        delete process.env[provisioningService.CERTIFICATION_TOKEN_ENV];
      else process.env[provisioningService.CERTIFICATION_TOKEN_ENV] = previousToken;
    });
}

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(String(value), 'utf8'),
    decryptString: (buffer) => Buffer.from(buffer).toString('utf8'),
  };
}

test('default production managed PostgreSQL execution remains blocked', async () => {
  const userDataPath = tempDir('epos-pg-prod-block-');
  const result = await provisioningService.startManagedPostgresProvisioning({ userDataPath });
  assert.equal(result.ok, false);
  assert.notEqual(result.code, 'INSTALLER_POSTGRES_CERTIFICATION_PROVISIONING_COMPLETED');
});

test('certification gate requires environment flag, token, explicit option, safe root, and disposable database', () => {
  assert.throws(
    () => provisioningService.assertCertificationExecutionGate({}),
    /certification mode/i
  );

  return withCertificationEnv(() => {
    assert.throws(
      () =>
        provisioningService.assertCertificationExecutionGate({
          certification: {
            enabled: true,
            token: provisioningService.CERTIFICATION_TOKEN,
            root: path.join(process.cwd(), 'src', 'managed-postgres-cert'),
            database: 'epos_cert_bad',
            archivePath: ARCHIVE_PATH,
          },
        }),
      /tracked source/i
    );

    assert.throws(
      () =>
        provisioningService.assertCertificationExecutionGate({
          certification: {
            enabled: true,
            token: provisioningService.CERTIFICATION_TOKEN,
            root: tempDir('managed-postgres-cert-'),
            database: 'enterprise_pos',
            archivePath: ARCHIVE_PATH,
          },
        }),
      /disposable prefix/i
    );
  });
});

test('certification environment alone does not enable provisioning execution', async () => {
  await withCertificationEnv(async () => {
    const result = await provisioningService.startManagedPostgresProvisioning({
      userDataPath: tempDir('epos-pg-env-only-'),
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INSTALLER_POSTGRES_CERTIFICATION_GATE_REQUIRED');
  });
});

test('certification provisioning engine runs full local disposable state machine', async (t) => {
  if (!fs.existsSync(ARCHIVE_PATH)) {
    t.skip('Official PostgreSQL archive is not available on this machine.');
    return;
  }

  await withCertificationEnv(async () => {
    const userDataPath = tempDir('epos-pg-engine-userdata-');
    const root = tempDir('managed-postgres-cert-engine-');
    const result = await provisioningService.startManagedPostgresProvisioning({
      userDataPath,
      certification: {
        enabled: true,
        token: provisioningService.CERTIFICATION_TOKEN,
        root,
        archivePath: ARCHIVE_PATH,
        database: `epos_cert_${Date.now()}`,
        safeStorage: fakeSafeStorage(),
      },
    });

    assert.equal(result.ok, true, result.message);
    assert.equal(result.code, 'INSTALLER_POSTGRES_CERTIFICATION_PROVISIONING_COMPLETED');
    assert.equal(result.operation.state, 'COMPLETED');
    assert.equal(result.runtime.host, undefined);
    assert.equal(result.runtime.database.startsWith('epos_cert_'), true);

    const persisted = provisioningRepository.getLatestProvisioningOperation(userDataPath);
    assert.equal(persisted.state, 'COMPLETED');
    assert.deepEqual(
      persisted.transitions.map((transition) => transition.to),
      [
        'NOT_STARTED',
        'ARCHIVE_VERIFIED',
        'PAYLOAD_STAGED',
        'DATA_DIRECTORY_INITIALIZED',
        'SERVER_STARTED',
        'DATABASE_CREATED',
        'APPLICATION_SCHEMA_READY',
        'COMPLETED',
      ]
    );

    const logs = provisioningRepository.readProvisioningLogs(userDataPath);
    const rawLogs = fs.readFileSync(provisioningRepository.logPath(userDataPath), 'utf8');
    assert.ok(logs.some((entry) => entry.step === 'INITDB'));
    assert.ok(logs.some((entry) => entry.step === 'START_SERVER'));
    assert.doesNotMatch(rawLogs, /password\s*[:=]/i);
    assert.equal(fs.existsSync(path.join(root, 'postgres-runtime', 'pgsql', 'pgAdmin 4')), false);
    assert.equal(
      fs.existsSync(path.join(root, 'postgres-runtime', 'pgsql', 'StackBuilder')),
      false
    );

    const replay = await provisioningService.startManagedPostgresProvisioning({
      userDataPath,
      certification: {
        enabled: true,
        token: provisioningService.CERTIFICATION_TOKEN,
        root,
        archivePath: ARCHIVE_PATH,
        database: `epos_cert_${Date.now()}`,
        safeStorage: fakeSafeStorage(),
      },
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.code, 'INSTALLER_POSTGRES_PROVISIONING_ALREADY_COMPLETED');
  });
});
