const VALIDATION_STATUSES = Object.freeze({
  PASSED: 'validation_passed_read_only',
  FAILED: 'validation_failed_read_only',
  BLOCKED: 'validation_blocked_read_only',
});

const VALIDATION_SEVERITIES = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  BLOCKED: 'blocked',
});

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function normalizeItems(items) {
  return Array.isArray(items) ? items : [];
}

function normalizeSeverity(severity) {
  return Object.values(VALIDATION_SEVERITIES).includes(severity)
    ? severity
    : VALIDATION_SEVERITIES.ERROR;
}

function createValidationCheck(
  id,
  passed,
  message,
  details = {},
  severity = VALIDATION_SEVERITIES.ERROR
) {
  return freeze({
    id,
    passed: Boolean(passed),
    severity: normalizeSeverity(severity),
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
  const blockedChecks = failedChecks.filter(
    (check) => check.severity === VALIDATION_SEVERITIES.BLOCKED
  );
  const errorChecks = failedChecks.filter(
    (check) => check.severity === VALIDATION_SEVERITIES.ERROR
  );
  const warningChecks = failedChecks.filter(
    (check) => check.severity === VALIDATION_SEVERITIES.WARNING
  );
  const resultStatus =
    blockedChecks.length || normalizeItems(blockingReasons).length
      ? VALIDATION_STATUSES.BLOCKED
      : errorChecks.length || failedChecks.length
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
    severitySummary: {
      info: failedChecks.filter((check) => check.severity === VALIDATION_SEVERITIES.INFO).length,
      warning: warningChecks.length,
      error: errorChecks.length,
      blocked: blockedChecks.length,
    },
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
  VALIDATION_SEVERITIES,
  createValidationCheck,
  createValidationResult,
};
