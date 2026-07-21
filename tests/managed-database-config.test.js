const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const env = require('../src/main/config/env');
const configStore = require('../src/main/installer/installer-config.store');
const diagnostics = require('../src/main/installer/installer-diagnostics.service');
const managedIdentity = require('../src/main/installer/managed-database-identity.model');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fakeSafeStorage(overrides = {}) {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`sealed:${value}`, 'utf8'),
    decryptString: (buffer) => String(buffer).replace(/^sealed:/, ''),
    ...overrides,
  };
}

function withCleanDatabaseEnv(callback, production = false) {
  const names = [
    'DATABASE_URL',
    'PGHOST',
    'PGPORT',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
    'PGSSLMODE',
    'NODE_ENV',
    'ELECTRON_IS_PACKAGED',
    'ENTERPRISE_POS_DB_CONFIG_SOURCE',
    'ENTERPRISE_POS_DB_CONFIG_MODE',
    'ENTERPRISE_POS_INSTALLATION_ID',
    'ENTERPRISE_POS_MANAGED_CLUSTER_ID',
    'ENTERPRISE_POS_MANAGED_DATABASE_ID',
    'ENTERPRISE_POS_MANAGED_IDENTITY_FINGERPRINT',
    'ENTERPRISE_POS_INSTALLER_CONFIG_ERROR_CODE',
  ];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  if (production) {
    process.env.NODE_ENV = 'production';
    process.env.ELECTRON_IS_PACKAGED = 'true';
  }
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

test('managed installer configuration persists lifecycle metadata without plaintext credentials', () => {
  const dir = tempDir('epos-managed-db-config-');
  const result = configStore.saveInstallationConfig(
    dir,
    {
      mode: configStore.CONFIG_MODES.INSTALLER_MANAGED,
      host: '127.0.0.1',
      port: 55432,
      database: 'enterprise_pos_shop',
      username: 'enterprise_pos_app',
      password: 'do-not-store-plain',
      sslMode: 'disable',
      installationId: 'installation-001',
      lastSuccessfulConnectionAt: '2026-07-19T00:00:00.000Z',
      managedPostgres: {
        runtimeRoot: 'C:\\ProgramData\\EnterprisePOS\\postgres-runtime',
        dataDir: 'C:\\ProgramData\\EnterprisePOS\\postgres-data',
        port: 55432,
      },
    },
    { safeStorage: fakeSafeStorage(), now: '2026-07-19T01:00:00.000Z' }
  );

  assert.equal(result.ok, true);
  assert.equal(result.config.mode, configStore.CONFIG_MODES.INSTALLER_MANAGED);
  assert.equal(result.config.passwordStored, true);
  assert.equal(result.config.integrity.present, true);

  const raw = fs.readFileSync(configStore.installationConfigPath(dir), 'utf8');
  assert.doesNotMatch(raw, /do-not-store-plain/);
  assert.match(raw, /sha256-config-record-v1/);

  const loaded = configStore.loadInstallationConfig(dir, {
    includePassword: true,
    safeStorage: fakeSafeStorage(),
  });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.config.password, 'do-not-store-plain');
  assert.equal(loaded.config.managedPostgres.port, 55432);
  assert.equal(loaded.config.managedIdentity.installationId, 'installation-001');
  assert.equal(loaded.config.managedIdentity.databaseName, 'enterprise_pos_shop');
  assert.match(loaded.config.managedIdentity.clusterId, /^cluster_[a-f0-9]{36}$/);
  assert.match(loaded.config.managedIdentity.databaseId, /^database_[a-f0-9]{36}$/);
  assert.match(loaded.config.managedIdentity.fingerprint, /^[a-f0-9]{64}$/);
});

