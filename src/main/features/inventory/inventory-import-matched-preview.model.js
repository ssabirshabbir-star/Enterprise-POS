const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const MATCHED_PREVIEW_DOCUMENT_VERSION = 'inventory-import-matched-preview-v1';
const MATCHED_PREVIEW_DOCUMENT_KIND = 'inventory_import_matched_preview_document';

const MATCHED_PREVIEW_ERROR_CODES = Object.freeze({
  INVALID_DOCUMENT: 'INVENTORY_IMPORT_MATCHED_PREVIEW_INVALID',
  INVALID_SESSION: 'INVENTORY_IMPORT_MATCHED_SESSION_INVALID',
  NOT_FOUND: 'INVENTORY_IMPORT_MATCHED_SESSION_NOT_FOUND',
  EXPIRED: 'INVENTORY_IMPORT_MATCHED_SESSION_EXPIRED',
  OWNER_MISMATCH: 'INVENTORY_IMPORT_MATCHED_SESSION_OWNER_MISMATCH',
  CAPACITY_FAILED: 'INVENTORY_IMPORT_MATCHED_SESSION_CAPACITY_FAILED',
});

class InventoryImportMatchedPreviewError extends Error {
  constructor(code, message, field = null) {
    super(message);
    this.name = 'InventoryImportMatchedPreviewError';
    this.code = code;
    this.field = field;
  }
}

function fail(code, message, field = null) {
  throw new InventoryImportMatchedPreviewError(code, message, field);
}

function assertPlainData(value, field = 'matchedPreview') {
  const seen = new Set();

  function visit(item, key) {
    if (item === null || item === undefined) return;
    if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
      fail(MATCHED_PREVIEW_ERROR_CODES.INVALID_DOCUMENT, 'Matched preview data must not be executable.', key);
    }
    if (typeof item !== 'object') return;
    if (seen.has(item)) {
      fail(MATCHED_PREVIEW_ERROR_CODES.INVALID_DOCUMENT, 'Matched preview data must not be circular.', key);
    }
    if (Object.getPrototypeOf(item) !== Object.prototype && !Array.isArray(item)) {
      fail(MATCHED_PREVIEW_ERROR_CODES.INVALID_DOCUMENT, 'Matched preview data must be plain data only.', key);
    }
    seen.add(item);
    Object.entries(item).forEach(([childKey, child]) => visit(child, childKey));
    seen.delete(item);
  }

  visit(value, field);
}

function deepFreezePlainData(value, field = 'matchedPreview') {
  const seen = new Set();

  function visit(item) {
    if (item === null || item === undefined || typeof item !== 'object') return item;
    if (seen.has(item)) return item;
    if (Object.getPrototypeOf(item) !== Object.prototype && !Array.isArray(item)) {
      fail(MATCHED_PREVIEW_ERROR_CODES.INVALID_DOCUMENT, 'Matched preview output must be plain data only.', field);
    }
    seen.add(item);
    Object.values(item).forEach(visit);
    Object.freeze(item);
    seen.delete(item);
    return item;
  }

  return visit(value);
}

function clonePlainData(value, field) {
  assertPlainData(value, field);
  return JSON.parse(JSON.stringify(value));
}

function validTimestamp(value, field) {
  const text = String(value || '').trim();
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime()) || date.toISOString() !== text) {
    fail(MATCHED_PREVIEW_ERROR_CODES.INVALID_DOCUMENT, `${field} must be an ISO timestamp.`, field);
  }
  return text;
}

function requiredText(value, field, maxLength = 180) {
  const text = String(value || '').trim();
  if (!text) fail(MATCHED_PREVIEW_ERROR_CODES.INVALID_DOCUMENT, `${field} is required.`, field);
  return text.slice(0, maxLength);
}

function sourceSessionId(value) {
  const text = requiredText(value, 'sourcePreviewSessionId', 120);
  if (!/^inventory-import-preview-[0-9a-f-]{36}$/i.test(text)) {
    fail(
      MATCHED_PREVIEW_ERROR_CODES.INVALID_DOCUMENT,
      'A Phase 4 inventory import preview session id is required.',
      'sourcePreviewSessionId'
    );
  }
  return text;
}

function sourcePreviewId(value) {
  const text = requiredText(value, 'sourcePreviewId', 160);
  if (!/^inventory-import-preview-document-[0-9a-f-]{36}$/i.test(text)) {
    fail(
      MATCHED_PREVIEW_ERROR_CODES.INVALID_DOCUMENT,
      'A Phase 4 inventory import preview document id is required.',
      'sourcePreviewId'
    );
  }
  return text;
}

