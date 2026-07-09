const {
  BARCODE_FORMATS,
  LABEL_SIZES,
  ORIENTATIONS,
  PRINTER_TYPES,
} = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');

function text(value) {
  return String(value ?? '').trim();
}

function hasUnsafeControlCharacters(value) {
  return /[\u0000-\u001F\u007F-\u009F]/.test(value);
}

function calculateGtinCheckDigit(body) {
  const sum = body
    .split('')
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

function validateBarcodeValue(format, rawValue) {
  const value = text(rawValue);
  if (!Object.values(BARCODE_FORMATS).includes(format)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_FORMAT,
      'Barcode format is not supported.',
      'format'
    );
  }

  if (format === BARCODE_FORMATS.CODE128) {
    if (!/^[\x20-\x7E]{1,80}$/.test(value)) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_BARCODE,
        'Code128 value must contain 1 to 80 printable ASCII characters.',
        'value'
      );
    }
  }

  if (format === BARCODE_FORMATS.EAN13) {
    if (!/^\d{13}$/.test(value) || calculateGtinCheckDigit(value.slice(0, 12)) !== value[12]) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_BARCODE,
        'EAN-13 value must contain 13 digits with a valid check digit.',
        'value'
      );
    }
  }

  if (format === BARCODE_FORMATS.UPCA) {
    if (!/^\d{12}$/.test(value) || calculateGtinCheckDigit(value.slice(0, 11)) !== value[11]) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_BARCODE,
        'UPC-A value must contain 12 digits with a valid check digit.',
        'value'
      );
    }
  }

  if (format === BARCODE_FORMATS.QRCODE) {
    if (!value || Buffer.byteLength(value, 'utf8') > 512) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_BARCODE,
        'QR Code value must contain between 1 and 512 UTF-8 bytes.',
        'value'
      );
    }
  }

  return value;
}

function validateCopies(value) {
  const copies = Number(value ?? 1);
  if (!Number.isInteger(copies) || copies < 1 || copies > 100) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_COPIES,
      'Copies must be a whole number between 1 and 100.',
      'copies'
    );
  }
  return copies;
}

function validatePrinter(input = {}) {
  const type = text(input.type).toLowerCase();
  const name = text(input.name);
  if (!Object.values(PRINTER_TYPES).includes(type)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINTER,
      'Printer type must be thermal or standard.',
      'printer.type'
    );
  }
  if (name.length > 220 || /[\x00-\x1F]/.test(name)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINTER,
      'Printer name is invalid.',
      'printer.name'
    );
  }
  return { type, name: name || null };
}

function validateLabelSize(sizeId, printerType) {
  const size = Object.values(LABEL_SIZES).find((item) => item.id === text(sizeId));
  if (!size || !size.printerTypes.includes(printerType)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LABEL_SIZE,
      'Label size is not supported by the selected printer type.',
      'labelSize'
    );
  }
  return size;
}

function validateOrientation(value) {
  const orientation = text(value || ORIENTATIONS.PORTRAIT).toLowerCase();
  if (!Object.values(ORIENTATIONS).includes(orientation)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_ORIENTATION,
      'Orientation must be portrait or landscape.',
      'orientation'
    );
  }
  return orientation;
}

function validateMargins(input = {}, size) {
  const margins = {};
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const value = Number(input[side] ?? 0);
    if (!Number.isFinite(value) || value < 0 || value > 10) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_MARGIN,
        `Margin ${side} must be between 0 and 10 millimeters.`,
        `margins.${side}`
      );
    }
    margins[side] = Number(value.toFixed(2));
  }
  if (
    margins.left + margins.right >= size.widthMm ||
    margins.top + margins.bottom >= size.heightMm
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_MARGIN,
      'Margins must leave printable space inside the label.',
      'margins'
    );
  }
  return margins;
}

function validateProductMetadata(input = {}) {
  const id = Number(input.id);
  const name = text(input.name);
  const sku = text(input.sku);
  const barcode = text(input.barcode);
  const salePrice = Number(input.salePrice ?? 0);
  const currency = text(input.currency || 'PKR').toUpperCase();

  if (
    !Number.isInteger(id) ||
    id <= 0 ||
    name.length < 2 ||
    name.length > 220 ||
    hasUnsafeControlCharacters(name)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRODUCT,
      'Product id and name are required.',
      'product'
    );
  }
  if (
    sku.length > 80 ||
    barcode.length > 120 ||
    hasUnsafeControlCharacters(sku) ||
    hasUnsafeControlCharacters(barcode)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRODUCT,
      'Product SKU or barcode exceeds the supported length.',
      'product'
    );
  }
  if (!Number.isFinite(salePrice) || salePrice < 0 || !/^[A-Z]{3}$/.test(currency)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRODUCT,
      'Product price or currency is invalid.',
      'product'
    );
  }
  return {
    id,
    name,
    sku: sku || null,
    barcode: barcode || null,
    salePrice: Number(salePrice.toFixed(2)),
    currency,
  };
}

module.exports = {
  calculateGtinCheckDigit,
  validateBarcodeValue,
  validateCopies,
  validateLabelSize,
  validateMargins,
  validateOrientation,
  validatePrinter,
  validateProductMetadata,
};
