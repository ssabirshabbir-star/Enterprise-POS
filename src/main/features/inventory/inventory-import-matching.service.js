const { ROW_STATUSES } = require('./inventory-import.validation');
const {
  CATALOG_TYPE_KEYS,
  normalizeCatalogName,
  normalizeMatchingIdentifier,
} = require('./inventory-import-matching.contract');
const { canAdjustInventory } = require('./inventory.permissions');
const { canWriteProducts } = require('../products/product.permissions');

const MATCHING_ROW_STATUSES = Object.freeze({
  PRIMITIVE_INVALID: 'PRIMITIVE_INVALID',
  DUPLICATE_INPUT: 'DUPLICATE_INPUT',
  EXISTING_PRODUCT_CANDIDATE: 'EXISTING_PRODUCT_CANDIDATE',
  POTENTIAL_NEW_PRODUCT: 'POTENTIAL_NEW_PRODUCT',
  IDENTIFIER_CONFLICT: 'IDENTIFIER_CONFLICT',
  DUPLICATE_IN_DATABASE: 'DUPLICATE_IN_DATABASE',
  INACTIVE_PRODUCT_MATCH: 'INACTIVE_PRODUCT_MATCH',
  DELETED_PRODUCT_MATCH: 'DELETED_PRODUCT_MATCH',
  MISSING_CATALOG_REFERENCE: 'MISSING_CATALOG_REFERENCE',
  INACTIVE_CATALOG_REFERENCE: 'INACTIVE_CATALOG_REFERENCE',
  DUPLICATE_CATALOG_REFERENCE: 'DUPLICATE_CATALOG_REFERENCE',
  METADATA_MISMATCH: 'METADATA_MISMATCH',
  INVENTORY_TARGET_MISSING: 'INVENTORY_TARGET_MISSING',
  DUPLICATE_INVENTORY_TARGET: 'DUPLICATE_INVENTORY_TARGET',
  DUPLICATE_PRODUCT_TARGET: 'DUPLICATE_PRODUCT_TARGET',
  PERMISSION_RESTRICTED: 'PERMISSION_RESTRICTED',
  OPENING_STOCK_NOT_ALLOWED: 'OPENING_STOCK_NOT_ALLOWED',
  MATCHING_FAILED: 'MATCHING_FAILED',
  MATCHING_ELIGIBLE: 'MATCHING_ELIGIBLE',
});

const MATCHING_FINDING_CODES = Object.freeze({
  PRIMITIVE_INVALID: 'PRIMITIVE_INVALID',
  DUPLICATE_INPUT: 'DUPLICATE_INPUT',
  IDENTIFIER_CONFLICT: 'IDENTIFIER_CONFLICT',
  DUPLICATE_IN_DATABASE: 'DUPLICATE_IN_DATABASE',
  INACTIVE_PRODUCT_MATCH: 'INACTIVE_PRODUCT_MATCH',
  DELETED_PRODUCT_MATCH: 'DELETED_PRODUCT_MATCH',
  MISSING_CATALOG_REFERENCE: 'MISSING_CATALOG_REFERENCE',
  INACTIVE_CATALOG_REFERENCE: 'INACTIVE_CATALOG_REFERENCE',
  DUPLICATE_CATALOG_REFERENCE: 'DUPLICATE_CATALOG_REFERENCE',
  METADATA_MISMATCH: 'METADATA_MISMATCH',
  INVENTORY_TARGET_MISSING: 'INVENTORY_TARGET_MISSING',
  DUPLICATE_INVENTORY_TARGET: 'DUPLICATE_INVENTORY_TARGET',
  DUPLICATE_PRODUCT_TARGET: 'DUPLICATE_PRODUCT_TARGET',
  EXISTING_STOCK_PRESENT: 'EXISTING_STOCK_PRESENT',
  PRIOR_STOCK_MOVEMENT_EXISTS: 'PRIOR_STOCK_MOVEMENT_EXISTS',
  PERMISSION_RESTRICTED: 'PERMISSION_RESTRICTED',
  MATCHING_READ_FAILED: 'MATCHING_READ_FAILED',
  DEFAULT_WAREHOUSE_MISSING: 'DEFAULT_WAREHOUSE_MISSING',
});

const FINDING_SEVERITIES = Object.freeze({
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  INFO: 'INFO',
});

