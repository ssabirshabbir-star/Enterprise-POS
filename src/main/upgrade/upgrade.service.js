const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { withTransaction } = require('../database/connection');
const migrationLedger = require('../database/migrations');
const settingsRepository = require('../features/settings/settings.repository');
const configStore = require('../installer/installer-config.store');
const { managedInstallRoot } = require('../installer/postgres-provisioning.service');
const { MANAGED_POSTGRES_MAJOR } = require('../installer/postgres-version-policy');
const journalStore = require('./upgrade-journal.store');
const { UPGRADE_STATES, isTerminalState } = require('./upgrade-state.model');

function codeError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function compareVersions(left = '0.0.0', right = '0.0.0') {
  const l = String(left || '0.0.0')
    .split('.')
    .map((part) => Number(part) || 0);
  const r = String(right || '0.0.0')
    .split('.')
    .map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(l.length, r.length); index += 1) {
    const delta = (l[index] || 0) - (r[index] || 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function redactedPathCategory(filePath, userDataPath) {
  const relative = path.relative(userDataPath, filePath);
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return `%USER_DATA%\\${relative.replace(/\//g, '\\')}`;
  }
  return path.basename(filePath);
}

function hasManagedArtifacts(userDataPath) {
  return fs.existsSync(managedInstallRoot(userDataPath));
}

function loadActiveJournal(userDataPath) {
  const loaded = journalStore.readJournal(userDataPath);
  if (!loaded.ok) return loaded;
  if (isTerminalState(loaded.journal.state)) return loaded;
  return loaded;
}

function classifyUpgradeStartup({
  userDataPath,
  targetVersion,
  loadConfig = configStore.loadInstallationConfig,
} = {}) {
  const journal = loadActiveJournal(userDataPath);
  if (journal.ok && !isTerminalState(journal.journal.state)) {
    return {
      ok: true,
      state: UPGRADE_STATES.RECOVERY_REQUIRED,
      code: 'UPGRADE_ACTIVE_JOURNAL_REQUIRES_RECOVERY',
      journal: journal.journal,
    };
  }
  if (!journal.ok && journal.code && journal.code !== 'UPGRADE_JOURNAL_MISSING') {
    return {
      ok: true,
      state: UPGRADE_STATES.RECOVERY_REQUIRED,
      code: journal.code,
    };
  }

  const loaded = loadConfig(userDataPath, { includePassword: false });
  if (!loaded.ok) {
    if (loaded.code === 'INSTALLER_CONFIG_MISSING' && !hasManagedArtifacts(userDataPath)) {
      return { ok: true, state: UPGRADE_STATES.FRESH_INSTALL, code: 'FRESH_INSTALL' };
    }
    return {
      ok: true,
      state: UPGRADE_STATES.FAILED_CLOSED,
      code: loaded.code || 'INSTALLER_CONFIG_UNREADABLE',
    };
  }

  const config = loaded.config;
  if (config.mode !== configStore.CONFIG_MODES.INSTALLER_MANAGED) {
    return {
      ok: true,
      state: UPGRADE_STATES.EXISTING_INSTALL_READY,
      code: 'UPGRADE_SCOPE_NOT_INSTALLER_MANAGED',
      config,
    };
  }
  const sourceVersion = config.installerVersion || '0.0.0';
  if (compareVersions(sourceVersion, targetVersion) < 0) {
    return {
      ok: true,
      state: UPGRADE_STATES.PRE_UPGRADE_BACKUP_REQUIRED,
      code: 'PRE_UPGRADE_BACKUP_REQUIRED',
      sourceVersion,
      targetVersion,
      config,
    };
  }
  return {
    ok: true,
    state: UPGRADE_STATES.EXISTING_INSTALL_READY,
    code: 'EXISTING_INSTALL_READY',
    sourceVersion,
    targetVersion,
    config,
  };
}

function backupManifestHash(backupResult = {}, verification = {}) {
  return (
    backupResult.integrityHash ||
    verification.summary?.checksum ||
    verification.manifest?.integrityHash ||
    verification.backupId ||
    null
  );
}

function backupVerificationPassed(verification = {}) {
  return (verification.verificationStatus || verification.status) === 'passed';
}

function isResumableJournalState(state) {
  return [
    UPGRADE_STATES.PRE_UPGRADE_BACKUP_REQUIRED,
    UPGRADE_STATES.PRE_UPGRADE_BACKUP_VERIFIED,
    UPGRADE_STATES.MIGRATION_REQUIRED,
    UPGRADE_STATES.MIGRATION_IN_PROGRESS,
    UPGRADE_STATES.MIGRATION_COMPLETED,
    UPGRADE_STATES.UPGRADE_VALIDATION_REQUIRED,
  ].includes(state);
}

function resolveJournalBackupPath(backup = {}, userDataPath) {
  if (backup.path && path.isAbsolute(backup.path)) return backup.path;
  if (backup.pathCategory && String(backup.pathCategory).startsWith('%USER_DATA%\\')) {
    return path.join(userDataPath, String(backup.pathCategory).slice('%USER_DATA%\\'.length));
  }
  return backup.path || null;
}

function assertVerifiedJournalBackup(journal = {}, userDataPath) {
  const backup = journal.backup || {};
  if (!backup.backupId || !backup.sha256 || backup.verificationStatus !== 'passed') {
    throw codeError(
      'PRE_UPGRADE_BACKUP_VERIFICATION_REQUIRED',
      'Interrupted upgrade cannot resume without a verified pre-upgrade backup.'
    );
  }
  const backupPath = resolveJournalBackupPath(backup, userDataPath);
  if (!backupPath || !fs.existsSync(backupPath)) {
    throw codeError(
      'PRE_UPGRADE_BACKUP_REFERENCE_MISSING',
      'Interrupted upgrade backup reference is not available.'
    );
  }
  const actualSha256 = fileSha256(backupPath);
  if (actualSha256 !== backup.sha256) {
    throw codeError(
      'PRE_UPGRADE_BACKUP_REFERENCE_MISMATCH',
      'Interrupted upgrade backup reference failed SHA-256 verification.'
    );
  }
  return { ...backup, path: backupPath };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCertificationCheckpoint(checkpoint, { userDataPath } = {}) {
  if (process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT !== checkpoint) return { ok: true };

  const markerPath =
    process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_FILE ||
    path.join(userDataPath, `enterprise-pos-upgrade-checkpoint-${checkpoint}.json`);
  const releasePath = process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_RELEASE_FILE || null;
  const maxWaitMs = Number(process.env.ENTERPRISE_POS_CERT_UPGRADE_CHECKPOINT_MAX_WAIT_MS || 0);
  const startedAt = Date.now();
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(
    markerPath,
    `${JSON.stringify(
      {
        checkpoint,
        pid: process.pid,
        reachedAt: new Date().toISOString(),
        releaseRequired: Boolean(releasePath),
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );

  while (releasePath && !fs.existsSync(releasePath)) {
    if (maxWaitMs > 0 && Date.now() - startedAt > maxWaitMs) {
      throw codeError(
        'UPGRADE_CERTIFICATION_CHECKPOINT_TIMEOUT',
        'Certification upgrade checkpoint timed out before release.'
      );
    }
    await delay(250);
  }
  return { ok: true, markerPath };
}

async function createVerifiedPreUpgradeBackup({
  userDataPath,
  sourceVersion,
  targetVersion,
  exportBackup = settingsRepository.exportBackup,
  verifyRestorePackage = settingsRepository.verifyRestorePackage,
} = {}) {
  const backupDir = path.join(userDataPath, 'backups', 'upgrade');
  fs.mkdirSync(backupDir, { recursive: true });
  const safeSource = String(sourceVersion || 'unknown').replace(/[^0-9A-Za-z._-]/g, '_');
  const safeTarget = String(targetVersion || 'unknown').replace(/[^0-9A-Za-z._-]/g, '_');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(
    backupDir,
    `enterprise-pos-pre-upgrade-${safeSource}-to-${safeTarget}-${stamp}.json`
  );
  const backup = await exportBackup(backupPath, null, { reason: 'pre-upgrade' });
  const verification = await verifyRestorePackage(backupPath);
  if (!backup?.filePath || !fs.existsSync(backupPath) || !backupVerificationPassed(verification)) {
    throw codeError(
      'PRE_UPGRADE_BACKUP_VERIFICATION_FAILED',
      'Pre-upgrade backup could not be verified.'
    );
  }
  const sha256 = fileSha256(backupPath);
  return {
    backupId: backup.backupId,
    logId: backup.logId || null,
    fileName: path.basename(backupPath),
    path: backupPath,
    pathCategory: redactedPathCategory(backupPath, userDataPath),
    sha256,
    manifestHash: backupManifestHash(backup, verification) || sha256,
    verificationStatus: verification.verificationStatus || verification.status || null,
    createdAt: new Date().toISOString(),
  };
}

async function tableCount(client, tableName) {
  const exists = await client.query('SELECT to_regclass($1) AS table_name', [
    `public.${tableName}`,
  ]);
  if (!exists.rows[0]?.table_name) return null;
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count || 0);
}

async function validatePostUpgrade({
  config,
  sourceVersion,
  targetVersion,
  validateManagedDatabaseIdentity = settingsRepository.validateManagedDatabaseIdentity,
} = {}) {
  const identity = await validateManagedDatabaseIdentity(config.managedIdentity);
  if (!identity.ok) {
    throw codeError(
      identity.code || 'UPGRADE_MANAGED_DATABASE_IDENTITY_MISMATCH',
      'Managed database identity changed during upgrade.'
    );
  }
  return withTransaction(async (client) => {
    const server = await client.query("SELECT current_setting('server_version') AS version");
    const users = await tableCount(client, 'users');
    if (users === 0) {
      throw codeError('UPGRADE_VALIDATION_USERS_MISSING', 'Existing users were not preserved.');
    }
    const admin = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM users
      JOIN roles ON roles.id = users.role_id
      WHERE roles.name = 'Admin'
    `);
    if (Number(admin.rows[0]?.count || 0) < 1) {
      throw codeError(
        'UPGRADE_VALIDATION_ADMIN_MISSING',
        'Existing administrator was not preserved.'
      );
    }
    const ledger = await migrationLedger.getAppliedMigrationIds(client);
    return {
      ok: true,
      sourceVersion,
      targetVersion,
      postgresVersion: server.rows[0]?.version || null,
      postgresMajor: MANAGED_POSTGRES_MAJOR,
      counts: {
        users,
        products: await tableCount(client, 'products'),
        inventory: await tableCount(client, 'inventory'),
        purchases: await tableCount(client, 'purchases'),
        invoices: await tableCount(client, 'invoices'),
        customers: await tableCount(client, 'customers'),
        suppliers: await tableCount(client, 'suppliers'),
      },
      migrationLedgerSize: ledger.size,
    };
  });
}

