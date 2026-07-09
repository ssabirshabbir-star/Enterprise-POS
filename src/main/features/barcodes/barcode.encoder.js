const bwipjs = require('bwip-js');
const { BARCODE_FORMATS } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { validateBarcodeValue } = require('./barcode.validation');

const ENCODER_IDS = Object.freeze({
  [BARCODE_FORMATS.CODE128]: 'code128',
  [BARCODE_FORMATS.EAN13]: 'ean13',
  [BARCODE_FORMATS.UPCA]: 'upca',
  [BARCODE_FORMATS.QRCODE]: 'qrcode',
});

const MAX_LINEAR_RUNS = 2048;
const MAX_MATRIX_MODULES = 40000;

function finiteNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.ENCODING_FAILED,
      'Barcode encoder returned invalid geometry.',
      field
    );
  }
  return number;
}

function freezeNumbers(values, field, maxLength) {
  if (!Array.isArray(values) || values.length === 0 || values.length > maxLength) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.ENCODING_FAILED,
      'Barcode encoder returned unsupported geometry.',
      field
    );
  }
  return Object.freeze(values.map((value) => finiteNumber(value, field)));
}

function normalizeLinear(raw, format, value) {
  const runs = freezeNumbers(raw.sbs, 'encoded.runs', MAX_LINEAR_RUNS);
  const barCount = Math.ceil(runs.length / 2);
  const barHeights = freezeNumbers(raw.bhs, 'encoded.barHeights', MAX_LINEAR_RUNS);
  const barBottoms = freezeNumbers(raw.bbs, 'encoded.barBottoms', MAX_LINEAR_RUNS);

  if (barHeights.length !== barCount || barBottoms.length !== barCount) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.ENCODING_FAILED,
      'Barcode encoder returned inconsistent linear geometry.',
      'encoded'
    );
  }

  return Object.freeze({
    kind: 'linear_modules',
    format,
    value,
    moduleCount: runs.reduce((sum, width) => sum + width, 0),
    runs,
    barHeights,
    barBottoms,
  });
}

function normalizeMatrix(raw, format, value) {
  const width = finiteNumber(raw.pixx ?? raw.width, 'encoded.width');
  const height = finiteNumber(raw.pixy ?? raw.height, 'encoded.height');
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_MATRIX_MODULES
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.ENCODING_FAILED,
      'Barcode encoder returned unsupported matrix dimensions.',
      'encoded'
    );
  }

  const modules = freezeNumbers(raw.pixs, 'encoded.modules', MAX_MATRIX_MODULES);
  if (modules.length !== width * height || modules.some((module) => module !== 0 && module !== 1)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.ENCODING_FAILED,
      'Barcode encoder returned inconsistent matrix geometry.',
      'encoded.modules'
    );
  }

  return Object.freeze({
    kind: 'matrix_modules',
    format,
    value,
    width,
    height,
    modules,
  });
}

function encodeBarcode(input = {}) {
  const format = String(input.format || '')
    .trim()
    .toUpperCase();
  const value = validateBarcodeValue(format, input.value);
  const bcid = ENCODER_IDS[format];

  try {
    const result = bwipjs.raw({
      bcid,
      text: value,
      includetext: false,
      parsefnc: false,
    });
    if (!Array.isArray(result) || result.length !== 1 || !result[0]) {
      throw new Error('Unexpected encoder result.');
    }
    const raw = result[0];
    return format === BARCODE_FORMATS.QRCODE
      ? normalizeMatrix(raw, format, value)
      : normalizeLinear(raw, format, value);
  } catch (error) {
    if (error instanceof BarcodeDomainError) throw error;
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.ENCODING_FAILED,
      'Barcode value could not be encoded.',
      'value'
    );
  }
}

module.exports = {
  encodeBarcode,
};
