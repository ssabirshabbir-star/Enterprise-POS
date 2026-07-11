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
const { createResolvedPreviewLayout } = require('./preview-layout.model');
const { createPreviewSession, validatePreviewSession } = require('./preview-session.model');
const { createPreviewWindowContract } = require('./preview-window.contract');
const { createBarcodePreviewPrintAdapter } = require('./barcode-preview-print.adapter');
const { createPrintDialogContract } = require('./print-dialog.contract');
const { createPrintJob } = require('./print-job.model');
const { createPrintLifecycleEvent } = require('./print-lifecycle.model');
const { createPrinterTarget } = require('./printer-target.model');

const PREVIEW_SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_PREVIEW_SESSIONS = 25;

function createBarcodeService(dependencies = {}) {
  const auth = dependencies.authService || authService;
  const products = dependencies.productRepository || productRepository;
  const previewSessions = dependencies.previewSessions || new Map();
  const previewSessionTtlMs = Number.isFinite(dependencies.previewSessionTtlMs)
    ? Math.max(1000, Math.trunc(dependencies.previewSessionTtlMs))
    : PREVIEW_SESSION_TTL_MS;
  const maxPreviewSessions = Number.isFinite(dependencies.maxPreviewSessions)
    ? Math.max(1, Math.trunc(dependencies.maxPreviewSessions))
    : MAX_PREVIEW_SESSIONS;
  const now = typeof dependencies.now === 'function' ? dependencies.now : () => Date.now();
  const printAdapter =
    dependencies.printAdapter || createBarcodePreviewPrintAdapter(dependencies.printAdapterOptions);
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
      const preview = attachPreviewPresentation(
        createPreviewDocument(requestContext.job, layout),
        input.presentation || input.label?.presentation
      );
      const previewWindow = createPreviewWindowContract({
        previewWindowId: input.previewWindowId || `preview-${randomUUID()}`,
        requestContext,
      });
      const printDialog = createPrintDialogContract({
        printDialogId: input.printDialogId || `dialog-${randomUUID()}`,
        requestContext,
      });
      const previewSession = createPreviewSession({
        sessionId: `barcode-preview-${randomUUID()}`,
        request: requestContext,
        preview,
        previewWindow,
        printDialog,
      });
      storePreviewSession(previewSession);
      return {
        ok: true,
        request: requestContext,
        preview,
        previewWindow,
        printDialog,
        previewSession: {
          kind: previewSession.kind,
          sessionId: previewSession.sessionId,
          jobId: previewSession.jobId,
          requestId: previewSession.requestId,
          executable: false,
          filesystemOutput: false,
          osPrint: false,
        },
      };
    } catch (error) {
      return errorResult(error);
    }
  }

  async function printPreview(input = {}) {
    try {
      const user = await requireExecutionPermission(auth);
      const sessionId = String(input.sessionId || '').trim();
      const entry = getPreviewSessionEntry(sessionId, user);
      if (entry.inFlight) {
        return {
          ok: false,
          busy: true,
          message: 'Barcode printing is already in progress for this preview.',
        };
      }
      entry.inFlight = true;
      try {
        const session = entry.session;
        validatePreviewSession(session);
        const result = await printAdapter.printPreviewSession(session, {
          printerName: input.printerName,
        });
        return result;
      } finally {
        entry.inFlight = false;
        previewSessions.delete(sessionId);
      }
    } catch (error) {
      return errorResult(error);
    }
  }

  function cleanupExpiredPreviewSessions(referenceTime = now()) {
    for (const [sessionId, entry] of previewSessions.entries()) {
      if (!entry || Number(entry.expiresAt) <= referenceTime) {
        previewSessions.delete(sessionId);
      }
    }
  }

  function storePreviewSession(session) {
    cleanupExpiredPreviewSessions();
    const validSession = validatePreviewSession(session);
    const createdAt = now();
    const ownerUserId = Number(validSession.request?.requesterUserId);
    if (!Number.isInteger(ownerUserId) || ownerUserId <= 0) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PREVIEW,
        'Barcode preview session owner is invalid.',
        'requesterUserId'
      );
    }
    if (previewSessions.has(validSession.sessionId)) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PREVIEW,
        'Barcode preview session identifier is already active.',
        'sessionId'
      );
    }

    for (const [sessionId, entry] of previewSessions.entries()) {
      if (entry?.ownerUserId === ownerUserId && !entry.inFlight) {
        previewSessions.delete(sessionId);
      }
    }

    ensurePreviewSessionCapacity();
    previewSessions.set(validSession.sessionId, {
      session: validSession,
      ownerUserId,
      createdAt,
      expiresAt: createdAt + previewSessionTtlMs,
      inFlight: false,
    });
  }

  function ensurePreviewSessionCapacity() {
    if (previewSessions.size < maxPreviewSessions) return;
    let oldestSessionId = null;
    let oldestCreatedAt = Infinity;
    for (const [sessionId, entry] of previewSessions.entries()) {
      if (entry?.inFlight) continue;
      if (Number(entry?.createdAt) < oldestCreatedAt) {
        oldestSessionId = sessionId;
        oldestCreatedAt = Number(entry.createdAt);
      }
    }
    if (oldestSessionId) {
      previewSessions.delete(oldestSessionId);
      return;
    }
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.INVALID_PREVIEW,
      'Barcode preview capacity is temporarily full. Try again after current printing finishes.',
      'previewSessions'
    );
  }

  function getPreviewSessionEntry(sessionId, user) {
    cleanupExpiredPreviewSessions();
    const entry = previewSessions.get(sessionId);
    if (!entry) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PREVIEW,
        'Barcode preview expired or is no longer available.',
        'sessionId'
      );
    }
    if (Number(entry.expiresAt) <= now()) {
      previewSessions.delete(sessionId);
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_PREVIEW,
        'Barcode preview expired or is no longer available.',
        'sessionId'
      );
    }
    const currentUserId = Number(user?.id);
    if (
      !Number.isInteger(currentUserId) ||
      currentUserId <= 0 ||
      !Number.isInteger(entry.ownerUserId) ||
      entry.ownerUserId !== currentUserId
    ) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.ACCESS_DENIED,
        'Barcode preview expired or is no longer available.',
        'sessionId'
      );
    }
    return entry;
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
    printPreview,
    requestPreview,
    validateLabel,
  });
}

