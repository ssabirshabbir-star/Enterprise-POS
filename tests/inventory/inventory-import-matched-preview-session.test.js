const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createImportPreviewDocument,
  createImportPreviewSession,
} = require('../../src/main/features/inventory/inventory-import-preview-session.model');
const {
  MATCHED_PREVIEW_DOCUMENT_KIND,
  MATCHED_PREVIEW_DOCUMENT_VERSION,
  MATCHED_PREVIEW_ERROR_CODES,
  createInventoryImportMatchedPreviewDocument,
  validateInventoryImportMatchedPreviewDocument,
} = require('../../src/main/features/inventory/inventory-import-matched-preview.model');
const {
  MATCHED_PREVIEW_SESSION_ID_PATTERN,
  createInventoryImportMatchedPreviewSession,
} = require('../../src/main/features/inventory/inventory-import-matched-preview-session.model');
const {
  MAX_MATCHED_PREVIEW_SESSIONS,
  MATCHED_PREVIEW_SESSION_TTL_MS,
  createInventoryImportMatchedPreviewSessionService,
} = require('../../src/main/features/inventory/inventory-import-matched-preview-session.service');
const { analyzeInventoryImportMatches } = require('../../src/main/features/inventory/inventory-import-matching.service');
const { createProductMatch } = require('../../src/main/features/inventory/inventory-import-matching.contract');
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

function matchingAnalysis(rows = [phase3Row()]) {
  return analyzeInventoryImportMatches({
    rows,
    productsResult: { ok: true, products: [product()] },
    catalogsResult: { ok: true, catalogs: { category: [], brand: [], unit: [], variant: [] } },
    warehouseResult: { ok: true, warehouse: null },
    inventoryTargetsResult: { ok: true, inventoryTargets: [] },
    movementSummariesResult: { ok: true, movementSummaries: [] },
    permissionContext: { role: 'Admin' },
  });
}

function sourcePreview(rowCount = 1) {
  return createImportPreviewDocument({
    previewId: SOURCE_PREVIEW_ID,
    createdAt: '2026-07-13T10:00:00.000Z',
    templateVersion: 'inventory-import-v1',
    sourceFile: { fileName: 'opening-stock.csv', sizeBytes: 128, lastModifiedMs: 123 },
    permissions: { canPreviewImport: true },
    summary: { totalRows: rowCount },
    rows: Array.from({ length: rowCount }, (_, index) => ({ sourceRowNumber: index + 2 })),
    errors: [],
    warnings: [],
  });
}

function createDocument(overrides = {}) {
  return createInventoryImportMatchedPreviewDocument({
    sourcePreviewSessionId: SOURCE_SESSION_ID,
    sourcePreview: sourcePreview(),
    matchedAt: '2026-07-13T10:05:00.000Z',
    matchingAnalysis: matchingAnalysis(),
    ...overrides,
  });
}

test('matched preview document preserves Phase 4 linkage and Phase 5B analysis as immutable plain data', () => {
  const analysis = matchingAnalysis();
  const before = JSON.stringify(analysis);
  const document = createDocument({ matchingAnalysis: analysis });

  assert.equal(document.kind, MATCHED_PREVIEW_DOCUMENT_KIND);
  assert.equal(document.version, MATCHED_PREVIEW_DOCUMENT_VERSION);
  assert.equal(document.sourcePreviewSessionId, SOURCE_SESSION_ID);
  assert.equal(document.sourcePreviewId, SOURCE_PREVIEW_ID);
  assert.equal(document.sourceDocumentVersion, 'inventory-import-v1');
  assert.equal(document.sourceBasename, 'opening-stock.csv');
  assert.equal(document.sourceRowCount, 1);
  assert.equal(document.rowCount, 1);
  assert.deepEqual(document.matchingSummary, analysis.summary);
  assert.deepEqual(document.matchedRows, analysis.rows);
  assert.equal(document.databaseWrite, false);
  assert.equal(document.commitReady, false);
  assert.equal(JSON.stringify(analysis), before);
  assert(Object.isFrozen(document));
  assert(Object.isFrozen(document.matchedRows[0]));
  assert(Object.isFrozen(document.matchingSummary));
  assert.equal(validateInventoryImportMatchedPreviewDocument(document), document);
});

