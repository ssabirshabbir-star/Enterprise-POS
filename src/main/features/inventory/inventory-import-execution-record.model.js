const { createHash } = require('node:crypto');
const {
  assertPlainData,
  deepFreezePlainData,
} = require('./inventory-import-commit-plan.model');
const {
  IMPORT_EXECUTION_CONTRACT_VERSION,
  createInventoryImportExecutionContract,
} = require('./inventory-import-execution-contract.model');

const IMPORT_EXECUTION_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  COMMITTED: 'COMMITTED',
  FAILED: 'FAILED',
  ROLLED_BACK: 'ROLLED_BACK',
  REPLAY_REJECTED: 'REPLAY_REJECTED',
});

const IMPORT_EXECUTION_ROW_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  COMMITTED: 'COMMITTED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
});

const IMPORT_EXECUTION_RECORD_ERROR_CODES = Object.freeze({
  INVALID_IDEMPOTENCY_KEY: 'INVENTORY_IMPORT_EXECUTION_IDEMPOTENCY_KEY_INVALID',
  INVALID_RECORD: 'INVENTORY_IMPORT_EXECUTION_RECORD_INVALID',
  INVALID_STATUS: 'INVENTORY_IMPORT_EXECUTION_STATUS_INVALID',
});

class InventoryImportExecutionRecordError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'InventoryImportExecutionRecordError';
    this.code = code;
    this.field = field;
  }
}

function fail(code, message, field = null) {
  throw new InventoryImportExecutionRecordError(code, message, field);
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
    .join(',')}}`;
}

function digest(value) {
  return createHash('sha256').update(canonicalStringify(value), 'utf8').digest('hex');
}

function requiredDigest(value, field) {
  const text = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text)) fail(IMPORT_EXECUTION_RECORD_ERROR_CODES.INVALID_RECORD, `${field} is invalid.`, field);
  return text;
}

function optionalDigest(value, field) {
  if (value === null || value === undefined || value === '') return null;
  return requiredDigest(value, field);
}

function ownerScope(value) {
  const ownerId = Number(value);
  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    fail(IMPORT_EXECUTION_RECORD_ERROR_CODES.INVALID_RECORD, 'Execution owner scope is invalid.', 'ownerId');
  }
  return ownerId;
}

function buildImportExecutionIdempotencyKey(input = {}) {
  assertPlainData(input, 'idempotencyInput');
  const contract = createInventoryImportExecutionContract();
  const material = {
    kind: 'inventory_import_execution_idempotency_key',
    schemaVersion: 1,
    ownerId: ownerScope(input.ownerId),
    sourceDigest: optionalDigest(input.sourceDigest, 'sourceDigest'),
    commitPlanDigest: requiredDigest(input.commitPlanDigest, 'commitPlanDigest'),
    preflightDigest: requiredDigest(input.preflightDigest, 'preflightDigest'),
    contractVersion: String(input.contractVersion || IMPORT_EXECUTION_CONTRACT_VERSION),
    contractDigest: String(input.contractDigest || contract.contractDigest),
  };
  return `inventory-import-execution-${digest(material)}`;
}

function normalizeExecutionStatus(value, field = 'status') {
  const status = String(value || '').trim().toUpperCase();
  if (!Object.values(IMPORT_EXECUTION_STATUSES).includes(status)) {
    fail(IMPORT_EXECUTION_RECORD_ERROR_CODES.INVALID_STATUS, 'Import execution status is invalid.', field);
  }
  return status;
}

function normalizeExecutionRowStatus(value, field = 'rowStatus') {
  const status = String(value || '').trim().toUpperCase();
  if (!Object.values(IMPORT_EXECUTION_ROW_STATUSES).includes(status)) {
    fail(IMPORT_EXECUTION_RECORD_ERROR_CODES.INVALID_STATUS, 'Import execution row status is invalid.', field);
  }
  return status;
}

function validateImportBatchRecord(record = {}) {
  assertPlainData(record, 'importBatchRecord');
  const normalized = {
    batchId: record.batchId === null || record.batchId === undefined ? null : Number(record.batchId),
    idempotencyKey: String(record.idempotencyKey || '').trim(),
    ownerId: ownerScope(record.ownerId),
    sourceDigest: optionalDigest(record.sourceDigest, 'sourceDigest'),
    commitPlanDigest: requiredDigest(record.commitPlanDigest, 'commitPlanDigest'),
    preflightDigest: requiredDigest(record.preflightDigest, 'preflightDigest'),
    contractVersion: String(record.contractVersion || IMPORT_EXECUTION_CONTRACT_VERSION),
    status: normalizeExecutionStatus(record.status),
    totalRows: Number(record.totalRows || 0),
    createdProductCount: Number(record.createdProductCount || 0),
    existingProductCount: Number(record.existingProductCount || 0),
    stockAppliedCount: Number(record.stockAppliedCount || 0),
    blockedOrFailedCount: Number(record.blockedOrFailedCount || 0),
    failureCode: record.failureCode ? String(record.failureCode).trim() : null,
  };
  if (!/^inventory-import-execution-[0-9a-f]{64}$/i.test(normalized.idempotencyKey)) {
    fail(IMPORT_EXECUTION_RECORD_ERROR_CODES.INVALID_IDEMPOTENCY_KEY, 'Import execution idempotency key is invalid.', 'idempotencyKey');
  }
  for (const field of ['totalRows', 'createdProductCount', 'existingProductCount', 'stockAppliedCount', 'blockedOrFailedCount']) {
    if (!Number.isInteger(normalized[field]) || normalized[field] < 0) {
      fail(IMPORT_EXECUTION_RECORD_ERROR_CODES.INVALID_RECORD, `${field} must be a non-negative integer.`, field);
    }
  }
  return deepFreezePlainData(normalized, 'importBatchRecord');
}

function validateImportRowResultRecord(record = {}) {
  assertPlainData(record, 'importRowResultRecord');
  const normalized = {
    rowResultId: record.rowResultId === null || record.rowResultId === undefined ? null : Number(record.rowResultId),
    batchId: record.batchId === null || record.batchId === undefined ? null : Number(record.batchId),
    sourceRowNumber: Number(record.sourceRowNumber),
    productAction: String(record.productAction || '').trim(),
    resultingProductId: record.resultingProductId === null || record.resultingProductId === undefined ? null : Number(record.resultingProductId),
    stockAction: String(record.stockAction || '').trim(),
    resultingStockMovementId:
      record.resultingStockMovementId === null || record.resultingStockMovementId === undefined
        ? null
        : Number(record.resultingStockMovementId),
    quantity: record.quantity === null || record.quantity === undefined ? null : String(record.quantity),
    status: normalizeExecutionRowStatus(record.status),
    resultCode: record.resultCode ? String(record.resultCode).trim() : null,
  };
  if (!Number.isInteger(normalized.sourceRowNumber) || normalized.sourceRowNumber < 0) {
    fail(IMPORT_EXECUTION_RECORD_ERROR_CODES.INVALID_RECORD, 'Source row number is invalid.', 'sourceRowNumber');
  }
  return deepFreezePlainData(normalized, 'importRowResultRecord');
}

module.exports = {
  IMPORT_EXECUTION_RECORD_ERROR_CODES,
  IMPORT_EXECUTION_ROW_STATUSES,
  IMPORT_EXECUTION_STATUSES,
  InventoryImportExecutionRecordError,
  buildImportExecutionIdempotencyKey,
  normalizeExecutionRowStatus,
  normalizeExecutionStatus,
  validateImportBatchRecord,
  validateImportRowResultRecord,
};
