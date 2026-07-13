const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');

const {
  createImportPreviewDocument,
} = require('../../src/main/features/inventory/inventory-import-preview-session.model');
const {
  createCatalogMatch,
  createDefaultWarehouse,
  createInventoryTarget,
  createProductMatch,
  createStockMovementSummary,
} = require('../../src/main/features/inventory/inventory-import-matching.contract');
const {
  createInventoryImportMatchingWorkflowService,
  WORKFLOW_ERROR_CODES,
} = require('../../src/main/features/inventory/inventory-import-matching-workflow.service');
const {
  createInventoryImportMatchedPreviewSessionService,
} = require('../../src/main/features/inventory/inventory-import-matched-preview-session.service');
const { ROW_STATUSES } = require('../../src/main/features/inventory/inventory-import.validation');

const root = path.join(__dirname, '..', '..');
const SOURCE_SESSION_ID = 'inventory-import-preview-11111111-1111-4111-8111-111111111111';
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
      openingQuantity: '5.000',
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
    sourceFile: {
      fileName: 'inventory.csv',
      sizeBytes: 1024,
      lastModifiedMs: 1783920000000,
    },
    permissions: {
      canPreviewImport: true,
      canCreateProducts: true,
      canCommitStock: true,
    },
    summary: {
      totalRows: rows.length,
      canCommit: false,
      databaseMatched: false,
    },
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

function catalog(type, overrides = {}) {
  return createCatalogMatch(type, {
    id: type === 'category' ? 10 : type === 'brand' ? 11 : type === 'unit' ? 12 : 13,
    name: type === 'category' ? 'Grocery' : type === 'brand' ? 'Local' : type === 'unit' ? 'Bag' : 'Standard',
    is_active: true,
    deleted_at: null,
    updated_at: '2026-07-13T10:00:00.000Z',
    ...overrides,
  });
}

function warehouse() {
  return createDefaultWarehouse({
    id: 7,
    name: 'Main Warehouse',
    is_active: true,
    updated_at: '2026-07-13T10:00:00.000Z',
  });
}

function inventoryTarget() {
  return createInventoryTarget({
    id: 100,
    product_id: 1,
    warehouse_id: 7,
    current_stock: '0.000',
    updated_at: '2026-07-13T10:00:00.000Z',
  });
}

function movement() {
  return createStockMovementSummary({
    product_id: 1,
    movement_count: 0,
    latest_movement_at: null,
  });
}

function createRepository(overrides = {}) {
  const calls = [];
  return {
    calls,
    findProductsByIdentifiers: async (payload) => {
      calls.push(['products', payload]);
      return overrides.productsResult || { ok: true, products: [product()] };
    },
    findCatalogsByNames: async (payload) => {
      calls.push(['catalogs', payload]);
      return (
        overrides.catalogsResult || {
          ok: true,
          catalogs: {
            category: [catalog('category')],
            brand: [catalog('brand')],
            unit: [catalog('unit')],
            variant: [],
          },
        }
      );
    },
    getDefaultWarehouse: async () => {
      calls.push(['warehouse']);
      return overrides.warehouseResult || { ok: true, warehouse: warehouse() };
    },
    findInventoryTargets: async (payload) => {
      calls.push(['inventoryTargets', payload]);
      return overrides.inventoryTargetsResult || { ok: true, inventoryTargets: [inventoryTarget()] };
    },
    summarizeStockMovements: async (payload) => {
      calls.push(['movementSummaries', payload]);
      return overrides.movementSummariesResult || { ok: true, movementSummaries: [movement()] };
    },
  };
}

