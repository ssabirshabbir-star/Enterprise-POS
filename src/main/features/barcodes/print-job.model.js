const { isDeepStrictEqual } = require('node:util');
const { PRINT_JOB_LIMITS } = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { createLabelRenderDocument } = require('./label-render.engine');
const { validateIdentifier } = require('./model-validation');
const { createPrinterTarget } = require('./printer-target.model');

function rebuildRenderDocument(document) {
  if (
    !document ||
    document.kind !== 'barcode_label_render_document' ||
    document.schemaVersion !== 1 ||
    document.immutable !== true ||
    !Object.isFrozen(document)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_JOB,
      'Print jobs require immutable barcode label render documents.',
      'documents'
    );
  }

  let rebuilt;
  try {
    rebuilt = createLabelRenderDocument({
      printer: document.printer,
      labelSize: document.page?.labelSizeId,
      copies: document.copies,
      margins: document.page?.margins,
      orientation: document.page?.orientation,
      format: document.barcode?.format,
      value: document.barcode?.value,
      humanReadable: document.barcode?.humanReadable,
      priceDisplay: document.priceDisplay,
      product: document.product,
    });
  } catch {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_JOB,
      'Print job contains an invalid label render document.',
      'documents'
    );
  }

  if (!isDeepStrictEqual(document, rebuilt)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_JOB,
      'Print job label geometry failed deterministic validation.',
      'documents'
    );
  }
  return rebuilt;
}

function createPrintJob(input = {}) {
  const documents = input.documents;
  if (
    !Array.isArray(documents) ||
    documents.length < 1 ||
    documents.length > PRINT_JOB_LIMITS.MAX_LABELS_PER_JOB
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_BATCH,
      `Print jobs require 1 to ${PRINT_JOB_LIMITS.MAX_LABELS_PER_JOB} labels.`,
      'documents'
    );
  }

  const printer = createPrinterTarget(input.printer);
  const rebuilt = documents.map(rebuildRenderDocument);
  const labelSizeId = rebuilt[0].page.labelSizeId;
  let encodedModuleCount = 0;
  let totalOutputLabels = 0;

  const items = rebuilt.map((document, index) => {
    if (
      document.page.labelSizeId !== labelSizeId ||
      document.printer.type !== printer.printerType ||
      document.printer.name !== printer.name
    ) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PRINTER,
        'All labels must use one compatible label size and printer target.',
        `documents.${index}`
      );
    }
    encodedModuleCount +=
      document.barcode.encoded.kind === 'matrix_modules'
        ? document.barcode.encoded.modules.length
        : document.barcode.encoded.runs.length;
    totalOutputLabels += document.copies;
    return Object.freeze({
      itemIndex: index,
      copies: document.copies,
      document,
    });
  });

  if (totalOutputLabels > PRINT_JOB_LIMITS.MAX_TOTAL_OUTPUT_LABELS) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_BATCH,
      `Print job exceeds ${PRINT_JOB_LIMITS.MAX_TOTAL_OUTPUT_LABELS} output labels.`,
      'documents'
    );
  }
  if (encodedModuleCount > PRINT_JOB_LIMITS.MAX_ENCODED_MODULES_PER_JOB) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_BATCH,
      `Print job exceeds ${PRINT_JOB_LIMITS.MAX_ENCODED_MODULES_PER_JOB} encoded modules.`,
      'documents'
    );
  }

  return Object.freeze({
    kind: 'barcode_print_job',
    schemaVersion: 1,
    immutable: true,
    jobId: validateIdentifier(input.jobId, 'jobId', BARCODE_ERROR_CODES.INVALID_JOB),
    printer,
    labelSizeId,
    distinctLabelCount: items.length,
    encodedModuleCount,
    totalOutputLabels,
    items: Object.freeze(items),
  });
}

function validatePrintJobModel(job) {
  if (
    !job ||
    job.kind !== 'barcode_print_job' ||
    job.schemaVersion !== 1 ||
    job.immutable !== true ||
    !Object.isFrozen(job)
  ) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_JOB,
      'An immutable barcode print job is required.',
      'job'
    );
  }

  let rebuilt;
  try {
    rebuilt = createPrintJob({
      jobId: job.jobId,
      printer: job.printer,
      documents: job.items?.map((item) => item.document),
    });
  } catch {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_JOB,
      'Barcode print job failed validation.',
      'job'
    );
  }
  if (!isDeepStrictEqual(job, rebuilt)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_JOB,
      'Barcode print job failed deterministic validation.',
      'job'
    );
  }
  return rebuilt;
}

module.exports = {
  createPrintJob,
  validatePrintJobModel,
};
