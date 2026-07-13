const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const {
  PRODUCT_ACTIONS,
  STOCK_ACTIONS,
  createInventoryImportCommitPlanDocument,
} = require('../../src/main/features/inventory/inventory-import-commit-plan.model');
const {
  createInventoryImportCommitPlanSessionService,
} = require('../../src/main/features/inventory/inventory-import-commit-plan-session.service');
const {
  PREFLIGHT_REASON_CODES,
  PREFLIGHT_ROW_DISPOSITIONS,
  createInventoryImportExecutionPreflightDocument,
  validateInventoryImportExecutionPreflightDocument,
} = require('../../src/main/features/inventory/inventory-import-execution-preflight.model');
const {
  EXECUTION_PREFLIGHT_SESSION_ID_PATTERN,
  MAX_EXECUTION_PREFLIGHT_SESSIONS,
  createInventoryImportExecutionPreflightSessionService,
} = require('../../src/main/features/inventory/inventory-import-execution-preflight-session.service');
const {
  collectCurrentStateInputs,
  createInventoryImportExecutionPreflightRepository,
} = require('../../src/main/features/inventory/inventory-import-execution-preflight.repository');
const {
  EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES,
  createInventoryImportExecutionPreflightWorkflowService,
} = require('../../src/main/features/inventory/inventory-import-execution-preflight-workflow.service');
const {
  createProductMatch,
  createDefaultWarehouse,
  createInventoryTarget,
  createStockMovementSummary,
  createCatalogMatch,
} = require('../../src/main/features/inventory/inventory-import-matching.contract');
const {
  createInventoryImportMatchedPreviewDocument,
} = require('../../src/main/features/inventory/inventory-import-matched-preview.model');

const root = path.join(__dirname, '..', '..');
const MATCHED_PREVIEW_SESSION_ID = 'inventory-import-matched-preview-33333333-3333-4333-8333-333333333333';
const COMMIT_PLAN_SESSION_ID = 'inventory-import-commit-plan-44444444-4444-4444-8444-444444444444';

