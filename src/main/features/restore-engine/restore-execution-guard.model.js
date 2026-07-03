const GUARD_VERSION = 'restore-execution-guard-shell-v1';

const GUARD_STATUSES = Object.freeze({
  LOCKED: 'guard_locked_read_only',
  INVALID: 'guard_invalid_read_only',
  BLOCKED: 'guard_blocked_read_only',
});

const BLOCKED_CAPABILITIES = Object.freeze([
  'restore_execution',
  'execution_preparation',
  'execution_approval',
  'execution_authorization',
  'execution_simulation',
  'plan_execution',
  'sql_generation',
  'ordering_algorithm',
  'import_sequencing',
  'execution_sequencing',
  'transaction_generation',
  'transaction_execution',
  'rollback_generation',
  'rollback_execution',
  'runtime_recovery',
  'database_mutation',
  'business_table_mutation',
  'public_restore_api',
  'ui_activation',
]);

const REQUIRED_FUTURE_CERTIFICATIONS = Object.freeze([
  'restore_execution_governance_approval',
  'restore_execution_authorization_certification',
  'restore_transaction_execution_certification',
  'restore_rollback_execution_certification',
  'restore_runtime_recovery_certification',
  'restore_public_activation_review',
]);

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function clone(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function reference(name, value = null) {
  return freeze({
    referenceType: name,
    referenced: Boolean(value),
    readOnly: true,
    executable: false,
    executionApproved: false,
    executionAuthorized: false,
    executionAvailable: false,
    source: clone(value),
  });
}

function safetyFlags() {
  return freeze({
    readOnly: true,
    executable: false,
    executionApproved: false,
    executionAuthorized: false,
    executionAvailable: false,
    transactionAvailable: false,
    rollbackAvailable: false,
    runtimeRecoveryAvailable: false,
    businessMutationAvailable: false,
    publicApiAvailable: false,
  });
}

function reason(code, message) {
  return freeze({
    code,
    message,
    readOnly: true,
    executable: false,
    executionAvailable: false,
  });
}

function orderReasons(reasons) {
  return [...reasons].sort((a, b) => a.code.localeCompare(b.code));
}

function determineGuardStatus({
  planReference,
  readinessReference,
  safetyClassificationReference,
}) {
  if (!planReference || !readinessReference || !safetyClassificationReference) {
    return GUARD_STATUSES.INVALID;
  }
  if (
    readinessReference.decision === 'blocked_read_only' ||
    safetyClassificationReference.classificationStatus === 'blocked_read_only' ||
    safetyClassificationReference.classificationStatus === 'unsafe_non_empty_read_only' ||
    safetyClassificationReference.classificationStatus === 'malformed_read_only'
  ) {
    return GUARD_STATUSES.BLOCKED;
  }
  return GUARD_STATUSES.LOCKED;
}

function createExecutionGuard({
  metadata = {},
  planReference = null,
  readinessReference = null,
  safetyClassificationReference = null,
} = {}) {
  const guardStatus = determineGuardStatus({
    planReference,
    readinessReference,
    safetyClassificationReference,
  });
  const guardReasons = [];
  if (!planReference) {
    guardReasons.push(reason('guard.plan_reference.missing', 'Plan reference is missing.'));
  }
  if (!readinessReference) {
    guardReasons.push(
      reason('guard.readiness_reference.missing', 'Readiness reference is missing.')
    );
  }
  if (!safetyClassificationReference) {
    guardReasons.push(
      reason(
        'guard.safety_classification_reference.missing',
        'Safety classification reference is missing.'
      )
    );
  }
  if (readinessReference?.decision === 'blocked_read_only') {
    guardReasons.push(
      reason('guard.readiness_reference.blocked', 'Readiness reference is blocked.')
    );
  }
  if (
    safetyClassificationReference?.classificationStatus &&
    safetyClassificationReference.classificationStatus !== 'safe_empty_read_only'
  ) {
    guardReasons.push(
      reason(
        'guard.safety_classification_reference.not_safe_empty',
        'Safety classification reference is not safe_empty_read_only.'
      )
    );
  }

  return freeze({
    guardType: 'restore_execution_guard_model_shell',
    guardVersion: GUARD_VERSION,
    guardStatus,
    immutable: true,
    internalOnly: true,
    readOnly: true,
    executable: false,
    executionApproved: false,
    executionAuthorized: false,
    executionAvailable: false,
    transactionAvailable: false,
    rollbackAvailable: false,
    runtimeRecoveryAvailable: false,
    businessMutationAvailable: false,
    publicApiAvailable: false,
    noRestoreExecuted: true,
    noExecutionPrepared: true,
    noExecutionSimulated: true,
    noPlanExecuted: true,
    noSqlGenerated: true,
    noOrderingAlgorithmExecuted: true,
    noImportSequencingCreated: true,
    noExecutionSequencingCreated: true,
    noTransactionGenerated: true,
    noTransactionExecuted: true,
    noRollbackGenerated: true,
    noRollbackExecuted: true,
    noRuntimeRecovery: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    metadata: freeze({
      createdAt: new Date().toISOString(),
      ...clone(metadata),
      readOnly: true,
      executable: false,
      executionAvailable: false,
    }),
    planReference: reference('planReference', planReference),
    readinessReference: reference('readinessReference', readinessReference),
    safetyClassificationReference: reference(
      'safetyClassificationReference',
      safetyClassificationReference
    ),
    guardReasons: orderReasons(guardReasons),
    blockedCapabilities: [...BLOCKED_CAPABILITIES],
    requiredFutureCertifications: [...REQUIRED_FUTURE_CERTIFICATIONS],
    safetyFlags: safetyFlags(),
    message:
      guardStatus === GUARD_STATUSES.LOCKED
        ? 'Restore Execution Guard is locked read-only. Execution remains unavailable.'
        : 'Restore Execution Guard blocks or invalidates execution inspection. Execution remains unavailable.',
  });
}

function validateExecutionGuard(guard = {}) {
  const failures = [];
  const flags = guard.safetyFlags || {};
  if (guard.guardType !== 'restore_execution_guard_model_shell')
    failures.push('Guard type is invalid.');
  if (guard.guardVersion !== GUARD_VERSION) failures.push('Guard version is invalid.');
  if (!Object.values(GUARD_STATUSES).includes(guard.guardStatus)) {
    failures.push('Guard status is invalid.');
  }
  if (guard.readOnly !== true || flags.readOnly !== true) failures.push('Guard must be read-only.');
  [
    'executable',
    'executionApproved',
    'executionAuthorized',
    'executionAvailable',
    'transactionAvailable',
    'rollbackAvailable',
    'runtimeRecoveryAvailable',
    'businessMutationAvailable',
    'publicApiAvailable',
  ].forEach((key) => {
    if (guard[key] !== false || flags[key] !== false) {
      failures.push(`${key} must remain false.`);
    }
  });

  return freeze({
    validationType: 'restore_execution_guard_validation',
    validationStatus: failures.length ? GUARD_STATUSES.INVALID : guard.guardStatus,
    validGuard: failures.length === 0,
    failures,
    readOnly: true,
    executable: false,
    executionApproved: false,
    executionAuthorized: false,
    executionAvailable: false,
    restoreExecutionAvailable: false,
  });
}

module.exports = {
  GUARD_VERSION,
  GUARD_STATUSES,
  BLOCKED_CAPABILITIES,
  REQUIRED_FUTURE_CERTIFICATIONS,
  createExecutionGuard,
  validateExecutionGuard,
};
