const {
  validateBarcodeValue,
  validateCopies,
  validateLabelSize,
  validateMargins,
  validateOrientation,
  validatePrinter,
  validateProductMetadata,
} = require('./barcode.validation');

function createBarcodeLabel(input = {}) {
  const printer = validatePrinter(input.printer);
  const labelSize = validateLabelSize(input.labelSize, printer.type);
  const orientation = validateOrientation(input.orientation);
  const margins = validateMargins(input.margins, labelSize);
  const product = validateProductMetadata(input.product);
  const format = String(input.format || '')
    .trim()
    .toUpperCase();
  const value = validateBarcodeValue(format, input.value);

  return Object.freeze({
    kind: 'barcode_label',
    schemaVersion: 1,
    immutable: true,
    labelSize: Object.freeze({
      id: labelSize.id,
      widthMm: labelSize.widthMm,
      heightMm: labelSize.heightMm,
    }),
    printer: Object.freeze(printer),
    copies: validateCopies(input.copies),
    margins: Object.freeze(margins),
    orientation,
    barcode: Object.freeze({
      format,
      value,
      humanReadable: input.humanReadable !== false,
    }),
    priceDisplay: input.priceDisplay === true,
    product: Object.freeze(product),
  });
}

module.exports = {
  createBarcodeLabel,
};
