const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const {
  COMMIT_PLAN_ERROR_CODES,
  PRODUCT_ACTIONS,
  ROW_DISPOSITIONS,
  STOCK_ACTIONS,
  createInventoryImportCommitPlanDocument,
  validateInventoryImportCommitPlanDocument,
} = require('../../src/main/features/inventory/inventory-import-commit-plan.model');
const {
  COMMIT_PLAN_SESSION_ERROR_CODES,
  COMMIT_PLAN_SESSION_ID_PATTERN,
  validateInventoryImportCommitPlanSession,
} = require('../../src/main/features/inventory/inventory-import-commit-plan-session.model');
const {
  MAX_COMMIT_PLAN_SESSIONS,
  createInventoryImportCommitPlanSessionService,
} = require('../../src/main/features/inventory/inventory-import-commit-plan-session.service');
const {
  createInventoryImportMatchedPreviewDocument,
} = require('../../src/main/features/inventory/inventory-import-matched-preview.model');

const SOURCE_PREVIEW_SESSION_ID = 'inventory-import-preview-11111111-1111-4111-8111-111111111111';
const SOURCE_PREVIEW_ID = 'inventory-import-preview-document-22222222-2222-4222-8222-222222222222';
const MATCHED_PREVIEW_SESSION_ID = 'inventory-import-matched-preview-33333333-3333-4333-8333-333333333333';

function deepFreeze(value) {
  const seen = new Set();
  function visit(item) {
    if (!item || typeof item !== 'object' || seen.has(item)) return item;
    seen.add(item);
    Object.values(item).forEach(visit);
    Object.freeze(item);
    return item;
  }
  return visit(value);
}

function finding(code, severity = 'ERROR', field = null, metadata = {}) {
  return {
    code,
    field,
    sourceRowNumber: 1,
    severity,
    source: 'phase5b',
    relatedIdentifier: null,
    conflictGroupId: null,
    metadata,
  };
}

