const matchedPreviewSessionService = require('./inventory-import-matched-preview-session.service');
const commitPlanSessionService = require('./inventory-import-commit-plan-session.service');
const { canAdjustInventory } = require('./inventory.permissions');
const { logError } = require('../../utils/safe-logger');

const MATCHED_PREVIEW_SESSION_ID_PATTERN =
  /^inventory-import-matched-preview-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMMIT_PLAN_SESSION_ID_PATTERN =
  /^inventory-import-commit-plan-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COMMIT_PLAN_WORKFLOW_ERROR_CODES = Object.freeze({
  ACCESS_DENIED: 'INVENTORY_IMPORT_COMMIT_PLAN_ACCESS_DENIED',
  AUTHENTICATION_REQUIRED: 'INVENTORY_IMPORT_COMMIT_PLAN_AUTHENTICATION_REQUIRED',
  FAILED: 'INVENTORY_IMPORT_COMMIT_PLAN_WORKFLOW_FAILED',
  INVALID_REQUEST: 'INVENTORY_IMPORT_COMMIT_PLAN_INVALID_REQUEST',
  SESSION_UNAVAILABLE: 'INVENTORY_IMPORT_COMMIT_PLAN_SESSION_UNAVAILABLE',
  SOURCE_MATCHED_PREVIEW_UNAVAILABLE: 'INVENTORY_IMPORT_COMMIT_PLAN_SOURCE_MATCHED_PREVIEW_UNAVAILABLE',
});

const REQUEST_KEYS = Object.freeze(['sessionId']);

function defaultAuthService() {
  return require('../auth/auth.service');
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
  return {
    ok: false,
    code,
    message,
    ...extra,
  };
}

function normalizeSessionRequest(payload, pattern) {
  if (!isPlainObject(payload)) {
    return failure(COMMIT_PLAN_WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'A session id is required.');
  }
  if (containsExecutableValue(payload)) {
    return failure(COMMIT_PLAN_WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'A plain session request is required.');
  }
  if (Object.keys(payload).some((key) => !REQUEST_KEYS.includes(key))) {
    return failure(
      COMMIT_PLAN_WORKFLOW_ERROR_CODES.INVALID_REQUEST,
      'Only a backend session id may be supplied.'
    );
  }
  const sessionId = String(payload.sessionId || '').trim();
  if (!pattern.test(sessionId)) {
    return failure(COMMIT_PLAN_WORKFLOW_ERROR_CODES.INVALID_REQUEST, 'A valid backend session id is required.');
  }
  return { ok: true, sessionId };
}

async function requireCommitPlanAccess(auth) {
  const profileResult = await auth.getProfile();
  if (!profileResult || !profileResult.ok) {
    return failure(COMMIT_PLAN_WORKFLOW_ERROR_CODES.AUTHENTICATION_REQUIRED, 'Authentication required.');
  }
  const profile = profileResult.profile || {};
  const ownerId = Number(profile.id);
  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    return failure(COMMIT_PLAN_WORKFLOW_ERROR_CODES.AUTHENTICATION_REQUIRED, 'Authentication required.');
  }
  if (!canAdjustInventory(profile.role)) {
    return failure(
      COMMIT_PLAN_WORKFLOW_ERROR_CODES.ACCESS_DENIED,
      'You do not have permission to plan inventory imports.'
    );
  }
  return {
    ok: true,
    ownerId,
    profile,
  };
}

function safeCommitPlanResponse(result, message) {
  return {
    ok: true,
    commitPlan: result.commitPlan,
    commitPlanSession: result.commitPlanSession,
    sessionId: result.commitPlanSession.sessionId,
    sourceMatchedPreviewSessionId: result.commitPlan.sourceMatchedPreviewSessionId,
    sourcePreviewSessionId: result.commitPlan.sourcePreviewSessionId,
    sourcePreviewId: result.commitPlan.sourcePreviewId,
    planSummary: result.commitPlan.planSummary,
    databaseWrite: false,
    commitReady: false,
    rendererAuthoritative: false,
    requiresRevalidation: true,
    message,
  };
}

function createInventoryImportCommitPlanWorkflowService(dependencies = {}) {
  const auth = dependencies.authService || null;
  const matchedSessions = dependencies.matchedPreviewSessionService || matchedPreviewSessionService;
  const commitSessions = dependencies.commitPlanSessionService || commitPlanSessionService;

  async function createImportCommitPlan(payload = {}) {
    const request = normalizeSessionRequest(payload, MATCHED_PREVIEW_SESSION_ID_PATTERN);
    if (!request.ok) return request;

    try {
      const access = await requireCommitPlanAccess(auth || defaultAuthService());
      if (!access.ok) return access;

      const matchedResult = matchedSessions.getMatchedPreviewSession({
        sessionId: request.sessionId,
        ownerId: access.ownerId,
      });
      if (!matchedResult || !matchedResult.ok) {
        return failure(
          COMMIT_PLAN_WORKFLOW_ERROR_CODES.SOURCE_MATCHED_PREVIEW_UNAVAILABLE,
          'Inventory import matched preview expired or is no longer available.',
          { stale: true }
        );
      }

      const planResult = commitSessions.createCommitPlanSession({
        ownerId: access.ownerId,
        matchedPreviewSessionId: request.sessionId,
        matchedPreviewDocument: matchedResult.matchedPreview,
      });
      if (!planResult || !planResult.ok) {
        return failure(
          COMMIT_PLAN_WORKFLOW_ERROR_CODES.FAILED,
          'Inventory import commit plan could not be created.'
        );
      }

      return safeCommitPlanResponse(planResult, 'Inventory import commit plan is ready for review.');
    } catch (error) {
      logError('Inventory import commit plan workflow failed:', error);
      return failure(
        COMMIT_PLAN_WORKFLOW_ERROR_CODES.FAILED,
        'Inventory import commit plan failed. Please try again.'
      );
    }
  }

  async function getImportCommitPlanSession(payload = {}) {
    const request = normalizeSessionRequest(payload, COMMIT_PLAN_SESSION_ID_PATTERN);
    if (!request.ok) return request;

    try {
      const access = await requireCommitPlanAccess(auth || defaultAuthService());
      if (!access.ok) return access;

      const result = commitSessions.getCommitPlanSession({
        sessionId: request.sessionId,
        ownerId: access.ownerId,
      });
      if (!result || !result.ok) {
        return failure(
          COMMIT_PLAN_WORKFLOW_ERROR_CODES.SESSION_UNAVAILABLE,
          'Inventory import commit plan expired or is no longer available.',
          { stale: true }
        );
      }

      return safeCommitPlanResponse(result, 'Inventory import commit plan is available.');
    } catch (error) {
      logError('Inventory import commit plan retrieval failed:', error);
      return failure(
        COMMIT_PLAN_WORKFLOW_ERROR_CODES.SESSION_UNAVAILABLE,
        'Inventory import commit plan expired or is no longer available.',
        { stale: true }
      );
    }
  }

  return Object.freeze({
    createImportCommitPlan,
    getImportCommitPlanSession,
  });
}

const defaultService = createInventoryImportCommitPlanWorkflowService();

module.exports = {
  COMMIT_PLAN_WORKFLOW_ERROR_CODES,
  createInventoryImportCommitPlanWorkflowService,
  createImportCommitPlan: defaultService.createImportCommitPlan,
  getImportCommitPlanSession: defaultService.getImportCommitPlanSession,
};
