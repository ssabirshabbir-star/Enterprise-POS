const auditReviewer = require('./restore-audit-evidence-reviewer');

const AUDIT_GATE_STATE_VERSION = 'restore-audit-gate-state-shell-v1';

const AUDIT_GATE_STATUSES = Object.freeze({
  LOCKED: 'audit_gate_locked_read_only',
  INCOMPLETE: 'audit_gate_incomplete_read_only',
  BLOCKED: 'audit_gate_blocked_read_only',
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
    review.auditReviewerType !== 'restore_audit_evidence_reviewer_shell' ||
    review.readOnly !== true ||
    review.safetyFlags?.readOnly !== true
  );
}

function determineGateStatus({ invalid, reviewStatus, unsafeFlags }) {
  if (reviewStatus === auditReviewer.AUDIT_REVIEW_STATUSES.BLOCKED || unsafeFlags.length > 0) {
    return AUDIT_GATE_STATUSES.BLOCKED;
  }
  if (invalid || reviewStatus === auditReviewer.AUDIT_REVIEW_STATUSES.INCOMPLETE) {
    return AUDIT_GATE_STATUSES.INCOMPLETE;
  }
  return AUDIT_GATE_STATUSES.LOCKED;
}

function createAuditGateState(review = null) {
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
        'audit_gate.review.invalid',
        'Restore audit evidence review output is missing or malformed.',
        'review'
      )
    );
  }
  if (review?.reviewStatus === auditReviewer.AUDIT_REVIEW_STATUSES.INCOMPLETE) {
    gateReasons.push(
      reason(
        'audit_gate.review.incomplete',
        'Restore audit evidence review is incomplete.',
        'review'
      )
    );
  }
  if (review?.reviewStatus === auditReviewer.AUDIT_REVIEW_STATUSES.BLOCKED) {
    gateReasons.push(
      reason('audit_gate.review.blocked', 'Restore audit evidence review is blocked.', 'review')
    );
  }
  unsafeFlags.forEach((flag) => {
    gateReasons.push(reason(`audit_gate.unsafe.${flag}`, `${flag} must remain false.`));
  });
  if (gateStatus === AUDIT_GATE_STATUSES.LOCKED) {
    gateReasons.push(
      reason(
        'audit_gate.locked',
        'Restore audit gate state is locked read-only. No approval, activation, or execution decision is made.',
        'review'
      )
    );
  }

  return freeze({
    auditGateType: 'restore_audit_gate_state_shell',
    auditGateVersion: AUDIT_GATE_STATE_VERSION,
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
    }),
    gateReasons: orderReasons(gateReasons),
    unsafeFlags,
    safetyFlags: safetyFlags(),
    message:
      gateStatus === AUDIT_GATE_STATUSES.LOCKED
        ? 'Restore audit gate state is locked read-only. No approval, activation, or Restore execution is available.'
        : 'Restore audit gate state is incomplete or blocked. No approval, activation, or Restore execution is available.',
  });
}

module.exports = {
  AUDIT_GATE_STATE_VERSION,
  AUDIT_GATE_STATUSES,
  createAuditGateState,
};
