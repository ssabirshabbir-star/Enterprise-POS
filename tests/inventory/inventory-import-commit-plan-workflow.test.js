const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const {
  createImportPreviewDocument,
} = require('../../src/main/features/inventory/inventory-import-preview-session.model');
const {
  createInventoryImportMatchedPreviewSessionService,
} = require('../../src/main/features/inventory/inventory-import-matched-preview-session.service');
const {
  createInventoryImportCommitPlanSessionService,
} = require('../../src/main/features/inventory/inventory-import-commit-plan-session.service');
const {
  COMMIT_PLAN_WORKFLOW_ERROR_CODES,
  createInventoryImportCommitPlanWorkflowService,
} = require('../../src/main/features/inventory/inventory-import-commit-plan-workflow.service');
const { analyzeInventoryImportMatches } = require('../../src/main/features/inventory/inventory-import-matching.service');
const { createProductMatch } = require('../../src/main/features/inventory/inventory-import-matching.contract');
const { ROW_STATUSES } = require('../../src/main/features/inventory/inventory-import.validation');

const root = path.join(__dirname, '..', '..');
const SOURCE_PREVIEW_SESSION_ID = 'inventory-import-preview-11111111-1111-4111-8111-111111111111';
const SOURCE_PREVIEW_ID = 'inventory-import-preview-document-22222222-2222-4222-8222-222222222222';

