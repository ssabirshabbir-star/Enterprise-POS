const EVIDENCE_VERSION = 'restore-certification-evidence-shell-v1';

const EVIDENCE_STATUSES = Object.freeze({
  RECORDED: 'evidence_recorded_read_only',
  INCOMPLETE: 'evidence_incomplete_read_only',
  BLOCKED: 'evidence_blocked_read_only',
});

const REQUIRED_EVIDENCE_KEYS = Object.freeze([
  'requestReference',
  'validationReference',
  'inventoryReference',
  'compatibilityReference',
  'dependencyReference',
  'impactReference',
  'readinessReference',
  'planReference',
  'planSafetyReference',
  'guardReference',
  'guardEvaluationReference',
  'executionLockReference',
]);

const BLOCKED_EVIDENCE_STATUSES = Object.freeze([
  'validation_blocked_read_only',
  'blocked_read_only',
  'guard_blocked_read_only',
  'execution_blocked_read_only',
  'unsafe_non_empty_read_only',
  'malformed_read_only',
]);

const REQUIRED_FUTURE_CERTIFICATIONS = Object.freeze([
  'restore_execution_governance_review',
  'restore_execution_certification_review',
  'restore_authorization_certification_review',
  'restore_transaction_certification_review',
  'restore_rollback_certification_review',
  'restore_runtime_recovery_certification_review',
  'restore_public_activation_review',
]);