test('matched preview document rejects unsafe payloads, malformed timestamps, source ids, and row mismatches', () => {
  assert.throws(
    () => createDocument({ matchingAnalysis: { ...matchingAnalysis(), rows: [{ fn() {} }] } }),
    /executable/
  );
  class CustomPayload {
    constructor() {
      this.kind = 'inventory_import_matching_analysis';
    }
  }
  assert.throws(() => createDocument({ matchingAnalysis: new CustomPayload() }), /plain data/);
  assert.throws(
    () => createDocument({ matchingAnalysis: { ...matchingAnalysis(), error: new Error('boom') } }),
    /plain data/
  );
  assert.throws(
    () => createDocument({ matchingAnalysis: { ...matchingAnalysis(), buffer: Buffer.from('x') } }),
    /plain data/
  );
  const circular = JSON.parse(JSON.stringify(matchingAnalysis()));
  circular.loop = circular;
  assert.throws(() => createDocument({ matchingAnalysis: circular }), /circular/);
  assert.throws(() => createDocument({ matchedAt: 'not-a-date' }), /matchedAt/);
  assert.throws(() => createDocument({ sourcePreviewSessionId: 'inventory-import-preview-bad' }), /session id/);
  assert.throws(
    () => createDocument({ sourcePreview: sourcePreview(2), matchingAnalysis: matchingAnalysis() }),
    /row counts/
  );
});

test('matching digest is deterministic and excludes session, owner, and timestamps', () => {
  const first = createDocument({ matchedAt: '2026-07-13T10:05:00.000Z' });
  const second = createDocument({ matchedAt: '2026-07-13T11:05:00.000Z' });
  assert.equal(first.matchingDigest, second.matchingDigest);

  const changedRows = matchingAnalysis([
    phase3Row({ sourceRowNumber: 3, normalized: { ...phase3Row().normalized, sku: 'RICE-6' } }),
  ]);
  const changed = createDocument({ matchingAnalysis: changedRows });
  assert.notEqual(first.matchingDigest, changed.matchingDigest);

  const changedFinding = matchingAnalysis([
    phase3Row({
      normalized: { ...phase3Row().normalized, productName: 'Different Name' },
    }),
  ]);
  const findingDocument = createDocument({ matchingAnalysis: changedFinding });
  assert.notEqual(first.matchingDigest, findingDocument.matchingDigest);
});

test('matched preview session validates namespace, owner, TTL, linkage, and immutability', () => {
  const session = createInventoryImportMatchedPreviewSession({
    sessionId: 'inventory-import-matched-preview-33333333-3333-4333-8333-333333333333',
    ownerId: 7,
    createdAt: 1000,
    expiresAt: 1000 + MATCHED_PREVIEW_SESSION_TTL_MS,
    matchedPreviewDocument: createDocument(),
  });
  assert.match(session.sessionId, MATCHED_PREVIEW_SESSION_ID_PATTERN);
  assert.equal(session.ownerId, 7);
  assert.equal(session.expiresAt - session.createdAt, MATCHED_PREVIEW_SESSION_TTL_MS);
  assert.equal(session.sourcePreviewSessionId, SOURCE_SESSION_ID);
  assert.equal(session.sourcePreviewId, SOURCE_PREVIEW_ID);
  assert(Object.isFrozen(session));
  assert(Object.isFrozen(session.matchedPreviewDocument.matchedRows[0].matchingFindings));
  session.ownerId = 99;
  assert.equal(session.ownerId, 7);

  assert.throws(
    () => createInventoryImportMatchedPreviewSession({ ...session, sessionId: SOURCE_SESSION_ID }),
    /matched preview session id/
  );
  assert.throws(() => createInventoryImportMatchedPreviewSession({ ...session, ownerId: 0 }), /owner/);
  assert.throws(() => createInventoryImportMatchedPreviewSession({ ...session, expiresAt: 1000 }), /expiry/);
});

