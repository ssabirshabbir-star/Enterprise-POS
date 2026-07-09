const BARCODE_FORMATS = Object.freeze({
  CODE128: 'CODE128',
  EAN13: 'EAN13',
  UPCA: 'UPCA',
  QRCODE: 'QRCODE',
});

const PRINTER_TYPES = Object.freeze({
  THERMAL: 'thermal',
  STANDARD: 'standard',
  A4_SHEET: 'a4_sheet',
});

const PRINTER_TARGET_KINDS = Object.freeze({
  THERMAL_LABEL: 'thermal_label',
  STANDARD_LABEL: 'standard_label',
  A4_SHEET: 'a4_sheet',
});

const ORIENTATIONS = Object.freeze({
  PORTRAIT: 'portrait',
  LANDSCAPE: 'landscape',
});

const PRODUCTION_PRINTER_TYPES = Object.freeze([
  PRINTER_TYPES.THERMAL,
  PRINTER_TYPES.STANDARD,
  PRINTER_TYPES.A4_SHEET,
]);

const LABEL_SIZES = Object.freeze({
  LABEL_40X20: Object.freeze({
    id: 'label_40x20',
    widthMm: 40,
    heightMm: 20,
    printerTypes: PRODUCTION_PRINTER_TYPES,
  }),
  LABEL_50X25: Object.freeze({
    id: 'label_50x25',
    widthMm: 50,
    heightMm: 25,
    printerTypes: PRODUCTION_PRINTER_TYPES,
  }),
  LABEL_60X30: Object.freeze({
    id: 'label_60x30',
    widthMm: 60,
    heightMm: 30,
    printerTypes: PRODUCTION_PRINTER_TYPES,
  }),
  LABEL_80X40: Object.freeze({
    id: 'label_80x40',
    widthMm: 80,
    heightMm: 40,
    printerTypes: PRODUCTION_PRINTER_TYPES,
  }),
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
    printerTypes: Object.freeze([PRINTER_TYPES.STANDARD, PRINTER_TYPES.A4_SHEET]),
  }),
});

const PRINT_JOB_LIMITS = Object.freeze({
  MAX_COPIES_PER_LABEL: 100,
  MAX_ENCODED_MODULES_PER_JOB: 500000,
  MAX_LABELS_PER_JOB: 100,
  MAX_TOTAL_OUTPUT_LABELS: 500,
});

const PRINT_LIFECYCLE_STATES = Object.freeze({
  REQUESTED: 'print_requested',
  PREPARED: 'print_prepared',
  READY: 'print_ready',
  CANCELLED: 'print_cancelled',
  FAILED: 'print_failed',
  COMPLETED: 'print_completed',
});

const ADAPTER_RESULT_STATUSES = Object.freeze({
  PRINTED: 'printed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

const PRINTER_EXECUTOR_TYPES = Object.freeze({
  THERMAL_LABEL: 'thermal_label_executor',
  STANDARD_LABEL: 'standard_label_executor',
  A4_SHEET: 'a4_sheet_executor',
});

const PRINTER_ADAPTER_MODES = Object.freeze({
  CONTRACT_ONLY: 'contract_only',
});

const BARCODE_PERMISSIONS = Object.freeze({
  VALIDATE_LABEL: 'barcodes.labels.validate',
  REQUEST_PRINT: 'barcodes.print.request',
  EXECUTE_PRINT: 'barcodes.print.execute',
});

const BARCODE_AUDIT_EVENTS = Object.freeze({
  PRINT_REQUESTED: 'barcode.print.requested',
  PRINT_PREPARED: 'barcode.print.prepared',
  PRINT_READY: 'barcode.print.ready',
  PRINTED: 'barcode.printed',
  PRINT_CANCELLED: 'barcode.print.cancelled',
  FAILED: 'barcode.print.failed',
});

module.exports = {
  ADAPTER_RESULT_STATUSES,
  BARCODE_AUDIT_EVENTS,
  BARCODE_FORMATS,
  BARCODE_PERMISSIONS,
  LABEL_SIZES,
  ORIENTATIONS,
  PRINTER_ADAPTER_MODES,
  PRINTER_EXECUTOR_TYPES,
  PRINTER_TARGET_KINDS,
  PRINTER_TYPES,
  PRINT_JOB_LIMITS,
  PRINT_LIFECYCLE_STATES,
};
