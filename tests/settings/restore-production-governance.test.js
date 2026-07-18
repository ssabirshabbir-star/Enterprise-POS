const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const governance = require('../../src/main/features/restore-engine/restore-production-governance.model');
const recovery = require('../../src/main/features/restore-engine/restore-recovery-state.model');
const policy = require('../../src/main/features/restore-engine/restore-execution-policy.model');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('database identity fingerprint excludes credentials and rejects disposable targets', () => {
  const identity = governance.resolveDatabaseIdentity({
    connectionString: 'postgres://user:secret@localhost:5432/star',
  });
  assert.equal(identity.host, 'localhost');
  assert.equal(identity.port, 5432);
  assert.equal(identity.database, 'star');
  assert.equal(identity.credentialsExcluded, true);
  assert.doesNotMatch(JSON.stringify(identity), /secret|user:/);
  assert.match(identity.fingerprint, /^[a-f0-9]{64}$/);

  const disposable = governance.resolveDatabaseIdentity({
    host: 'localhost',
    port: 5432,
    database: 'enterprise_pos_restore_cert_deadbeef',
  });
  assert.equal(disposable.disposableCertificationDatabase, true);
  assert.equal(disposable.ambiguous, true);
});

test('durable final confirmation requires phrase, fingerprints, safety backup, and verified state', () => {
  const databaseIdentity = governance.resolveDatabaseIdentity({
    host: 'localhost',
    port: 5432,
    database: 'star',
  });
  const blocked = governance.createConfirmationRecord({
    operationId: '00000000-0000-4000-8000-000000000001',
    ownerUserId: 1,
    sourcePackageChecksum: 'source',
    safetyBackupChecksum: 'safety',
    databaseIdentity,
    preflightDigest: 'preflight',
    executionPolicyDigest: 'policy',
    recoveryState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
    typedPhrase: 'restore database',
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.blockers.join('\n'), /typed_phrase_mismatch/);

  const confirmation = governance.createConfirmationRecord({
    operationId: '00000000-0000-4000-8000-000000000001',
    ownerUserId: 1,
    sourcePackageChecksum: 'source',
    sourceManifestVersion: '1.0',
    safetyBackupChecksum: 'safety',
    databaseIdentity,
    preflightDigest: 'preflight',
    executionPolicyDigest: 'policy',
    recoveryState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
    typedPhrase: governance.FINAL_CONFIRMATION_PHRASE,
  });
  assert.equal(confirmation.ok, true);
  assert.match(confirmation.confirmationId, /^[0-9a-f-]{36}$/i);
  assert.match(confirmation.confirmationHash, /^[a-f0-9]{64}$/);
  assert.equal(confirmation.restoreExecutionAvailable, false);
});

test('startup recovery blocks dangerous restore states but permits safety-prepared state', () => {
  const dangerous = governance.assessStartupRecovery({
    operationId: 'op-1',
    currentState: recovery.RESTORE_RECOVERY_STATES.RESTORE_APPLIED,
  });
  assert.equal(dangerous.startupAllowed, false);
  assert.equal(dangerous.maintenanceModeRequired, true);
  assert.equal(dangerous.databaseMutationsBlocked, true);

  const prepared = governance.assessStartupRecovery({
    operationId: 'op-2',
    currentState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
  });
  assert.equal(prepared.startupAllowed, true);
  assert.equal(prepared.recoveryScreenRequired, true);
  assert.equal(prepared.databaseMutationsBlocked, false);
});

test('retention policy preserves dangerous artifacts and only marks terminal test artifacts eligible', () => {
  const dangerous = governance.classifyRetention({
    recoveryState: {
      currentState: recovery.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
      safetyBackupReference: {
        filePath:
          'C:/Users/Ahmad-PC/AppData/Local/Temp/epos-restore-prep-cert-x/backups/recovery/restore-safety-backup.json',
      },
    },
  });
  assert.equal(dangerous.testOnly, true);
  assert.equal(dangerous.cleanupEligible, false);

  const cancelled = governance.classifyRetention({
    recoveryState: {
      currentState: recovery.RESTORE_RECOVERY_STATES.CANCELLED,
      createdAt: '2026-07-01T00:00:00.000Z',
      safetyBackupReference: {
        filePath:
          'C:/Users/Ahmad-PC/AppData/Local/Temp/epos-restore-prep-cert-x/backups/recovery/restore-safety-backup.json',
      },
    },
  });
  assert.equal(cancelled.terminal, true);
  assert.equal(cancelled.cleanupEligible, true);
});

test('execution policy reports production governance blockers without activating restore', () => {
  const result = policy.createRestoreExecutionPolicy({
    recoveryState: {
      currentState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
      operationId: 'op-1',
      safetyBackupReference: { checksum: 'abc' },
    },
    operationLock: { locked: true, operationId: 'op-1' },
    productionGovernance: {
      databaseIdentity: governance.resolveDatabaseIdentity({
        host: 'localhost',
        port: 5432,
        database: 'star',
      }),
      finalConfirmationRequired: true,
      startupRecovery: governance.assessStartupRecovery({
        currentState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
      }),
      finalCertificationAssessment: governance.createFinalCertificationAssessment({
        databaseIdentityValid: true,
        safetyBackupVerified: true,
      }),
    },
  });

  assert.equal(result.executionEligible, false);
  assert.equal(result.executionCertified, false);
  assert.equal(result.restoreExecutionAvailable, false);
  assert.match(result.blockers.map((item) => item.code).join('\n'), /final_confirmation\.required/);
  assert.equal(result.databaseIdentity.credentialsExcluded, true);
});

test('settings UI exposes confirmation evidence and recovery assessment but no production execution route', () => {
  const controller = read('src/main/features/settings/settings.controller.js');
  const preload = read('src/main/preload.js');
  const api = read('src/main/features/settings/settings.api.js');
  const renderer = read('src/main/features/settings/settings.renderer.js');
  const html = read('src/main/features/settings/index.html');
  const main = read('src/main/main.js');
  const schema = read('src/main/database/schema.js');

  assert.match(controller, /\/settings\/backups\/restore-final-confirmation/);
  assert.match(controller, /\/settings\/backups\/restore-startup-recovery/);
  assert.match(preload, /restoreFinalConfirmation:\s*\(payload\)\s*=>/);
  assert.match(api, /restoreFinalConfirmation/);
  assert.match(renderer, /handleRecordRestoreFinalConfirmation/);
  assert.match(html, /restoreFinalConfirmationPhrase/);
  assert.match(main, /getRestoreStartupRecoveryAssessment/);
  assert.match(schema, /final_confirmation_id UUID UNIQUE/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS restore_final_confirmations/);
  assert.match(schema, /binding_digest VARCHAR\(128\) NOT NULL/);
  assert.match(schema, /status VARCHAR\(40\) NOT NULL/);
  assert.match(schema, /idx_restore_final_confirmations_one_active/);

  assert.doesNotMatch(controller, /ipcMain\.handle\('\/settings\/backups\/restore'/);
  assert.doesNotMatch(preload, /restoreBackup:\s*\(/);
  assert.doesNotMatch(api, /restoreBackup/);
  assert.doesNotMatch(renderer, /A\(\)\.restoreBackup|handleExecuteRestore|location\.reload/);
});

test('repository final confirmation is journal-backed, digest-bound, and single-use', () => {
  const repository = read('src/main/features/settings/settings.repository.js');
  const confirmationBody = repository.slice(
    repository.indexOf('async function createRestoreFinalConfirmation'),
    repository.indexOf('async function getRestoreStartupRecoveryAssessment')
  );

  assert.match(repository, /RESTORE_FINAL_CONFIRMATION_CONTRACT_VERSION/);
  assert.match(repository, /function buildRestoreFinalConfirmationContext/);
  assert.match(repository, /function confirmationDigest/);
  assert.match(repository, /async function latestPassedDryRunEvidence/);
  assert.match(confirmationBody, /INSERT INTO restore_final_confirmations/);
  assert.match(confirmationBody, /superseded_by_new_confirmation/);
  assert.match(confirmationBody, /RESTORE_CONFIRMATION_PHRASE_INVALID/);
  assert.match(repository, /async function validateRestoreFinalConfirmation/);
  assert.match(repository, /async function consumeRestoreFinalConfirmation/);
  assert.match(repository, /FOR UPDATE/);
  assert.match(repository, /RESTORE_CONFIRMATION_ALREADY_CONSUMED/);
  assert.match(repository, /RESTORE_CONFIRMATION_EXPIRED/);
  assert.match(repository, /RESTORE_CONFIRMATION_TARGET_MISMATCH/);
  assert.match(repository, /RESTORE_CONFIRMATION_CONSUMED/);
});

test('disposable restore execution requires persisted final confirmation before mutation', () => {
  const adapter = read('src/main/features/restore-engine/restore-disposable-execution.adapter.js');
  const executeBody = adapter.slice(
    adapter.indexOf('async function executeDisposableRestore'),
    adapter.indexOf('module.exports')
  );

  assert.match(executeBody, /confirmationId/);
  assert.match(executeBody, /consumeRestoreFinalConfirmation/);
  assert.match(executeBody, /RESTORE_CONFIRMATION_REQUIRED/);
  assert(
    executeBody.indexOf('consumeRestoreFinalConfirmation') <
      executeBody.indexOf('RESTORE_IN_PROGRESS')
  );
  assert.match(adapter, /disposableTargetIdentity/);
});

test('repository startup assessment builds one snapshot and reconciles ambiguous rollback', () => {
  const repository = read('src/main/features/settings/settings.repository.js');
  const startupBody = repository.slice(
    repository.indexOf('async function getRestoreStartupRecoveryAssessment'),
    repository.indexOf('async function restoreOperationForSafetyArtifact')
  );

  assert.match(repository, /async function reconcileRestoreStartupOperation/);
  assert.match(repository, /startup_rollback_outcome_ambiguous/);
  assert.match(repository, /MANUAL_RECOVERY_REQUIRED/);
  assert.match(repository, /function createRestoreStartupRecoverySnapshot/);
  assert.match(startupBody, /reconcileRestoreStartupOperation/);
  assert.match(startupBody, /latestRestoreOperation/);
  assert.match(startupBody, /latestOperation\?\.state ===/);
  assert.match(startupBody, /startupRecoverySnapshot/);
  assert.match(repository, /operationLockExists/);
  assert.match(repository, /mutationGuardActive/);
  assert.match(repository, /allowedRecoveryActions/);
  assert.match(repository, /blockingReasons/);
});

test('startup recovery selection is scoped to the current database identity', () => {
  const repository = read('src/main/features/settings/settings.repository.js');
  const schema = read('src/main/database/schema.js');
  const disposableAdapter = read(
    'src/main/features/restore-engine/restore-disposable-execution.adapter.js'
  );

  assert.match(schema, /target_database_fingerprint VARCHAR\(128\)/);
  assert.match(schema, /target_database_name VARCHAR\(180\)/);
  assert.match(schema, /idx_restore_operations_target_database/);
  assert.match(repository, /function classifyRestoreStartupOperation/);
  assert.match(repository, /restoreOperationTargetsCurrentDatabase/);
  assert.match(repository, /target_identity_missing_conservative_lockout/);
  assert.match(repository, /legacy_controlled_disposable_certification_evidence/);
  assert.match(repository, /CONTROLLED_ROLLBACK_FAILURE/);
  assert.match(repository, /ignoredRestoreOperation/);
  assert.match(repository, /blocksCurrentDatabase/);
  assert.match(disposableAdapter, /function disposableTargetIdentity/);
  assert.match(disposableAdapter, /targetDatabaseReference/);
});

test('startup setup page distinguishes restore maintenance from database setup', () => {
  const setup = read('src/renderer/setup.html');
  const main = read('src/main/main.js');

  assert.match(main, /RESTORE_MAINTENANCE_LOCKOUT/);
  assert.match(main, /databaseStatus:\s*'Connected'/);
  assert.match(main, /migrationStatus:\s*'Current'/);
  assert.match(setup, /Restore recovery required/);
  assert.match(setup, /Restore Recovery Lockout/);
  assert.match(setup, /Current Restore State/);
  assert.match(setup, /Mutation Guard/);
  assert.match(setup, /code === 'RESTORE_MAINTENANCE_LOCKOUT'/);
  assert.doesNotMatch(setup, /Continue anyway|Ignore|Clear state|Force normal startup/);
});

test('settings renderer auto-loads startup recovery and retention into structured panels', () => {
  const renderer = read('src/main/features/settings/settings.renderer.js');
  const loadBody = renderer.slice(
    renderer.indexOf('async function loadReadOnlyData'),
    renderer.indexOf('function renderUI')
  );
  const startupRenderer = renderer.slice(
    renderer.indexOf('function renderRestoreStartupRecovery'),
    renderer.indexOf('function renderRestoreRetentionAssessment')
  );

  assert.match(loadBody, /restoreStartupRecovery\(\)/);
  assert.match(loadBody, /renderRestoreStartupRecovery/);
  assert.match(loadBody, /restoreRetentionAssessment\(\)/);
  assert.match(loadBody, /renderRestoreRetentionAssessment/);
  assert.match(startupRenderer, /Startup Mode/);
  assert.match(startupRenderer, /Current Recovery State/);
  assert.match(startupRenderer, /Maintenance Lock/);
  assert.match(startupRenderer, /Mutation Guard/);
  assert.match(startupRenderer, /Blocking Reasons/);
  assert.doesNotMatch(startupRenderer, /Startup recovery status has not been loaded/);
});

test('settings renderer requires exact phrase before recording final confirmation', () => {
  const renderer = read('src/main/features/settings/settings.renderer.js');
  const syncBody = renderer.slice(
    renderer.indexOf('function syncRestoreFinalConfirmationControls'),
    renderer.indexOf('function renderRestoreStartupRecovery')
  );
  const handlerBody = renderer.slice(
    renderer.indexOf('async function handleRecordRestoreFinalConfirmation'),
    renderer.indexOf('async function handleRefreshRestoreStartupRecovery')
  );

  assert.match(syncBody, /RESTORE DATABASE/);
  assert.match(syncBody, /phraseReady/);
  assert.doesNotMatch(handlerBody, /preflightDigest/);
  assert.doesNotMatch(handlerBody, /executionPolicyDigest/);
  assert.match(renderer, /confirmationStatus/);
  assert.match(renderer, /Consumed:/);
});

test('retention assessment requires artifact to match a restore operation journal entry', () => {
  const repository = read('src/main/features/settings/settings.repository.js');
  const retentionBody = repository.slice(
    repository.indexOf('async function getRestoreRetentionAssessment'),
    repository.indexOf('function backupLogFilters')
  );

  assert.match(repository, /async function restoreOperationForSafetyArtifact/);
  assert.match(retentionBody, /linkedOperationFound:\s*false/);
  assert.match(retentionBody, /cleanupEligible:\s*false/);
  assert.match(retentionBody, /not linked to a Restore operation journal entry/);
});
