const { ORIENTATIONS, PRINTER_TARGET_KINDS, PRINTER_TYPES } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { validateOrientation, validatePrinter } = require('./barcode.validation');

const TARGET_DEFINITIONS = Object.freeze({
  [PRINTER_TARGET_KINDS.THERMAL_LABEL]: Object.freeze({
    printerType: PRINTER_TYPES.THERMAL,
    dpi: Object.freeze([203, 300]),
    layout: 'single_label',
  }),
  [PRINTER_TARGET_KINDS.STANDARD_LABEL]: Object.freeze({
    printerType: PRINTER_TYPES.STANDARD,
    dpi: Object.freeze([300, 600]),
    layout: 'single_label',
  }),
  [PRINTER_TARGET_KINDS.A4_SHEET]: Object.freeze({
    printerType: PRINTER_TYPES.A4_SHEET,
    dpi: Object.freeze([300, 600]),
    layout: 'a4_sheet',
  }),
});

function validateDpi(value, allowed) {
  const dpi = Number(value);
  if (!Number.isInteger(dpi) || !allowed.includes(dpi)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_DPI,
      `Printer DPI must be one of: ${allowed.join(', ')}.`,
      'printer.dpi'
    );
  }
  return dpi;
}

function validateSheetMargins(input = {}) {
  const margins = {};
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const value = Number(input[side] ?? 10);
    if (!Number.isFinite(value) || value < 0 || value > 25) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_MARGIN,
        `A4 sheet margin ${side} must be between 0 and 25 millimeters.`,
        `printer.sheetMargins.${side}`
      );
    }
    margins[side] = Number(value.toFixed(2));
  }
  return Object.freeze(margins);
}

function validateGap(value) {
  const gapMm = Number(value ?? 2);
  if (!Number.isFinite(gapMm) || gapMm < 0 || gapMm > 10) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_LAYOUT,
      'Label gap must be between 0 and 10 millimeters.',
      'printer.gapMm'
    );
  }
  return Number(gapMm.toFixed(2));
}

function createPrinterTarget(input = {}) {
  const kind = String(input.kind || '').trim();
  const definition = TARGET_DEFINITIONS[kind];
  if (!definition) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINTER,
      'Printer target kind is not supported.',
      'printer.kind'
    );
  }

  const printer = validatePrinter({ type: definition.printerType, name: input.name });
  if (!printer.name) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINTER,
      'Printer target name is required.',
      'printer.name'
    );
  }

  const orientation = validateOrientation(input.orientation || ORIENTATIONS.PORTRAIT);
  const isSheet = definition.layout === 'a4_sheet';
  return Object.freeze({
    kind,
    schemaVersion: 1,
    immutable: true,
    name: printer.name,
    printerType: definition.printerType,
    layout: definition.layout,
    dpi: validateDpi(input.dpi, definition.dpi),
    orientation,
    sheetMargins: isSheet ? validateSheetMargins(input.sheetMargins) : null,
    gapMm: isSheet ? validateGap(input.gapMm) : 0,
  });
}

module.exports = {
  createPrinterTarget,
};
