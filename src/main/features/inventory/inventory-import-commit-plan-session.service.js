const { randomUUID } = require('node:crypto');
const {
  COMMIT_PLAN_ERROR_CODES,
  InventoryImportCommitPlanError,
  createInventoryImportCommitPlanDocument,
  deepFreezePlainData,
} = require('./inventory-import-commit-plan.model');
const {
  COMMIT_PLAN_SESSION_ERROR_CODES,
  createInventoryImportCommitPlanSession,
  validateCommitPlanSessionId,
  validateInventoryImportCommitPlanSession,
  validateOwnerId,
} = require('./inventory-import-commit-plan-session.model');

const COMMIT_PLAN_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_COMMIT_PLAN_SESSIONS = 25;

function errorResult(error) {
  if (error instanceof InventoryImportCommitPlanError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      field: error.field || null,
    };
  }
  return {
    ok: false,
    code: COMMIT_PLAN_ERROR_CODES.INVALID_DOCUMENT,
    message: 'Inventory import commit plan failed safely.',
    field: null,
  };
}

function publicSession(session) {
  return {
    kind: session.kind,
    version: session.version,
    sessionId: session.sessionId,
    sourceMatchedPreviewSessionId: session.sourceMatchedPreviewSessionId,
    sourcePreviewSessionId: session.sourcePreviewSessionId,
    sourcePreviewId: session.sourcePreviewId,
    planDigest: session.planDigest,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    rowCount: session.rowCount,
    executable: false,
    rendererAuthoritative: false,
    databaseWrite: false,
    commitReady: false,
    requiresRevalidation: true,
  };
}

