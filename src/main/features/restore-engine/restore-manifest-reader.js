const fs = require('fs/promises');
const path = require('path');

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function cleanString(value, fallback = null) {
  const text = String(value || '').trim();
  return text || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function detectPackageShape(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    return 'invalid_root';
  }
  if (backup.manifest || backup.metadata) return 'certified_backup_candidate';
  return 'unsupported_package_shape';
}

function summarizePackage(filePath, backup = {}) {
  const manifest = backup.manifest || {};
  const metadata = backup.metadata || {};
  const coverage = manifest.coverageDeclaration || {};
  const integrity = manifest.integrityDeclaration || {};
  const identity = manifest.backupIdentity || {};
  const compatibility = manifest.compatibilityDeclaration || {};
  const includedTables = safeArray(coverage.includedTables);
  const excludedTables = safeArray(coverage.excludedTables);

  return freeze({
    fileName: filePath ? path.basename(filePath) : null,
    filePath: filePath || null,
    backupId: identity.backupId || metadata.backupUuid || null,
    correlationId: identity.correlationId || metadata.correlationId || null,
    backupClass: cleanString(manifest.backupClass),
    manifestVersion: cleanString(manifest.manifestVersion),
    backupFormatVersion: cleanString(compatibility.backupFormatVersion),
    workflowVersion: cleanString(metadata.workflowVersion || compatibility.workflowVersion),
    applicationVersion: cleanString(
      metadata.applicationVersion || compatibility.applicationVersion
    ),
    schemaVersion: cleanString(metadata.schemaVersion || compatibility.schemaVersion),
    createdAt: cleanString(metadata.createdAt || manifest.createdAt),
    includedTableCount: includedTables.length,
    excludedTableCount: excludedTables.length,
    includedTables: includedTables.map((table) => ({
      name: table?.name || null,
      classification: table?.classification || null,
      recoveryCriticality: table?.recoveryCriticality || null,
      dependency: table?.dependency || null,
      rowCount: Number.isFinite(Number(table?.rowCount)) ? Number(table.rowCount) : null,
    })),
    excludedTables: excludedTables.map((table) =>
      typeof table === 'string' ? { name: table } : { name: table?.name || null }
    ),
    integrityAlgorithm: cleanString(integrity.algorithm),
    integrityDeclared: Boolean(integrity.dataHash),
    certificationStatus: backup.certification?.status || null,
    verificationStatus: backup.verification?.status || null,
    packageShape: detectPackageShape(backup),
    restoreEligible: false,
    restoreUnavailable: true,
    restoreExecutionAvailable: false,
  });
}

function result(status, message, details = {}) {
  return freeze({
    status,
    message,
    readOnly: true,
    metadataAndManifestOnly: true,
    noRestoreExecuted: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    ...details,
  });
}

async function readManifestPackage(filePath) {
  if (!filePath) {
    return result('package_path_missing', 'No backup package path was provided.');
  }

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const backup = JSON.parse(raw);
    const packageShape = detectPackageShape(backup);
    const manifest = packageShape === 'certified_backup_candidate' ? backup.manifest || null : null;
    const metadata = packageShape === 'certified_backup_candidate' ? backup.metadata || null : null;
    return result('package_manifest_read', 'Backup package metadata and manifest were read only.', {
      packageSummary: summarizePackage(filePath, backup),
      manifest,
      metadata,
      packageShape,
    });
  } catch (error) {
    return result(
      'package_manifest_unreadable',
      'Backup package metadata and manifest could not be read.',
      {
        errorCode: error.code || error.name || 'UNKNOWN',
        errorMessage: error.message,
        packageSummary: summarizePackage(filePath, {}),
      }
    );
  }
}

module.exports = {
  readManifestPackage,
  summarizePackage,
};