function nonNegativeInteger(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    fail(MATCHED_PREVIEW_ERROR_CODES.INVALID_DOCUMENT, `${field} must be a non-negative integer.`, field);
  }
  return number;
}

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
    .join(',')}}`;
}

function digestMatchedContent(content) {
  return createHash('sha256').update(canonicalStringify(content), 'utf8').digest('hex');
}

function createInventoryImportMatchedPreviewDocument(input = {}) {
  assertPlainData(input, 'matchedPreview');
  const analysis = clonePlainData(input.matchingAnalysis, 'matchingAnalysis');
  if (
    !analysis ||
    analysis.kind !== 'inventory_import_matching_analysis' ||
    analysis.schemaVersion !== 1 ||
    analysis.immutable !== true ||
    analysis.databaseWrite !== false ||
    analysis.commitReady !== false ||
    !Array.isArray(analysis.rows) ||
    !analysis.summary
  ) {
    fail(
      MATCHED_PREVIEW_ERROR_CODES.INVALID_DOCUMENT,
      'A completed Phase 5B matching analysis is required.',
      'matchingAnalysis'
    );
  }

  const source = input.sourcePreview || {};
  const matchedAt = validTimestamp(input.matchedAt || new Date().toISOString(), 'matchedAt');
  const sourceFile = source.sourceFile || {};
  const sourceRowCount = nonNegativeInteger(
    input.sourceRowCount ?? source.summary?.totalRows ?? source.rows?.length ?? analysis.rows.length,
    'sourceRowCount'
  );
  const rowCount = nonNegativeInteger(analysis.rows.length, 'rowCount');
  if (sourceRowCount !== rowCount || analysis.summary.totalRows !== rowCount) {
    fail(MATCHED_PREVIEW_ERROR_CODES.INVALID_DOCUMENT, 'Matched preview row counts must agree.', 'rowCount');
  }

  const sourceBasename = requiredText(
    input.sourceBasename || sourceFile.fileName || input.sourceFilename || 'inventory-import.csv',
    'sourceBasename',
    180
  );
  const digestContent = {
    version: MATCHED_PREVIEW_DOCUMENT_VERSION,
    sourcePreviewId: sourcePreviewId(input.sourcePreviewId || source.previewId),
    sourcePreviewSessionId: sourceSessionId(input.sourcePreviewSessionId),
    sourceDocumentVersion: String(input.sourceDocumentVersion || source.templateVersion || ''),
    sourceBasename,
    sourceRowCount,
    matchingSummary: analysis.summary,
    matchedRows: analysis.rows,
  };
  const document = {
    kind: MATCHED_PREVIEW_DOCUMENT_KIND,
    version: MATCHED_PREVIEW_DOCUMENT_VERSION,
    schemaVersion: 1,
    immutable: true,
    executable: false,
    rendererAuthoritative: false,
    databaseWrite: false,
    commitReady: false,
    sourcePreviewSessionId: digestContent.sourcePreviewSessionId,
    sourcePreviewId: digestContent.sourcePreviewId,
    sourceDocumentVersion: digestContent.sourceDocumentVersion,
    matchedAt,
    sourceFilename: sourceBasename,
    sourceBasename,
    sourceRowCount,
    rowCount,
    matchingSummary: analysis.summary,
    matchedRows: analysis.rows,
    sourceDigest: input.sourceDigest || source.sourceDigest || null,
    matchingDigest: digestMatchedContent(digestContent),
  };
  return deepFreezePlainData(document, 'matchedPreview');
}

function validateInventoryImportMatchedPreviewDocument(document) {
  if (
    !document ||
    document.kind !== MATCHED_PREVIEW_DOCUMENT_KIND ||
    document.version !== MATCHED_PREVIEW_DOCUMENT_VERSION ||
    document.schemaVersion !== 1 ||
    document.immutable !== true ||
    !Object.isFrozen(document) ||
    document.executable !== false ||
    document.rendererAuthoritative !== false ||
    document.databaseWrite !== false ||
    document.commitReady !== false
  ) {
    fail(
      MATCHED_PREVIEW_ERROR_CODES.INVALID_DOCUMENT,
      'An immutable inventory import matched preview document is required.',
      'matchedPreview'
    );
  }
  assertPlainData(document, 'matchedPreview');
  const rebuilt = createInventoryImportMatchedPreviewDocument({
    sourcePreviewSessionId: document.sourcePreviewSessionId,
    sourcePreviewId: document.sourcePreviewId,
    sourceDocumentVersion: document.sourceDocumentVersion,
    matchedAt: document.matchedAt,
    sourceBasename: document.sourceBasename,
    sourceRowCount: document.sourceRowCount,
    sourceDigest: document.sourceDigest,
    matchingAnalysis: {
      kind: 'inventory_import_matching_analysis',
      schemaVersion: 1,
      immutable: true,
      databaseWrite: false,
      commitReady: false,
      summary: document.matchingSummary,
      rows: document.matchedRows,
    },
  });
  if (!isDeepStrictEqual(document, rebuilt)) {
    fail(
      MATCHED_PREVIEW_ERROR_CODES.INVALID_DOCUMENT,
      'Inventory import matched preview document failed deterministic validation.',
      'matchedPreview'
    );
  }
  return document;
}

module.exports = {
  MATCHED_PREVIEW_DOCUMENT_KIND,
  MATCHED_PREVIEW_DOCUMENT_VERSION,
  MATCHED_PREVIEW_ERROR_CODES,
  InventoryImportMatchedPreviewError,
  assertPlainData,
  createInventoryImportMatchedPreviewDocument,
  deepFreezePlainData,
  validateInventoryImportMatchedPreviewDocument,
};
