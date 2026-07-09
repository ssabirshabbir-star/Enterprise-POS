const { isDeepStrictEqual } = require('node:util');
const { PRINTER_ADAPTER_MODES, PRINTER_EXECUTOR_TYPES } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { validateIdentifier, validateOptionalText } = require('./model-validation');

const ALLOWED_EXECUTOR_TYPES = Object.freeze(Object.values(PRINTER_EXECUTOR_TYPES));

function createPrinterAdapterContract(input = {}) {
  const adapterId = validateIdentifier(
    input.adapterId,
    'adapter.adapterId',
    BARCODE_ERROR_CODES.INVALID_PRINTER_ADAPTER
  );
  const executorType = String(input.executorType || '').trim();
  if (!ALLOWED_EXECUTOR_TYPES.includes(executorType)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINTER_ADAPTER,
      'Printer adapter executor type is not supported.',
      'adapter.executorType'
    );
  }
  if (input.execute !== undefined || input.print !== undefined) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINTER_ADAPTER,
      'Printer adapter contracts must not expose executable functions.',
      'adapter'
    );
  }

  return Object.freeze({
    kind: 'barcode_printer_adapter_contract',
    schemaVersion: 1,
    immutable: true,
    adapterId,
    displayName: validateOptionalText(
      input.displayName,
      'adapter.displayName',
      120,
      BARCODE_ERROR_CODES.INVALID_PRINTER_ADAPTER
    ),
    executorType,
    mode: PRINTER_ADAPTER_MODES.CONTRACT_ONLY,
    inputContract: 'barcode_execution_plan_v1',
    resultContract: 'external_printer_adapter_result_v1',
    executionEnabled: false,
    publicSurface: false,
    osExecutionAvailable: false,
    filesystemOutput: false,
    rendererDispatch: false,
  });
}

function createDefaultPrinterAdapterRegistry() {
  return Object.freeze([
    createPrinterAdapterContract({
      adapterId: 'thermal-label-contract-adapter',
      displayName: 'Thermal Label Adapter Contract',
      executorType: PRINTER_EXECUTOR_TYPES.THERMAL_LABEL,
    }),
    createPrinterAdapterContract({
      adapterId: 'standard-label-contract-adapter',
      displayName: 'Standard Label Adapter Contract',
      executorType: PRINTER_EXECUTOR_TYPES.STANDARD_LABEL,
    }),
    createPrinterAdapterContract({
      adapterId: 'a4-sheet-contract-adapter',
      displayName: 'A4 Sheet Adapter Contract',
      executorType: PRINTER_EXECUTOR_TYPES.A4_SHEET,
    }),
  ]);
}

function resolvePrinterAdapterContract(
  executionPlan,
  registry = createDefaultPrinterAdapterRegistry()
) {
  const plan = validateExecutionPlanShape(executionPlan);
  const adapters = Array.isArray(registry) ? registry.map(createPrinterAdapterContract) : null;
  if (!adapters) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINTER_ADAPTER,
      'Printer adapter registry must be a list of adapter contracts.',
      'adapterRegistry'
    );
  }

  const adapter = adapters.find((item) => item.executorType === plan.executor.executorType);
  if (!adapter) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINTER_ADAPTER,
      'No compatible printer adapter contract is registered for this execution plan.',
      'adapterRegistry'
    );
  }

  if (
    adapter.executionEnabled ||
    adapter.publicSurface ||
    adapter.osExecutionAvailable ||
    adapter.filesystemOutput ||
    adapter.rendererDispatch
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINTER_ADAPTER,
      'Printer adapter contract exposes a forbidden execution surface.',
      'adapter'
    );
  }

  return adapter;
}

function validatePrinterAdapterContract(adapter, executionPlan) {
  const resolved = resolvePrinterAdapterContract(executionPlan, [adapter]);
  if (!isDeepStrictEqual(adapter, resolved)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINTER_ADAPTER,
      'Printer adapter contract failed deterministic validation.',
      'adapter'
    );
  }
  return resolved;
}

function validateExecutionPlanShape(plan) {
  if (
    !plan ||
    plan.kind !== 'barcode_execution_plan' ||
    plan.schemaVersion !== 1 ||
    plan.immutable !== true ||
    !Object.isFrozen(plan) ||
    !plan.executor ||
    !ALLOWED_EXECUTOR_TYPES.includes(plan.executor.executorType)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PRINTER_ADAPTER,
      'An immutable barcode execution plan with an executor contract is required.',
      'executionPlan'
    );
  }
  return plan;
}

module.exports = {
  createDefaultPrinterAdapterRegistry,
  createPrinterAdapterContract,
  resolvePrinterAdapterContract,
  validatePrinterAdapterContract,
};
