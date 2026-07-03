const guardModel = require('./restore-execution-guard.model');

const EVALUATION_STATUSES = Object.freeze({
  LOCKED: guardModel.GUARD_STATUSES.LOCKED,
  INVALID: guardModel.GUARD_STATUSES.INVALID,
  BLOCKED: guardModel.GUARD_STATUSES.BLOCKED,
});

const UNSAFE_FLAG_KEYS = Object.freeze([
  'executable',
  'executionApproved',
  'executionAuthorized',
  'executionAvailable',
  'transactionAvailable',
  'rollbackAvailable',
  'runtimeRecoveryAvailable',
  'businessMutationAvailable',
  'publicApiAvailable',
  'restoreExecutionAvailable',
  'restoreEligible',
]);

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function reason(code, message, source = null) {
  return freeze({
    code,
    message,
    source,
    readOnly: true,
    executable: false,
    executionAvailable: false,
  });
}

function orderReasons(reasons) {
  return [...reasons].sort((a, b) => a.code.localeCompare(b.code));
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

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unsafeFlagsFor(sourceName, value = {}) {
  if (!isObject(value)) return [];
  const directFlags = UNSAFE_FLAG_KEYS.filter((key) => value[key] === true).map(
    (key) => `${sourceName}.${key}`
  );
  const nestedFlags = UNSAFE_FLAG_KEYS.filter((key) => value.safetyFlags?.[key] === true).map(
    (key) => `${sourceName}.safetyFlags.${key}`
  );
  return [...directFlags, ...nestedFlags];
}

function summarizeReadiness(readinessDecision = null) {
  return freeze({
    present: Boolean(readinessDecision),
    readOnly: readinessDecision?.readOnly === true,
    decision: readinessDecision?.decision || null,
    malformed:
      !isObject(readinessDecision) ||
      readinessDecision.readOnly !== true ||
      readinessDecision.decisionType !== 'restore_readiness_decision',
    blocked: readinessDecision?.decision === 'blocked_read_only',
    unsafeFlags: unsafeFlagsFor('readinessDecision', readinessDecision),
  });
}

function summarizePlanSafety(planSafetyClassification = null) {
  return freeze({
    present: Boolean(planSafetyClassification),
    readOnly: planSafetyClassification?.readOnly === true,
    classificationStatus: planSafetyClassification?.classificationStatus || null,
    populatedSections: Array.isArray(planSafetyClassification?.populatedSections)
      ? planSafetyClassification.populatedSections
      : [],
    unsafeFlags: [
      ...(Array.isArray(planSafetyClassification?.unsafeFlags)
        ? planSafetyClassification.unsafeFlags.map((flag) => `planSafety.${flag}`)
        : []),
      ...unsafeFlagsFor('planSafety', planSafetyClassification),
    ],
    malformed:
      !isObject(planSafetyClassification) ||
      planSafetyClassification.readOnly !== true ||
      planSafetyClassification.classifierType !== 'restore_plan_safety_classifier',
    blocked:
      planSafetyClassification?.classificationStatus === 'blocked_read_only' ||
      planSafetyClassification?.classificationStatus === 'unsafe_non_empty_read_only' ||
      planSafetyClassification?.classificationStatus === 'malformed_read_only',
  });
}

function summarizeGuard(executionGuard = null) {
  const validation = guardModel.validateExecutionGuard(executionGuard || {});
  const malformed =
    !isObject(executionGuard) ||
    executionGuard.readOnly !== true ||
    executionGuard.guardType !== 'restore_execution_guard_model_shell' ||
    !Object.values(guardModel.GUARD_STATUSES).includes(executionGuard.guardStatus);
  return freeze({
    present: Boolean(executionGuard),
    readOnly: executionGuard?.readOnly === true,
    guardStatus: executionGuard?.guardStatus || null,
    validGuard: validation.validGuard,
    validationFailures: validation.failures,
    blocked: executionGuard?.guardStatus === guardModel.GUARD_STATUSES.BLOCKED,
    invalid: malformed,
    unsafeFlags: unsafeFlagsFor('executionGuard', executionGuard),
  });
}

function determineStatus({ invalid, blocked }) {
  if (invalid) return EVALUATION_STATUSES.INVALID;
  if (blocked) return EVALUATION_STATUSES.BLOCKED;
  return EVALUATION_STATUSES.LOCKED;
}

function evaluateExecutionGuard({
  readinessDecision = null,
  restorePlanShell = null,
  planSafetyClassification = null,
  executionGuard = null,
} = {}) {
  const readinessSummary = summarizeReadiness(readinessDecision);
  const planSafetySummary = summarizePlanSafety(planSafetyClassification);
  const guardSummary = summarizeGuard(executionGuard);
  const unsafeFlags = [
    ...unsafeFlagsFor('restorePlanShell', restorePlanShell),
    ...readinessSummary.unsafeFlags,
    ...planSafetySummary.unsafeFlags,
    ...guardSummary.unsafeFlags,
  ];
  const reasons = [];

  if (!isObject(restorePlanShell)) {
    reasons.push(reason('guard_evaluation.plan_shell.missing', 'Restore Plan shell is missing.'));
  }
  if (readinessSummary.malformed) {
    reasons.push(
      reason(
        'guard_evaluation.readiness.malformed',
        'Readiness decision reference is missing or malformed.',
        'readinessDecision'
      )
    );
  }
  if (planSafetySummary.malformed) {
    reasons.push(
      reason(
        'guard_evaluation.plan_safety.malformed',
        'Plan safety classification reference is missing or malformed.',
        'planSafetyClassification'
      )
    );
  }
  if (guardSummary.invalid) {
    reasons.push(
      reason(
        'guard_evaluation.guard.invalid',
        'Execution guard model reference is missing, malformed, or invalid.',
        'executionGuard'
      )
    );
  }
  if (readinessSummary.blocked) {
    reasons.push(
      reason(
        'guard_evaluation.readiness.blocked',
        'Readiness decision is blocked.',
        'readinessDecision'
      )
    );
  }
  if (planSafetySummary.blocked) {
    reasons.push(
      reason(
        'guard_evaluation.plan_safety.blocked',
        'Plan safety classification is blocked, unsafe, or malformed.',
        'planSafetyClassification'
      )
    );
  }
  if (guardSummary.blocked) {
    reasons.push(
      reason(
        'guard_evaluation.guard.blocked',
        'Execution guard model is blocked.',
        'executionGuard'
      )
    );
  }
  unsafeFlags.forEach((flag) => {
    reasons.push(reason(`guard_evaluation.unsafe.${flag}`, `${flag} must remain false.`));
  });

  const invalid =
    !isObject(restorePlanShell) ||
    readinessSummary.malformed ||
    planSafetySummary.malformed ||
    guardSummary.invalid;
  const blocked =
    readinessSummary.blocked ||
    planSafetySummary.blocked ||
    guardSummary.blocked ||
    unsafeFlags.length > 0;
  const evaluationStatus = determineStatus({ invalid, blocked });

  return freeze({
    evaluatorType: 'restore_execution_guard_evaluator_shell',
    evaluationStatus,
    reasons: orderReasons(reasons),
    readinessSummary,
    planSafetySummary,
    guardSummary,
    blockedCapabilities: [...guardModel.BLOCKED_CAPABILITIES],
    requiredFutureCertifications: [...guardModel.REQUIRED_FUTURE_CERTIFICATIONS],
    unsafeFlags,
    safetyFlags: safetyFlags(),
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
    noTransactionExecuted: true,
    noRollbackGenerated: true,
    noRollbackExecuted: true,
    noRuntimeRecovery: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    message:
      evaluationStatus === EVALUATION_STATUSES.LOCKED
        ? 'Execution Guard evaluation is locked read-only. Restore remains unavailable.'
        : 'Execution Guard evaluation blocks or invalidates execution. Restore remains unavailable.',
  });
}

module.exports = {
  EVALUATION_STATUSES,
  evaluateExecutionGuard,
};