test('matched preview service creates retained owner-bound sessions and does not mutate source preview sessions', () => {
  let time = 1000;
  const service = createInventoryImportMatchedPreviewSessionService({ now: () => time });
  const source = sourcePreview();
  const sourceSession = createImportPreviewSession({
    sessionId: SOURCE_SESSION_ID,
    ownerUserId: 7,
    createdAt: 500,
    expiresAt: 500 + MATCHED_PREVIEW_SESSION_TTL_MS,
    preview: source,
  });
  const before = JSON.stringify(sourceSession);
  const created = service.createMatchedPreviewSession({
    ownerId: 7,
    sourcePreviewSessionId: sourceSession.sessionId,
    sourcePreview: sourceSession.preview,
    matchingAnalysis: matchingAnalysis(),
  });

  assert.equal(created.ok, true);
  assert.match(created.matchedPreviewSession.sessionId, MATCHED_PREVIEW_SESSION_ID_PATTERN);
  assert.equal(created.matchedPreviewSession.createdAt, 1000);
  assert.equal(created.matchedPreviewSession.expiresAt, 1000 + MATCHED_PREVIEW_SESSION_TTL_MS);
  assert.equal(JSON.stringify(sourceSession), before);

  const firstRead = service.getMatchedPreviewSession({
    sessionId: created.matchedPreviewSession.sessionId,
    ownerId: 7,
  });
  const secondRead = service.getMatchedPreviewSession({
    sessionId: created.matchedPreviewSession.sessionId,
    ownerId: 7,
  });
  assert.equal(firstRead.ok, true);
  assert.equal(secondRead.ok, true);
  assert.deepEqual(firstRead.matchedPreview, secondRead.matchedPreview);
  assert.equal(service.getMatchedPreviewSessionCount(), 1);
});

test('matched preview service fails closed for missing, malformed, cross-owner, and expired retrieval', () => {
  let time = 1000;
  const service = createInventoryImportMatchedPreviewSessionService({ now: () => time });
  const created = service.createMatchedPreviewSession({
    ownerId: 7,
    sourcePreviewSessionId: SOURCE_SESSION_ID,
    sourcePreview: sourcePreview(),
    matchingAnalysis: matchingAnalysis(),
  });
  assert.equal(service.getMatchedPreviewSession({ sessionId: created.matchedPreviewSession.sessionId }).ok, false);
  assert.equal(
    service.getMatchedPreviewSession({ sessionId: created.matchedPreviewSession.sessionId, ownerId: 8 }).code,
    MATCHED_PREVIEW_ERROR_CODES.OWNER_MISMATCH
  );
  assert.equal(
    service.getMatchedPreviewSession({
      sessionId: 'inventory-import-matched-preview-99999999-9999-4999-8999-999999999999',
      ownerId: 7,
    }).code,
    MATCHED_PREVIEW_ERROR_CODES.NOT_FOUND
  );
  time = 1000 + MATCHED_PREVIEW_SESSION_TTL_MS;
  assert.equal(
    service.getMatchedPreviewSession({ sessionId: created.matchedPreviewSession.sessionId, ownerId: 7 }).code,
    MATCHED_PREVIEW_ERROR_CODES.EXPIRED
  );
  assert.equal(service.getMatchedPreviewSessionCount(), 0);
});

test('matched preview service enforces one active session per owner without affecting other owners', () => {
  let time = 1000;
  const service = createInventoryImportMatchedPreviewSessionService({ now: () => time });
  const first = service.createMatchedPreviewSession({
    ownerId: 7,
    sourcePreviewSessionId: SOURCE_SESSION_ID,
    sourcePreview: sourcePreview(),
    matchingAnalysis: matchingAnalysis(),
  });
  time += 1;
  const other = service.createMatchedPreviewSession({
    ownerId: 8,
    sourcePreviewSessionId: SOURCE_SESSION_ID,
    sourcePreview: sourcePreview(),
    matchingAnalysis: matchingAnalysis(),
  });
  time += 1;
  const second = service.createMatchedPreviewSession({
    ownerId: 7,
    sourcePreviewSessionId: SOURCE_SESSION_ID,
    sourcePreview: sourcePreview(),
    matchingAnalysis: matchingAnalysis(),
  });

  assert.equal(
    service.getMatchedPreviewSession({ sessionId: first.matchedPreviewSession.sessionId, ownerId: 7 }).code,
    MATCHED_PREVIEW_ERROR_CODES.NOT_FOUND
  );
  assert.equal(
    service.getMatchedPreviewSession({ sessionId: second.matchedPreviewSession.sessionId, ownerId: 7 }).ok,
    true
  );
  assert.equal(
    service.getMatchedPreviewSession({ sessionId: other.matchedPreviewSession.sessionId, ownerId: 8 }).ok,
    true
  );
});

