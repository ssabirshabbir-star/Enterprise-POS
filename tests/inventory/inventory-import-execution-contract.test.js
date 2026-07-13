const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  PRODUCT_ACTIONS,
  STOCK_ACTIONS,
} = require('../../src/main/features/inventory/inventory-import-commit-plan.model');
const {
  IMPORT_EXECUTION_CONTRACT_ERROR_CODES,
  IMPORT_EXECUTION_CONTRACT_VERSION,
  IMPORT_EXECUTION_POLICY_CODES,
  IMPORT_EXECUTION_STOCK_STRATEGIES,
  createInventoryImportExecutionContract,
  findExecutionStockPolicy,
  requireSupportedExecutionCombination,
  validateInventoryImportExecutionContract,
} = require('../../src/main/features/inventory/inventory-import-execution-contract.model');
const {
  IMPORT_EXECUTION_ROW_STATUSES,
  IMPORT_EXECUTION_STATUSES,
  buildImportExecutionIdempotencyKey,
  validateImportBatchRecord,
  validateImportRowResultRecord,
} = require('../../src/main/features/inventory/inventory-import-execution-record.model');

const root = path.join(__dirname, '..', '..');
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);

test('Phase 5I-A execution contract certifies new-product INITIAL_STOCK and rejects existing-product opening stock', () => {
  const contract = createInventoryImportExecutionContract();
  assert.equal(contract.kind, 'inventory_import_execution_contract');
  assert.equal(contract.version, IMPORT_EXECUTION_CONTRACT_VERSION);
  assert.equal(contract.requirements.transaction, true);
  assert.equal(contract.requirements.replayProtection, true);
  assert.equal(contract.requirements.auditPersistence, true);
  assert.equal(contract.requirements.noSkuGeneration, true);
  assert.equal(contract.requirements.noBarcodeGeneration, true);
  assert.equal(contract.batchPolicy.atomic, true);
  assert.equal(contract.batchPolicy.partialExecution, false);

  const newProductStock = findExecutionStockPolicy(PRODUCT_ACTIONS.CREATE_PRODUCT, STOCK_ACTIONS.APPLY_OPENING_STOCK);
  assert.equal(newProductStock.strategy, IMPORT_EXECUTION_STOCK_STRATEGIES.PRODUCT_INITIAL_STOCK);
  assert.equal(newProductStock.movementType, 'INITIAL_STOCK');
  assert.equal(newProductStock.referenceType, 'product.create');
  assert.equal(newProductStock.doubleApplicationAllowed, false);

  const existingProductStock = findExecutionStockPolicy(PRODUCT_ACTIONS.USE_EXISTING_PRODUCT, STOCK_ACTIONS.APPLY_OPENING_STOCK);
  assert.equal(existingProductStock.strategy, IMPORT_EXECUTION_STOCK_STRATEGIES.UNSUPPORTED);
  assert.equal(existingProductStock.reasonCode, IMPORT_EXECUTION_POLICY_CODES.EXISTING_PRODUCT_OPENING_STOCK_UNSUPPORTED);
  assert.throws(
    () => requireSupportedExecutionCombination(PRODUCT_ACTIONS.USE_EXISTING_PRODUCT, STOCK_ACTIONS.APPLY_OPENING_STOCK),
    { code: IMPORT_EXECUTION_CONTRACT_ERROR_CODES.UNSUPPORTED_COMBINATION }
  );

  assert.equal(validateInventoryImportExecutionContract(contract), contract);
  assert(Object.isFrozen(contract));
  assert(Object.isFrozen(contract.supportedStockCombinations[0]));
});

