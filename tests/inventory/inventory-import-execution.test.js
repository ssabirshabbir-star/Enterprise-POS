const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  PRODUCT_ACTIONS,
  STOCK_ACTIONS,
  createInventoryImportCommitPlanDocument,
} = require('../../src/main/features/inventory/inventory-import-commit-plan.model');
const {
  createInventoryImportExecutionPreflightDocument,
} = require('../../src/main/features/inventory/inventory-import-execution-preflight.model');
const {
  createInventoryImportExecutionPreflightSessionService,
} = require('../../src/main/features/inventory/inventory-import-execution-preflight-session.service');
const {
  createInventoryImportExecutionContract,
} = require('../../src/main/features/inventory/inventory-import-execution-contract.model');
const {
  EXECUTION_REPOSITORY_ERROR_CODES,
  createInventoryImportExecutionRepository,
} = require('../../src/main/features/inventory/inventory-import-execution.repository');
const {
  createInventoryImportExecutionResult,
} = require('../../src/main/features/inventory/inventory-import-execution-result.model');
const {
  IMPORT_EXECUTION_WORKFLOW_ERROR_CODES,
  createInventoryImportExecutionWorkflowService,
} = require('../../src/main/features/inventory/inventory-import-execution-workflow.service');
const {
  createInventoryImportMatchedPreviewDocument,
} = require('../../src/main/features/inventory/inventory-import-matched-preview.model');

const root = path.join(__dirname, '..', '..');
const COMMIT_PLAN_SESSION_ID = 'inventory-import-commit-plan-44444444-4444-4444-8444-444444444444';
const PREFLIGHT_SESSION_ID = 'inventory-import-execution-preflight-55555555-5555-4555-8555-555555555555';

function matchedRow({
  sourceRowNumber = 1,
  sku = `IMPORT-${sourceRowNumber}`,
  barcode = `IMPBAR${sourceRowNumber}`,
  productAction = 'new',
  openingQuantity = '2.000',
  matchedProduct = null,
} = {}) {
  const existing = productAction === 'existing';
  return {
    sourceRowNumber,
    phase3Row: {
      sourceRowNumber,
      status: openingQuantity === '0' ? 'PRODUCT_ONLY_CANDIDATE' : 'STOCK_ROW_CANDIDATE',
      normalized: {
        productName: `Import Product ${sourceRowNumber}`,
        sku,
        barcode,
        category: '',
        brand: '',
        unit: '',
        variant: '',
        costPrice: '10.00',
        sellingPrice: '12.00',
        wholesalePrice: '0',
        openingQuantity,
        minimumStock: '0',
        active: true,
        trackExpiry: false,
        expiryRequired: false,
        expiryAlertDays: null,
        allowPriceChange: false,
      },
      errors: [],
      warnings: [],
    },
    classification: existing ? 'EXISTING_PRODUCT_CANDIDATE' : 'POTENTIAL_NEW_PRODUCT',
    status: 'MATCHING_ELIGIBLE',
    eligible: true,
    matchedBy: existing ? 'SKU' : 'NONE',
    matchedProduct,
    evidence: {
      normalizedSku: String(sku || '').toLowerCase(),
      normalizedBarcode: String(barcode || '').toLowerCase(),
      skuMatchProductIds: existing ? [matchedProduct.productId] : [],
      barcodeMatchProductIds: [],
      catalogResolution: {
        category: { supplied: false, normalizedName: '', resolvedId: null, matches: [] },
        brand: { supplied: false, normalizedName: '', resolvedId: null, matches: [] },
        unit: { supplied: false, normalizedName: '', resolvedId: null, matches: [] },
        variant: { supplied: false, normalizedName: '', resolvedId: null, matches: [] },
      },
      inventoryTargetId: existing ? 101 : null,
      movementCount: 0,
      latestMovementAt: null,
      canAdjustInventory: true,
      canCreateProduct: true,
    },
    matchingFindings: [],
  };
}