const MATCHED_BY = Object.freeze({
  NONE: 'NONE',
  SKU: 'SKU',
  BARCODE: 'BARCODE',
  SKU_AND_BARCODE: 'SKU_AND_BARCODE',
  CONFLICT: 'CONFLICT',
  DUPLICATE_DATABASE_IDENTIFIER: 'DUPLICATE_DATABASE_IDENTIFIER',
});

function assertPlainData(value, field = 'input') {
  const seen = new Set();
  function visit(item, key) {
    if (item === null || item === undefined) return;
    if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
      throw new TypeError(`${key} must be plain non-executable data.`);
    }
    if (typeof item !== 'object') return;
    if (seen.has(item)) return;
    if (Object.getPrototypeOf(item) !== Object.prototype && !Array.isArray(item)) {
      throw new TypeError(`${key} must be plain data.`);
    }
    seen.add(item);
    Object.entries(item).forEach(([childKey, child]) => visit(child, childKey));
    seen.delete(item);
  }
  visit(value, field);
}

function deepFreeze(value) {
  const seen = new Set();
  function visit(item) {
    if (item === null || item === undefined || typeof item !== 'object') return item;
    if (seen.has(item)) return item;
    seen.add(item);
    Object.values(item).forEach(visit);
    Object.freeze(item);
    seen.delete(item);
    return item;
  }
  return visit(value);
}

function clonePlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function safeScalar(value, maxLength = 160) {
  if (value === null || value === undefined || ['string', 'number', 'boolean'].includes(typeof value)) {
    return typeof value === 'string' ? value.slice(0, maxLength) : value;
  }
  return null;
}

function isZeroDecimal(value) {
  return !/[1-9]/.test(String(value || '0').replace('.', ''));
}

function isPositiveDecimal(value) {
  return /[1-9]/.test(String(value || '0').replace('.', ''));
}

function normalizeBoolean(value) {
  return value === true ? 'true' : value === false ? 'false' : null;
}

function createFinding({
  code,
  sourceRowNumber,
  field = null,
  severity = FINDING_SEVERITIES.ERROR,
  source = 'phase5b',
  relatedIdentifier = null,
  conflictGroupId = null,
  metadata = {},
}) {
  const safeMetadata = {};
  Object.entries(metadata || {}).forEach(([key, value]) => {
    const scalar = safeScalar(value);
    if (scalar !== null && scalar !== undefined) safeMetadata[key] = scalar;
  });
  return {
    code,
    field,
    sourceRowNumber,
    severity,
    source,
    relatedIdentifier,
    conflictGroupId,
    metadata: safeMetadata,
  };
}

function productEvidence(product) {
  if (!product) return null;
  return {
    productId: product.productId,
    sku: product.sku,
    barcode: product.barcode,
    productName: product.productName,
    active: product.active,
    deleted: product.deleted,
    updatedAt: product.updatedAt,
  };
}

function indexProducts(products = []) {
  const bySku = new Map();
  const byBarcode = new Map();
  products.forEach((product) => {
    if (product.normalizedSku) {
      if (!bySku.has(product.normalizedSku)) bySku.set(product.normalizedSku, []);
      bySku.get(product.normalizedSku).push(product);
    }
    if (product.normalizedBarcode) {
      if (!byBarcode.has(product.normalizedBarcode)) byBarcode.set(product.normalizedBarcode, []);
      byBarcode.get(product.normalizedBarcode).push(product);
    }
  });
  return { bySku, byBarcode };
}

function indexCatalogs(catalogs = {}) {
  const output = {};
  CATALOG_TYPE_KEYS.forEach((type) => {
    output[type] = new Map();
    (catalogs[type] || []).forEach((match) => {
      if (!output[type].has(match.normalizedName)) output[type].set(match.normalizedName, []);
      output[type].get(match.normalizedName).push(match);
    });
  });
  return output;
}

function indexByProductId(items = []) {
  const output = new Map();
  items.forEach((item) => {
    if (!output.has(item.productId)) output.set(item.productId, []);
    output.get(item.productId).push(item);
  });
  return output;
}

function normalizePermissionContext(input = {}) {
  const role = String(input.profile?.role || input.actor?.role || input.role || '').trim();
  return {
    role,
    canAdjustInventory: canAdjustInventory(role),
    canCreateProduct: canWriteProducts(role),
  };
}

function readResultFailed(result) {
  return result && result.ok === false;
}

