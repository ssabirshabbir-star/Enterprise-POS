const { isDeepStrictEqual } = require('node:util');
const { PRINT_LIFECYCLE_STATES } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { freezePlainData } = require('./immutable');
const { validateIdentifier, validateOptionalText } = require('./model-validation');

const TRANSITIONS = Object.freeze({
  [PRINT_LIFECYCLE_STATES.REQUESTED]: Object.freeze([
    PRINT_LIFECYCLE_STATES.PREPARED,
    PRINT_LIFECYCLE_STATES.CANCELLED,
    PRINT_LIFECYCLE_STATES.FAILED,
  ]),
  [PRINT_LIFECYCLE_STATES.PREPARED]: Object.freeze([
    PRINT_LIFECYCLE_STATES.READY,
    PRINT_LIFECYCLE_STATES.CANCELLED,
    PRINT_LIFECYCLE_STATES.FAILED,
  ]),
  [PRINT_LIFECYCLE_STATES.READY]: Object.freeze([
    PRINT_LIFECYCLE_STATES.COMPLETED,
    PRINT_LIFECYCLE_STATES.CANCELLED,
    PRINT_LIFECYCLE_STATES.FAILED,
  ]),
  [PRINT_LIFECYCLE_STATES.CANCELLED]: Object.freeze([]),
  [PRINT_LIFECYCLE_STATES.FAILED]: Object.freeze([]),
  [PRINT_LIFECYCLE_STATES.COMPLETED]: Object.freeze([]),
});

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

  const errorCode = validateOptionalText(
    input.errorCode,
    'errorCode',
    120,
    BARCODE_ERROR_CODES.INVALID_LIFECYCLE
  );
  if (state === PRINT_LIFECYCLE_STATES.FAILED && !errorCode) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LIFECYCLE,
      'Failed print lifecycle events require an error code.',
      'errorCode'
    );
  }
  const previousEventId = input.previousEventId
    ? validateIdentifier(
        input.previousEventId,
        'previousEventId',
        BARCODE_ERROR_CODES.INVALID_LIFECYCLE
      )
    : null;
  if (
    (state === PRINT_LIFECYCLE_STATES.REQUESTED && previousEventId) ||
    (state !== PRINT_LIFECYCLE_STATES.REQUESTED && !previousEventId)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LIFECYCLE,
      'Print lifecycle predecessor is invalid for the selected state.',
      'previousEventId'
    );
  }

  return Object.freeze({
    kind: 'barcode_print_lifecycle_event',
    schemaVersion: 1,
    immutable: true,
    eventId: validateIdentifier(input.eventId, 'eventId', BARCODE_ERROR_CODES.INVALID_LIFECYCLE),
    jobId: validateIdentifier(input.jobId, 'jobId', BARCODE_ERROR_CODES.INVALID_LIFECYCLE),
    previousEventId,
    state,
    occurredAt,
    message: validateOptionalText(
      input.message,
      'message',
      500,
      BARCODE_ERROR_CODES.INVALID_LIFECYCLE
    ),
    errorCode,
    metadata: freezePlainData(input.metadata || {}, 'metadata'),
  });
}

function validatePrintLifecycleEvent(event) {
  if (
    !event ||
    event.kind !== 'barcode_print_lifecycle_event' ||
    event.schemaVersion !== 1 ||
    event.immutable !== true ||
    !Object.isFrozen(event)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LIFECYCLE,
      'An immutable print lifecycle event is required.',
      'lifecycle'
    );
  }
  const rebuilt = createPrintLifecycleEvent(event);
  if (!isDeepStrictEqual(event, rebuilt)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LIFECYCLE,
      'Print lifecycle event failed deterministic validation.',
      'lifecycle'
    );
  }
  return rebuilt;
}

function validatePrintLifecycleTransition(previous, next) {
  const current = validatePrintLifecycleEvent(previous);
  const candidate = validatePrintLifecycleEvent(next);
  if (
    candidate.jobId !== current.jobId ||
    candidate.eventId === current.eventId ||
    candidate.previousEventId !== current.eventId ||
    !TRANSITIONS[current.state].includes(candidate.state)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_TRANSITION,
      `Print lifecycle cannot transition from ${current.state} to ${candidate.state}.`,
      'state'
    );
  }
  if (Date.parse(candidate.occurredAt) < Date.parse(current.occurredAt)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_TRANSITION,
      'Print lifecycle events must be chronological.',
      'occurredAt'
    );
  }
  return Object.freeze({
    previous: current,
    current: candidate,
  });
}

function transitionPrintLifecycle(previous, input = {}) {
  const current = validatePrintLifecycleEvent(previous);
  const next = createPrintLifecycleEvent({
    ...input,
    jobId: current.jobId,
    previousEventId: current.eventId,
  });
  return validatePrintLifecycleTransition(current, next).current;
}

module.exports = {
  createPrintLifecycleEvent,
  transitionPrintLifecycle,
  validatePrintLifecycleEvent,
  validatePrintLifecycleTransition,
};
