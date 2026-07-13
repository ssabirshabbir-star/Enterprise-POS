const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const {
  PRODUCT_ACTIONS,
  ROW_DISPOSITIONS,
  STOCK_ACTIONS,
  assertPlainData,
  deepFreezePlainData,
  validateInventoryImportCommitPlanDocument,
} = require('./inventory-import-commit-plan.model');
const {
  IMPORT_EXECUTION_CONTRACT_VERSION,
  IMPORT_EXECUTION_POLICY_CODES,
  IMPORT_EXECUTION_STOCK_STRATEGIES,
  createInventoryImportExecutionContract,
  findExecutionStockPolicy,
} = require('./inventory-import-execution-contract.model');
const { normalizeCatalogName, normalizeMatchingIdentifier } = require('./inventory-import-matching.contract');

const EXECUTION_PREFLIGHT_DOCUMENT_KIND = 'inventory_import_execution_preflight_document';
const EXECUTION_PREFLIGHT_DOCUMENT_VERSION = 'inventory-import-execution-preflight-v1';

const PREFLIGHT_ROW_DISPOSITIONS = Object.freeze({
  CURRENTLY_ELIGIBLE: 'CURRENTLY_ELIGIBLE',
  BLOCKED: 'BLOCKED',
  SKIPPED: 'SKIPPED',
});

const PREFLIGHT_REASON_CODES = Object.freeze({
  BARCODE_NOW_EXISTS: 'BARCODE_NOW_EXISTS',
  CURRENT_INVENTORY_PERMISSION_REQUIRED: 'CURRENT_INVENTORY_PERMISSION_REQUIRED',
  CURRENT_PRODUCT_CREATE_PERMISSION_REQUIRED: 'CURRENT_PRODUCT_CREATE_PERMISSION_REQUIRED',
  INVENTORY_TARGET_INVALID: 'INVENTORY_TARGET_INVALID',
  MALFORMED_COMMIT_PLAN: 'MALFORMED_COMMIT_PLAN',
  MATCHED_PRODUCT_CHANGED: 'MATCHED_PRODUCT_CHANGED',
  MATCHED_PRODUCT_INACTIVE: 'MATCHED_PRODUCT_INACTIVE',
  MATCHED_PRODUCT_MISSING: 'MATCHED_PRODUCT_MISSING',
  EXISTING_PRODUCT_OPENING_STOCK_UNSUPPORTED: 'EXISTING_PRODUCT_OPENING_STOCK_UNSUPPORTED',
  OPENING_STOCK_STATE_UNRESOLVED: 'OPENING_STOCK_STATE_UNRESOLVED',
  REQUIRED_CATALOG_INACTIVE: 'REQUIRED_CATALOG_INACTIVE',
  REQUIRED_CATALOG_MISSING: 'REQUIRED_CATALOG_MISSING',
  SKU_NOW_EXISTS: 'SKU_NOW_EXISTS',
  SOURCE_PLAN_DIGEST_MISMATCH: 'SOURCE_PLAN_DIGEST_MISMATCH',
  SOURCE_PLAN_NOT_EXECUTABLE: 'SOURCE_PLAN_NOT_EXECUTABLE',
  WAREHOUSE_INACTIVE: 'WAREHOUSE_INACTIVE',
  WAREHOUSE_MISSING: 'WAREHOUSE_MISSING',
});

const PREFLIGHT_ERROR_CODES = Object.freeze({
  INVALID_DOCUMENT: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_INVALID',
  INVALID_INPUT: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_INPUT_INVALID',
});

const CATALOG_TYPES = Object.freeze(['category', 'brand', 'unit', 'variant']);
const EXECUTION_SOURCE_EVIDENCE_KIND = 'inventory_import_execution_source_evidence';
const EXECUTION_SOURCE_EVIDENCE_VERSION = 1;

class InventoryImportExecutionPreflightError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'InventoryImportExecutionPreflightError';
    this.code = code;
    this.field = field;
  }
}

