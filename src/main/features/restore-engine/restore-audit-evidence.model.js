const AUDIT_EVIDENCE_VERSION = 'restore-audit-evidence-shell-v1';

const AUDIT_EVIDENCE_STATUSES = Object.freeze({
  RECORDED: 'audit_evidence_recorded_read_only',
  INCOMPLETE: 'audit_evidence_incomplete_read_only',
  BLOCKED: 'audit_evidence_blocked_read_only',
});

const REQUIRED_AUDIT_KEYS = Object.freeze([
  'requestAuditReference',
  'validationAuditReference',
  'certificationEvidenceReference',
  'certificationGateReference',
  'executionLockReference',
]);

const BLOCKED_AUDIT_STATUSES = Object.freeze([
  'audit_evidence_blocked_read_only',
  'evidence_blocked_read_only',
  'evidence_collection_blocked_read_only',
  'evidence_review_blocked_read_only',
  'certification_gate_blocked_read_only',
  'execution_blocked_read_only',
  'blocked_read_only',
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
    referenceValue.auditStatus,
    referenceValue.evidenceStatus,
    referenceValue.collectionStatus,
    referenceValue.reviewStatus,
    referenceValue.gateStatus,
    referenceValue.assertionStatus,
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

function auditSummary(referenceName, value = null) {
  const present = Boolean(value);
  const objectValue = isObject(value);
  const statuses = objectValue ? statusValues(value) : [];
  const unsafeFlags = unsafeFlagsFor(referenceName, value);
  const malformed = present && (!objectValue || value.readOnly !== true);
  const blocked =
    statuses.some((status) => BLOCKED_AUDIT_STATUSES.includes(status)) || unsafeFlags.length > 0;

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

function determineAuditStatus({
  missingAuditEvidence,
  malformedAuditEvidence,
  blockedAuditEvidence,
}) {
  if (blockedAuditEvidence.length > 0) return AUDIT_EVIDENCE_STATUSES.BLOCKED;
  if (missingAuditEvidence.length > 0 || malformedAuditEvidence.length > 0) {
    return AUDIT_EVIDENCE_STATUSES.INCOMPLETE;
  }
  return AUDIT_EVIDENCE_STATUSES.RECORDED;
}

function createAuditEvidence({
  metadata = {},
  requestAuditReference = null,
  validationAuditReference = null,
  certificationEvidenceReference = null,
  certificationGateReference = null,
  executionLockReference = null,
} = {}) {
  const references = {
    requestAuditReference,
    validationAuditReference,
    certificationEvidenceReference,
    certificationGateReference,
    executionLockReference,
  };
  const auditSummaries = REQUIRED_AUDIT_KEYS.map((key) => auditSummary(key, references[key]));
  const missingAuditEvidence = auditSummaries
    .filter((summary) => !summary.present)
    .map((summary) => summary.referenceName);
  const malformedAuditEvidence = auditSummaries
    .filter((summary) => summary.malformed)
    .map((summary) => summary.referenceName);
  const blockedAuditEvidence = auditSummaries
    .filter((summary) => summary.blocked)
    .map((summary) => summary.referenceName);
  const unsafeFlags = auditSummaries.flatMap((summary) => summary.unsafeFlags);
  const auditReasons = [];

  missingAuditEvidence.forEach((key) => {
    auditReasons.push(reason(`audit_evidence.${key}.missing`, `${key} is missing.`, key));
  });
  malformedAuditEvidence.forEach((key) => {
    auditReasons.push(
      reason(`audit_evidence.${key}.malformed`, `${key} is malformed or not read-only.`, key)
    );
  });
  blockedAuditEvidence.forEach((key) => {
    auditReasons.push(reason(`audit_evidence.${key}.blocked`, `${key} is blocked or unsafe.`, key));
  });
  unsafeFlags.forEach((flag) => {
    auditReasons.push(reason(`audit_evidence.unsafe.${flag}`, `${flag} must remain false.`));
  });

  const auditStatus = determineAuditStatus({
    missingAuditEvidence,
    malformedAuditEvidence,
    blockedAuditEvidence,
  });

  return freeze({
    auditEvidenceType: 'restore_audit_evidence_model_shell',
    auditEvidenceVersion: AUDIT_EVIDENCE_VERSION,
    auditStatus,
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
    noCertificationDecision: true,
    noApprovalDecision: true,
    noAuthorizationDecision: true,
    noActivationDecision: true,
    noUnlockDecision: true,
    noRestoreExecuted: true,
    noExecutionPrepared: true,
    noExecutionSimulated: true,
    noSqlGenerated: true,
    noTransactionExecuted: true,
    noRollbackGenerated: true,
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
    requestAuditReference: clone(requestAuditReference),
    validationAuditReference: clone(validationAuditReference),
    certificationEvidenceReference: clone(certificationEvidenceReference),
    certificationGateReference: clone(certificationGateReference),
    executionLockReference: clone(executionLockReference),
    auditSummaries,
    auditReasons: orderReasons(auditReasons),
    missingAuditEvidence,
    malformedAuditEvidence,
    blockedAuditEvidence,
    unsafeFlags,
    safetyFlags: safetyFlags(),
    message:
      auditStatus === AUDIT_EVIDENCE_STATUSES.RECORDED
        ? 'Restore audit evidence is recorded read-only. Restore remains unavailable.'
        : 'Restore audit evidence is incomplete or blocked. Restore remains unavailable.',
  });
}

function validateAuditEvidence(auditEvidence = {}) {
  const failures = [];
  const flags = auditEvidence.safetyFlags || {};

  if (auditEvidence.auditEvidenceType !== 'restore_audit_evidence_model_shell') {
    failures.push('Audit evidence type is invalid.');
  }
  if (auditEvidence.auditEvidenceVersion !== AUDIT_EVIDENCE_VERSION) {
    failures.push('Audit evidence version is invalid.');
  }
  if (!Object.values(AUDIT_EVIDENCE_STATUSES).includes(auditEvidence.auditStatus)) {
    failures.push('Audit evidence status is invalid.');
  }
  if (auditEvidence.readOnly !== true || flags.readOnly !== true) {
    failures.push('Audit evidence must be read-only.');
  }
  UNSAFE_FLAG_KEYS.slice(0, 9).forEach((key) => {
    if (auditEvidence[key] !== false || flags[key] !== false) {
      failures.push(`${key} must remain false.`);
    }
  });

  return freeze({
    validationType: 'restore_audit_evidence_validation',
    validationStatus: failures.length
      ? AUDIT_EVIDENCE_STATUSES.INCOMPLETE
      : auditEvidence.auditStatus,
    validAuditEvidence: failures.length === 0,
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
  AUDIT_EVIDENCE_VERSION,
  AUDIT_EVIDENCE_STATUSES,
  REQUIRED_AUDIT_KEYS,
  createAuditEvidence,
  validateAuditEvidence,
};
