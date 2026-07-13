const authService = require('../auth/auth.service');
const previewService = require('./inventory-import-preview.service');
const matchingRepository = require('./inventory-import-matching.repository');
const { analyzeInventoryImportMatches } = require('./inventory-import-matching.service');
const matchedPreviewSessionService = require('./inventory-import-matched-preview-session.service');
const { CATALOG_TYPE_KEYS, normalizeCatalogName, normalizeMatchingIdentifier } = require('./inventory-import-matching.contract');
const { canAdjustInventory } = require('./inventory.permissions');
const { canWriteProducts } = require('../products/product.permissions');
const { logError } = require('../../utils/safe-logger');

const SOURCE_PREVIEW_SESSION_ID_PATTERN =
  /^inventory-import-preview-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MATCHED_PREVIEW_SESSION_ID_PATTERN =
  /^inventory-import-matched-preview-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WORKFLOW_ERROR_CODES = Object.freeze({
  ACCESS_DENIED: 'INVENTORY_IMPORT_MATCHING_ACCESS_DENIED',
  AUTHENTICATION_REQUIRED: 'INVENTORY_IMPORT_MATCHING_AUTHENTICATION_REQUIRED',
  FAILED: 'INVENTORY_IMPORT_MATCHING_FAILED',
  INVALID_REQUEST: 'INVENTORY_IMPORT_MATCHING_INVALID_REQUEST',
  SESSION_UNAVAILABLE: 'INVENTORY_IMPORT_MATCHED_SESSION_UNAVAILABLE',
  SOURCE_PREVIEW_UNAVAILABLE: 'INVENTORY_IMPORT_MATCHING_SOURCE_PREVIEW_UNAVAILABLE',
});

const REQUEST_KEYS = Object.freeze(['sessionId']);
const MATCHING_ALLOWED_ROW_STATUSES = new Set(['STOCK_ROW_CANDIDATE', 'PRODUCT_ONLY_CANDIDATE', 'STRUCTURALLY_VALID']);

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function containsExecutableValue(value, seen = new Set()) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return true;
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return true;
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return true;
  seen.add(value);
  const found = Object.values(value).some((child) => containsExecutableValue(child, seen));
  seen.delete(value);
  return found;
}

function failure(code, message, extra = {}) {
  return {
    ok: false,
    code,
    message,
    ...extra,
  };
}

function normalizeSessionRequest(payload, pattern) {
  if (!isPlainObject(payload)) {
    return failure(WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'A session id is required.');
  }
  if (containsExecutableValue(payload)) {
    return failure(WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'A plain session request is required.');
  }
  const keys = Object.keys(payload);
  if (keys.some((key) => !REQUEST_KEYS.includes(key))) {
    return failure(WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'Only a backend session id may be supplied.');
  }
  const sessionId = String(payload.sessionId || '').trim();
  if (!pattern.test(sessionId)) {
    return failure(WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'A valid backend session id is required.');
  }
  return { ok: true, sessionId };
}

async function requireMatchingAccess(auth) {
  const profileResult = await auth.getProfile();
  if (!profileResult || !profileResult.ok) {
    return failure(WORKFLOW_ERROR_CODES.AUTHENTICATION_REQUIRED, 'Authentication required.');
  }
  const profile = profileResult.profile || {};
  const ownerId = Number(profile.id);
  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    return failure(WORKFLOW_ERROR_CODES.AUTHENTICATION_REQUIRED, 'Authentication required.');
  }
  if (!canAdjustInventory(profile.role)) {
    return failure(
      WORKFLOW_ERROR_CODES.ACCESS_DENIED,
      'You do not have permission to analyze inventory imports.'
    );
  }
  return {
    ok: true,
    ownerId,
    profile,
    permissions: {
      canAnalyzeImport: true,
      canAdjustInventory: canAdjustInventory(profile.role),
      canCreateProduct: canWriteProducts(profile.role),
    },
  };
}

function addUnique(target, value, normalizer) {
  const normalized = normalizer(value);
  if (normalized && !target.has(normalized)) target.set(normalized, String(value).trim());
}

function collectLookupInputs(rows = []) {
  const skus = new Map();
  const barcodes = new Map();
  const catalogs = {
    category: new Map(),
    brand: new Map(),
    unit: new Map(),
    variant: new Map(),
  };

  rows.forEach((row) => {
    if (!MATCHING_ALLOWED_ROW_STATUSES.has(row.status)) return;
    const normalized = row.normalized || {};
    addUnique(skus, normalized.sku, normalizeMatchingIdentifier);
    addUnique(barcodes, normalized.barcode, normalizeMatchingIdentifier);
    CATALOG_TYPE_KEYS.forEach((type) => addUnique(catalogs[type], normalized[type], normalizeCatalogName));
  });

  return {
    skus: [...skus.values()],
    barcodes: [...barcodes.values()],
    catalogs: {
      category: [...catalogs.category.values()],
      brand: [...catalogs.brand.values()],
      unit: [...catalogs.unit.values()],
      variant: [...catalogs.variant.values()],
    },
  };
}

