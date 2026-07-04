const evidenceReviewer = require('./restore-certification-evidence-reviewer');

const GATE_STATE_VERSION = 'restore-certification-gate-state-shell-v1';

const GATE_STATUSES = Object.freeze({
  LOCKED: 'certification_gate_locked_read_only',
  INCOMPLETE: 'certification_gate_incomplete_read_only',
  BLOCKED: 'certification_gate_blocked_read_only',
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

function unsafeFlagsFor(sourceName, value = {}) {
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

function invalidReview(review = null) {
  return (
    !isObject(review) ||
    review.reviewerType !== 'restore_certification_evidence_reviewer_shell' ||
    review.readOnly !== true ||
    review.safetyFlags?.readOnly !== true
  );
}

function determineGateStatus({ invalid, reviewStatus, unsafeFlags }) {
  if (reviewStatus === evidenceReviewer.REVIEW_STATUSES.BLOCKED || unsafeFlags.length > 0) {
    return GATE_STATUSES.BLOCKED;
  }
  if (invalid || reviewStatus === evidenceReviewer.REVIEW_STATUSES.INCOMPLETE) {
    return GATE_STATUSES.INCOMPLETE;
  }
  return GATE_STATUSES.LOCKED;
}

function createCertificationGateState(review = null) {
  const invalid = invalidReview(review);
  const unsafeFlags = invalid ? [] : unsafeFlagsFor('review', review);
  const gateReasons = [];
  const gateStatus = determineGateStatus({
    invalid,
    reviewStatus: review?.reviewStatus,
    unsafeFlags,
  });

  if (invalid) {
    gateReasons.push(
      reason(
        'certification_gate.review.invalid',
        'Certification evidence review output is missing or malformed.',
        'review'
      )
    );
  }
  if (review?.reviewStatus === evidenceReviewer.REVIEW_STATUSES.INCOMPLETE) {
    gateReasons.push(
      reason(
        'certification_gate.review.incomplete',
        'Certification evidence review is incomplete.',
        'review'
      )
    );
  }
  if (review?.reviewStatus === evidenceReviewer.REVIEW_STATUSES.BLOCKED) {
    gateReasons.push(
      reason(
        'certification_gate.review.blocked',
        'Certification evidence review is blocked.',
        'review'
      )
    );
  }
  unsafeFlags.forEach((flag) => {
    gateReasons.push(reason(`certification_gate.unsafe.${flag}`, `${flag} must remain false.`));
  });
  if (gateStatus === GATE_STATUSES.LOCKED) {
    gateReasons.push(
      reason(
        'certification_gate.locked',
        'Certification gate review is locked read-only. No certification decision is made.',
        'review'
      )
    );
  }

  return freeze({
    gateType: 'restore_certification_gate_state_shell',
    gateVersion: GATE_STATE_VERSION,
    gateStatus,
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
    reviewSummary: freeze({
      present: Boolean(review),
      validReview: !invalid,
      reviewStatus: review?.reviewStatus || null,
      unsafeFlags: [...unsafeFlags],
      requiredFutureCertifications: [...(review?.requiredFutureCertifications || [])],
    }),
    gateReasons: orderReasons(gateReasons),
    unsafeFlags,
    requiredFutureCertifications: [...(review?.requiredFutureCertifications || [])],
    safetyFlags: safetyFlags(),
    message:
      gateStatus === GATE_STATUSES.LOCKED
        ? 'Certification gate state is locked read-only. No certification, activation, or Restore execution is available.'
        : 'Certification gate state is incomplete or blocked. No certification, activation, or Restore execution is available.',
  });
}

module.exports = {
  GATE_STATE_VERSION,
  GATE_STATUSES,
  createCertificationGateState,
};
