const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const configStore = require('../../src/main/installer/installer-config.store');
const journalStore = require('../../src/main/upgrade/upgrade-journal.store');
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

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeVerifiedUpgradeJournal(dir, payload, backupOverrides = {}) {
  const backupPath = path.join(dir, 'backups', 'upgrade', 'verified-pre-upgrade.json');
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, '{"ok":true}\n');
  let journal = journalStore.createJournal({
    installationIdentity: payload.managedIdentity,
    databaseIdentity: payload.managedIdentity,
    sourceVersion: '1.0.0',
    targetVersion: '1.1.0',
    postgresMajor: 17,
  });
  journal = journalStore.transitionJournal(journal, UPGRADE_STATES.PRE_UPGRADE_BACKUP_IN_PROGRESS, {
    reason: 'pre_upgrade_backup_started',
  });
  journal = journalStore.transitionJournal(journal, UPGRADE_STATES.PRE_UPGRADE_BACKUP_VERIFIED, {
    reason: 'pre_upgrade_backup_verified',
    backup: {
      backupId: 'backup-interrupted-upgrade',
      fileName: path.basename(backupPath),
      path: backupPath,
      pathCategory: `%USER_DATA%\\backups\\upgrade\\${path.basename(backupPath)}`,
      sha256: sha256File(backupPath),
      manifestHash: 'manifest-hash',
      verificationStatus: 'passed',
      createdAt: '2026-07-23T00:00:00.000Z',
      ...backupOverrides,
    },
  });
  journalStore.writeJournal(dir, journal);
  return { backupPath, journal };
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

test('interrupted upgrade resumes from verified pre-upgrade backup journal', async () => {
  const dir = tempDir();
  const payload = managedPayload();
  writeVerifiedUpgradeJournal(dir, payload);
  let exportBackupCalled = false;
  let migrationsCalled = 0;

  const result = await upgradeService.performStartupUpgrade({
    userDataPath: dir,
    targetVersion: '1.1.0',
    dependencies: {
      loadInstallationConfig: () => ({ ok: true, config: payload }),
      exportBackup: async () => {
        exportBackupCalled = true;
        throw new Error('backup should not be recreated during verified resume');
      },
      runDatabaseMigrationsInTransaction: async (options) => {
        migrationsCalled += 1;
        assert.equal(options.preUpgradeBackupVerified, true);
        assert.equal(options.backup.backupId, 'backup-interrupted-upgrade');
        return { executed: ['20260723_resume_probe'] };
      },
      validatePostUpgrade: async () => ({
        ok: true,
        counts: { users: 1, products: 2, invoices: 1 },
      }),
      updateInstallationMetadata: () => ({ ok: true }),
    },
  });
  const loaded = journalStore.readJournal(dir);

  assert.equal(result.state, UPGRADE_STATES.UPGRADE_COMPLETED);
  assert.equal(exportBackupCalled, false);
  assert.equal(migrationsCalled, 1);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.journal.state, UPGRADE_STATES.UPGRADE_COMPLETED);
  assert.equal(loaded.journal.backup.backupId, 'backup-interrupted-upgrade');
});

test('interrupted upgrade with missing verified backup reference fails closed', async () => {
  const dir = tempDir();
  const payload = managedPayload();
  const { backupPath } = writeVerifiedUpgradeJournal(dir, payload);
  fs.unlinkSync(backupPath);

  await assert.rejects(
    () =>
      upgradeService.performStartupUpgrade({
        userDataPath: dir,
        targetVersion: '1.1.0',
        dependencies: {
          loadInstallationConfig: () => ({ ok: true, config: payload }),
          runDatabaseMigrationsInTransaction: async () => {
            throw new Error('migration must not run without verified backup file');
          },
          updateInstallationMetadata: () => ({ ok: true }),
        },
      }),
    /backup reference is not available/
  );
  const loaded = journalStore.readJournal(dir);

  assert.equal(loaded.ok, true);
  assert.equal(loaded.journal.state, UPGRADE_STATES.RECOVERY_REQUIRED);
  assert.equal(loaded.journal.failure.code, 'PRE_UPGRADE_BACKUP_REFERENCE_MISSING');
});
