const auditCollector = require('./restore-audit-evidence-collector');
const auditEvidenceModel = require('./restore-audit-evidence.model');

const AUDIT_REVIEWER_VERSION = 'restore-audit-evidence-reviewer-shell-v1';

const AUDIT_REVIEW_STATUSES = Object.freeze({
  READY: 'audit_evidence_review_ready_read_only',
  INCOMPLETE: 'audit_evidence_review_incomplete_read_only',
  BLOCKED: 'audit_evidence_review_blocked_read_only',
});

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
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

function invalidCollection(collection = null) {
  return (
    !isObject(collection) ||
    collection.auditCollectorType !== 'restore_audit_evidence_collector_shell' ||
    collection.readOnly !== true ||
    collection.safetyFlags?.readOnly !== true
  );
}

function falseFlagFailures(sourceName, value = {}) {
  const flags = value.safetyFlags || {};
  return [
    'certified',
    'approved',
    'authorized',
    'executable',
    'activationAvailable',
    'executionAvailable',
    'publicApiAvailable',
    'uiActivationAvailable',
    'businessMutationAvailable',
  ]
    .filter((key) => value[key] === true || flags[key] === true)
    .map((key) => `${sourceName}.${key}`);
}

function reviewAuditEvidence(collection = null) {
  const reasons = [];
  const invalid = invalidCollection(collection);
  const auditEvidence = collection?.auditEvidence || null;
  const auditValidation = collection?.auditValidation || null;
  const collectionUnsafeFlags = invalid ? [] : falseFlagFailures('collection', collection);
  const auditEvidenceUnsafeFlags = auditEvidence
    ? falseFlagFailures('auditEvidence', auditEvidence)
    : [];
  const unsafeFlags = [
    ...collectionUnsafeFlags,
    ...auditEvidenceUnsafeFlags,
    ...(collection?.unsafeFlags || []),
  ];

  if (invalid) {
    reasons.push(
      reason(
        'audit_review.collection.invalid',
        'Restore audit evidence collector output is missing or malformed.',
        'collection'
      )
    );
  }
  if (
    !invalid &&
    collection.collectionStatus === auditCollector.AUDIT_COLLECTION_STATUSES.INCOMPLETE
  ) {
    reasons.push(
      reason(
        'audit_review.collection.incomplete',
        'Restore audit evidence collection is incomplete.',
        'collection'
      )
    );
  }
  if (
    !invalid &&
    collection.collectionStatus === auditCollector.AUDIT_COLLECTION_STATUSES.BLOCKED
  ) {
    reasons.push(
      reason(
        'audit_review.collection.blocked',
        'Restore audit evidence collection is blocked.',
        'collection'
      )
    );
  }
  if (auditEvidence?.auditStatus === auditEvidenceModel.AUDIT_EVIDENCE_STATUSES.INCOMPLETE) {
    reasons.push(
      reason(
        'audit_review.audit_evidence.incomplete',
        'Restore audit evidence model is incomplete.',
        'auditEvidence'
      )
    );
  }
  if (auditEvidence?.auditStatus === auditEvidenceModel.AUDIT_EVIDENCE_STATUSES.BLOCKED) {
    reasons.push(
      reason(
        'audit_review.audit_evidence.blocked',
        'Restore audit evidence model is blocked.',
        'auditEvidence'
      )
    );
  }
  if (auditValidation?.validAuditEvidence === false) {
    reasons.push(
      reason(
        'audit_review.audit_validation.failed',
        'Restore audit evidence validation failed.',
        'auditValidation'
      )
    );
  }
  unsafeFlags.forEach((flag) => {
    reasons.push(reason(`audit_review.unsafe.${flag}`, `${flag} must remain false.`));
  });

  const incomplete =
    invalid ||
    collection?.collectionStatus === auditCollector.AUDIT_COLLECTION_STATUSES.INCOMPLETE ||
    auditEvidence?.auditStatus === auditEvidenceModel.AUDIT_EVIDENCE_STATUSES.INCOMPLETE ||
    auditValidation?.validAuditEvidence === false;
  const blocked =
    collection?.collectionStatus === auditCollector.AUDIT_COLLECTION_STATUSES.BLOCKED ||
    auditEvidence?.auditStatus === auditEvidenceModel.AUDIT_EVIDENCE_STATUSES.BLOCKED ||
    unsafeFlags.length > 0;
  const reviewStatus = blocked
    ? AUDIT_REVIEW_STATUSES.BLOCKED
    : incomplete
      ? AUDIT_REVIEW_STATUSES.INCOMPLETE
      : AUDIT_REVIEW_STATUSES.READY;

  return freeze({
    auditReviewerType: 'restore_audit_evidence_reviewer_shell',
    auditReviewerVersion: AUDIT_REVIEWER_VERSION,
    reviewStatus,
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
    collectionSummary: freeze({
      present: Boolean(collection),
      validCollection: !invalid,
      collectionStatus: collection?.collectionStatus || null,
      auditStatus: auditEvidence?.auditStatus || null,
      auditEvidenceValid: auditValidation?.validAuditEvidence === true,
      missingAuditEvidence: [...(collection?.missingAuditEvidence || [])],
      malformedAuditEvidence: [...(collection?.malformedAuditEvidence || [])],
      blockedAuditEvidence: [...(collection?.blockedAuditEvidence || [])],
    }),
    reviewReasons: orderReasons(reasons),
    unsafeFlags,
    safetyFlags: safetyFlags(),
    message:
      reviewStatus === AUDIT_REVIEW_STATUSES.READY
        ? 'Restore audit evidence is review-ready read-only. No approval, activation, or execution decision is made.'
        : 'Restore audit evidence review is incomplete or blocked. No approval, activation, or execution decision is made.',
  });
}

module.exports = {
  AUDIT_REVIEWER_VERSION,
  AUDIT_REVIEW_STATUSES,
  reviewAuditEvidence,
};
