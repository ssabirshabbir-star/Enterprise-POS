const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createCatalogMatch,
  createDefaultWarehouse,
  createInventoryTarget,
  createMatchingReadFailure,
  createProductMatch,
  createStockMovementSummary,
} = require('../../src/main/features/inventory/inventory-import-matching.contract');
const {
  MATCHED_BY,
  MATCHING_FINDING_CODES,
  MATCHING_ROW_STATUSES,
  analyzeInventoryImportMatches,
} = require('../../src/main/features/inventory/inventory-import-matching.service');
const { ROW_STATUSES } = require('../../src/main/features/inventory/inventory-import.validation');
const { IMPORT_ERROR_CODES } = require('../../src/main/features/inventory/inventory-import.errors');

const root = path.join(__dirname, '..', '..');

function product(overrides = {}) {
  return createProductMatch({
    product_id: 1,
    name: 'Rice 5kg',
    sku: 'RICE-5',
    barcode: '00012345',
    category_name: 'Grocery',
    brand_name: 'Local',
    unit_name: 'Bag',
    variant_name: 'Standard',
    purchase_price: '100.50',
    sale_price: '120.75',
    wholesale_price: '115.25',
    is_active: true,
    deleted_at: null,
    updated_at: '2026-07-13T10:00:00.000Z',
    ...overrides,
  });
}

function catalog(type, overrides = {}) {
  return createCatalogMatch(type, {
    id: 10,
    name: 'Grocery',
    is_active: true,
    deleted_at: null,
    updated_at: '2026-07-13T10:00:00.000Z',
    ...overrides,
  });
}

function inventoryTarget(overrides = {}) {
  return createInventoryTarget({
    id: 100,
    product_id: 1,
    warehouse_id: 7,
    current_stock: '0.000',
    updated_at: '2026-07-13T10:00:00.000Z',
    ...overrides,
  });
}

function movement(overrides = {}) {
  return createStockMovementSummary({
    product_id: 1,
    movement_count: 0,
    latest_movement_at: null,
    ...overrides,
  });
}

function warehouse(overrides = {}) {
  return createDefaultWarehouse({
    id: 7,
    name: 'Main Warehouse',
    is_active: true,
    updated_at: '2026-07-13T10:00:00.000Z',
    ...overrides,
  });
}

