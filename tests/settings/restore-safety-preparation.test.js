const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const recovery = require('../../src/main/features/restore-engine/restore-recovery-state.model');
const policy = require('../../src/main/features/restore-engine/restore-execution-policy.model');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('restore recovery model supports cancellable safety-preparation lifecycle', () => {
  const states = recovery.RESTORE_RECOVERY_STATES;

  const cancelFromPreflight = recovery.validateTransition({
    currentState: states.PREFLIGHT_READY,
    nextState: states.CANCELLED,
    ownerUserId: 1,
    requestedByUserId: 1,
  });
  assert.equal(cancelFromPreflight.transitionAllowed, true);

  const cancelFromVerified = recovery.validateTransition({
    currentState: states.SAFETY_BACKUP_VERIFIED,
    nextState: states.CANCELLED,
    ownerUserId: 1,
    requestedByUserId: 1,
  });
  assert.equal(cancelFromVerified.transitionAllowed, true);

  const replay = recovery.validateTransition({
    currentState: states.CANCELLED,
    nextState: states.PREFLIGHT_READY,
    ownerUserId: 1,
    requestedByUserId: 1,
  });
  assert.equal(replay.transitionAllowed, false);
  assert.match(replay.blockers.join('\n'), /Terminal/);
});

test('restore execution policy distinguishes safety-backup verified from execution certification', () => {
  const result = policy.createRestoreExecutionPolicy({
    recoveryState: {
      operationId: '00000000-0000-4000-8000-000000000001',
      currentState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
      ownerUserId: 1,
      safetyBackupReference: {
        safetyBackupId: '00000000-0000-4000-8000-000000000002',
        checksum: 'abc123',
        backupLogId: 7,
      },
    },
    operationLock: {
      locked: true,
      operationId: '00000000-0000-4000-8000-000000000001',
      safetyBackupVerified: true,
    },
  });

  assert.equal(result.safetyBackupVerified, true);
  assert.equal(result.executionEligible, false);
  assert.equal(result.executionCertified, false);
  assert.equal(result.restoreExecutionAvailable, false);
  assert.match(result.warnings.map((item) => item.code).join('\n'), /safety_backup\.verified/);
  assert.doesNotMatch(
    result.blockers.map((item) => item.code).join('\n'),
    /safety_backup\.required/
  );
});

test('schema defines a persistent exclusive restore operation lock', () => {
  const schema = read('src/main/database/schema.js');

  assert.match(schema, /CREATE TABLE IF NOT EXISTS restore_operations/);
  assert.match(schema, /operation_id UUID NOT NULL UNIQUE/);
  assert.match(schema, /owner_user_id INTEGER REFERENCES users/);
  assert.match(schema, /safety_backup_log_id BIGINT REFERENCES backup_logs/);
  assert.match(schema, /idx_restore_operations_one_unresolved/);
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_restore_operations_one_unresolved/);
  assert.match(schema, /WHERE terminal_at IS NULL/);
  assert.match(schema, /SAFETY_BACKUP_VERIFIED/);
  assert.match(schema, /CANCELLED/);
});

test('repository preparation reuses certified backup writer and avoids restore execution', () => {
  const repository = read('src/main/features/settings/settings.repository.js');
  const exportsBlock = repository.slice(repository.lastIndexOf('module.exports'));
  const preparationBody = repository.slice(
    repository.indexOf('async function prepareRestoreSafetyBackup'),
    repository.indexOf('async function cancelRestorePreparation')
  );

  assert.match(exportsBlock, /prepareRestoreSafetyBackup/);
  assert.match(exportsBlock, /cancelRestorePreparation/);
  assert.match(exportsBlock, /acquireRestoreOperationLock/);
  assert.doesNotMatch(exportsBlock, /executeRestoreBackup/);
  assert.match(preparationBody, /verifyRestorePackage\(selectedPath\)/);
  assert.match(preparationBody, /assessRestoreEligibility\(selectedPath\)/);
  assert.match(preparationBody, /acquireRestoreOperationLock/);
  assert.match(preparationBody, /exportBackup\(targetPath, ownerUserId\)/);
  assert.match(preparationBody, /SAFETY_BACKUP_VERIFIED/);
  assert.doesNotMatch(
    preparationBody,
    /executeRestoreBackup|pg_restore|psql|RESTORE_EXECUTION_ACKNOWLEDGEMENT/
  );
});

