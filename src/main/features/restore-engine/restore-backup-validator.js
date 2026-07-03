const manifestReader = require('./restore-manifest-reader');
const compatibilityAnalyzer = require('./restore-compatibility-analyzer');
const inventorySnapshot = require('./restore-inventory-snapshot');
const validationResult = require('./restore-validation-result.model');

const SUPPORTED_MANIFEST_VERSION = '1.0';
const SUPPORTED_WORKFLOW_VERSION = 'certified-backup-phase-1';
const SUPPORTED_BACKUP_CLASS = 'Operational Backup';
const SUPPORTED_INTEGRITY_ALGORITHM = 'sha256';
const SUPPORTED_BACKUP_FORMAT_VERSION = '1.0';
const REQUIRED_METADATA_FIELDS = Object.freeze([
  'backupUuid',
  'createdAt',
  'operator',
  'applicationVersion',
  'schemaVersion',
  'workflowVersion',
  'databaseVersion',
  'edition',
  'machine',
  'correlationId',
]);
const REQUIRED_TABLE_FIELDS = Object.freeze([
  'name',
  'classification',
  'recoveryCriticality',
  'dependency',
  'rowCount',
]);

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function check(
  id,
  passed,
  message,
  details = {},
  severity = validationResult.VALIDATION_SEVERITIES.ERROR
) {
  return validationResult.createValidationCheck(id, passed, message, details, severity);
}

function tableName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function tableDeclarationProblems(table) {
  if (!table || typeof table !== 'object' || Array.isArray(table)) {
    return ['Table declaration must be an object.'];
  }
  const problems = REQUIRED_TABLE_FIELDS.filter((field) => {
    if (field === 'rowCount')
      return !Number.isInteger(Number(table.rowCount)) || Number(table.rowCount) < 0;
    return !tableName(table[field]);
  }).map((field) => `Missing or invalid ${field}.`);
  return problems;
}

function missingMetadataFields(metadata) {
  return REQUIRED_METADATA_FIELDS.filter((field) => {
    if (field === 'operator') return !metadata.operator || typeof metadata.operator !== 'object';
    return !tableName(metadata[field]);
  });
}

function duplicateValues(values) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

function assessValidationFoundation() {
  return freeze({
    foundationStatus: 'validation_foundation_available_read_only',
    internalOnly: true,
    readOnly: true,
    assessmentOnly: true,
    metadataAndManifestOnly: true,
    validatesStructure: true,
    validatesMetadata: true,
    validatesTableList: true,
    validatesIntegrityDeclaration: true,
    validatesPayloadData: false,
    noRestoreExecuted: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    publicRestoreApiAvailable: false,
    message:
      'Restore validation foundation is available for read-only metadata and manifest assessment only.',
  });
}

