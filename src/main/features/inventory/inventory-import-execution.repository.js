const { withTransaction } = require('../../database/connection');
const {
  PRODUCT_ACTIONS,
  STOCK_ACTIONS,
} = require('./inventory-import-commit-plan.model');
const {
  IMPORT_EXECUTION_CONTRACT_VERSION,
  IMPORT_EXECUTION_STOCK_STRATEGIES,
  createInventoryImportExecutionContract,
  findExecutionStockPolicy,
} = require('./inventory-import-execution-contract.model');
const {
  IMPORT_EXECUTION_ROW_STATUSES,
  IMPORT_EXECUTION_STATUSES,
  buildImportExecutionIdempotencyKey,
  validateImportBatchRecord,
  validateImportRowResultRecord,
} = require('./inventory-import-execution-record.model');
const { createInventoryImportExecutionResult } = require('./inventory-import-execution-result.model');
const { validateProductPayload } = require('../products/product.validation');

const EXECUTION_REPOSITORY_ERROR_CODES = Object.freeze({
  CONFLICT: 'INVENTORY_IMPORT_EXECUTION_REPLAY_CONFLICT',
  INVALID_PREFLIGHT: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_INVALID',
  STALE_STATE: 'INVENTORY_IMPORT_EXECUTION_STALE_STATE',
  UNSUPPORTED_ACTION: 'INVENTORY_IMPORT_EXECUTION_UNSUPPORTED_ACTION',
});

class InventoryImportExecutionRepositoryError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'InventoryImportExecutionRepositoryError';
    this.code = code;
    this.field = field;
  }
}

function fail(code, message, field = null) {
  throw new InventoryImportExecutionRepositoryError(code, message, field);
}

function normalizeDecimal(value) {
  return String(value ?? '0');
}

function positiveId(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) fail(EXECUTION_REPOSITORY_ERROR_CODES.INVALID_PREFLIGHT, `${field} is invalid.`, field);
  return number;
}

function rowQuantity(row) {
  return normalizeDecimal(row.executionSourceEvidence?.openingStockEvidence?.quantity || '0');
}

function catalogPayload(catalogEvidence = {}) {
  return {
    categoryId: catalogEvidence.category?.supplied ? catalogEvidence.category.resolvedId : null,
    brandId: catalogEvidence.brand?.supplied ? catalogEvidence.brand.resolvedId : null,
    unitId: catalogEvidence.unit?.supplied ? catalogEvidence.unit.resolvedId : null,
    variantId: catalogEvidence.variant?.supplied ? catalogEvidence.variant.resolvedId : null,
  };
}

function productPayload(row) {
  const evidence = row.executionSourceEvidence.productCreationEvidence;
  const payload = {
    name: evidence.productName,
    sku: evidence.sku,
    barcode: evidence.barcode,
    ...catalogPayload(row.executionSourceEvidence.catalogEvidence),
    purchasePrice: evidence.costPrice,
    salePrice: evidence.sellingPrice,
    wholesalePrice: evidence.wholesalePrice,
    minStockLevel: evidence.minimumStock,
    currentStock: row.originalStockAction === STOCK_ACTIONS.APPLY_OPENING_STOCK ? evidence.openingQuantity : '0',
    allowSalePriceOverride: false,
    allowPriceChange: evidence.allowPriceChange === true,
    autoUpdateSalePriceFromPurchase: false,
    trackExpiry: evidence.trackExpiry === true,
    expiryRequired: evidence.expiryRequired === true,
    expiryAlertDays: evidence.expiryAlertDays,
    isActive: evidence.active !== false,
  };
  const validation = validateProductPayload(payload);
  if (!validation.ok) {
    fail(EXECUTION_REPOSITORY_ERROR_CODES.INVALID_PREFLIGHT, validation.message || 'Product evidence is invalid.', 'product');
  }
  return validation.value;
}

function assertSupportedRow(row) {
  if (row.currentlyEligible !== true || row.currentDisposition !== 'CURRENTLY_ELIGIBLE') {
    fail(EXECUTION_REPOSITORY_ERROR_CODES.INVALID_PREFLIGHT, 'Only currently eligible preflight rows may execute.', 'rows');
  }
  const policy = findExecutionStockPolicy(row.originalProductAction, row.originalStockAction);
  if (!policy || policy.strategy === IMPORT_EXECUTION_STOCK_STRATEGIES.UNSUPPORTED) {
    fail(EXECUTION_REPOSITORY_ERROR_CODES.UNSUPPORTED_ACTION, 'Inventory import execution action is unsupported.', 'rows');
  }
  return policy;
}

