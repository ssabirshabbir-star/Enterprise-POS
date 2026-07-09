const { isDeepStrictEqual } = require('node:util');
const { PRINT_DIALOG_MODES } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { validateIdentifier } = require('./model-validation');
const { validatePrintExecutionPlan } = require('./print-execution.service');

function createPrintDialogContract(input = {}) {
  const plan = validatePrintExecutionPlan(input.executionPlan);
  if (input.open !== undefined || input.print !== undefined || input.showDialog !== undefined) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINT_DIALOG,
      'Print dialog contracts must not expose executable print functions.',
      'printDialog'
    );
  }

  return Object.freeze({
    kind: 'barcode_print_dialog_contract',
    schemaVersion: 1,
    immutable: true,
    printDialogId: validateIdentifier(
      input.printDialogId,
      'printDialogId',
      BARCODE_ERROR_CODES.INVALID_PRINT_DIALOG
    ),
    mode: PRINT_DIALOG_MODES.DESIGN_ONLY,
    executionId: plan.executionId,
    jobId: plan.job.jobId,
    printer: plan.printer,
    adapter: plan.adapter,
    labelSummary: Object.freeze({
      pageCount: plan.preview.pageCount,
      itemCount: plan.preview.itemCount,
      totalOutputLabels: plan.job.totalOutputLabels,
      layout: plan.printer.layout,
    }),
    dialogCreationEnabled: false,
    printExecutionEnabled: false,
    electronDialog: false,
    rendererDispatch: false,
    filesystemOutput: false,
    osPrint: false,
    executable: false,
    capabilities: Object.freeze({
      inspectPlainData: true,
      createDialog: false,
      dispatchToRenderer: false,
      writeFile: false,
      print: false,
    }),
  });
}

function validatePrintDialogContract(contract, executionPlan = null) {
  if (
    !contract ||
    contract.kind !== 'barcode_print_dialog_contract' ||
    contract.schemaVersion !== 1 ||
    contract.immutable !== true ||
    !Object.isFrozen(contract)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINT_DIALOG,
      'An immutable barcode print dialog contract is required.',
      'printDialog'
    );
  }

  if (
    contract.mode !== PRINT_DIALOG_MODES.DESIGN_ONLY ||
    contract.dialogCreationEnabled ||
    contract.printExecutionEnabled ||
    contract.electronDialog ||
    contract.rendererDispatch ||
    contract.filesystemOutput ||
    contract.osPrint ||
    contract.executable ||
    contract.capabilities?.createDialog ||
    contract.capabilities?.dispatchToRenderer ||
    contract.capabilities?.writeFile ||
    contract.capabilities?.print
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINT_DIALOG,
      'Barcode print dialog contract exposes a forbidden execution surface.',
      'printDialog'
    );
  }

  if (!executionPlan) return contract;

  const rebuilt = createPrintDialogContract({
    printDialogId: contract.printDialogId,
    executionPlan,
  });
  if (!isDeepStrictEqual(contract, rebuilt)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINT_DIALOG,
      'Barcode print dialog contract failed deterministic validation.',
      'printDialog'
    );
  }
  return contract;
}

module.exports = {
  createPrintDialogContract,
  validatePrintDialogContract,
};