function row({
  sourceRowNumber = 1,
  status = 'MATCHING_ELIGIBLE',
  classification = 'POTENTIAL_NEW_PRODUCT',
  matchedProduct = null,
  openingQuantity = '0',
  sku = `SKU-${sourceRowNumber}`,
  barcode = `BAR${sourceRowNumber}000`,
  productName = `Product ${sourceRowNumber}`,
  costPrice = '10.00',
  sellingPrice = '12.00',
  findings = [],
  evidence = {},
} = {}) {
  return {
    sourceRowNumber,
    phase3Row: {
      sourceRowNumber,
      status: openingQuantity === '0' ? 'PRODUCT_ONLY_CANDIDATE' : 'STOCK_ROW_CANDIDATE',
      normalized: {
        productName,
        sku,
        barcode,
        category: evidence.categoryName || '',
        brand: '',
        unit: '',
        variant: '',
        costPrice,
        sellingPrice,
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
    classification,
    status,
    eligible: status === 'MATCHING_ELIGIBLE',
    matchedBy: matchedProduct ? 'SKU' : 'NONE',
    matchedProduct,
    evidence: {
      normalizedSku: String(sku || '').toLowerCase(),
      normalizedBarcode: String(barcode || '').toLowerCase(),
      skuMatchProductIds: matchedProduct ? [matchedProduct.productId] : [],
      barcodeMatchProductIds: [],
      catalogResolution: {
        category: {
          supplied: Boolean(evidence.categoryName),
          normalizedName: evidence.categoryName ? String(evidence.categoryName).toLowerCase() : '',
          resolvedId: evidence.categoryId || null,
          matches: evidence.categoryId
            ? [
                {
                  id: evidence.categoryId,
                  name: evidence.categoryName,
                  active: true,
                  deleted: false,
                  updatedAt: '2026-01-01T00:00:00.000Z',
                },
              ]
            : [],
          findings: [],
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
    matchingFindings: findings,
  };
}

function product(id = 10) {
  return {
    productId: id,
    sku: `SKU-${id}`,
    barcode: `BAR${id}000`,
    productName: `Existing ${id}`,
    active: true,
    deleted: false,
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

function matchedPreview(rows) {
  return createInventoryImportMatchedPreviewDocument({
    sourcePreviewSessionId: SOURCE_PREVIEW_SESSION_ID,
    sourcePreviewId: SOURCE_PREVIEW_ID,
    sourceDocumentVersion: 'inventory-import-v1',
    matchedAt: '2026-01-03T00:00:00.000Z',
    sourceBasename: 'inventory-import.csv',
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
}

function planFromRows(rows) {
  return createInventoryImportCommitPlanDocument({
    matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
    matchedPreviewDocument: matchedPreview(rows),
  });
}

test('Phase 5F creates deterministic commit plans for existing, new, stock, empty, blocked, and unsupported rows', () => {
  const rows = [
    row({ sourceRowNumber: 1, matchedProduct: product(1), classification: 'EXISTING_PRODUCT_CANDIDATE' }),
    row({
      sourceRowNumber: 2,
      matchedProduct: product(2),
      classification: 'EXISTING_PRODUCT_CANDIDATE',
      openingQuantity: '5.250',
      evidence: { inventoryTargetId: 200 },
    }),
    row({ sourceRowNumber: 3, classification: 'POTENTIAL_NEW_PRODUCT' }),
    row({ sourceRowNumber: 4, status: 'EMPTY_ROW', classification: 'EMPTY_ROW', sku: '', barcode: '', productName: '' }),
    row({
      sourceRowNumber: 5,
      status: 'DUPLICATE_INPUT',
      classification: 'DUPLICATE_INPUT',
      findings: [finding('DUPLICATE_INPUT')],
    }),
    row({
      sourceRowNumber: 6,
      status: 'MATCHING_ELIGIBLE',
      matchedProduct: product(6),
      classification: 'EXISTING_PRODUCT_CANDIDATE',
      findings: [finding('METADATA_MISMATCH', 'WARNING', 'sellingPrice')],
    }),
    row({ sourceRowNumber: 7, status: 'METADATA_MISMATCH', classification: 'METADATA_MISMATCH' }),
  ];
  const plan = planFromRows(rows);

  assert.equal(plan.kind, 'inventory_import_commit_plan_document');
  assert.equal(plan.version, 'inventory-import-commit-plan-v1');
  assert.equal(plan.databaseWrite, false);
  assert.equal(plan.commitReady, false);
  assert.equal(plan.requiresRevalidation, true);
  assert.match(plan.planDigest, /^[0-9a-f]{64}$/);
  assert.equal(plan.sourceMatchedPreviewSessionId, MATCHED_PREVIEW_SESSION_ID);
  assert.equal(plan.sourceMatchingDigest, matchedPreview(rows).matchingDigest);

  assert.equal(plan.planRows[0].productAction, PRODUCT_ACTIONS.USE_EXISTING_PRODUCT);
  assert.equal(plan.planRows[0].stockAction, STOCK_ACTIONS.NO_STOCK_ACTION);
  assert.equal(plan.planRows[1].stockAction, STOCK_ACTIONS.APPLY_OPENING_STOCK);
  assert.equal(plan.planRows[1].normalizedSource.openingQuantity, '5.250');
  assert.equal(plan.planRows[2].productAction, PRODUCT_ACTIONS.CREATE_PRODUCT);
  assert.equal(plan.planRows[3].disposition, ROW_DISPOSITIONS.SKIPPED);
  assert.equal(plan.planRows[4].blocked, true);
  assert.equal(plan.planRows[5].unsupportedActions.includes('UPDATE_PRODUCT_METADATA'), true);
  assert.equal(plan.planRows[5].productAction, PRODUCT_ACTIONS.USE_EXISTING_PRODUCT);
  assert.equal(plan.planRows[6].disposition, ROW_DISPOSITIONS.UNSUPPORTED);

  assert.deepEqual(plan.planSummary, {
    totalRows: 7,
    executableRows: 4,
    blockedRows: 1,
    createProductRows: 1,
    existingProductRows: 3,
    openingStockRows: 1,
    noStockRows: 6,
    emptyRows: 1,
    warningRows: 1,
    permissionBlockedRows: 0,
    duplicateRows: 1,
    ambiguousRows: 0,
    unsupportedRows: 1,
  });
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.planRows[0].staleEvidence), true);
  validateInventoryImportCommitPlanDocument(plan);
});

test('Phase 5F blocks barcode-less new product plans without generating barcode evidence', () => {
  const barcodeLessRows = [
    row({
      sourceRowNumber: 1,
      classification: 'POTENTIAL_NEW_PRODUCT',
      status: 'MATCHING_ELIGIBLE',
      barcode: '',
      openingQuantity: '3.000',
    }),
    row({
      sourceRowNumber: 2,
      classification: 'POTENTIAL_NEW_PRODUCT',
      status: 'MATCHING_ELIGIBLE',
      barcode: '   ',
    }),
    row({
      sourceRowNumber: 3,
      classification: 'POTENTIAL_NEW_PRODUCT',
      status: 'MATCHING_ELIGIBLE',
      barcode: null,
    }),
  ];
  const first = planFromRows(barcodeLessRows);
  const second = planFromRows(barcodeLessRows);

  first.planRows.forEach((planRow) => {
    assert.notEqual(planRow.productAction, PRODUCT_ACTIONS.CREATE_PRODUCT);
    assert.notEqual(planRow.stockAction, STOCK_ACTIONS.APPLY_OPENING_STOCK);
    assert.equal(planRow.productAction, PRODUCT_ACTIONS.BLOCKED);
    assert.equal(planRow.disposition, ROW_DISPOSITIONS.BLOCKED);
    assert.equal(planRow.planningEligible, false);
    assert.equal(planRow.blocked, true);
    assert.equal(planRow.blockReasonCodes.includes('MISSING_REQUIRED_BARCODE'), true);
  });
  assert.deepEqual(first.planSummary, {
    totalRows: 3,
    executableRows: 0,
    blockedRows: 3,
    createProductRows: 0,
    existingProductRows: 0,
    openingStockRows: 0,
    noStockRows: 2,
    emptyRows: 0,
    warningRows: 0,
    permissionBlockedRows: 0,
    duplicateRows: 0,
    ambiguousRows: 0,
    unsupportedRows: 0,
  });
  assert.equal(first.commitReady, false);
  assert.equal(first.requiresRevalidation, true);
  assert.equal(first.planDigest, second.planDigest);
  validateInventoryImportCommitPlanDocument(first);
});

test('Phase 5F preserves valid barcode new-product planning and existing-product SKU matching', () => {
  const validBarcode = row({
    sourceRowNumber: 1,
    classification: 'POTENTIAL_NEW_PRODUCT',
    status: 'MATCHING_ELIGIBLE',
    barcode: 'BAR-VALID-001',
    openingQuantity: '4.000',
  });
  const existingWithoutSourceBarcode = row({
    sourceRowNumber: 2,
    matchedProduct: product(2),
    classification: 'EXISTING_PRODUCT_CANDIDATE',
    status: 'MATCHING_ELIGIBLE',
    barcode: '',
  });
  const validPlan = planFromRows([validBarcode, existingWithoutSourceBarcode]);
  const missingBarcodePlan = planFromRows([
    row({
      sourceRowNumber: 1,
      classification: 'POTENTIAL_NEW_PRODUCT',
      status: 'MATCHING_ELIGIBLE',
      barcode: '',
      openingQuantity: '4.000',
    }),
  ]);

  assert.equal(validPlan.planRows[0].productAction, PRODUCT_ACTIONS.CREATE_PRODUCT);
  assert.equal(validPlan.planRows[0].stockAction, STOCK_ACTIONS.APPLY_OPENING_STOCK);
  assert.equal(validPlan.planRows[0].normalizedSource.barcode, 'BAR-VALID-001');
  assert.equal(validPlan.planRows[0].staleEvidence.normalizedBarcode, 'bar-valid-001');
  assert.equal(validPlan.planRows[1].productAction, PRODUCT_ACTIONS.USE_EXISTING_PRODUCT);
  assert.equal(validPlan.planRows[1].stockAction, STOCK_ACTIONS.NO_STOCK_ACTION);
  assert.deepEqual(validPlan.planSummary, {
    totalRows: 2,
    executableRows: 2,
    blockedRows: 0,
    createProductRows: 1,
    existingProductRows: 1,
    openingStockRows: 1,
    noStockRows: 1,
    emptyRows: 0,
    warningRows: 0,
    permissionBlockedRows: 0,
    duplicateRows: 0,
    ambiguousRows: 0,
    unsupportedRows: 0,
  });
  assert.notEqual(validPlan.planDigest, missingBarcodePlan.planDigest);
  validateInventoryImportCommitPlanDocument(validPlan);
});

test('Phase 5F conservatively blocks unsupported product, catalog, warehouse, inventory, permission, and ambiguity states', () => {
  const cases = [
    row({ sourceRowNumber: 1, productName: '', status: 'MATCHING_ELIGIBLE', classification: 'POTENTIAL_NEW_PRODUCT' }),
    row({
      sourceRowNumber: 2,
      status: 'MISSING_CATALOG_REFERENCE',
      findings: [finding('MISSING_CATALOG_REFERENCE', 'ERROR', 'category')],
    }),
    row({
      sourceRowNumber: 3,
      status: 'MATCHING_FAILED',
      openingQuantity: '1',
      findings: [finding('DEFAULT_WAREHOUSE_MISSING')],
    }),
    row({
      sourceRowNumber: 4,
      matchedProduct: product(4),
      classification: 'EXISTING_PRODUCT_CANDIDATE',
      openingQuantity: '2',
      evidence: { inventoryTargetId: 404 },
      findings: [finding('EXISTING_STOCK_PRESENT', 'ERROR', null, { quantity: '1.000' })],
      status: 'OPENING_STOCK_NOT_ALLOWED',
    }),
    row({
      sourceRowNumber: 5,
      matchedProduct: product(5),
      classification: 'EXISTING_PRODUCT_CANDIDATE',
      openingQuantity: '2',
      evidence: { inventoryTargetId: 405, movementCount: 1 },
      findings: [finding('PRIOR_STOCK_MOVEMENT_EXISTS')],
      status: 'OPENING_STOCK_NOT_ALLOWED',
    }),
    row({
      sourceRowNumber: 6,
      status: 'PERMISSION_RESTRICTED',
      evidence: { canCreateProduct: false },
      findings: [finding('PERMISSION_RESTRICTED', 'ERROR', 'products.create')],
    }),
    row({
      sourceRowNumber: 7,
      status: 'IDENTIFIER_CONFLICT',
      findings: [finding('IDENTIFIER_CONFLICT')],
    }),
    row({
      sourceRowNumber: 8,
      status: 'DUPLICATE_IN_DATABASE',
      findings: [finding('DUPLICATE_IN_DATABASE')],
    }),
    row({
      sourceRowNumber: 9,
      matchedProduct: product(9),
      status: 'DUPLICATE_PRODUCT_TARGET',
      findings: [finding('DUPLICATE_PRODUCT_TARGET')],
    }),
    row({
      sourceRowNumber: 10,
      matchedProduct: product(10),
      status: 'INACTIVE_PRODUCT_MATCH',
      findings: [finding('INACTIVE_PRODUCT_MATCH')],
    }),
    row({
      sourceRowNumber: 11,
      status: 'DELETED_PRODUCT_MATCH',
      findings: [finding('DELETED_PRODUCT_MATCH')],
    }),
    row({
      sourceRowNumber: 12,
      matchedProduct: product(12),
      status: 'INVENTORY_TARGET_MISSING',
      openingQuantity: '1',
      findings: [finding('INVENTORY_TARGET_MISSING')],
    }),
  ];
  const plan = planFromRows(cases);
  assert.equal(plan.planSummary.blockedRows, cases.length);
  assert.equal(plan.planSummary.permissionBlockedRows, 1);
  assert.equal(plan.planSummary.ambiguousRows, 3);
  assert.equal(plan.planSummary.duplicateRows, 2);
  assert(plan.planRows.every((planRow) => planRow.productAction === PRODUCT_ACTIONS.BLOCKED));
  assert(plan.planRows.every((planRow) => planRow.disposition === ROW_DISPOSITIONS.BLOCKED));
});

test('Phase 5F rejects unknown status, unsupported matched preview, unsafe input, and contradictory plan documents', () => {
  assert.throws(
    () => planFromRows([row({ status: 'VALID_EXISTING_PRODUCT' })]),
    /unsupported/
  );
  assert.throws(
    () =>
      createInventoryImportCommitPlanDocument({
        matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
        matchedPreviewDocument: { kind: 'wrong' },
      }),
    /matched preview/
  );
  assert.throws(
    () =>
      createInventoryImportCommitPlanDocument({
        matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
        matchedPreviewDocument: matchedPreview([row()]),
        rows: [],
      }),
    /unsupported fields/
  );
  assert.throws(
    () =>
      createInventoryImportCommitPlanDocument({
        matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
        matchedPreviewDocument: new Map(),
      }),
    /plain data|matched preview/
  );
  const plan = planFromRows([row()]);
  const badSummary = deepFreeze({
    ...JSON.parse(JSON.stringify(plan)),
    planSummary: { ...plan.planSummary, totalRows: 99 },
  });
  assert.throws(() => validateInventoryImportCommitPlanDocument(badSummary), /deterministic|inconsistent/);
  const badBlockedAction = deepFreeze({
    ...JSON.parse(JSON.stringify(plan)),
    planRows: [
      {
        ...plan.planRows[0],
        blocked: true,
        disposition: ROW_DISPOSITIONS.BLOCKED,
        productAction: PRODUCT_ACTIONS.CREATE_PRODUCT,
      },
    ],
  });
  assert.throws(() => validateInventoryImportCommitPlanDocument(badBlockedAction), /Blocked rows/);
});

test('Phase 5F digest is deterministic, excludes session and owner lifecycle, preserves decimals, and does not mutate source', () => {
  const rows = [
    row({
      sourceRowNumber: 1,
      openingQuantity: '0005.250',
      costPrice: '10.50',
      sellingPrice: '12.00',
    }),
  ];
  const source = matchedPreview(rows);
  const before = JSON.stringify(source);
  const first = createInventoryImportCommitPlanDocument({
    matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
    matchedPreviewDocument: source,
  });
  const second = createInventoryImportCommitPlanDocument({
    matchedPreviewDocument: source,
    matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
  });
  assert.equal(first.planDigest, second.planDigest);
  assert.deepEqual(first.planRows, second.planRows);
  assert.equal(JSON.stringify(source), before);
  assert.equal(first.planRows[0].normalizedSource.costPrice, '10.50');
  assert.equal(first.planRows[0].normalizedSource.openingQuantity, '0005.250');
});

test('Phase 5F rejects executable, custom, circular, and Electron-like plain-data violations', () => {
  class CustomInput {}
  const circular = {};
  circular.self = circular;
  const unsafeValues = [
    { callback: () => null },
    { nested: { fn: function nope() {} } },
    { value: new CustomInput() },
    { value: Object.create({ inherited: true }) },
    { value: new Map() },
    { value: new Set() },
    circular,
    { value: { webContents: { send: () => null } } },
  ];
  unsafeValues.forEach((unsafe) => {
    assert.throws(
      () =>
        createInventoryImportCommitPlanDocument({
          matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
          matchedPreviewDocument: unsafe,
        }),
      /plain|executable|circular|matched preview/
    );
  });
});

test('Phase 5F session service creates retained owner-bound sessions with backend ids and immutable safe responses', () => {
  const service = createInventoryImportCommitPlanSessionService({
    now: () => 1000,
    sessionIdFactory: () => 'inventory-import-commit-plan-44444444-4444-4444-8444-444444444444',
  });
  const source = matchedPreview([row()]);
  const result = service.createCommitPlanSession({
    ownerId: 10,
    matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
    matchedPreviewDocument: source,
  });
  assert.equal(result.ok, true);
  assert.match(result.commitPlanSession.sessionId, COMMIT_PLAN_SESSION_ID_PATTERN);
  assert.equal(result.commitPlanSession.createdAt, 1000);
  assert.equal(result.commitPlanSession.expiresAt, 601000);
  assert.equal(result.commitPlanSession.databaseWrite, false);
  assert.equal(Object.isFrozen(result.commitPlan), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.commitPlanSession), true);
  const stored = service.getCommitPlanSession({
    ownerId: 10,
    sessionId: result.commitPlanSession.sessionId,
  });
  assert.equal(stored.ok, true);
  assert.equal(stored.commitPlan.planDigest, result.commitPlan.planDigest);
  assert.equal(
    service.getCommitPlanSession({ ownerId: 10, sessionId: result.commitPlanSession.sessionId }).ok,
    true
  );
});

test('Phase 5F session model validates immutable sessions and rejects invalid ids or owners', () => {
  const service = createInventoryImportCommitPlanSessionService({
    now: () => 500,
    sessionIdFactory: () => 'inventory-import-commit-plan-55555555-5555-4555-8555-555555555555',
  });
  const result = service.createCommitPlanSession({
    ownerId: 1,
    matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
    matchedPreviewDocument: matchedPreview([row()]),
  });
  const stored = service._sessions.get(result.commitPlanSession.sessionId).session;
  assert.equal(Object.isFrozen(stored), true);
  validateInventoryImportCommitPlanSession(stored);
  assert.equal(
    service.getCommitPlanSession({ ownerId: 1, sessionId: 'not-a-session' }).code,
    COMMIT_PLAN_SESSION_ERROR_CODES.INVALID_SESSION
  );
  assert.equal(
    service.createCommitPlanSession({
      ownerId: 'bad',
      matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
      matchedPreviewDocument: matchedPreview([row()]),
    }).ok,
    false
  );
  assert.equal(
    service.createCommitPlanSession({
      ownerId: 1,
      sessionId: 'inventory-import-commit-plan-99999999-9999-4999-8999-999999999999',
      matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
      matchedPreviewDocument: matchedPreview([row()]),
    }).code,
    COMMIT_PLAN_ERROR_CODES.INVALID_INPUT
  );
});

test('Phase 5F session lifecycle enforces owner binding, expiry, replacement, previous-session preservation, and non-consumption', () => {
  let currentTime = 1000;
  let id = 1;
  const service = createInventoryImportCommitPlanSessionService({
    now: () => currentTime,
    sessionIdFactory: () =>
      `inventory-import-commit-plan-66666666-6666-4666-8666-${String(id++).padStart(12, '0')}`,
  });
  const source = matchedPreview([row()]);
  const first = service.createCommitPlanSession({
    ownerId: 1,
    matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
    matchedPreviewDocument: source,
  });
  assert.equal(service.getCommitPlanSession({ ownerId: 2, sessionId: first.commitPlanSession.sessionId }).code, COMMIT_PLAN_SESSION_ERROR_CODES.OWNER_MISMATCH);
  const failed = service.createCommitPlanSession({
    ownerId: 1,
    matchedPreviewSessionId: 'bad',
    matchedPreviewDocument: source,
  });
  assert.equal(failed.ok, false);
  assert.equal(service.getCommitPlanSession({ ownerId: 1, sessionId: first.commitPlanSession.sessionId }).ok, true);
  const second = service.createCommitPlanSession({
    ownerId: 1,
    matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
    matchedPreviewDocument: source,
  });
  assert.equal(service.getCommitPlanSession({ ownerId: 1, sessionId: first.commitPlanSession.sessionId }).code, COMMIT_PLAN_SESSION_ERROR_CODES.NOT_FOUND);
  assert.equal(service.getCommitPlanSession({ ownerId: 1, sessionId: second.commitPlanSession.sessionId }).ok, true);
  currentTime = 601000;
  assert.equal(service.getCommitPlanSession({ ownerId: 1, sessionId: second.commitPlanSession.sessionId }).code, COMMIT_PLAN_SESSION_ERROR_CODES.EXPIRED);
  assert.equal(service.getCommitPlanSessionCount(), 0);
});

test('Phase 5F session capacity cleans expired sessions and evicts oldest active session deterministically', () => {
  let currentTime = 1000;
  let id = 1;
  const service = createInventoryImportCommitPlanSessionService({
    now: () => currentTime,
    maxCommitPlanSessions: MAX_COMMIT_PLAN_SESSIONS,
    sessionIdFactory: () =>
      `inventory-import-commit-plan-77777777-7777-4777-8777-${String(id++).padStart(12, '0')}`,
  });
  const created = [];
  for (let ownerId = 1; ownerId <= MAX_COMMIT_PLAN_SESSIONS; ownerId += 1) {
    currentTime += 1;
    created.push(
      service.createCommitPlanSession({
        ownerId,
        matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
        matchedPreviewDocument: matchedPreview([row({ sourceRowNumber: ownerId })]),
      }).commitPlanSession.sessionId
    );
  }
  assert.equal(service.getCommitPlanSessionCount(), MAX_COMMIT_PLAN_SESSIONS);
  currentTime += 1;
  const extra = service.createCommitPlanSession({
    ownerId: 99,
    matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
    matchedPreviewDocument: matchedPreview([row({ sourceRowNumber: 99 })]),
  });
  assert.equal(extra.ok, true);
  assert.equal(service.getCommitPlanSessionCount(), MAX_COMMIT_PLAN_SESSIONS);
  assert.equal(service.getCommitPlanSession({ ownerId: 1, sessionId: created[0] }).code, COMMIT_PLAN_SESSION_ERROR_CODES.NOT_FOUND);
});

test('Phase 5F repeated equivalent sessions get new ids but preserve plan digest', () => {
  let id = 1;
  const service = createInventoryImportCommitPlanSessionService({
    now: () => 1000,
    sessionIdFactory: () =>
      `inventory-import-commit-plan-88888888-8888-4888-8888-${String(id++).padStart(12, '0')}`,
  });
  const source = matchedPreview([row()]);
  const first = service.createCommitPlanSession({
    ownerId: 1,
    matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
    matchedPreviewDocument: source,
  });
  const second = service.createCommitPlanSession({
    ownerId: 1,
    matchedPreviewSessionId: MATCHED_PREVIEW_SESSION_ID,
    matchedPreviewDocument: source,
  });
  assert.notEqual(first.commitPlanSession.sessionId, second.commitPlanSession.sessionId);
  assert.equal(first.commitPlan.planDigest, second.commitPlan.planDigest);
});

test('Phase 5F production files stay backend-only, read-only, and isolated from public wiring', () => {
  const files = [
    'src/main/features/inventory/inventory-import-commit-plan.model.js',
    'src/main/features/inventory/inventory-import-commit-plan-session.model.js',
    'src/main/features/inventory/inventory-import-commit-plan-session.service.js',
  ];
  const forbidden = [
    'database/connection',
    'repository',
    'product.service',
    'inventory.service',
    'stock_movement',
    'activity',
    'withTransaction',
    'ipcMain',
    'ipcRenderer',
    'BrowserWindow',
    'INSERT ',
    'UPDATE ',
    'DELETE ',
    'SELECT ',
  ];
  files.forEach((file) => {
    const content = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    forbidden.forEach((pattern) => {
      assert.equal(content.includes(pattern), false, `${file} must not contain ${pattern}`);
    });
  });
});