function failureReason(result) {
  return String(result?.code || result?.reason || 'MATCHING_READ_FAILED').slice(0, 80);
}

function resolveCatalog(type, name, catalogIndex, sourceRowNumber) {
  const normalizedName = normalizeCatalogName(name);
  if (!normalizedName) {
    return { supplied: false, normalizedName: '', matches: [], findings: [] };
  }
  const matches = catalogIndex[type]?.get(normalizedName) || [];
  const activeMatches = matches.filter((match) => match.active && !match.deleted);
  const findings = [];
  if (!matches.length) {
    findings.push(
      createFinding({
        code: MATCHING_FINDING_CODES.MISSING_CATALOG_REFERENCE,
        field: type,
        sourceRowNumber,
        metadata: { value: name },
      })
    );
  } else if (activeMatches.length > 1 || matches.length > 1) {
    findings.push(
      createFinding({
        code: MATCHING_FINDING_CODES.DUPLICATE_CATALOG_REFERENCE,
        field: type,
        sourceRowNumber,
        metadata: { value: name, matchCount: matches.length },
      })
    );
  } else if (!activeMatches.length) {
    findings.push(
      createFinding({
        code: MATCHING_FINDING_CODES.INACTIVE_CATALOG_REFERENCE,
        field: type,
        sourceRowNumber,
        metadata: { value: name },
      })
    );
  }
  return {
    supplied: true,
    normalizedName,
    matches: matches.map((match) => ({
      id: match.id,
      name: match.name,
      active: match.active,
      deleted: match.deleted,
      updatedAt: match.updatedAt,
    })),
    resolvedId: activeMatches.length === 1 && matches.length === 1 ? activeMatches[0].id : null,
    findings,
  };
}

function compareField(row, product, field, productField, findings) {
  const sourceValue = row.normalized?.[field];
  if (sourceValue === null || sourceValue === undefined || sourceValue === '') return;
  const expected = String(sourceValue).trim();
  const actual = product?.[productField] === null || product?.[productField] === undefined ? '' : String(product[productField]).trim();
  if (normalizeCatalogName(expected) === normalizeCatalogName(actual)) return;
  findings.push(
    createFinding({
      code: MATCHING_FINDING_CODES.METADATA_MISMATCH,
      field,
      sourceRowNumber: row.sourceRowNumber,
      severity: FINDING_SEVERITIES.WARNING,
      metadata: { expected, actual },
    })
  );
}

function compareBooleanField(row, product, field, productField, findings) {
  if (row.normalized?.[field] === null || row.normalized?.[field] === undefined) return;
  if (product?.[productField] === undefined) return;
  if (row.normalized[field] === product[productField]) return;
  findings.push(
    createFinding({
      code: MATCHING_FINDING_CODES.METADATA_MISMATCH,
      field,
      sourceRowNumber: row.sourceRowNumber,
      severity: FINDING_SEVERITIES.WARNING,
      metadata: {
        expected: normalizeBoolean(row.normalized[field]),
        actual: normalizeBoolean(product[productField]),
      },
    })
  );
}

function compareExistingMetadata(row, product, findings) {
  compareField(row, product, 'productName', 'productName', findings);
  compareField(row, product, 'category', 'category', findings);
  compareField(row, product, 'brand', 'brand', findings);
  compareField(row, product, 'unit', 'unit', findings);
  compareField(row, product, 'variant', 'variant', findings);
  compareField(row, product, 'costPrice', 'costPrice', findings);
  compareField(row, product, 'sellingPrice', 'sellingPrice', findings);
  compareField(row, product, 'wholesalePrice', 'wholesalePrice', findings);
  compareBooleanField(row, product, 'active', 'active', findings);
  compareBooleanField(row, product, 'trackExpiry', 'trackExpiry', findings);
  compareBooleanField(row, product, 'expiryRequired', 'expiryRequired', findings);
  compareField(row, product, 'expiryAlertDays', 'expiryAlertDays', findings);
  compareBooleanField(row, product, 'allowPriceChange', 'allowPriceChange', findings);
}