function phase3Row(overrides = {}) {
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
      variant: '',
      costPrice: '100.50',
      sellingPrice: '120.75',
      wholesalePrice: '115.25',
      openingQuantity: '0',
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

function sourcePreview(rows = [phase3Row()]) {
  return createImportPreviewDocument({
    previewId: SOURCE_PREVIEW_ID,
    createdAt: '2026-07-13T10:00:00.000Z',
    templateVersion: 'inventory-import-v1',
    sourceFile: { fileName: 'inventory.csv', sizeBytes: 1024, lastModifiedMs: 1783920000000 },
    permissions: { canPreviewImport: true, canCreateProducts: true, canCommitStock: true },
    summary: { totalRows: rows.length, canCommit: false, databaseMatched: false },
    rows,
    errors: [],
    warnings: [],
  });
}

function product(overrides = {}) {
  return createProductMatch({
    product_id: 1,
    name: 'Rice 5kg',
    sku: 'RICE-5',
    barcode: '00012345',
    category_name: 'Grocery',
    brand_name: 'Local',
    unit_name: 'Bag',
    variant_name: null,
    purchase_price: '100.50',
    sale_price: '120.75',
    wholesale_price: '115.25',
    is_active: true,
    deleted_at: null,
    updated_at: '2026-07-13T10:00:00.000Z',
    ...overrides,
  });
}

function matchingAnalysis(rows = [phase3Row()], role = 'Admin') {
  return analyzeInventoryImportMatches({
    rows,
    productsResult: { ok: true, products: [product()] },
    catalogsResult: { ok: true, catalogs: { category: [], brand: [], unit: [], variant: [] } },
    warehouseResult: { ok: true, warehouse: null },
    inventoryTargetsResult: { ok: true, inventoryTargets: [] },
    movementSummariesResult: { ok: true, movementSummaries: [] },
    permissionContext: { role },
  });
}

function authFor(profile = { id: 10, role: 'Admin' }) {
  return {
    calls: 0,
    async getProfile() {
      this.calls += 1;
      return profile ? { ok: true, profile } : { ok: false };
    },
  };
}

function createOwnerBoundFixtures({ ownerId = 10, now = 1000, role = 'Admin' } = {}) {
  const matchedService = createInventoryImportMatchedPreviewSessionService({
    now: () => now,
    matchedPreviewSessionTtlMs: 60_000,
  });
  const commitService = createInventoryImportCommitPlanSessionService({
    now: () => now,
    commitPlanSessionTtlMs: 60_000,
    sessionIdFactory: () => 'inventory-import-commit-plan-44444444-4444-4444-8444-444444444444',
  });
  const preview = sourcePreview();
  const analysis = matchingAnalysis(preview.rows, role);
  const matchedResult = matchedService.createMatchedPreviewSession({
    ownerId,
    sourcePreviewSessionId: SOURCE_PREVIEW_SESSION_ID,
    sourcePreview: preview,
    matchingAnalysis: analysis,
    matchedAt: '2026-07-13T10:05:00.000Z',
  });
  assert.equal(matchedResult.ok, true);
  const workflow = createInventoryImportCommitPlanWorkflowService({
    authService: authFor({ id: ownerId, role }),
    matchedPreviewSessionService: matchedService,
    commitPlanSessionService: commitService,
  });
  return { analysis, commitService, matchedResult, matchedService, preview, workflow };
}

test('Phase 5G creates a retained commit-plan session from an owner-bound matched preview session', async () => {
  const { commitService, matchedResult, matchedService, preview, workflow } = createOwnerBoundFixtures();
  const beforePreview = JSON.stringify(matchedResult.matchedPreview);
  const result = await workflow.createImportCommitPlan({ sessionId: matchedResult.matchedPreviewSession.sessionId });

  assert.equal(result.ok, true);
  assert.equal(result.sessionId, result.commitPlanSession.sessionId);
  assert.equal(result.commitPlan.sourceMatchedPreviewSessionId, matchedResult.matchedPreviewSession.sessionId);
  assert.equal(result.commitPlan.sourcePreviewSessionId, SOURCE_PREVIEW_SESSION_ID);
  assert.equal(result.commitPlan.sourcePreviewId, SOURCE_PREVIEW_ID);
  assert.equal(result.commitPlan.databaseWrite, false);
  assert.equal(result.commitPlan.commitReady, false);
  assert.equal(result.commitPlan.rendererAuthoritative, false);
  assert.equal(result.commitPlan.requiresRevalidation, true);
  assert.equal(result.commitPlanSession.databaseWrite, false);
  assert.equal(result.commitPlanSession.commitReady, false);
  assert.equal(result.commitPlanSession.rendererAuthoritative, false);
  assert.equal(result.commitPlanSession.requiresRevalidation, true);
  assert.deepEqual(result.planSummary, result.commitPlan.planSummary);
  assert.equal(JSON.stringify(matchedResult.matchedPreview), beforePreview);
  assert.equal(JSON.stringify(preview), JSON.stringify(sourcePreview()));
  assert.equal(
    matchedService.getMatchedPreviewSession({ ownerId: 10, sessionId: matchedResult.matchedPreviewSession.sessionId }).ok,
    true
  );
  assert.equal(commitService.getCommitPlanSession({ ownerId: 10, sessionId: result.sessionId }).ok, true);
});

test('Phase 5G rejects renderer-supplied authority, rows, actions, and plan flags', async () => {
  const { matchedResult, workflow } = createOwnerBoundFixtures();
  const maliciousValues = [
    { ownerId: 1 },
    { owner: { id: 1 } },
    { user: 'admin' },
    { userId: 1 },
    { profile: { id: 1 } },
    { role: 'Admin' },
    { roles: ['Admin'] },
    { permissions: ['inventory.adjust'] },
    { canAdjustInventory: true },
    { canWriteProducts: true },
    { rows: [] },
    { products: [] },
    { matchedProducts: [] },
    { matches: [] },
    { classifications: [] },
    { warehouseId: 1 },
    { inventoryId: 1 },
    { productAction: 'CREATE_PRODUCT' },
    { productActions: ['CREATE_PRODUCT'] },
    { stockAction: 'APPLY_OPENING_STOCK' },
    { stockActions: ['APPLY_OPENING_STOCK'] },
    { commitPlan: {} },
    { plan: {} },
    { summary: {} },
    { databaseWrite: true },
    { commitReady: true },
    { requiresRevalidation: false },
  ];

  for (const extra of maliciousValues) {
    const result = await workflow.createImportCommitPlan({
      sessionId: matchedResult.matchedPreviewSession.sessionId,
      ...extra,
    });
    assert.equal(result.ok, false, `expected rejection for ${Object.keys(extra)[0]}`);
    assert.equal(result.code, COMMIT_PLAN_WORKFLOW_ERROR_CODES.INVALID_REQUEST);
  }

  const executable = await workflow.createImportCommitPlan({
    sessionId: matchedResult.matchedPreviewSession.sessionId,
    rows: [() => null],
  });
  assert.equal(executable.code, COMMIT_PLAN_WORKFLOW_ERROR_CODES.INVALID_REQUEST);
});

test('Phase 5G requires backend Inventory adjust authority and authenticated owner identity', async () => {
  const { commitService, matchedResult, matchedService } = createOwnerBoundFixtures();
  const cashierWorkflow = createInventoryImportCommitPlanWorkflowService({
    authService: authFor({ id: 10, role: 'Cashier' }),
    matchedPreviewSessionService: matchedService,
    commitPlanSessionService: commitService,
  });
  const denied = await cashierWorkflow.createImportCommitPlan({
    sessionId: matchedResult.matchedPreviewSession.sessionId,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, COMMIT_PLAN_WORKFLOW_ERROR_CODES.ACCESS_DENIED);
  assert.equal(commitService.getCommitPlanSessionCount(), 0);

  const anonymousWorkflow = createInventoryImportCommitPlanWorkflowService({
    authService: authFor(null),
    matchedPreviewSessionService: matchedService,
    commitPlanSessionService: commitService,
  });
  const anonymous = await anonymousWorkflow.createImportCommitPlan({
    sessionId: matchedResult.matchedPreviewSession.sessionId,
  });
  assert.equal(anonymous.code, COMMIT_PLAN_WORKFLOW_ERROR_CODES.AUTHENTICATION_REQUIRED);
});

test('Phase 5G fails closed for malformed, missing, expired, cross-owner, and malformed stored matched sessions', async () => {
  const { commitService, matchedResult, matchedService, workflow } = createOwnerBoundFixtures();
  assert.equal(
    (await workflow.createImportCommitPlan({ sessionId: 'inventory-import-matched-preview-bad' })).code,
    COMMIT_PLAN_WORKFLOW_ERROR_CODES.INVALID_REQUEST
  );
  assert.equal(
    (
      await workflow.createImportCommitPlan({
        sessionId: 'inventory-import-matched-preview-99999999-9999-4999-8999-999999999999',
      })
    ).code,
    COMMIT_PLAN_WORKFLOW_ERROR_CODES.SOURCE_MATCHED_PREVIEW_UNAVAILABLE
  );

  const wrongOwnerWorkflow = createInventoryImportCommitPlanWorkflowService({
    authService: authFor({ id: 11, role: 'Admin' }),
    matchedPreviewSessionService: matchedService,
    commitPlanSessionService: commitService,
  });
  assert.equal(
    (await wrongOwnerWorkflow.createImportCommitPlan({ sessionId: matchedResult.matchedPreviewSession.sessionId })).code,
    COMMIT_PLAN_WORKFLOW_ERROR_CODES.SOURCE_MATCHED_PREVIEW_UNAVAILABLE
  );

  matchedService._sessions.get(matchedResult.matchedPreviewSession.sessionId).expiresAt = 999;
  assert.equal(
    (await workflow.createImportCommitPlan({ sessionId: matchedResult.matchedPreviewSession.sessionId })).code,
    COMMIT_PLAN_WORKFLOW_ERROR_CODES.SOURCE_MATCHED_PREVIEW_UNAVAILABLE
  );

  const malformedService = {
    getMatchedPreviewSession: () => ({ ok: true, matchedPreview: { bad: true } }),
  };
  const malformedWorkflow = createInventoryImportCommitPlanWorkflowService({
    authService: authFor({ id: 10, role: 'Admin' }),
    matchedPreviewSessionService: malformedService,
    commitPlanSessionService: commitService,
  });
  assert.equal(
    (await malformedWorkflow.createImportCommitPlan({ sessionId: matchedResult.matchedPreviewSession.sessionId })).code,
    COMMIT_PLAN_WORKFLOW_ERROR_CODES.FAILED
  );
});

test('Phase 5G retrieves owner-bound commit-plan sessions without consumption', async () => {
  const { matchedResult, workflow } = createOwnerBoundFixtures();
  const created = await workflow.createImportCommitPlan({ sessionId: matchedResult.matchedPreviewSession.sessionId });
  assert.equal(created.ok, true);

  const first = await workflow.getImportCommitPlanSession({ sessionId: created.sessionId });
  const second = await workflow.getImportCommitPlanSession({ sessionId: created.sessionId });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.commitPlan, second.commitPlan);
  assert.deepEqual(first.commitPlanSession, second.commitPlanSession);
  assert.equal(first.commitPlan.databaseWrite, false);
  assert.equal(first.commitPlan.commitReady, false);
  assert.equal(first.commitPlan.rendererAuthoritative, false);
  assert.equal(first.commitPlan.requiresRevalidation, true);
});

test('Phase 5G fails closed for malformed, missing, expired, and cross-owner commit-plan retrieval', async () => {
  const { commitService, matchedResult, workflow } = createOwnerBoundFixtures();
  const created = await workflow.createImportCommitPlan({ sessionId: matchedResult.matchedPreviewSession.sessionId });
  assert.equal(created.ok, true);
  assert.equal(
    (await workflow.getImportCommitPlanSession({ sessionId: 'inventory-import-commit-plan-bad' })).code,
    COMMIT_PLAN_WORKFLOW_ERROR_CODES.INVALID_REQUEST
  );
  assert.equal(
    (
      await workflow.getImportCommitPlanSession({
        sessionId: 'inventory-import-commit-plan-99999999-9999-4999-8999-999999999999',
      })
    ).code,
    COMMIT_PLAN_WORKFLOW_ERROR_CODES.SESSION_UNAVAILABLE
  );

  const wrongOwnerWorkflow = createInventoryImportCommitPlanWorkflowService({
    authService: authFor({ id: 11, role: 'Admin' }),
    matchedPreviewSessionService: {},
    commitPlanSessionService: commitService,
  });
  assert.equal(
    (await wrongOwnerWorkflow.getImportCommitPlanSession({ sessionId: created.sessionId })).code,
    COMMIT_PLAN_WORKFLOW_ERROR_CODES.SESSION_UNAVAILABLE
  );

  commitService._sessions.get(created.sessionId).expiresAt = 999;
  assert.equal(
    (await workflow.getImportCommitPlanSession({ sessionId: created.sessionId })).code,
    COMMIT_PLAN_WORKFLOW_ERROR_CODES.SESSION_UNAVAILABLE
  );
});

test('Phase 5G workflow has no repository, database, product, stock, activity, filesystem, or Electron dependency', () => {
  const source = fs.readFileSync(
    path.join(root, 'src/main/features/inventory/inventory-import-commit-plan-workflow.service.js'),
    'utf8'
  );
  const requireLines = source
    .split(/\r?\n/)
    .filter((line) => line.includes('require('))
    .join('\n');
  assert.doesNotMatch(requireLines, /inventory-import-matching\.repository|database|connection|getPool|withTransaction/);
  assert.doesNotMatch(requireLines, /product\.service|product\.repository|inventory\.repository|inventory\.service/);
  assert.doesNotMatch(requireLines, /stock_movements|createActivityLog|activityRepository|electron|BrowserWindow|dialog|fs|shell/);
  assert.doesNotMatch(source, /execute|finalize|apply|rollback|retry|barcodeGenerator|generateBarcode/);
});

test('Phase 5G controller delegates create and retrieve to the workflow service without reconstructing plans', async () => {
  const controllerPath = path.join(root, 'src/main/features/inventory/inventory.controller.js');
  const originalLoad = Module._load;
  const calls = [];
  const handlers = new Map();
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename === controllerPath && request === './inventory-import-commit-plan-workflow.service') {
      return {
        createImportCommitPlan: async (payload) => {
          calls.push(['create', payload]);
          return { ok: true, delegated: 'create' };
        },
        getImportCommitPlanSession: async (payload) => {
          calls.push(['retrieve', payload]);
          return { ok: true, delegated: 'retrieve' };
        },
      };
    }
    if (parent?.filename === controllerPath && request === './inventory.service') {
      return { listInventory: async () => ({}), listMovements: async () => ({}), adjustStock: async () => ({}), updateProductImage: async () => ({}) };
    }
    if (parent?.filename === controllerPath && request === './inventory-import-preview.service') {
      return { requestImportPreview: async () => ({}), getImportPreviewSession: async () => ({}) };
    }
    if (parent?.filename === controllerPath && request === './inventory-import-matching-workflow.service') {
      return { analyzeImportPreview: async () => ({}), getMatchedImportPreviewSession: async () => ({}) };
    }
    if (request === 'electron') {
      return { BrowserWindow: { fromWebContents: () => ({}) }, dialog: { showOpenDialog: async () => ({ canceled: true }) } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[controllerPath];
    const { registerInventoryRoutes } = require(controllerPath);
    registerInventoryRoutes({
      handle(route, handler) {
        handlers.set(route, handler);
      },
    });
    assert.equal(typeof handlers.get('/inventory/import/commit-plan/create'), 'function');
    assert.equal(typeof handlers.get('/inventory/import/commit-plan/session'), 'function');
    const createPayload = { sessionId: 'inventory-import-matched-preview-33333333-3333-4333-8333-333333333333' };
    const retrievePayload = { sessionId: 'inventory-import-commit-plan-44444444-4444-4444-8444-444444444444' };
    assert.deepEqual(await handlers.get('/inventory/import/commit-plan/create')({}, createPayload), {
      ok: true,
      delegated: 'create',
    });
    assert.deepEqual(await handlers.get('/inventory/import/commit-plan/session')({}, retrievePayload), {
      ok: true,
      delegated: 'retrieve',
    });
    assert.deepEqual(calls, [
      ['create', createPayload],
      ['retrieve', retrievePayload],
    ]);
  } finally {
    Module._load = originalLoad;
    delete require.cache[controllerPath];
  }
});

test('Phase 5G API and preload expose only narrow commit-plan session methods', async () => {
  const apiSource = fs.readFileSync(path.join(root, 'src/main/features/inventory/inventory.api.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(root, 'src/main/preload.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'src/main/features/inventory/index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'src/main/features/inventory/inventory.renderer.js'), 'utf8');

  const invocations = [];
  const context = {
    window: {
      posApi: {
        inventory: {
          createImportCommitPlan: async (sessionId) => {
            invocations.push(['create', sessionId]);
            return { ok: true };
          },
          getImportCommitPlanSession: async (sessionId) => {
            invocations.push(['retrieve', sessionId]);
            return { ok: true };
          },
        },
      },
    },
  };
  vm.runInNewContext(apiSource, context);
  await context.window.InventoryApi.createImportCommitPlan('matched-session');
  await context.window.InventoryApi.getImportCommitPlanSession('plan-session');
  assert.deepEqual(invocations, [
    ['create', 'matched-session'],
    ['retrieve', 'plan-session'],
  ]);

  assert.match(preloadSource, /createImportCommitPlan:\s*\(sessionId\)\s*=>\s*ipcRenderer\.invoke\('\/inventory\/import\/commit-plan\/create',\s*\{\s*sessionId\s*\}\)/);
  assert.match(preloadSource, /getImportCommitPlanSession:\s*\(sessionId\)\s*=>\s*ipcRenderer\.invoke\('\/inventory\/import\/commit-plan\/session',\s*\{\s*sessionId\s*\}\)/);
  const inventoryPreloadBlock = preloadSource.slice(
    preloadSource.indexOf('  inventory: {'),
    preloadSource.indexOf('  suppliers: {')
  );
  assert.doesNotMatch(inventoryPreloadBlock, /ownerId|permissions|productAction|stockAction|executeImport|commitImport|finalizeImport|applyImport/);
  assert.doesNotMatch(html, /Execute Import|Finalize Import|Commit Import|Import Now/);
  assert.match(renderer, /createImportCommitPlan\(_matchedPreviewSessionId\)/);
  assert.doesNotMatch(renderer, /getImportCommitPlanSession|window\.posApi|ipcRenderer|executeImport|commitImport|finalizeImport|applyImport/);
});
