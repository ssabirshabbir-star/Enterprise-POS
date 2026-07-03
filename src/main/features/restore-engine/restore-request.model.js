const RESTORE_REQUEST_STATUSES = Object.freeze({
  BLOCKED: 'blocked',
  DRAFT: 'draft',
  INVALID: 'invalid',
  READY_FOR_FUTURE_CERTIFICATION: 'ready_for_future_certification',
});

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cleanString(value, fallback = null) {
  const text = String(value || '').trim();
  return text || fallback;
}

function buildRestoreSession({ operator = null, correlationId = null } = {}) {
  return freeze({
    sessionType: 'restore_execution_request_session',
    sessionStatus: operator?.id ? RESTORE_REQUEST_STATUSES.DRAFT : RESTORE_REQUEST_STATUSES.BLOCKED,
    operatorId: operator?.id || null,
    operatorRole: operator?.role || null,
    correlationId: cleanString(correlationId),
    createdAt: new Date().toISOString(),
    readOnly: true,
    noRestoreExecuted: true,
    restoreExecutionAvailable: false,
  });
}

function buildAssessmentSnapshot(snapshot = {}) {
  const source = clone(snapshot) || {};
  return freeze({
    snapshotType: 'restore_execution_assessment_snapshot',
    sourceStatus: cleanString(source.certificationOutcome || source.assessmentStatus, 'unknown'),
    certificationOutcome: cleanString(source.certificationOutcome, 'NOT_CERTIFIED'),
    restoreUnavailable: source.restoreUnavailable !== false,
    restoreEligible: source.restoreEligible === true,
    restoreExecutionAvailable: false,
    summary: clone(source.certificationSummary || {}),
    criteria: clone(source.certificationCriteria || []),
  });
}

function buildExecutionContext({ session, assessmentSnapshot } = {}) {
  return freeze({
    contextType: 'restore_execution_context',
    contextStatus:
      session?.sessionStatus === RESTORE_REQUEST_STATUSES.DRAFT
        ? 'context_ready_non_executable'
        : 'context_blocked',
    session,
    assessmentSnapshot,
    readOnly: true,
    noRestoreExecuted: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
  });
}

function validateRestoreRequest(request = {}) {
  const failures = [];
  if (!request.session?.operatorId) failures.push('Operator identity is required.');
  if (!request.assessmentSnapshot) failures.push('Assessment snapshot is required.');
  if (request.restoreExecutionAvailable === true) {
    failures.push('Restore execution must not be available in the request model phase.');
  }
  if (request.restoreEligible === true) {
    failures.push('Restore eligibility must remain false in the request model phase.');
  }
  return freeze({
    validationStatus: failures.length
      ? RESTORE_REQUEST_STATUSES.INVALID
      : RESTORE_REQUEST_STATUSES.BLOCKED,
    validForExecution: false,
    readOnly: true,
    failures,
    message: failures.length
      ? 'Restore execution request model is invalid for future certification review.'
      : 'Restore execution request model is structurally valid but execution remains blocked.',
  });
}

function createRestoreExecutionRequest({
  operator = null,
  correlationId = null,
  assessmentSnapshot = null,
} = {}) {
  const session = buildRestoreSession({ operator, correlationId });
  const frozenSnapshot = buildAssessmentSnapshot(assessmentSnapshot);
  const context = buildExecutionContext({ session, assessmentSnapshot: frozenSnapshot });
  const request = freeze({
    requestType: 'restore_execution_request',
    requestStatus: RESTORE_REQUEST_STATUSES.BLOCKED,
    immutable: true,
    internalOnly: true,
    readOnly: true,
    noRestoreExecuted: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    session,
    assessmentSnapshot: frozenSnapshot,
    executionContext: context,
  });
  return freeze({
    ...request,
    validation: validateRestoreRequest(request),
  });
}

module.exports = {
  RESTORE_REQUEST_STATUSES,
  createRestoreExecutionRequest,
  validateRestoreRequest,
};
