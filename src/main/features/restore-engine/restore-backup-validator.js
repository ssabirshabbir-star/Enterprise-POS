const manifestReader = require('./restore-manifest-reader');
const validationResult = require('./restore-validation-result.model');

const SUPPORTED_MANIFEST_VERSION = '1.0';
const SUPPORTED_WORKFLOW_VERSION = 'certified-backup-phase-1';
const SUPPORTED_BACKUP_CLASS = 'Operational Backup';
const SUPPORTED_INTEGRITY_ALGORITHM = 'sha256';

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function check(id, passed, message, details = {}) {
  return validationResult.createValidationCheck(id, passed, message, details);
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
  const tableNames = includedTables.map((table) => table?.name).filter(Boolean);
  const duplicateTableNames = tableNames.filter(
    (name, index) => tableNames.indexOf(name) !== index
  );
  const checks = [
    check(
      'package.readable',
      readResult?.status === 'package_manifest_read',
      'Package file is readable.'
    ),
    check('manifest.present', Boolean(readResult?.manifest), 'Manifest is present.'),
    check('metadata.present', Boolean(readResult?.metadata), 'Metadata is present.'),
    check(
      'manifest.version',
      manifest.manifestVersion === SUPPORTED_MANIFEST_VERSION,
      'Manifest version is supported.',
      { expected: SUPPORTED_MANIFEST_VERSION, actual: manifest.manifestVersion || null }
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
      'coverage.excluded_tables',
      Array.isArray(coverage.excludedTables),
      'Excluded table list is declared.',
      { excludedTableCount: excludedTables.length }
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

  return validationResult.createValidationResult({
    status: validationResult.VALIDATION_STATUSES.PASSED,
    message: 'Read-only backup package validation completed. Restore remains unavailable.',
    packageSummary: readResult?.packageSummary || {},
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
      checks: [
        check('package.readable', false, 'Package metadata and manifest could not be read.', {
          errorCode: readResult.errorCode || null,
        }),
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
