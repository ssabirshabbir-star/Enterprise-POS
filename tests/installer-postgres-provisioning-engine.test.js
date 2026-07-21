const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const test = require('node:test');
const yazl = require('yazl');

const provisioningRepository = require('../src/main/installer/postgres-provisioning.repository');
const provisioningService = require('../src/main/installer/postgres-provisioning.service');
const { sha256File } = require('../src/main/installer/postgres-payload-verifier');
const runtimeDiagnostics = require('../src/main/installer/postgres-runtime-diagnostics');
const vcRuntimePrerequisite = require('../src/main/installer/vc-runtime-prerequisite.service');

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

async function createMinimalPostgresArchive(zipPath) {
  const zip = new yazl.ZipFile();
  const mtime = new Date('2026-07-18T00:00:00.000Z');
  for (const name of [
    'pgsql/bin/postgres.exe',
    'pgsql/bin/initdb.exe',
    'pgsql/bin/pg_ctl.exe',
    'pgsql/bin/psql.exe',
    'pgsql/bin/createdb.exe',
    'pgsql/bin/libpq.dll',
    'pgsql/lib/server.dll',
    'pgsql/share/postgresql.conf.sample',
    'pgsql/server_license.txt',
    'pgsql/commandlinetools_3rd_party_licenses.txt',
  ]) {
    zip.addBuffer(Buffer.from(`${name}\n`, 'utf8'), name, { mtime, mode: 0o644 });
  }
  zip.end();
  await pipeline(zip.outputStream, fs.createWriteStream(zipPath));
}

function withoutDatabaseEnv(callback) {
  const names = [
    'DATABASE_URL',
    'PGHOST',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
    'NODE_ENV',
    'ELECTRON_IS_PACKAGED',
  ];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  process.env.NODE_ENV = 'production';
  process.env.ELECTRON_IS_PACKAGED = 'true';
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const name of names) {
        const value = previous.get(name);
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    });
}

test('default production managed PostgreSQL execution remains blocked', async () => {
  const userDataPath = tempDir('epos-pg-prod-block-');
  const result = await provisioningService.startManagedPostgresProvisioning({ userDataPath });
  assert.equal(result.ok, false);
  assert.notEqual(result.code, 'INSTALLER_POSTGRES_CERTIFICATION_PROVISIONING_COMPLETED');
});

