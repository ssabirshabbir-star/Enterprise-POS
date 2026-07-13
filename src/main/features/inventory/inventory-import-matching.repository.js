const { getPool } = require('../../database/connection');
const {
  CATALOG_TYPES,
  createCatalogMatch,
  createDefaultWarehouse,
  createInventoryTarget,
  createMatchingReadFailure,
  createProductMatch,
  createStockMovementSummary,
  normalizeCatalogName,
  normalizeMatchingIdentifier,
} = require('./inventory-import-matching.contract');

const MAX_BATCH_VALUES = 1000;

function uniqueNormalized(values = []) {
  return [...new Set(values.map(normalizeMatchingIdentifier).filter(Boolean))];
}

function uniquePositiveIntegers(values = []) {
  return [
    ...new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    ),
  ];
}

function chunks(values, size = MAX_BATCH_VALUES) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

function createInventoryImportMatchingRepository(dependencies = {}) {
  const poolProvider = dependencies.getPool || getPool;

  async function query(sql, params = []) {
    return poolProvider().query(sql, params);
  }

  async function readBatches(values, queryBuilder, mapper) {
    const rows = [];
    for (const batch of chunks(values)) {
      const result = await query(...queryBuilder(batch));
      rows.push(...result.rows.map(mapper));
    }
    return rows;
  }

  async function findProductsByIdentifiers({ skus = [], barcodes = [] } = {}) {
    const normalizedSkus = uniqueNormalized(skus);
    const normalizedBarcodes = uniqueNormalized(barcodes);
    if (!normalizedSkus.length && !normalizedBarcodes.length) {
      return { ok: true, products: [] };
    }

    try {
      const lookupPairs = [];
      normalizedSkus.forEach((value) => lookupPairs.push({ type: 'sku', value }));
      normalizedBarcodes.forEach((value) => lookupPairs.push({ type: 'barcode', value }));

      const products = await readBatches(
        lookupPairs,
        (batch) => {
          const skuValues = batch.filter((item) => item.type === 'sku').map((item) => item.value);
          const barcodeValues = batch
            .filter((item) => item.type === 'barcode')
            .map((item) => item.value);
          return [
            `
              SELECT
                products.id AS product_id,
                products.name,
                products.sku,
                products.barcode,
                products.purchase_price::text,
                products.sale_price::text,
                products.wholesale_price::text,
                products.is_active,
                products.deleted_at,
                products.updated_at,
                categories.name AS category_name,
                brands.name AS brand_name,
                units.name AS unit_name,
                variants.name AS variant_name
              FROM products
              LEFT JOIN categories ON categories.id = products.category_id
              LEFT JOIN brands ON brands.id = products.brand_id
              LEFT JOIN units ON units.id = products.unit_id
              LEFT JOIN variants ON variants.id = products.variant_id
              WHERE
                (COALESCE(array_length($1::text[], 1), 0) > 0 AND LOWER(products.sku) = ANY($1::text[]))
                OR
                (COALESCE(array_length($2::text[], 1), 0) > 0 AND LOWER(products.barcode) = ANY($2::text[]))
              ORDER BY products.id ASC
            `,
            [skuValues, barcodeValues],
          ];
        },
        createProductMatch
      );
      return { ok: true, products };
    } catch (error) {
      return createMatchingReadFailure(error);
    }
  }

  async function findCatalogsByNames(referencesByType = {}) {
    const result = {};
    for (const [type, tableName] of Object.entries(CATALOG_TYPES)) {
      const names = [...new Set((referencesByType[type] || []).map(normalizeCatalogName).filter(Boolean))];
      if (!names.length) {
        result[type] = [];
        continue;
      }
      try {
        result[type] = await readBatches(
          names,
          (batch) => [
            `
              SELECT id, name, is_active, deleted_at, updated_at
              FROM ${tableName}
              WHERE LOWER(name) = ANY($1::text[])
              ORDER BY LOWER(name) ASC, id ASC
            `,
            [batch],
          ],
          (row) => createCatalogMatch(type, row)
        );
      } catch (error) {
        return createMatchingReadFailure(error);
      }
    }
    return { ok: true, catalogs: result };
  }

  async function getDefaultWarehouse() {
    try {
      const result = await query(
        `
          SELECT id, name, is_active, updated_at
          FROM warehouses
          WHERE is_default = TRUE AND deleted_at IS NULL
          ORDER BY id ASC
          LIMIT 1
        `
      );
      return {
        ok: true,
        warehouse: result.rows[0] ? createDefaultWarehouse(result.rows[0]) : null,
      };
    } catch (error) {
      return createMatchingReadFailure(error);
    }
  }

  async function findInventoryTargets({ productIds = [], warehouseId } = {}) {
    const ids = uniquePositiveIntegers(productIds);
    const targetWarehouseId = Number(warehouseId);
    if (!ids.length || !Number.isInteger(targetWarehouseId) || targetWarehouseId <= 0) {
      return { ok: true, inventoryTargets: [] };
    }
    try {
      const inventoryTargets = await readBatches(
        ids,
        (batch) => [
          `
            SELECT id, product_id, warehouse_id, current_stock::text, updated_at
            FROM inventory
            WHERE warehouse_id = $1 AND product_id = ANY($2::int[])
            ORDER BY product_id ASC, id ASC
          `,
          [targetWarehouseId, batch],
        ],
        createInventoryTarget
      );
      return { ok: true, inventoryTargets };
    } catch (error) {
      return createMatchingReadFailure(error);
    }
  }

  async function summarizeStockMovements({ productIds = [] } = {}) {
    const ids = uniquePositiveIntegers(productIds);
    if (!ids.length) return { ok: true, movementSummaries: [] };
    try {
      const movementSummaries = await readBatches(
        ids,
        (batch) => [
          `
            SELECT
              product_id,
              COUNT(*)::int AS movement_count,
              MAX(created_at) AS latest_movement_at
            FROM stock_movements
            WHERE product_id = ANY($1::int[])
            GROUP BY product_id
            ORDER BY product_id ASC
          `,
          [batch],
        ],
        createStockMovementSummary
      );
      return { ok: true, movementSummaries };
    } catch (error) {
      return createMatchingReadFailure(error);
    }
  }

  return Object.freeze({
    findCatalogsByNames,
    findInventoryTargets,
    findProductsByIdentifiers,
    getDefaultWarehouse,
    summarizeStockMovements,
  });
}

const defaultRepository = createInventoryImportMatchingRepository();

module.exports = {
  createInventoryImportMatchingRepository,
  findCatalogsByNames: defaultRepository.findCatalogsByNames,
  findInventoryTargets: defaultRepository.findInventoryTargets,
  findProductsByIdentifiers: defaultRepository.findProductsByIdentifiers,
  getDefaultWarehouse: defaultRepository.getDefaultWarehouse,
  summarizeStockMovements: defaultRepository.summarizeStockMovements,
};
