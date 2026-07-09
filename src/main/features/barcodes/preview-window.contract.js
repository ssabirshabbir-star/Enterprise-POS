const { isDeepStrictEqual } = require('node:util');
const { PREVIEW_WINDOW_MODES } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { createLabelLayout } = require('./label-layout.engine');
const { validateIdentifier } = require('./model-validation');
const { createPreviewDocument } = require('./preview-document.model');
const { validatePrintExecutionPlan } = require('./print-execution.service');
const { validatePrintJobModel } = require('./print-job.model');

function createPreviewWindowContract(input = {}) {
  const source = resolvePreviewSource(input);
  if (
    input.open !== undefined ||
    input.createWindow !== undefined ||
    input.webContents !== undefined
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW,
      'Preview window contracts must not expose executable window functions.',
      'previewWindow'
    );
  }

  return Object.freeze({
    kind: 'barcode_preview_window_contract',
    schemaVersion: 1,
    immutable: true,
    previewWindowId: validateIdentifier(
      input.previewWindowId,
      'previewWindowId',
      BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW
    ),
    mode: PREVIEW_WINDOW_MODES.DESIGN_ONLY,
    executionId: source.executionId,
    requestId: source.requestId,
    jobId: source.job.jobId,
    previewDocument: source.preview,
    title: 'Barcode Label Preview',
    windowCreationEnabled: false,
    electronPreview: false,
    rendererDispatch: false,
    filesystemOutput: false,
    osPrint: false,
    executable: false,
    capabilities: Object.freeze({
      inspectPlainData: true,
      createElectronWindow: false,
      dispatchToRenderer: false,
      writeFile: false,
      print: false,
    }),
  });
}

function validatePreviewWindowContract(contract, executionPlan = null) {
  if (
    !contract ||
    contract.kind !== 'barcode_preview_window_contract' ||
    contract.schemaVersion !== 1 ||
    contract.immutable !== true ||
    !Object.isFrozen(contract)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW,
      'An immutable barcode preview window contract is required.',
      'previewWindow'
    );
  }

  if (
    contract.mode !== PREVIEW_WINDOW_MODES.DESIGN_ONLY ||
    contract.windowCreationEnabled ||
    contract.electronPreview ||
    contract.rendererDispatch ||
    contract.filesystemOutput ||
    contract.osPrint ||
    contract.executable ||
    contract.capabilities?.createElectronWindow ||
    contract.capabilities?.dispatchToRenderer ||
    contract.capabilities?.writeFile ||
    contract.capabilities?.print
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW,
      'Barcode preview window contract exposes a forbidden execution surface.',
      'previewWindow'
    );
  }

  if (!executionPlan) return contract;

  const rebuilt = createPreviewWindowContract({
    previewWindowId: contract.previewWindowId,
    executionPlan,
  });
  if (!isDeepStrictEqual(contract, rebuilt)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW,
      'Barcode preview window contract failed deterministic validation.',
      'previewWindow'
    );
  }
  return contract;
}

function resolvePreviewSource(input = {}) {
  if (input.executionPlan) {
    const plan = validatePrintExecutionPlan(input.executionPlan);
    return {
      executionId: plan.executionId,
      requestId: null,
      job: plan.job,
      preview: plan.preview,
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
      BARCODE_ERROR_CODES.INVALID_PREVIEW_WINDOW,
      'Preview window contracts require an immutable request context or execution plan.',
      'requestContext'
    );
  }

  const job = validatePrintJobModel(input.requestContext.job);
  const layout = createLabelLayout(job);
  return {
    executionId: null,
    requestId: input.requestContext.lifecycle?.eventId || null,
    job,
    preview: createPreviewDocument(job, layout),
  };
}

module.exports = {
  createPreviewWindowContract,
  validatePreviewWindowContract,
};
