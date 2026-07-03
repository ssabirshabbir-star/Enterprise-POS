const restorePlanModel = require('./restore-plan.model');

const CONTRACT_STATUSES = Object.freeze({
  VALID: 'valid_read_only',
  INVALID: 'invalid_read_only',
  BLOCKED: 'blocked_read_only',
});

const CONTRACT_REFERENCE_KEYS = Object.freeze([
  'restoreRequest',
  'validationResult',
  'inventorySnapshot',
  'compatibilityAssessment',
  'dependencyAssessment',
  'impactAssessment',
  'readinessDecision',
  'restorePlanShell',
]);

const CRITICAL_REFERENCE_KEYS = Object.freeze([
  'restoreRequest',
  'validationResult',
  'readinessDecision',
  'restorePlanShell',
]);

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function reason(code, message, referenceKey = null) {
  return freeze({
    code,
    message,
    referenceKey,
    readOnly: true,
    noRestoreExecuted: true,
    restoreExecutionAvailable: false,
  });
}

function orderReasons(reasons) {
  return [...reasons].sort((a, b) => a.code.localeCompare(b.code));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readOnlyReference(value) {
  return isObject(value) && value.readOnly === true;
}

function blockedReference(key, value) {
  if (!readOnlyReference(value)) return false;
  if (key === 'readinessDecision') return value.decision === 'blocked_read_only';
  if (key === 'validationResult') return value.validationStatus === 'validation_blocked_read_only';
  if (key === 'restoreRequest') return false;
  if (key === 'restorePlanShell')
    return value.planStatus === restorePlanModel.RESTORE_PLAN_STATUSES.BLOCKED;
  return (
    value.status === 'validation_blocked_read_only' ||
    value.compatibilityStatus === 'validation_blocked_read_only' ||
    value.dependencyStatus === 'validation_blocked_read_only' ||
    value.impactStatus === 'validation_blocked_read_only' ||
    value.snapshotStatus === 'inventory_snapshot_unavailable'
  );
}

function malformedReference(key, value) {
  if (!readOnlyReference(value)) return true;
  if (key === 'restoreRequest') return value.requestType !== 'restore_execution_request';
  if (key === 'validationResult') return !value.validationStatus || !Array.isArray(value.findings);
  if (key === 'inventorySnapshot')
    return value.snapshotType !== 'restore_backup_content_inventory_snapshot';
  if (key === 'compatibilityAssessment')
    return value.assessmentType !== 'restore_compatibility_assessment';
  if (key === 'dependencyAssessment')
    return value.assessmentType !== 'restore_dependency_assessment';
  if (key === 'impactAssessment') return value.assessmentType !== 'restore_impact_assessment';
  if (key === 'readinessDecision') return value.decisionType !== 'restore_readiness_decision';
  if (key === 'restorePlanShell') return value.modelType !== 'restore_plan_model_shell';
  return false;
}

function summarizeReference(key, value) {
  return freeze({
    referenceKey: key,
    present: Boolean(value),
    readOnly: readOnlyReference(value),
    malformed: Boolean(value) && malformedReference(key, value),
    blocked: blockedReference(key, value),
    planned: value?.planned === true ? true : false,
    executable: value?.executable === true || value?.restoreExecutionAvailable === true,
    populated: value?.populated === true ? true : false,
  });
}

function determineStatus({ missingReferences, malformedReferences, blockedReferences }) {
  const criticalMissing = missingReferences.some((key) => CRITICAL_REFERENCE_KEYS.includes(key));
  const criticalMalformed = malformedReferences.some((key) =>
    CRITICAL_REFERENCE_KEYS.includes(key)
  );
  if (criticalMissing || criticalMalformed || blockedReferences.length)
    return CONTRACT_STATUSES.BLOCKED;
  if (missingReferences.length || malformedReferences.length) return CONTRACT_STATUSES.INVALID;
  return CONTRACT_STATUSES.VALID;
}

function createPlanInputContract({
  restoreRequest = null,
  validationResult = null,
  inventorySnapshot = null,
  compatibilityAssessment = null,
  dependencyAssessment = null,
  impactAssessment = null,
  readinessDecision = null,
  restorePlanShell = null,
} = {}) {
  const references = {
    restoreRequest,
    validationResult,
    inventorySnapshot,
    compatibilityAssessment,
    dependencyAssessment,
    impactAssessment,
    readinessDecision,
    restorePlanShell,
  };
  const referenceSummaries = CONTRACT_REFERENCE_KEYS.map((key) =>
    summarizeReference(key, references[key])
  );
  const missingReferences = CONTRACT_REFERENCE_KEYS.filter((key) => !references[key]);
  const malformedReferences = referenceSummaries
    .filter((summary) => summary.present && summary.malformed)
    .map((summary) => summary.referenceKey);
  const blockedReferences = referenceSummaries
    .filter((summary) => summary.blocked)
    .map((summary) => summary.referenceKey);
  const unsafeReferences = referenceSummaries.filter(
    (summary) => summary.planned || summary.executable || summary.populated
  );
  const reasons = [];

  missingReferences.forEach((key) => {
    reasons.push(reason(`contract.reference.${key}.missing`, `${key} reference is missing.`, key));
  });
  malformedReferences.forEach((key) => {
    reasons.push(
      reason(`contract.reference.${key}.malformed`, `${key} reference is malformed.`, key)
    );
  });
  blockedReferences.forEach((key) => {
    reasons.push(reason(`contract.reference.${key}.blocked`, `${key} reference is blocked.`, key));
  });
  unsafeReferences.forEach((summary) => {
    reasons.push(
      reason(
        `contract.reference.${summary.referenceKey}.unsafe`,
        `${summary.referenceKey} reference must not be planned, executable, or populated.`,
        summary.referenceKey
      )
    );
  });

  const contractStatus =
    unsafeReferences.length > 0
      ? CONTRACT_STATUSES.BLOCKED
      : determineStatus({ missingReferences, malformedReferences, blockedReferences });

  return freeze({
    contractType: 'restore_plan_input_contract_shell',
    contractStatus,
    immutable: true,
    internalOnly: true,
    readOnly: true,
    deterministic: true,
    assessmentOnly: true,
    noRestoreExecuted: true,
    noRestorePlanGenerated: true,
    noRestorePlanPopulated: true,
    noSqlGenerated: true,
    noOrderingAlgorithmExecuted: true,
    noDependencyTraversalExecuted: true,
    noImportSequencingCreated: true,
    noExecutionSequencingCreated: true,
    noTransactionGenerated: true,
    noRollbackGenerated: true,
    noRuntimeRecovery: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    missingReferences,
    malformedReferences,
    blockedReferences,
    referenceSummaries,
    reasons: orderReasons(reasons),
    message:
      contractStatus === CONTRACT_STATUSES.VALID
        ? 'Restore Plan Input Contract Shell is valid for read-only future review. No plan was generated.'
        : 'Restore Plan Input Contract Shell is not valid for future planning review. Restore remains unavailable.',
  });
}

module.exports = {
  CONTRACT_STATUSES,
  CONTRACT_REFERENCE_KEYS,
  CRITICAL_REFERENCE_KEYS,
  createPlanInputContract,
};