function chooseStatus(baseStatus, findings, eligible) {
  const blocking = findings.filter((finding) => finding.severity === FINDING_SEVERITIES.ERROR);
  if (!blocking.length && eligible) return MATCHING_ROW_STATUSES.MATCHING_ELIGIBLE;
  const precedence = [
    MATCHING_FINDING_CODES.MATCHING_READ_FAILED,
    MATCHING_FINDING_CODES.PRIMITIVE_INVALID,
    MATCHING_FINDING_CODES.DUPLICATE_INPUT,
    MATCHING_FINDING_CODES.IDENTIFIER_CONFLICT,
    MATCHING_FINDING_CODES.DUPLICATE_IN_DATABASE,
    MATCHING_FINDING_CODES.INACTIVE_PRODUCT_MATCH,
    MATCHING_FINDING_CODES.DELETED_PRODUCT_MATCH,
    MATCHING_FINDING_CODES.MISSING_CATALOG_REFERENCE,
    MATCHING_FINDING_CODES.INACTIVE_CATALOG_REFERENCE,
    MATCHING_FINDING_CODES.DUPLICATE_CATALOG_REFERENCE,
    MATCHING_FINDING_CODES.INVENTORY_TARGET_MISSING,
    MATCHING_FINDING_CODES.DUPLICATE_INVENTORY_TARGET,
    MATCHING_FINDING_CODES.DUPLICATE_PRODUCT_TARGET,
    MATCHING_FINDING_CODES.PERMISSION_RESTRICTED,
    MATCHING_FINDING_CODES.EXISTING_STOCK_PRESENT,
    MATCHING_FINDING_CODES.PRIOR_STOCK_MOVEMENT_EXISTS,
    MATCHING_FINDING_CODES.DEFAULT_WAREHOUSE_MISSING,
  ];
  const first = precedence.find((code) => blocking.some((finding) => finding.code === code));
  const codeToStatus = {
    [MATCHING_FINDING_CODES.MATCHING_READ_FAILED]: MATCHING_ROW_STATUSES.MATCHING_FAILED,
    [MATCHING_FINDING_CODES.PRIMITIVE_INVALID]: MATCHING_ROW_STATUSES.PRIMITIVE_INVALID,
    [MATCHING_FINDING_CODES.DUPLICATE_INPUT]: MATCHING_ROW_STATUSES.DUPLICATE_INPUT,
    [MATCHING_FINDING_CODES.IDENTIFIER_CONFLICT]: MATCHING_ROW_STATUSES.IDENTIFIER_CONFLICT,
    [MATCHING_FINDING_CODES.DUPLICATE_IN_DATABASE]: MATCHING_ROW_STATUSES.DUPLICATE_IN_DATABASE,
    [MATCHING_FINDING_CODES.INACTIVE_PRODUCT_MATCH]: MATCHING_ROW_STATUSES.INACTIVE_PRODUCT_MATCH,
    [MATCHING_FINDING_CODES.DELETED_PRODUCT_MATCH]: MATCHING_ROW_STATUSES.DELETED_PRODUCT_MATCH,
    [MATCHING_FINDING_CODES.MISSING_CATALOG_REFERENCE]: MATCHING_ROW_STATUSES.MISSING_CATALOG_REFERENCE,
    [MATCHING_FINDING_CODES.INACTIVE_CATALOG_REFERENCE]: MATCHING_ROW_STATUSES.INACTIVE_CATALOG_REFERENCE,
    [MATCHING_FINDING_CODES.DUPLICATE_CATALOG_REFERENCE]: MATCHING_ROW_STATUSES.DUPLICATE_CATALOG_REFERENCE,
    [MATCHING_FINDING_CODES.INVENTORY_TARGET_MISSING]: MATCHING_ROW_STATUSES.INVENTORY_TARGET_MISSING,
    [MATCHING_FINDING_CODES.DUPLICATE_INVENTORY_TARGET]: MATCHING_ROW_STATUSES.DUPLICATE_IN_DATABASE,
    [MATCHING_FINDING_CODES.DUPLICATE_PRODUCT_TARGET]: MATCHING_ROW_STATUSES.DUPLICATE_PRODUCT_TARGET,
    [MATCHING_FINDING_CODES.PERMISSION_RESTRICTED]: MATCHING_ROW_STATUSES.PERMISSION_RESTRICTED,
    [MATCHING_FINDING_CODES.EXISTING_STOCK_PRESENT]: MATCHING_ROW_STATUSES.OPENING_STOCK_NOT_ALLOWED,
    [MATCHING_FINDING_CODES.PRIOR_STOCK_MOVEMENT_EXISTS]: MATCHING_ROW_STATUSES.OPENING_STOCK_NOT_ALLOWED,
    [MATCHING_FINDING_CODES.DEFAULT_WAREHOUSE_MISSING]: MATCHING_ROW_STATUSES.MATCHING_FAILED,
  };
  return codeToStatus[first] || baseStatus || MATCHING_ROW_STATUSES.MATCHING_FAILED;
}

