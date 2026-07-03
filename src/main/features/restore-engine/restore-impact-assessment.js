const validationResult = require('./restore-validation-result.model');

const RISK_CLASSIFICATIONS = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  BLOCKED: 'blocked',
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

function failedBySeverity(assessment = {}) {
  return assessment?.summary?.failedBySeverity || {};
}

function failedSeverityCount(assessment, severity) {
  return safeNumber(failedBySeverity(assessment)[severity]);
}

function failedFindings(assessment = {}) {
  return safeArray(assessment.findings).filter((finding) => finding.status === 'failed');
}

function riskCheck(
  id,
  passed,
  message,
  details = {},
  severity = validationResult.VALIDATION_SEVERITIES.ERROR
) {
  return validationResult.createValidationCheck(id, passed, message, details, severity);
}

function tableRiskList(tables) {
  return safeArray(tables).map((table) =>
    freeze({
      name: table.name || null,
      classification: table.classification || null,
      recoveryCriticality: table.recoveryCriticality || null,
      rowCount: table.rowCountDeclared ? table.rowCount : null,
      rowCountDeclared: Boolean(table.rowCountDeclared),
      readOnly: true,
    })
  );
}

function totalDeclaredRows(tables) {
  return safeArray(tables).reduce((total, table) => {
    if (!table.rowCountDeclared) return total;
    return total + safeNumber(table.rowCount);
  }, 0);
}

function classifyRisk({
  inventoryAvailable,
  blockedFindings,
  errorFindings,
  warningFindings,
  excludedTableCount,
  rowCountsMissing,
}) {
  if (!inventoryAvailable || blockedFindings > 0) return RISK_CLASSIFICATIONS.BLOCKED;
  if (errorFindings > 0) return RISK_CLASSIFICATIONS.HIGH;
  if (warningFindings > 0 || excludedTableCount > 0 || rowCountsMissing > 0)
    return RISK_CLASSIFICATIONS.MEDIUM;
  return RISK_CLASSIFICATIONS.LOW;
}

