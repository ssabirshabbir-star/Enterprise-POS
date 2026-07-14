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

  assert.doesNotMatch(controller, /ipcMain\.handle\('\/settings\/backups\/restore'/);
  assert.doesNotMatch(preload, /restoreBackup:\s*\(/);
  assert.doesNotMatch(api, /restoreBackup/);
  assert.doesNotMatch(renderer, /A\(\)\.restoreBackup|handleExecuteRestore|location\.reload/);
});