async function assertCatalogs(client, row) {
  for (const [type, evidence] of Object.entries(row.executionSourceEvidence.catalogEvidence || {})) {
    if (!evidence?.supplied) continue;
    const tableByType = { category: 'categories', brand: 'brands', unit: 'units', variant: 'variants' };
    const table = tableByType[type];
    if (!table) fail(EXECUTION_REPOSITORY_ERROR_CODES.INVALID_PREFLIGHT, 'Unsupported catalog evidence.', `catalog.${type}`);
    const result = await client.query(
      `SELECT id, name, is_active, deleted_at FROM ${table} WHERE id = $1 FOR UPDATE`,
      [positiveId(evidence.resolvedId, `catalog.${type}`)]
    );
    const item = result.rows[0];
    if (!item || item.name !== evidence.resolvedName || item.is_active !== true || item.deleted_at) {
      fail(EXECUTION_REPOSITORY_ERROR_CODES.STALE_STATE, 'Catalog evidence is stale.', `catalog.${type}`);
    }
  }
}

async function assertWarehouse(client, row) {
  const evidence = row.executionSourceEvidence.warehouseEvidence;
  if (!evidence.required && !evidence.warehouseId) return null;
  const warehouseId = positiveId(evidence.warehouseId, 'warehouseId');
  const result = await client.query(
    'SELECT id, name, is_active, deleted_at FROM warehouses WHERE id = $1 FOR UPDATE',
    [warehouseId]
  );
  const warehouse = result.rows[0];
  if (!warehouse || warehouse.name !== evidence.name || warehouse.is_active !== true || warehouse.deleted_at) {
    fail(EXECUTION_REPOSITORY_ERROR_CODES.STALE_STATE, 'Warehouse evidence is stale.', 'warehouseId');
  }
  return warehouseId;
}

async function assertCreateProductAvailable(client, row) {
  const product = productPayload(row);
  const duplicate = await client.query(
    `
      SELECT id
      FROM products
      WHERE deleted_at IS NULL
        AND (LOWER(sku) = LOWER($1) OR LOWER(barcode) = LOWER($2))
      LIMIT 1
      FOR UPDATE
    `,
    [product.sku, product.barcode]
  );
  if (duplicate.rows.length) {
    fail(EXECUTION_REPOSITORY_ERROR_CODES.STALE_STATE, 'SKU or barcode is no longer available.', 'product');
  }
  await assertCatalogs(client, row);
  return product;
}

async function assertExistingProduct(client, row) {
  const evidence = row.executionSourceEvidence.existingProductEvidence;
  const productId = positiveId(evidence.productId, 'productId');
  const result = await client.query(
    'SELECT id, sku, barcode, name, is_active, deleted_at FROM products WHERE id = $1 FOR UPDATE',
    [productId]
  );
  const product = result.rows[0];
  if (
    !product ||
    product.deleted_at ||
    product.is_active !== true ||
    product.sku !== evidence.sku ||
    product.barcode !== evidence.barcode
  ) {
    fail(EXECUTION_REPOSITORY_ERROR_CODES.STALE_STATE, 'Matched product evidence is stale.', 'productId');
  }
  return productId;
}

