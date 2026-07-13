const MATCHING_CONTRACT_VERSION = 'inventory-import-matching-read-v1';

const CATALOG_TYPES = Object.freeze({
  category: 'categories',
  brand: 'brands',
  unit: 'units',
  variant: 'variants',
});

const CATALOG_TYPE_KEYS = Object.freeze(Object.keys(CATALOG_TYPES));

class InventoryImportMatchingContractError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'InventoryImportMatchingContractError';
    this.code = code;
    this.field = field;
  }
}

function fail(code, message, field = null) {
  throw new InventoryImportMatchingContractError(code, message, field);
}

function assertPlainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('invalid_matching_contract', 'Inventory import matching data must be a plain object.', field);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    fail('invalid_matching_contract', 'Inventory import matching data must be plain data only.', field);
  }

  const seen = new Set();
  function visit(item, key) {
    if (item === null || item === undefined) return;
    if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
      fail('invalid_matching_contract', 'Inventory import matching data must not be executable.', key);
    }
    if (typeof item !== 'object' || item instanceof Date) return;
    if (seen.has(item)) {
      fail('invalid_matching_contract', 'Inventory import matching data must not contain circular data.', key);
    }
    if (Object.getPrototypeOf(item) !== Object.prototype) {
      fail('invalid_matching_contract', 'Inventory import matching data must not contain custom objects.', key);
    }
    seen.add(item);
    Object.entries(item).forEach(([childKey, child]) => visit(child, childKey));
    seen.delete(item);
  }

  Object.entries(value).forEach(([key, item]) => visit(item, key));
}

function deepFreeze(value) {
  const seen = new Set();

  function visit(item) {
    if (item === null || item === undefined || typeof item !== 'object') return item;
    if (seen.has(item)) return item;
    if (Object.getPrototypeOf(item) !== Object.prototype && !Array.isArray(item)) {
      fail('invalid_matching_contract', 'Inventory import matching output must be plain data only.');
    }
    seen.add(item);
    Object.values(item).forEach(visit);
    Object.freeze(item);
    seen.delete(item);
    return item;
  }

  return visit(value);
}

function positiveInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    fail('invalid_matching_id', `${field} must be a positive integer.`, field);
  }
  return number;
}

function normalizeMatchingIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCatalogName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function text(value) {
  return String(value ?? '').trim();
}

function nullableText(value) {
  const output = text(value);
  return output || null;
}

function decimalString(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const output = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(output)) {
    fail('invalid_matching_decimal', `${field} must be a decimal string.`, field);
  }
  return output;
}

function timestamp(value, field) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    fail('invalid_matching_timestamp', `${field} must be a valid timestamp.`, field);
  }
  return date.toISOString();
}

function createProductIdentifier(input = {}) {
  assertPlainObject(input, 'productIdentifier');
  const sourceRowNumber = positiveInteger(input.sourceRowNumber, 'sourceRowNumber');
  const sku = nullableText(input.sku);
  const barcode = nullableText(input.barcode);
  return deepFreeze({
    kind: 'inventory_import_product_identifier',
    schemaVersion: 1,
    sourceRowNumber,
    sku,
    normalizedSku: normalizeMatchingIdentifier(sku),
    barcode,
    normalizedBarcode: normalizeMatchingIdentifier(barcode),
  });
}

function createCatalogReference(input = {}) {
  assertPlainObject(input, 'catalogReference');
  const type = text(input.type);
  if (!CATALOG_TYPES[type]) {
    fail('invalid_catalog_type', 'Catalog type is not supported for Inventory import matching.', 'type');
  }
  const name = nullableText(input.name);
  return deepFreeze({
    kind: 'inventory_import_catalog_reference',
    schemaVersion: 1,
    type,
    sourceRowNumber: positiveInteger(input.sourceRowNumber, 'sourceRowNumber'),
    name,
    normalizedName: normalizeCatalogName(name),
  });
}

