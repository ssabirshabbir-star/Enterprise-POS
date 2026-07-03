const validationResult = require('./restore-validation-result.model');

const READINESS_DECISIONS = Object.freeze({
  READY: 'ready_read_only',
  NOT_READY: 'not_ready_read_only',
  BLOCKED: 'blocked_read_only',
});

const REASON_SEVERITY_ORDER = Object.freeze({
  [validationResult.VALIDATION_SEVERITIES.BLOCKED]: 0,
  [validationResult.VALIDATION_SEVERITIES.ERROR]: 1,
  [validationResult.VALIDATION_SEVERITIES.WARNING]: 2,
  [validationResult.VALIDATION_SEVERITIES.INFO]: 3,
});

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeCode(value) {
  return String(value || 'readiness.unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

function reason(code, severity, message, details = {}) {
  return freeze({
    code: normalizeCode(code),
    severity,
    message,
    details,
    readOnly: true,
    noRestoreExecuted: true,
    restoreExecutionAvailable: false,
  });
}

function orderReasons(reasons) {
  return [...reasons].sort((a, b) => {
    const severityDelta = REASON_SEVERITY_ORDER[a.severity] - REASON_SEVERITY_ORDER[b.severity];
    if (severityDelta !== 0) return severityDelta;
    return a.code.localeCompare(b.code);
  });
}

function failedFindings(source = {}) {
  return safeArray(source.findings).filter((finding) => finding.status === 'failed');
}

function failedSeverityCount(source = {}, severity) {
  return safeNumber(source?.summary?.failedBySeverity?.[severity]);
}

function hasBlockedFindings(source = {}) {
  return failedSeverityCount(source, validationResult.VALIDATION_SEVERITIES.BLOCKED) > 0;
}

function hasErrorFindings(source = {}) {
  return failedSeverityCount(source, validationResult.VALIDATION_SEVERITIES.ERROR) > 0;
}

function hasWarningFindings(source = {}) {
  return failedSeverityCount(source, validationResult.VALIDATION_SEVERITIES.WARNING) > 0;
}

function sourceReasons(sourceName, source = {}) {
  return failedFindings(source).map((finding) =>
    reason(`readiness.${sourceName}.${finding.code}`, finding.severity, finding.message, {
      source: sourceName,
      findingCode: finding.code,
    })
  );
}

function determineDecision(reasons) {
  if (reasons.some((item) => item.severity === validationResult.VALIDATION_SEVERITIES.BLOCKED)) {
    return READINESS_DECISIONS.BLOCKED;
  }
  if (reasons.some((item) => item.severity === validationResult.VALIDATION_SEVERITIES.ERROR)) {
    return READINESS_DECISIONS.BLOCKED;
  }
  if (reasons.some((item) => item.severity === validationResult.VALIDATION_SEVERITIES.WARNING)) {
    return READINESS_DECISIONS.NOT_READY;
  }
  return READINESS_DECISIONS.READY;
}

function createReadinessDecision({
  validation = null,
  inventorySnapshot = null,
  compatibilityAssessment = null,
  dependencyAssessment = null,
  impactAssessment = null,
  packageSummary = {},
} = {}) {
  const reasons = [];
  if (!validation || validation.readOnly !== true) {
    reasons.push(
      reason(
        'readiness.validation.missing',
        validationResult.VALIDATION_SEVERITIES.BLOCKED,
        'Validation result is missing for readiness decision.'
      )
    );
  } else if (validation.validationStatus === validationResult.VALIDATION_STATUSES.BLOCKED) {
    reasons.push(
      reason(
        'readiness.validation.blocked',
        validationResult.VALIDATION_SEVERITIES.BLOCKED,
        'Validation result is blocked.'
      )
    );
  } else if (validation.validationStatus !== validationResult.VALIDATION_STATUSES.PASSED) {
    reasons.push(
      reason(
        'readiness.validation.not_passed',
        validationResult.VALIDATION_SEVERITIES.ERROR,
        'Validation result is not passed.'
      )
    );
  }

  if (!inventorySnapshot || inventorySnapshot.snapshotStatus !== 'inventory_snapshot_available') {
    reasons.push(
      reason(
        'readiness.inventory.missing',
        validationResult.VALIDATION_SEVERITIES.BLOCKED,
        'Inventory snapshot is missing or unavailable.'
      )
    );
  }

  if (!compatibilityAssessment || compatibilityAssessment.readOnly !== true) {
    reasons.push(
      reason(
        'readiness.compatibility.missing',
        validationResult.VALIDATION_SEVERITIES.BLOCKED,
        'Compatibility assessment is missing.'
      )
    );
  } else {
    reasons.push(...sourceReasons('compatibility', compatibilityAssessment));
  }

  if (!dependencyAssessment || dependencyAssessment.readOnly !== true) {
    reasons.push(
      reason(
        'readiness.dependency.missing',
        validationResult.VALIDATION_SEVERITIES.BLOCKED,
        'Dependency assessment is missing.'
      )
    );
  } else {
    reasons.push(...sourceReasons('dependency', dependencyAssessment));
  }

  if (!impactAssessment || impactAssessment.readOnly !== true) {
    reasons.push(
      reason(
        'readiness.impact.missing',
        validationResult.VALIDATION_SEVERITIES.BLOCKED,
        'Impact assessment is missing.'
      )
    );
  } else {
    reasons.push(...sourceReasons('impact', impactAssessment));
    if (impactAssessment.riskClassification === 'blocked') {
      reasons.push(
        reason(
          'readiness.impact.risk_blocked',
          validationResult.VALIDATION_SEVERITIES.BLOCKED,
          'Impact assessment risk classification is blocked.'
        )
      );
    } else if (impactAssessment.riskClassification === 'high') {
      reasons.push(
        reason(
          'readiness.impact.risk_high',
          validationResult.VALIDATION_SEVERITIES.ERROR,
          'Impact assessment risk classification is high.'
        )
      );
    } else if (impactAssessment.riskClassification === 'medium') {
      reasons.push(
        reason(
          'readiness.impact.risk_medium',
          validationResult.VALIDATION_SEVERITIES.WARNING,
          'Impact assessment risk classification is medium.'
        )
      );
    }
  }

  const orderedReasons = orderReasons(reasons);
  const decision = determineDecision(orderedReasons);
  const cleanReadiness =
    decision === READINESS_DECISIONS.READY &&
    !hasBlockedFindings(validation) &&
    !hasErrorFindings(validation) &&
    !hasWarningFindings(validation) &&
    !hasBlockedFindings(compatibilityAssessment) &&
    !hasErrorFindings(compatibilityAssessment) &&
    !hasWarningFindings(compatibilityAssessment) &&
    !hasBlockedFindings(dependencyAssessment) &&
    !hasErrorFindings(dependencyAssessment) &&
    !hasWarningFindings(dependencyAssessment) &&
    !hasBlockedFindings(impactAssessment) &&
    !hasErrorFindings(impactAssessment) &&
    !hasWarningFindings(impactAssessment);

  return freeze({
    decisionType: 'restore_readiness_decision',
    decision,
    readinessStatus: decision,
    readOnly: true,
    assessmentOnly: true,
    decisionOnly: true,
    deterministic: true,
    noRestoreExecuted: true,
    noRestorePlanCreated: true,
    noExecutionOrderingCreated: true,
    noImportOrderingCreated: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    packageSummary,
    reasons: orderedReasons,
    summary: {
      totalReasons: orderedReasons.length,
      blocked: orderedReasons.filter(
        (item) => item.severity === validationResult.VALIDATION_SEVERITIES.BLOCKED
      ).length,
      error: orderedReasons.filter(
        (item) => item.severity === validationResult.VALIDATION_SEVERITIES.ERROR
      ).length,
      warning: orderedReasons.filter(
        (item) => item.severity === validationResult.VALIDATION_SEVERITIES.WARNING
      ).length,
      info: orderedReasons.filter(
        (item) => item.severity === validationResult.VALIDATION_SEVERITIES.INFO
      ).length,
      cleanReadiness,
    },
    message:
      decision === READINESS_DECISIONS.READY
        ? 'Restore readiness decision is ready for read-only governance review. Restore remains unavailable.'
        : 'Restore readiness decision is not ready for execution. Restore remains unavailable.',
  });
}

module.exports = {
  READINESS_DECISIONS,
  createReadinessDecision,
};
