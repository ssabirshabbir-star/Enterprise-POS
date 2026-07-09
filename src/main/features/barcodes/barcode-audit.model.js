const { BARCODE_AUDIT_EVENTS } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');

function immutableMetadata(value) {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return Object.freeze(value.map(immutableMetadata));
  if (typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableMetadata(item)]))
    );
  }
  throw new BarcodeDomainError(
    BARCODE_ERROR_CODES.INVALID_REQUEST,
    'Barcode audit metadata contains an unsupported value.',
    'metadata'
  );
}

function createBarcodeAuditEvent(input = {}) {
  const eventType = String(input.eventType || '').trim();
  const requestId = String(input.requestId || '').trim();
  const userId = Number(input.userId);
  const productIds = Array.isArray(input.productIds) ? input.productIds.map(Number) : [];
  const occurredAt = String(input.occurredAt || new Date().toISOString());

  if (!Object.values(BARCODE_AUDIT_EVENTS).includes(eventType)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_REQUEST,
      'Barcode audit event type is invalid.',
      'eventType'
    );
  }
  if (
    !requestId ||
    requestId.length > 120 ||
    !Number.isInteger(userId) ||
    userId <= 0 ||
    productIds.length === 0 ||
    productIds.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(productIds).size !== productIds.length
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_REQUEST,
      'Barcode audit request, user, and products are required.',
      'audit'
    );
  }
  if (Number.isNaN(Date.parse(occurredAt))) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_REQUEST,
      'Barcode audit timestamp is invalid.',
      'occurredAt'
    );
  }

  return Object.freeze({
    kind: 'barcode_audit_event',
    schemaVersion: 1,
    immutable: true,
    eventType,
    requestId,
    userId,
    productIds: Object.freeze(productIds),
    occurredAt,
    errorCode: input.errorCode ? String(input.errorCode) : null,
    metadata: immutableMetadata(input.metadata || {}),
  });
}

module.exports = {
  createBarcodeAuditEvent,
};