test('packaged startup can resolve database config from managed store with no database env file', async () => {
  await withCleanDatabaseEnv(async () => {
    const dir = tempDir('epos-managed-db-startup-');
    configStore.saveInstallationConfig(
      dir,
      {
        mode: configStore.CONFIG_MODES.INSTALLER_MANAGED,
        host: '127.0.0.1',
        port: 55433,
        database: 'enterprise_pos_runtime',
        username: 'enterprise_pos_app',
        password: 'managed-secret',
        sslMode: 'disable',
      },
      { safeStorage: fakeSafeStorage() }
    );

    const applied = configStore.loadAndApplyInstallationConfig(dir, {
      safeStorage: fakeSafeStorage(),
    });
    assert.equal(applied.ok, true);
    assert.equal(process.env.DATABASE_URL, undefined);
    const loaded = configStore.loadInstallationConfig(dir, {
      safeStorage: fakeSafeStorage(),
    });
    assert.equal(loaded.ok, true);
    assert.equal(process.env.ENTERPRISE_POS_INSTALLATION_ID, applied.config.installationId);
    assert.equal(
      process.env.ENTERPRISE_POS_MANAGED_CLUSTER_ID,
      loaded.config.managedIdentity.clusterId
    );
    assert.equal(
      process.env.ENTERPRISE_POS_MANAGED_DATABASE_ID,
      loaded.config.managedIdentity.databaseId
    );

    const resolved = env.getDatabaseConfig();
    assert.equal(resolved.host, '127.0.0.1');
    assert.equal(resolved.port, 55433);
    assert.equal(resolved.database, 'enterprise_pos_runtime');
    assert.equal(resolved.user, 'enterprise_pos_app');
    assert.equal(resolved.password, 'managed-secret');
    assert.equal(resolved.source, 'installer-config');
    assert.equal(resolved.mode, configStore.CONFIG_MODES.INSTALLER_MANAGED);
  }, true);
});

