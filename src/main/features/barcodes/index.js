const constants = require('./barcode.constants');
const errors = require('./barcode.error');
const validation = require('./barcode.validation');
const { createAdapterResult } = require('./adapter-result.model');
const { validateAuthoritativeProducts } = require('./authoritative-product.validation');
const { createBarcodeAuditEvent } = require('./barcode-audit.model');
const { createBarcodeOrchestrator } = require('./barcode-orchestrator.service');
const { createBarcodeLabel } = require('./barcode-label.model');
const { encodeBarcode } = require('./barcode.encoder');
const { createLabelRenderDocument } = require('./label-render.engine');
const { createLabelLayout } = require('./label-layout.engine');
const { createPreviewDocument } = require('./preview-document.model');
const {
  createDefaultPrinterAdapterRegistry,
  createPrinterAdapterContract,
  resolvePrinterAdapterContract,
  validatePrinterAdapterContract,
} = require('./printer-adapter.contract');
const { createPrinterExecutorContract } = require('./printer-executor.contract');
const { preparePrintExecution } = require('./print-execution.service');
const { createPrintLifecycleEvent, transitionPrintLifecycle } = require('./print-lifecycle.model');
const { createPrintJob } = require('./print-job.model');
const { createPrinterTarget } = require('./printer-target.model');

module.exports = {
  ...constants,
  ...errors,
  ...validation,
  createAdapterResult,
  createBarcodeOrchestrator,
  createBarcodeAuditEvent,
  createBarcodeLabel,
  createDefaultPrinterAdapterRegistry,
  createLabelRenderDocument,
  createLabelLayout,
  createPreviewDocument,
  createPrintJob,
  createPrintLifecycleEvent,
  createPrinterAdapterContract,
  createPrinterExecutorContract,
  createPrinterTarget,
  encodeBarcode,
  preparePrintExecution,
  resolvePrinterAdapterContract,
  transitionPrintLifecycle,
  validateAuthoritativeProducts,
  validatePrinterAdapterContract,
};
