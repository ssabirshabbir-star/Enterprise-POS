const authService = require('../auth/auth.service');
const {
  BARCODE_AUDIT_EVENTS,
  BARCODE_FORMATS,
  BARCODE_PERMISSIONS,
  LABEL_SIZES,
  ORIENTATIONS,
  PRINTER_TYPES,
} = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError, errorResult } = require('./barcode.error');
const { createBarcodeLabel } = require('./barcode-label.model');

async function requireValidationPermission() {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.AUTHENTICATION_REQUIRED,
      'Authentication is required.'
    );
  }
  const permissions = profileResult.profile?.permissions;
  if (!Array.isArray(permissions) || !permissions.includes(BARCODE_PERMISSIONS.VALIDATE_LABEL)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.ACCESS_DENIED,
      'You do not have permission to validate barcode labels.'
    );
  }
  return profileResult.profile;
}

function capabilitiesModel() {
  return Object.freeze({
    kind: 'barcode_capabilities',
    schemaVersion: 1,
    immutable: true,
    formats: Object.freeze(Object.values(BARCODE_FORMATS)),
    printerTypes: Object.freeze(Object.values(PRINTER_TYPES)),
    orientations: Object.freeze(Object.values(ORIENTATIONS)),
    labelSizes: Object.freeze(
      Object.values(LABEL_SIZES).map((size) =>
        Object.freeze({
          id: size.id,
          widthMm: size.widthMm,
          heightMm: size.heightMm,
          printerTypes: size.printerTypes,
        })
      )
    ),
    auditEvents: Object.freeze(Object.values(BARCODE_AUDIT_EVENTS)),
    operations: Object.freeze({
      validateLabel: true,
      renderBarcode: false,
      previewLabel: false,
      printLabel: false,
      batchPrint: false,
    }),
    authoritativeProductLookupRequiredForExecution: true,
  });
}

async function getCapabilities() {
  try {
    await requireValidationPermission();
    return { ok: true, capabilities: capabilitiesModel() };
  } catch (error) {
    return errorResult(error);
  }
}

async function validateLabel(input = {}) {
  try {
    await requireValidationPermission();
    return { ok: true, label: createBarcodeLabel(input) };
  } catch (error) {
    return errorResult(error);
  }
}

module.exports = {
  getCapabilities,
  validateLabel,
};
