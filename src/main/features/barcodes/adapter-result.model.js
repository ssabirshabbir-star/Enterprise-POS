const { ADAPTER_RESULT_STATUSES } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { validateIdentifier, validateOptionalText } = require('./model-validation');
const { validatePrintExecutionPlan } = require('./print-execution.service');

const ALLOWED_FIELDS = Object.freeze(
  new Set([
    'resultId',
    'executionId',
    'jobId',
    'executorType',
    'status',
    'totalLabels',
    'printedLabels',
    'failedLabels',
    'completedAt',
    'errorCode',
  ])
);

function count(value, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_ADAPTER_RESULT,
      `${field} must be a non-negative whole number.`,
      field
    );
  }
  return number;
}

function createAdapterResult(input = {}, executionPlan) {
  const plan = validatePrintExecutionPlan(executionPlan);
  if (Object.keys(input).some((key) => !ALLOWED_FIELDS.has(key))) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_ADAPTER_RESULT,
      'Printer adapter result contains unknown fields.',
      'result'
    );
  }

  const status = String(input.status || '').trim();
  if (!Object.values(ADAPTER_RESULT_STATUSES).includes(status)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_ADAPTER_RESULT,
      'Printer adapter result status is invalid.',
      'status'
    );
  }

  const totalLabels = count(input.totalLabels, 'totalLabels');
  const printedLabels = count(input.printedLabels, 'printedLabels');
  const failedLabels = count(input.failedLabels, 'failedLabels');
  const errorCode = validateOptionalText(
    input.errorCode,
    'errorCode',
    120,
    BARCODE_ERROR_CODES.INVALID_ADAPTER_RESULT
  );
  const completedAt = String(input.completedAt || '');

  if (
    input.executionId !== plan.executionId ||
    input.jobId !== plan.job.jobId ||
    input.executorType !== plan.executor.executorType ||
    totalLabels !== plan.job.totalOutputLabels ||
    Number.isNaN(Date.parse(completedAt))
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_ADAPTER_RESULT,
      'Printer adapter result does not match the prepared execution.',
      'result'
    );
  }

  const validCounts =
    (status === ADAPTER_RESULT_STATUSES.PRINTED &&
      printedLabels === totalLabels &&
      failedLabels === 0 &&
      !errorCode) ||
    (status === ADAPTER_RESULT_STATUSES.FAILED &&
      printedLabels === 0 &&
      failedLabels === totalLabels &&
      Boolean(errorCode)) ||
    (status === ADAPTER_RESULT_STATUSES.CANCELLED &&
      printedLabels === 0 &&
      failedLabels === 0 &&
      !errorCode);
  if (!validCounts) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_ADAPTER_RESULT,
      'Partial or inconsistent printer adapter results are not accepted.',
      'result'
    );
  }

  return Object.freeze({
    kind: 'barcode_adapter_result',
    schemaVersion: 1,
    immutable: true,
    resultId: validateIdentifier(
      input.resultId,
      'resultId',
      BARCODE_ERROR_CODES.INVALID_ADAPTER_RESULT
    ),
    executionId: plan.executionId,
    jobId: plan.job.jobId,
    executorType: plan.executor.executorType,
    status,
    totalLabels,
    printedLabels,
    failedLabels,
    completedAt,
    errorCode,
  });
}

module.exports = {
  createAdapterResult,
};