async function requireExecutionPermission(auth = authService) {
  const profileResult = await auth.getProfile();
  if (!profileResult.ok) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.AUTHENTICATION_REQUIRED,
      'Authentication is required.'
    );
  }
  const permissions = profileResult.profile?.permissions;
  if (!Array.isArray(permissions) || !permissions.includes(BARCODE_PERMISSIONS.EXECUTE_PRINT)) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.ACCESS_DENIED,
      'You do not have permission to print barcode labels.'
    );
  }
  const userId = Number(profileResult.profile?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new BarcodeDomainError(
      BARCODE_ERROR_CODES.AUTHENTICATION_REQUIRED,
      'Authenticated user identity is invalid.'
    );
  }
  return profileResult.profile;
}

function normalizePreviewPresentation(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.freeze({
    showTitle: source.showTitle !== false,
    showSku: source.showSku !== false,
    showPrice: source.showPrice === true,
    showBarcodeDigits: source.showBarcodeDigits !== false,
    showPacking: source.showPacking === true,
    showExpiry: source.showExpiry === true,
    labelTitle: safeText(source.labelTitle, 120),
    packingDate: safeText(source.packingDate, 32),
    expiryDate: safeText(source.expiryDate, 32),
    columns: boundedNumber(source.columns, 3, 1, 5),
    gap: boundedNumber(source.gap, 6, 0, 20),
    labelWidth: boundedNumber(source.labelWidth, 64, 30, 100),
    labelHeight: boundedNumber(source.labelHeight, 34, 18, 60),
    titleSize: boundedNumber(source.titleSize, 11, 8, 20),
    metaSize: boundedNumber(source.metaSize, 9, 7, 16),
    barcodeHeight: boundedNumber(source.barcodeHeight, 8, 6, 30),
    printMargin: boundedNumber(source.printMargin, 8, 0, 20),
  });
}

function attachPreviewPresentation(preview, presentation) {
  const normalizedPresentation = normalizePreviewPresentation(presentation);
  const previewWithPresentation = Object.freeze({
    ...preview,
    presentation: normalizedPresentation,
  });
  return Object.freeze({
    ...previewWithPresentation,
    resolvedLayout: createResolvedPreviewLayout(previewWithPresentation, normalizedPresentation),
  });
}

function safeText(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, maxLength);
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
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
  printPreview: defaultService.printPreview,
  requestPreview: defaultService.requestPreview,
  validateLabel: defaultService.validateLabel,
};