const UNSAFE_FLAG_KEYS = Object.freeze([
  'certified',
  'approved',
  'authorized',
  'executable',
  'activationAvailable',
  'executionAvailable',
  'publicApiAvailable',
  'uiActivationAvailable',
  'businessMutationAvailable',
  'restoreExecutionAvailable',
  'restoreEligible',
]);

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function clone(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safetyFlags() {
  return freeze({
    readOnly: true,
    certified: false,
    approved: false,
    authorized: false,
    executable: false,
    activationAvailable: false,
    executionAvailable: false,
    publicApiAvailable: false,
    uiActivationAvailable: false,
    businessMutationAvailable: false,
  });
}

function reason(code, message, source = null) {
  return freeze({
    code,
    message,
    source,
    readOnly: true,
    certified: false,
    approved: false,
    authorized: false,
    executable: false,
    executionAvailable: false,
  });
}

function orderReasons(reasons) {
  return [...reasons].sort((a, b) => a.code.localeCompare(b.code));
}

function statusValues(referenceValue = {}) {
  return [
    referenceValue.status,
    referenceValue.validationStatus,
    referenceValue.decision,
    referenceValue.classificationStatus,
    referenceValue.guardStatus,
    referenceValue.evaluationStatus,
    referenceValue.assertionStatus,
    referenceValue.contractStatus,
    referenceValue.skeletonStatus,
  ].filter(Boolean);
}

function unsafeFlagsFor(referenceName, value = {}) {
  if (!isObject(value)) return [];
  const directFlags = UNSAFE_FLAG_KEYS.filter((key) => value[key] === true).map(
    (key) => `${referenceName}.${key}`
  );
  const nestedFlags = UNSAFE_FLAG_KEYS.filter((key) => value.safetyFlags?.[key] === true).map(
    (key) => `${referenceName}.safetyFlags.${key}`
  );
  return [...directFlags, ...nestedFlags];
}

function evidenceSummary(referenceName, value = null) {
  const present = Boolean(value);
  const objectValue = isObject(value);
  const statuses = objectValue ? statusValues(value) : [];
  const unsafeFlags = unsafeFlagsFor(referenceName, value);
  const malformed = present && (!objectValue || value.readOnly !== true);
  const blocked =
    statuses.some((status) => BLOCKED_EVIDENCE_STATUSES.includes(status)) || unsafeFlags.length > 0;

  return freeze({
    referenceName,
    present,
    readOnly: value?.readOnly === true,
    malformed,
    blocked,
    statuses,
    unsafeFlags,
  });
}

function determineEvidenceStatus({ missingEvidence, malformedEvidence, blockedEvidence }) {
  if (blockedEvidence.length > 0) return EVIDENCE_STATUSES.BLOCKED;
  if (missingEvidence.length > 0 || malformedEvidence.length > 0) {
    return EVIDENCE_STATUSES.INCOMPLETE;
  }
  return EVIDENCE_STATUSES.RECORDED;
}

function createCertificationEvidence({
  metadata = {},
  requestReference = null,
  validationReference = null,
  inventoryReference = null,
  compatibilityReference = null,
  dependencyReference = null,
  impactReference = null,
  readinessReference = null,
  planReference = null,
  planSafetyReference = null,
  guardReference = null,
  guardEvaluationReference = null,
  executionLockReference = null,
} = {}) {
  const references = {
    requestReference,
    validationReference,
    inventoryReference,
    compatibilityReference,
    dependencyReference,
    impactReference,
    readinessReference,
    planReference,
    planSafetyReference,
    guardReference,
    guardEvaluationReference,
    executionLockReference,
  };
  const evidenceSummaries = REQUIRED_EVIDENCE_KEYS.map((key) =>
    evidenceSummary(key, references[key])
  );
  const missingEvidence = evidenceSummaries
    .filter((summary) => !summary.present)
    .map((summary) => summary.referenceName);
  const malformedEvidence = evidenceSummaries
    .filter((summary) => summary.malformed)
    .map((summary) => summary.referenceName);
  const blockedEvidence = evidenceSummaries
    .filter((summary) => summary.blocked)
    .map((summary) => summary.referenceName);
  const unsafeFlags = evidenceSummaries.flatMap((summary) => summary.unsafeFlags);
  const evidenceReasons = [];

  missingEvidence.forEach((key) => {
    evidenceReasons.push(reason(`evidence.${key}.missing`, `${key} is missing.`, key));
  });
  malformedEvidence.forEach((key) => {
    evidenceReasons.push(
      reason(`evidence.${key}.malformed`, `${key} is malformed or not read-only.`, key)
    );
  });
  blockedEvidence.forEach((key) => {
    evidenceReasons.push(reason(`evidence.${key}.blocked`, `${key} is blocked or unsafe.`, key));
  });
  unsafeFlags.forEach((flag) => {
    evidenceReasons.push(reason(`evidence.unsafe.${flag}`, `${flag} must remain false.`));
  });

  const evidenceStatus = determineEvidenceStatus({
    missingEvidence,
    malformedEvidence,
    blockedEvidence,
  });

  return freeze({
    evidenceType: 'restore_certification_evidence_model_shell',
    evidenceVersion: EVIDENCE_VERSION,
    evidenceStatus,
    immutable: true,
    internalOnly: true,
    readOnly: true,
    certified: false,
    approved: false,
    authorized: false,
    executable: false,
    activationAvailable: false,
    executionAvailable: false,
    publicApiAvailable: false,
    uiActivationAvailable: false,
    businessMutationAvailable: false,
    noRestoreCertified: true,
    noRestoreApproved: true,
    noRestoreAuthorized: true,
    noRestoreActivated: true,
    noRestoreUnlocked: true,
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
    metadata: freeze({
      createdAt: new Date().toISOString(),
      ...clone(metadata),
      readOnly: true,
      certified: false,
      approved: false,
      authorized: false,
      executable: false,
      executionAvailable: false,
    }),
    requestReference: clone(requestReference),
    validationReference: clone(validationReference),
    inventoryReference: clone(inventoryReference),
    compatibilityReference: clone(compatibilityReference),
    dependencyReference: clone(dependencyReference),
    impactReference: clone(impactReference),
    readinessReference: clone(readinessReference),
    planReference: clone(planReference),
    planSafetyReference: clone(planSafetyReference),
    guardReference: clone(guardReference),
    guardEvaluationReference: clone(guardEvaluationReference),
    executionLockReference: clone(executionLockReference),
    evidenceSummaries,
    evidenceReasons: orderReasons(evidenceReasons),
    missingEvidence,
    malformedEvidence,
    blockedEvidence,
    unsafeFlags,
    requiredFutureCertifications: [...REQUIRED_FUTURE_CERTIFICATIONS],
    safetyFlags: safetyFlags(),
    message:
      evidenceStatus === EVIDENCE_STATUSES.RECORDED
        ? 'Restore certification evidence is recorded read-only. Restore remains unavailable.'
        : 'Restore certification evidence is incomplete or blocked. Restore remains unavailable.',
  });
}

function validateCertificationEvidence(evidence = {}) {
  const failures = [];
  const flags = evidence.safetyFlags || {};

  if (evidence.evidenceType !== 'restore_certification_evidence_model_shell') {
    failures.push('Evidence type is invalid.');
  }
  if (evidence.evidenceVersion !== EVIDENCE_VERSION) {
    failures.push('Evidence version is invalid.');
  }
  if (!Object.values(EVIDENCE_STATUSES).includes(evidence.evidenceStatus)) {
    failures.push('Evidence status is invalid.');
  }
  if (evidence.readOnly !== true || flags.readOnly !== true) {
    failures.push('Evidence must be read-only.');
  }
  UNSAFE_FLAG_KEYS.slice(0, 9).forEach((key) => {
    if (evidence[key] !== false || flags[key] !== false) {
      failures.push(`${key} must remain false.`);
    }
  });

  return freeze({
    validationType: 'restore_certification_evidence_validation',
    validationStatus: failures.length ? EVIDENCE_STATUSES.INCOMPLETE : evidence.evidenceStatus,
    validEvidence: failures.length === 0,
    failures,
    readOnly: true,
    certified: false,
    approved: false,
    authorized: false,
    executable: false,
    executionAvailable: false,
    restoreExecutionAvailable: false,
  });
}

module.exports = {
  EVIDENCE_VERSION,
  EVIDENCE_STATUSES,
  REQUIRED_EVIDENCE_KEYS,
  REQUIRED_FUTURE_CERTIFICATIONS,
  createCertificationEvidence,
  validateCertificationEvidence,
};
