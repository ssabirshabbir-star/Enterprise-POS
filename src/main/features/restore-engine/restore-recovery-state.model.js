const crypto = require('crypto');

const RESTORE_RECOVERY_STATES = Object.freeze({
  IDLE: 'IDLE',
  PREFLIGHT_READY: 'PREFLIGHT_READY',
  SAFETY_BACKUP_IN_PROGRESS: 'SAFETY_BACKUP_IN_PROGRESS',
  SAFETY_BACKUP_VERIFIED: 'SAFETY_BACKUP_VERIFIED',
  RESTORE_IN_PROGRESS: 'RESTORE_IN_PROGRESS',
  RESTORE_APPLIED: 'RESTORE_APPLIED',
  POST_RESTORE_VERIFYING: 'POST_RESTORE_VERIFYING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  FAILED_RECOVERABLE: 'FAILED_RECOVERABLE',
  FAILED_ROLLBACK_REQUIRED: 'FAILED_ROLLBACK_REQUIRED',
  ROLLBACK_IN_PROGRESS: 'ROLLBACK_IN_PROGRESS',
  ROLLED_BACK: 'ROLLED_BACK',
  MANUAL_RECOVERY_REQUIRED: 'MANUAL_RECOVERY_REQUIRED',
});

const TERMINAL_STATES = Object.freeze([
  RESTORE_RECOVERY_STATES.COMPLETED,
  RESTORE_RECOVERY_STATES.CANCELLED,
  RESTORE_RECOVERY_STATES.ROLLED_BACK,
  RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
]);

const ACTIVE_STATES = Object.freeze([
  RESTORE_RECOVERY_STATES.PREFLIGHT_READY,
  RESTORE_RECOVERY_STATES.SAFETY_BACKUP_IN_PROGRESS,
  RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
  RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS,
  RESTORE_RECOVERY_STATES.RESTORE_APPLIED,
  RESTORE_RECOVERY_STATES.POST_RESTORE_VERIFYING,
  RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
  RESTORE_RECOVERY_STATES.FAILED_ROLLBACK_REQUIRED,
  RESTORE_RECOVERY_STATES.ROLLBACK_IN_PROGRESS,
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  [RESTORE_RECOVERY_STATES.IDLE]: [RESTORE_RECOVERY_STATES.PREFLIGHT_READY],
  [RESTORE_RECOVERY_STATES.PREFLIGHT_READY]: [
    RESTORE_RECOVERY_STATES.SAFETY_BACKUP_IN_PROGRESS,
    RESTORE_RECOVERY_STATES.CANCELLED,
    RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
  ],
  [RESTORE_RECOVERY_STATES.SAFETY_BACKUP_IN_PROGRESS]: [
    RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED,
    RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
  ],
  [RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED]: [
    RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS,
    RESTORE_RECOVERY_STATES.CANCELLED,
    RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
  ],
  [RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS]: [
    RESTORE_RECOVERY_STATES.RESTORE_APPLIED,
    RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
    RESTORE_RECOVERY_STATES.FAILED_ROLLBACK_REQUIRED,
    RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
  ],
  [RESTORE_RECOVERY_STATES.RESTORE_APPLIED]: [
    RESTORE_RECOVERY_STATES.POST_RESTORE_VERIFYING,
    RESTORE_RECOVERY_STATES.FAILED_ROLLBACK_REQUIRED,
  ],
  [RESTORE_RECOVERY_STATES.POST_RESTORE_VERIFYING]: [
    RESTORE_RECOVERY_STATES.COMPLETED,
    RESTORE_RECOVERY_STATES.FAILED_ROLLBACK_REQUIRED,
    RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
  ],
  [RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE]: [
    RESTORE_RECOVERY_STATES.PREFLIGHT_READY,
    RESTORE_RECOVERY_STATES.CANCELLED,
    RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
  ],
  [RESTORE_RECOVERY_STATES.FAILED_ROLLBACK_REQUIRED]: [
    RESTORE_RECOVERY_STATES.ROLLBACK_IN_PROGRESS,
    RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
  ],
  [RESTORE_RECOVERY_STATES.ROLLBACK_IN_PROGRESS]: [
    RESTORE_RECOVERY_STATES.ROLLED_BACK,
    RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
  ],
});

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function isKnownState(state) {
  return Object.values(RESTORE_RECOVERY_STATES).includes(state);
}

