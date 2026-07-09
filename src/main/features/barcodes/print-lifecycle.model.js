const { PRINT_LIFECYCLE_STATES } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { freezePlainData } = require('./immutable');

function identifier(value, field) {
  const result = String(value || '').trim();
  if (!result || result.length > 120 || /[\u0000-\u001F\u007F-\u009F]/.test(result)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LIFECYCLE,
      `${field} is invalid.`,
      field
    );
  }
  return result;
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  const result = String(value).trim();
  if (!result || result.length > maxLength || /[\u0000-\u001F\u007F-\u009F]/.test(result)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LIFECYCLE,
      `${field} is invalid.`,
      field
    );
  }
  return result;
}

function createPrintLifecycleEvent(input = {}) {
  const state = String(input.state || '').trim();
  if (!Object.values(PRINT_LIFECYCLE_STATES).includes(state)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LIFECYCLE,
      'Print lifecycle state is invalid.',
      'state'
    );
  }

  const occurredAt = String(input.occurredAt || new Date().toISOString());
  if (Number.isNaN(Date.parse(occurredAt))) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LIFECYCLE,
      'Print lifecycle timestamp is invalid.',
      'occurredAt'
    );
  }

  const errorCode = optionalText(input.errorCode, 'errorCode', 120);
  if (state === PRINT_LIFECYCLE_STATES.FAILED && !errorCode) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LIFECYCLE,
      'Failed print lifecycle events require an error code.',
      'errorCode'
    );
  }

  return Object.freeze({
    kind: 'barcode_print_lifecycle_event',
    schemaVersion: 1,
    immutable: true,
    eventId: identifier(input.eventId, 'eventId'),
    jobId: identifier(input.jobId, 'jobId'),
    state,
    occurredAt,
    message: optionalText(input.message, 'message', 500),
    errorCode,
    metadata: freezePlainData(input.metadata || {}, 'metadata'),
  });
}

module.exports = {
  createPrintLifecycleEvent,
};
