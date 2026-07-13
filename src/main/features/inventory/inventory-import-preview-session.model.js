const { isDeepStrictEqual } = require('node:util');

const SESSION_ID_PATTERN =
  /^inventory-import-preview-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class InventoryImportPreviewError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'InventoryImportPreviewError';
    this.code = code;
    this.field = field;
  }
}

function assertPlainData(value, field) {
  const seen = new Set();

  function visit(item) {
    if (item === null || item === undefined) return;
    if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
      throw new InventoryImportPreviewError(
        'invalid_preview_payload',
        'Inventory import preview must contain plain data only.',
        field
      );
    }
    if (typeof item !== 'object') return;
    if (seen.has(item)) return;
    if (Object.getPrototypeOf(item) !== Object.prototype && !Array.isArray(item)) {
      throw new InventoryImportPreviewError(
        'invalid_preview_payload',
        'Inventory import preview must contain plain data only.',
        field
      );
    }
    seen.add(item);
    Object.values(item).forEach(visit);
    seen.delete(item);
  }

  visit(value);
}

function deepFreezePlainData(value, field) {
  const seen = new Set();

  function visit(item) {
    if (item === null || item === undefined || typeof item !== 'object') return item;
    if (seen.has(item)) return item;
    if (Object.getPrototypeOf(item) !== Object.prototype && !Array.isArray(item)) {
      throw new InventoryImportPreviewError(
        'invalid_preview_payload',
        'Inventory import preview must contain plain data only.',
        field
      );
    }
    seen.add(item);
    Object.values(item).forEach(visit);
    Object.freeze(item);
    seen.delete(item);
    return item;
  }

  return visit(value);
}

function validateSessionId(value) {
  const sessionId = String(value || '').trim();
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new InventoryImportPreviewError(
      'invalid_preview_session',
      'A backend-generated inventory import preview session id is required.',
      'sessionId'
    );
  }
  return sessionId;
}

function createImportPreviewDocument(input = {}) {
  assertPlainData(input, 'preview');
  const previewId = String(input.previewId || '').trim();
  if (!previewId) {
    throw new InventoryImportPreviewError(
      'invalid_preview_document',
      'Inventory import preview id is required.',
      'previewId'
    );
  }
  const rows = Array.isArray(input.rows) ? input.rows : [];
  const document = {
    kind: 'inventory_import_preview_document',
    schemaVersion: 1,
    immutable: true,
    executable: false,
    databaseMatched: false,
    databaseWrite: false,
    commitReady: false,
    previewId,
    createdAt: String(input.createdAt || new Date().toISOString()),
    templateVersion: String(input.templateVersion || ''),
    sourceFile: input.sourceFile || {},
    permissions: input.permissions || {},
    summary: input.summary || {},
    rows,
    errors: Array.isArray(input.errors) ? input.errors : [],
    warnings: Array.isArray(input.warnings) ? input.warnings : [],
  };
  return deepFreezePlainData(document, 'preview');
}

function validateImportPreviewDocument(preview) {
  if (
    !preview ||
    preview.kind !== 'inventory_import_preview_document' ||
    preview.schemaVersion !== 1 ||
    preview.immutable !== true ||
    !Object.isFrozen(preview) ||
    preview.executable !== false ||
    preview.databaseWrite !== false ||
    preview.commitReady !== false
  ) {
    throw new InventoryImportPreviewError(
      'invalid_preview_document',
      'An immutable inventory import preview document is required.',
      'preview'
    );
  }
  assertPlainData(preview, 'preview');
  return deepFreezePlainData(preview, 'preview');
}

function createImportPreviewSession(input = {}) {
  assertPlainData(input, 'previewSession');
  const sessionId = validateSessionId(input.sessionId);
  const ownerUserId = Number(input.ownerUserId);
  if (!Number.isInteger(ownerUserId) || ownerUserId <= 0) {
    throw new InventoryImportPreviewError(
      'invalid_preview_session',
      'Inventory import preview session owner is invalid.',
      'ownerUserId'
    );
  }
  const preview = validateImportPreviewDocument(input.preview);
  const createdAt = Number(input.createdAt);
  const expiresAt = Number(input.expiresAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= createdAt) {
    throw new InventoryImportPreviewError(
      'invalid_preview_session',
      'Inventory import preview session expiry is invalid.',
      'expiresAt'
    );
  }
  return deepFreezePlainData(
    {
      kind: 'inventory_import_preview_session',
      schemaVersion: 1,
      immutable: true,
      sessionId,
      ownerUserId,
      previewId: preview.previewId,
      createdAt,
      expiresAt,
      preview,
      executable: false,
      rendererAuthoritative: false,
      filesystemOutput: false,
      databaseWrite: false,
    },
    'previewSession'
  );
}

function validateImportPreviewSession(session) {
  if (
    !session ||
    session.kind !== 'inventory_import_preview_session' ||
    session.schemaVersion !== 1 ||
    session.immutable !== true ||
    !Object.isFrozen(session) ||
    session.executable ||
    session.rendererAuthoritative ||
    session.filesystemOutput ||
    session.databaseWrite
  ) {
    throw new InventoryImportPreviewError(
      'invalid_preview_session',
      'An immutable inventory import preview session is required.',
      'previewSession'
    );
  }
  const rebuilt = createImportPreviewSession({
    sessionId: session.sessionId,
    ownerUserId: session.ownerUserId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    preview: session.preview,
  });
  if (!isDeepStrictEqual(session, rebuilt)) {
    throw new InventoryImportPreviewError(
      'invalid_preview_session',
      'Inventory import preview session failed deterministic validation.',
      'previewSession'
    );
  }
  return session;
}

module.exports = {
  InventoryImportPreviewError,
  createImportPreviewDocument,
  createImportPreviewSession,
  validateImportPreviewDocument,
  validateImportPreviewSession,
};
