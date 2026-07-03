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

const SEVERITY_ORDER = Object.freeze({
  [VALIDATION_SEVERITIES.BLOCKED]: 0,
  [VALIDATION_SEVERITIES.ERROR]: 1,
  [VALIDATION_SEVERITIES.WARNING]: 2,
  [VALIDATION_SEVERITIES.INFO]: 3,
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

function normalizeCode(value) {
  return String(value || 'validation.unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function createValidationCheck(
  id,
  passed,
  message,
  details = {},
  severity = VALIDATION_SEVERITIES.ERROR
) {
  const code = normalizeCode(id);
  return freeze({
    id: code,
    code,
    passed: Boolean(passed),
    severity: normalizeSeverity(severity),
    message: String(message || code),
    details,
    readOnly: true,
    noRestoreExecuted: true,
    restoreExecutionAvailable: false,
  });
}

function orderFindings(items) {
  return [...items].sort((a, b) => {
    const severityDelta = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDelta !== 0) return severityDelta;
    return a.code.localeCompare(b.code);
  });
}

function normalizeFindings(checks) {
  return orderFindings(checks).map((check) =>
    freeze({
      code: check.code || normalizeCode(check.id),
      status: check.passed === true ? 'passed' : 'failed',
      severity: check.severity,
      message: check.message,
      details: check.details || {},
      readOnly: true,
      noRestoreExecuted: true,
      restoreExecutionAvailable: false,
    })
  );
}

function countBySeverity(findings, status = null) {
  return Object.values(VALIDATION_SEVERITIES).reduce((summary, severity) => {
    summary[severity] = findings.filter(
      (finding) => finding.severity === severity && (!status || finding.status === status)
    ).length;
    return summary;
  }, {});
}

function createValidationResult({
  status = VALIDATION_STATUSES.BLOCKED,
  message,
  packageSummary = {},
  inventorySnapshot = null,
  checks = [],
  warnings = [],
  blockingReasons = [],
} = {}) {
  const normalizedChecks = normalizeItems(checks);
  const findings = normalizeFindings(normalizedChecks);
  const failedFindings = findings.filter((finding) => finding.status === 'failed');
  const passedFindings = findings.filter((finding) => finding.status === 'passed');
  const failedChecks = orderFindings(normalizedChecks.filter((check) => check.passed !== true));
  const passedChecks = orderFindings(normalizedChecks.filter((check) => check.passed === true));
  const blockedChecks = failedFindings.filter(
    (check) => check.severity === VALIDATION_SEVERITIES.BLOCKED
  );
  const errorChecks = failedFindings.filter(
    (check) => check.severity === VALIDATION_SEVERITIES.ERROR
  );
  const warningChecks = failedFindings.filter(
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
    inventorySnapshot,
    status: resultStatus,
    findings,
    summary: {
      total: findings.length,
      passed: passedFindings.length,
      failed: failedFindings.length,
      bySeverity: countBySeverity(findings),
      failedBySeverity: countBySeverity(findings, 'failed'),
    },
    passedChecks,
    failedChecks,
    severitySummary: {
      info: failedFindings.filter((check) => check.severity === VALIDATION_SEVERITIES.INFO).length,
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
