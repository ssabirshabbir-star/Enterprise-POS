const { randomUUID } = require('node:crypto');
const {
  InventoryImportExecutionPreflightError,
  PREFLIGHT_ERROR_CODES,
  createInventoryImportExecutionPreflightDocument,
  validateInventoryImportExecutionPreflightDocument,
} = require('./inventory-import-execution-preflight.model');
const { deepFreezePlainData } = require('./inventory-import-commit-plan.model');
const { validateOwnerId } = require('./inventory-import-commit-plan-session.model');

const EXECUTION_PREFLIGHT_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_EXECUTION_PREFLIGHT_SESSIONS = 25;
const EXECUTION_PREFLIGHT_SESSION_VERSION = 'inventory-import-execution-preflight-session-v1';
const EXECUTION_PREFLIGHT_SESSION_ID_PATTERN =
  /^inventory-import-execution-preflight-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXECUTION_PREFLIGHT_SESSION_ERROR_CODES = Object.freeze({
  CAPACITY_FAILED: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_SESSION_CAPACITY_FAILED',
  EXPIRED: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_SESSION_EXPIRED',
  INVALID_SESSION: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_SESSION_INVALID',
  NOT_FOUND: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_SESSION_NOT_FOUND',
  OWNER_MISMATCH: 'INVENTORY_IMPORT_EXECUTION_PREFLIGHT_SESSION_OWNER_MISMATCH',
});

function fail(message, field = null) {
  throw new InventoryImportExecutionPreflightError(
    EXECUTION_PREFLIGHT_SESSION_ERROR_CODES.INVALID_SESSION,
    message,
    field
  );
}

function validateExecutionPreflightSessionId(value) {
  const sessionId = String(value || '').trim();
  if (!EXECUTION_PREFLIGHT_SESSION_ID_PATTERN.test(sessionId)) {
    fail('A backend-generated inventory import execution preflight session id is required.', 'sessionId');
  }
  return sessionId;
}

function createInventoryImportExecutionPreflightSession(input = {}) {
  const ownerId = validateOwnerId(input.ownerId);
  const sessionId = validateExecutionPreflightSessionId(input.sessionId);
  const createdAt = Number(input.createdAt);
  const expiresAt = Number(input.expiresAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= createdAt) {
    fail('Inventory import execution preflight session expiry is invalid.', 'expiresAt');
  }
  const document = validateInventoryImportExecutionPreflightDocument(input.executionPreflightDocument);
  return deepFreezePlainData({
    kind: 'inventory_import_execution_preflight_session',
    version: EXECUTION_PREFLIGHT_SESSION_VERSION,
    sessionId,
    ownerId,
    createdAt,
    expiresAt,
    sourceCommitPlanSessionId: document.sourceCommitPlanSessionId,
    sourceCommitPlanDigest: document.sourceCommitPlanDigest,
    preflightDigest: document.preflightDigest,
    rowCount: document.summary.totalRows,
    rendererAuthoritative: false,
    databaseWrite: false,
    commitReady: document.commitReady,
    requiresTransaction: true,
    requiresExecutionConfirmation: true,
    requiresReplayProtection: true,
    requiresAuditPersistence: true,
    executionPreflightDocument: document,
  });
}

function validateInventoryImportExecutionPreflightSession(session) {
  if (
    !session ||
    session.kind !== 'inventory_import_execution_preflight_session' ||
    session.version !== EXECUTION_PREFLIGHT_SESSION_VERSION ||
    !Object.isFrozen(session) ||
    session.rendererAuthoritative !== false ||
    session.databaseWrite !== false ||
    typeof session.commitReady !== 'boolean' ||
    session.requiresTransaction !== true ||
    session.requiresExecutionConfirmation !== true ||
    session.requiresReplayProtection !== true ||
    session.requiresAuditPersistence !== true
  ) {
    fail('An immutable inventory import execution preflight session is required.', 'executionPreflightSession');
  }
  validateExecutionPreflightSessionId(session.sessionId);
  validateOwnerId(session.ownerId);
  const document = validateInventoryImportExecutionPreflightDocument(session.executionPreflightDocument);
  if (
    session.sourceCommitPlanSessionId !== document.sourceCommitPlanSessionId ||
    session.sourceCommitPlanDigest !== document.sourceCommitPlanDigest ||
    session.preflightDigest !== document.preflightDigest ||
    session.rowCount !== document.summary.totalRows ||
    session.commitReady !== document.commitReady
  ) {
    fail('Inventory import execution preflight session failed deterministic validation.', 'executionPreflightSession');
  }
  return session;
}