function createProductMatch(row = {}) {
  assertPlainObject(row, 'productMatch');
  return deepFreeze({
    kind: 'inventory_import_product_match',
    schemaVersion: 1,
    productId: positiveInteger(row.product_id ?? row.productId ?? row.id, 'productId'),
    sku: text(row.sku),
    normalizedSku: normalizeMatchingIdentifier(row.sku),
    barcode: text(row.barcode),
    normalizedBarcode: normalizeMatchingIdentifier(row.barcode),
    productName: text(row.name ?? row.product_name ?? row.productName),
    category: nullableText(row.category_name ?? row.category),
    brand: nullableText(row.brand_name ?? row.brand),
    unit: nullableText(row.unit_name ?? row.unit),
    variant: nullableText(row.variant_name ?? row.variant),
    costPrice: decimalString(row.purchase_price ?? row.costPrice ?? row.purchasePrice ?? '0', 'costPrice'),
    sellingPrice: decimalString(row.sale_price ?? row.sellingPrice ?? row.salePrice ?? '0', 'sellingPrice'),
    wholesalePrice: decimalString(row.wholesale_price ?? row.wholesalePrice ?? '0', 'wholesalePrice'),
    active: row.is_active !== false,
    deleted: row.deleted_at !== null && row.deleted_at !== undefined,
    updatedAt: timestamp(row.updated_at ?? row.updatedAt, 'updatedAt'),
  });
}

function createCatalogMatch(type, row = {}) {
  if (!CATALOG_TYPES[type]) {
    fail('invalid_catalog_type', 'Catalog type is not supported for Inventory import matching.', 'type');
  }
  assertPlainObject(row, 'catalogMatch');
  const name = text(row.name);
  return deepFreeze({
    kind: 'inventory_import_catalog_match',
    schemaVersion: 1,
    type,
    id: positiveInteger(row.id, 'id'),
    name,
    normalizedName: normalizeCatalogName(name),
    active: row.is_active !== false,
    deleted: row.deleted_at !== null && row.deleted_at !== undefined,
    updatedAt: timestamp(row.updated_at ?? row.updatedAt, 'updatedAt'),
  });
}

function createDefaultWarehouse(row = {}) {
  assertPlainObject(row, 'defaultWarehouse');
  return deepFreeze({
    kind: 'inventory_import_default_warehouse',
    schemaVersion: 1,
    warehouseId: positiveInteger(row.id ?? row.warehouse_id ?? row.warehouseId, 'warehouseId'),
    name: text(row.name),
    active: row.is_active !== false,
    updatedAt: timestamp(row.updated_at ?? row.updatedAt, 'updatedAt'),
  });
}

function createInventoryTarget(row = {}) {
  assertPlainObject(row, 'inventoryTarget');
  return deepFreeze({
    kind: 'inventory_import_inventory_target',
    schemaVersion: 1,
    inventoryId: positiveInteger(row.id ?? row.inventory_id ?? row.inventoryId, 'inventoryId'),
    productId: positiveInteger(row.product_id ?? row.productId, 'productId'),
    warehouseId: positiveInteger(row.warehouse_id ?? row.warehouseId, 'warehouseId'),
    quantity: decimalString(row.current_stock ?? row.quantity ?? '0', 'quantity'),
    updatedAt: timestamp(row.updated_at ?? row.updatedAt, 'updatedAt'),
  });
}

function createStockMovementSummary(row = {}) {
  assertPlainObject(row, 'stockMovementSummary');
  return deepFreeze({
    kind: 'inventory_import_stock_movement_summary',
    schemaVersion: 1,
    productId: positiveInteger(row.product_id ?? row.productId, 'productId'),
    movementCount: Math.max(0, Number(row.movement_count ?? row.movementCount ?? 0)),
    latestMovementAt: timestamp(row.latest_movement_at ?? row.latestMovementAt, 'latestMovementAt'),
  });
}

function createMatchingReadFailure(error) {
  return deepFreeze({
    ok: false,
    code: 'INVENTORY_IMPORT_MATCHING_READ_FAILED',
    message: 'Inventory import matching data could not be read.',
    reason: String(error?.code || error?.name || 'read_failed').slice(0, 80),
  });
}

module.exports = {
  CATALOG_TYPES,
  CATALOG_TYPE_KEYS,
  MATCHING_CONTRACT_VERSION,
  InventoryImportMatchingContractError,
  createCatalogMatch,
  createCatalogReference,
  createDefaultWarehouse,
  createInventoryTarget,
  createMatchingReadFailure,
  createProductIdentifier,
  createProductMatch,
  createStockMovementSummary,
  normalizeCatalogName,
  normalizeMatchingIdentifier,
};
