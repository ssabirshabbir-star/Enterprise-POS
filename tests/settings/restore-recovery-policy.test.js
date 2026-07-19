const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const recovery = require('../../src/main/features/restore-engine/restore-recovery-state.model');
const policy = require('../../src/main/features/restore-engine/restore-execution-policy.model');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('restore recovery state defaults to idle with no active operation', () => {
  const state = recovery.createIdleRecoveryState('2026-07-14T00:00:00.000Z');
  assert.equal(state.currentState, recovery.RESTORE_RECOVERY_STATES.IDLE);
  assert.equal(state.activeOperation, false);
  assert.equal(state.unresolvedRecoveryState, false);
  assert.equal(state.rollbackRequired, false);
  assert.equal(state.restartRequired, false);
});

test('restore recovery state validates allowed and illegal transitions', () => {
  const allowed = recovery.validateTransition({
    currentState: recovery.RESTORE_RECOVERY_STATES.IDLE,
    nextState: recovery.RESTORE_RECOVERY_STATES.PREFLIGHT_READY,
    ownerUserId: 1,
    requestedByUserId: 1,
  });
  assert.equal(allowed.transitionAllowed, true);

  const illegal = recovery.validateTransition({
    currentState: recovery.RESTORE_RECOVERY_STATES.IDLE,
    nextState: recovery.RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS,
    ownerUserId: 1,
    requestedByUserId: 1,
  });
  assert.equal(illegal.transitionAllowed, false);
  assert.match(illegal.blockers.join('\n'), /not allowed/);
});

test('restore recovery state rejects terminal replay and owner mismatch', () => {
  const terminal = recovery.validateTransition({
    currentState: recovery.RESTORE_RECOVERY_STATES.COMPLETED,
    nextState: recovery.RESTORE_RECOVERY_STATES.PREFLIGHT_READY,
    ownerUserId: 1,
    requestedByUserId: 1,
  });
  assert.equal(terminal.transitionAllowed, false);
  assert.match(terminal.blockers.join('\n'), /Terminal/);

  const ownerMismatch = recovery.validateTransition({
    currentState: recovery.RESTORE_RECOVERY_STATES.PREFLIGHT_READY,
    nextState: recovery.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_IN_PROGRESS,
    ownerUserId: 1,
    requestedByUserId: 2,
  });
  assert.equal(ownerMismatch.transitionAllowed, false);
  assert.match(ownerMismatch.blockers.join('\n'), /owner mismatch/i);
});

test('restore recovery state sanitizes secrets before persistence', () => {
  const summary = recovery.sanitizeFailureSummary(
    'failed DATABASE_URL=postgres://user:secret@localhost/star PGPASSWORD=hunter2 password=abc'
  );
  assert.doesNotMatch(summary, /hunter2|secret@localhost|password=abc/i);
  assert.match(summary, /\[redacted/);
});

test('restore execution policy distinguishes package validity from execution certification', () => {
  const result = policy.createRestoreExecutionPolicy({
    packageVerification: { verificationStatus: 'passed' },
    packageEligibility: { eligibilityStatus: 'eligible_for_authorization' },
    authorization: { authorizationStatus: 'authorization_assessment_passed' },
    databaseHealth: { status: 'healthy' },
  });

  assert.equal(result.packageValid, true);
  assert.equal(result.packageCompatible, true);
  assert.equal(result.operatorAuthorized, true);
  assert.equal(result.executionEligible, false);
  assert.equal(result.executionCertified, false);
  assert.match(
    result.blockers.map((item) => item.code).join('\n'),
    /execution\.activation_not_certified/
  );
});

test('restore execution policy blocks unresolved recovery state and active operation lock', () => {
  const result = policy.createRestoreExecutionPolicy({
    recoveryState: {
      operationId: 'restore-op-1',
      currentState: recovery.RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS,
      ownerUserId: 1,
    },
    operationLock: { locked: true, operationId: 'restore-op-1' },
  });

  assert.equal(result.executionEligible, false);
  assert.equal(result.recoveryState.activeOperation, true);
  assert.match(result.blockers.map((item) => item.code).join('\n'), /recovery_state\.unresolved/);
  assert.match(result.blockers.map((item) => item.code).join('\n'), /operation_lock\.active/);
});

test('startup recovery model classifies each restore state without unsafe normal writes', () => {
  const states = recovery.RESTORE_RECOVERY_STATES;
  const expectations = {
    [states.IDLE]: ['NORMAL', false],
    [states.PREFLIGHT_READY]: ['NORMAL', false],
    [states.SAFETY_BACKUP_IN_PROGRESS]: ['MAINTENANCE_READ_ONLY', true],
    [states.SAFETY_BACKUP_VERIFIED]: ['NORMAL', false],
    [states.RESTORE_IN_PROGRESS]: ['RECOVERY_REQUIRED', true],
    [states.RESTORE_APPLIED]: ['RECOVERY_REQUIRED', true],
    [states.POST_RESTORE_VERIFYING]: ['RECOVERY_REQUIRED', true],
    [states.FAILED_RECOVERABLE]: ['NORMAL', false],
    [states.FAILED_ROLLBACK_REQUIRED]: ['RECOVERY_REQUIRED', true],
    [states.ROLLBACK_IN_PROGRESS]: ['RECOVERY_REQUIRED', true],
    [states.ROLLED_BACK]: ['NORMAL', false],
    [states.COMPLETED]: ['NORMAL', false],
    [states.CANCELLED]: ['NORMAL', false],
    [states.MANUAL_RECOVERY_REQUIRED]: ['MANUAL_RECOVERY_REQUIRED', true],
  };

  for (const [state, [startupMode, guardActive]] of Object.entries(expectations)) {
    const assessment =
      require('../../src/main/features/restore-engine/restore-production-governance.model').assessStartupRecovery(
        {
          currentState: state,
          previousState:
            state === states.MANUAL_RECOVERY_REQUIRED ? states.ROLLBACK_IN_PROGRESS : null,
        }
      );
    assert.equal(assessment.startupMode, startupMode, state);
    assert.equal(assessment.databaseMutationsBlocked, guardActive, state);
    assert.equal(assessment.mutationGuardActive, guardActive, state);
    assert(Array.isArray(assessment.allowedRecoveryActions));
  }
});

test('settings route and renderer contract exposes policy plus guarded execution boundary', () => {
  const controller = read('src/main/features/settings/settings.controller.js');
  const preload = read('src/main/preload.js');
  const api = read('src/main/features/settings/settings.api.js');
  const renderer = read('src/main/features/settings/settings.renderer.js');
  const html = read('src/main/features/settings/index.html');

  assert.match(controller, /\/settings\/backups\/restore-execution-policy/);
  assert.match(preload, /restoreExecutionPolicy:\s*\(\)\s*=>/);
  assert.match(api, /restoreExecutionPolicy/);
  assert.match(renderer, /renderRestoreExecutionPolicy/);
  assert.match(html, /refreshRestoreExecutionPolicyButton/);

  assert.match(controller, /ipcMain\.handle\('\/settings\/backups\/restore'/);
  assert.match(preload, /restoreBackup:\s*\(payload\)\s*=>/);
  assert.match(api, /restoreBackup/);
  assert.doesNotMatch(renderer, /handleExecuteRestore/);
  assert.doesNotMatch(renderer, /addListener\(\$id\('restoreBackupButton'\), 'click'/);
});
