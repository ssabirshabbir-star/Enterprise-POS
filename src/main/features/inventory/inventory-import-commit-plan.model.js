const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const {
  validateInventoryImportMatchedPreviewDocument,
} = require('./inventory-import-matched-preview.model');

const COMMIT_PLAN_DOCUMENT_KIND = 'inventory_import_commit_plan_document';
const COMMIT_PLAN_DOCUMENT_VERSION = 'inventory-import-commit-plan-v1';

const PRODUCT_ACTIONS = Object.freeze({
  CREATE_PRODUCT: 'CREATE_PRODUCT',
  USE_EXISTING_PRODUCT: 'USE_EXISTING_PRODUCT',
  NO_PRODUCT_ACTION: 'NO_PRODUCT_ACTION',
  BLOCKED: 'BLOCKED',
  UNSUPPORTED: 'UNSUPPORTED',
});

const STOCK_ACTIONS = Object.freeze({
  APPLY_OPENING_STOCK: 'APPLY_OPENING_STOCK',
  NO_STOCK_ACTION: 'NO_STOCK_ACTION',
  BLOCKED: 'BLOCKED',
  UNSUPPORTED: 'UNSUPPORTED',
});

const ROW_DISPOSITIONS = Object.freeze({
  EXECUTABLE: 'EXECUTABLE',
  EXECUTABLE_WITH_WARNINGS: 'EXECUTABLE_WITH_WARNINGS',
  BLOCKED: 'BLOCKED',
  UNSUPPORTED: 'UNSUPPORTED',
  SKIPPED: 'SKIPPED',
});

const COMMIT_PLAN_ERROR_CODES = Object.freeze({
  INVALID_DOCUMENT: 'INVENTORY_IMPORT_COMMIT_PLAN_INVALID',
  INVALID_INPUT: 'INVENTORY_IMPORT_COMMIT_PLAN_INPUT_INVALID',
  INVALID_ACTION: 'INVENTORY_IMPORT_COMMIT_PLAN_ACTION_INVALID',
});

const SUPPORTED_MATCHING_STATUSES = new Set([
  'EMPTY_ROW',
  'PRIMITIVE_INVALID',
  'DUPLICATE_INPUT',
  'EXISTING_PRODUCT_CANDIDATE',
  'POTENTIAL_NEW_PRODUCT',
  'IDENTIFIER_CONFLICT',
  'DUPLICATE_IN_DATABASE',
  'INACTIVE_PRODUCT_MATCH',
  'DELETED_PRODUCT_MATCH',
  'MISSING_CATALOG_REFERENCE',
  'INACTIVE_CATALOG_REFERENCE',
  'DUPLICATE_CATALOG_REFERENCE',
  'METADATA_MISMATCH',
  'INVENTORY_TARGET_MISSING',
  'DUPLICATE_INVENTORY_TARGET',
  'DUPLICATE_PRODUCT_TARGET',
  'PERMISSION_RESTRICTED',
  'OPENING_STOCK_NOT_ALLOWED',
  'MATCHING_FAILED',
  'MATCHING_ELIGIBLE',
]);

const DUPLICATE_CODES = new Set([
  'DUPLICATE_INPUT',
  'DUPLICATE_IN_DATABASE',
  'DUPLICATE_CATALOG_REFERENCE',
  'DUPLICATE_INVENTORY_TARGET',
  'DUPLICATE_PRODUCT_TARGET',
]);

const AMBIGUITY_CODES = new Set([
  'IDENTIFIER_CONFLICT',
  'DUPLICATE_IN_DATABASE',
  'DUPLICATE_PRODUCT_TARGET',
]);

const POLICY_BLOCK_REASON_CODES = Object.freeze({
  MISSING_REQUIRED_BARCODE: 'MISSING_REQUIRED_BARCODE',
});

class InventoryImportCommitPlanError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'InventoryImportCommitPlanError';
    this.code = code;
    this.field = field;
  }
}

function fail(code, message, field = null) {
  throw new InventoryImportCommitPlanError(code, message, field);
}