function createService({
  profile = { id: 7, role: 'Admin' },
  preview = sourcePreview(),
  repository = createRepository(),
  matchedPreviewSessionService = createInventoryImportMatchedPreviewSessionService({
    now: () => Date.parse('2026-07-13T10:00:00.000Z'),
  }),
  previewResult,
} = {}) {
  const authService = {
    getProfile: async () =>
      profile ? { ok: true, profile } : { ok: false, message: 'Authentication required.' },
  };
  const previewService = {
    getImportPreviewSession: async (payload) =>
      previewResult || {
        ok: true,
        preview,
        previewSession: {
          sessionId: payload.sessionId,
          previewId: preview.previewId,
        },
      },
  };
  return {
    repository,
    service: createInventoryImportMatchingWorkflowService({
      authService,
      previewService,
      matchingRepository: repository,
      matchedPreviewSessionService,
    }),
  };
}

test('analyzeImportPreview orchestrates Phase 4, 5A, 5B, and 5C without trusting renderer state', async () => {
  const rows = [
    phase3Row(),
    phase3Row({ sourceRowNumber: 3, status: ROW_STATUSES.STRUCTURALLY_INVALID, errors: [{ code: 'bad' }] }),
    phase3Row({
      sourceRowNumber: 4,
      status: ROW_STATUSES.STOCK_ROW_CANDIDATE,
      normalized: { ...phase3Row().normalized, sku: ' rice-5 ', barcode: '00012345', productName: 'Ignored' },
    }),
  ];
  const preview = sourcePreview(rows);
  const { repository, service } = createService({ preview });

  const result = await service.analyzeImportPreview({ sessionId: SOURCE_SESSION_ID });

  assert.equal(result.ok, true);
  assert.match(result.sessionId, /^inventory-import-matched-preview-/);
  assert.equal(result.matchedPreview.sourcePreviewSessionId, SOURCE_SESSION_ID);
  assert.equal(result.matchedPreview.sourcePreviewId, SOURCE_PREVIEW_ID);
  assert.equal(result.matchedPreview.databaseWrite, false);
  assert.equal(result.matchedPreview.commitReady, false);
  assert.equal(Object.isFrozen(result.matchedPreview), true);
  assert.deepEqual(repository.calls[0], [
    'products',
    { skus: ['RICE-5'], barcodes: ['00012345'] },
  ]);
  assert.deepEqual(repository.calls[1], [
    'catalogs',
    { category: ['Grocery'], brand: ['Local'], unit: ['Bag'], variant: [] },
  ]);
  assert.deepEqual(repository.calls[3], ['inventoryTargets', { productIds: [1], warehouseId: 7 }]);
  assert.deepEqual(repository.calls[4], ['movementSummaries', { productIds: [1] }]);
});

test('analyzeImportPreview rejects renderer-supplied authority and malformed payloads before backend work', async () => {
  const { repository, service } = createService();
  const badPayloads = [
    {},
    { sessionId: 'bad' },
    { sessionId: SOURCE_SESSION_ID, ownerId: 99 },
    { sessionId: SOURCE_SESSION_ID, role: 'Admin' },
    { sessionId: SOURCE_SESSION_ID, permissions: { canAdjustInventory: true } },
    { sessionId: SOURCE_SESSION_ID, productIds: [1] },
    { sessionId: SOURCE_SESSION_ID, warehouseId: 7 },
    { sessionId: SOURCE_SESSION_ID, rows: [] },
    { sessionId: SOURCE_SESSION_ID, callback: () => true },
    Object.create({ sessionId: SOURCE_SESSION_ID }),
  ];

  for (const payload of badPayloads) {
    const result = await service.analyzeImportPreview(payload);
    assert.equal(result.ok, false);
    assert.equal(result.code, WORKFLOW_ERROR_CODES.INVALID_REQUEST);
  }
  assert.equal(repository.calls.length, 0);
});

