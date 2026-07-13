const IMPORT_ERROR_CODES = Object.freeze({
  EMPTY_FILE: 'ERROR_EMPTY_FILE',
  INVALID_UTF8: 'ERROR_INVALID_UTF8',
  BINARY_CONTENT: 'ERROR_BINARY_CONTENT',
  NUL_BYTE: 'ERROR_NUL_BYTE',
  MALFORMED_CSV: 'ERROR_MALFORMED_CSV',
  UNMATCHED_QUOTE: 'ERROR_UNMATCHED_QUOTE',
  INVALID_HEADER: 'ERROR_INVALID_HEADER',
  MISSING_HEADER: 'ERROR_MISSING_HEADER',
  DUPLICATE_HEADER: 'ERROR_DUPLICATE_HEADER',
  UNKNOWN_HEADER: 'ERROR_UNKNOWN_HEADER',
  COLUMN_COUNT_MISMATCH: 'ERROR_COLUMN_COUNT_MISMATCH',
  TOO_MANY_ROWS: 'ERROR_TOO_MANY_ROWS',
  FILE_TOO_LARGE: 'ERROR_FILE_TOO_LARGE',
  EMPTY_REQUIRED_FIELD: 'ERROR_EMPTY_REQUIRED_FIELD',
  MISSING_IDENTITY: 'ERROR_MISSING_IDENTITY',
  INVALID_SKU: 'ERROR_INVALID_SKU',
  INVALID_BARCODE: 'ERROR_INVALID_BARCODE',
  TEXT_TOO_LONG: 'ERROR_TEXT_TOO_LONG',
  INVALID_NUMBER: 'ERROR_INVALID_NUMBER',
  NEGATIVE_NUMBER: 'ERROR_NEGATIVE_NUMBER',
  TOO_MANY_DECIMALS: 'ERROR_TOO_MANY_DECIMALS',
  NUMBER_OUT_OF_RANGE: 'ERROR_NUMBER_OUT_OF_RANGE',
  SCIENTIFIC_NOTATION: 'ERROR_SCIENTIFIC_NOTATION',
  INVALID_BOOLEAN: 'ERROR_INVALID_BOOLEAN',
  EXPIRY_POLICY_CONFLICT: 'ERROR_EXPIRY_POLICY_CONFLICT',
  DUPLICATE_SKU_IN_FILE: 'ERROR_DUPLICATE_SKU_IN_FILE',
  DUPLICATE_BARCODE_IN_FILE: 'ERROR_DUPLICATE_BARCODE_IN_FILE',
  ZERO_COST_WITH_STOCK: 'ERROR_ZERO_COST_WITH_STOCK',
  IDENTITY_CONFLICT: 'ERROR_IDENTITY_CONFLICT',
  DUPLICATE_IN_DATABASE: 'ERROR_DUPLICATE_IN_DATABASE',
  UNKNOWN_REFERENCE: 'ERROR_UNKNOWN_REFERENCE',
  STOCK_ALREADY_LIVE: 'ERROR_STOCK_ALREADY_LIVE',
  STALE_PREVIEW: 'ERROR_STALE_PREVIEW',
});

const IMPORT_WARNING_CODES = Object.freeze({
  PRODUCT_NAME_WITHOUT_STABLE_ID: 'WARN_PRODUCT_NAME_WITHOUT_STABLE_ID',
});

const USER_MESSAGES = Object.freeze({
  [IMPORT_ERROR_CODES.EMPTY_FILE]: 'The CSV file is empty.',
  [IMPORT_ERROR_CODES.INVALID_UTF8]: 'The CSV file must be valid UTF-8 text.',
  [IMPORT_ERROR_CODES.BINARY_CONTENT]: 'The selected file does not look like a CSV text file.',
  [IMPORT_ERROR_CODES.NUL_BYTE]: 'The CSV file contains unsupported NUL bytes.',
  [IMPORT_ERROR_CODES.MALFORMED_CSV]: 'The CSV file is malformed.',
  [IMPORT_ERROR_CODES.UNMATCHED_QUOTE]: 'A quoted CSV field was not closed.',
  [IMPORT_ERROR_CODES.INVALID_HEADER]:
    'The CSV headers must match the official Inventory import template.',
  [IMPORT_ERROR_CODES.MISSING_HEADER]: 'A required template header is missing.',
  [IMPORT_ERROR_CODES.DUPLICATE_HEADER]: 'A template header appears more than once.',
  [IMPORT_ERROR_CODES.UNKNOWN_HEADER]: 'The CSV contains an unknown header.',
  [IMPORT_ERROR_CODES.COLUMN_COUNT_MISMATCH]:
    'A row has a different number of columns than the header.',
  [IMPORT_ERROR_CODES.TOO_MANY_ROWS]: 'The CSV has more rows than the import limit.',
  [IMPORT_ERROR_CODES.FILE_TOO_LARGE]: 'The CSV file is larger than the import limit.',
  [IMPORT_ERROR_CODES.EMPTY_REQUIRED_FIELD]: 'A required field is empty.',
  [IMPORT_ERROR_CODES.MISSING_IDENTITY]: 'Provide SKU or Barcode for every meaningful row.',
  [IMPORT_ERROR_CODES.INVALID_SKU]:
    'SKU may contain letters, numbers, dot, dash, and underscore only.',
  [IMPORT_ERROR_CODES.INVALID_BARCODE]:
    'Barcode may contain letters, numbers, dot, dash, and underscore only.',
  [IMPORT_ERROR_CODES.TEXT_TOO_LONG]: 'The value exceeds the maximum allowed length.',
  [IMPORT_ERROR_CODES.INVALID_NUMBER]:
    'Use a plain non-negative number without currency symbols or separators.',
  [IMPORT_ERROR_CODES.NEGATIVE_NUMBER]: 'Negative values are not allowed.',
  [IMPORT_ERROR_CODES.TOO_MANY_DECIMALS]: 'The value has too many decimal places.',
  [IMPORT_ERROR_CODES.NUMBER_OUT_OF_RANGE]: 'The value is outside the supported numeric range.',
  [IMPORT_ERROR_CODES.SCIENTIFIC_NOTATION]:
    'Scientific notation is not supported for import values.',
  [IMPORT_ERROR_CODES.INVALID_BOOLEAN]: 'Use true/false, yes/no, or 1/0.',
  [IMPORT_ERROR_CODES.EXPIRY_POLICY_CONFLICT]:
    'Expiry Required can be true only when Track Expiry is true.',
  [IMPORT_ERROR_CODES.DUPLICATE_SKU_IN_FILE]: 'The same SKU appears more than once in this file.',
  [IMPORT_ERROR_CODES.DUPLICATE_BARCODE_IN_FILE]:
    'The same Barcode appears more than once in this file.',
  [IMPORT_ERROR_CODES.ZERO_COST_WITH_STOCK]:
    'Opening stock with a positive quantity requires a cost above zero.',
});

function importError(code, overrides = {}) {
  return {
    code,
    message: USER_MESSAGES[code] || 'Inventory import validation failed.',
    sourceRowNumber: null,
    column: null,
    ...overrides,
  };
}

function importWarning(code, overrides = {}) {
  return {
    code,
    message: USER_MESSAGES[code] || 'Inventory import warning.',
    sourceRowNumber: null,
    column: null,
    ...overrides,
  };
}

module.exports = {
  IMPORT_ERROR_CODES,
  IMPORT_WARNING_CODES,
  importError,
  importWarning,
};