function assertPlainData(value, field = 'commitPlan') {
  const seen = new Set();

  function visit(item, key) {
    if (item === null || item === undefined) return;
    if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
      fail(COMMIT_PLAN_ERROR_CODES.INVALID_INPUT, 'Inventory import commit plan data must not be executable.', key);
    }
    if (typeof item !== 'object') return;
    if (seen.has(item)) {
      fail(COMMIT_PLAN_ERROR_CODES.INVALID_INPUT, 'Inventory import commit plan data must not be circular.', key);
    }
    if (Object.getPrototypeOf(item) !== Object.prototype && !Array.isArray(item)) {
      fail(COMMIT_PLAN_ERROR_CODES.INVALID_INPUT, 'Inventory import commit plan data must be plain data only.', key);
    }
    seen.add(item);
    Object.entries(item).forEach(([childKey, child]) => visit(child, childKey));
    seen.delete(item);
  }

  visit(value, field);
}

function deepFreezePlainData(value, field = 'commitPlan') {
  const seen = new Set();

  function visit(item) {
    if (item === null || item === undefined || typeof item !== 'object') return item;
    if (seen.has(item)) return item;
    if (Object.getPrototypeOf(item) !== Object.prototype && !Array.isArray(item)) {
      fail(COMMIT_PLAN_ERROR_CODES.INVALID_DOCUMENT, 'Inventory import commit plan output must be plain data only.', field);
    }
    seen.add(item);
    Object.values(item).forEach(visit);
    Object.freeze(item);
    seen.delete(item);
    return item;
  }

  return visit(value);
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
    .join(',')}}`;
}

function digestCommitPlanContent(content) {
  return createHash('sha256').update(canonicalStringify(content), 'utf8').digest('hex');
}

function requiredText(value, field, maxLength = 180) {
  const text = String(value || '').trim();
  if (!text) fail(COMMIT_PLAN_ERROR_CODES.INVALID_DOCUMENT, `${field} is required.`, field);
  return text.slice(0, maxLength);
}

function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    fail(COMMIT_PLAN_ERROR_CODES.INVALID_DOCUMENT, `${field} must be a non-negative integer.`, field);
  }
  return number;
}

function isPositiveDecimal(value) {
  return /[1-9]/.test(String(value || '0').replace('.', ''));
}

function hasRequiredBarcodeEvidence(normalized) {
  return typeof normalized.barcode === 'string' && normalized.barcode.trim().length > 0;
}

function findingCodes(row, severity = null) {
  return (row.matchingFindings || [])
    .filter((finding) => !severity || finding.severity === severity)
    .map((finding) => String(finding.code || '').trim())
    .filter(Boolean);
}

function safeFindingReferences(row) {
  return (row.matchingFindings || []).map((finding) => ({
    code: String(finding.code || '').trim(),
    severity: String(finding.severity || '').trim(),
    field: finding.field || null,
    source: finding.source || null,
    conflictGroupId: finding.conflictGroupId || null,
    metadata: finding.metadata || {},
  }));
}

function simplifiedCatalogEvidence(catalogResolution = {}) {
  const output = {};
  ['category', 'brand', 'unit', 'variant'].forEach((type) => {
    const resolution = catalogResolution[type] || {};
    output[type] = {
      supplied: resolution.supplied === true,
      normalizedName: String(resolution.normalizedName || ''),
      resolvedId: resolution.resolvedId || null,
      matches: Array.isArray(resolution.matches)
        ? resolution.matches.map((match) => ({
            id: match.id,
            name: match.name,
            active: match.active === true,
            deleted: match.deleted === true,
            updatedAt: match.updatedAt || null,
          }))
        : [],
    };
  });
  return output;
}

function normalizedSource(row) {
  const normalized = row.phase3Row?.normalized || {};
  return {
    productName: normalized.productName || '',
    sku: normalized.sku || '',
    barcode: normalized.barcode || '',
    category: normalized.category || '',
    brand: normalized.brand || '',
    unit: normalized.unit || '',
    variant: normalized.variant || '',
    costPrice: normalized.costPrice,
    sellingPrice: normalized.sellingPrice,
    wholesalePrice: normalized.wholesalePrice,
    openingQuantity: normalized.openingQuantity || '0',
    minimumStock: normalized.minimumStock || '0',
    active: normalized.active === undefined ? null : normalized.active,
    trackExpiry: normalized.trackExpiry === undefined ? null : normalized.trackExpiry,
    expiryRequired: normalized.expiryRequired === undefined ? null : normalized.expiryRequired,
    expiryAlertDays: normalized.expiryAlertDays,
    allowPriceChange: normalized.allowPriceChange === undefined ? null : normalized.allowPriceChange,
  };
}

function createStaleEvidence(row, sourceMatchingDigest) {
  const evidence = row.evidence || {};
  const product = row.matchedProduct || null;
  return {
    sourceMatchingDigest,
    normalizedSku: evidence.normalizedSku || '',
    normalizedBarcode: evidence.normalizedBarcode || '',
    skuMatchProductIds: Array.isArray(evidence.skuMatchProductIds) ? evidence.skuMatchProductIds : [],
    barcodeMatchProductIds: Array.isArray(evidence.barcodeMatchProductIds) ? evidence.barcodeMatchProductIds : [],
    matchedProduct: product
      ? {
          productId: product.productId,
          sku: product.sku || '',
          barcode: product.barcode || '',
          productName: product.productName || '',
          active: product.active === true,
          deleted: product.deleted === true,
          updatedAt: product.updatedAt || null,
        }
      : null,
    catalogs: simplifiedCatalogEvidence(evidence.catalogResolution || {}),
    defaultWarehouse: evidence.defaultWarehouse || null,
    inventoryTarget: {
      inventoryTargetId: evidence.inventoryTargetId || null,
      requiresRevalidation: true,
    },
    stockMovement: {
      movementCount: Number(evidence.movementCount || 0),
      latestMovementAt: evidence.latestMovementAt || null,
    },
  };
}

function rowHasDuplicate(row) {
  return row.status && DUPLICATE_CODES.has(row.status)
    ? true
    : (row.matchingFindings || []).some((finding) => DUPLICATE_CODES.has(finding.code));
}

function rowHasAmbiguity(row) {
  return row.status && AMBIGUITY_CODES.has(row.status)
    ? true
    : (row.matchingFindings || []).some((finding) => AMBIGUITY_CODES.has(finding.code));
}

function determineProductAction(row, normalized, errors, unsupportedActions, policyBlockReasons) {
  if (row.status === 'EMPTY_ROW') return PRODUCT_ACTIONS.NO_PRODUCT_ACTION;
  if (row.status === 'METADATA_MISMATCH') return PRODUCT_ACTIONS.UNSUPPORTED;
  if (errors.length) return PRODUCT_ACTIONS.BLOCKED;
  if (row.matchedProduct?.productId) {
    if ((row.matchingFindings || []).some((finding) => finding.code === 'METADATA_MISMATCH')) {
      unsupportedActions.push('UPDATE_PRODUCT_METADATA');
    }
    return PRODUCT_ACTIONS.USE_EXISTING_PRODUCT;
  }
  if (row.classification === 'POTENTIAL_NEW_PRODUCT' || row.status === 'MATCHING_ELIGIBLE') {
    const missing = [];
    if (!normalized.productName) missing.push('Product Name');
    if (!normalized.sku) missing.push('SKU');
    if (!hasRequiredBarcodeEvidence(normalized)) {
      missing.push('Barcode');
      policyBlockReasons.push(POLICY_BLOCK_REASON_CODES.MISSING_REQUIRED_BARCODE);
    }
    if (!normalized.costPrice) missing.push('Cost Price');
    if (!normalized.sellingPrice) missing.push('Selling Price');
    if (missing.length) return PRODUCT_ACTIONS.BLOCKED;
    if (row.evidence?.canCreateProduct !== true) return PRODUCT_ACTIONS.BLOCKED;
    return PRODUCT_ACTIONS.CREATE_PRODUCT;
  }
  return PRODUCT_ACTIONS.BLOCKED;
}

function determineStockAction(row, normalized, errors, productAction) {
  if (row.status === 'EMPTY_ROW') return STOCK_ACTIONS.NO_STOCK_ACTION;
  if (!isPositiveDecimal(normalized.openingQuantity)) return STOCK_ACTIONS.NO_STOCK_ACTION;
  if (errors.length || productAction === PRODUCT_ACTIONS.BLOCKED || productAction === PRODUCT_ACTIONS.UNSUPPORTED) {
    return STOCK_ACTIONS.BLOCKED;
  }
  if (row.evidence?.canAdjustInventory !== true) return STOCK_ACTIONS.BLOCKED;
  if (row.matchedProduct?.productId && !row.evidence?.inventoryTargetId) return STOCK_ACTIONS.BLOCKED;
  if (Number(row.evidence?.movementCount || 0) > 0) return STOCK_ACTIONS.BLOCKED;
  return STOCK_ACTIONS.APPLY_OPENING_STOCK;
}

function determineDisposition({ row, productAction, stockAction, errors, warnings }) {
  if (row.status === 'EMPTY_ROW') return ROW_DISPOSITIONS.SKIPPED;
  if (productAction === PRODUCT_ACTIONS.UNSUPPORTED || stockAction === STOCK_ACTIONS.UNSUPPORTED) {
    return ROW_DISPOSITIONS.UNSUPPORTED;
  }
  if (errors.length || productAction === PRODUCT_ACTIONS.BLOCKED || stockAction === STOCK_ACTIONS.BLOCKED) {
    return ROW_DISPOSITIONS.BLOCKED;
  }
  return warnings.length ? ROW_DISPOSITIONS.EXECUTABLE_WITH_WARNINGS : ROW_DISPOSITIONS.EXECUTABLE;
}

function createPlanRow(row, sourceMatchingDigest) {
  if (!row || typeof row !== 'object') {
    fail(COMMIT_PLAN_ERROR_CODES.INVALID_DOCUMENT, 'Matched preview row is invalid.', 'matchedRows');
  }
  const status = String(row.status || '').trim();
  if (!SUPPORTED_MATCHING_STATUSES.has(status)) {
    fail(COMMIT_PLAN_ERROR_CODES.INVALID_DOCUMENT, 'Matched preview row status is unsupported.', 'status');
  }
  const normalized = normalizedSource(row);
  const errors = findingCodes(row, 'ERROR');
  const warnings = findingCodes(row, 'WARNING');
  const unsupportedActions = [];
  const policyBlockReasons = [];
  const productAction = determineProductAction(row, normalized, errors, unsupportedActions, policyBlockReasons);
  const stockAction = determineStockAction(row, normalized, errors, productAction);
  if (!Object.values(PRODUCT_ACTIONS).includes(productAction) || !Object.values(STOCK_ACTIONS).includes(stockAction)) {
    fail(COMMIT_PLAN_ERROR_CODES.INVALID_ACTION, 'Inventory import commit plan action is invalid.', 'action');
  }
  const disposition = determineDisposition({ row, productAction, stockAction, errors, warnings });
  const blockReasons = [...new Set([...errors, ...policyBlockReasons])];
  if (disposition === ROW_DISPOSITIONS.BLOCKED && !blockReasons.length) {
    if (productAction === PRODUCT_ACTIONS.BLOCKED) blockReasons.push('PRODUCT_ACTION_BLOCKED');
    if (stockAction === STOCK_ACTIONS.BLOCKED) blockReasons.push('STOCK_ACTION_BLOCKED');
  }
  const requiredPermissions = [];
  if (productAction === PRODUCT_ACTIONS.CREATE_PRODUCT) requiredPermissions.push('products.create');
  if (stockAction === STOCK_ACTIONS.APPLY_OPENING_STOCK) requiredPermissions.push('inventory.adjust');

  return {
    kind: 'inventory_import_commit_plan_row',
    schemaVersion: 1,
    sourceRowNumber: nonNegativeInteger(row.sourceRowNumber, 'sourceRowNumber'),
    sourcePhase3Status: row.phase3Row?.status || null,
    sourceMatchingStatus: status,
    sourceClassification: row.classification || null,
    planningEligible:
      disposition === ROW_DISPOSITIONS.EXECUTABLE ||
      disposition === ROW_DISPOSITIONS.EXECUTABLE_WITH_WARNINGS,
    disposition,
    productAction,
    stockAction,
    blocked: disposition === ROW_DISPOSITIONS.BLOCKED,
    blockReasonCodes: blockReasons,
    warningCodes: [...new Set(warnings)],
    duplicate: rowHasDuplicate(row),
    ambiguous: rowHasAmbiguity(row),
    normalizedSource: normalized,
    matchedProduct: row.matchedProduct || null,
    catalogEvidence: simplifiedCatalogEvidence(row.evidence?.catalogResolution || {}),
    inventoryTargetEvidence: {
      inventoryTargetId: row.evidence?.inventoryTargetId || null,
      requiresRevalidation: true,
    },
    stockMovementEvidence: {
      movementCount: Number(row.evidence?.movementCount || 0),
      latestMovementAt: row.evidence?.latestMovementAt || null,
    },
    requiredFuturePermissions: requiredPermissions,
    permissionEvidence: {
      canAdjustInventory: row.evidence?.canAdjustInventory === true,
      canCreateProduct: row.evidence?.canCreateProduct === true,
      requiresPermissionRevalidation: true,
    },
    staleEvidence: createStaleEvidence(row, sourceMatchingDigest),
    unsupportedActions: [...new Set(unsupportedActions)],
    findingReferences: safeFindingReferences(row),
  };
}

function summarizeRows(rows) {
  const summary = {
    totalRows: rows.length,
    executableRows: 0,
    blockedRows: 0,
    createProductRows: 0,
    existingProductRows: 0,
    openingStockRows: 0,
    noStockRows: 0,
    emptyRows: 0,
    warningRows: 0,
    permissionBlockedRows: 0,
    duplicateRows: 0,
    ambiguousRows: 0,
    unsupportedRows: 0,
  };
  rows.forEach((row) => {
    if (row.disposition === ROW_DISPOSITIONS.EXECUTABLE || row.disposition === ROW_DISPOSITIONS.EXECUTABLE_WITH_WARNINGS) {
      summary.executableRows += 1;
    }
    if (row.disposition === ROW_DISPOSITIONS.BLOCKED) summary.blockedRows += 1;
    if (row.disposition === ROW_DISPOSITIONS.UNSUPPORTED) summary.unsupportedRows += 1;
    if (row.disposition === ROW_DISPOSITIONS.SKIPPED) summary.emptyRows += 1;
    if (row.warningCodes.length) summary.warningRows += 1;
    if (row.blockReasonCodes.includes('PERMISSION_RESTRICTED')) summary.permissionBlockedRows += 1;
    if (row.duplicate) summary.duplicateRows += 1;
    if (row.ambiguous) summary.ambiguousRows += 1;
    if (row.productAction === PRODUCT_ACTIONS.CREATE_PRODUCT) summary.createProductRows += 1;
    if (row.productAction === PRODUCT_ACTIONS.USE_EXISTING_PRODUCT) summary.existingProductRows += 1;
    if (row.stockAction === STOCK_ACTIONS.APPLY_OPENING_STOCK) summary.openingStockRows += 1;
    if (row.stockAction === STOCK_ACTIONS.NO_STOCK_ACTION) summary.noStockRows += 1;
  });
  return summary;
}

function validatePlanSummary(rows, summary) {
  if (summary.totalRows !== rows.length) {
    fail(COMMIT_PLAN_ERROR_CODES.INVALID_DOCUMENT, 'Commit plan summary row count is inconsistent.', 'summary');
  }
  rows.forEach((row) => {
    if (row.blocked && (row.productAction === PRODUCT_ACTIONS.CREATE_PRODUCT || row.stockAction === STOCK_ACTIONS.APPLY_OPENING_STOCK)) {
      fail(COMMIT_PLAN_ERROR_CODES.INVALID_DOCUMENT, 'Blocked rows must not contain executable actions.', 'planRows');
    }
    if (row.disposition === ROW_DISPOSITIONS.UNSUPPORTED && row.planningEligible) {
      fail(COMMIT_PLAN_ERROR_CODES.INVALID_DOCUMENT, 'Unsupported rows must not be planning eligible.', 'planRows');
    }
  });
  if (summary.createProductRows > summary.executableRows || summary.openingStockRows > summary.executableRows) {
    fail(COMMIT_PLAN_ERROR_CODES.INVALID_DOCUMENT, 'Commit plan summary action counts are inconsistent.', 'summary');
  }
}

function createInventoryImportCommitPlanDocument(input = {}) {
  assertPlainData(input, 'commitPlanInput');
  const allowedKeys = new Set(['matchedPreviewDocument', 'matchedPreviewSessionId']);
  Object.keys(input).forEach((key) => {
    if (!allowedKeys.has(key)) {
      fail(COMMIT_PLAN_ERROR_CODES.INVALID_INPUT, 'Commit plan input contains unsupported fields.', key);
    }
  });
  const matchedPreview = validateInventoryImportMatchedPreviewDocument(input.matchedPreviewDocument);
  const matchedPreviewSessionId = requiredText(input.matchedPreviewSessionId, 'matchedPreviewSessionId', 140);
  if (!/^inventory-import-matched-preview-[0-9a-f-]{36}$/i.test(matchedPreviewSessionId)) {
    fail(COMMIT_PLAN_ERROR_CODES.INVALID_INPUT, 'A Phase 5C matched preview session id is required.', 'matchedPreviewSessionId');
  }
  const rows = matchedPreview.matchedRows.map((row) => createPlanRow(row, matchedPreview.matchingDigest));
  const summary = summarizeRows(rows);
  validatePlanSummary(rows, summary);

  const digestContent = {
    kind: COMMIT_PLAN_DOCUMENT_KIND,
    version: COMMIT_PLAN_DOCUMENT_VERSION,
    schemaVersion: 1,
    databaseWrite: false,
    commitReady: false,
    rendererAuthoritative: false,
    requiresRevalidation: true,
    sourceMatchedPreviewSessionId: matchedPreviewSessionId,
    sourceMatchingDigest: matchedPreview.matchingDigest,
    sourcePreviewSessionId: matchedPreview.sourcePreviewSessionId,
    sourcePreviewId: matchedPreview.sourcePreviewId,
    sourceDocumentVersion: matchedPreview.sourceDocumentVersion,
    sourceBasename: matchedPreview.sourceBasename,
    sourceRowCount: matchedPreview.sourceRowCount,
    sourceDigest: matchedPreview.sourceDigest || null,
    planRows: rows,
    planSummary: summary,
  };
  const planDigest = digestCommitPlanContent(digestContent);
  const document = {
    ...digestContent,
    immutable: true,
    executable: false,
    planDigest,
  };
  return deepFreezePlainData(document, 'commitPlan');
}

function validateInventoryImportCommitPlanDocument(document) {
  if (
    !document ||
    document.kind !== COMMIT_PLAN_DOCUMENT_KIND ||
    document.version !== COMMIT_PLAN_DOCUMENT_VERSION ||
    document.schemaVersion !== 1 ||
    document.immutable !== true ||
    !Object.isFrozen(document) ||
    document.executable !== false ||
    document.databaseWrite !== false ||
    document.commitReady !== false ||
    document.rendererAuthoritative !== false ||
    document.requiresRevalidation !== true ||
    !Array.isArray(document.planRows) ||
    !document.planSummary ||
    !/^[0-9a-f]{64}$/i.test(String(document.planDigest || ''))
  ) {
    fail(COMMIT_PLAN_ERROR_CODES.INVALID_DOCUMENT, 'An immutable inventory import commit plan document is required.', 'commitPlan');
  }
  assertPlainData(document, 'commitPlan');
  const expectedSummary = summarizeRows(document.planRows);
  validatePlanSummary(document.planRows, document.planSummary);
  const digestContent = {
    kind: document.kind,
    version: document.version,
    schemaVersion: document.schemaVersion,
    databaseWrite: document.databaseWrite,
    commitReady: document.commitReady,
    rendererAuthoritative: document.rendererAuthoritative,
    requiresRevalidation: document.requiresRevalidation,
    sourceMatchedPreviewSessionId: document.sourceMatchedPreviewSessionId,
    sourceMatchingDigest: document.sourceMatchingDigest,
    sourcePreviewSessionId: document.sourcePreviewSessionId,
    sourcePreviewId: document.sourcePreviewId,
    sourceDocumentVersion: document.sourceDocumentVersion,
    sourceBasename: document.sourceBasename,
    sourceRowCount: document.sourceRowCount,
    sourceDigest: document.sourceDigest,
    planRows: document.planRows,
    planSummary: document.planSummary,
  };
  if (
    !isDeepStrictEqual(expectedSummary, document.planSummary) ||
    digestCommitPlanContent(digestContent) !== document.planDigest
  ) {
    fail(COMMIT_PLAN_ERROR_CODES.INVALID_DOCUMENT, 'Inventory import commit plan failed deterministic validation.', 'commitPlan');
  }
  return document;
}

module.exports = {
  COMMIT_PLAN_DOCUMENT_KIND,
  COMMIT_PLAN_DOCUMENT_VERSION,
  COMMIT_PLAN_ERROR_CODES,
  PRODUCT_ACTIONS,
  ROW_DISPOSITIONS,
  STOCK_ACTIONS,
  InventoryImportCommitPlanError,
  assertPlainData,
  createInventoryImportCommitPlanDocument,
  deepFreezePlainData,
  digestCommitPlanContent,
  validateInventoryImportCommitPlanDocument,
};