function row(overrides = {}) {
  return {
    sourceRowNumber: 2,
    status: ROW_STATUSES.STOCK_ROW_CANDIDATE,
    normalized: {
      productName: 'Rice 5kg',
      sku: 'RICE-5',
      barcode: '00012345',
      category: 'Grocery',
      brand: 'Local',
      unit: 'Bag',
      variant: 'Standard',
      costPrice: '100.50',
      sellingPrice: '120.75',
      wholesalePrice: '115.25',
      openingQuantity: '1.000',
      minimumStock: '0',
      active: true,
      trackExpiry: false,
      expiryRequired: false,
      expiryAlertDays: null,
      allowPriceChange: false,
      remarks: '',
    },
    errors: [],
    warnings: [],
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  return {
    rows: [row()],
    productsResult: { ok: true, products: [product()] },
    catalogsResult: {
      ok: true,
      catalogs: {
        category: [catalog('category')],
        brand: [catalog('brand', { id: 11, name: 'Local' })],
        unit: [catalog('unit', { id: 12, name: 'Bag' })],
        variant: [catalog('variant', { id: 13, name: 'Standard' })],
      },
    },
    warehouseResult: { ok: true, warehouse: warehouse() },
    inventoryTargetsResult: { ok: true, inventoryTargets: [inventoryTarget()] },
    movementSummariesResult: { ok: true, movementSummaries: [movement()] },
    permissionContext: { role: 'Admin', canCreateProduct: false, canAdjustInventory: false },
    ...overrides,
  };
}

function analyze(input = {}) {
  return analyzeInventoryImportMatches(baseInput(input));
}

function codes(result, index = 0) {
  return result.rows[index].matchingFindings.map((finding) => finding.code);
}

test('Phase 5B preserves Phase 3 primitive invalidity, duplicate input, errors, and caller rows', () => {
  const primitiveRow = row({
    status: ROW_STATUSES.STRUCTURALLY_INVALID,
    errors: [{ code: IMPORT_ERROR_CODES.INVALID_NUMBER, sourceRowNumber: 2, column: 'Cost Price' }],
  });
  const duplicateRow = row({
    sourceRowNumber: 3,
    status: ROW_STATUSES.DUPLICATE_IN_FILE,
    errors: [
      {
        code: IMPORT_ERROR_CODES.DUPLICATE_SKU_IN_FILE,
        sourceRowNumber: 3,
        referenceRowNumber: 2,
      },
    ],
  });
  const original = [primitiveRow, duplicateRow];
  const before = JSON.stringify(original);
  const result = analyze({ rows: original });

  assert.equal(result.rows[0].status, MATCHING_ROW_STATUSES.PRIMITIVE_INVALID);
  assert.equal(result.rows[1].status, MATCHING_ROW_STATUSES.DUPLICATE_INPUT);
  assert.equal(result.rows[0].phase3Row.errors[0].code, IMPORT_ERROR_CODES.INVALID_NUMBER);
  assert(codes(result, 0).includes(MATCHING_FINDING_CODES.PRIMITIVE_INVALID));
  assert(codes(result, 1).includes(MATCHING_FINDING_CODES.DUPLICATE_INPUT));
  assert.equal(JSON.stringify(original), before);
});

test('Product identity matching covers SKU, Barcode, both identifiers, conflicts, no match, inactive, and deleted products', () => {
  const skuOnly = analyze({ rows: [row({ normalized: { ...row().normalized, barcode: '' } })] });
  assert.equal(skuOnly.rows[0].matchedBy, MATCHED_BY.SKU);
  assert.equal(skuOnly.rows[0].matchedProduct.productId, 1);

  const barcodeOnly = analyze({ rows: [row({ normalized: { ...row().normalized, sku: '' } })] });
  assert.equal(barcodeOnly.rows[0].matchedBy, MATCHED_BY.BARCODE);

  const both = analyze();
  assert.equal(both.rows[0].matchedBy, MATCHED_BY.SKU_AND_BARCODE);

  const conflict = analyze({
    productsResult: {
      ok: true,
      products: [
        product({ product_id: 1, sku: 'RICE-5', barcode: 'DIFFERENT-1' }),
        product({ product_id: 2, name: 'Other', sku: 'OTHER', barcode: '00012345' }),
      ],
    },
  });
  assert.equal(conflict.rows[0].status, MATCHING_ROW_STATUSES.IDENTIFIER_CONFLICT);
  assert(codes(conflict).includes(MATCHING_FINDING_CODES.IDENTIFIER_CONFLICT));

  const none = analyze({ productsResult: { ok: true, products: [] } });
  assert.equal(none.rows[0].classification, MATCHING_ROW_STATUSES.POTENTIAL_NEW_PRODUCT);
  assert.equal(none.rows[0].status, MATCHING_ROW_STATUSES.MATCHING_ELIGIBLE);
  assert.equal(none.rows[0].matchedProduct, null);
  assert.equal(none.rows[0].matchedBy, MATCHED_BY.NONE);

  const inactive = analyze({
    productsResult: { ok: true, products: [product({ is_active: false })] },
  });
  assert.equal(inactive.rows[0].status, MATCHING_ROW_STATUSES.INACTIVE_PRODUCT_MATCH);
  assert(codes(inactive).includes(MATCHING_FINDING_CODES.INACTIVE_PRODUCT_MATCH));

  const deleted = analyze({
    productsResult: {
      ok: true,
      products: [product({ deleted_at: '2026-07-13T11:00:00.000Z' })],
    },
  });
  assert.equal(deleted.rows[0].status, MATCHING_ROW_STATUSES.DELETED_PRODUCT_MATCH);
  assert(codes(deleted).includes(MATCHING_FINDING_CODES.DELETED_PRODUCT_MATCH));
});

test('Duplicate database SKU or Barcode matches fail closed and preserve match evidence', () => {
  const duplicateSku = analyze({
    productsResult: {
      ok: true,
      products: [
        product({ product_id: 1, sku: 'RICE-5', barcode: 'A0001' }),
        product({ product_id: 2, name: 'Rice Copy', sku: 'rice-5', barcode: 'B0001' }),
      ],
    },
  });
  assert.equal(duplicateSku.rows[0].status, MATCHING_ROW_STATUSES.DUPLICATE_IN_DATABASE);
  assert.equal(duplicateSku.rows[0].matchedBy, MATCHED_BY.DUPLICATE_DATABASE_IDENTIFIER);
  assert.deepEqual(duplicateSku.rows[0].evidence.skuMatchProductIds, [1, 2]);

  const duplicateBarcode = analyze({
    productsResult: {
      ok: true,
      products: [
        product({ product_id: 1, sku: 'A', barcode: '00012345' }),
        product({ product_id: 2, name: 'Barcode Copy', sku: 'B', barcode: '00012345' }),
      ],
    },
  });
  assert.equal(duplicateBarcode.rows[0].status, MATCHING_ROW_STATUSES.DUPLICATE_IN_DATABASE);
  assert.deepEqual(duplicateBarcode.rows[0].evidence.barcodeMatchProductIds, [1, 2]);
});

test('Product Name never auto-matches without SKU or Barcode', () => {
  const result = analyze({
    rows: [
      row({
        status: ROW_STATUSES.PRODUCT_ONLY_CANDIDATE,
        normalized: {
          ...row().normalized,
          sku: '',
          barcode: '',
          productName: 'Rice 5kg',
          openingQuantity: '0',
        },
      }),
    ],
  });
  assert.equal(result.rows[0].matchedProduct, null);
  assert.equal(result.rows[0].matchedBy, MATCHED_BY.NONE);
});

test('Existing product metadata and price differences produce warning-only findings and no update proposal', () => {
  const result = analyze({
    rows: [
      row({
        normalized: {
          ...row().normalized,
          productName: 'Rice New Name',
          costPrice: '99.99',
          sellingPrice: '121.00',
          openingQuantity: '0',
        },
      }),
    ],
  });
  assert.equal(result.rows[0].status, MATCHING_ROW_STATUSES.MATCHING_ELIGIBLE);
  assert(codes(result).includes(MATCHING_FINDING_CODES.METADATA_MISMATCH));
  assert.equal(result.rows[0].matchingFindings.every((finding) => finding.severity === 'WARNING'), true);
  assert.doesNotMatch(JSON.stringify(result.rows[0]), /updateProposal|productUpdate|write/i);
});

test('Potential new product classification uses catalog resolution and Product creation permission', () => {
  const potential = analyze({
    productsResult: { ok: true, products: [] },
    rows: [row({ status: ROW_STATUSES.PRODUCT_ONLY_CANDIDATE, normalized: { ...row().normalized, openingQuantity: '0' } })],
  });
  assert.equal(potential.rows[0].status, MATCHING_ROW_STATUSES.MATCHING_ELIGIBLE);
  assert.equal(potential.rows[0].evidence.canCreateProduct, true);

  const denied = analyze({
    productsResult: { ok: true, products: [] },
    permissionContext: { role: 'Warehouse', canCreateProduct: true },
    rows: [row({ status: ROW_STATUSES.PRODUCT_ONLY_CANDIDATE, normalized: { ...row().normalized, openingQuantity: '0' } })],
  });
  assert.equal(denied.rows[0].status, MATCHING_ROW_STATUSES.PERMISSION_RESTRICTED);
  assert.equal(denied.rows[0].evidence.canCreateProduct, false);
  assert(codes(denied).includes(MATCHING_FINDING_CODES.PERMISSION_RESTRICTED));
});

test('Catalog references block new products when missing, inactive, duplicate, or deleted; optional Unit may be omitted', () => {
  const missing = analyze({
    productsResult: { ok: true, products: [] },
    catalogsResult: {
      ok: true,
      catalogs: { category: [], brand: [], unit: [], variant: [] },
    },
  });
  assert.equal(missing.rows[0].status, MATCHING_ROW_STATUSES.MISSING_CATALOG_REFERENCE);
  assert(codes(missing).includes(MATCHING_FINDING_CODES.MISSING_CATALOG_REFERENCE));

  const inactive = analyze({
    productsResult: { ok: true, products: [] },
    catalogsResult: {
      ok: true,
      catalogs: {
        category: [catalog('category', { is_active: false })],
        brand: [catalog('brand', { id: 11, name: 'Local' })],
        unit: [catalog('unit', { id: 12, name: 'Bag' })],
        variant: [catalog('variant', { id: 13, name: 'Standard' })],
      },
    },
  });
  assert(codes(inactive).includes(MATCHING_FINDING_CODES.INACTIVE_CATALOG_REFERENCE));

  const duplicate = analyze({
    productsResult: { ok: true, products: [] },
    catalogsResult: {
      ok: true,
      catalogs: {
        category: [catalog('category', { id: 10 }), catalog('category', { id: 20 })],
        brand: [catalog('brand', { id: 11, name: 'Local' })],
        unit: [catalog('unit', { id: 12, name: 'Bag' })],
        variant: [catalog('variant', { id: 13, name: 'Standard' })],
      },
    },
  });
  assert(codes(duplicate).includes(MATCHING_FINDING_CODES.DUPLICATE_CATALOG_REFERENCE));

  const optionalUnitOmitted = analyze({
    productsResult: { ok: true, products: [] },
    rows: [
      row({
        status: ROW_STATUSES.PRODUCT_ONLY_CANDIDATE,
        normalized: { ...row().normalized, unit: '', variant: '', openingQuantity: '0' },
      }),
    ],
  });
  assert(!codes(optionalUnitOmitted).includes(MATCHING_FINDING_CODES.MISSING_CATALOG_REFERENCE));
});

test('Default warehouse, inventory target, stock quantity, and movement safety classify opening stock readiness', () => {
  const noWarehouse = analyze({ warehouseResult: { ok: true, warehouse: null } });
  assert.equal(noWarehouse.rows[0].status, MATCHING_ROW_STATUSES.MATCHING_FAILED);
  assert(codes(noWarehouse).includes(MATCHING_FINDING_CODES.DEFAULT_WAREHOUSE_MISSING));

  const missingInventory = analyze({ inventoryTargetsResult: { ok: true, inventoryTargets: [] } });
  assert.equal(missingInventory.rows[0].status, MATCHING_ROW_STATUSES.INVENTORY_TARGET_MISSING);

  const duplicateInventory = analyze({
    inventoryTargetsResult: {
      ok: true,
      inventoryTargets: [inventoryTarget({ id: 100 }), inventoryTarget({ id: 101 })],
    },
  });
  assert.equal(duplicateInventory.rows[0].status, MATCHING_ROW_STATUSES.DUPLICATE_IN_DATABASE);
  assert(codes(duplicateInventory).includes(MATCHING_FINDING_CODES.DUPLICATE_INVENTORY_TARGET));

  const stockPresent = analyze({
    inventoryTargetsResult: { ok: true, inventoryTargets: [inventoryTarget({ current_stock: '2.500' })] },
  });
  assert.equal(stockPresent.rows[0].status, MATCHING_ROW_STATUSES.OPENING_STOCK_NOT_ALLOWED);
  assert.equal(stockPresent.rows[0].evidence.inventoryTargetId, 100);
  assert.equal(stockPresent.rows[0].phase3Row.normalized.openingQuantity, '1.000');

  const priorMovement = analyze({
    movementSummariesResult: {
      ok: true,
      movementSummaries: [
        movement({ movement_count: 2, latest_movement_at: '2026-07-13T12:00:00.000Z' }),
      ],
    },
  });
  assert.equal(priorMovement.rows[0].status, MATCHING_ROW_STATUSES.OPENING_STOCK_NOT_ALLOWED);
  assert.equal(priorMovement.rows[0].evidence.latestMovementAt, '2026-07-13T12:00:00.000Z');
});

test('Duplicate product targets block every affected row without merging quantities', () => {
  const result = analyze({
    rows: [
      row({ sourceRowNumber: 2, normalized: { ...row().normalized, barcode: '' } }),
      row({
        sourceRowNumber: 3,
        normalized: { ...row().normalized, sku: '', barcode: '00012345', openingQuantity: '2.000' },
      }),
    ],
  });
  assert.equal(result.rows[0].status, MATCHING_ROW_STATUSES.DUPLICATE_PRODUCT_TARGET);
  assert.equal(result.rows[1].status, MATCHING_ROW_STATUSES.DUPLICATE_PRODUCT_TARGET);
  assert.equal(result.rows[0].matchingFindings.at(-1).conflictGroupId, 'duplicate-product-target-1');
  assert.equal(result.rows[1].phase3Row.normalized.openingQuantity, '2.000');
});

test('Permission classification derives from role and ignores renderer-supplied permission flags', () => {
  const warehouseUser = analyze({
    productsResult: { ok: true, products: [] },
    permissionContext: { role: 'Warehouse', canCreateProduct: true, canAdjustInventory: false },
  });
  assert.equal(warehouseUser.permissions.canAdjustInventory, true);
  assert.equal(warehouseUser.permissions.canCreateProduct, false);
  assert.equal(warehouseUser.rows[0].status, MATCHING_ROW_STATUSES.PERMISSION_RESTRICTED);

  const cashier = analyze({
    permissionContext: { role: 'Cashier', canAdjustInventory: true },
  });
  assert.equal(cashier.permissions.canAdjustInventory, false);
  assert.equal(cashier.rows[0].status, MATCHING_ROW_STATUSES.PERMISSION_RESTRICTED);
});

test('Repository read failures are sanitized and fail closed without raw SQL or stack leakage', () => {
  const failure = createMatchingReadFailure({
    code: '42601',
    message: 'SELECT * FROM secret at C:\\private\\db.js',
    stack: 'stack trace',
  });
  const result = analyze({ productsResult: failure });
  assert.equal(result.rows[0].status, MATCHING_ROW_STATUSES.MATCHING_FAILED);
  assert(codes(result).includes(MATCHING_FINDING_CODES.MATCHING_READ_FAILED));
  assert.doesNotMatch(JSON.stringify(result), /SELECT \*|secret|C:\\private|stack trace/);
});

test('Matching analysis output is immutable, deterministic, plain data, and preserves decimal strings', () => {
  const input = baseInput();
  const first = analyzeInventoryImportMatches(input);
  const second = analyzeInventoryImportMatches(input);
  assert.deepEqual(first, second);
  assert(Object.isFrozen(first));
  assert(Object.isFrozen(first.rows[0]));
  assert.equal(first.rows[0].phase3Row.normalized.costPrice, '100.50');
  first.rows[0].status = 'MUTATED';
  assert.notEqual(first.rows[0].status, 'MUTATED');
  assert.throws(() => analyzeInventoryImportMatches({ rows: [{ sourceRowNumber: 1, fn() {} }] }), /plain/);
  class CustomPayload {
    constructor() {
      this.rows = [];
    }
  }
  assert.throws(() => analyzeInventoryImportMatches(new CustomPayload()), /plain/);
});

test('Summary counts are deterministic and do not contain raw row content', () => {
  const result = analyze({
    rows: [
      row({ sourceRowNumber: 2, normalized: { ...row().normalized, openingQuantity: '0' } }),
      row({
        sourceRowNumber: 3,
        status: ROW_STATUSES.STRUCTURALLY_INVALID,
        errors: [{ code: IMPORT_ERROR_CODES.INVALID_NUMBER }],
      }),
      row({ sourceRowNumber: 4, normalized: { ...row().normalized, sku: '', barcode: '' } }),
    ],
    productsResult: { ok: true, products: [product()] },
  });
  assert.equal(result.summary.totalRows, 3);
  assert.equal(result.summary.primitiveInvalidRows, 1);
  assert.equal(result.summary.potentialNewProducts, 1);
  assert.equal(result.summary.warningCount >= 0, true);
  assert.doesNotMatch(JSON.stringify(result.summary), /Rice 5kg|00012345|RICE-5/);
});

test('Phase 5B service is isolated from UI, IPC, filesystem, SQL, and write surfaces', () => {
  const serviceSource = fs.readFileSync(
    path.join(root, 'src/main/features/inventory/inventory-import-matching.service.js'),
    'utf8'
  );
  assert.doesNotMatch(serviceSource, /ipcMain|ipcRenderer|BrowserWindow|document\.|showOpenDialog/);
  assert.doesNotMatch(serviceSource, /require\(['"](?:fs|electron|pg)/);
  assert.doesNotMatch(
    serviceSource,
    /\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bCREATE\s+TABLE\b/i
  );

  const html = fs.readFileSync(path.join(root, 'src/main/features/inventory/index.html'), 'utf8');
  assert.match(html, /id="inventoryImportPreviewButton"/);
  assert.match(html, /data-tool-action="import-preview"[^>]*>Import CSV/);
  assert.match(html, /Execution is available only after backend preflight confirms/);
  assert.doesNotMatch(html, /Execute Import|Finalize Import|Commit Import|Import Now/);
});