test('analyzeImportPreview enforces backend authentication and Inventory adjust authority', async () => {
  const unauthenticated = createService({ profile: null });
  assert.equal(
    (await unauthenticated.service.analyzeImportPreview({ sessionId: SOURCE_SESSION_ID })).code,
    WORKFLOW_ERROR_CODES.AUTHENTICATION_REQUIRED
  );

  const denied = createService({ profile: { id: 9, role: 'Cashier' } });
  assert.equal(
    (await denied.service.analyzeImportPreview({ sessionId: SOURCE_SESSION_ID })).code,
    WORKFLOW_ERROR_CODES.ACCESS_DENIED
  );

  const warehouseUser = createService({ profile: { id: 10, role: 'Warehouse' } });
  const result = await warehouseUser.service.analyzeImportPreview({ sessionId: SOURCE_SESSION_ID });
  assert.equal(result.ok, true);
  assert.equal(result.matchedPreview.matchedRows[0].evidence.canAdjustInventory, true);
  assert.equal(result.matchedPreview.matchedRows[0].evidence.canCreateProduct, false);
});

test('source preview failures do not run matching reads or create matched sessions', async () => {
  const matchedPreviewSessionService = {
    createMatchedPreviewSession: () => {
      throw new Error('must not create matched session');
    },
    getMatchedPreviewSession: () => {
      throw new Error('not used');
    },
  };
  const repository = createRepository();
  const { service } = createService({
    repository,
    matchedPreviewSessionService,
    previewResult: { ok: false, stale: true, message: 'expired' },
  });

  const result = await service.analyzeImportPreview({ sessionId: SOURCE_SESSION_ID });

  assert.equal(result.ok, false);
  assert.equal(result.code, WORKFLOW_ERROR_CODES.SOURCE_PREVIEW_UNAVAILABLE);
  assert.equal(result.stale, true);
  assert.equal(repository.calls.length, 0);
});

test('repository read failures are passed through Phase 5B as sanitized matching findings', async () => {
  const repository = createRepository({
    productsResult: {
      ok: false,
      code: 'INVENTORY_IMPORT_MATCHING_READ_FAILED',
      message: 'Inventory import matching data could not be read.',
      reason: 'read_failed',
    },
  });
  const { service } = createService({ repository });

  const result = await service.analyzeImportPreview({ sessionId: SOURCE_SESSION_ID });

  assert.equal(result.ok, true);
  assert.equal(result.matchedPreview.matchingSummary.matchingFailedRows, 1);
  assert.equal(result.matchedPreview.matchedRows[0].status, 'MATCHING_FAILED');
  assert.equal(result.matchedPreview.matchedRows[0].matchingFindings[0].metadata.reason, 'INVENTORY_IMPORT_MATCHING_READ_FAILED');
});

test('failed analysis does not replace a prior matched session for the owner', async () => {
  const matchedPreviewSessionService = createInventoryImportMatchedPreviewSessionService({
    now: () => Date.parse('2026-07-13T10:00:00.000Z'),
  });
  const { service } = createService({ matchedPreviewSessionService });
  const first = await service.analyzeImportPreview({ sessionId: SOURCE_SESSION_ID });
  assert.equal(first.ok, true);

  const failed = await service.analyzeImportPreview({
    sessionId: SOURCE_SESSION_ID,
    ownerId: 99,
  });
  assert.equal(failed.ok, false);

  const retrieved = await service.getMatchedImportPreviewSession({ sessionId: first.sessionId });
  assert.equal(retrieved.ok, true);
  assert.equal(retrieved.sessionId, first.sessionId);
});

test('getMatchedImportPreviewSession retrieves retained sessions by authoritative owner only', async () => {
  const matchedPreviewSessionService = createInventoryImportMatchedPreviewSessionService({
    now: () => Date.parse('2026-07-13T10:00:00.000Z'),
  });
  const { service } = createService({ matchedPreviewSessionService });
  const created = await service.analyzeImportPreview({ sessionId: SOURCE_SESSION_ID });

  const first = await service.getMatchedImportPreviewSession({ sessionId: created.sessionId });
  const second = await service.getMatchedImportPreviewSession({ sessionId: created.sessionId });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first.matchedPreview, second.matchedPreview);

  const wrongOwner = createService({
    profile: { id: 8, role: 'Admin' },
    matchedPreviewSessionService,
  });
  const denied = await wrongOwner.service.getMatchedImportPreviewSession({ sessionId: created.sessionId });
  assert.equal(denied.ok, false);
  assert.equal(denied.code, WORKFLOW_ERROR_CODES.SESSION_UNAVAILABLE);
});

