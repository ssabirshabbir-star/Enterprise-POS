const { isDeepStrictEqual } = require('node:util');
const {
  InventoryImportCommitPlanError,
  assertPlainData,
  deepFreezePlainData,
  validateInventoryImportCommitPlanDocument,
} = require('./inventory-import-commit-plan.model');

const COMMIT_PLAN_SESSION_KIND = 'inventory_import_commit_plan_session';
const COMMIT_PLAN_SESSION_VERSION = 'inventory-import-commit-plan-session-v1';
const COMMIT_PLAN_SESSION_ID_PATTERN =
  /^inventory-import-commit-plan-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COMMIT_PLAN_SESSION_ERROR_CODES = Object.freeze({
  INVALID_SESSION: 'INVENTORY_IMPORT_COMMIT_PLAN_SESSION_INVALID',
  NOT_FOUND: 'INVENTORY_IMPORT_COMMIT_PLAN_SESSION_NOT_FOUND',
  EXPIRED: 'INVENTORY_IMPORT_COMMIT_PLAN_SESSION_EXPIRED',
  OWNER_MISMATCH: 'INVENTORY_IMPORT_COMMIT_PLAN_SESSION_OWNER_MISMATCH',
  CAPACITY_FAILED: 'INVENTORY_IMPORT_COMMIT_PLAN_SESSION_CAPACITY_FAILED',
});

function fail(message, field = null) {
  throw new InventoryImportCommitPlanError(
    COMMIT_PLAN_SESSION_ERROR_CODES.INVALID_SESSION,
    message,
    field
  );
}

function validateCommitPlanSessionId(value) {
  const sessionId = String(value || '').trim();
  if (!COMMIT_PLAN_SESSION_ID_PATTERN.test(sessionId)) {
    fail('A backend-generated inventory import commit plan session id is required.', 'sessionId');
  }
  return sessionId;
}

function validateOwnerId(value) {
  const ownerId = Number(value);
  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    fail('Inventory import commit plan session owner is invalid.', 'ownerId');
  }
  return ownerId;
}

function createInventoryImportCommitPlanSession(input = {}) {
  assertPlainData(input, 'commitPlanSession');
  const sessionId = validateCommitPlanSessionId(input.sessionId);
  const ownerId = validateOwnerId(input.ownerId);
  const createdAt = Number(input.createdAt);
  const expiresAt = Number(input.expiresAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= createdAt) {
    fail('Inventory import commit plan session expiry is invalid.', 'expiresAt');
  }
  const commitPlanDocument = validateInventoryImportCommitPlanDocument(input.commitPlanDocument);

  return deepFreezePlainData(
    {
      kind: COMMIT_PLAN_SESSION_KIND,
      version: COMMIT_PLAN_SESSION_VERSION,
      schemaVersion: 1,
      immutable: true,
      sessionId,
      ownerId,
      createdAt,
      expiresAt,
      sourceMatchedPreviewSessionId: commitPlanDocument.sourceMatchedPreviewSessionId,
      sourcePreviewSessionId: commitPlanDocument.sourcePreviewSessionId,
      sourcePreviewId: commitPlanDocument.sourcePreviewId,
      planDigest: commitPlanDocument.planDigest,
      rowCount: commitPlanDocument.planSummary.totalRows,
      commitPlanDocument,
      executable: false,
      rendererAuthoritative: false,
      filesystemOutput: false,
      databaseWrite: false,
      commitReady: false,
      requiresRevalidation: true,
    },
    'commitPlanSession'
  );
}

function validateInventoryImportCommitPlanSession(session) {
  if (
    !session ||
    session.kind !== COMMIT_PLAN_SESSION_KIND ||
    session.version !== COMMIT_PLAN_SESSION_VERSION ||
    session.schemaVersion !== 1 ||
    session.immutable !== true ||
    !Object.isFrozen(session) ||
    session.executable ||
    session.rendererAuthoritative ||
    session.filesystemOutput ||
    session.databaseWrite ||
    session.commitReady ||
    session.requiresRevalidation !== true
  ) {
    fail('An immutable inventory import commit plan session is required.', 'commitPlanSession');
  }
  assertPlainData(session, 'commitPlanSession');
  const rebuilt = createInventoryImportCommitPlanSession({
    sessionId: session.sessionId,
    ownerId: session.ownerId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    commitPlanDocument: session.commitPlanDocument,
  });
  if (!isDeepStrictEqual(session, rebuilt)) {
    fail('Inventory import commit plan session failed deterministic validation.', 'commitPlanSession');
  }
  return session;
}

module.exports = {
  COMMIT_PLAN_SESSION_ERROR_CODES,
  COMMIT_PLAN_SESSION_ID_PATTERN,
  COMMIT_PLAN_SESSION_KIND,
  COMMIT_PLAN_SESSION_VERSION,
  createInventoryImportCommitPlanSession,
  validateCommitPlanSessionId,
  validateInventoryImportCommitPlanSession,
  validateOwnerId,
};
