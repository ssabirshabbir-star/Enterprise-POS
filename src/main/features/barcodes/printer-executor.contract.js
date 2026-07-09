const { isDeepStrictEqual } = require('node:util');
const { PRINTER_TARGET_KINDS } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { createPrinterTarget } = require('./printer-target.model');

const EXECUTOR_TYPES = Object.freeze({
  [PRINTER_TARGET_KINDS.THERMAL_LABEL]: 'thermal_label_executor',
  [PRINTER_TARGET_KINDS.STANDARD_LABEL]: 'standard_label_executor',
  [PRINTER_TARGET_KINDS.A4_SHEET]: 'a4_sheet_executor',
});

function createPrinterExecutorContract(printer) {
  const rebuilt = createPrinterTarget(printer);
  if (!isDeepStrictEqual(printer, rebuilt)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_EXECUTION,
      'Printer target failed executor compatibility validation.',
      'printer'
    );
  }
  const executorType = EXECUTOR_TYPES[rebuilt.kind];
  if (!executorType) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_EXECUTION,
      'Printer target has no compatible executor contract.',
      'printer.kind'
    );
  }

  return Object.freeze({
    kind: 'barcode_printer_executor_contract',
    schemaVersion: 1,
    immutable: true,
    executorType,
    printerKind: rebuilt.kind,
    printerType: rebuilt.printerType,
    layout: rebuilt.layout,
    dpi: rebuilt.dpi,
    inputContract: 'barcode_execution_plan_v1',
    resultContract: 'external_printer_adapter_result_v1',
    requiresExternalAdapter: true,
    osExecutionAvailable: false,
  });
}

module.exports = {
  createPrinterExecutorContract,
};