test('getMatchedImportPreviewSession validates matched session id payload narrowly', async () => {
  const { service } = createService();

  assert.equal(
    (await service.getMatchedImportPreviewSession({ sessionId: SOURCE_SESSION_ID })).code,
    WORKFLOW_ERROR_CODES.INVALID_REQUEST
  );
  assert.equal(
    (await service.getMatchedImportPreviewSession({
      sessionId: 'inventory-import-matched-preview-11111111-1111-4111-8111-111111111111',
      ownerId: 7,
    })).code,
    WORKFLOW_ERROR_CODES.INVALID_REQUEST
  );
});

test('controller registers only narrow matching routes and delegates to workflow service', async () => {
  const controllerPath = path.join(root, 'src/main/features/inventory/inventory.controller.js');
  delete require.cache[require.resolve(controllerPath)];
  const handlers = new Map();
  const workflowCalls = [];
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        BrowserWindow: { fromWebContents: () => ({}) },
        dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
      };
    }
    if (request === './inventory.service') {
      return {
        listInventory: async () => ({ ok: true }),
        listMovements: async () => ({ ok: true }),
        adjustStock: async () => ({ ok: true }),
        updateProductImage: async () => ({ ok: true }),
      };
    }
    if (request === './inventory-import-preview.service') {
      return {
        requestImportPreview: async () => ({ ok: true }),
        getImportPreviewSession: async () => ({ ok: true }),
      };
    }
    if (request === './inventory-import-matching-workflow.service') {
      return {
        analyzeImportPreview: async (payload) => {
          workflowCalls.push(['analyze', payload]);
          return { ok: true, action: 'analyze' };
        },
        getMatchedImportPreviewSession: async (payload) => {
          workflowCalls.push(['session', payload]);
          return { ok: true, action: 'session' };
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const { registerInventoryRoutes } = require(controllerPath);
    registerInventoryRoutes({
      handle: (channel, handler) => handlers.set(channel, handler),
    });
    assert.equal(handlers.has('/inventory/import/matching/analyze'), true);
    assert.equal(handlers.has('/inventory/import/matching/session'), true);
    assert.equal(handlers.has('/inventory/import/commit'), false);

    assert.deepEqual(
      await handlers.get('/inventory/import/matching/analyze')({}, { sessionId: SOURCE_SESSION_ID }),
      { ok: true, action: 'analyze' }
    );
    assert.deepEqual(workflowCalls[0], ['analyze', { sessionId: SOURCE_SESSION_ID }]);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(controllerPath)];
  }
});

test('API, preload, and UI source expose matching read methods with read-only import preview UI', () => {
  const apiSource = fs.readFileSync(path.join(root, 'src/main/features/inventory/inventory.api.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(root, 'src/main/preload.js'), 'utf8');
  const htmlSource = fs.readFileSync(path.join(root, 'src/main/features/inventory/index.html'), 'utf8');
  const workflowSource = fs.readFileSync(
    path.join(root, 'src/main/features/inventory/inventory-import-matching-workflow.service.js'),
    'utf8'
  );

  assert.match(apiSource, /analyzeImportPreview/);
  assert.match(apiSource, /getMatchedImportPreviewSession/);
  assert.match(preloadSource, /\/inventory\/import\/matching\/analyze/);
  assert.match(preloadSource, /\/inventory\/import\/matching\/session/);
  assert.doesNotMatch(preloadSource, /ownerId:\s*ownerId|role:\s*role|fs\.|require\('fs'\)/);
  assert.match(htmlSource, /id="inventoryImportPreviewButton"/);
  assert.match(htmlSource, /data-tool-action="import-preview"[^>]*>Import CSV/);
  assert.match(htmlSource, /Execution is available only after backend preflight confirms/);
  assert.doesNotMatch(htmlSource, /Execute Import|Finalize Import|Commit Import|Import Now/);
  assert.doesNotMatch(workflowSource, /INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE/i);
});
