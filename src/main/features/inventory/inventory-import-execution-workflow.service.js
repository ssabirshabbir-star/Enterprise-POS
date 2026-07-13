const preflightSessionService = require('./inventory-import-execution-preflight-session.service');
const executionRepository = require('./inventory-import-execution.repository');
const { validateInventoryImportExecutionPreflightDocument } = require('./inventory-import-execution-preflight.model');
const { validateInventoryImportExecutionContract, createInventoryImportExecutionContract } = require('./inventory-import-execution-contract.model');
const { validateInventoryImportExecutionResult } = require('./inventory-import-execution-result.model');
const { canAdjustInventory } = require('./inventory.permissions');
const { canWriteProducts } = require('../products/product.permissions');
const { logError } = require('../../utils/safe-logger');

const EXECUTION_PREFLIGHT_SESSION_ID_PATTERN =
  /^inventory-import-execution-preflight-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IMPORT_EXECUTION_WORKFLOW_ERROR_CODES = Object.freeze({
  ACCESS_DENIED: 'INVENTORY_IMPORT_EXECUTION_ACCESS_DENIED',
  AUTHENTICATION_REQUIRED: 'INVENTORY_IMPORT_EXECUTION_AUTHENTICATION_REQUIRED',
  CONTRACT_INVALID: 'INVENTORY_IMPORT_EXECUTION_CONTRACT_INVALID',
  EXECUTION_FAILED: 'INVENTORY_IMPORT_EXECUTION_FAILED',
  INVALID_REQUEST: 'INVENTORY_IMPORT_EXECUTION_INVALID_REQUEST',
  PREFLIGHT_NOT_READY: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_NOT_READY',
  REPLAY_CONFLICT: 'INVENTORY_IMPORT_EXECUTION_REPLAY_CONFLICT',
  SESSION_UNAVAILABLE: 'INVENTORY_IMPORT_EXECUTION_SESSION_UNAVAILABLE',
});

const REQUEST_KEYS = Object.freeze(['sessionId', 'expectedPreflightDigest', 'expectedContractDigest']);

function defaultAuthService() {
  return require('../auth/auth.service');
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
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
  return { ok: false, code, message, ...extra };
}

function normalizeRequest(payload = {}) {
  if (!isPlainObject(payload)) return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'A plain execution request is required.');
  if (containsExecutableValue(payload)) return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'A plain execution request is required.');
  if (Object.keys(payload).some((key) => !REQUEST_KEYS.includes(key))) {
    return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'Only execution session and digest evidence may be supplied.');
  }
  const sessionId = String(payload.sessionId || '').trim();
  const expectedPreflightDigest = String(payload.expectedPreflightDigest || '').trim().toLowerCase();
  const expectedContractDigest = String(payload.expectedContractDigest || '').trim().toLowerCase();
  if (!EXECUTION_PREFLIGHT_SESSION_ID_PATTERN.test(sessionId)) {
    return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'A valid execution preflight session id is required.');
  }
  if (!/^[0-9a-f]{64}$/.test(expectedPreflightDigest)) {
    return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'Expected preflight digest is required.');
  }
  if (expectedContractDigest && !/^[0-9a-f]{64}$/.test(expectedContractDigest)) {
    return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'Expected execution contract digest is invalid.');
  }
  return { ok: true, sessionId, expectedPreflightDigest, expectedContractDigest };
}

async function requireExecutionAccess(auth) {
  const profileResult = await auth.getProfile();
  if (!profileResult || !profileResult.ok) {
    return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.AUTHENTICATION_REQUIRED, 'Authentication required.');
  }
  const profile = profileResult.profile || {};
  const ownerId = Number(profile.id);
  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.AUTHENTICATION_REQUIRED, 'Authentication required.');
  }
  if (!canAdjustInventory(profile.role)) {
    return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.ACCESS_DENIED, 'You do not have permission to execute inventory imports.');
  }
  return {
    ok: true,
    ownerId,
    profile,
    canCreateProduct: canWriteProducts(profile.role),
  };
}

function requiresProductCreatePermission(preflight) {
  return preflight.rows.some((row) => row.originalProductAction === 'CREATE_PRODUCT');
}

function safeSuccess(result, lifecycleWarning = null) {
  return {
    ok: true,
    executionResult: result,
    batchId: result.batchId,
    idempotencyKey: result.idempotencyKey,
    preflightDigest: result.preflightDigest,
    status: result.status,
    transactionCommitted: true,
    databaseWrite: true,
    executionComplete: true,
    auditPersisted: result.auditPersisted,
    lifecycleWarning,
  };
}

function createInventoryImportExecutionWorkflowService(dependencies = {}) {
  const auth = dependencies.authService || null;
  const preflightSessions = dependencies.executionPreflightSessionService || preflightSessionService;
  const repository = dependencies.executionRepository || executionRepository;

  async function executeCertifiedImport(payload = {}) {
    const request = normalizeRequest(payload);
    if (!request.ok) return request;
    try {
      const access = await requireExecutionAccess(auth || defaultAuthService());
      if (!access.ok) return access;
      const contract = validateInventoryImportExecutionContract(createInventoryImportExecutionContract());
      if (request.expectedContractDigest && request.expectedContractDigest !== contract.contractDigest) {
        return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.CONTRACT_INVALID, 'Execution contract digest does not match.');
      }
      const sessionResult = preflightSessions.getExecutionPreflightSession({
        ownerId: access.ownerId,
        sessionId: request.sessionId,
      });
      if (!sessionResult || !sessionResult.ok) {
        return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.SESSION_UNAVAILABLE, 'Inventory import execution preflight expired or is no longer available.');
      }
      const preflight = validateInventoryImportExecutionPreflightDocument(sessionResult.executionPreflight);
      if (preflight.preflightDigest !== request.expectedPreflightDigest) {
        return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.PREFLIGHT_NOT_READY, 'Execution preflight digest does not match.');
      }
      if (!preflight.commitReady || !preflight.rows.length) {
        return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.PREFLIGHT_NOT_READY, 'Execution preflight is not commit ready.');
      }
      if (requiresProductCreatePermission(preflight) && access.canCreateProduct !== true) {
        return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.ACCESS_DENIED, 'You do not have permission to create import Products.');
      }
      const executionResult = validateInventoryImportExecutionResult(
        await repository.executePreflight({
          executionPreflight: preflight,
          executionPreflightSessionId: request.sessionId,
          ownerId: access.ownerId,
          actorId: access.ownerId,
        })
      );
      const consumed = preflightSessions.consumeExecutionPreflightSession({
        ownerId: access.ownerId,
        sessionId: request.sessionId,
      });
      const lifecycleWarning = consumed?.ok ? null : 'Execution committed, but preflight session cleanup could not be confirmed.';
      return safeSuccess(executionResult, lifecycleWarning);
    } catch (error) {
      if (error?.code === 'INVENTORY_IMPORT_EXECUTION_REPLAY_CONFLICT') {
        return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.REPLAY_CONFLICT, 'Inventory import execution has already been committed.');
      }
      logError('Inventory import execution failed:', error);
      return failure(IMPORT_EXECUTION_WORKFLOW_ERROR_CODES.EXECUTION_FAILED, 'Inventory import execution failed safely.');
    }
  }

  return Object.freeze({ executeCertifiedImport });
}

const defaultService = createInventoryImportExecutionWorkflowService();

module.exports = {
  IMPORT_EXECUTION_WORKFLOW_ERROR_CODES,
  createInventoryImportExecutionWorkflowService,
  executeCertifiedImport: defaultService.executeCertifiedImport,
};
