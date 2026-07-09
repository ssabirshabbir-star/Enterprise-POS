const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');

function validateIdentifier(value, field, errorCode = BARCODE_ERROR_CODES.INVALID_REQUEST) {
  const identifier = String(value || '').trim();
  if (!identifier || identifier.length > 120 || /[\u0000-\u001F\u007F-\u009F]/.test(identifier)) {
    throw new BarcodeDomainError(errorCode, `${field} is invalid.`, field);
  }
  return identifier;
}

function validateOptionalText(
  value,
  field,
  maxLength,
  errorCode = BARCODE_ERROR_CODES.INVALID_REQUEST
) {
  if (value === undefined || value === null || value === '') return null;
  const result = String(value).trim();
  if (!result || result.length > maxLength || /[\u0000-\u001F\u007F-\u009F]/.test(result)) {
    throw new BarcodeDomainError(errorCode, `${field} is invalid.`, field);
  }
  return result;
}

module.exports = {
  validateIdentifier,
  validateOptionalText,
};