function collectProductIds(productsResult) {
  if (!productsResult || productsResult.ok === false) return [];
  return [
    ...new Set(
      (productsResult.products || [])
        .filter((product) => product && product.active && !product.deleted)
        .map((product) => Number(product.productId))
        .filter((productId) => Number.isInteger(productId) && productId > 0)
    ),
  ];
}

function safeMatchedResponse(result, message) {
  return {
    ok: true,
    matchedPreview: result.matchedPreview,
    matchedPreviewSession: result.matchedPreviewSession,
    sessionId: result.matchedPreviewSession.sessionId,
    sourcePreviewSessionId: result.matchedPreview.sourcePreviewSessionId,
    sourcePreviewId: result.matchedPreview.sourcePreviewId,
    matchingSummary: result.matchedPreview.matchingSummary,
    message,
  };
}

function createInventoryImportMatchingWorkflowService(dependencies = {}) {
  const auth = dependencies.authService || authService;
  const preview = dependencies.previewService || previewService;
  const repository = dependencies.matchingRepository || matchingRepository;
  const analyzeMatches = dependencies.analyzeInventoryImportMatches || analyzeInventoryImportMatches;
  const matchedSessions = dependencies.matchedPreviewSessionService || matchedPreviewSessionService;

  async function analyzeImportPreview(payload = {}) {
    const request = normalizeSessionRequest(payload, SOURCE_PREVIEW_SESSION_ID_PATTERN);
    if (!request.ok) return request;

    try {
      const access = await requireMatchingAccess(auth);
      if (!access.ok) return access;

      const previewResult = await preview.getImportPreviewSession({ sessionId: request.sessionId });
      if (!previewResult || !previewResult.ok) {
        return failure(
          WORKFLOW_ERROR_CODES.SOURCE_PREVIEW_UNAVAILABLE,
          'Inventory import preview expired or is no longer available.',
          { stale: true }
        );
      }

      const sourcePreview = previewResult.preview;
      const rows = Array.isArray(sourcePreview?.rows) ? sourcePreview.rows : [];
      const lookupInputs = collectLookupInputs(rows);

      const productsResult = await repository.findProductsByIdentifiers({
        skus: lookupInputs.skus,
        barcodes: lookupInputs.barcodes,
      });
      const catalogsResult = await repository.findCatalogsByNames(lookupInputs.catalogs);
      const warehouseResult = await repository.getDefaultWarehouse();
      const productIds = collectProductIds(productsResult);
      const warehouseId = warehouseResult?.warehouse?.warehouseId;
      const shouldReadInventory = Number.isInteger(Number(warehouseId)) && productIds.length > 0;
      const inventoryTargetsResult = shouldReadInventory
        ? await repository.findInventoryTargets({ productIds, warehouseId })
        : { ok: true, inventoryTargets: [] };
      const movementSummariesResult = productIds.length
        ? await repository.summarizeStockMovements({ productIds })
        : { ok: true, movementSummaries: [] };

      const matchingAnalysis = analyzeMatches({
        rows,
        productsResult,
        catalogsResult,
        warehouseResult,
        inventoryTargetsResult,
        movementSummariesResult,
        permissionContext: { role: access.profile.role },
      });
      const matchedResult = matchedSessions.createMatchedPreviewSession({
        ownerId: access.ownerId,
        sourcePreviewSessionId: request.sessionId,
        sourcePreview,
        matchingAnalysis,
      });
      if (!matchedResult || !matchedResult.ok) {
        return failure(
          WORKFLOW_ERROR_CODES.FAILED,
          'Inventory import matched preview could not be created.'
        );
      }

      return safeMatchedResponse(matchedResult, 'Inventory import matching preview is ready.');
    } catch (error) {
      logError('Inventory import matching workflow failed:', error);
      return failure(WORKFLOW_ERROR_CODES.FAILED, 'Inventory import matching failed. Please try again.');
    }
  }

  async function getMatchedImportPreviewSession(payload = {}) {
    const request = normalizeSessionRequest(payload, MATCHED_PREVIEW_SESSION_ID_PATTERN);
    if (!request.ok) return request;

    try {
      const access = await requireMatchingAccess(auth);
      if (!access.ok) return access;

      const result = matchedSessions.getMatchedPreviewSession({
        sessionId: request.sessionId,
        ownerId: access.ownerId,
      });
      if (!result || !result.ok) {
        return failure(
          WORKFLOW_ERROR_CODES.SESSION_UNAVAILABLE,
          'Inventory import matched preview expired or is no longer available.',
          { stale: true }
        );
      }

      return safeMatchedResponse(result, 'Inventory import matched preview is available.');
    } catch (error) {
      logError('Inventory import matched preview retrieval failed:', error);
      return failure(
        WORKFLOW_ERROR_CODES.SESSION_UNAVAILABLE,
        'Inventory import matched preview expired or is no longer available.',
        { stale: true }
      );
    }
  }

  return Object.freeze({
    analyzeImportPreview,
    getMatchedImportPreviewSession,
  });
}

const defaultService = createInventoryImportMatchingWorkflowService();

module.exports = {
  WORKFLOW_ERROR_CODES,
  createInventoryImportMatchingWorkflowService,
  analyzeImportPreview: defaultService.analyzeImportPreview,
  getMatchedImportPreviewSession: defaultService.getMatchedImportPreviewSession,
};
