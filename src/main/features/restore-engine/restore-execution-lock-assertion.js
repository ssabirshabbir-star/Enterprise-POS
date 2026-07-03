const guardEvaluator = require('./restore-execution-guard-evaluator');
const guardModel = require('./restore-execution-guard.model');

const ASSERTION_STATUSES = Object.freeze({
  LOCKED: 'execution_locked_read_only',
  INVALID: 'execution_invalid_read_only',
  BLOCKED: 'execution_blocked_read_only',
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
  'uiActivationAvailable',
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
    uiActivationAvailable: false,
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
    uiActivationAvailable: false,
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
    invalid:
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
    invalid:
      !isObject(planSafetyClassification) ||
      planSafetyClassification.readOnly !== true ||
      planSafetyClassification.classifierType !== 'restore_plan_safety_classifier',
    blocked:
      planSafetyClassification?.classificationStatus === 'blocked_read_only' ||
      planSafetyClassification?.classificationStatus === 'unsafe_non_empty_read_only' ||
      planSafetyClassification?.classificationStatus === 'malformed_read_only',
    unsafeFlags: [
      ...(Array.isArray(planSafetyClassification?.unsafeFlags)
        ? planSafetyClassification.unsafeFlags.map((flag) => `planSafety.${flag}`)
        : []),
      ...unsafeFlagsFor('planSafety', planSafetyClassification),
    ],
  });
}

function summarizeGuardEvaluation(guardEvaluation = null) {
  return freeze({
    present: Boolean(guardEvaluation),
    readOnly: guardEvaluation?.readOnly === true,
    evaluationStatus: guardEvaluation?.evaluationStatus || null,
    invalid:
      !isObject(guardEvaluation) ||
      guardEvaluation.readOnly !== true ||
      guardEvaluation.evaluatorType !== 'restore_execution_guard_evaluator_shell',
    blocked: guardEvaluation?.evaluationStatus === guardModel.GUARD_STATUSES.BLOCKED,
    unsafeFlags: unsafeFlagsFor('guardEvaluation', guardEvaluation),
  });
}

function determineStatus({ invalid, blocked }) {
  if (invalid) return ASSERTION_STATUSES.INVALID;
  if (blocked) return ASSERTION_STATUSES.BLOCKED;
  return ASSERTION_STATUSES.LOCKED;
}

function assertExecutionLocked({
  readinessDecision = null,
  planSafetyClassification = null,
  guardEvaluation = null,
} = {}) {
  const readinessSummary = summarizeReadiness(readinessDecision);
  const planSafetySummary = summarizePlanSafety(planSafetyClassification);
  const guardEvaluationSummary = summarizeGuardEvaluation(guardEvaluation);
  const unsafeFlags = [
    ...readinessSummary.unsafeFlags,
    ...planSafetySummary.unsafeFlags,
    ...guardEvaluationSummary.unsafeFlags,
  ];
  const reasons = [];

  if (readinessSummary.invalid) {
    reasons.push(
      reason(
        'execution_lock.readiness.invalid',
        'Readiness decision reference is missing or malformed.',
        'readinessDecision'
      )
    );
  }
  if (planSafetySummary.invalid) {
    reasons.push(
      reason(
        'execution_lock.plan_safety.invalid',
        'Plan safety classification reference is missing or malformed.',
        'planSafetyClassification'
      )
    );
  }
  if (guardEvaluationSummary.invalid) {
    reasons.push(
      reason(
        'execution_lock.guard_evaluation.invalid',
        'Guard evaluation reference is missing or malformed.',
        'guardEvaluation'
      )
    );
  }
  if (readinessSummary.blocked) {
    reasons.push(
      reason(
        'execution_lock.readiness.blocked',
        'Readiness decision is blocked.',
        'readinessDecision'
      )
    );
  }
  if (planSafetySummary.blocked) {
    reasons.push(
      reason(
        'execution_lock.plan_safety.blocked',
        'Plan safety classification is blocked, unsafe, or malformed.',
        'planSafetyClassification'
      )
    );
  }
  if (guardEvaluationSummary.blocked) {
    reasons.push(
      reason(
        'execution_lock.guard_evaluation.blocked',
        'Guard evaluation is blocked.',
        'guardEvaluation'
      )
    );
  }
  unsafeFlags.forEach((flag) => {
    reasons.push(reason(`execution_lock.unsafe.${flag}`, `${flag} must remain false.`));
  });

  const invalid =
    readinessSummary.invalid || planSafetySummary.invalid || guardEvaluationSummary.invalid;
  const blocked =
    readinessSummary.blocked ||
    planSafetySummary.blocked ||
    guardEvaluationSummary.blocked ||
    unsafeFlags.length > 0;
  const assertionStatus = determineStatus({ invalid, blocked });

  return freeze({
    assertionType: 'restore_execution_lock_assertion',
    assertionStatus,
    reasons: orderReasons(reasons),
    readinessSummary,
    planSafetySummary,
    guardEvaluationSummary,
    lockedCapabilities: [...guardModel.BLOCKED_CAPABILITIES],
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
    uiActivationAvailable: false,
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
      assertionStatus === ASSERTION_STATUSES.LOCKED
        ? 'Final execution lock assertion passed read-only. Restore remains unavailable.'
        : 'Final execution lock assertion blocks or invalidates Restore execution. Restore remains unavailable.',
  });
}

module.exports = {
  ASSERTION_STATUSES,
  assertExecutionLocked,
  EVALUATION_STATUSES: guardEvaluator.EVALUATION_STATUSES,
};