function fail(code, message, field = null) {
  throw new InventoryImportExecutionPreflightError(code, message, field);
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
    .join(',')}}`;
}

function digestPreflightContent(content) {
  return createHash('sha256').update(canonicalStringify(content), 'utf8').digest('hex');
}

function timestamp(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_INPUT, `${field} must be a valid timestamp.`, field);
  }
  return date.toISOString();
}

function normalizeProducts(products = []) {
  return [...products]
    .filter(Boolean)
    .map((product) => ({
      productId: Number(product.productId),
      sku: String(product.sku || ''),
      normalizedSku: normalizeMatchingIdentifier(product.normalizedSku || product.sku),
      barcode: String(product.barcode || ''),
      normalizedBarcode: normalizeMatchingIdentifier(product.normalizedBarcode || product.barcode),
      productName: String(product.productName || ''),
      active: product.active === true,
      deleted: product.deleted === true,
      updatedAt: product.updatedAt || null,
    }))
    .sort((left, right) => left.productId - right.productId || left.normalizedSku.localeCompare(right.normalizedSku));
}

function normalizeCatalogs(catalogs = {}) {
  const output = {};
  ['category', 'brand', 'unit', 'variant'].forEach((type) => {
    output[type] = [...(catalogs[type] || [])]
      .filter(Boolean)
      .map((catalog) => ({
        id: Number(catalog.id),
        name: String(catalog.name || ''),
        normalizedName: normalizeCatalogName(catalog.normalizedName || catalog.name),
        active: catalog.active === true,
        deleted: catalog.deleted === true,
        updatedAt: catalog.updatedAt || null,
      }))
      .sort((left, right) => left.normalizedName.localeCompare(right.normalizedName) || left.id - right.id);
  });
  return output;
}

function normalizeInventoryTargets(targets = []) {
  return [...targets]
    .filter(Boolean)
    .map((target) => ({
      inventoryId: Number(target.inventoryId),
      productId: Number(target.productId),
      warehouseId: Number(target.warehouseId),
      quantity: String(target.quantity || '0'),
      updatedAt: target.updatedAt || null,
    }))
    .sort((left, right) => left.productId - right.productId || left.inventoryId - right.inventoryId);
}

function normalizeMovementSummaries(summaries = []) {
  return [...summaries]
    .filter(Boolean)
    .map((summary) => ({
      productId: Number(summary.productId),
      movementCount: Math.max(0, Number(summary.movementCount || 0)),
      latestMovementAt: summary.latestMovementAt || null,
    }))
    .sort((left, right) => left.productId - right.productId);
}

function normalizeCurrentState(currentState = {}) {
  return {
    products: normalizeProducts(currentState.products),
    catalogs: normalizeCatalogs(currentState.catalogs),
    defaultWarehouse: currentState.defaultWarehouse
      ? {
          warehouseId: Number(currentState.defaultWarehouse.warehouseId),
          name: String(currentState.defaultWarehouse.name || ''),
          active: currentState.defaultWarehouse.active === true,
          updatedAt: currentState.defaultWarehouse.updatedAt || null,
        }
      : null,
    inventoryTargets: normalizeInventoryTargets(currentState.inventoryTargets),
    movementSummaries: normalizeMovementSummaries(currentState.movementSummaries),
  };
}

function requiredObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, `${field} must be a plain object.`, field);
  }
  return value;
}

function rejectUnsupportedKeys(value, allowedKeys, field) {
  Object.keys(value || {}).forEach((key) => {
    if (!allowedKeys.has(key)) {
      fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, `${field} contains unsupported fields.`, `${field}.${key}`);
    }
  });
}

function positiveIdOrNull(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, `${field} is invalid.`, field);
  }
  return number;
}

function nonNegativeRowNumber(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, `${field} is invalid.`, field);
  }
  return number;
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, `${field} is required.`, field);
  }
  return text;
}

function optionalText(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function optionalBoolean(value) {
  return value === null || value === undefined ? null : value === true;
}

function positiveDecimal(value, field) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(text) || !/[1-9]/.test(text.replace('.', ''))) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, `${field} must be a positive decimal string.`, field);
  }
  return text;
}

function catalogMatchEvidence(match, field) {
  const item = requiredObject(match, field);
  rejectUnsupportedKeys(item, new Set(['id', 'name', 'active', 'deleted', 'updatedAt']), field);
  return {
    id: positiveIdOrNull(item.id, `${field}.id`),
    name: String(item.name || ''),
    normalizedName: normalizeCatalogName(item.name),
    active: item.active === true,
    deleted: item.deleted === true,
    updatedAt: item.updatedAt || null,
  };
}

function catalogExecutionEvidence(type, entry = {}) {
  const source = entry || {};
  requiredObject(source, `catalogEvidence.${type}`);
  rejectUnsupportedKeys(source, new Set(['supplied', 'normalizedName', 'resolvedId', 'matches']), `catalogEvidence.${type}`);
  const supplied = source.supplied === true;
  const normalizedName = normalizeCatalogName(source.normalizedName);
  const resolvedId = positiveIdOrNull(source.resolvedId, `catalogEvidence.${type}.resolvedId`);
  const matches = Array.isArray(source.matches)
    ? source.matches.map((match, index) => catalogMatchEvidence(match, `catalogEvidence.${type}.matches.${index}`))
    : [];
  if (!supplied) {
    if (normalizedName || resolvedId || matches.length) {
      fail(
        PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT,
        'Omitted catalog evidence must not contain resolved catalog data.',
        `catalogEvidence.${type}`
      );
    }
    return {
      supplied: false,
      normalizedName: '',
      resolvedId: null,
      resolvedName: null,
      active: null,
      deleted: null,
      updatedAt: null,
    };
  }
  if (!normalizedName) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'Supplied catalog evidence requires a normalized name.', `catalogEvidence.${type}`);
  }
  const resolved = resolvedId ? matches.find((match) => match.id === resolvedId) || null : null;
  if (resolvedId && !resolved) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'Resolved catalog id must be present in certified matches.', `catalogEvidence.${type}`);
  }
  if (resolved && resolved.normalizedName !== normalizedName) {
    fail(
      PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT,
      'Resolved catalog id and name evidence are inconsistent.',
      `catalogEvidence.${type}`
    );
  }
  return {
    supplied: true,
    normalizedName,
    resolvedId,
    resolvedName: resolved ? resolved.name : null,
    active: resolved ? resolved.active === true : null,
    deleted: resolved ? resolved.deleted === true : null,
    updatedAt: resolved ? resolved.updatedAt || null : null,
  };
}

function createCatalogExecutionEvidence(planRow) {
  const catalogEvidence = planRow.catalogEvidence || {};
  const output = {};
  CATALOG_TYPES.forEach((type) => {
    output[type] = catalogExecutionEvidence(type, catalogEvidence[type] || {});
  });
  return output;
}

function matchingProducts(products, field, value) {
  const normalized = normalizeMatchingIdentifier(value);
  if (!normalized) return [];
  return products.filter((product) => product[field] === normalized);
}

function findMatchedProduct(products, planRow) {
  const productId = Number(planRow.matchedProduct?.productId);
  if (!Number.isInteger(productId) || productId <= 0) return null;
  return products.find((product) => product.productId === productId) || null;
}

function catalogReasons(planRow, currentState) {
  const reasons = [];
  const evidence = planRow.catalogEvidence || {};
  Object.entries(evidence).forEach(([type, entry]) => {
    if (!entry?.supplied) return;
    const normalizedName = normalizeCatalogName(entry.normalizedName);
    if (!normalizedName) return;
    const matches = (currentState.catalogs[type] || []).filter((catalog) => catalog.normalizedName === normalizedName);
    const resolvedId = Number(entry.resolvedId);
    const match = matches.find((catalog) => catalog.id === resolvedId) || matches[0] || null;
    if (!match) {
      reasons.push(PREFLIGHT_REASON_CODES.REQUIRED_CATALOG_MISSING);
      return;
    }
    if (!match.active || match.deleted) {
      reasons.push(PREFLIGHT_REASON_CODES.REQUIRED_CATALOG_INACTIVE);
    }
  });
  return reasons;
}

function warehouseReasons(planRow, currentState) {
  if (planRow.stockAction !== STOCK_ACTIONS.APPLY_OPENING_STOCK) return [];
  const warehouse = currentState.defaultWarehouse;
  if (!warehouse) return [PREFLIGHT_REASON_CODES.WAREHOUSE_MISSING];
  if (!warehouse.active) return [PREFLIGHT_REASON_CODES.WAREHOUSE_INACTIVE];
  return [];
}

function productReasons(planRow, currentState, permissionContext) {
  if (!planRow.planningEligible) return [PREFLIGHT_REASON_CODES.SOURCE_PLAN_NOT_EXECUTABLE];
  if (planRow.productAction === PRODUCT_ACTIONS.CREATE_PRODUCT) {
    const reasons = [];
    const skuMatches = matchingProducts(currentState.products, 'normalizedSku', planRow.normalizedSource?.sku);
    const barcodeMatches = matchingProducts(currentState.products, 'normalizedBarcode', planRow.normalizedSource?.barcode);
    if (skuMatches.length) reasons.push(PREFLIGHT_REASON_CODES.SKU_NOW_EXISTS);
    if (barcodeMatches.length) reasons.push(PREFLIGHT_REASON_CODES.BARCODE_NOW_EXISTS);
    if (permissionContext.canCreateProduct !== true) {
      reasons.push(PREFLIGHT_REASON_CODES.CURRENT_PRODUCT_CREATE_PERMISSION_REQUIRED);
    }
    reasons.push(...catalogReasons(planRow, currentState));
    return reasons;
  }
  if (planRow.productAction === PRODUCT_ACTIONS.USE_EXISTING_PRODUCT) {
    const product = findMatchedProduct(currentState.products, planRow);
    if (!product) return [PREFLIGHT_REASON_CODES.MATCHED_PRODUCT_MISSING];
    if (!product.active || product.deleted) return [PREFLIGHT_REASON_CODES.MATCHED_PRODUCT_INACTIVE];
    const expectedSku = normalizeMatchingIdentifier(planRow.matchedProduct?.sku);
    const expectedBarcode = normalizeMatchingIdentifier(planRow.matchedProduct?.barcode);
    if (
      (expectedSku && product.normalizedSku !== expectedSku) ||
      (expectedBarcode && product.normalizedBarcode !== expectedBarcode)
    ) {
      return [PREFLIGHT_REASON_CODES.MATCHED_PRODUCT_CHANGED];
    }
    return [];
  }
  return planRow.productAction === PRODUCT_ACTIONS.NO_PRODUCT_ACTION
    ? []
    : [PREFLIGHT_REASON_CODES.SOURCE_PLAN_NOT_EXECUTABLE];
}

function stockReasons(planRow, currentState, productBlocked) {
  if (planRow.stockAction === STOCK_ACTIONS.NO_STOCK_ACTION) return [];
  if (planRow.stockAction !== STOCK_ACTIONS.APPLY_OPENING_STOCK) {
    return [PREFLIGHT_REASON_CODES.SOURCE_PLAN_NOT_EXECUTABLE];
  }
  const reasons = [];
  if (productBlocked) reasons.push(PREFLIGHT_REASON_CODES.SOURCE_PLAN_NOT_EXECUTABLE);
  reasons.push(...warehouseReasons(planRow, currentState));
  const policy = findExecutionStockPolicy(planRow.productAction, planRow.stockAction);
  if (policy?.strategy === IMPORT_EXECUTION_STOCK_STRATEGIES.UNSUPPORTED) {
    reasons.push(policy.reasonCode || PREFLIGHT_REASON_CODES.SOURCE_PLAN_NOT_EXECUTABLE);
  } else if (planRow.productAction === PRODUCT_ACTIONS.USE_EXISTING_PRODUCT) {
    const productId = Number(planRow.matchedProduct?.productId);
    const target = currentState.inventoryTargets.find((item) => item.productId === productId);
    if (!target) reasons.push(PREFLIGHT_REASON_CODES.INVENTORY_TARGET_INVALID);
    const movement = currentState.movementSummaries.find((item) => item.productId === productId);
    if (!movement || movement.movementCount > 0 || target?.quantity !== '0') {
      reasons.push(PREFLIGHT_REASON_CODES.OPENING_STOCK_STATE_UNRESOLVED);
    }
  } else if (!policy || policy.strategy !== IMPORT_EXECUTION_STOCK_STRATEGIES.PRODUCT_INITIAL_STOCK) {
    reasons.push(PREFLIGHT_REASON_CODES.OPENING_STOCK_STATE_UNRESOLVED);
  }
  return reasons;
}

function executionContractEvidence(planRow) {
  const policy = findExecutionStockPolicy(planRow.productAction, planRow.stockAction);
  if (!policy) {
    return {
      contractVersion: IMPORT_EXECUTION_CONTRACT_VERSION,
      supported: false,
      strategy: IMPORT_EXECUTION_STOCK_STRATEGIES.UNSUPPORTED,
      reasonCode: PREFLIGHT_REASON_CODES.SOURCE_PLAN_NOT_EXECUTABLE,
    };
  }
  return {
    contractVersion: IMPORT_EXECUTION_CONTRACT_VERSION,
    supported: policy.strategy !== IMPORT_EXECUTION_STOCK_STRATEGIES.UNSUPPORTED,
    strategy: policy.strategy,
    movementType: policy.movementType || null,
    referenceType: policy.referenceType || null,
    reason: policy.reason || null,
    policyCode: policy.policyCode || policy.reasonCode || null,
    doubleApplicationAllowed: policy.doubleApplicationAllowed === true,
  };
}

function productCreationEvidence(planRow) {
  if (planRow.productAction !== PRODUCT_ACTIONS.CREATE_PRODUCT) return null;
  const source = planRow.normalizedSource || {};
  return {
    productName: requiredText(source.productName, 'normalizedSource.productName'),
    sku: requiredText(source.sku, 'normalizedSource.sku'),
    barcode: requiredText(source.barcode, 'normalizedSource.barcode'),
    category: optionalText(source.category),
    brand: optionalText(source.brand),
    unit: optionalText(source.unit),
    variant: optionalText(source.variant),
    costPrice: requiredText(source.costPrice, 'normalizedSource.costPrice'),
    sellingPrice: requiredText(source.sellingPrice, 'normalizedSource.sellingPrice'),
    wholesalePrice: optionalText(source.wholesalePrice || '0'),
    openingQuantity: optionalText(source.openingQuantity || '0'),
    minimumStock: optionalText(source.minimumStock || '0'),
    active: optionalBoolean(source.active),
    trackExpiry: optionalBoolean(source.trackExpiry),
    expiryRequired: optionalBoolean(source.expiryRequired),
    expiryAlertDays: source.expiryAlertDays === null || source.expiryAlertDays === undefined ? null : Number(source.expiryAlertDays),
    allowPriceChange: optionalBoolean(source.allowPriceChange),
  };
}

function matchedProductExecutionEvidence(planRow) {
  if (planRow.productAction !== PRODUCT_ACTIONS.USE_EXISTING_PRODUCT) return null;
  const product = planRow.matchedProduct || {};
  return {
    productId: positiveIdOrNull(product.productId, 'matchedProduct.productId'),
    sku: String(product.sku || ''),
    barcode: String(product.barcode || ''),
    productName: String(product.productName || ''),
    active: product.active === true,
    deleted: product.deleted === true,
    updatedAt: product.updatedAt || null,
  };
}

function warehouseExecutionEvidence(planRow, currentState) {
  const required = planRow.stockAction === STOCK_ACTIONS.APPLY_OPENING_STOCK;
  const warehouse = currentState.defaultWarehouse;
  return {
    required,
    warehouseId: warehouse ? positiveIdOrNull(warehouse.warehouseId, 'defaultWarehouse.warehouseId') : null,
    name: warehouse ? String(warehouse.name || '') : null,
    active: warehouse ? warehouse.active === true : null,
    updatedAt: warehouse ? warehouse.updatedAt || null : null,
  };
}

function openingStockExecutionEvidence(planRow) {
  const applicable = planRow.stockAction === STOCK_ACTIONS.APPLY_OPENING_STOCK;
  return {
    applicable,
    quantity: applicable ? positiveDecimal(planRow.normalizedSource?.openingQuantity, 'normalizedSource.openingQuantity') : '0',
    productAction: planRow.productAction,
    stockAction: planRow.stockAction,
  };
}

function createExecutionSourceEvidence(planRow, currentState, sourceContext = {}) {
  const sourceDigest = sourceContext.sourceDigest || null;
  if (sourceDigest !== null && !/^[0-9a-f]{64}$/i.test(String(sourceDigest))) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'Source digest is invalid.', 'sourceDigest');
  }
  return {
    kind: EXECUTION_SOURCE_EVIDENCE_KIND,
    schemaVersion: EXECUTION_SOURCE_EVIDENCE_VERSION,
    sourceRowNumber: nonNegativeRowNumber(planRow.sourceRowNumber, 'sourceRowNumber'),
    sourceDigest,
    sourceCommitPlanDigest: sourceContext.sourceCommitPlanDigest,
    productAction: planRow.productAction,
    stockAction: planRow.stockAction,
    productCreationEvidence: productCreationEvidence(planRow),
    existingProductEvidence: matchedProductExecutionEvidence(planRow),
    catalogEvidence: createCatalogExecutionEvidence(planRow),
    warehouseEvidence: warehouseExecutionEvidence(planRow, currentState),
    openingStockEvidence: openingStockExecutionEvidence(planRow),
    inventoryTargetEvidence: {
      inventoryTargetId: planRow.inventoryTargetEvidence?.inventoryTargetId || null,
      requiresRevalidation: true,
    },
    stockMovementEvidence: {
      movementCount: Number(planRow.stockMovementEvidence?.movementCount || 0),
      latestMovementAt: planRow.stockMovementEvidence?.latestMovementAt || null,
    },
  };
}

function createPreflightRow(planRow, currentState, permissionContext, sourceContext = {}) {
  const originalReasons = [...(planRow.blockReasonCodes || [])];
  const currentProductReasons = productReasons(planRow, currentState, permissionContext);
  const productBlocked = currentProductReasons.length > 0;
  const currentStockReasons = stockReasons(planRow, currentState, productBlocked);
  const currentReasons = [...new Set([...originalReasons, ...currentProductReasons, ...currentStockReasons])];
  const currentDisposition =
    planRow.disposition === ROW_DISPOSITIONS.SKIPPED
      ? PREFLIGHT_ROW_DISPOSITIONS.SKIPPED
      : currentReasons.length
        ? PREFLIGHT_ROW_DISPOSITIONS.BLOCKED
        : PREFLIGHT_ROW_DISPOSITIONS.CURRENTLY_ELIGIBLE;

  return {
    kind: 'inventory_import_execution_preflight_row',
    schemaVersion: 1,
    sourceRowNumber: planRow.sourceRowNumber,
    originalProductAction: planRow.productAction,
    originalStockAction: planRow.stockAction,
    originalDisposition: planRow.disposition,
    originalBlockReasonCodes: originalReasons,
    currentDisposition,
    currentlyEligible: currentDisposition === PREFLIGHT_ROW_DISPOSITIONS.CURRENTLY_ELIGIBLE,
    currentProductEligible: currentProductReasons.length === 0,
    currentStockEligible: currentStockReasons.length === 0,
    currentBlockReasonCodes: currentReasons,
    normalizedSource: planRow.normalizedSource,
    matchedProduct: planRow.matchedProduct || null,
    executionSourceEvidence: createExecutionSourceEvidence(planRow, currentState, sourceContext),
    currentEvidence: {
      matchedProduct: findMatchedProduct(currentState.products, planRow),
      skuMatches: matchingProducts(currentState.products, 'normalizedSku', planRow.normalizedSource?.sku),
      barcodeMatches: matchingProducts(currentState.products, 'normalizedBarcode', planRow.normalizedSource?.barcode),
      defaultWarehouse: currentState.defaultWarehouse,
      inventoryTargetEvidence: currentState.inventoryTargets.filter(
        (target) => target.productId === Number(planRow.matchedProduct?.productId)
      ),
      stockMovementEvidence: currentState.movementSummaries.filter(
        (summary) => summary.productId === Number(planRow.matchedProduct?.productId)
      ),
      permissionEvidence: {
        canAdjustInventory: permissionContext.canAdjustInventory === true,
        canCreateProduct: permissionContext.canCreateProduct === true,
      },
    },
    executionContractEvidence: executionContractEvidence(planRow),
  };
}

function validateCatalogExecutionEvidence(type, evidence) {
  const entry = requiredObject(evidence, `executionSourceEvidence.catalogEvidence.${type}`);
  rejectUnsupportedKeys(
    entry,
    new Set(['supplied', 'normalizedName', 'resolvedId', 'resolvedName', 'active', 'deleted', 'updatedAt']),
    `executionSourceEvidence.catalogEvidence.${type}`
  );
  if (typeof entry.supplied !== 'boolean') {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'Catalog evidence supplied flag is invalid.', `catalogEvidence.${type}.supplied`);
  }
  const normalizedName = normalizeCatalogName(entry.normalizedName);
  const resolvedId = positiveIdOrNull(entry.resolvedId, `catalogEvidence.${type}.resolvedId`);
  if (!entry.supplied && (normalizedName || resolvedId || entry.resolvedName !== null || entry.active !== null || entry.deleted !== null)) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'Omitted catalog evidence must remain explicitly empty.', `catalogEvidence.${type}`);
  }
  if (entry.supplied && !normalizedName) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'Supplied catalog evidence requires a normalized name.', `catalogEvidence.${type}`);
  }
}

function validateExecutionSourceEvidence(row) {
  const evidence = requiredObject(row.executionSourceEvidence, 'executionSourceEvidence');
  rejectUnsupportedKeys(
    evidence,
    new Set([
      'kind',
      'schemaVersion',
      'sourceRowNumber',
      'sourceDigest',
      'sourceCommitPlanDigest',
      'productAction',
      'stockAction',
      'productCreationEvidence',
      'existingProductEvidence',
      'catalogEvidence',
      'warehouseEvidence',
      'openingStockEvidence',
      'inventoryTargetEvidence',
      'stockMovementEvidence',
    ]),
    'executionSourceEvidence'
  );
  if (
    evidence.kind !== EXECUTION_SOURCE_EVIDENCE_KIND ||
    evidence.schemaVersion !== EXECUTION_SOURCE_EVIDENCE_VERSION ||
    evidence.sourceRowNumber !== row.sourceRowNumber ||
    evidence.productAction !== row.originalProductAction ||
    evidence.stockAction !== row.originalStockAction ||
    (evidence.sourceDigest !== null && !/^[0-9a-f]{64}$/i.test(String(evidence.sourceDigest || ''))) ||
    !/^[0-9a-f]{64}$/i.test(String(evidence.sourceCommitPlanDigest || ''))
  ) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'Execution source evidence is inconsistent.', 'executionSourceEvidence');
  }
  const catalogEvidence = requiredObject(evidence.catalogEvidence, 'executionSourceEvidence.catalogEvidence');
  rejectUnsupportedKeys(catalogEvidence, new Set(CATALOG_TYPES), 'executionSourceEvidence.catalogEvidence');
  CATALOG_TYPES.forEach((type) => validateCatalogExecutionEvidence(type, catalogEvidence[type]));
  if (row.originalProductAction === PRODUCT_ACTIONS.CREATE_PRODUCT) {
    const productEvidence = requiredObject(evidence.productCreationEvidence, 'executionSourceEvidence.productCreationEvidence');
    rejectUnsupportedKeys(
      productEvidence,
      new Set([
        'productName',
        'sku',
        'barcode',
        'category',
        'brand',
        'unit',
        'variant',
        'costPrice',
        'sellingPrice',
        'wholesalePrice',
        'openingQuantity',
        'minimumStock',
        'active',
        'trackExpiry',
        'expiryRequired',
        'expiryAlertDays',
        'allowPriceChange',
      ]),
      'executionSourceEvidence.productCreationEvidence'
    );
    requiredText(productEvidence.productName, 'executionSourceEvidence.productCreationEvidence.productName');
    requiredText(productEvidence.sku, 'executionSourceEvidence.productCreationEvidence.sku');
    requiredText(productEvidence.barcode, 'executionSourceEvidence.productCreationEvidence.barcode');
    requiredText(productEvidence.costPrice, 'executionSourceEvidence.productCreationEvidence.costPrice');
    requiredText(productEvidence.sellingPrice, 'executionSourceEvidence.productCreationEvidence.sellingPrice');
    if (!isDeepStrictEqual(productEvidence, productCreationEvidence({ ...row, productAction: PRODUCT_ACTIONS.CREATE_PRODUCT, normalizedSource: row.normalizedSource }))) {
      fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'Product creation evidence must match the certified source row.', 'executionSourceEvidence.productCreationEvidence');
    }
  } else if (evidence.productCreationEvidence !== null) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'Product creation evidence is only valid for CREATE_PRODUCT rows.', 'executionSourceEvidence.productCreationEvidence');
  }
  if (row.originalProductAction === PRODUCT_ACTIONS.USE_EXISTING_PRODUCT) {
    requiredObject(evidence.existingProductEvidence, 'executionSourceEvidence.existingProductEvidence');
  } else if (evidence.existingProductEvidence !== null) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'Existing product evidence is only valid for existing-product rows.', 'executionSourceEvidence.existingProductEvidence');
  }
  const warehouseEvidence = requiredObject(evidence.warehouseEvidence, 'executionSourceEvidence.warehouseEvidence');
  rejectUnsupportedKeys(warehouseEvidence, new Set(['required', 'warehouseId', 'name', 'active', 'updatedAt']), 'executionSourceEvidence.warehouseEvidence');
  if (warehouseEvidence.required !== (row.originalStockAction === STOCK_ACTIONS.APPLY_OPENING_STOCK)) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'Warehouse evidence requirement is inconsistent.', 'executionSourceEvidence.warehouseEvidence');
  }
  if (warehouseEvidence.warehouseId !== null) positiveIdOrNull(warehouseEvidence.warehouseId, 'executionSourceEvidence.warehouseEvidence.warehouseId');
  const stockEvidence = requiredObject(evidence.openingStockEvidence, 'executionSourceEvidence.openingStockEvidence');
  rejectUnsupportedKeys(stockEvidence, new Set(['applicable', 'quantity', 'productAction', 'stockAction']), 'executionSourceEvidence.openingStockEvidence');
  if (stockEvidence.applicable !== (row.originalStockAction === STOCK_ACTIONS.APPLY_OPENING_STOCK)) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'Opening stock evidence applicability is inconsistent.', 'executionSourceEvidence.openingStockEvidence');
  }
  if (stockEvidence.applicable) positiveDecimal(stockEvidence.quantity, 'executionSourceEvidence.openingStockEvidence.quantity');
}

function summarizePreflightRows(rows) {
  const summary = {
    totalRows: rows.length,
    currentlyEligibleRows: 0,
    blockedRows: 0,
    skippedRows: 0,
    createProductRows: 0,
    existingProductRows: 0,
    openingStockRows: 0,
    productBlockedRows: 0,
    stockBlockedRows: 0,
    permissionBlockedRows: 0,
    staleRows: 0,
  };
  rows.forEach((row) => {
    if (row.currentDisposition === PREFLIGHT_ROW_DISPOSITIONS.CURRENTLY_ELIGIBLE) summary.currentlyEligibleRows += 1;
    if (row.currentDisposition === PREFLIGHT_ROW_DISPOSITIONS.BLOCKED) summary.blockedRows += 1;
    if (row.currentDisposition === PREFLIGHT_ROW_DISPOSITIONS.SKIPPED) summary.skippedRows += 1;
    if (row.originalProductAction === PRODUCT_ACTIONS.CREATE_PRODUCT && row.currentlyEligible) summary.createProductRows += 1;
    if (row.originalProductAction === PRODUCT_ACTIONS.USE_EXISTING_PRODUCT && row.currentlyEligible) summary.existingProductRows += 1;
    if (row.originalStockAction === STOCK_ACTIONS.APPLY_OPENING_STOCK && row.currentStockEligible && row.currentlyEligible) {
      summary.openingStockRows += 1;
    }
    if (!row.currentProductEligible) summary.productBlockedRows += 1;
    if (!row.currentStockEligible) summary.stockBlockedRows += 1;
    if (
      row.currentBlockReasonCodes.includes(PREFLIGHT_REASON_CODES.CURRENT_INVENTORY_PERMISSION_REQUIRED) ||
      row.currentBlockReasonCodes.includes(PREFLIGHT_REASON_CODES.CURRENT_PRODUCT_CREATE_PERMISSION_REQUIRED)
    ) {
      summary.permissionBlockedRows += 1;
    }
    if (row.currentBlockReasonCodes.some((reason) => reason !== PREFLIGHT_REASON_CODES.SOURCE_PLAN_NOT_EXECUTABLE)) {
      summary.staleRows += 1;
    }
  });
  return summary;
}

function preflightCommitReady(rows, summary) {
  if (!rows.length) return false;
  return summary.blockedRows === 0 && rows.every((row) => row.currentlyEligible === true);
}

function createInventoryImportExecutionPreflightDocument(input = {}) {
  assertPlainData(input, 'executionPreflightInput');
  const allowedKeys = new Set([
    'commitPlan',
    'commitPlanSessionId',
    'currentState',
    'permissionContext',
    'preflightId',
    'createdAt',
  ]);
  Object.keys(input || {}).forEach((key) => {
    if (!allowedKeys.has(key)) {
      fail(PREFLIGHT_ERROR_CODES.INVALID_INPUT, 'Execution preflight input contains unsupported fields.', key);
    }
  });
  const commitPlan = validateInventoryImportCommitPlanDocument(input.commitPlan);
  const commitPlanSessionId = String(input.commitPlanSessionId || '').trim();
  if (!/^inventory-import-commit-plan-[0-9a-f-]{36}$/i.test(commitPlanSessionId)) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_INPUT, 'A Phase 5F commit plan session id is required.', 'commitPlanSessionId');
  }
  const permissionContext = {
    canAdjustInventory: input.permissionContext?.canAdjustInventory === true,
    canCreateProduct: input.permissionContext?.canCreateProduct === true,
  };
  const currentState = normalizeCurrentState(input.currentState || {});
  const sourceContext = {
    sourceDigest: commitPlan.sourceDigest || null,
    sourceCommitPlanDigest: commitPlan.planDigest,
  };
  const rows = commitPlan.planRows.map((row) => createPreflightRow(row, currentState, permissionContext, sourceContext));
  const summary = summarizePreflightRows(rows);
  const executionContract = createInventoryImportExecutionContract();
  const commitReady = preflightCommitReady(rows, summary);
  const createdAt = timestamp(input.createdAt || new Date().toISOString(), 'createdAt');
  const preflightId = String(input.preflightId || `inventory-import-execution-preflight-document-${randomUUID()}`).trim();
  if (!/^inventory-import-execution-preflight-document-[0-9a-f-]{36}$/i.test(preflightId)) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_INPUT, 'Execution preflight document id is invalid.', 'preflightId');
  }
  const digestContent = {
    kind: EXECUTION_PREFLIGHT_DOCUMENT_KIND,
    version: EXECUTION_PREFLIGHT_DOCUMENT_VERSION,
    schemaVersion: 1,
    databaseWrite: false,
    rendererAuthoritative: false,
    commitReady,
    requiresTransaction: true,
    requiresExecutionConfirmation: true,
    requiresReplayProtection: true,
    requiresAuditPersistence: true,
    executionContractVersion: executionContract.version,
    executionContractDigest: executionContract.contractDigest,
    sourceCommitPlanSessionId: commitPlanSessionId,
    sourceCommitPlanDigest: commitPlan.planDigest,
    rows,
    summary,
  };
  const preflightDigest = digestPreflightContent(digestContent);
  return deepFreezePlainData({
    ...digestContent,
    immutable: true,
    preflightId,
    createdAt,
    preflightDigest,
  });
}

function validateInventoryImportExecutionPreflightDocument(document) {
  const executionContract = createInventoryImportExecutionContract();
  if (
    !document ||
    document.kind !== EXECUTION_PREFLIGHT_DOCUMENT_KIND ||
    document.version !== EXECUTION_PREFLIGHT_DOCUMENT_VERSION ||
    document.schemaVersion !== 1 ||
    document.immutable !== true ||
    !Object.isFrozen(document) ||
    document.databaseWrite !== false ||
    document.rendererAuthoritative !== false ||
    typeof document.commitReady !== 'boolean' ||
    document.requiresTransaction !== true ||
    document.requiresExecutionConfirmation !== true ||
    document.requiresReplayProtection !== true ||
    document.requiresAuditPersistence !== true ||
    !Array.isArray(document.rows) ||
    !document.summary ||
    document.executionContractVersion !== IMPORT_EXECUTION_CONTRACT_VERSION ||
    document.executionContractDigest !== executionContract.contractDigest ||
    !/^[0-9a-f]{64}$/i.test(String(document.preflightDigest || ''))
  ) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'An immutable inventory import execution preflight document is required.', 'executionPreflight');
  }
  assertPlainData(document, 'executionPreflight');
  document.rows.forEach((row) => validateExecutionSourceEvidence(row));
  const expectedSummary = summarizePreflightRows(document.rows);
  const digestContent = {
    kind: document.kind,
    version: document.version,
    schemaVersion: document.schemaVersion,
    databaseWrite: document.databaseWrite,
    rendererAuthoritative: document.rendererAuthoritative,
    commitReady: document.commitReady,
    requiresTransaction: document.requiresTransaction,
    requiresExecutionConfirmation: document.requiresExecutionConfirmation,
    requiresReplayProtection: document.requiresReplayProtection,
    requiresAuditPersistence: document.requiresAuditPersistence,
    executionContractVersion: document.executionContractVersion,
    executionContractDigest: document.executionContractDigest,
    sourceCommitPlanSessionId: document.sourceCommitPlanSessionId,
    sourceCommitPlanDigest: document.sourceCommitPlanDigest,
    rows: document.rows,
    summary: document.summary,
  };
  if (
    !isDeepStrictEqual(expectedSummary, document.summary) ||
    preflightCommitReady(document.rows, document.summary) !== document.commitReady ||
    digestPreflightContent(digestContent) !== document.preflightDigest
  ) {
    fail(PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT, 'Inventory import execution preflight failed deterministic validation.', 'executionPreflight');
  }
  return document;
}

module.exports = {
  EXECUTION_PREFLIGHT_DOCUMENT_KIND,
  EXECUTION_PREFLIGHT_DOCUMENT_VERSION,
  PREFLIGHT_ERROR_CODES,
  PREFLIGHT_REASON_CODES,
  PREFLIGHT_ROW_DISPOSITIONS,
  InventoryImportExecutionPreflightError,
  createInventoryImportExecutionPreflightDocument,
  digestPreflightContent,
  validateInventoryImportExecutionPreflightDocument,
};
