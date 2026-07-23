const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const configStore = require('../../src/main/installer/installer-config.store');
const upgradeService = require('../../src/main/upgrade/upgrade.service');
const { UPGRADE_STATES } = require('../../src/main/upgrade/upgrade-state.model');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-pos-upgrade-config-'));
}

function fakeSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (buffer) => String(buffer).replace(/^encrypted:/, ''),
  };
}

function managedPayload(overrides = {}) {
  return {
    mode: configStore.CONFIG_MODES.INSTALLER_MANAGED,
    host: '127.0.0.1',
    port: 55432,
    database: 'enterprise_pos',
    username: 'enterprise_pos',
    password: 'database-secret',
    sslMode: 'disable',
    installerVersion: '1.0.0',
    installationId: 'installation-a',
    managedPostgres: {
      runtimeRoot: 'C:\\EnterprisePOS\\postgres-runtime',
      dataDir: 'C:\\EnterprisePOS\\postgres-data',
      port: 55432,
      clusterId: 'cluster-a',
      databaseId: 'database-a',
    },
    managedIdentity: {
      installationId: 'installation-a',
      clusterId: 'cluster-a',
      databaseId: 'database-a',
      databaseName: 'enterprise_pos',
      owner: 'Enterprise POS',
      schemaVersion: 1,
      fingerprint: 'fingerprint-a',
    },
    ...overrides,
  };
}

test('metadata update preserves managed identity and encrypted credential', () => {
  const dir = tempDir();
  const safeStorage = fakeSafeStorage();
  const saved = configStore.saveInstallationConfig(dir, managedPayload(), { safeStorage });
  assert.equal(saved.ok, true);
  const before = configStore.loadInstallationConfig(dir, { includePassword: true, safeStorage });
  assert.equal(before.config.password, 'database-secret');

  const updated = configStore.updateInstallationMetadata(
    dir,
    { installerVersion: '1.1.0', lastSuccessfulConnectionAt: '2026-07-23T00:00:00.000Z' },
    { now: '2026-07-23T00:01:00.000Z' }
  );
  assert.equal(updated.ok, true);
  const after = configStore.loadInstallationConfig(dir, { includePassword: true, safeStorage });

  assert.equal(after.config.installerVersion, '1.1.0');
  assert.equal(after.config.password, 'database-secret');
  assert.equal(after.config.managedIdentity.installationId, 'installation-a');
  assert.equal(after.config.managedIdentity.databaseId, 'database-a');
});

test('existing managed installation requires upgrade instead of fresh setup', () => {
  const dir = tempDir();
  configStore.saveInstallationConfig(dir, managedPayload(), { safeStorage: fakeSafeStorage() });

  const result = upgradeService.classifyUpgradeStartup({
    userDataPath: dir,
    targetVersion: '1.1.0',
  });

  assert.equal(result.state, UPGRADE_STATES.PRE_UPGRADE_BACKUP_REQUIRED);
  assert.equal(result.sourceVersion, '1.0.0');
});

test('missing config with managed artifacts fails closed instead of fresh provisioning', () => {
  const dir = tempDir();
  fs.mkdirSync(path.join(dir, 'managed-postgres'), { recursive: true });

  const result = upgradeService.classifyUpgradeStartup({
    userDataPath: dir,
    targetVersion: '1.1.0',
  });

  assert.equal(result.state, UPGRADE_STATES.FAILED_CLOSED);
});

test('pre-upgrade backup gate accepts repository verificationStatus contract', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'main', 'upgrade', 'upgrade.service.js'),
    'utf8'
  );

  assert.match(source, /function backupVerificationPassed/);
  assert.match(source, /verification\.verificationStatus \|\| verification\.status/);
  assert.doesNotMatch(source, /verification\.status !== 'passed'/);
});