function matchedProduct() {
  return {
    kind: 'inventory_import_product_match',
    productId: 10,
    sku: 'EXIST-10',
    normalizedSku: 'exist-10',
    barcode: 'EXISTBAR10',
    normalizedBarcode: 'existbar10',
    productName: 'Existing Product',
    category: null,
    brand: null,
    unit: null,
    variant: null,
    costPrice: '10.00',
    sellingPrice: '12.00',
    wholesalePrice: '0',
    active: true,
    deleted: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function commitPlan(rows) {
  const matchedPreview = createInventoryImportMatchedPreviewDocument({
    sourcePreviewSessionId: 'inventory-import-preview-11111111-1111-4111-8111-111111111111',
    sourcePreviewId: 'inventory-import-preview-document-22222222-2222-4222-8222-222222222222',
    sourceDocumentVersion: 'inventory-import-v1',
    matchedAt: '2026-01-01T00:00:00.000Z',
    sourceBasename: 'inventory.csv',
    sourceRowCount: rows.length,
    matchingAnalysis: {
      kind: 'inventory_import_matching_analysis',
      schemaVersion: 1,
      immutable: true,
      databaseWrite: false,
      commitReady: false,
      summary: { totalRows: rows.length },
      rows,
    },
  });
  return createInventoryImportCommitPlanDocument({
    matchedPreviewSessionId: 'inventory-import-matched-preview-33333333-3333-4333-8333-333333333333',
    matchedPreviewDocument: matchedPreview,
  });
}

function preflight(rows = [matchedRow()]) {
  return createInventoryImportExecutionPreflightDocument({
    commitPlan: commitPlan(rows),
    commitPlanSessionId: COMMIT_PLAN_SESSION_ID,
    createdAt: '2026-01-02T00:00:00.000Z',
    preflightId: 'inventory-import-execution-preflight-document-66666666-6666-4666-8666-666666666666',
    permissionContext: { canAdjustInventory: true, canCreateProduct: true },
    currentState: {
      products: rows
        .filter((row) => row.matchedProduct)
        .map((row) => ({
          productId: row.matchedProduct.productId,
          sku: row.matchedProduct.sku,
          normalizedSku: row.matchedProduct.normalizedSku,
          barcode: row.matchedProduct.barcode,
          normalizedBarcode: row.matchedProduct.normalizedBarcode,
          productName: row.matchedProduct.productName,
          active: true,
          deleted: false,
          updatedAt: row.matchedProduct.updatedAt,
        })),
      catalogs: { category: [], brand: [], unit: [], variant: [] },
      defaultWarehouse: {
        warehouseId: 1,
        name: 'Main Warehouse',
        active: true,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      inventoryTargets: rows
        .filter((row) => row.matchedProduct)
        .map((row) => ({
          inventoryId: 100 + row.matchedProduct.productId,
          productId: row.matchedProduct.productId,
          warehouseId: 1,
          quantity: '0',
          updatedAt: '2026-01-01T00:00:00.000Z',
        })),
      movementSummaries: rows
        .filter((row) => row.matchedProduct)
        .map((row) => ({ productId: row.matchedProduct.productId, movementCount: 0, latestMovementAt: null })),
    },
  });
}

function authFor(profile = { id: 10, role: 'Admin' }) {
  return { async getProfile() { return profile ? { ok: true, profile } : { ok: false }; } };
}

class FakeClient {
  constructor(options = {}) {
    this.options = options;
    this.queries = [];
    this.ids = { product: 100, movement: 200, row: 300 };
  }
  async query(sql, params = []) {
    this.queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (/INSERT INTO inventory_import_batches/i.test(sql)) {
      if (this.options.replay) {
        const error = new Error('duplicate');
        error.code = '23505';
        throw error;
      }
      return { rows: [{ id: 50 }] };
    }
    if (/FROM products WHERE deleted_at IS NULL/i.test(sql)) return { rows: [] };
    if (/FROM warehouses WHERE id = \$1/i.test(sql)) return { rows: [{ id: params[0], name: 'Main Warehouse', is_active: true, deleted_at: null }] };
    if (/INSERT INTO products/i.test(sql)) {
      if (this.options.failProductInsert) throw new Error('product insert failed');
      return { rows: [{ id: this.ids.product++ }] };
    }
    if (/INSERT INTO inventory /i.test(sql)) return { rows: [] };
    if (/INSERT INTO stock_movements/i.test(sql)) return { rows: [{ id: this.ids.movement++ }] };
    if (/INSERT INTO inventory_import_row_results/i.test(sql)) return { rows: [{ id: this.ids.row++ }] };
    if (/UPDATE inventory_import_batches/i.test(sql)) return { rows: [] };
    if (/INSERT INTO activity_logs/i.test(sql)) return { rows: [{ id: 1 }] };
    if (/SELECT id, sku, barcode, name, is_active, deleted_at FROM products/i.test(sql)) {
      return { rows: [{ id: 10, sku: 'EXIST-10', barcode: 'EXISTBAR10', name: 'Existing Product', is_active: true, deleted_at: null }] };
    }
    return { rows: [] };
  }
}

function repositoryWithClient(client) {
  const events = [];
  return {
    events,
    repository: createInventoryImportExecutionRepository({
      withTransaction: async (callback) => {
        events.push('BEGIN');
        try {
          const result = await callback(client);
          events.push('COMMIT');
          return result;
        } catch (error) {
          events.push('ROLLBACK');
          throw error;
        }
      },
    }),
  };
}

test('Phase 5I workflow strictly validates input, authority, digest, and consumes preflight only after commit', async () => {
  const document = preflight();
  const contract = createInventoryImportExecutionContract();
  const preflightSessions = createInventoryImportExecutionPreflightSessionService({
    now: () => 1000,
    sessionIdFactory: () => PREFLIGHT_SESSION_ID,
    documentIdFactory: () => 'inventory-import-execution-preflight-document-77777777-7777-4777-8777-777777777777',
  });
  const plan = commitPlan([matchedRow()]);
  const created = preflightSessions.createExecutionPreflightSession({
    ownerId: 10,
    commitPlan: plan,
    commitPlanSessionId: COMMIT_PLAN_SESSION_ID,
    permissionContext: { canAdjustInventory: true, canCreateProduct: true },
    currentState: {
      products: [],
      catalogs: { category: [], brand: [], unit: [], variant: [] },
      defaultWarehouse: { warehouseId: 1, name: 'Main Warehouse', active: true, updatedAt: '2026-01-01T00:00:00.000Z' },
      inventoryTargets: [],
      movementSummaries: [],
    },
  });
  assert.equal(created.ok, true);
  const storedDocument = created.executionPreflight;

  const workflow = createInventoryImportExecutionWorkflowService({
    authService: authFor(),
    executionPreflightSessionService: preflightSessions,
    executionRepository: {
      async executePreflight(input) {
        assert.equal(input.executionPreflight, storedDocument);
        return createInventoryImportExecutionResult({
          batchId: 50,
          idempotencyKey: 'inventory-import-execution-' + 'a'.repeat(64),
          ownerId: 10,
          sourcePreflightSessionId: PREFLIGHT_SESSION_ID,
          preflightDigest: storedDocument.preflightDigest,
          commitPlanDigest: storedDocument.sourceCommitPlanDigest,
          sourceDigest: null,
          contractVersion: contract.version,
          contractDigest: contract.contractDigest,
          status: 'COMMITTED',
          committedAt: '2026-01-02T00:00:00.000Z',
          summary: { totalRows: 1, createdProductCount: 1, existingProductCount: 0, stockAppliedCount: 1, skippedCount: 0 },
          rowResults: [{ rowResultId: 1, sourceRowNumber: 1, productAction: PRODUCT_ACTIONS.CREATE_PRODUCT, stockAction: STOCK_ACTIONS.APPLY_OPENING_STOCK, resultingProductId: 100, resultingStockMovementId: 200, quantity: '2.000', status: 'COMMITTED', resultCode: null }],
          auditPersisted: true,
        });
      },
    },
  });
  assert.equal((await workflow.executeCertifiedImport({ sessionId: PREFLIGHT_SESSION_ID, expectedPreflightDigest: storedDocument.preflightDigest, ownerId: 1 })).code, IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.INVALID_REQUEST);
  assert.equal((await workflow.executeCertifiedImport({ sessionId: PREFLIGHT_SESSION_ID, expectedPreflightDigest: 'b'.repeat(64) })).code, IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.PREFLIGHT_NOT_READY);
  const result = await workflow.executeCertifiedImport({
    sessionId: PREFLIGHT_SESSION_ID,
    expectedPreflightDigest: storedDocument.preflightDigest,
    expectedContractDigest: contract.contractDigest,
  });
  assert.equal(result.ok, true);
  assert.equal(result.transactionCommitted, true);
  assert.equal(preflightSessions.getExecutionPreflightSession({ ownerId: 10, sessionId: PREFLIGHT_SESSION_ID }).ok, false);
});

test('Phase 5I repository executes certified new-product initial stock once in one transaction', async () => {
  const document = preflight();
  const client = new FakeClient();
  const { repository, events } = repositoryWithClient(client);
  const result = await repository.executePreflight({
    executionPreflight: document,
    executionPreflightSessionId: PREFLIGHT_SESSION_ID,
    ownerId: 10,
    actorId: 10,
  });
  assert.equal(result.transactionCommitted, true);
  assert.equal(result.summary.createdProductCount, 1);
  assert.equal(result.summary.stockAppliedCount, 1);
  assert.deepEqual(events, ['BEGIN', 'COMMIT']);
  assert.equal(client.queries.filter((query) => /INSERT INTO products/i.test(query.sql)).length, 1);
  assert.equal(client.queries.filter((query) => /INSERT INTO inventory /i.test(query.sql)).length, 1);
  assert.equal(client.queries.filter((query) => /INSERT INTO stock_movements/i.test(query.sql)).length, 1);
  const movementQuery = client.queries.find((query) => /INSERT INTO stock_movements/i.test(query.sql));
  assert.equal(movementQuery.params.includes('INITIAL_STOCK'), true);
  assert.equal(movementQuery.params.includes('product.create'), true);
  assert.equal(movementQuery.params.includes('Opening stock'), true);
  assert.equal(client.queries.filter((query) => /inventory_import_batches/i.test(query.sql) && /INSERT/i.test(query.sql)).length, 1);
  assert.equal(client.queries.filter((query) => /inventory_import_row_results/i.test(query.sql) && /INSERT/i.test(query.sql)).length, 1);
  assert.equal(client.queries.some((query) => String(query.params).includes('IMPORT-1')), true);
  assert.equal(client.queries.some((query) => String(query.params).includes('IMPBAR1')), true);
});

test('Phase 5I repository supports existing-product no-stock rows without product recreation', async () => {
  const document = preflight([
    matchedRow({ productAction: 'existing', matchedProduct: matchedProduct(), sku: 'EXIST-10', barcode: '', openingQuantity: '0' }),
  ]);
  const client = new FakeClient();
  const { repository } = repositoryWithClient(client);
  const result = await repository.executePreflight({
    executionPreflight: document,
    executionPreflightSessionId: PREFLIGHT_SESSION_ID,
    ownerId: 10,
    actorId: 10,
  });
  assert.equal(result.summary.existingProductCount, 1);
  assert.equal(result.summary.stockAppliedCount, 0);
  assert.equal(client.queries.filter((query) => /INSERT INTO products/i.test(query.sql)).length, 0);
  assert.equal(client.queries.filter((query) => /INSERT INTO stock_movements/i.test(query.sql)).length, 0);
});

test('Phase 5I repository rolls back on stale state and database-backed replay conflict', async () => {
  const staleClient = new FakeClient({ failProductInsert: true });
  const stale = repositoryWithClient(staleClient);
  await assert.rejects(
    () => stale.repository.executePreflight({ executionPreflight: preflight(), executionPreflightSessionId: PREFLIGHT_SESSION_ID, ownerId: 10, actorId: 10 }),
    /product insert failed/
  );
  assert.deepEqual(stale.events, ['BEGIN', 'ROLLBACK']);

  const replayClient = new FakeClient({ replay: true });
  const replay = repositoryWithClient(replayClient);
  await assert.rejects(
    () => replay.repository.executePreflight({ executionPreflight: preflight(), executionPreflightSessionId: PREFLIGHT_SESSION_ID, ownerId: 10, actorId: 10 }),
    { code: EXECUTION_REPOSITORY_ERROR_CODES.CONFLICT }
  );
  assert.deepEqual(replay.events, ['BEGIN', 'ROLLBACK']);
  assert.equal(replayClient.queries.filter((query) => /INSERT INTO products/i.test(query.sql)).length, 0);
});

test('Phase 5K runtime execution remains protected behind certified renderer workflow wiring', () => {
  const preload = fs.readFileSync(path.join(root, 'src/main/preload.js'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'src/main/features/inventory/inventory.api.js'), 'utf8');
  const controller = fs.readFileSync(path.join(root, 'src/main/features/inventory/inventory.controller.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/main/features/inventory/inventory.renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/main/features/inventory/index.html'), 'utf8');
  assert.match(preload, /executeCertifiedImport/);
  assert.match(api, /executeCertifiedImport/);
  assert.match(controller, /\/inventory\/import\/execution\/certified/);
  assert.match(renderer, /InventoryApi[\s\S]*executeCertifiedImport|api\(\)\.executeCertifiedImport/);
  assert.doesNotMatch(renderer, /\/inventory\/import\/execution\/certified|window\.posApi|ipcRenderer|executeImport|commitImport|finalizeImport|applyImport/);
  assert.match(html, /id="executeInventoryImportButton"[^>]*disabled/);
  assert.doesNotMatch(html, /Execute Import|Finalize Import|Commit Import|Import Now/);
});

test('Phase 5J controller exposes certified execution through strict workflow delegation only', async () => {
  const controllerPath = path.join(root, 'src/main/features/inventory/inventory.controller.js');
  const originalLoad = Module._load;
  const calls = [];
  const handlers = new Map();
  const committedResult = createInventoryImportExecutionResult({
    batchId: 50,
    idempotencyKey: 'inventory-import-execution-' + 'a'.repeat(64),
    ownerId: 10,
    sourcePreflightSessionId: PREFLIGHT_SESSION_ID,
    preflightDigest: 'b'.repeat(64),
    commitPlanDigest: 'c'.repeat(64),
    sourceDigest: null,
    contractVersion: 'inventory-import-execution-contract-v1',
    contractDigest: 'd'.repeat(64),
    status: 'COMMITTED',
    committedAt: '2026-01-02T00:00:00.000Z',
    summary: { totalRows: 1, createdProductCount: 1, existingProductCount: 0, stockAppliedCount: 1, skippedCount: 0 },
    rowResults: [{ rowResultId: 1, sourceRowNumber: 1, productAction: PRODUCT_ACTIONS.CREATE_PRODUCT, stockAction: STOCK_ACTIONS.APPLY_OPENING_STOCK, resultingProductId: 100, resultingStockMovementId: 200, quantity: '2.000', status: 'COMMITTED', resultCode: null }],
    auditPersisted: true,
  });
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename === controllerPath && request === './inventory-import-execution-workflow.service') {
      return {
        executeCertifiedImport: async (payload) => {
          calls.push(payload);
          if (payload.sessionId === 'replay') return { ok: false, code: IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.REPLAY_CONFLICT, message: 'Inventory import execution has already been committed.' };
          if (payload.sessionId === 'stale') return { ok: false, code: IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.PREFLIGHT_NOT_READY, message: 'Execution preflight is not commit ready.' };
          return { ok: true, executionResult: committedResult, lifecycleWarning: 'Execution committed, but preflight session cleanup could not be confirmed.' };
        },
      };
    }
    if (parent?.filename === controllerPath && request.startsWith('./inventory')) {
      return new Proxy({}, { get: () => async () => ({ ok: true }) });
    }
    if (request === 'electron') return { BrowserWindow: { fromWebContents: () => ({}) }, dialog: { showOpenDialog: async () => ({ canceled: true }) } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[controllerPath];
    require(controllerPath).registerInventoryRoutes({ handle: (route, handler) => handlers.set(route, handler) });
    const handler = handlers.get('/inventory/import/execution/certified');
    assert.equal(typeof handler, 'function');
    const payload = { sessionId: PREFLIGHT_SESSION_ID, expectedPreflightDigest: 'b'.repeat(64), expectedContractDigest: 'd'.repeat(64) };
    const result = await handler({}, payload);
    assert.equal(result.ok, true);
    assert.equal(result.executionResult, committedResult);
    assert.equal(result.lifecycleWarning, 'Execution committed, but preflight session cleanup could not be confirmed.');
    assert.deepEqual(calls, [payload]);

    const rejectedPayloads = [
      { ...payload, ownerId: 10 },
      { ...payload, permissions: ['inventory.adjust'] },
      { ...payload, rows: [] },
      { ...payload, productAction: PRODUCT_ACTIONS.CREATE_PRODUCT },
      { ...payload, stockAction: STOCK_ACTIONS.APPLY_OPENING_STOCK },
      { ...payload, warehouseId: 1 },
      { ...payload, quantity: '2.000' },
      { ...payload, actorId: 10 },
      { ...payload, callback: () => null },
      Object.assign(Object.create({ inherited: true }), payload),
    ];
    for (const bad of rejectedPayloads) {
      const response = await handler({}, bad);
      assert.equal(response.ok, false);
      assert.equal(response.message, 'Invalid inventory import execution request.');
    }
    assert.equal(calls.length, 1);

    assert.equal((await handler({}, { sessionId: 'replay', expectedPreflightDigest: 'b'.repeat(64) })).code, IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.REPLAY_CONFLICT);
    assert.equal((await handler({}, { sessionId: 'stale', expectedPreflightDigest: 'b'.repeat(64) })).code, IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.PREFLIGHT_NOT_READY);
    assert.equal(calls.length, 3);

    await Promise.all([
      handler({}, { sessionId: 'one', expectedPreflightDigest: 'b'.repeat(64) }),
      handler({}, { sessionId: 'two', expectedPreflightDigest: 'b'.repeat(64) }),
    ]);
    assert.equal(calls.length, 5);
  } finally {
    Module._load = originalLoad;
    delete require.cache[controllerPath];
  }
});

test('Phase 5J preload and Inventory API expose one narrow certified execution method for Phase 5K renderer wiring', async () => {
  const preloadSource = fs.readFileSync(path.join(root, 'src/main/preload.js'), 'utf8');
  const apiSource = fs.readFileSync(path.join(root, 'src/main/features/inventory/inventory.api.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/main/features/inventory/inventory.renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/main/features/inventory/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'src/main/features/inventory/inventory.css'), 'utf8');
  const invocations = [];
  const payload = { sessionId: PREFLIGHT_SESSION_ID, expectedPreflightDigest: 'b'.repeat(64), expectedContractDigest: 'd'.repeat(64) };
  const context = {
    window: {
      posApi: {
        inventory: {
          executeCertifiedImport: async (request) => {
            invocations.push(request);
            return { ok: true, batchId: 50, lifecycleWarning: 'warning' };
          },
        },
      },
    },
  };
  vm.runInNewContext(apiSource, context);
  const result = await context.window.InventoryApi.executeCertifiedImport(payload);
  assert.deepEqual(result, { ok: true, batchId: 50, lifecycleWarning: 'warning' });
  assert.deepEqual(invocations, [payload]);
  assert.match(preloadSource, /executeCertifiedImport:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\('\/inventory\/import\/execution\/certified',\s*payload\)/);
  const inventoryPreloadBlock = preloadSource.slice(preloadSource.indexOf('  inventory: {'), preloadSource.indexOf('  suppliers: {'));
  assert.doesNotMatch(inventoryPreloadBlock, /ipcRenderer\.invoke\([^)]*route|generic|ownerId|permissions|productAction|stockAction|warehouseId|quantity|actorId/);
  assert.match(renderer, /executeCertifiedImport\(request\)/);
  assert.doesNotMatch(renderer, /window\.posApi|ipcRenderer|\/inventory\/import\/execution\/certified|executeImport|commitImport|finalizeImport|applyImport/);
  assert.match(html, /id="executeInventoryImportButton"[^>]*disabled/);
  assert.doesNotMatch(html, /Execute Import|Finalize Import|Commit Import|Import Now/);
  assert.doesNotMatch(css, /import-success|import-error/);
});
