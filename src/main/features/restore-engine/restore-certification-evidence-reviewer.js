const evidenceCollector = require('./restore-certification-evidence-collector');
const evidenceModel = require('./restore-certification-evidence.model');

const REVIEWER_VERSION = 'restore-certification-evidence-reviewer-shell-v1';

const REVIEW_STATUSES = Object.freeze({
  READY: 'evidence_review_ready_read_only',
  INCOMPLETE: 'evidence_review_incomplete_read_only',
  BLOCKED: 'evidence_review_blocked_read_only',
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

function invalidCollector(collection = null) {
  return (
    !isObject(collection) ||
    collection.collectorType !== 'restore_certification_evidence_collector_shell' ||
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

function reviewCertificationEvidence(collection = null) {
  const reasons = [];
  const invalid = invalidCollector(collection);
  const evidence = collection?.certificationEvidence || null;
  const validation = collection?.evidenceValidation || null;
  const collectorUnsafeFlags = invalid ? [] : falseFlagFailures('collection', collection);
  const evidenceUnsafeFlags = evidence ? falseFlagFailures('certificationEvidence', evidence) : [];
  const unsafeFlags = [
    ...collectorUnsafeFlags,
    ...evidenceUnsafeFlags,
    ...(collection?.unsafeFlags || []),
  ];

  if (invalid) {
    reasons.push(
      reason(
        'review.collection.invalid',
        'Certification evidence collector output is missing or malformed.',
        'collection'
      )
    );
  }
  if (
    !invalid &&
    collection.collectionStatus === evidenceCollector.COLLECTION_STATUSES.INCOMPLETE
  ) {
    reasons.push(
      reason(
        'review.collection.incomplete',
        'Certification evidence collection is incomplete.',
        'collection'
      )
    );
  }
  if (!invalid && collection.collectionStatus === evidenceCollector.COLLECTION_STATUSES.BLOCKED) {
    reasons.push(
      reason(
        'review.collection.blocked',
        'Certification evidence collection is blocked.',
        'collection'
      )
    );
  }
  if (evidence?.evidenceStatus === evidenceModel.EVIDENCE_STATUSES.INCOMPLETE) {
    reasons.push(
      reason(
        'review.evidence.incomplete',
        'Certification evidence model is incomplete.',
        'certificationEvidence'
      )
    );
  }
  if (evidence?.evidenceStatus === evidenceModel.EVIDENCE_STATUSES.BLOCKED) {
    reasons.push(
      reason(
        'review.evidence.blocked',
        'Certification evidence model is blocked.',
        'certificationEvidence'
      )
    );
  }
  if (validation?.validEvidence === false) {
    reasons.push(
      reason(
        'review.evidence_validation.failed',
        'Certification evidence validation failed.',
        'evidenceValidation'
      )
    );
  }
  unsafeFlags.forEach((flag) => {
    reasons.push(reason(`review.unsafe.${flag}`, `${flag} must remain false.`));
  });

  const incomplete =
    invalid ||
    collection?.collectionStatus === evidenceCollector.COLLECTION_STATUSES.INCOMPLETE ||
    evidence?.evidenceStatus === evidenceModel.EVIDENCE_STATUSES.INCOMPLETE ||
    validation?.validEvidence === false;
  const blocked =
    collection?.collectionStatus === evidenceCollector.COLLECTION_STATUSES.BLOCKED ||
    evidence?.evidenceStatus === evidenceModel.EVIDENCE_STATUSES.BLOCKED ||
    unsafeFlags.length > 0;
  const reviewStatus = blocked
    ? REVIEW_STATUSES.BLOCKED
    : incomplete
      ? REVIEW_STATUSES.INCOMPLETE
      : REVIEW_STATUSES.READY;

  return freeze({
    reviewerType: 'restore_certification_evidence_reviewer_shell',
    reviewerVersion: REVIEWER_VERSION,
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
      validCollector: !invalid,
      collectionStatus: collection?.collectionStatus || null,
      evidenceStatus: evidence?.evidenceStatus || null,
      evidenceValid: validation?.validEvidence === true,
      missingEvidence: [...(collection?.missingEvidence || [])],
      malformedEvidence: [...(collection?.malformedEvidence || [])],
      blockedEvidence: [...(collection?.blockedEvidence || [])],
    }),
    reviewReasons: orderReasons(reasons),
    unsafeFlags,
    requiredFutureCertifications: [...(collection?.requiredFutureCertifications || [])],
    safetyFlags: safetyFlags(),
    message:
      reviewStatus === REVIEW_STATUSES.READY
        ? 'Certification evidence is review-ready read-only. No certification decision is made and Restore remains unavailable.'
        : 'Certification evidence review is incomplete or blocked. No certification decision is made and Restore remains unavailable.',
  });
}

module.exports = {
  REVIEWER_VERSION,
  REVIEW_STATUSES,
  reviewCertificationEvidence,
};
