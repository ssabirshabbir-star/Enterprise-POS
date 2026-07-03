const packageJson = require('../../../../package.json');
const validationResult = require('./restore-validation-result.model');

const SUPPORTED_BACKUP_FORMAT_VERSION = '1.0';
const SUPPORTED_SCHEMA_VERSION = 'current';
const SUPPORTED_WORKFLOW_VERSION = 'certified-backup-phase-1';
const KNOWN_FEATURES = Object.freeze([
  'certified_backup',
  'backup_manifest',
  'backup_metadata',
  'backup_integrity',
  'backup_table_coverage',
]);
const KNOWN_MODULES = Object.freeze([
  'settings',
  'backup',
  'restore-engine',
  'access-control',
  'products',
  'customers',
  'suppliers',
  'inventory',
  'billing',
]);

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function cleanString(value, fallback = null) {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item)).filter(Boolean);
}

function majorVersion(value) {
  const match = String(value || '').match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function compatibleApplicationVersion(version) {
  const declared = majorVersion(version);
  const current = majorVersion(packageJson.version);
  if (declared === null || current === null) return false;
  return declared <= current;
}

function compatibilityCheck(
  id,
  passed,
  message,
  details = {},
  severity = validationResult.VALIDATION_SEVERITIES.ERROR
) {
  return validationResult.createValidationCheck(id, passed, message, details, severity);
}

function analyzeCompatibility({ manifest = null, metadata = null, packageSummary = {} } = {}) {
  const compatibility = manifest?.compatibilityDeclaration || {};
  const backupFormatVersion =
    compatibility.backupFormatVersion || packageSummary.backupFormatVersion || null;
  const applicationVersion =
    metadata?.applicationVersion ||
    compatibility.applicationVersion ||
    packageSummary.applicationVersion ||
    null;
  const schemaVersion =
    metadata?.schemaVersion || compatibility.schemaVersion || packageSummary.schemaVersion || null;
  const workflowVersion =
    metadata?.workflowVersion ||
    compatibility.workflowVersion ||
    packageSummary.workflowVersion ||
    null;
  const requiredFeatures = normalizeList(
    compatibility.requiredFeatures || metadata?.requiredFeatures || metadata?.features
  );
  const requiredModules = normalizeList(
    compatibility.requiredModules || metadata?.requiredModules || metadata?.modules
  );
  const unknownFeatures = requiredFeatures.filter((feature) => !KNOWN_FEATURES.includes(feature));
  const unknownModules = requiredModules.filter(
    (moduleName) => !KNOWN_MODULES.includes(moduleName)
  );

  const checks = [
    compatibilityCheck(
      'compatibility.manifest.present',
      Boolean(manifest),
      'Manifest is available for compatibility assessment.',
      {},
      validationResult.VALIDATION_SEVERITIES.BLOCKED
    ),
    compatibilityCheck(
      'compatibility.metadata.present',
      Boolean(metadata),
      'Metadata is available for compatibility assessment.',
      {},
      validationResult.VALIDATION_SEVERITIES.BLOCKED
    ),
    compatibilityCheck(
      'compatibility.backup_format.version',
      backupFormatVersion === SUPPORTED_BACKUP_FORMAT_VERSION,
      'Backup format version is compatible.',
      { expected: SUPPORTED_BACKUP_FORMAT_VERSION, actual: backupFormatVersion }
    ),
    compatibilityCheck(
      'compatibility.workflow.version',
      workflowVersion === SUPPORTED_WORKFLOW_VERSION,
      'Workflow version is compatible.',
      { expected: SUPPORTED_WORKFLOW_VERSION, actual: workflowVersion }
    ),
    compatibilityCheck(
      'compatibility.application.version',
      Boolean(applicationVersion) && compatibleApplicationVersion(applicationVersion),
      'Application version is compatible for read-only assessment.',
      { current: packageJson.version, actual: applicationVersion },
      applicationVersion
        ? validationResult.VALIDATION_SEVERITIES.ERROR
        : validationResult.VALIDATION_SEVERITIES.WARNING
    ),
    compatibilityCheck(
      'compatibility.schema.version',
      schemaVersion === SUPPORTED_SCHEMA_VERSION,
      'Schema version is compatible.',
      { expected: SUPPORTED_SCHEMA_VERSION, actual: schemaVersion },
      schemaVersion
        ? validationResult.VALIDATION_SEVERITIES.ERROR
        : validationResult.VALIDATION_SEVERITIES.WARNING
    ),
    compatibilityCheck(
      'compatibility.required_features.known',
      unknownFeatures.length === 0,
      'Required feature declarations are known.',
      { requiredFeatures, unknownFeatures },
      validationResult.VALIDATION_SEVERITIES.WARNING
    ),
    compatibilityCheck(
      'compatibility.required_modules.known',
      unknownModules.length === 0,
      'Required module declarations are known.',
      { requiredModules, unknownModules },
      validationResult.VALIDATION_SEVERITIES.WARNING
    ),
  ];
  const report = validationResult.createValidationResult({
    status: validationResult.VALIDATION_STATUSES.PASSED,
    message: 'Read-only Restore compatibility assessment completed. Restore remains unavailable.',
    packageSummary,
    checks,
  });

  return freeze({
    assessmentType: 'restore_compatibility_assessment',
    compatibilityStatus: report.validationStatus,
    status: report.status,
    readOnly: true,
    assessmentOnly: true,
    compatibilityOnly: true,
    noRestoreExecuted: true,
    noRestorePlanCreated: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    packageCompatibility: {
      backupFormatVersion,
      applicationVersion,
      currentApplicationVersion: packageJson.version,
      schemaVersion,
      workflowVersion,
      requiredFeatures,
      requiredModules,
      unknownFeatures,
      unknownModules,
    },
    findings: report.findings,
    summary: report.summary,
    severitySummary: report.severitySummary,
    message: report.message,
  });
}

module.exports = {
  analyzeCompatibility,
};
