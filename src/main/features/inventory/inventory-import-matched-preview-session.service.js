const { randomUUID } = require('node:crypto');
const {
  MATCHED_PREVIEW_ERROR_CODES,
  InventoryImportMatchedPreviewError,
  createInventoryImportMatchedPreviewDocument,
} = require('./inventory-import-matched-preview.model');
const {
  createInventoryImportMatchedPreviewSession,
  validateInventoryImportMatchedPreviewSession,
  validateMatchedPreviewSessionId,
  validateOwnerId,
} = require('./inventory-import-matched-preview-session.model');

const MATCHED_PREVIEW_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_MATCHED_PREVIEW_SESSIONS = 25;

function errorResult(error) {
  if (error instanceof InventoryImportMatchedPreviewError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
      field: error.field || null,
    };
  }
  return {
    ok: false,
    code: MATCHED_PREVIEW_ERROR_CODES.INVALID_SESSION,
    message: 'Inventory import matched preview session failed safely.',
    field: null,
  };
}

function publicSession(session) {
  return {
    kind: session.kind,
    version: session.version,
    sessionId: session.sessionId,
    sourcePreviewSessionId: session.sourcePreviewSessionId,
    sourcePreviewId: session.sourcePreviewId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    rowCount: session.rowCount,
    executable: false,
    rendererAuthoritative: false,
    databaseWrite: false,
    commitReady: false,
  };
}

function createInventoryImportMatchedPreviewSessionService(dependencies = {}) {
  const sessions = dependencies.matchedPreviewSessions || new Map();
  const now = typeof dependencies.now === 'function' ? dependencies.now : () => Date.now();
  const ttlMs = Number.isFinite(dependencies.matchedPreviewSessionTtlMs)
    ? Math.max(1000, Math.trunc(dependencies.matchedPreviewSessionTtlMs))
    : MATCHED_PREVIEW_SESSION_TTL_MS;
  const maxSessions = Number.isFinite(dependencies.maxMatchedPreviewSessions)
    ? Math.max(1, Math.min(MAX_MATCHED_PREVIEW_SESSIONS, Math.trunc(dependencies.maxMatchedPreviewSessions)))
    : MAX_MATCHED_PREVIEW_SESSIONS;
  let sequence = 0;

  function clearExpiredMatchedPreviewSessions(referenceTime = now()) {
    for (const [sessionId, entry] of sessions.entries()) {
      if (!entry || Number(entry.expiresAt) <= referenceTime) {
        sessions.delete(sessionId);
      }
    }
  }

  function removeOwnerMatchedPreviewSession(ownerId) {
    const normalizedOwnerId = validateOwnerId(ownerId);
    for (const [sessionId, entry] of sessions.entries()) {
      if (entry?.ownerId === normalizedOwnerId) {
        sessions.delete(sessionId);
      }
    }
  }

  function removeMatchedPreviewSession(sessionId) {
    const normalizedSessionId = validateMatchedPreviewSessionId(sessionId);
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
      throw new InventoryImportMatchedPreviewError(
        MATCHED_PREVIEW_ERROR_CODES.CAPACITY_FAILED,
        'Inventory import matched preview capacity is temporarily full.',
        'matchedPreviewSessions'
      );
    }
    sessions.delete(oldestSessionId);
  }

  function storeMatchedPreviewSession(session) {
    clearExpiredMatchedPreviewSessions();
    const validSession = validateInventoryImportMatchedPreviewSession(session);
    if (sessions.has(validSession.sessionId)) {
      throw new InventoryImportMatchedPreviewError(
        MATCHED_PREVIEW_ERROR_CODES.INVALID_SESSION,
        'Inventory import matched preview session identifier is already active.',
        'sessionId'
      );
    }
    removeOwnerMatchedPreviewSession(validSession.ownerId);
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

  function createMatchedPreviewSession({
    ownerId,
    sourcePreviewSessionId,
    sourcePreview,
    matchingAnalysis,
    matchedAt = new Date(now()).toISOString(),
  } = {}) {
    try {
      const createdAt = now();
      const matchedPreviewDocument = createInventoryImportMatchedPreviewDocument({
        sourcePreviewSessionId,
        sourcePreview,
        matchedAt,
        matchingAnalysis,
      });
      const session = createInventoryImportMatchedPreviewSession({
        sessionId: `inventory-import-matched-preview-${randomUUID()}`,
        ownerId,
        createdAt,
        expiresAt: createdAt + ttlMs,
        matchedPreviewDocument,
      });
      storeMatchedPreviewSession(session);
      return {
        ok: true,
        matchedPreview: matchedPreviewDocument,
        matchedPreviewSession: publicSession(session),
      };
    } catch (error) {
      return errorResult(error);
    }
  }

  function getMatchedPreviewSession({ sessionId, ownerId } = {}) {
    try {
      const normalizedSessionId = validateMatchedPreviewSessionId(sessionId);
      const normalizedOwnerId = validateOwnerId(ownerId);
      const entry = sessions.get(normalizedSessionId);
      if (!entry) {
        clearExpiredMatchedPreviewSessions();
        return {
          ok: false,
          code: MATCHED_PREVIEW_ERROR_CODES.NOT_FOUND,
          message: 'Inventory import matched preview expired or is no longer available.',
        };
      }
      if (Number(entry.expiresAt) <= now()) {
        sessions.delete(normalizedSessionId);
        return {
          ok: false,
          code: MATCHED_PREVIEW_ERROR_CODES.EXPIRED,
          message: 'Inventory import matched preview expired or is no longer available.',
        };
      }
      clearExpiredMatchedPreviewSessions();
      if (entry.ownerId !== normalizedOwnerId) {
        return {
          ok: false,
          code: MATCHED_PREVIEW_ERROR_CODES.OWNER_MISMATCH,
          message: 'Inventory import matched preview expired or is no longer available.',
        };
      }
      try {
        const session = validateInventoryImportMatchedPreviewSession(entry.session);
        return {
          ok: true,
          matchedPreview: session.matchedPreviewDocument,
          matchedPreviewSession: publicSession(session),
        };
      } catch (error) {
        sessions.delete(normalizedSessionId);
        return errorResult(error);
      }
    } catch (error) {
      return errorResult(error);
    }
  }

  function getMatchedPreviewSessionCount() {
    clearExpiredMatchedPreviewSessions();
    return sessions.size;
  }

  return Object.freeze({
    clearExpiredMatchedPreviewSessions,
    createMatchedPreviewSession,
    getMatchedPreviewSession,
    getMatchedPreviewSessionCount,
    removeMatchedPreviewSession,
    removeOwnerMatchedPreviewSession,
    _sessions: sessions,
  });
}

const defaultService = createInventoryImportMatchedPreviewSessionService();

module.exports = {
  MAX_MATCHED_PREVIEW_SESSIONS,
  MATCHED_PREVIEW_SESSION_TTL_MS,
  createInventoryImportMatchedPreviewSessionService,
  createMatchedPreviewSession: defaultService.createMatchedPreviewSession,
  getMatchedPreviewSession: defaultService.getMatchedPreviewSession,
};