async function performStartupUpgrade({ userDataPath, targetVersion, dependencies = {} } = {}) {
  const loadInstallationConfig =
    dependencies.loadInstallationConfig || configStore.loadInstallationConfig;
  const existingJournal = journalStore.readJournal(userDataPath);
  let resumeJournal = null;
  let resumeConfig = null;

  if (existingJournal.ok && !isTerminalState(existingJournal.journal.state)) {
    const loaded = loadInstallationConfig(userDataPath, { includePassword: false });
    if (!loaded.ok) {
      throw codeError(
        loaded.code || 'UPGRADE_INSTALLER_CONFIG_UNREADABLE',
        'Enterprise POS upgrade cannot resume without readable installer configuration.'
      );
    }
    if (!loaded.config.managedIdentity) {
      throw codeError(
        'UPGRADE_MANAGED_IDENTITY_MISSING',
        'Installer-managed identity is required before upgrade.'
      );
    }
    if (!journalStore.bindMatches(existingJournal.journal, loaded.config.managedIdentity)) {
      throw codeError(
        'UPGRADE_JOURNAL_IDENTITY_MISMATCH',
        'Interrupted upgrade journal does not match this managed installation.'
      );
    }
    if (
      existingJournal.journal.targetVersion &&
      existingJournal.journal.targetVersion !== targetVersion
    ) {
      throw codeError(
        'UPGRADE_JOURNAL_TARGET_VERSION_MISMATCH',
        'Interrupted upgrade journal targets a different application version.'
      );
    }
    if (!isResumableJournalState(existingJournal.journal.state)) {
      throw codeError(
        'UPGRADE_ACTIVE_JOURNAL_REQUIRES_RECOVERY',
        'Enterprise POS upgrade requires controlled recovery.'
      );
    }
    resumeJournal = existingJournal.journal;
    resumeConfig = loaded.config;
  }

  const classification = resumeJournal
    ? {
        ok: true,
        state: resumeJournal.state,
        code: 'UPGRADE_RESUME_REQUIRED',
        sourceVersion: resumeJournal.sourceVersion,
        targetVersion: resumeJournal.targetVersion || targetVersion,
        config: resumeConfig,
      }
    : classifyUpgradeStartup({
        userDataPath,
        targetVersion,
        loadConfig: dependencies.loadInstallationConfig,
      });
  if (classification.state === UPGRADE_STATES.FRESH_INSTALL) return classification;
  if (classification.state === UPGRADE_STATES.EXISTING_INSTALL_READY) return classification;
  if (
    [UPGRADE_STATES.RECOVERY_REQUIRED, UPGRADE_STATES.FAILED_CLOSED].includes(classification.state)
  ) {
    throw codeError(classification.code, 'Enterprise POS upgrade requires controlled recovery.');
  }

  const config = classification.config;
  if (!config.managedIdentity) {
    throw codeError(
      'UPGRADE_MANAGED_IDENTITY_MISSING',
      'Installer-managed identity is required before upgrade.'
    );
  }
  let journal = resumeJournal
    ? resumeJournal
    : journalStore.createJournal({
        installationIdentity: config.managedIdentity,
        databaseIdentity: config.managedIdentity,
        sourceVersion: classification.sourceVersion,
        targetVersion,
        postgresMajor: MANAGED_POSTGRES_MAJOR,
      });
  journalStore.writeJournal(userDataPath, journal);

  try {
    let backup = journal.backup;
    if (journal.state === UPGRADE_STATES.PRE_UPGRADE_BACKUP_REQUIRED) {
      journal = journalStore.transitionJournal(
        journal,
        UPGRADE_STATES.PRE_UPGRADE_BACKUP_IN_PROGRESS,
        {
          reason: 'pre_upgrade_backup_started',
        }
      );
      journalStore.writeJournal(userDataPath, journal);

      backup = await createVerifiedPreUpgradeBackup({
        userDataPath,
        sourceVersion: classification.sourceVersion,
        targetVersion,
        exportBackup: dependencies.exportBackup,
        verifyRestorePackage: dependencies.verifyRestorePackage,
      });
      journal = journalStore.transitionJournal(
        journal,
        UPGRADE_STATES.PRE_UPGRADE_BACKUP_VERIFIED,
        {
          reason: 'pre_upgrade_backup_verified',
          backup,
        }
      );
      journalStore.writeJournal(userDataPath, journal);
      await waitForCertificationCheckpoint('after-pre-upgrade-backup-verified', { userDataPath });
    } else {
      backup = assertVerifiedJournalBackup(journal, userDataPath);
    }

    if (journal.state === UPGRADE_STATES.PRE_UPGRADE_BACKUP_VERIFIED) {
      journal = journalStore.transitionJournal(journal, UPGRADE_STATES.MIGRATION_REQUIRED, {
        reason: 'migration_required',
      });
      journalStore.writeJournal(userDataPath, journal);
    }
    if (journal.state === UPGRADE_STATES.MIGRATION_REQUIRED) {
      journal = journalStore.transitionJournal(journal, UPGRADE_STATES.MIGRATION_IN_PROGRESS, {
        reason: 'migration_started',
      });
      journalStore.writeJournal(userDataPath, journal);
    }

    if (journal.state === UPGRADE_STATES.MIGRATION_IN_PROGRESS) {
      const runMigrations =
        dependencies.runDatabaseMigrationsInTransaction ||
        ((options) =>
          withTransaction((client) => migrationLedger.runDatabaseMigrations(client, options)));
      const migrationResult = await runMigrations({
        sourceVersion: classification.sourceVersion,
        targetVersion,
        requireVerifiedBackupForSchemaChange: true,
        preUpgradeBackupVerified: true,
        backup,
        upgradeOperationId: journal.operationId,
        migrations: dependencies.migrations,
      });
      journal = journalStore.transitionJournal(journal, UPGRADE_STATES.MIGRATION_COMPLETED, {
        reason: 'migration_completed',
        migrationLedger: {
          pending: [],
          applied: migrationResult.executed || [],
        },
      });
      journalStore.writeJournal(userDataPath, journal);
    }

    if (journal.state === UPGRADE_STATES.MIGRATION_COMPLETED) {
      journal = journalStore.transitionJournal(
        journal,
        UPGRADE_STATES.UPGRADE_VALIDATION_REQUIRED,
        {
          reason: 'post_upgrade_validation_required',
        }
      );
      journalStore.writeJournal(userDataPath, journal);
    }
    const validateUpgrade = dependencies.validatePostUpgrade || validatePostUpgrade;
    const validation = await validateUpgrade({
      config,
      sourceVersion: classification.sourceVersion,
      targetVersion,
      validateManagedDatabaseIdentity: dependencies.validateManagedDatabaseIdentity,
    });
    const metadataResult = (
      dependencies.updateInstallationMetadata || configStore.updateInstallationMetadata
    )(userDataPath, {
      installerVersion: targetVersion,
      lastSuccessfulConnectionAt: new Date().toISOString(),
    });
    if (!metadataResult.ok) {
      throw codeError(
        metadataResult.code || 'UPGRADE_CONFIG_METADATA_UPDATE_FAILED',
        'Upgrade metadata could not be recorded.'
      );
    }
    journal = journalStore.transitionJournal(journal, UPGRADE_STATES.UPGRADE_COMPLETED, {
      reason: 'upgrade_validation_completed',
      migrationLedger: {
        ...(journal.migrationLedger || {}),
        validation,
      },
    });
    journalStore.writeJournal(userDataPath, journal);
    return { ok: true, state: UPGRADE_STATES.UPGRADE_COMPLETED, journal, validation };
  } catch (error) {
    const failed = journalStore.transitionJournal(journal, UPGRADE_STATES.RECOVERY_REQUIRED, {
      reason: 'upgrade_failed_closed',
      code: error.code || 'UPGRADE_FAILED',
      failure: {
        code: error.code || 'UPGRADE_FAILED',
        message: String(error.message || 'Upgrade failed.').slice(0, 240),
      },
    });
    journalStore.writeJournal(userDataPath, failed);
    throw error;
  }
}

module.exports = {
  classifyUpgradeStartup,
  compareVersions,
  createVerifiedPreUpgradeBackup,
  isResumableJournalState,
  performStartupUpgrade,
  assertVerifiedJournalBackup,
  validatePostUpgrade,
  waitForCertificationCheckpoint,
};
