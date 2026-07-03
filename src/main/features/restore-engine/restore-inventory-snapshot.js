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

function tableName(table) {
  return cleanString(typeof table === 'string' ? table : table?.name);
}

function rowCount(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function summarizeIncludedTable(table = {}) {
  return freeze({
    name: tableName(table),
    classification: cleanString(table.classification),
    recoveryCriticality: cleanString(table.recoveryCriticality),
    dependency: cleanString(table.dependency),
    rowCount: rowCount(table.rowCount),
    rowCountDeclared: rowCount(table.rowCount) !== null,
    readOnly: true,
  });
}

function summarizeExcludedTable(table = {}) {
  return freeze({
    name: tableName(table),
    reason: cleanString(table.reason),
    readOnly: true,
  });
}

function createInventorySnapshot({ manifest = null, metadata = null, packageSummary = {} } = {}) {
  const coverage = manifest?.coverageDeclaration || {};
  const integrity = manifest?.integrityDeclaration || {};
  const recovery = manifest?.recoveryDeclaration || {};
  const identity = manifest?.backupIdentity || {};
  const compatibility = manifest?.compatibilityDeclaration || {};
  const includedTables = safeArray(coverage.includedTables).map(summarizeIncludedTable);
  const excludedTables = safeArray(coverage.excludedTables).map(summarizeExcludedTable);

  return freeze({
    snapshotType: 'restore_backup_content_inventory_snapshot',
    snapshotStatus:
      manifest && metadata ? 'inventory_snapshot_available' : 'inventory_snapshot_unavailable',
    readOnly: true,
    assessmentOnly: true,
    inventoryOnly: true,
    noRestoreExecuted: true,
    noRestorePlanCreated: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    metadataSummary: {
      backupId: identity.backupId || metadata?.backupUuid || packageSummary.backupId || null,
      correlationId:
        identity.correlationId || metadata?.correlationId || packageSummary.correlationId || null,
      createdAt: metadata?.createdAt || manifest?.createdAt || packageSummary.createdAt || null,
      applicationVersion:
        metadata?.applicationVersion ||
        compatibility.applicationVersion ||
        packageSummary.applicationVersion ||
        null,
      schemaVersion:
        metadata?.schemaVersion ||
        compatibility.schemaVersion ||
        packageSummary.schemaVersion ||
        null,
      workflowVersion:
        metadata?.workflowVersion ||
        compatibility.workflowVersion ||
        packageSummary.workflowVersion ||
        null,
      backupFormatVersion:
        compatibility.backupFormatVersion || packageSummary.backupFormatVersion || null,
      backupClass: manifest?.backupClass || packageSummary.backupClass || null,
    },
    tableInventory: {
      includedTableCount: includedTables.length,
      excludedTableCount: excludedTables.length,
      declaredTableList: includedTables.map((table) => table.name).filter(Boolean),
      includedTables,
      excludedTables,
      rowCountsDeclared: includedTables.filter((table) => table.rowCountDeclared).length,
      rowCountsMissing: includedTables.filter((table) => !table.rowCountDeclared).length,
    },
    integrityDeclarationSummary: {
      declared: Boolean(integrity.dataHash),
      algorithm: cleanString(integrity.algorithm),
      hashPresent: Boolean(integrity.dataHash),
    },
    recoveryBlockDeclarationSummary: {
      restoreEligible: recovery.restoreEligible === true ? true : false,
      restoreBlocked: recovery.restoreEligible !== true,
      restoreStatus: cleanString(recovery.restoreStatus, 'Blocked'),
      restoreBlockReason: cleanString(recovery.restoreBlockReason),
    },
    message:
      manifest && metadata
        ? 'Read-only backup content inventory snapshot is available. No Restore plan was created.'
        : 'Backup content inventory snapshot is unavailable because manifest or metadata is missing.',
  });
}

module.exports = {
  createInventorySnapshot,
};