test('deployable provisioning authorization requires exact packaging evidence and payload hash', () => {
  const payload = { ok: true, digest: 'abc123' };
  assert.equal(
    provisioningService.assessDeployableProvisioningAuthorization({
      payload,
      options: {
        deploymentEvidence: {
          classification: 'offline-certification-unsigned',
          productionProvisioningEnabled: false,
          postgresql: { sha256: 'abc123' },
        },
      },
    }).ok,
    false
  );

  assert.equal(
    provisioningService.assessDeployableProvisioningAuthorization({
      payload,
      options: {
        deploymentEvidence: {
          classification: 'deployable-offline-installer',
          productionProvisioningEnabled: true,
          postgresql: { sha256: 'different' },
        },
      },
    }).code,
    'INSTALLER_DEPLOYABLE_POSTGRES_EVIDENCE_HASH_MISMATCH'
  );

  const authorized = provisioningService.assessDeployableProvisioningAuthorization({
    payload,
    options: {
      deploymentEvidence: {
        classification: 'deployable-offline-installer',
        productionProvisioningEnabled: true,
        postgresql: { sha256: 'abc123' },
      },
    },
  });
  assert.equal(authorized.ok, true);
  assert.equal(authorized.code, 'INSTALLER_DEPLOYABLE_PROVISIONING_AUTHORIZED');
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

test('production database readiness warning does not block certification gate evaluation', async () => {
  await withoutDatabaseEnv(async () => {
    await withCertificationEnv(async () => {
      const gate = provisioningService.assertCertificationExecutionGate({
        certification: {
          enabled: true,
          token: provisioningService.CERTIFICATION_TOKEN,
          root: tempDir('managed-postgres-cert-no-db-env-'),
          database: 'epos_cert_no_db_env',
          archivePath: ARCHIVE_PATH,
        },
      });
      assert.equal(gate.database, 'epos_cert_no_db_env');

      const result = await provisioningService.startManagedPostgresProvisioning({
        userDataPath: tempDir('epos-pg-no-db-env-'),
        certification: {
          enabled: true,
          token: provisioningService.CERTIFICATION_TOKEN,
          root: tempDir('managed-postgres-cert-no-db-env-run-'),
          database: 'epos_cert_no_db_env_run',
          archivePath: path.join(os.tmpdir(), 'wrong-postgresql-name.zip'),
        },
      });
      assert.equal(result.ok, false);
      assert.notEqual(result.message, undefined);
      assert.doesNotMatch(result.message, /Database is not configured/i);
    });
  });
});

test('PostgreSQL child command options use staged bin cwd and process-local PATH', () => {
  const exe = path.join(
    'C:\\managed-postgres-cert',
    'postgres-runtime',
    'pgsql',
    'bin',
    'initdb.exe'
  );
  const options = runtimeDiagnostics.postgresCommandOptions(exe, {
    env: { PGPASSWORD: 'redacted-test-value' },
  });
  assert.equal(options.cwd, path.dirname(exe));
  assert.equal(String(options.env.PATH).split(path.delimiter)[0], path.dirname(exe));
  assert.equal(process.env.PATH?.split(path.delimiter)[0] === path.dirname(exe), false);
  assert.equal(options.env.PGCONNECT_TIMEOUT, '5');
});

test('initdb uses an extended bounded timeout for slow clean-machine disk sync', () => {
  assert.equal(provisioningService.COMMAND_TIMEOUT_MS, 60000);
  assert.equal(provisioningService.INITDB_COMMAND_TIMEOUT_MS, 180000);
  assert.equal(
    provisioningService.INITDB_COMMAND_TIMEOUT_MS > provisioningService.COMMAND_TIMEOUT_MS,
    true
  );
});

test('initdb launch diagnostics redact password file path and report staged layout', () => {
  const root = tempDir('managed-postgres-cert-diagnostics-');
  const bin = path.join(root, 'postgres-runtime', 'pgsql', 'bin');
  const lib = path.join(root, 'postgres-runtime', 'pgsql', 'lib');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(lib, { recursive: true });
  for (const name of ['initdb.exe', 'postgres.exe', 'pg_ctl.exe', 'psql.exe', 'createdb.exe']) {
    fs.writeFileSync(path.join(bin, name), name);
  }
  fs.writeFileSync(path.join(bin, 'libpq.dll'), 'dll');
  const passwordFile = path.join(root, 'postgres-password.txt');
  fs.writeFileSync(passwordFile, 'do-not-log');
  const command = path.join(bin, 'initdb.exe');
  const args = ['-D', path.join(root, 'postgres-data'), '--pwfile', passwordFile];
  const options = runtimeDiagnostics.postgresCommandOptions(command);
  const diagnostics = runtimeDiagnostics.buildInitdbLaunchDiagnostics({
    command,
    args,
    cwd: options.cwd,
    env: options.env,
    dataDir: path.join(root, 'postgres-data'),
    passwordFile,
    runtimeRoot: path.join(root, 'postgres-runtime'),
  });

  assert.equal(diagnostics.executable.exists, true);
  assert.equal(diagnostics.args.includes(passwordFile), false);
  assert.equal(diagnostics.args.includes('<redacted-sensitive-path>'), true);
  assert.equal(diagnostics.passwordFile.present, true);
  assert.equal(diagnostics.passwordFile.path, '<redacted-sensitive-path>');
  assert.equal(diagnostics.bin.fileCount >= 6, true);
  assert.equal(diagnostics.environment.pathStartsWithPostgresBin, true);
});

test('certification provisioning blocks before initdb when Visual C++ Runtime evidence is unresolved', async () => {
  await withCertificationEnv(async () => {
    const userDataPath = tempDir('epos-pg-vc-block-userdata-');
    const root = tempDir('managed-postgres-cert-vc-block-');
    const vcRoot = tempDir('epos-vc-runtime-unresolved-');
    const result = await provisioningService.startManagedPostgresProvisioning({
      userDataPath,
      certification: {
        enabled: true,
        token: provisioningService.CERTIFICATION_TOKEN,
        root,
        archivePath: ARCHIVE_PATH,
        database: `epos_cert_vc_block_${Date.now()}`,
        vcRuntimeRoot: vcRoot,
        safeStorage: fakeSafeStorage(),
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'VC_RUNTIME_MANIFEST_MISSING');
    const logs = provisioningRepository.readProvisioningLogs(userDataPath);
    assert.ok(logs.some((entry) => entry.step === 'VC_RUNTIME_CHECK'));
    assert.equal(
      logs.some((entry) => entry.step === 'INITDB'),
      false
    );
  });
});

test('certification Visual C++ Runtime install option still requires verified payload', async () => {
  await withCertificationEnv(async () => {
    const userDataPath = tempDir('epos-pg-vc-install-userdata-');
    const root = tempDir('managed-postgres-cert-vc-install-');
    const vcRoot = tempDir('epos-vc-runtime-install-missing-');
    const manifestSource = path.join(
      __dirname,
      '..',
      'resources',
      'prerequisites',
      'microsoft-vc-runtime',
      'manifest.json'
    );
    const manifest = JSON.parse(fs.readFileSync(manifestSource, 'utf8'));
    fs.writeFileSync(
      path.join(vcRoot, 'manifest.json'),
      `${JSON.stringify({ ...manifest, minimumVersion: '99.0.0.0' }, null, 2)}\n`
    );
    const result = await provisioningService.startManagedPostgresProvisioning({
      userDataPath,
      certification: {
        enabled: true,
        token: provisioningService.CERTIFICATION_TOKEN,
        root,
        archivePath: ARCHIVE_PATH,
        database: `epos_cert_vc_install_${Date.now()}`,
        vcRuntimeRoot: vcRoot,
        installVcRuntime: true,
        safeStorage: fakeSafeStorage(),
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'VC_RUNTIME_PAYLOAD_MISSING');
    const logs = provisioningRepository.readProvisioningLogs(userDataPath);
    assert.ok(logs.some((entry) => entry.step === 'VC_RUNTIME_INSTALL'));
    assert.equal(
      logs.some((entry) => entry.step === 'INITDB'),
      false
    );
  });
});

test('certification provisioning stages PostgreSQL archive with explicit manifest root', async () => {
  const previousCwd = process.cwd();
  const previousAssess = vcRuntimePrerequisite.assessVcRuntimePrerequisite;
  const wrongCwd = tempDir('epos-pg-wrong-cwd-');
  const payloadRoot = tempDir('epos-pg-explicit-payload-root-');
  const manifestSource = path.join(__dirname, '..', 'resources', 'postgres', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestSource, 'utf8'));
  const archivePath = path.join(payloadRoot, manifest.fileName);
  await createMinimalPostgresArchive(archivePath);
  fs.writeFileSync(
    path.join(payloadRoot, 'manifest.json'),
    `${JSON.stringify({ ...manifest, sha256: sha256File(archivePath) }, null, 2)}\n`
  );
  fs.writeFileSync(path.join(payloadRoot, 'POSTGRESQL-LICENSE.txt'), 'PostgreSQL License\n');
  fs.writeFileSync(path.join(payloadRoot, 'THIRD-PARTY-NOTICES.md'), 'Third-party notices\n');

  vcRuntimePrerequisite.assessVcRuntimePrerequisite = () => ({
    detection: { compatible: true },
    code: 'VC_RUNTIME_AVAILABLE',
  });

  await withCertificationEnv(async () => {
    try {
      process.chdir(wrongCwd);
      const result = await provisioningService.startManagedPostgresProvisioning({
        userDataPath: tempDir('epos-pg-explicit-payload-userdata-'),
        certification: {
          enabled: true,
          token: provisioningService.CERTIFICATION_TOKEN,
          root: tempDir('managed-postgres-cert-explicit-payload-'),
          archivePath,
          payloadRoot,
          database: `epos_cert_explicit_payload_${Date.now()}`,
          safeStorage: fakeSafeStorage(),
        },
      });

      assert.equal(result.ok, false);
      assert.notEqual(result.code, 'INSTALLER_POSTGRES_PAYLOAD_MANIFEST_MISSING');
      assert.ok(
        result.operation?.transitions?.some((transition) => transition.to === 'PAYLOAD_STAGED')
      );
    } finally {
      process.chdir(previousCwd);
      vcRuntimePrerequisite.assessVcRuntimePrerequisite = previousAssess;
    }
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
        payloadRoot: path.join(__dirname, '..', 'resources', 'postgres'),
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
        payloadRoot: path.join(__dirname, '..', 'resources', 'postgres'),
        database: `epos_cert_${Date.now()}`,
        safeStorage: fakeSafeStorage(),
      },
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.code, 'INSTALLER_POSTGRES_PROVISIONING_ALREADY_COMPLETED');
  });
});