test('managed database identity rejects copied configuration targeting another database marker', () => {
  const local = managedIdentity.createLocalManagedIdentity({
    installationId: 'installation-current',
    clusterId: 'cluster-current',
    databaseId: 'database-current',
    databaseName: 'enterprise_pos',
    createdAt: '2026-07-21T00:00:00.000Z',
  });
  const copied = managedIdentity.createLocalManagedIdentity({
    installationId: 'installation-other',
    clusterId: local.clusterId,
    databaseId: local.databaseId,
    databaseName: 'enterprise_pos',
    createdAt: '2026-07-21T00:00:00.000Z',
  });

  const accepted = managedIdentity.validateIdentityPair(local, local);
  assert.equal(accepted.ok, true);

  const rejected = managedIdentity.validateIdentityPair(local, copied);
  assert.equal(rejected.ok, false);
  assert(rejected.blockers.includes('identity.installationId.mismatch'));
  assert(rejected.blockers.includes('identity.fingerprint.mismatch'));
  assert.doesNotMatch(JSON.stringify(rejected), /password|secret|postgres:\/\//i);
});

test('packaged startup without managed config fails with a guided setup code, not .env instructions', async () => {
  await withCleanDatabaseEnv(async () => {
    assert.throws(
      () => env.getDatabaseConfig(),
      (error) => {
        assert.equal(error.code, 'MANAGED_DATABASE_CONFIG_MISSING');
        assert.doesNotMatch(error.message, /PGHOST|PGPASSWORD|\.env/i);
        return true;
      }
    );
  }, true);
});

test('corrupt or undecryptable managed config returns structured recovery errors', () => {
  const corruptDir = tempDir('epos-managed-db-corrupt-');
  fs.writeFileSync(configStore.installationConfigPath(corruptDir), '{not json');
  assert.equal(
    configStore.loadInstallationConfig(corruptDir).code,
    'MANAGED_DATABASE_CONFIG_CORRUPT'
  );

  const credentialDir = tempDir('epos-managed-db-credential-');
  configStore.saveInstallationConfig(
    credentialDir,
    {
      mode: configStore.CONFIG_MODES.INSTALLER_MANAGED,
      database: 'enterprise_pos_credential',
      username: 'enterprise_pos_app',
      password: 'secret',
    },
    { safeStorage: fakeSafeStorage() }
  );
  const loaded = configStore.loadInstallationConfig(credentialDir, {
    includePassword: true,
    safeStorage: fakeSafeStorage({
      decryptString: () => {
        throw new Error('cannot decrypt');
      },
    }),
  });
  assert.equal(loaded.ok, false);
  assert.equal(loaded.code, 'MANAGED_DATABASE_CREDENTIAL_DECRYPT_FAILED');
});

test('managed production configuration rejects unsafe database identities', async () => {
  assert.throws(
    () =>
      configStore.normalizeDatabaseConfig({
        mode: configStore.CONFIG_MODES.INSTALLER_MANAGED,
        database: 'postgres',
      }),
    /System PostgreSQL databases/
  );
  assert.throws(
    () =>
      configStore.normalizeDatabaseConfig({
        mode: configStore.CONFIG_MODES.INSTALLER_MANAGED,
        database: 'epos_cert_not_production',
      }),
    /Disposable certification databases/
  );

  await withCleanDatabaseEnv(async () => {
    process.env.PGHOST = 'localhost';
    process.env.PGPORT = '5432';
    process.env.PGDATABASE = 'epos_cert_not_production';
    process.env.PGUSER = 'postgres';
    process.env.PGPASSWORD = 'secret';
    assert.throws(() => env.getDatabaseConfig(), {
      code: 'MANAGED_DATABASE_IDENTITY_UNSAFE',
    });
  }, true);
});

test('development database environment support remains available', async () => {
  await withCleanDatabaseEnv(async () => {
    process.env.PGDATABASE = 'star';
    const resolved = env.getDatabaseConfig();
    assert.equal(resolved.database, 'star');
    assert.equal(resolved.user, 'postgres');
    assert.equal(resolved.source, 'pg_env');
  }, false);
});

test('legacy production database environment can be migrated into managed config storage', async () => {
  await withCleanDatabaseEnv(async () => {
    const legacyEnv = {
      DATABASE_URL:
        'postgresql://enterprise_pos_app:legacy-secret@127.0.0.1:55434/enterprise_pos_legacy?sslmode=disable',
    };
    const payload = configStore.createConfigFromEnvironment(legacyEnv, {
      installerVersion: '1.0.0',
      legacyMigratedAt: '2026-07-19T02:00:00.000Z',
    });
    assert.equal(payload.database, 'enterprise_pos_legacy');
    assert.equal(payload.username, 'enterprise_pos_app');
    assert.equal(payload.password, 'legacy-secret');
    assert.equal(payload.mode, configStore.CONFIG_MODES.EXTERNALLY_MANAGED);

    const dir = tempDir('epos-legacy-env-migration-');
    configStore.saveInstallationConfig(dir, payload, {
      safeStorage: fakeSafeStorage(),
      now: '2026-07-19T02:01:00.000Z',
    });
    const raw = fs.readFileSync(configStore.installationConfigPath(dir), 'utf8');
    assert.doesNotMatch(raw, /legacy-secret/);
    assert.match(raw, /2026-07-19T02:00:00.000Z/);

    const applied = configStore.loadAndApplyInstallationConfig(dir, {
      safeStorage: fakeSafeStorage(),
    });
    assert.equal(applied.ok, true);
    assert.equal(process.env.DATABASE_URL, undefined);
    assert.equal(env.getDatabaseConfig().database, 'enterprise_pos_legacy');
  }, true);
});

test('renderer-facing installer health never exposes managed database password', async () => {
  const dir = tempDir('epos-managed-db-health-');
  configStore.saveInstallationConfig(
    dir,
    {
      mode: configStore.CONFIG_MODES.INSTALLER_MANAGED,
      database: 'enterprise_pos_health',
      username: 'enterprise_pos_app',
      password: 'health-secret',
    },
    { safeStorage: fakeSafeStorage() }
  );

  const status = await diagnostics.assessInstallerHealth({ userDataPath: dir });
  const serialized = JSON.stringify(status);
  assert.doesNotMatch(serialized, /health-secret/);
  assert.equal(status.configuration.passwordStored, true);
  assert.equal(status.configuration.password, undefined);
});