function validateReadManifestResult(readResult) {
  const manifest = readResult?.manifest || {};
  const metadata = readResult?.metadata || {};
  const coverage = manifest.coverageDeclaration || {};
  const integrity = manifest.integrityDeclaration || {};
  const identity = manifest.backupIdentity || {};
  const compatibility = manifest.compatibilityDeclaration || {};
  const includedTables = Array.isArray(coverage.includedTables) ? coverage.includedTables : [];
  const excludedTables = Array.isArray(coverage.excludedTables) ? coverage.excludedTables : [];
  const workflowVersion = metadata.workflowVersion || compatibility.workflowVersion || null;
  const backupFormatVersion = compatibility.backupFormatVersion || null;
  const tableNames = includedTables.map((table) => tableName(table?.name)).filter(Boolean);
  const duplicateTableNames = duplicateValues(tableNames);
  const excludedNames = excludedTables
    .map((table) => tableName(typeof table === 'string' ? table : table?.name))
    .filter(Boolean);
  const duplicateExcludedNames = duplicateValues(excludedNames);
  const overlapTableNames = tableNames.filter((name) => excludedNames.includes(name));
  const invalidTableDeclarations = includedTables
    .map((table, index) => ({
      index,
      name: table?.name || null,
      problems: tableDeclarationProblems(table),
    }))
    .filter((item) => item.problems.length);
  const missingMetadata = missingMetadataFields(metadata);
  const checks = [
    check(
      'package.readable',
      readResult?.status === 'package_manifest_read',
      'Package file is readable.',
      {},
      validationResult.VALIDATION_SEVERITIES.BLOCKED
    ),
    check(
      'package.shape',
      readResult?.packageShape === 'certified_backup_candidate',
      'Package shape is supported.',
      { packageShape: readResult?.packageShape || null },
      validationResult.VALIDATION_SEVERITIES.BLOCKED
    ),
    check(
      'manifest.present',
      Boolean(readResult?.manifest),
      'Manifest is present.',
      {},
      validationResult.VALIDATION_SEVERITIES.BLOCKED
    ),
    check(
      'metadata.present',
      Boolean(readResult?.metadata),
      'Metadata is present.',
      {},
      validationResult.VALIDATION_SEVERITIES.BLOCKED
    ),
    check(
      'metadata.required_fields',
      missingMetadata.length === 0,
      'Required metadata fields are present.',
      { missingFields: missingMetadata }
    ),
    check(
      'manifest.version',
      manifest.manifestVersion === SUPPORTED_MANIFEST_VERSION,
      'Manifest version is supported.',
      { expected: SUPPORTED_MANIFEST_VERSION, actual: manifest.manifestVersion || null }
    ),
    check(
      'backup.format.version',
      backupFormatVersion === SUPPORTED_BACKUP_FORMAT_VERSION,
      'Backup format version is supported.',
      { expected: SUPPORTED_BACKUP_FORMAT_VERSION, actual: backupFormatVersion }
    ),
    check(
      'workflow.version',
      workflowVersion === SUPPORTED_WORKFLOW_VERSION,
      'Workflow version is supported.',
      { expected: SUPPORTED_WORKFLOW_VERSION, actual: workflowVersion }
    ),
    check(
      'backup.class',
      manifest.backupClass === SUPPORTED_BACKUP_CLASS,
      'Backup class is supported.',
      { expected: SUPPORTED_BACKUP_CLASS, actual: manifest.backupClass || null }
    ),
    check(
      'backup.identity',
      Boolean(identity.backupId || metadata.backupUuid),
      'Backup identity is present.'
    ),
    check(
      'correlation.identity',
      Boolean(identity.correlationId || metadata.correlationId),
      'Correlation identity is present.'
    ),
    check('coverage.included_tables', includedTables.length > 0, 'Included table list is present.'),
    check(
      'coverage.table_names',
      includedTables.length > 0 && tableNames.length === includedTables.length,
      'Every included table has a name.'
    ),
    check(
      'coverage.duplicate_tables',
      duplicateTableNames.length === 0,
      'Included table list has no duplicate names.',
      { duplicateTableNames }
    ),
    check(
      'coverage.table_declarations',
      invalidTableDeclarations.length === 0,
      'Every included table declaration is complete and valid.',
      { invalidTableDeclarations }
    ),
    check(
      'coverage.excluded_tables',
      Array.isArray(coverage.excludedTables),
      'Excluded table list is declared.',
      { excludedTableCount: excludedTables.length }
    ),
    check(
      'coverage.excluded_table_names',
      duplicateExcludedNames.length === 0,
      'Excluded table list has no duplicate names.',
      { duplicateExcludedNames },
      validationResult.VALIDATION_SEVERITIES.WARNING
    ),
    check(
      'coverage.table_overlap',
      overlapTableNames.length === 0,
      'Included and excluded table lists do not overlap.',
      { overlapTableNames }
    ),
    check(
      'integrity.declaration',
      integrity.algorithm === SUPPORTED_INTEGRITY_ALGORITHM && Boolean(integrity.dataHash),
      'Integrity declaration is present.',
      {
        expectedAlgorithm: SUPPORTED_INTEGRITY_ALGORITHM,
        actualAlgorithm: integrity.algorithm || null,
      }
    ),
    check(
      'recovery.blocked',
      manifest.recoveryDeclaration?.restoreEligible === false,
      'Package declares Restore as blocked.'
    ),
  ];
  const warnings = [];
  if (metadata.backupUuid && identity.backupId && metadata.backupUuid !== identity.backupId) {
    warnings.push('Metadata backup UUID differs from manifest backup identity.');
  }
  if (
    metadata.correlationId &&
    identity.correlationId &&
    metadata.correlationId !== identity.correlationId
  ) {
    warnings.push('Metadata correlation ID differs from manifest correlation identity.');
  }
  if (readResult?.packageSummary?.certificationStatus === null) {
    warnings.push('Backup certification status is not declared in the package summary.');
  }
  if (readResult?.packageSummary?.backupFormatVersion === null) {
    warnings.push('Backup format version is missing from the package summary.');
  }

  return validationResult.createValidationResult({
    status: validationResult.VALIDATION_STATUSES.PASSED,
    message: 'Read-only backup package validation completed. Restore remains unavailable.',
    packageSummary: readResult?.packageSummary || {},
    compatibilityAssessment: compatibilityAnalyzer.analyzeCompatibility({
      manifest: readResult?.manifest || null,
      metadata: readResult?.metadata || null,
      packageSummary: readResult?.packageSummary || {},
    }),
    inventorySnapshot: inventorySnapshot.createInventorySnapshot({
      manifest: readResult?.manifest || null,
      metadata: readResult?.metadata || null,
      packageSummary: readResult?.packageSummary || {},
    }),
    checks,
    warnings,
  });
}

async function validateBackupPackage(filePath) {
  const readResult = await manifestReader.readManifestPackage(filePath);
  if (readResult.status !== 'package_manifest_read') {
    return validationResult.createValidationResult({
      status: validationResult.VALIDATION_STATUSES.BLOCKED,
      message: readResult.message,
      packageSummary: readResult.packageSummary || {},
      compatibilityAssessment: compatibilityAnalyzer.analyzeCompatibility({
        packageSummary: readResult.packageSummary || {},
      }),
      inventorySnapshot: inventorySnapshot.createInventorySnapshot({
        packageSummary: readResult.packageSummary || {},
      }),
      checks: [
        check(
          'package.readable',
          false,
          'Package metadata and manifest could not be read.',
          {
            errorCode: readResult.errorCode || null,
          },
          validationResult.VALIDATION_SEVERITIES.BLOCKED
        ),
      ],
      blockingReasons: [readResult.message],
    });
  }
  return validateReadManifestResult(readResult);
}

module.exports = {
  assessValidationFoundation,
  validateBackupPackage,
  validateReadManifestResult,
};
