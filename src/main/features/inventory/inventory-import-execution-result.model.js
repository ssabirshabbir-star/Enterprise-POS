const { isDeepStrictEqual } = require('node:util');
const {
  assertPlainData,
  deepFreezePlainData,
} = require('./inventory-import-commit-plan.model');

const IMPORT_EXECUTION_RESULT_KIND = 'inventory_import_execution_result';
const IMPORT_EXECUTION_RESULT_VERSION = 'inventory-import-execution-result-v1';

const IMPORT_EXECUTION_RESULT_ERROR_CODES = Object.freeze({
  INVALID_RESULT: 'INVENTORY_IMPORT_EXECUTION_RESULT_INVALID',
});

class InventoryImportExecutionResultError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'InventoryImportExecutionResultError';
    this.code = code;
    this.field = field;
  }
}

function fail(message, field = null) {
  throw new InventoryImportExecutionResultError(
    IMPORT_EXECUTION_RESULT_ERROR_CODES.INVALID_RESULT,
    message,
    field
  );
}

function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) fail(`${field} is invalid.`, field);
  return number;
}

function optionalId(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) fail(`${field} is invalid.`, field);
  return number;
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) fail(`${field} is required.`, field);
  return text;
}

function digest(value, field) {
  const text = String(value || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(text)) fail(`${field} is invalid.`, field);
  return text;
}

function optionalDigest(value, field) {
  if (value === null || value === undefined || value === '') return null;
  return digest(value, field);
}

function normalizeRowResult(row = {}) {
  return {
    rowResultId: optionalId(row.rowResultId, 'rowResultId'),
    sourceRowNumber: nonNegativeInteger(row.sourceRowNumber, 'sourceRowNumber'),
    productAction: requiredText(row.productAction, 'productAction'),
    stockAction: requiredText(row.stockAction, 'stockAction'),
    resultingProductId: optionalId(row.resultingProductId, 'resultingProductId'),
    resultingStockMovementId: optionalId(row.resultingStockMovementId, 'resultingStockMovementId'),
    quantity: row.quantity === null || row.quantity === undefined ? null : String(row.quantity),
    status: requiredText(row.status, 'status'),
    resultCode: row.resultCode ? String(row.resultCode).trim() : null,
  };
}

function createInventoryImportExecutionResult(input = {}) {
  assertPlainData(input, 'executionResultInput');
  const rows = Array.isArray(input.rowResults) ? input.rowResults.map(normalizeRowResult) : [];
  const summary = {
    totalRows: nonNegativeInteger(input.summary?.totalRows ?? rows.length, 'summary.totalRows'),
    createdProductCount: nonNegativeInteger(input.summary?.createdProductCount, 'summary.createdProductCount'),
    existingProductCount: nonNegativeInteger(input.summary?.existingProductCount, 'summary.existingProductCount'),
    stockAppliedCount: nonNegativeInteger(input.summary?.stockAppliedCount, 'summary.stockAppliedCount'),
    skippedCount: nonNegativeInteger(input.summary?.skippedCount || 0, 'summary.skippedCount'),
  };
  if (summary.totalRows !== rows.length) fail('Execution result row count is inconsistent.', 'summary.totalRows');
  return deepFreezePlainData({
    kind: IMPORT_EXECUTION_RESULT_KIND,
    version: IMPORT_EXECUTION_RESULT_VERSION,
    immutable: true,
    databaseWrite: true,
    transactionCommitted: true,
    auditPersisted: input.auditPersisted === true,
    executionComplete: true,
    replayed: input.replayed === true,
    batchId: optionalId(input.batchId, 'batchId'),
    idempotencyKey: requiredText(input.idempotencyKey, 'idempotencyKey'),
    ownerId: optionalId(input.ownerId, 'ownerId'),
    sourcePreflightSessionId: requiredText(input.sourcePreflightSessionId, 'sourcePreflightSessionId'),
    preflightDigest: digest(input.preflightDigest, 'preflightDigest'),
    commitPlanDigest: digest(input.commitPlanDigest, 'commitPlanDigest'),
    sourceDigest: optionalDigest(input.sourceDigest, 'sourceDigest'),
    contractVersion: requiredText(input.contractVersion, 'contractVersion'),
    contractDigest: digest(input.contractDigest, 'contractDigest'),
    status: requiredText(input.status, 'status'),
    committedAt: requiredText(input.committedAt, 'committedAt'),
    summary,
    rowResults: rows,
    lifecycleWarning: input.lifecycleWarning ? String(input.lifecycleWarning).trim() : null,
  });
}

function validateInventoryImportExecutionResult(result) {
  if (
    !result ||
    result.kind !== IMPORT_EXECUTION_RESULT_KIND ||
    result.version !== IMPORT_EXECUTION_RESULT_VERSION ||
    result.immutable !== true ||
    !Object.isFrozen(result) ||
    result.databaseWrite !== true ||
    result.transactionCommitted !== true ||
    result.executionComplete !== true ||
    !Array.isArray(result.rowResults)
  ) {
    fail('An immutable inventory import execution result is required.', 'executionResult');
  }
  const expected = createInventoryImportExecutionResult(result);
  if (!isDeepStrictEqual(expected, result)) fail('Inventory import execution result failed validation.', 'executionResult');
  return result;
}

module.exports = {
  IMPORT_EXECUTION_RESULT_ERROR_CODES,
  IMPORT_EXECUTION_RESULT_KIND,
  IMPORT_EXECUTION_RESULT_VERSION,
  InventoryImportExecutionResultError,
  createInventoryImportExecutionResult,
  validateInventoryImportExecutionResult,
};
