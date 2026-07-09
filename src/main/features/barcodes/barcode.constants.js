const BARCODE_FORMATS = Object.freeze({
  CODE128: 'CODE128',
  EAN13: 'EAN13',
  UPCA: 'UPCA',
  QRCODE: 'QRCODE',
});

const PRINTER_TYPES = Object.freeze({
  THERMAL: 'thermal',
  STANDARD: 'standard',
});

const ORIENTATIONS = Object.freeze({
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape',
});

const LABEL_SIZES = Object.freeze({
  THERMAL_40X25: Object.freeze({
    id: 'thermal_40x25',
    widthMm: 40,
    heightMm: 25,
    printerTypes: Object.freeze([PRINTER_TYPES.THERMAL]),
  }),
  THERMAL_50X30: Object.freeze({
    id: 'thermal_50x30',
    widthMm: 50,
    heightMm: 30,
    printerTypes: Object.freeze([PRINTER_TYPES.THERMAL]),
  }),
  STANDARD_70X37: Object.freeze({
    id: 'standard_70x37',
    widthMm: 70,
    heightMm: 37,
    printerTypes: Object.freeze([PRINTER_TYPES.STANDARD]),
  }),
});

const BARCODE_PERMISSIONS = Object.freeze({
  VALIDATE_LABEL: 'barcodes.labels.validate',
  REQUEST_PRINT: 'barcodes.print.request',
  EXECUTE_PRINT: 'barcodes.print.execute',
});

const BARCODE_AUDIT_EVENTS = Object.freeze({
  PRINT_REQUESTED: 'barcode.print.requested',
  PRINTED: 'barcode.printed',
  FAILED: 'barcode.print.failed',
});

module.exports = {
  BARCODE_AUDIT_EVENTS,
  BARCODE_FORMATS,
  BARCODE_PERMISSIONS,
  LABEL_SIZES,
  ORIENTATIONS,
  PRINTER_TYPES,
};
