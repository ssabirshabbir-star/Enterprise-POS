const { isDeepStrictEqual } = require('node:util');
const { PRINT_DIALOG_MODES } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { createLabelLayout } = require('./label-layout.engine');
const { validateIdentifier } = require('./model-validation');
const { createPreviewDocument } = require('./preview-document.model');
const { resolvePrinterAdapterContract } = require('./printer-adapter.contract');
const { createPrinterExecutorContract } = require('./printer-executor.contract');
const { validatePrintExecutionPlan } = require('./print-execution.service');
const { validatePrintJobModel } = require('./print-job.model');

function createPrintDialogContract(input = {}) {
  const source = resolveDialogSource(input);
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
    executionId: source.executionId,
    requestId: source.requestId,
    jobId: source.job.jobId,
    printer: source.job.printer,
    adapter: source.adapter,
    labelSummary: Object.freeze({
      pageCount: source.preview.pageCount,
      itemCount: source.preview.itemCount,
      totalOutputLabels: source.job.totalOutputLabels,
      layout: source.job.printer.layout,
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

function resolveDialogSource(input = {}) {
  if (input.executionPlan) {
    const plan = validatePrintExecutionPlan(input.executionPlan);
    return {
      executionId: plan.executionId,
      requestId: null,
      job: plan.job,
      preview: plan.preview,
      adapter: plan.adapter,
    };
  }

  if (
    !input.requestContext ||
    input.requestContext.kind !== 'barcode_print_request_context' ||
    input.requestContext.schemaVersion !== 1 ||
    input.requestContext.immutable !== true ||
    !Object.isFrozen(input.requestContext)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINT_DIALOG,
      'Print dialog contracts require an immutable request context or execution plan.',
      'requestContext'
    );
  }

  const job = validatePrintJobModel(input.requestContext.job);
  const layout = createLabelLayout(job);
  const executor = createPrinterExecutorContract(job.printer);
  const adapter = resolvePrinterAdapterContract(
    Object.freeze({
      kind: 'barcode_execution_plan',
      schemaVersion: 1,
      immutable: true,
      executor,
    })
  );
  return {
    executionId: null,
    requestId: input.requestContext.lifecycle?.eventId || null,
    job,
    preview: createPreviewDocument(job, layout),
    adapter,
  };
}

module.exports = {
  createPrintDialogContract,
  validatePrintDialogContract,
};
