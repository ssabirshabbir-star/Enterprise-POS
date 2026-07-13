const commitPlanSessionService = require('./inventory-import-commit-plan-session.service');
const preflightSessionService = require('./inventory-import-execution-preflight-session.service');
const { canAdjustInventory } = require('./inventory.permissions');
const { canWriteProducts } = require('../products/product.permissions');
const { logError } = require('../../utils/safe-logger');

const COMMIT_PLAN_SESSION_ID_PATTERN =
  /^inventory-import-commit-plan-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXECUTION_PREFLIGHT_SESSION_ID_PATTERN =
  /^inventory-import-execution-preflight-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES = Object.freeze({
  ACCESS_DENIED: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_ACCESS_DENIED',
  AUTHENTICATION_REQUIRED: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_AUTHENTICATION_REQUIRED',
  CURRENT_STATE_UNAVAILABLE: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_CURRENT_STATE_UNAVAILABLE',
  FAILED: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_FAILED',
  INVALID_REQUEST: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_INVALID_REQUEST',
  SESSION_UNAVAILABLE: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_SESSION_UNAVAILABLE',
  SOURCE_COMMIT_PLAN_UNAVAILABLE: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_SOURCE_COMMIT_PLAN_UNAVAILABLE',
});

const REQUEST_KEYS = Object.freeze(['sessionId']);

function defaultAuthService() {
  return require('../auth/auth.service');
}

function defaultPreflightRepository() {
  return require('./inventory-import-execution-preflight.repository');
}

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
  return { ok: false, code, message, ...extra };
}

function normalizeSessionRequest(payload, pattern) {
  if (!isPlainObject(payload)) {
    return failure(EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'A session id is required.');
  }
  if (containsExecutableValue(payload)) {
    return failure(EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'A plain session request is required.');
  }
  if (Object.keys(payload).some((key) => !REQUEST_KEYS.includes(key))) {
    return failure(
      EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.INVALID_REQUEST,
      'Only a backend session id may be supplied.'
    );
  }
  const sessionId = String(payload.sessionId || '').trim();
  if (!pattern.test(sessionId)) {
    return failure(EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'A valid backend session id is required.');
  }
  return { ok: true, sessionId };
}

async function requirePreflightAccess(auth) {
  const profileResult = await auth.getProfile();
  if (!profileResult || !profileResult.ok) {
    return failure(EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.AUTHENTICATION_REQUIRED, 'Authentication required.');
  }
  const profile = profileResult.profile || {};
  const ownerId = Number(profile.id);
  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    return failure(EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.AUTHENTICATION_REQUIRED, 'Authentication required.');
  }
  if (!canAdjustInventory(profile.role)) {
    return failure(
      EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.ACCESS_DENIED,
      'You do not have permission to preflight inventory imports.'
    );
  }
  return {
    ok: true,
    ownerId,
    profile,
    permissions: {
      canAdjustInventory: canAdjustInventory(profile.role),
      canCreateProduct: canWriteProducts(profile.role),
    },
  };
}

function safePreflightResponse(result, message) {
  return {
    ok: true,
    executionPreflight: result.executionPreflight,
    executionPreflightSession: result.executionPreflightSession,
    sessionId: result.executionPreflightSession.sessionId,
    sourceCommitPlanSessionId: result.executionPreflight.sourceCommitPlanSessionId,
    sourceCommitPlanDigest: result.executionPreflight.sourceCommitPlanDigest,
    preflightDigest: result.executionPreflight.preflightDigest,
    preflightSummary: result.executionPreflight.summary,
    databaseWrite: false,
    commitReady: false,
    rendererAuthoritative: false,
    requiresTransaction: true,
    requiresExecutionConfirmation: true,
    requiresReplayProtection: true,
    requiresAuditPersistence: true,
    message,
  };
}

function createInventoryImportExecutionPreflightWorkflowService(dependencies = {}) {
  const auth = dependencies.authService || null;
  const commitSessions = dependencies.commitPlanSessionService || commitPlanSessionService;
  const repository = dependencies.executionPreflightRepository || null;
  const preflightSessions = dependencies.executionPreflightSessionService || preflightSessionService;

  async function createImportExecutionPreflight(payload = {}) {
    const request = normalizeSessionRequest(payload, COMMIT_PLAN_SESSION_ID_PATTERN);
    if (!request.ok) return request;
    try {
      const access = await requirePreflightAccess(auth || defaultAuthService());
      if (!access.ok) return access;

      const planResult = commitSessions.getCommitPlanSession({
        sessionId: request.sessionId,
        ownerId: access.ownerId,
      });
      if (!planResult || !planResult.ok) {
        return failure(
          EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.SOURCE_COMMIT_PLAN_UNAVAILABLE,
          'Inventory import commit plan expired or is no longer available.',
          { stale: true }
        );
      }

      const currentStateResult = await (repository || defaultPreflightRepository()).readCurrentStateForCommitPlan(planResult.commitPlan);
      if (!currentStateResult || !currentStateResult.ok) {
        return failure(
          EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.CURRENT_STATE_UNAVAILABLE,
          'Inventory import current state could not be revalidated.',
          { stale: true }
        );
      }

      const preflightResult = preflightSessions.createExecutionPreflightSession({
        ownerId: access.ownerId,
        commitPlan: planResult.commitPlan,
        commitPlanSessionId: request.sessionId,
        currentState: currentStateResult.currentState,
        permissionContext: access.permissions,
      });
      if (!preflightResult || !preflightResult.ok) {
        return failure(
          EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.FAILED,
          'Inventory import execution preflight could not be created.'
        );
      }
      return safePreflightResponse(preflightResult, 'Inventory import execution preflight is ready for review.');
    } catch (error) {
      logError('Inventory import execution preflight workflow failed:', error);
      return failure(
        EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.FAILED,
        'Inventory import execution preflight failed. Please try again.'
      );
    }
  }

  async function getImportExecutionPreflightSession(payload = {}) {
    const request = normalizeSessionRequest(payload, EXECUTION_PREFLIGHT_SESSION_ID_PATTERN);
    if (!request.ok) return request;
    try {
      const access = await requirePreflightAccess(auth || defaultAuthService());
      if (!access.ok) return access;
      const result = preflightSessions.getExecutionPreflightSession({
        sessionId: request.sessionId,
        ownerId: access.ownerId,
      });
      if (!result || !result.ok) {
        return failure(
          EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.SESSION_UNAVAILABLE,
          'Inventory import execution preflight expired or is no longer available.',
          { stale: true }
        );
      }
      return safePreflightResponse(result, 'Inventory import execution preflight is available.');
    } catch (error) {
      logError('Inventory import execution preflight retrieval failed:', error);
      return failure(
        EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES.SESSION_UNAVAILABLE,
        'Inventory import execution preflight expired or is no longer available.',
        { stale: true }
      );
    }
  }

  return Object.freeze({
    createImportExecutionPreflight,
    getImportExecutionPreflightSession,
  });
}

const defaultService = createInventoryImportExecutionPreflightWorkflowService();

module.exports = {
  EXECUTION_PREFLIGHT_WORKFLOW_ERROR_CODES,
  createInventoryImportExecutionPreflightWorkflowService,
  createImportExecutionPreflight: defaultService.createImportExecutionPreflight,
  getImportExecutionPreflightSession: defaultService.getImportExecutionPreflightSession,
};
