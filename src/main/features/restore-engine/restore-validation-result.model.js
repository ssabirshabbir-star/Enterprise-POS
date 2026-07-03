const VALIDATION_STATUSES = Object.freeze({
  PASSED: 'validation_passed_read_only',
  FAILED: 'validation_failed_read_only',
  BLOCKED: 'validation_blocked_read_only',
});

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function normalizeItems(items) {
  return Array.isArray(items) ? items : [];
}

function createValidationCheck(id, passed, message, details = {}) {
  return freeze({
    id,
    passed: Boolean(passed),
    message,
    details,
    readOnly: true,
    noRestoreExecuted: true,
    restoreExecutionAvailable: false,
  });
}

function createValidationResult({
  status = VALIDATION_STATUSES.BLOCKED,
  message,
  packageSummary = {},
  checks = [],
  warnings = [],
  blockingReasons = [],
} = {}) {
  const normalizedChecks = normalizeItems(checks);
  const failedChecks = normalizedChecks.filter((check) => check.passed !== true);
  const resultStatus =
    failedChecks.length || normalizeItems(blockingReasons).length
      ? status === VALIDATION_STATUSES.PASSED
        ? VALIDATION_STATUSES.FAILED
        : status
      : status;

  return freeze({
    validationStatus: resultStatus,
    message:
      message ||
      'Restore validation foundation completed a read-only assessment. Restore remains unavailable.',
    packageSummary,
    passedChecks: normalizedChecks.filter((check) => check.passed === true),
    failedChecks,
    warnings: normalizeItems(warnings),
    blockingReasons: normalizeItems(blockingReasons),
    readOnly: true,
    assessmentOnly: true,
    noRestoreExecuted: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
  });
}

module.exports = {
  VALIDATION_STATUSES,
  createValidationCheck,
  createValidationResult,
};