function sanitizeFailureSummary(value) {
  return String(value || '')
    .replace(/postgres:\/\/[^\s"'<>]+/gi, '[redacted-connection-string]')
    .replace(/(password|pgpassword|database_url)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b[A-Za-z]:\\[^\n\r]*\\node_modules\\[^\n\r]*/g, '[redacted-local-path]')
    .trim()
    .slice(0, 500);
}

function createOperationId() {
  return crypto.randomUUID();
}

function createIdleRecoveryState(now = new Date().toISOString()) {
  return freeze({
    operationId: null,
    ownerUserId: null,
    sourceBackupId: null,
    sourcePackageFingerprint: null,
    sourcePackageChecksum: null,
    sourceManifestVersion: null,
    currentState: RESTORE_RECOVERY_STATES.IDLE,
    previousState: null,
    createdAt: null,
    updatedAt: now,
    safetyBackupReference: null,
    failureCategory: null,
    sanitizedFailureSummary: null,
    replayStatus: 'not_started',
    rollbackRequired: false,
    restartRequired: false,
    completionMarker: null,
    activeOperation: false,
    unresolvedRecoveryState: false,
    transitionEvidence: [],
  });
}

function normalizeRecoveryState(source = {}) {
  const state = isKnownState(source.currentState)
    ? source.currentState
    : RESTORE_RECOVERY_STATES.IDLE;
  return freeze({
    ...createIdleRecoveryState(source.updatedAt || new Date().toISOString()),
    ...source,
    currentState: state,
    previousState: isKnownState(source.previousState) ? source.previousState : null,
    sanitizedFailureSummary: sanitizeFailureSummary(source.sanitizedFailureSummary),
    rollbackRequired:
      source.rollbackRequired === true ||
      state === RESTORE_RECOVERY_STATES.FAILED_ROLLBACK_REQUIRED ||
      state === RESTORE_RECOVERY_STATES.ROLLBACK_IN_PROGRESS,
    restartRequired:
      source.restartRequired === true ||
      state === RESTORE_RECOVERY_STATES.RESTORE_APPLIED ||
      state === RESTORE_RECOVERY_STATES.POST_RESTORE_VERIFYING ||
      state === RESTORE_RECOVERY_STATES.COMPLETED,
    completionMarker:
      TERMINAL_STATES.includes(state) && source.completionMarker
        ? String(source.completionMarker)
        : source.completionMarker || null,
    activeOperation: ACTIVE_STATES.includes(state),
    unresolvedRecoveryState: ACTIVE_STATES.includes(state),
  });
}

function validateTransition({ currentState, nextState, ownerUserId, requestedByUserId } = {}) {
  const fromState = currentState || RESTORE_RECOVERY_STATES.IDLE;
  const toState = nextState;
  const blockers = [];

  if (!isKnownState(fromState)) blockers.push(`Unknown current state: ${fromState || 'missing'}.`);
  if (!isKnownState(toState)) blockers.push(`Unknown target state: ${toState || 'missing'}.`);
  if (TERMINAL_STATES.includes(fromState)) {
    blockers.push('Terminal Restore recovery states cannot transition to a new state.');
  }
  if (
    ownerUserId !== null &&
    ownerUserId !== undefined &&
    requestedByUserId !== null &&
    requestedByUserId !== undefined &&
    String(ownerUserId) !== String(requestedByUserId)
  ) {
    blockers.push('Restore recovery operation owner mismatch.');
  }
  const allowed = ALLOWED_TRANSITIONS[fromState] || [];
  if (isKnownState(fromState) && isKnownState(toState) && !allowed.includes(toState)) {
    blockers.push(`Transition from ${fromState} to ${toState} is not allowed.`);
  }

  return freeze({
    fromState,
    toState,
    transitionAllowed: blockers.length === 0,
    blockers,
    noRestoreExecuted: true,
    restoreExecutionAvailable: false,
  });
}

module.exports = {
  ACTIVE_STATES,
  ALLOWED_TRANSITIONS,
  RESTORE_RECOVERY_STATES,
  TERMINAL_STATES,
  createIdleRecoveryState,
  createOperationId,
  normalizeRecoveryState,
  sanitizeFailureSummary,
  validateTransition,
};
