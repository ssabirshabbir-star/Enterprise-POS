const { isDeepStrictEqual } = require('node:util');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { validatePreviewWindowContract } = require('./preview-window.contract');
const { validatePrintDialogContract } = require('./print-dialog.contract');

function createPreviewSession(input = {}) {
  assertPlainData(input, 'previewSession');
  const sessionId = validateSessionId(input.sessionId);
  const request = validateRequestContext(input.request);
  const preview = validatePreviewDocument(input.preview);
  const previewWindow = validatePreviewWindowContract(input.previewWindow);
  const printDialog = validatePrintDialogContract(input.printDialog);

  if (
    preview.jobId !== request.job.jobId ||
    previewWindow.jobId !== request.job.jobId ||
    printDialog.jobId !== request.job.jobId
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW,
      'Barcode preview session job references do not match.',
      'previewSession'
    );
  }

  if (
    previewWindow.requestId !== request.lifecycle.eventId ||
    printDialog.requestId !== request.lifecycle.eventId
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW,
      'Barcode preview session request references do not match.',
      'previewSession'
    );
  }

  return Object.freeze({
    kind: 'barcode_preview_session',
    schemaVersion: 1,
    immutable: true,
    sessionId,
    jobId: request.job.jobId,
    requestId: request.lifecycle.eventId,
    request,
    preview,
    previewWindow,
    printDialog,
    executable: false,
    electronPreview: false,
    rendererDispatch: false,
    filesystemOutput: false,
    osPrint: false,
  });
}

function validatePreviewSession(session) {
  if (
    !session ||
    session.kind !== 'barcode_preview_session' ||
    session.schemaVersion !== 1 ||
    session.immutable !== true ||
    !Object.isFrozen(session)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW,
      'An immutable barcode preview session is required.',
      'previewSession'
    );
  }

  if (
    session.executable ||
    session.electronPreview ||
    session.rendererDispatch ||
    session.filesystemOutput ||
    session.osPrint
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW,
      'Barcode preview session exposes a forbidden execution surface.',
      'previewSession'
    );
  }

  const rebuilt = createPreviewSession({
    sessionId: session.sessionId,
    request: session.request,
    preview: session.preview,
    previewWindow: session.previewWindow,
    printDialog: session.printDialog,
  });
  if (!isDeepStrictEqual(session, rebuilt)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW,
      'Barcode preview session failed deterministic validation.',
      'previewSession'
    );
  }
  return session;
}

function validateSessionId(value) {
  const sessionId = String(value || '').trim();
  if (
    !/^barcode-preview-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      sessionId
    )
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW,
      'A backend-generated barcode preview session id is required.',
      'sessionId'
    );
  }
  return sessionId;
}

function validateRequestContext(request) {
  if (
    !request ||
    request.kind !== 'barcode_print_request_context' ||
    request.schemaVersion !== 1 ||
    request.immutable !== true ||
    !Object.isFrozen(request) ||
    !request.job ||
    !request.lifecycle ||
    typeof request.job.jobId !== 'string' ||
    typeof request.lifecycle.eventId !== 'string'
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW,
      'An immutable barcode request context is required.',
      'request'
    );
  }
  assertPlainData(request, 'request');
  return deepFreezePlainData(request, 'request');
}

function validatePreviewDocument(preview) {
  if (
    !preview ||
    preview.kind !== 'barcode_preview_document' ||
    preview.schemaVersion !== 1 ||
    preview.immutable !== true ||
    !Object.isFrozen(preview) ||
    preview.executable !== false ||
    typeof preview.jobId !== 'string'
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW,
      'An immutable barcode preview document is required.',
      'preview'
    );
  }
  assertPlainData(preview, 'preview');
  return deepFreezePlainData(preview, 'preview');
}

function assertPlainData(value, field) {
  const seen = new Set();

  function visit(item) {
    if (item === null || item === undefined) return;
    if (typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint') {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PREVIEW,
        'Barcode preview sessions must not contain executable or unsupported values.',
        field
      );
    }
    if (typeof item !== 'object') return;
    if (seen.has(item)) return;
    if (Object.getPrototypeOf(item) !== Object.prototype && !Array.isArray(item)) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PREVIEW,
        'Barcode preview sessions must contain plain data only.',
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
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PREVIEW,
        'Barcode preview sessions must contain plain data only.',
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

module.exports = {
  createPreviewSession,
  validatePreviewSession,
};