test('matched preview service cleans expired sessions before capacity and evicts oldest active deterministically', () => {
  let time = 1000;
  const service = createInventoryImportMatchedPreviewSessionService({
    now: () => time,
    maxMatchedPreviewSessions: 3,
    matchedPreviewSessionTtlMs: 1000,
  });
  const first = service.createMatchedPreviewSession({
    ownerId: 1,
    sourcePreviewSessionId: SOURCE_SESSION_ID,
    sourcePreview: sourcePreview(),
    matchingAnalysis: matchingAnalysis(),
  });
  time += 1;
  const second = service.createMatchedPreviewSession({
    ownerId: 2,
    sourcePreviewSessionId: SOURCE_SESSION_ID,
    sourcePreview: sourcePreview(),
    matchingAnalysis: matchingAnalysis(),
  });
  time += 1;
  const third = service.createMatchedPreviewSession({
    ownerId: 3,
    sourcePreviewSessionId: SOURCE_SESSION_ID,
    sourcePreview: sourcePreview(),
    matchingAnalysis: matchingAnalysis(),
  });
  time += 1;
  const fourth = service.createMatchedPreviewSession({
    ownerId: 4,
    sourcePreviewSessionId: SOURCE_SESSION_ID,
    sourcePreview: sourcePreview(),
    matchingAnalysis: matchingAnalysis(),
  });
  assert.equal(service.getMatchedPreviewSessionCount(), 3);
  assert.equal(
    service.getMatchedPreviewSession({ sessionId: first.matchedPreviewSession.sessionId, ownerId: 1 }).code,
    MATCHED_PREVIEW_ERROR_CODES.NOT_FOUND
  );
  assert.equal(service.getMatchedPreviewSession({ sessionId: second.matchedPreviewSession.sessionId, ownerId: 2 }).ok, true);
  assert.equal(service.getMatchedPreviewSession({ sessionId: third.matchedPreviewSession.sessionId, ownerId: 3 }).ok, true);
  assert.equal(service.getMatchedPreviewSession({ sessionId: fourth.matchedPreviewSession.sessionId, ownerId: 4 }).ok, true);

  time = 2200;
  const afterExpiry = service.createMatchedPreviewSession({
    ownerId: 5,
    sourcePreviewSessionId: SOURCE_SESSION_ID,
    sourcePreview: sourcePreview(),
    matchingAnalysis: matchingAnalysis(),
  });
  assert.equal(afterExpiry.ok, true);
  assert.equal(service.getMatchedPreviewSessionCount(), 1);
  assert.equal(MAX_MATCHED_PREVIEW_SESSIONS, 25);
});

test('matched preview service removes malformed stored sessions safely', () => {
  const sessions = new Map();
  let time = 1000;
  const service = createInventoryImportMatchedPreviewSessionService({
    now: () => time,
    matchedPreviewSessions: sessions,
  });
  const created = service.createMatchedPreviewSession({
    ownerId: 7,
    sourcePreviewSessionId: SOURCE_SESSION_ID,
    sourcePreview: sourcePreview(),
    matchingAnalysis: matchingAnalysis(),
  });
  sessions.get(created.matchedPreviewSession.sessionId).session = {
    kind: 'inventory_import_matched_preview_session',
  };
  const result = service.getMatchedPreviewSession({
    sessionId: created.matchedPreviewSession.sessionId,
    ownerId: 7,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, MATCHED_PREVIEW_ERROR_CODES.INVALID_SESSION);
  assert.equal(service.getMatchedPreviewSessionCount(), 0);
});

test('matched preview files are isolated from UI, IPC, database, filesystem, activity logging, and Barcode sessions', () => {
  [
    'src/main/features/inventory/inventory-import-matched-preview.model.js',
    'src/main/features/inventory/inventory-import-matched-preview-session.model.js',
    'src/main/features/inventory/inventory-import-matched-preview-session.service.js',
  ].forEach((relative) => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.doesNotMatch(
      source,
      /ipcMain|ipcRenderer|BrowserWindow|\bdocument\.(?:querySelector|getElementById|addEventListener)|showOpenDialog/
    );
    assert.doesNotMatch(source, /require\(['"](?:fs|electron|pg)/);
    assert.doesNotMatch(source, /\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bCREATE\s+TABLE\b/i);
    assert.doesNotMatch(source, /createActivityLog|activityRepository/);
    assert.doesNotMatch(source, /barcode-preview-/);
  });
  const html = fs.readFileSync(path.join(root, 'src/main/features/inventory/index.html'), 'utf8');
  assert.match(html, /id="inventoryImportPreviewButton"/);
  assert.match(html, /data-tool-action="import-preview"[^>]*>Import CSV/);
  assert.match(html, /Execution is available only after backend preflight confirms/);
  assert.doesNotMatch(html, /Execute Import|Finalize Import|Commit Import|Import Now/);
});