test('Phase 5I-A execution contract is deterministic and has no mutation dependencies', () => {
  const first = createInventoryImportExecutionContract();
  const second = createInventoryImportExecutionContract();
  assert.deepEqual(first, second);
  assert.equal(first.contractDigest, second.contractDigest);
  assert.throws(
    () => createInventoryImportExecutionContract({ supportedProductActions: [] }),
    { code: IMPORT_EXECUTION_CONTRACT_ERROR_CODES.INVALID_CONTRACT }
  );

  const files = [
    'src/main/features/inventory/inventory-import-execution-contract.model.js',
    'src/main/features/inventory/inventory-import-execution-record.model.js',
  ];
  const source = files.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /product\.service|inventory\.service|stock_movements|withTransaction|ipcRenderer|BrowserWindow|dialog/);
  assert.doesNotMatch(source, /generateSku|generateBarcode|createProduct\(|adjustStock\(|executeImport|commitImport|finalizeImport/);
});

test('Phase 5I-A idempotency key uses trusted digests and excludes random session state', () => {
  const first = buildImportExecutionIdempotencyKey({
    ownerId: 10,
    sourceDigest: DIGEST_A,
    commitPlanDigest: DIGEST_B,
    preflightDigest: DIGEST_C,
    randomSessionId: 'inventory-import-execution-preflight-random',
  });
  const equivalent = buildImportExecutionIdempotencyKey({
    ownerId: 10,
    sourceDigest: DIGEST_A,
    commitPlanDigest: DIGEST_B,
    preflightDigest: DIGEST_C,
    randomSessionId: 'different-random-session',
  });
  const changedPreflight = buildImportExecutionIdempotencyKey({
    ownerId: 10,
    sourceDigest: DIGEST_A,
    commitPlanDigest: DIGEST_B,
    preflightDigest: 'd'.repeat(64),
  });
  const changedOwner = buildImportExecutionIdempotencyKey({
    ownerId: 11,
    sourceDigest: DIGEST_A,
    commitPlanDigest: DIGEST_B,
    preflightDigest: DIGEST_C,
  });
  assert.match(first, /^inventory-import-execution-[0-9a-f]{64}$/);
  assert.equal(first, equivalent);
  assert.notEqual(first, changedPreflight);
  assert.notEqual(first, changedOwner);
});

test('Phase 5I-A record contracts validate batch and row-result evidence only', () => {
  const idempotencyKey = buildImportExecutionIdempotencyKey({
    ownerId: 10,
    sourceDigest: DIGEST_A,
    commitPlanDigest: DIGEST_B,
    preflightDigest: DIGEST_C,
  });
  const batch = validateImportBatchRecord({
    batchId: 1,
    idempotencyKey,
    ownerId: 10,
    sourceDigest: DIGEST_A,
    commitPlanDigest: DIGEST_B,
    preflightDigest: DIGEST_C,
    contractVersion: IMPORT_EXECUTION_CONTRACT_VERSION,
    status: IMPORT_EXECUTION_STATUSES.PENDING,
    totalRows: 2,
    createdProductCount: 1,
    existingProductCount: 1,
    stockAppliedCount: 1,
    blockedOrFailedCount: 0,
  });
  assert(Object.isFrozen(batch));
  assert.equal(batch.status, IMPORT_EXECUTION_STATUSES.PENDING);

  const row = validateImportRowResultRecord({
    rowResultId: 1,
    batchId: 1,
    sourceRowNumber: 2,
    productAction: PRODUCT_ACTIONS.CREATE_PRODUCT,
    resultingProductId: null,
    stockAction: STOCK_ACTIONS.APPLY_OPENING_STOCK,
    resultingStockMovementId: null,
    quantity: '5.000',
    status: IMPORT_EXECUTION_ROW_STATUSES.PENDING,
    resultCode: null,
  });
  assert(Object.isFrozen(row));
  assert.equal(row.quantity, '5.000');
  assert.throws(() => validateImportBatchRecord({ ...batch, status: 'DONE' }));
  assert.throws(() => validateImportRowResultRecord({ ...row, status: 'DONE' }));
});

test('Phase 5I-A schema foundation defines batch, row-result, and replay constraints without raw CSV storage', () => {
  const schema = fs.readFileSync(path.join(root, 'src/main/database/schema.js'), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS inventory_import_batches/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS inventory_import_row_results/);
  assert.match(schema, /idx_inventory_import_batches_idempotency/);
  assert.match(schema, /UNIQUE INDEX IF NOT EXISTS idx_inventory_import_batches_idempotency/);
  assert.match(schema, /batch_id BIGINT NOT NULL REFERENCES inventory_import_batches\(id\) ON DELETE CASCADE/);
  assert.match(schema, /preflight_digest VARCHAR\(64\) NOT NULL/);
  assert.match(schema, /commit_plan_digest VARCHAR\(64\) NOT NULL/);
  assert.match(schema, /contract_version VARCHAR\(80\) NOT NULL/);
  assert.doesNotMatch(schema, /raw_csv|csv_content|file_content/i);
});

test('Phase 5I-A keeps runtime execution surfaces absent', () => {
  const controller = fs.readFileSync(path.join(root, 'src/main/features/inventory/inventory.controller.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/main/preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/main/features/inventory/inventory.renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/main/features/inventory/index.html'), 'utf8');
  assert.doesNotMatch(controller, /\/inventory\/import\/(execute|finalize|apply|import-now|rollback)/i);
  assert.doesNotMatch(controller, /\/inventory\/import\/commit(?!-plan)/i);
  assert.doesNotMatch(preload, /executeImport|commitImport|finalizeImport|applyImport|rollbackImport/);
  assert.doesNotMatch(renderer, /executeImport|commitImport|finalizeImport|applyImport|rollbackImport/);
  assert.doesNotMatch(html, /Execute Import|Finalize Import|Commit Import|Import Now/);
});