async function createProductInTransaction(client, row, actorId, policy) {
  const product = await assertCreateProductAvailable(client, row);
  const warehouseId = await assertWarehouse(client, row);
  const result = await client.query(
    `
      INSERT INTO products (
        name, sku, barcode, category_id, brand_id, unit_id, variant_id,
        purchase_price, sale_price, wholesale_price,
        min_stock_level, current_stock, allow_sale_price_override,
        allow_price_change, auto_update_sale_price_from_purchase, track_expiry,
        expiry_required, expiry_alert_days, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id
    `,
    [
      product.name,
      product.sku,
      product.barcode,
      product.categoryId,
      product.brandId,
      product.unitId,
      product.variantId,
      product.purchasePrice,
      product.salePrice,
      product.wholesalePrice,
      product.minStockLevel,
      product.currentStock,
      product.allowSalePriceOverride,
      product.allowPriceChange,
      product.autoUpdateSalePriceFromPurchase,
      product.trackExpiry,
      product.expiryRequired,
      product.expiryAlertDays,
      product.isActive,
    ]
  );
  const productId = result.rows[0].id;
  let movementId = null;
  if (warehouseId) {
    await client.query(
      `
        INSERT INTO inventory (product_id, warehouse_id, current_stock, min_stock_level)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (product_id, warehouse_id)
        DO UPDATE SET current_stock = EXCLUDED.current_stock, min_stock_level = EXCLUDED.min_stock_level, updated_at = NOW()
      `,
      [productId, warehouseId, product.currentStock, product.minStockLevel]
    );
  }
  if (warehouseId && Number(product.currentStock) > 0) {
    const movement = await client.query(
      `
        INSERT INTO stock_movements (
          product_id, warehouse_id, movement_type, quantity, previous_stock, new_stock,
          reference_type, reason, notes, user_id, created_by
        )
        VALUES ($1, $2, $3, $4, 0, $4, $5, $6, 'Opening stock from product creation', $7, $7)
        RETURNING id
      `,
      [
        productId,
        warehouseId,
        policy.movementType,
        product.currentStock,
        policy.referenceType,
        policy.reason,
        actorId,
      ]
    );
    movementId = movement.rows[0].id;
  }
  return { productId, movementId, quantity: product.currentStock };
}

async function insertRowResult(client, batchId, row, result) {
  const inserted = await client.query(
    `
      INSERT INTO inventory_import_row_results (
        batch_id, source_row_number, product_action, resulting_product_id,
        stock_action, resulting_stock_movement_id, quantity, status, result_code
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `,
    [
      batchId,
      row.sourceRowNumber,
      row.originalProductAction,
      result.productId || null,
      row.originalStockAction,
      result.movementId || null,
      result.quantity || null,
      result.status,
      result.resultCode || null,
    ]
  );
  return validateImportRowResultRecord({
    rowResultId: inserted.rows[0].id,
    batchId,
    sourceRowNumber: row.sourceRowNumber,
    productAction: row.originalProductAction,
    resultingProductId: result.productId || null,
    stockAction: row.originalStockAction,
    resultingStockMovementId: result.movementId || null,
    quantity: result.quantity || null,
    status: result.status,
    resultCode: result.resultCode || null,
  });
}

function summarizeRows(rows) {
  return {
    totalRows: rows.length,
    createdProductCount: rows.filter((row) => row.originalProductAction === PRODUCT_ACTIONS.CREATE_PRODUCT).length,
    existingProductCount: rows.filter((row) => row.originalProductAction === PRODUCT_ACTIONS.USE_EXISTING_PRODUCT).length,
    stockAppliedCount: rows.filter((row) => row.originalStockAction === STOCK_ACTIONS.APPLY_OPENING_STOCK).length,
    skippedCount: rows.filter((row) => row.status === IMPORT_EXECUTION_ROW_STATUSES.SKIPPED).length,
  };
}

