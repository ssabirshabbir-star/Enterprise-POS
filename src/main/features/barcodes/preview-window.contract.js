const { isDeepStrictEqual } = require('node:util');
const { PREVIEW_WINDOW_MODES } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { validateIdentifier } = require('./model-validation');
const { validatePrintExecutionPlan } = require('./print-execution.service');

function createPreviewWindowContract(input = {}) {
  const plan = validatePrintExecutionPlan(input.executionPlan);
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
    executionId: plan.executionId,
    jobId: plan.job.jobId,
    previewDocument: plan.preview,
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

module.exports = {
  createPreviewWindowContract,
  validatePreviewWindowContract,
};