test('controller and preload expose preparation plus guarded restore boundary', () => {
  const controller = read('src/main/features/settings/settings.controller.js');
  const preload = read('src/main/preload.js');

  assert.match(controller, /\/settings\/backups\/prepare-restore-safety-backup/);
  assert.match(controller, /\/settings\/backups\/cancel-restore-preparation/);
  assert.match(controller, /Prepare Restore Safety Backup/);
  assert.match(preload, /prepareRestoreSafetyBackup:\s*\(\)\s*=>/);
  assert.match(preload, /cancelRestorePreparation:\s*\(payload\)\s*=>/);
  assert.match(controller, /ipcMain\.handle\('\/settings\/backups\/restore'/);
  assert.match(preload, /restoreBackup:\s*\(payload\)\s*=>/);
});

test('Settings API exposes preparation wrappers without DOM side effects', () => {
  const source = read('src/main/features/settings/settings.api.js');
  const calls = [];
  const window = {
    posApi: {
      app: { info: () => ({ ok: true }) },
      settings: {
        get: () => ({ ok: true }),
        listBackups: () => ({ ok: true }),
        assessBackupPreflight: () => ({ ok: true }),
        createBackup: () => ({ ok: true }),
        inspectRestorePackage: () => ({ ok: true }),
        verifyRestorePackage: () => ({ ok: true }),
        assessRestoreEligibility: () => ({ ok: true }),
        assessRestoreAuthorization: () => ({ ok: true }),
        dryRunCertificationReport: () => ({ ok: true }),
        listDryRunCertificationReports: () => ({ ok: true }),
        getDryRunCertificationReport: () => ({ ok: true }),
        restoreReadinessDashboard: () => ({ ok: true }),
        restoreGovernanceAssessment: () => ({ ok: true }),
        restoreRecoveryState: () => ({ ok: true }),
        restoreExecutionPolicy: () => ({ ok: true }),
        prepareRestoreSafetyBackup: () =>
          calls.push(['prepareRestoreSafetyBackup']) || { ok: true },
        cancelRestorePreparation: (payload) =>
          calls.push(['cancelRestorePreparation', payload]) || { ok: true },
        restoreBackup: (payload) => calls.push(['restoreBackup', payload]) || { ok: false },
        restoreEngineFoundationAssessment: () => ({ ok: true }),
        restoreTransactionFoundationAssessment: () => ({ ok: true }),
      },
    },
  };

  vm.runInNewContext(source, { window });
  assert.equal(typeof window.SettingsApi.prepareRestoreSafetyBackup, 'function');
  assert.equal(typeof window.SettingsApi.cancelRestorePreparation, 'function');
  assert.equal(typeof window.SettingsApi.restoreBackup, 'function');

  window.SettingsApi.prepareRestoreSafetyBackup();
  window.SettingsApi.cancelRestorePreparation('op-1');

  assert.deepEqual(calls, [
    ['prepareRestoreSafetyBackup'],
    ['cancelRestorePreparation', { operationId: 'op-1' }],
  ]);
  assert.doesNotMatch(source, /alert\(|document\.|innerHTML/);
});

test('renderer labels preparation as non-destructive and wires guarded execute restore', () => {
  const html = read('src/main/features/settings/index.html');
  const renderer = read('src/main/features/settings/settings.renderer.js');
  const prepareBody = renderer.slice(
    renderer.indexOf('async function handlePrepareRestoreSafetyBackup'),
    renderer.indexOf('async function handleCancelRestorePreparation')
  );

  assert.match(html, /id="restoreBackupButton"[^>]*disabled/);
  assert.match(html, /id="prepareRestoreSafetyBackupButton"[^>]*>Prepare Safety Backup<\/button>/);
  assert.match(html, /id="cancelRestorePreparationButton"[^>]*>Cancel Preparation<\/button>/);
  assert.match(renderer, /handlePrepareRestoreSafetyBackup/);
  assert.match(renderer, /handleCancelRestorePreparation/);
  assert.match(renderer, /A\(\)\.prepareRestoreSafetyBackup/);
  assert.match(renderer, /A\(\)\.cancelRestorePreparation/);
  assert.match(renderer, /function handleExecuteRestore/);
  assert.match(
    renderer,
    /addListener\(\$id\('restoreBackupButton'\), 'click', handleExecuteRestore\)/
  );
  assert.match(renderer, /policy\.restoreExecutionAvailable === true/);
  assert.match(
    prepareBody,
    /finally\s*\{[\s\S]*restorePreparationBusy = false;[\s\S]*syncRestoreFinalConfirmationControls\(\);[\s\S]*syncRestoreExecutionControls\(\);[\s\S]*\}/
  );
  assert.doesNotMatch(renderer, /location\.reload/);
});