function product(id = 1, overrides = {}) {
  return createProductMatch({
    product_id: id,
    name: `Product ${id}`,
    sku: `SKU-${id}`,
    barcode: `BAR${id}000`,
    purchase_price: '10.00',
    sale_price: '12.00',
    wholesale_price: '0',
    is_active: true,
    deleted_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

function warehouse(overrides = {}) {
  return createDefaultWarehouse({
    id: 7,
    name: 'Main Warehouse',
    is_active: true,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

function inventoryTarget(productId = 1, overrides = {}) {
  return createInventoryTarget({
    id: 100 + productId,
    product_id: productId,
    warehouse_id: 7,
    current_stock: '0',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

function movement(productId = 1, overrides = {}) {
  return createStockMovementSummary({
    product_id: productId,
    movement_count: 0,
    latest_movement_at: null,
    ...overrides,
  });
}

function catalog(type, overrides = {}) {
  return createCatalogMatch(type, {
    id: 10,
    name: 'Grocery',
    is_active: true,
    deleted_at: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

function matchedRow({
  sourceRowNumber = 1,
  matchedProduct = null,
  productAction = 'new',
  openingQuantity = '0',
  sku = `SKU-${sourceRowNumber}`,
  barcode = `BAR${sourceRowNumber}000`,
  categoryName = '',
  categoryId = null,
  evidence = {},
} = {}) {
  const isExisting = productAction === 'existing';
  return {
    sourceRowNumber,
    phase3Row: {
      sourceRowNumber,
      status: openingQuantity === '0' ? 'PRODUCT_ONLY_CANDIDATE' : 'STOCK_ROW_CANDIDATE',
      normalized: {
        productName: `Product ${sourceRowNumber}`,
        sku,
        barcode,
        category: categoryName,
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
    classification: isExisting ? 'EXISTING_PRODUCT_CANDIDATE' : 'POTENTIAL_NEW_PRODUCT',
    status: 'MATCHING_ELIGIBLE',
    eligible: true,
    matchedBy: isExisting ? 'SKU' : 'NONE',
    matchedProduct,
    evidence: {
      normalizedSku: String(sku || '').toLowerCase(),
      normalizedBarcode: String(barcode || '').toLowerCase(),
      skuMatchProductIds: isExisting ? [matchedProduct.productId] : [],
      barcodeMatchProductIds: [],
      catalogResolution: {
        category: {
          supplied: Boolean(categoryName),
          normalizedName: categoryName ? String(categoryName).toLowerCase() : '',
          resolvedId: categoryId,
          matches: categoryId
            ? [{ id: categoryId, name: categoryName, active: true, deleted: false, updatedAt: '2026-01-01T00:00:00.000Z' }]
            : [],
        },
        brand: { supplied: false, normalizedName: '', resolvedId: null, matches: [], findings: [] },
        unit: { supplied: false, normalizedName: '', resolvedId: null, matches: [], findings: [] },
        variant: { supplied: false, normalizedName: '', resolvedId: null, matches: [], findings: [] },
      },
      inventoryTargetId: evidence.inventoryTargetId || null,
      movementCount: evidence.movementCount || 0,
      latestMovementAt: evidence.latestMovementAt || null,
      canAdjustInventory: evidence.canAdjustInventory !== false,
      canCreateProduct: evidence.canCreateProduct !== false,
    },
    matchingFindings: [],
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
    matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
    matchedPreviewDocument: matchedPreview,
  });
}

function currentState(overrides = {}) {
  return {
    products: [],
    catalogs: { category: [], brand: [], unit: [], variant: [] },
    defaultWarehouse: warehouse(),
    inventoryTargets: [],
    movementSummaries: [],
    ...overrides,
  };
}

function authFor(profile = { id: 10, role: 'Admin' }) {
  return { async getProfile() { return profile ? { ok: true, profile } : { ok: false }; } };
}

test('Phase 5H model creates immutable preflight and revalidates CREATE_PRODUCT conflicts and permissions', () => {
  const plan = commitPlan([
    matchedRow({ sourceRowNumber: 1, sku: 'NEW-1', barcode: 'BARNEW1' }),
    matchedRow({ sourceRowNumber: 2, sku: 'DUP-SKU', barcode: 'FREE-BAR' }),
    matchedRow({ sourceRowNumber: 3, sku: 'FREE-SKU', barcode: 'DUP-BAR' }),
  ]);
  const document = createInventoryImportExecutionPreflightDocument({
    commitPlan: plan,
    commitPlanSessionId: COMMIT_PLAN_SESSION_ID,
    createdAt: '2026-01-02T00:00:00.000Z',
    preflightId: 'inventory-import-execution-preflight-document-55555555-5555-4555-8555-555555555555',
    permissionContext: { canAdjustInventory: true, canCreateProduct: true },
    currentState: currentState({
      products: [
        product(20, { sku: 'DUP-SKU', barcode: 'OTHER' }),
        product(21, { sku: 'OTHER', barcode: 'DUP-BAR' }),
      ],
    }),
  });
  assert.equal(document.databaseWrite, false);
  assert.equal(document.commitReady, false);
  assert.equal(document.rendererAuthoritative, false);
  assert.equal(document.requiresTransaction, true);
  assert.equal(document.rows[0].currentDisposition, PREFLIGHT_ROW_DISPOSITIONS.CURRENTLY_ELIGIBLE);
  assert(document.rows[1].currentBlockReasonCodes.includes(PREFLIGHT_REASON_CODES.SKU_NOW_EXISTS));
  assert(document.rows[2].currentBlockReasonCodes.includes(PREFLIGHT_REASON_CODES.BARCODE_NOW_EXISTS));
  assert.equal(document.summary.currentlyEligibleRows, 1);
  assert.equal(document.summary.blockedRows, 2);
  assert(Object.isFrozen(document));
  assert(Object.isFrozen(document.rows[0]));
  assert.equal(validateInventoryImportExecutionPreflightDocument(document), document);

  const noProductPermission = createInventoryImportExecutionPreflightDocument({
    commitPlan: plan,
    commitPlanSessionId: COMMIT_PLAN_SESSION_ID,
    createdAt: '2026-01-02T00:00:00.000Z',
    preflightId: 'inventory-import-execution-preflight-document-66666666-6666-4666-8666-666666666666',
    permissionContext: { canAdjustInventory: true, canCreateProduct: false },
    currentState: currentState(),
  });
  assert(
    noProductPermission.rows[0].currentBlockReasonCodes.includes(
      PREFLIGHT_REASON_CODES.CURRENT_PRODUCT_CREATE_PERMISSION_REQUIRED
    )
  );
});

test('Phase 5H preserves existing-product semantics and blocks stale matched products without rematching', () => {
  const existing = product(10, { sku: 'EXIST-10', barcode: 'BAR10' });
  const plan = commitPlan([
    matchedRow({ sourceRowNumber: 1, productAction: 'existing', matchedProduct: existing, sku: 'EXIST-10', barcode: '' }),
    matchedRow({ sourceRowNumber: 2, productAction: 'existing', matchedProduct: product(11), sku: 'SKU-11', barcode: 'BAR11000' }),
    matchedRow({ sourceRowNumber: 3, productAction: 'existing', matchedProduct: product(12), sku: 'SKU-12', barcode: 'BAR12000' }),
  ]);
  const document = createInventoryImportExecutionPreflightDocument({
    commitPlan: plan,
    commitPlanSessionId: COMMIT_PLAN_SESSION_ID,
    createdAt: '2026-01-02T00:00:00.000Z',
    preflightId: 'inventory-import-execution-preflight-document-77777777-7777-4777-8777-777777777777',
    permissionContext: { canAdjustInventory: true, canCreateProduct: true },
    currentState: currentState({
      products: [
        existing,
        product(12, { sku: 'SKU-12-CHANGED', barcode: 'BAR12000' }),
        product(99, { sku: 'SKU-11', barcode: 'BAR11000' }),
      ],
    }),
  });
  assert.equal(document.rows[0].currentDisposition, PREFLIGHT_ROW_DISPOSITIONS.CURRENTLY_ELIGIBLE);
  assert(document.rows[1].currentBlockReasonCodes.includes(PREFLIGHT_REASON_CODES.MATCHED_PRODUCT_MISSING));
  assert(document.rows[2].currentBlockReasonCodes.includes(PREFLIGHT_REASON_CODES.MATCHED_PRODUCT_CHANGED));

  const inactive = createInventoryImportExecutionPreflightDocument({
    commitPlan: commitPlan([matchedRow({ productAction: 'existing', matchedProduct: product(4), sku: 'SKU-4', barcode: 'BAR4000' })]),
    commitPlanSessionId: COMMIT_PLAN_SESSION_ID,
    createdAt: '2026-01-02T00:00:00.000Z',
    preflightId: 'inventory-import-execution-preflight-document-88888888-8888-4888-8888-888888888888',
    permissionContext: { canAdjustInventory: true, canCreateProduct: true },
    currentState: currentState({ products: [product(4, { is_active: false })] }),
  });
  assert(inactive.rows[0].currentBlockReasonCodes.includes(PREFLIGHT_REASON_CODES.MATCHED_PRODUCT_INACTIVE));
});

test('Phase 5H fails closed for catalogs, warehouse, inventory target, opening-stock ambiguity, and prior blocked rows', () => {
  const plan = commitPlan([
    matchedRow({ sourceRowNumber: 1, categoryName: 'Grocery', categoryId: 10 }),
    matchedRow({ sourceRowNumber: 2, openingQuantity: '5.000', sku: 'STOCK-NEW', barcode: 'STOCK-BAR' }),
    matchedRow({
      sourceRowNumber: 3,
      productAction: 'existing',
      matchedProduct: product(3),
      openingQuantity: '2.000',
      sku: 'SKU-3',
      barcode: 'BAR3000',
      evidence: { inventoryTargetId: 103 },
    }),
    matchedRow({ sourceRowNumber: 4, sku: '', barcode: '' }),
  ]);
  const document = createInventoryImportExecutionPreflightDocument({
    commitPlan: plan,
    commitPlanSessionId: COMMIT_PLAN_SESSION_ID,
    createdAt: '2026-01-02T00:00:00.000Z',
    preflightId: 'inventory-import-execution-preflight-document-99999999-9999-4999-8999-999999999999',
    permissionContext: { canAdjustInventory: true, canCreateProduct: true },
    currentState: currentState({
      products: [product(3)],
      catalogs: { category: [catalog('category', { is_active: false })], brand: [], unit: [], variant: [] },
      defaultWarehouse: warehouse({ is_active: false }),
      inventoryTargets: [inventoryTarget(3, { current_stock: '1.000' })],
      movementSummaries: [movement(3, { movement_count: 1, latest_movement_at: '2026-01-02T00:00:00.000Z' })],
    }),
  });
  assert(document.rows[0].currentBlockReasonCodes.includes(PREFLIGHT_REASON_CODES.REQUIRED_CATALOG_INACTIVE));
  assert(document.rows[1].currentBlockReasonCodes.includes(PREFLIGHT_REASON_CODES.WAREHOUSE_INACTIVE));
  assert(document.rows[1].currentBlockReasonCodes.includes(PREFLIGHT_REASON_CODES.OPENING_STOCK_STATE_UNRESOLVED));
  assert(document.rows[2].currentBlockReasonCodes.includes(PREFLIGHT_REASON_CODES.OPENING_STOCK_STATE_UNRESOLVED));
  assert(document.rows[3].currentBlockReasonCodes.includes(PREFLIGHT_REASON_CODES.SOURCE_PLAN_NOT_EXECUTABLE));
  assert(document.rows[3].originalBlockReasonCodes.includes('MISSING_REQUIRED_BARCODE'));
  assert.equal(document.summary.openingStockRows, 0);
});

test('Phase 5H digest is deterministic, changes with material current-state evidence, and does not mutate inputs', () => {
  const plan = commitPlan([matchedRow({ sku: 'NEW-1', barcode: 'BARNEW1' })]);
  const before = JSON.stringify(plan);
  const input = {
    commitPlan: plan,
    commitPlanSessionId: COMMIT_PLAN_SESSION_ID,
    createdAt: '2026-01-02T00:00:00.000Z',
    preflightId: 'inventory-import-execution-preflight-document-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    permissionContext: { canAdjustInventory: true, canCreateProduct: true },
    currentState: currentState(),
  };
  const first = createInventoryImportExecutionPreflightDocument(input);
  const second = createInventoryImportExecutionPreflightDocument({
    ...input,
    preflightId: 'inventory-import-execution-preflight-document-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  });
  const changed = createInventoryImportExecutionPreflightDocument({
    ...input,
    preflightId: 'inventory-import-execution-preflight-document-cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    currentState: currentState({ products: [product(1, { sku: 'NEW-1', barcode: 'OTHER' })] }),
  });
  assert.equal(first.preflightDigest, second.preflightDigest);
  assert.notEqual(first.preflightDigest, changed.preflightDigest);
  assert.equal(JSON.stringify(plan), before);
});

test('Phase 5H repository reads current state through read-only matching repository methods', async () => {
  const calls = [];
  const repository = createInventoryImportExecutionPreflightRepository({
    matchingRepository: {
      findProductsByIdentifiers: async (payload) => {
        calls.push(['products', payload]);
        return { ok: true, products: [product(1)] };
      },
      findCatalogsByNames: async (payload) => {
        calls.push(['catalogs', payload]);
        return { ok: true, catalogs: { category: [], brand: [], unit: [], variant: [] } };
      },
      getDefaultWarehouse: async () => {
        calls.push(['warehouse']);
        return { ok: true, warehouse: warehouse() };
      },
      findInventoryTargets: async (payload) => {
        calls.push(['inventory', payload]);
        return { ok: true, inventoryTargets: [inventoryTarget(1)] };
      },
      summarizeStockMovements: async (payload) => {
        calls.push(['movements', payload]);
        return { ok: true, movementSummaries: [movement(1)] };
      },
    },
  });
  const plan = commitPlan([matchedRow({ productAction: 'existing', matchedProduct: product(1), sku: 'SKU-1', barcode: 'BAR1000' })]);
  assert.deepEqual(collectCurrentStateInputs(plan).productIds, [1]);
  const result = await repository.readCurrentStateForCommitPlan(plan);
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(([name]) => name), ['products', 'catalogs', 'warehouse', 'inventory', 'movements']);
});

test('Phase 5H session service enforces owner binding, TTL, capacity, deterministic eviction, and non-consumption', () => {
  let now = 1000;
  let id = 0;
  const service = createInventoryImportExecutionPreflightSessionService({
    now: () => now,
    maxExecutionPreflightSessions: 2,
    executionPreflightSessionTtlMs: 100,
    sessionIdFactory: () => `inventory-import-execution-preflight-55555555-5555-4555-8555-${String(id++).padStart(12, '0')}`,
    documentIdFactory: () => `inventory-import-execution-preflight-document-dddddddd-dddd-4ddd-8ddd-${String(id).padStart(12, '0')}`,
  });
  const plan = commitPlan([matchedRow()]);
  const created = service.createExecutionPreflightSession({
    ownerId: 1,
    commitPlan: plan,
    commitPlanSessionId: COMMIT_PLAN_SESSION_ID,
    currentState: currentState(),
    permissionContext: { canAdjustInventory: true, canCreateProduct: true },
  });
  assert.equal(created.ok, true);
  assert.match(created.executionPreflightSession.sessionId, EXECUTION_PREFLIGHT_SESSION_ID_PATTERN);
  assert.equal(service.getExecutionPreflightSession({ ownerId: 2, sessionId: created.executionPreflightSession.sessionId }).ok, false);
  assert.equal(service.getExecutionPreflightSession({ ownerId: 1, sessionId: created.executionPreflightSession.sessionId }).ok, true);
  assert.equal(service.getExecutionPreflightSession({ ownerId: 1, sessionId: created.executionPreflightSession.sessionId }).ok, true);
  now = 2001;
  assert.equal(service.getExecutionPreflightSession({ ownerId: 1, sessionId: created.executionPreflightSession.sessionId }).ok, false);

  now = 2000;
  const first = service.createExecutionPreflightSession({ ownerId: 1, commitPlan: plan, commitPlanSessionId: COMMIT_PLAN_SESSION_ID, currentState: currentState(), permissionContext: { canAdjustInventory: true, canCreateProduct: true } });
  const second = service.createExecutionPreflightSession({ ownerId: 2, commitPlan: plan, commitPlanSessionId: COMMIT_PLAN_SESSION_ID, currentState: currentState(), permissionContext: { canAdjustInventory: true, canCreateProduct: true } });
  const third = service.createExecutionPreflightSession({ ownerId: 3, commitPlan: plan, commitPlanSessionId: COMMIT_PLAN_SESSION_ID, currentState: currentState(), permissionContext: { canAdjustInventory: true, canCreateProduct: true } });
  assert.equal(service.getExecutionPreflightSessionCount(), 2);
  assert.equal(service.getExecutionPreflightSession({ ownerId: 1, sessionId: first.executionPreflightSession.sessionId }).ok, false);
  assert.equal(service.getExecutionPreflightSession({ ownerId: 2, sessionId: second.executionPreflightSession.sessionId }).ok, true);
  assert.equal(service.getExecutionPreflightSession({ ownerId: 3, sessionId: third.executionPreflightSession.sessionId }).ok, true);
  assert.equal(MAX_EXECUTION_PREFLIGHT_SESSIONS, 25);
});

test('Phase 5H workflow creates and retrieves preflight sessions while rejecting authority and preserving source sessions', async () => {
  const plan = commitPlan([matchedRow({ sku: 'NEW-1', barcode: 'BARNEW1' })]);
  const planServiceCalls = [];
  const planService = {
    getCommitPlanSession(input) {
      planServiceCalls.push(input);
      if (input.ownerId !== 10 || input.sessionId !== COMMIT_PLAN_SESSION_ID) return { ok: false };
      return { ok: true, commitPlan: plan, commitPlanSession: { sessionId: COMMIT_PLAN_SESSION_ID } };
    },
  };
  const preflightService = createInventoryImportExecutionPreflightSessionService({
    now: () => 2000,
    sessionIdFactory: () => 'inventory-import-execution-preflight-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    documentIdFactory: () => 'inventory-import-execution-preflight-document-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  });
  const workflow = createInventoryImportExecutionPreflightWorkflowService({
    authService: authFor({ id: 10, role: 'Admin' }),
    commitPlanSessionService: planService,
    executionPreflightRepository: {
      readCurrentStateForCommitPlan: async () => ({ ok: true, currentState: currentState() }),
    },
    executionPreflightSessionService: preflightService,
  });
  const created = await workflow.createImportExecutionPreflight({ sessionId: COMMIT_PLAN_SESSION_ID });
  assert.equal(created.ok, true);
  assert.equal(created.executionPreflight.databaseWrite, false);
  assert.equal(created.executionPreflight.commitReady, false);
  assert.equal(planServiceCalls.length, 1);
  const retrieved = await workflow.getImportExecutionPreflightSession({ sessionId: created.sessionId });
  assert.equal(retrieved.ok, true);
  assert.deepEqual(retrieved.executionPreflight, created.executionPreflight);
  assert.equal((await workflow.createImportExecutionPreflight({ sessionId: COMMIT_PLAN_SESSION_ID, ownerId: 1 })).code, EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.INVALID_REQUEST);
  assert.equal((await workflow.createImportExecutionPreflight({ sessionId: COMMIT_PLAN_SESSION_ID, rows: [] })).code, EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.INVALID_REQUEST);

  const denied = createInventoryImportExecutionPreflightWorkflowService({
    authService: authFor({ id: 10, role: 'Cashier' }),
    commitPlanSessionService: planService,
    executionPreflightRepository: { readCurrentStateForCommitPlan: async () => { throw new Error('should not read'); } },
    executionPreflightSessionService: preflightService,
  });
  assert.equal((await denied.createImportExecutionPreflight({ sessionId: COMMIT_PLAN_SESSION_ID })).code, EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.ACCESS_DENIED);
});

test('Phase 5H controller, API, and preload expose only narrow preflight session methods', async () => {
  const controllerPath = path.join(root, 'src/main/features/inventory/inventory.controller.js');
  const originalLoad = Module._load;
  const calls = [];
  const handlers = new Map();
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename === controllerPath && request === './inventory-import-execution-preflight-workflow.service') {
      return {
        createImportExecutionPreflight: async (payload) => { calls.push(['create', payload]); return { ok: true, delegated: 'create' }; },
        getImportExecutionPreflightSession: async (payload) => { calls.push(['retrieve', payload]); return { ok: true, delegated: 'retrieve' }; },
      };
    }
    if (parent?.filename === controllerPath && request.startsWith('./inventory')) {
      return new Proxy({}, { get: () => async () => ({}) });
    }
    if (request === 'electron') return { BrowserWindow: { fromWebContents: () => ({}) }, dialog: { showOpenDialog: async () => ({ canceled: true }) } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[controllerPath];
    require(controllerPath).registerInventoryRoutes({ handle: (route, handler) => handlers.set(route, handler) });
    await handlers.get('/inventory/import/execution-preflight/create')({}, { sessionId: COMMIT_PLAN_SESSION_ID });
    await handlers.get('/inventory/import/execution-preflight/session')({}, { sessionId: 'inventory-import-execution-preflight-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' });
    assert.deepEqual(calls.map(([name]) => name), ['create', 'retrieve']);
  } finally {
    Module._load = originalLoad;
    delete require.cache[controllerPath];
  }

  const apiSource = fs.readFileSync(path.join(root, 'src/main/features/inventory/inventory.api.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(root, 'src/main/preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/main/features/inventory/inventory.renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/main/features/inventory/index.html'), 'utf8');
  const invocations = [];
  const context = { window: { posApi: { inventory: {
    createImportExecutionPreflight: async (sessionId) => { invocations.push(['create', sessionId]); return { ok: true }; },
    getImportExecutionPreflightSession: async (sessionId) => { invocations.push(['retrieve', sessionId]); return { ok: true }; },
  } } } };
  vm.runInNewContext(apiSource, context);
  await context.window.InventoryApi.createImportExecutionPreflight('plan-session');
  await context.window.InventoryApi.getImportExecutionPreflightSession('preflight-session');
  assert.deepEqual(invocations, [['create', 'plan-session'], ['retrieve', 'preflight-session']]);
  assert.match(preloadSource, /createImportExecutionPreflight:\s*\(sessionId\)\s*=>\s*ipcRenderer\.invoke\('\/inventory\/import\/execution-preflight\/create',\s*\{\s*sessionId\s*\}\)/);
  assert.match(preloadSource, /getImportExecutionPreflightSession:\s*\(sessionId\)\s*=>\s*ipcRenderer\.invoke\('\/inventory\/import\/execution-preflight\/session',\s*\{\s*sessionId\s*\}\)/);
  const inventoryPreloadBlock = preloadSource.slice(preloadSource.indexOf('  inventory: {'), preloadSource.indexOf('  suppliers: {'));
  assert.doesNotMatch(inventoryPreloadBlock, /ownerId|permissions|productAction|stockAction|executeImport|commitImport|finalizeImport|applyImport/);
  assert.doesNotMatch(renderer, /createImportExecutionPreflight|getImportExecutionPreflightSession|executeImport|commitImport|finalizeImport|applyImport/);
  assert.doesNotMatch(html, /Execute Import|Finalize Import|Commit Import|Import Now/);
});

test('Phase 5H production files remain read-only and isolated from mutation surfaces', () => {
  const files = [
    'src/main/features/inventory/inventory-import-execution-preflight.model.js',
    'src/main/features/inventory/inventory-import-execution-preflight-session.service.js',
    'src/main/features/inventory/inventory-import-execution-preflight.repository.js',
    'src/main/features/inventory/inventory-import-execution-preflight-workflow.service.js',
  ];
  const source = files.map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /INSERT|UPDATE|DELETE|withTransaction|createActivityLog|generateBarcode|generateSku/);
  assert.doesNotMatch(source, /product\.service|inventory\.service|stock_movements|BrowserWindow|dialog|location\.reload/);
});
