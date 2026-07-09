const { randomUUID } = require('node:crypto');
const authService = require('../auth/auth.service');
const productRepository = require('../products/product.repository');
const {
  BARCODE_AUDIT_EVENTS,
  BARCODE_FORMATS,
  BARCODE_PERMISSIONS,
  LABEL_SIZES,
  ORIENTATIONS,
  PRINT_LIFECYCLE_STATES,
  PRINTER_TYPES,
} = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError, errorResult } = require('./barcode.error');
const { createBarcodeLabel } = require('./barcode-label.model');
const { createBarcodeOrchestrator } = require('./barcode-orchestrator.service');
const { createLabelLayout } = require('./label-layout.engine');
const { createLabelRenderDocument } = require('./label-render.engine');
const { createPreviewDocument } = require('./preview-document.model');
const { createPreviewWindowContract } = require('./preview-window.contract');
const { createPrintDialogContract } = require('./print-dialog.contract');
const { createPrintJob } = require('./print-job.model');
const { createPrintLifecycleEvent } = require('./print-lifecycle.model');
const { createPrinterTarget } = require('./printer-target.model');

function createBarcodeService(dependencies = {}) {
  const auth = dependencies.authService || authService;
  const products = dependencies.productRepository || productRepository;
  const orchestrator =
    dependencies.orchestrator ||
    createBarcodeOrchestrator({
      authService: auth,
      productRepository: products,
      barcodeRepository: dependencies.barcodeRepository,
    });

  async function requireValidationPermission() {
    const profileResult = await auth.getProfile();
    if (!profileResult.ok) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.AUTHENTICATION_REQUIRED,
        'Authentication is required.'
      );
    }
    const permissions = profileResult.profile?.permissions;
    if (!Array.isArray(permissions) || !permissions.includes(BARCODE_PERMISSIONS.VALIDATE_LABEL)) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.ACCESS_DENIED,
        'You do not have permission to validate barcode labels.'
      );
    }
    return profileResult.profile;
  }

  function capabilitiesModel() {
    return Object.freeze({
      kind: 'barcode_capabilities',
      schemaVersion: 1,
      immutable: true,
      formats: Object.freeze(Object.values(BARCODE_FORMATS)),
      printerTypes: Object.freeze(Object.values(PRINTER_TYPES)),
      orientations: Object.freeze(Object.values(ORIENTATIONS)),
      labelSizes: Object.freeze(
        Object.values(LABEL_SIZES).map((size) =>
          Object.freeze({
            id: size.id,
            widthMm: size.widthMm,
            heightMm: size.heightMm,
            printerTypes: size.printerTypes,
          })
        )
      ),
      auditEvents: Object.freeze(Object.values(BARCODE_AUDIT_EVENTS)),
      operations: Object.freeze({
        validateLabel: true,
        requestPreview: true,
        renderBarcode: false,
        previewLabel: false,
        printLabel: false,
        batchPrint: false,
      }),
      authoritativeProductLookupRequiredForExecution: true,
    });
  }

  async function getCapabilities() {
    try {
      await requireValidationPermission();
      return { ok: true, capabilities: capabilitiesModel() };
    } catch (error) {
      return errorResult(error);
    }
  }

  async function validateLabel(input = {}) {
    try {
      await requireValidationPermission();
      return { ok: true, label: createBarcodeLabel(input) };
    } catch (error) {
      return errorResult(error);
    }
  }

  async function requestPreview(input = {}) {
    try {
      const { job, lifecycle } = await createRequestJob(input);
      const requestContext = await orchestrator.requestPrintPreparation({ job, lifecycle });
      const layout = createLabelLayout(requestContext.job);
      const preview = createPreviewDocument(requestContext.job, layout);
      const previewWindow = createPreviewWindowContract({
        previewWindowId: input.previewWindowId || `preview-${randomUUID()}`,
        requestContext,
      });
      const printDialog = createPrintDialogContract({
        printDialogId: input.printDialogId || `dialog-${randomUUID()}`,
        requestContext,
      });
      return {
        ok: true,
        request: requestContext,
        preview,
        previewWindow,
        printDialog,
      };
    } catch (error) {
      return errorResult(error);
    }
  }

  async function createRequestJob(input = {}) {
    const printer = createPrinterTarget(input.printer || {});
    const items = normalizeItems(input);
    const documents = [];
    for (const item of items) {
      const product = await products.findProductById(item.productId);
      if (!product) {
        throw new BarcodeDomainError(
          BARCODE_ERROR_CODES.PRODUCT_NOT_PRINTABLE,
          'Product is not available for barcode preview.',
          'productId'
        );
      }
      const label = input.label || {};
      const barcodeValue = String(item.value || product.barcode || '').trim();
      documents.push(
        createLabelRenderDocument({
          printer: { type: printer.printerType, name: printer.name },
          labelSize: item.labelSize || label.labelSize || 'label_40x20',
          copies: item.copies ?? label.copies ?? 1,
          margins: item.margins || label.margins || { top: 1, right: 1, bottom: 1, left: 1 },
          orientation: item.orientation || label.orientation || printer.orientation,
          format: item.format || label.format || BARCODE_FORMATS.CODE128,
          value: barcodeValue,
          humanReadable: item.humanReadable ?? label.humanReadable ?? true,
          priceDisplay: item.priceDisplay ?? label.priceDisplay ?? false,
          product: {
            id: product.id,
            name: product.name,
            sku: product.sku,
            barcode: barcodeValue,
            salePrice: product.salePrice,
            currency: input.currency || 'PKR',
          },
        })
      );
    }

    const jobId = input.jobId || `barcode-job-${randomUUID()}`;
    return {
      job: createPrintJob({ jobId, printer, documents }),
      lifecycle: createPrintLifecycleEvent({
        eventId: input.eventId || `barcode-request-${randomUUID()}`,
        jobId,
        state: PRINT_LIFECYCLE_STATES.REQUESTED,
        occurredAt: input.occurredAt,
      }),
    };
  }

  return Object.freeze({
    getCapabilities,
    requestPreview,
    validateLabel,
  });
}

function normalizeItems(input = {}) {
  const rawItems = Array.isArray(input.items)
    ? input.items
    : Array.isArray(input.productIds)
      ? input.productIds.map((productId) => ({ productId }))
      : [];
  if (!rawItems.length) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_REQUEST,
      'At least one product is required for barcode preview.',
      'items'
    );
  }
  return rawItems.map((item, index) => {
    const productId = Number(item.productId ?? item.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PRODUCT,
        'Product id is required for barcode preview.',
        `items.${index}.productId`
      );
    }
    return { ...item, productId };
  });
}

const defaultService = createBarcodeService();

module.exports = {
  createBarcodeService,
  getCapabilities: defaultService.getCapabilities,
  requestPreview: defaultService.requestPreview,
  validateLabel: defaultService.validateLabel,
};