function createInventoryImportExecutionRepository(dependencies = {}) {
  const transaction = dependencies.withTransaction || withTransaction;

  async function executePreflight({ executionPreflight, executionPreflightSessionId, ownerId, actorId }) {
    if (!executionPreflight?.commitReady || !Array.isArray(executionPreflight.rows) || !executionPreflight.rows.length) {
      fail(EXECUTION_REPOSITORY_ERROR_CODES.INVALID_PREFLIGHT, 'Execution preflight is not commit ready.', 'executionPreflight');
    }
    const contract = createInventoryImportExecutionContract();
    const idempotencyKey = buildImportExecutionIdempotencyKey({
      ownerId,
      sourceDigest: executionPreflight.rows[0]?.executionSourceEvidence?.sourceDigest || null,
      commitPlanDigest: executionPreflight.sourceCommitPlanDigest,
      preflightDigest: executionPreflight.preflightDigest,
      contractVersion: IMPORT_EXECUTION_CONTRACT_VERSION,
      contractDigest: contract.contractDigest,
    });
    return transaction(async (client) => {
      const summary = summarizeRows(executionPreflight.rows);
      let batchResult;
      try {
        batchResult = await client.query(
          `
            INSERT INTO inventory_import_batches (
              idempotency_key, owner_id, source_digest, commit_plan_digest, preflight_digest,
              contract_version, status, total_rows, created_product_count, existing_product_count,
              stock_applied_count, blocked_or_failed_count, started_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, $10, 0, NOW())
            RETURNING id
          `,
          [
            idempotencyKey,
            ownerId,
            executionPreflight.rows[0]?.executionSourceEvidence?.sourceDigest || null,
            executionPreflight.sourceCommitPlanDigest,
            executionPreflight.preflightDigest,
            IMPORT_EXECUTION_CONTRACT_VERSION,
            summary.totalRows,
            summary.createdProductCount,
            summary.existingProductCount,
            summary.stockAppliedCount,
          ]
        );
      } catch (error) {
        if (error?.code === '23505') {
          fail(EXECUTION_REPOSITORY_ERROR_CODES.CONFLICT, 'Inventory import execution has already been committed.', 'idempotencyKey');
        }
        throw error;
      }
      const batchId = batchResult.rows[0].id;
      const rowResults = [];
      for (const row of [...executionPreflight.rows].sort((left, right) => left.sourceRowNumber - right.sourceRowNumber)) {
        const policy = assertSupportedRow(row);
        let result;
        if (row.originalProductAction === PRODUCT_ACTIONS.CREATE_PRODUCT) {
          result = await createProductInTransaction(client, row, actorId, policy);
        } else if (row.originalProductAction === PRODUCT_ACTIONS.USE_EXISTING_PRODUCT) {
          const productId = await assertExistingProduct(client, row);
          result = { productId, movementId: null, quantity: null };
        } else {
          fail(EXECUTION_REPOSITORY_ERROR_CODES.UNSUPPORTED_ACTION, 'Inventory import execution action is unsupported.', 'rows');
        }
        if (policy.strategy === IMPORT_EXECUTION_STOCK_STRATEGIES.NO_STOCK) result.quantity = null;
        rowResults.push(
          await insertRowResult(client, batchId, row, {
            ...result,
            status: IMPORT_EXECUTION_ROW_STATUSES.COMMITTED,
          })
        );
      }
      await client.query(
        "UPDATE inventory_import_batches SET status = 'COMMITTED', completed_at = NOW(), updated_at = NOW() WHERE id = $1",
        [batchId]
      );
      await client.query(
        `
          INSERT INTO activity_logs (user_id, action, status, message, metadata)
          VALUES ($1, 'inventory.import.execute', 'success', 'Inventory import executed', $2::jsonb)
        `,
        [
          actorId,
          JSON.stringify({
            batchId,
            preflightDigest: executionPreflight.preflightDigest,
            totalRows: summary.totalRows,
            createdProductCount: summary.createdProductCount,
            stockAppliedCount: summary.stockAppliedCount,
          }),
        ]
      );
      validateImportBatchRecord({
        batchId,
        idempotencyKey,
        ownerId,
        sourceDigest: executionPreflight.rows[0]?.executionSourceEvidence?.sourceDigest || null,
        commitPlanDigest: executionPreflight.sourceCommitPlanDigest,
        preflightDigest: executionPreflight.preflightDigest,
        contractVersion: IMPORT_EXECUTION_CONTRACT_VERSION,
        status: IMPORT_EXECUTION_STATUSES.COMMITTED,
        totalRows: summary.totalRows,
        createdProductCount: summary.createdProductCount,
        existingProductCount: summary.existingProductCount,
        stockAppliedCount: summary.stockAppliedCount,
        blockedOrFailedCount: 0,
      });
      return createInventoryImportExecutionResult({
        batchId,
        idempotencyKey,
        ownerId,
        sourcePreflightSessionId: executionPreflightSessionId,
        preflightDigest: executionPreflight.preflightDigest,
        commitPlanDigest: executionPreflight.sourceCommitPlanDigest,
        sourceDigest: executionPreflight.rows[0]?.executionSourceEvidence?.sourceDigest || null,
        contractVersion: IMPORT_EXECUTION_CONTRACT_VERSION,
        contractDigest: contract.contractDigest,
        status: IMPORT_EXECUTION_STATUSES.COMMITTED,
        committedAt: new Date().toISOString(),
        summary,
        rowResults,
        auditPersisted: true,
      });
    });
  }

  return Object.freeze({ executePreflight });
}

const defaultRepository = createInventoryImportExecutionRepository();

module.exports = {
  EXECUTION_REPOSITORY_ERROR_CODES,
  InventoryImportExecutionRepositoryError,
  createInventoryImportExecutionRepository,
  executePreflight: defaultRepository.executePreflight,
};