function analyzeImpact({
  packageSummary = {},
  inventorySnapshot = null,
  compatibilityAssessment = null,
  dependencyAssessment = null,
} = {}) {
  const tableInventory = inventorySnapshot?.tableInventory || {};
  const includedTables = safeArray(tableInventory.includedTables);
  const excludedTables = safeArray(tableInventory.excludedTables);
  const inventoryAvailable =
    inventorySnapshot?.snapshotStatus === 'inventory_snapshot_available' &&
    inventorySnapshot?.readOnly === true;
  const includedTableCount = safeNumber(tableInventory.includedTableCount);
  const excludedTableCount = safeNumber(tableInventory.excludedTableCount);
  const rowCountsDeclared = safeNumber(tableInventory.rowCountsDeclared);
  const rowCountsMissing = safeNumber(tableInventory.rowCountsMissing);
  const compatibilityBlocked = failedSeverityCount(
    compatibilityAssessment,
    validationResult.VALIDATION_SEVERITIES.BLOCKED
  );
  const compatibilityErrors = failedSeverityCount(
    compatibilityAssessment,
    validationResult.VALIDATION_SEVERITIES.ERROR
  );
  const compatibilityWarnings = failedSeverityCount(
    compatibilityAssessment,
    validationResult.VALIDATION_SEVERITIES.WARNING
  );
  const dependencyBlocked = failedSeverityCount(
    dependencyAssessment,
    validationResult.VALIDATION_SEVERITIES.BLOCKED
  );
  const dependencyErrors = failedSeverityCount(
    dependencyAssessment,
    validationResult.VALIDATION_SEVERITIES.ERROR
  );
  const dependencyWarnings = failedSeverityCount(
    dependencyAssessment,
    validationResult.VALIDATION_SEVERITIES.WARNING
  );
  const blockedFindings = compatibilityBlocked + dependencyBlocked;
  const errorFindings = compatibilityErrors + dependencyErrors;
  const warningFindings = compatibilityWarnings + dependencyWarnings;
  const riskClassification = classifyRisk({
    inventoryAvailable,
    blockedFindings,
    errorFindings,
    warningFindings,
    excludedTableCount,
    rowCountsMissing,
  });

  const checks = [
    riskCheck(
      'impact.inventory.available',
      inventoryAvailable,
      'Inventory snapshot is available for read-only impact assessment.',
      { snapshotStatus: inventorySnapshot?.snapshotStatus || null },
      validationResult.VALIDATION_SEVERITIES.BLOCKED
    ),
    riskCheck(
      'impact.included_tables.present',
      includedTableCount > 0,
      'Included table impact can be summarized.',
      { includedTableCount }
    ),
    riskCheck(
      'impact.row_counts.declared',
      rowCountsMissing === 0,
      'Declared row-count impact is complete where table rows are summarized.',
      { rowCountsDeclared, rowCountsMissing },
      validationResult.VALIDATION_SEVERITIES.WARNING
    ),
    riskCheck(
      'impact.excluded_tables.reviewed',
      excludedTableCount === 0,
      'Excluded table impact requires governance review when declarations are present.',
      { excludedTableCount },
      validationResult.VALIDATION_SEVERITIES.WARNING
    ),
    riskCheck(
      'impact.compatibility.risk',
      compatibilityBlocked === 0 && compatibilityErrors === 0,
      'Compatibility findings do not create high-impact blockers.',
      {
        blocked: compatibilityBlocked,
        errors: compatibilityErrors,
        warnings: compatibilityWarnings,
      },
      compatibilityBlocked > 0
        ? validationResult.VALIDATION_SEVERITIES.BLOCKED
        : validationResult.VALIDATION_SEVERITIES.ERROR
    ),
    riskCheck(
      'impact.dependency.risk',
      dependencyBlocked === 0 && dependencyErrors === 0,
      'Dependency findings do not create high-impact blockers.',
      { blocked: dependencyBlocked, errors: dependencyErrors, warnings: dependencyWarnings },
      dependencyBlocked > 0
        ? validationResult.VALIDATION_SEVERITIES.BLOCKED
        : validationResult.VALIDATION_SEVERITIES.ERROR
    ),
    riskCheck(
      'impact.declaration.only',
      true,
      'Impact assessment uses declared package evidence only.',
      {
        liveDatabaseCompared: false,
        executionOrderingCreated: false,
        importOrderingCreated: false,
        executionPrepared: false,
      },
      validationResult.VALIDATION_SEVERITIES.INFO
    ),
    riskCheck(
      'impact.restore.unavailable',
      true,
      'Restore remains unavailable after read-only impact assessment.',
      { restoreExecutionAvailable: false },
      validationResult.VALIDATION_SEVERITIES.INFO
    ),
  ];
  const report = validationResult.createValidationResult({
    status: validationResult.VALIDATION_STATUSES.PASSED,
    message: 'Read-only Restore impact assessment completed. Restore remains unavailable.',
    packageSummary,
    checks,
  });

  return freeze({
    assessmentType: 'restore_impact_assessment',
    impactStatus: report.validationStatus,
    status: report.status,
    riskClassification,
    readOnly: true,
    assessmentOnly: true,
    impactOnly: true,
    declarationOnly: true,
    noRestoreExecuted: true,
    noRestorePlanCreated: true,
    noExecutionOrderingCreated: true,
    noImportOrderingCreated: true,
    noDataCommitted: true,
    noLiveDatabaseComparison: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    affectedTableSummary: {
      affectedTableCount: includedTableCount,
      includedTableCount,
      excludedTableCount,
      declaredTableList: safeArray(tableInventory.declaredTableList),
      affectedRowsDeclared: totalDeclaredRows(includedTables),
      rowCountsDeclared,
      rowCountsMissing,
    },
    includedTableImpact: tableRiskList(includedTables),
    excludedTableImpact: safeArray(excludedTables).map((table) =>
      freeze({
        name: table.name || null,
        reason: table.reason || null,
        readOnly: true,
      })
    ),
    declarationIndicators: {
      potentialConflictIndicators: failedFindings(compatibilityAssessment)
        .concat(failedFindings(dependencyAssessment))
        .map((finding) => ({
          code: finding.code,
          severity: finding.severity,
          message: finding.message,
        })),
      missingDataIndicators: rowCountsMissing > 0 ? ['row_count_declarations_missing'] : [],
      extraDataIndicators: excludedTableCount > 0 ? ['excluded_table_declarations_present'] : [],
      compatibilityRiskIndicators: {
        blocked: compatibilityBlocked,
        errors: compatibilityErrors,
        warnings: compatibilityWarnings,
      },
      dependencyRiskIndicators: {
        blocked: dependencyBlocked,
        errors: dependencyErrors,
        warnings: dependencyWarnings,
      },
    },
    findings: report.findings,
    summary: report.summary,
    severitySummary: report.severitySummary,
    message: report.message,
  });
}

module.exports = {
  RISK_CLASSIFICATIONS,
  analyzeImpact,
};