function createInventoryImportCommitPlanSessionService(dependencies = {}) {
  const sessions = dependencies.commitPlanSessions || new Map();
  const now = typeof dependencies.now === 'function' ? dependencies.now : () => Date.now();
  const sessionIdFactory =
    typeof dependencies.sessionIdFactory === 'function'
      ? dependencies.sessionIdFactory
      : () => `inventory-import-commit-plan-${randomUUID()}`;
  const ttlMs = Number.isFinite(dependencies.commitPlanSessionTtlMs)
    ? Math.max(1000, Math.trunc(dependencies.commitPlanSessionTtlMs))
    : COMMIT_PLAN_SESSION_TTL_MS;
  const maxSessions = Number.isFinite(dependencies.maxCommitPlanSessions)
    ? Math.max(1, Math.min(MAX_COMMIT_PLAN_SESSIONS, Math.trunc(dependencies.maxCommitPlanSessions)))
    : MAX_COMMIT_PLAN_SESSIONS;
  let sequence = 0;

  function clearExpiredCommitPlanSessions(referenceTime = now()) {
    for (const [sessionId, entry] of sessions.entries()) {
      if (!entry || Number(entry.expiresAt) <= referenceTime) {
        sessions.delete(sessionId);
      }
    }
  }

  function removeOwnerCommitPlanSession(ownerId) {
    const normalizedOwnerId = validateOwnerId(ownerId);
    for (const [sessionId, entry] of sessions.entries()) {
      if (entry?.ownerId === normalizedOwnerId) {
        sessions.delete(sessionId);
      }
    }
  }

  function removeCommitPlanSession(sessionId) {
    const normalizedSessionId = validateCommitPlanSessionId(sessionId);
    return sessions.delete(normalizedSessionId);
  }

  function ensureCapacity() {
    if (sessions.size < maxSessions) return;
    let oldestSessionId = null;
    let oldestCreatedAt = Infinity;
    let oldestSequence = Infinity;
    for (const [sessionId, entry] of sessions.entries()) {
      const createdAt = Number(entry?.createdAt);
      const entrySequence = Number(entry?.sequence);
      if (
        createdAt < oldestCreatedAt ||
        (createdAt === oldestCreatedAt && entrySequence < oldestSequence) ||
        (createdAt === oldestCreatedAt &&
          entrySequence === oldestSequence &&
          String(sessionId) < String(oldestSessionId || sessionId))
      ) {
        oldestSessionId = sessionId;
        oldestCreatedAt = createdAt;
        oldestSequence = entrySequence;
      }
    }
    if (!oldestSessionId) {
      throw new InventoryImportCommitPlanError(
        COMMIT_PLAN_SESSION_ERROR_CODES.CAPACITY_FAILED,
        'Inventory import commit plan capacity is temporarily full.',
        'commitPlanSessions'
      );
    }
    sessions.delete(oldestSessionId);
  }

  function storeCommitPlanSession(session) {
    clearExpiredCommitPlanSessions();
    const validSession = validateInventoryImportCommitPlanSession(session);
    if (sessions.has(validSession.sessionId)) {
      throw new InventoryImportCommitPlanError(
        COMMIT_PLAN_SESSION_ERROR_CODES.INVALID_SESSION,
        'Inventory import commit plan session identifier is already active.',
        'sessionId'
      );
    }
    removeOwnerCommitPlanSession(validSession.ownerId);
    ensureCapacity();
    sequence += 1;
    sessions.set(validSession.sessionId, {
      session: validSession,
      ownerId: validSession.ownerId,
      createdAt: validSession.createdAt,
      expiresAt: validSession.expiresAt,
      sequence,
    });
    return validSession;
  }

  function rejectUnsupportedKeys(input, allowedKeys) {
    Object.keys(input || {}).forEach((key) => {
      if (!allowedKeys.includes(key)) {
        throw new InventoryImportCommitPlanError(
          COMMIT_PLAN_ERROR_CODES.INVALID_INPUT,
          'Inventory import commit plan request contains unsupported fields.',
          key
        );
      }
    });
  }

  function createCommitPlanSession(input = {}) {
    try {
      rejectUnsupportedKeys(input, ['ownerId', 'matchedPreviewDocument', 'matchedPreviewSessionId']);
      const { ownerId, matchedPreviewDocument, matchedPreviewSessionId } = input;
      const normalizedOwnerId = validateOwnerId(ownerId);
      const createdAt = now();
      const commitPlanDocument = createInventoryImportCommitPlanDocument({
        matchedPreviewDocument,
        matchedPreviewSessionId,
      });
      const session = createInventoryImportCommitPlanSession({
        sessionId: sessionIdFactory(),
        ownerId: normalizedOwnerId,
        createdAt,
        expiresAt: createdAt + ttlMs,
        commitPlanDocument,
      });
      storeCommitPlanSession(session);
      return deepFreezePlainData({
        ok: true,
        commitPlan: commitPlanDocument,
        commitPlanSession: publicSession(session),
      });
    } catch (error) {
      return errorResult(error);
    }
  }

  function getCommitPlanSession(input = {}) {
    try {
      rejectUnsupportedKeys(input, ['sessionId', 'ownerId']);
      const { sessionId, ownerId } = input;
      const normalizedSessionId = validateCommitPlanSessionId(sessionId);
      const normalizedOwnerId = validateOwnerId(ownerId);
      const entry = sessions.get(normalizedSessionId);
      if (!entry) {
        clearExpiredCommitPlanSessions();
        return {
          ok: false,
          code: COMMIT_PLAN_SESSION_ERROR_CODES.NOT_FOUND,
          message: 'Inventory import commit plan expired or is no longer available.',
        };
      }
      if (Number(entry.expiresAt) <= now()) {
        sessions.delete(normalizedSessionId);
        return {
          ok: false,
          code: COMMIT_PLAN_SESSION_ERROR_CODES.EXPIRED,
          message: 'Inventory import commit plan expired or is no longer available.',
        };
      }
      clearExpiredCommitPlanSessions();
      if (entry.ownerId !== normalizedOwnerId) {
        return {
          ok: false,
          code: COMMIT_PLAN_SESSION_ERROR_CODES.OWNER_MISMATCH,
          message: 'Inventory import commit plan expired or is no longer available.',
        };
      }
      try {
        const session = validateInventoryImportCommitPlanSession(entry.session);
        return deepFreezePlainData({
          ok: true,
          commitPlan: session.commitPlanDocument,
          commitPlanSession: publicSession(session),
        });
      } catch (error) {
        sessions.delete(normalizedSessionId);
        return errorResult(error);
      }
    } catch (error) {
      return errorResult(error);
    }
  }

  function getCommitPlanSessionCount() {
    clearExpiredCommitPlanSessions();
    return sessions.size;
  }

  return Object.freeze({
    clearExpiredCommitPlanSessions,
    createCommitPlanSession,
    getCommitPlanSession,
    getCommitPlanSessionCount,
    removeCommitPlanSession,
    removeOwnerCommitPlanSession,
    _sessions: sessions,
  });
}

const defaultService = createInventoryImportCommitPlanSessionService();

module.exports = {
  COMMIT_PLAN_SESSION_TTL_MS,
  MAX_COMMIT_PLAN_SESSIONS,
  createInventoryImportCommitPlanSessionService,
  createCommitPlanSession: defaultService.createCommitPlanSession,
  getCommitPlanSession: defaultService.getCommitPlanSession,
};