function rowHasPhase3Blocking(row) {
  return row.status === ROW_STATUSES.STRUCTURALLY_INVALID || row.status === ROW_STATUSES.DUPLICATE_IN_FILE;
}

function analyzeInventoryImportMatches(input = {}) {
  assertPlainData(input, 'matchingAnalysis');
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const permission = normalizePermissionContext(input.permissions || input.permissionContext || input);
  const productsResult = input.productsResult || { ok: true, products: input.products || [] };
  const catalogsResult = input.catalogsResult || { ok: true, catalogs: input.catalogs || {} };
  const warehouseResult = input.warehouseResult || { ok: true, warehouse: input.defaultWarehouse || null };
  const inventoryTargetsResult = input.inventoryTargetsResult || {
    ok: true,
    inventoryTargets: input.inventoryTargets || [],
  };
  const movementSummariesResult = input.movementSummariesResult || {
    ok: true,
    movementSummaries: input.movementSummaries || [],
  };
  const products = productsResult.products || [];
  const productIndex = indexProducts(products);
  const catalogIndex = indexCatalogs(catalogsResult.catalogs || {});
  const inventoryByProduct = indexByProductId(inventoryTargetsResult.inventoryTargets || []);
  const movementsByProduct = new Map(
    (movementSummariesResult.movementSummaries || []).map((summary) => [summary.productId, summary])
  );
  const globalFailures = [
    ['products', productsResult],
    ['catalogs', catalogsResult],
    ['warehouse', warehouseResult],
    ['inventoryTargets', inventoryTargetsResult],
    ['stockMovements', movementSummariesResult],
  ].filter(([, result]) => readResultFailed(result));
  const warehouseMissing = !readResultFailed(warehouseResult) && !warehouseResult.warehouse;

  const rowResults = rows.map((row) => {
    const rowCopy = clonePlain(row);
    const normalized = row.normalized || {};
    const sourceRowNumber = row.sourceRowNumber;
    const normalizedSku = normalizeMatchingIdentifier(normalized.sku);
    const normalizedBarcode = normalizeMatchingIdentifier(normalized.barcode);
    const skuMatches = normalizedSku ? productIndex.bySku.get(normalizedSku) || [] : [];
    const barcodeMatches = normalizedBarcode ? productIndex.byBarcode.get(normalizedBarcode) || [] : [];
    const findings = [];
    const catalogResolution = {};
    let matchedProduct = null;
    let matchedBy = MATCHED_BY.NONE;
    let baseStatus = MATCHING_ROW_STATUSES.POTENTIAL_NEW_PRODUCT;

    if (row.status === ROW_STATUSES.EMPTY_ROW) {
      return {
        sourceRowNumber,
        phase3Row: rowCopy,
        classification: ROW_STATUSES.EMPTY_ROW,
        status: ROW_STATUSES.EMPTY_ROW,
        eligible: false,
        matchedBy,
        matchedProduct: null,
        evidence: {
          normalizedSku,
          normalizedBarcode,
          skuMatchProductIds: [],
          barcodeMatchProductIds: [],
          catalogResolution,
          canAdjustInventory: permission.canAdjustInventory,
          canCreateProduct: permission.canCreateProduct,
        },
        matchingFindings: findings,
      };
    }

    if (globalFailures.length) {
      globalFailures.forEach(([source, result]) => {
        findings.push(
          createFinding({
            code: MATCHING_FINDING_CODES.MATCHING_READ_FAILED,
            sourceRowNumber,
            source,
            metadata: { reason: failureReason(result) },
          })
        );
      });
    }

    if (row.status === ROW_STATUSES.STRUCTURALLY_INVALID) {
      findings.push(
        createFinding({
          code: MATCHING_FINDING_CODES.PRIMITIVE_INVALID,
          sourceRowNumber,
          source: 'phase3',
          metadata: { errorCount: (row.errors || []).length },
        })
      );
    }
    if (row.status === ROW_STATUSES.DUPLICATE_IN_FILE) {
      findings.push(
        createFinding({
          code: MATCHING_FINDING_CODES.DUPLICATE_INPUT,
          sourceRowNumber,
          source: 'phase3',
          metadata: { errorCount: (row.errors || []).length },
        })
      );
    }

    if (!rowHasPhase3Blocking(row) && !globalFailures.length) {
      if (skuMatches.length > 1 || barcodeMatches.length > 1) {
        matchedBy = MATCHED_BY.DUPLICATE_DATABASE_IDENTIFIER;
        findings.push(
          createFinding({
            code: MATCHING_FINDING_CODES.DUPLICATE_IN_DATABASE,
            sourceRowNumber,
            relatedIdentifier: skuMatches.length > 1 ? normalizedSku : normalizedBarcode,
            conflictGroupId: `duplicate-database-identifier-${sourceRowNumber}`,
            metadata: {
              skuMatchCount: skuMatches.length,
              barcodeMatchCount: barcodeMatches.length,
            },
          })
        );
      } else if (
        skuMatches.length === 1 &&
        barcodeMatches.length === 1 &&
        skuMatches[0].productId !== barcodeMatches[0].productId
      ) {
        matchedBy = MATCHED_BY.CONFLICT;
        findings.push(
          createFinding({
            code: MATCHING_FINDING_CODES.IDENTIFIER_CONFLICT,
            sourceRowNumber,
            conflictGroupId: `identifier-conflict-${sourceRowNumber}-${[
              skuMatches[0].productId,
              barcodeMatches[0].productId,
            ]
              .sort((a, b) => a - b)
              .join('-')}`,
            metadata: {
              skuProductId: skuMatches[0].productId,
              barcodeProductId: barcodeMatches[0].productId,
            },
          })
        );
      } else {
        matchedProduct = skuMatches[0] || barcodeMatches[0] || null;
        if (skuMatches[0] && barcodeMatches[0]) matchedBy = MATCHED_BY.SKU_AND_BARCODE;
        else if (skuMatches[0]) matchedBy = MATCHED_BY.SKU;
        else if (barcodeMatches[0]) matchedBy = MATCHED_BY.BARCODE;
      }

      if (matchedProduct) {
        baseStatus = MATCHING_ROW_STATUSES.EXISTING_PRODUCT_CANDIDATE;
        if (matchedProduct.deleted) {
          matchedProduct = null;
          findings.push(
            createFinding({
              code: MATCHING_FINDING_CODES.DELETED_PRODUCT_MATCH,
              sourceRowNumber,
              metadata: { productId: skuMatches[0]?.productId || barcodeMatches[0]?.productId },
            })
          );
        } else if (!matchedProduct.active) {
          findings.push(
            createFinding({
              code: MATCHING_FINDING_CODES.INACTIVE_PRODUCT_MATCH,
              sourceRowNumber,
              metadata: { productId: matchedProduct.productId },
            })
          );
        } else {
          compareExistingMetadata(row, matchedProduct, findings);
        }
      } else if (matchedBy === MATCHED_BY.NONE) {
        baseStatus = MATCHING_ROW_STATUSES.POTENTIAL_NEW_PRODUCT;
      }

      CATALOG_TYPE_KEYS.forEach((type) => {
        catalogResolution[type] = resolveCatalog(
          type,
          normalized[type],
          catalogIndex,
          sourceRowNumber
        );
      });

      const catalogFindings = CATALOG_TYPE_KEYS.flatMap((type) => catalogResolution[type].findings);
      if (matchedProduct) {
        catalogFindings
          .filter((finding) => finding.code !== MATCHING_FINDING_CODES.MISSING_CATALOG_REFERENCE)
          .forEach((finding) => findings.push(finding));
      } else if (matchedBy === MATCHED_BY.NONE) {
        catalogFindings.forEach((finding) => findings.push(finding));
        if (!permission.canCreateProduct) {
          findings.push(
            createFinding({
              code: MATCHING_FINDING_CODES.PERMISSION_RESTRICTED,
              sourceRowNumber,
              field: 'products.create',
              metadata: { canCreateProduct: permission.canCreateProduct },
            })
          );
        }
      }

      if (warehouseMissing && isPositiveDecimal(normalized.openingQuantity)) {
        findings.push(
          createFinding({
            code: MATCHING_FINDING_CODES.DEFAULT_WAREHOUSE_MISSING,
            sourceRowNumber,
            source: 'warehouse',
          })
        );
      }

      if (matchedProduct) {
        const targets = inventoryByProduct.get(matchedProduct.productId) || [];
        const movement = movementsByProduct.get(matchedProduct.productId) || {
          productId: matchedProduct.productId,
          movementCount: 0,
          latestMovementAt: null,
        };
        if (targets.length === 0) {
          findings.push(
            createFinding({
              code: MATCHING_FINDING_CODES.INVENTORY_TARGET_MISSING,
              sourceRowNumber,
              metadata: { productId: matchedProduct.productId },
            })
          );
        } else if (targets.length > 1) {
          findings.push(
            createFinding({
              code: MATCHING_FINDING_CODES.DUPLICATE_INVENTORY_TARGET,
              sourceRowNumber,
              metadata: { productId: matchedProduct.productId, targetCount: targets.length },
            })
          );
        } else if (isPositiveDecimal(normalized.openingQuantity)) {
          if (!isZeroDecimal(targets[0].quantity)) {
            findings.push(
              createFinding({
                code: MATCHING_FINDING_CODES.EXISTING_STOCK_PRESENT,
                sourceRowNumber,
                metadata: { productId: matchedProduct.productId, quantity: targets[0].quantity },
              })
            );
          }
          if (Number(movement.movementCount || 0) > 0) {
            findings.push(
              createFinding({
                code: MATCHING_FINDING_CODES.PRIOR_STOCK_MOVEMENT_EXISTS,
                sourceRowNumber,
                metadata: {
                  productId: matchedProduct.productId,
                  movementCount: movement.movementCount,
                  latestMovementAt: movement.latestMovementAt,
                },
              })
            );
          }
          if (!permission.canAdjustInventory) {
            findings.push(
              createFinding({
                code: MATCHING_FINDING_CODES.PERMISSION_RESTRICTED,
                sourceRowNumber,
                field: 'inventory.adjust',
                metadata: { canAdjustInventory: permission.canAdjustInventory },
              })
            );
          }
        }
      } else if (matchedBy === MATCHED_BY.NONE && isPositiveDecimal(normalized.openingQuantity)) {
        if (!permission.canAdjustInventory) {
          findings.push(
            createFinding({
              code: MATCHING_FINDING_CODES.PERMISSION_RESTRICTED,
              sourceRowNumber,
              field: 'inventory.adjust',
              metadata: { canAdjustInventory: permission.canAdjustInventory },
            })
          );
        }
      }
    }

    const inventoryTargets = matchedProduct ? inventoryByProduct.get(matchedProduct.productId) || [] : [];
    const movement = matchedProduct ? movementsByProduct.get(matchedProduct.productId) : null;
    return {
      sourceRowNumber,
      phase3Row: rowCopy,
      classification: baseStatus,
      status: chooseStatus(
        baseStatus,
        findings,
        !findings.some((finding) => finding.severity === FINDING_SEVERITIES.ERROR)
      ),
      eligible: !findings.some((finding) => finding.severity === FINDING_SEVERITIES.ERROR),
      matchedBy,
      matchedProduct: productEvidence(matchedProduct),
      evidence: {
        normalizedSku,
        normalizedBarcode,
        skuMatchProductIds: skuMatches.map((product) => product.productId),
        barcodeMatchProductIds: barcodeMatches.map((product) => product.productId),
        catalogResolution,
        inventoryTargetId: inventoryTargets.length === 1 ? inventoryTargets[0].inventoryId : null,
        movementCount: movement ? movement.movementCount : 0,
        latestMovementAt: movement ? movement.latestMovementAt : null,
        canAdjustInventory: permission.canAdjustInventory,
        canCreateProduct: permission.canCreateProduct,
      },
      matchingFindings: findings,
    };
  });

  const byProduct = new Map();
  rowResults.forEach((result) => {
    if (!result.matchedProduct?.productId) return;
    if (!byProduct.has(result.matchedProduct.productId)) byProduct.set(result.matchedProduct.productId, []);
    byProduct.get(result.matchedProduct.productId).push(result);
  });
  for (const [productId, group] of byProduct.entries()) {
    if (group.length <= 1) continue;
    const conflictGroupId = `duplicate-product-target-${productId}`;
    const sourceRows = group.map((row) => row.sourceRowNumber).sort((a, b) => a - b);
    group.forEach((row) => {
      row.matchingFindings.push(
        createFinding({
          code: MATCHING_FINDING_CODES.DUPLICATE_PRODUCT_TARGET,
          sourceRowNumber: row.sourceRowNumber,
          conflictGroupId,
          metadata: { productId, sourceRows: sourceRows.join(',') },
        })
      );
      row.classification = MATCHING_ROW_STATUSES.DUPLICATE_PRODUCT_TARGET;
      row.status = MATCHING_ROW_STATUSES.DUPLICATE_PRODUCT_TARGET;
      row.eligible = false;
    });
  }

  const summary = {
    totalRows: rowResults.length,
    primitiveInvalidRows: 0,
    duplicateInputRows: 0,
    existingProductCandidates: 0,
    potentialNewProducts: 0,
    identifierConflicts: 0,
    duplicateDatabaseIdentifiers: 0,
    inactiveProductMatches: 0,
    missingCatalogReferences: 0,
    metadataMismatchRows: 0,
    inventoryTargetMissingRows: 0,
    duplicateProductTargetRows: 0,
    permissionRestrictedRows: 0,
    matchingEligibleRows: 0,
    matchingFailedRows: 0,
    warningCount: 0,
    errorCount: 0,
  };
  rowResults.forEach((row) => {
    if (row.status === MATCHING_ROW_STATUSES.PRIMITIVE_INVALID) summary.primitiveInvalidRows += 1;
    if (row.status === MATCHING_ROW_STATUSES.DUPLICATE_INPUT) summary.duplicateInputRows += 1;
    const phase3Blocked =
      row.status === MATCHING_ROW_STATUSES.PRIMITIVE_INVALID ||
      row.status === MATCHING_ROW_STATUSES.DUPLICATE_INPUT;
    if (!phase3Blocked && (row.status === MATCHING_ROW_STATUSES.EXISTING_PRODUCT_CANDIDATE || row.matchedProduct))
      summary.existingProductCandidates += 1;
    if (!phase3Blocked && row.classification === MATCHING_ROW_STATUSES.POTENTIAL_NEW_PRODUCT)
      summary.potentialNewProducts += 1;
    if (row.status === MATCHING_ROW_STATUSES.IDENTIFIER_CONFLICT) summary.identifierConflicts += 1;
    if (row.status === MATCHING_ROW_STATUSES.DUPLICATE_IN_DATABASE)
      summary.duplicateDatabaseIdentifiers += 1;
    if (row.status === MATCHING_ROW_STATUSES.INACTIVE_PRODUCT_MATCH) summary.inactiveProductMatches += 1;
    if (row.matchingFindings.some((finding) => finding.code === MATCHING_FINDING_CODES.MISSING_CATALOG_REFERENCE))
      summary.missingCatalogReferences += 1;
    if (row.matchingFindings.some((finding) => finding.code === MATCHING_FINDING_CODES.METADATA_MISMATCH))
      summary.metadataMismatchRows += 1;
    if (row.matchingFindings.some((finding) => finding.code === MATCHING_FINDING_CODES.INVENTORY_TARGET_MISSING))
      summary.inventoryTargetMissingRows += 1;
    if (row.status === MATCHING_ROW_STATUSES.DUPLICATE_PRODUCT_TARGET)
      summary.duplicateProductTargetRows += 1;
    if (row.matchingFindings.some((finding) => finding.code === MATCHING_FINDING_CODES.PERMISSION_RESTRICTED))
      summary.permissionRestrictedRows += 1;
    if (row.status === MATCHING_ROW_STATUSES.MATCHING_ELIGIBLE) summary.matchingEligibleRows += 1;
    if (row.status === MATCHING_ROW_STATUSES.MATCHING_FAILED) summary.matchingFailedRows += 1;
    row.matchingFindings.forEach((finding) => {
      if (finding.severity === FINDING_SEVERITIES.ERROR) summary.errorCount += 1;
      if (finding.severity === FINDING_SEVERITIES.WARNING) summary.warningCount += 1;
    });
  });

  return deepFreeze({
    kind: 'inventory_import_matching_analysis',
    schemaVersion: 1,
    immutable: true,
    databaseWrite: false,
    commitReady: false,
    permissions: permission,
    rows: rowResults,
    summary,
  });
}

module.exports = {
  FINDING_SEVERITIES,
  MATCHED_BY,
  MATCHING_FINDING_CODES,
  MATCHING_ROW_STATUSES,
  analyzeInventoryImportMatches,
};
