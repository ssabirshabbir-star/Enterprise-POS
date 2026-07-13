const { isDeepStrictEqual } = require('node:util');
const {
  MATCHED_PREVIEW_ERROR_CODES,
  InventoryImportMatchedPreviewError,
  assertPlainData,
  deepFreezePlainData,
  validateInventoryImportMatchedPreviewDocument,
} = require('./inventory-import-matched-preview.model');

const MATCHED_PREVIEW_SESSION_KIND = 'inventory_import_matched_preview_session';
const MATCHED_PREVIEW_SESSION_VERSION = 'inventory-import-matched-preview-session-v1';
const MATCHED_PREVIEW_SESSION_ID_PATTERN =
  /^inventory-import-matched-preview-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message, field = null) {
  throw new InventoryImportMatchedPreviewError(
    MATCHED_PREVIEW_ERROR_CODES.INVALID_SESSION,
    message,
    field
  );
}

function validateMatchedPreviewSessionId(value) {
  const sessionId = String(value || '').trim();
  if (!MATCHED_PREVIEW_SESSION_ID_PATTERN.test(sessionId)) {
    fail('A backend-generated inventory import matched preview session id is required.', 'sessionId');
  }
  return sessionId;
}

function validateOwnerId(value) {
  const ownerId = Number(value);
  if (!Number.isInteger(ownerId) || ownerId <= 0) {
    fail('Inventory import matched preview session owner is invalid.', 'ownerId');
  }
  return ownerId;
}

function createInventoryImportMatchedPreviewSession(input = {}) {
  assertPlainData(input, 'matchedPreviewSession');
  const sessionId = validateMatchedPreviewSessionId(input.sessionId);
  const ownerId = validateOwnerId(input.ownerId);
  const createdAt = Number(input.createdAt);
  const expiresAt = Number(input.expiresAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= createdAt) {
    fail('Inventory import matched preview session expiry is invalid.', 'expiresAt');
  }
  const matchedPreviewDocument = validateInventoryImportMatchedPreviewDocument(
    input.matchedPreviewDocument
  );

  return deepFreezePlainData(
    {
      kind: MATCHED_PREVIEW_SESSION_KIND,
      version: MATCHED_PREVIEW_SESSION_VERSION,
      schemaVersion: 1,
      immutable: true,
      sessionId,
      ownerId,
      createdAt,
      expiresAt,
      sourcePreviewSessionId: matchedPreviewDocument.sourcePreviewSessionId,
      sourcePreviewId: matchedPreviewDocument.sourcePreviewId,
      rowCount: matchedPreviewDocument.rowCount,
      matchingSummary: matchedPreviewDocument.matchingSummary,
      sourceBasename: matchedPreviewDocument.sourceBasename,
      matchedPreviewDocument,
      executable: false,
      rendererAuthoritative: false,
      filesystemOutput: false,
      databaseWrite: false,
      commitReady: false,
    },
    'matchedPreviewSession'
  );
}

function validateInventoryImportMatchedPreviewSession(session) {
  if (
    !session ||
    session.kind !== MATCHED_PREVIEW_SESSION_KIND ||
    session.version !== MATCHED_PREVIEW_SESSION_VERSION ||
    session.schemaVersion !== 1 ||
    session.immutable !== true ||
    !Object.isFrozen(session) ||
    session.executable ||
    session.rendererAuthoritative ||
    session.filesystemOutput ||
    session.databaseWrite ||
    session.commitReady
  ) {
    fail('An immutable inventory import matched preview session is required.', 'matchedPreviewSession');
  }
  assertPlainData(session, 'matchedPreviewSession');
  const rebuilt = createInventoryImportMatchedPreviewSession({
    sessionId: session.sessionId,
    ownerId: session.ownerId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    matchedPreviewDocument: session.matchedPreviewDocument,
  });
  if (!isDeepStrictEqual(session, rebuilt)) {
    fail(
      'Inventory import matched preview session failed deterministic validation.',
      'matchedPreviewSession'
    );
  }
  return session;
}

module.exports = {
  MATCHED_PREVIEW_SESSION_ID_PATTERN,
  MATCHED_PREVIEW_SESSION_KIND,
  MATCHED_PREVIEW_SESSION_VERSION,
  createInventoryImportMatchedPreviewSession,
  validateInventoryImportMatchedPreviewSession,
  validateMatchedPreviewSessionId,
  validateOwnerId,
};
