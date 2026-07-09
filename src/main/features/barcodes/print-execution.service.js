const { PRINT_LIFECYCLE_STATES } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { createLabelLayout } = require('./label-layout.engine');
const { validateIdentifier } = require('./model-validation');
const { createPreviewDocument } = require('./preview-document.model');
const { createPrinterExecutorContract } = require('./printer-executor.contract');
const { validatePrintJobModel } = require('./print-job.model');
const {
  validatePrintLifecycleEvent,
  validatePrintLifecycleTransition,
} = require('./print-lifecycle.model');

function preparePrintExecution(input = {}) {
  const job = validatePrintJobModel(input.job);
  const previousLifecycle = validatePrintLifecycleEvent(input.previousLifecycle);
  const lifecycle = validatePrintLifecycleEvent(input.lifecycle);
  validatePrintLifecycleTransition(previousLifecycle, lifecycle);
  if (lifecycle.jobId !== job.jobId) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_EXECUTION,
      'Print lifecycle does not belong to the supplied job.',
      'lifecycle.jobId'
    );
  }
  if (lifecycle.state !== PRINT_LIFECYCLE_STATES.PREPARED) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_TRANSITION,
      'Print execution preparation requires a prepared lifecycle state.',
      'lifecycle.state'
    );
  }

  const layout = createLabelLayout(job);
  const preview = createPreviewDocument(job, layout);
  const executor = createPrinterExecutorContract(job.printer);

  return Object.freeze({
    kind: 'barcode_execution_plan',
    schemaVersion: 1,
    immutable: true,
    executionId: validateIdentifier(
      input.executionId,
      'executionId',
      BARCODE_ERROR_CODES.INVALID_EXECUTION
    ),
    state: PRINT_LIFECYCLE_STATES.PREPARED,
    job,
    lifecycleHistory: Object.freeze([previousLifecycle, lifecycle]),
    lifecycle,
    printer: job.printer,
    executor,
    layout,
    preview,
    executionCapabilities: Object.freeze({
      previewDocument: true,
      osPrint: false,
      filesystemOutput: false,
      rendererDispatch: false,
    }),
  });
}

module.exports = {
  preparePrintExecution,
};