function errorResult(error) {
  if (error instanceof InventoryImportExecutionPreflightError) {
    return { ok: false, code: error.code, message: error.message, field: error.field || null };
  }
  return {
    ok: false,
    code: PREFLIGHT_ERROR_CODES.INVALID_DOCUMENT,
    message: 'Inventory import execution preflight failed safely.',
    field: null,
  };
}

function publicSession(session) {
  return {
    kind: session.kind,
    version: session.version,
    sessionId: session.sessionId,
    sourceCommitPlanSessionId: session.sourceCommitPlanSessionId,
    sourceCommitPlanDigest: session.sourceCommitPlanDigest,
    preflightDigest: session.preflightDigest,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    rowCount: session.rowCount,
    rendererAuthoritative: false,
    databaseWrite: false,
    commitReady: session.commitReady,
    requiresTransaction: true,
    requiresExecutionConfirmation: true,
    requiresReplayProtection: true,
    requiresAuditPersistence: true,
  };
}

function createInventoryImportExecutionPreflightSessionService(dependencies = {}) {
  const sessions = dependencies.executionPreflightSessions || new Map();
  const now = typeof dependencies.now === 'function' ? dependencies.now : () => Date.now();
  const sessionIdFactory =
    typeof dependencies.sessionIdFactory === 'function'
      ? dependencies.sessionIdFactory
      : () => `inventory-import-execution-preflight-${randomUUID()}`;
  const documentIdFactory =
    typeof dependencies.documentIdFactory === 'function'
      ? dependencies.documentIdFactory
      : () => `inventory-import-execution-preflight-document-${randomUUID()}`;
  const ttlMs = Number.isFinite(dependencies.executionPreflightSessionTtlMs)
    ? Math.max(1000, Math.trunc(dependencies.executionPreflightSessionTtlMs))
    : EXECUTION_PREFLIGHT_SESSION_TTL_MS;
  const maxSessions = Number.isFinite(dependencies.maxExecutionPreflightSessions)
    ? Math.max(1, Math.min(MAX_EXECUTION_PREFLIGHT_SESSIONS, Math.trunc(dependencies.maxExecutionPreflightSessions)))
    : MAX_EXECUTION_PREFLIGHT_SESSIONS;
  let sequence = 0;

  function clearExpiredExecutionPreflightSessions(referenceTime = now()) {
    for (const [sessionId, entry] of sessions.entries()) {
      if (!entry || Number(entry.expiresAt) <= referenceTime) sessions.delete(sessionId);
    }
  }

  function removeOwnerExecutionPreflightSession(ownerId) {
    const normalizedOwnerId = validateOwnerId(ownerId);
    for (const [sessionId, entry] of sessions.entries()) {
      if (entry?.ownerId === normalizedOwnerId) sessions.delete(sessionId);
    }
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
        (createdAt === oldestCreatedAt && entrySequence === oldestSequence && String(sessionId) < String(oldestSessionId || sessionId))
      ) {
        oldestSessionId = sessionId;
        oldestCreatedAt = createdAt;
        oldestSequence = entrySequence;
      }
    }
    if (!oldestSessionId) {
      throw new InventoryImportExecutionPreflightError(
        EXECUTION_PREFLIGHT_SESSION_ERROR_CODES.CAPACITY_FAILED,
        'Inventory import execution preflight capacity is temporarily full.',
        'executionPreflightSessions'
      );
    }
    sessions.delete(oldestSessionId);
  }

  function storeExecutionPreflightSession(session) {
    clearExpiredExecutionPreflightSessions();
    const validSession = validateInventoryImportExecutionPreflightSession(session);
    removeOwnerExecutionPreflightSession(validSession.ownerId);
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

  function createExecutionPreflightSession(input = {}) {
    try {
      const ownerId = validateOwnerId(input.ownerId);
      const createdAt = now();
      const executionPreflightDocument = createInventoryImportExecutionPreflightDocument({
        commitPlan: input.commitPlan,
        commitPlanSessionId: input.commitPlanSessionId,
        currentState: input.currentState,
        permissionContext: input.permissionContext,
        preflightId: documentIdFactory(),
        createdAt: new Date(createdAt).toISOString(),
      });
      const session = createInventoryImportExecutionPreflightSession({
        sessionId: sessionIdFactory(),
        ownerId,
        createdAt,
        expiresAt: createdAt + ttlMs,
        executionPreflightDocument,
      });
      storeExecutionPreflightSession(session);
      return deepFreezePlainData({
        ok: true,
        executionPreflight: executionPreflightDocument,
        executionPreflightSession: publicSession(session),
      });
    } catch (error) {
      return errorResult(error);
    }
  }

  function getExecutionPreflightSession(input = {}) {
    try {
      const sessionId = validateExecutionPreflightSessionId(input.sessionId);
      const ownerId = validateOwnerId(input.ownerId);
      const entry = sessions.get(sessionId);
      if (!entry) {
        clearExpiredExecutionPreflightSessions();
        return { ok: false, code: EXECUTION_PREFLIGHT_SESSION_ERROR_CODES.NOT_FOUND, message: 'Inventory import execution preflight expired or is no longer available.' };
      }
      if (Number(entry.expiresAt) <= now()) {
        sessions.delete(sessionId);
        return { ok: false, code: EXECUTION_PREFLIGHT_SESSION_ERROR_CODES.EXPIRED, message: 'Inventory import execution preflight expired or is no longer available.' };
      }
      clearExpiredExecutionPreflightSessions();
      if (entry.ownerId !== ownerId) {
        return { ok: false, code: EXECUTION_PREFLIGHT_SESSION_ERROR_CODES.OWNER_MISMATCH, message: 'Inventory import execution preflight expired or is no longer available.' };
      }
      try {
        const session = validateInventoryImportExecutionPreflightSession(entry.session);
        return deepFreezePlainData({
          ok: true,
          executionPreflight: session.executionPreflightDocument,
          executionPreflightSession: publicSession(session),
        });
      } catch (error) {
        sessions.delete(sessionId);
        return errorResult(error);
      }
    } catch (error) {
      return errorResult(error);
    }
  }

  function getExecutionPreflightSessionCount() {
    clearExpiredExecutionPreflightSessions();
    return sessions.size;
  }

  function consumeExecutionPreflightSession(input = {}) {
    try {
      const sessionId = validateExecutionPreflightSessionId(input.sessionId);
      const ownerId = validateOwnerId(input.ownerId);
      const entry = sessions.get(sessionId);
      if (!entry) {
        clearExpiredExecutionPreflightSessions();
        return { ok: false, code: EXECUTION_PREFLIGHT_SESSION_ERROR_CODES.NOT_FOUND, message: 'Inventory import execution preflight expired or is no longer available.' };
      }
      if (Number(entry.expiresAt) <= now()) {
        sessions.delete(sessionId);
        return { ok: false, code: EXECUTION_PREFLIGHT_SESSION_ERROR_CODES.EXPIRED, message: 'Inventory import execution preflight expired or is no longer available.' };
      }
      if (entry.ownerId !== ownerId) {
        return { ok: false, code: EXECUTION_PREFLIGHT_SESSION_ERROR_CODES.OWNER_MISMATCH, message: 'Inventory import execution preflight expired or is no longer available.' };
      }
      validateInventoryImportExecutionPreflightSession(entry.session);
      sessions.delete(sessionId);
      return { ok: true, sessionId };
    } catch (error) {
      return errorResult(error);
    }
  }

  return Object.freeze({
    clearExpiredExecutionPreflightSessions,
    consumeExecutionPreflightSession,
    createExecutionPreflightSession,
    getExecutionPreflightSession,
    getExecutionPreflightSessionCount,
    _sessions: sessions,
  });
}

const defaultService = createInventoryImportExecutionPreflightSessionService();

module.exports = {
  EXECUTION_PREFLIGHT_SESSION_ERROR_CODES,
  EXECUTION_PREFLIGHT_SESSION_ID_PATTERN,
  EXECUTION_PREFLIGHT_SESSION_TTL_MS,
  MAX_EXECUTION_PREFLIGHT_SESSIONS,
  createInventoryImportExecutionPreflightSessionService,
  consumeExecutionPreflightSession: defaultService.consumeExecutionPreflightSession,
  createExecutionPreflightSession: defaultService.createExecutionPreflightSession,
  getExecutionPreflightSession: defaultService.getExecutionPreflightSession,
  validateInventoryImportExecutionPreflightSession,
};
