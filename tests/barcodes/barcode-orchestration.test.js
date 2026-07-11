const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { registerBarcodeRoutes } = require('../../src/main/features/barcodes/barcode.controller');
const {
  buildPreviewPrintHtml,
  createBarcodePreviewPrintAdapter,
} = require('../../src/main/features/barcodes/barcode-preview-print.adapter');
const { createBarcodeService } = require('../../src/main/features/barcodes/barcode.service');
const { barcodes, lifecycle, printJob, product } = require('./fixtures');

function harness({ initialPermissions, authoritativeProduct = product() } = {}) {
  let permissions = initialPermissions || [
    barcodes.BARCODE_PERMISSIONS.REQUEST_PRINT,
    barcodes.BARCODE_PERMISSIONS.EXECUTE_PRINT,
  ];
  let currentProduct = authoritativeProduct;
  const eventIds = new Set();
  const resultIds = new Set();
  const records = [];

  const orchestrator = barcodes.createBarcodeOrchestrator({
    authService: {
      async getProfile() {
        return { ok: true, profile: { id: 7, permissions } };
      },
    },
    productRepository: {
      async findProductById(id) {
        return Number(id) === Number(currentProduct?.id) ? currentProduct : null;
      },
    },
    barcodeRepository: {
      async persistLifecycleAudit(record) {
        const resultId = record.audit.metadata.resultId;
        if (record.lifecycle.previousEventId && !eventIds.has(record.lifecycle.previousEventId)) {
          const error = new Error('missing predecessor');
          error.code = '23503';
          throw error;
        }
        if (eventIds.has(record.lifecycle.eventId) || (resultId && resultIds.has(resultId))) {
          const error = new Error('duplicate');
          error.code = '23505';
          throw error;
        }
        eventIds.add(record.lifecycle.eventId);
        if (resultId) resultIds.add(resultId);
        records.push(record);
        return { id: records.length };
      },
    },
  });

  return {
    orchestrator,
    records,
    setPermissions(next) {
      permissions = next;
    },
    setProduct(next) {
      currentProduct = next;
    },
  };
}

function requested(jobId = 'job-1', eventId = 'event-requested') {
  return lifecycle({
    eventId,
    jobId,
    state: barcodes.PRINT_LIFECYCLE_STATES.REQUESTED,
    occurredAt: '2026-01-01T00:00:00.000Z',
  });
}

describe('barcode backend orchestration', () => {
  it('coordinates request, preparation, readiness, and printed audit records', async () => {
    const test = harness();
    const job = printJob();
    const requestLifecycle = requested();
    const requestContext = await test.orchestrator.requestPrintPreparation({
      job,
      lifecycle: requestLifecycle,
    });
    const prepared = barcodes.transitionPrintLifecycle(requestLifecycle, {
      eventId: 'event-prepared',
      state: barcodes.PRINT_LIFECYCLE_STATES.PREPARED,
      occurredAt: '2026-01-01T00:00:01.000Z',
    });
    const executionContext = await test.orchestrator.prepareExecution({
      requestContext,
      executionId: 'execution-1',
      lifecycle: prepared,
    });
    const ready = barcodes.transitionPrintLifecycle(prepared, {
      eventId: 'event-ready',
      state: barcodes.PRINT_LIFECYCLE_STATES.READY,
      occurredAt: '2026-01-01T00:00:02.000Z',
    });
    const readyContext = await test.orchestrator.markExecutionReady({
      executionContext,
      lifecycle: ready,
    });
    const completed = barcodes.transitionPrintLifecycle(ready, {
      eventId: 'event-completed',
      state: barcodes.PRINT_LIFECYCLE_STATES.COMPLETED,
      occurredAt: '2026-01-01T00:00:04.000Z',
    });
    const outcome = await test.orchestrator.recordAdapterOutcome({
      readyContext,
      lifecycle: completed,
      result: {
        resultId: 'result-1',
        executionId: executionContext.plan.executionId,
        jobId: job.jobId,
        executorType: executionContext.plan.executor.executorType,
        status: barcodes.ADAPTER_RESULT_STATUSES.PRINTED,
        totalLabels: job.totalOutputLabels,
        printedLabels: job.totalOutputLabels,
        failedLabels: 0,
        completedAt: '2026-01-01T00:00:03.000Z',
      },
    });

    assert.equal(outcome.lifecycle.state, barcodes.PRINT_LIFECYCLE_STATES.COMPLETED);
    assert.deepEqual(
      test.records.map((record) => record.audit.eventType),
      [
        barcodes.BARCODE_AUDIT_EVENTS.PRINT_REQUESTED,
        barcodes.BARCODE_AUDIT_EVENTS.PRINT_PREPARED,
        barcodes.BARCODE_AUDIT_EVENTS.PRINT_READY,
        barcodes.BARCODE_AUDIT_EVENTS.PRINTED,
      ]
    );
  });

  it('rejects missing request and execute permissions', async () => {
    const test = harness({ initialPermissions: [] });
    const job = printJob();
    const requestLifecycle = requested();
    await assert.rejects(
      test.orchestrator.requestPrintPreparation({ job, lifecycle: requestLifecycle }),
      (error) => error.code === barcodes.BARCODE_ERROR_CODES.ACCESS_DENIED
    );

    test.setPermissions([barcodes.BARCODE_PERMISSIONS.REQUEST_PRINT]);
    const requestContext = await test.orchestrator.requestPrintPreparation({
      job,
      lifecycle: requestLifecycle,
    });
    const prepared = barcodes.transitionPrintLifecycle(requestLifecycle, {
      eventId: 'event-prepared',
      state: barcodes.PRINT_LIFECYCLE_STATES.PREPARED,
      occurredAt: '2026-01-01T00:00:01.000Z',
    });
    await assert.rejects(
      test.orchestrator.prepareExecution({
        requestContext,
        executionId: 'execution-1',
        lifecycle: prepared,
      }),
      (error) => error.code === barcodes.BARCODE_ERROR_CODES.ACCESS_DENIED
    );
  });

  it('rejects inactive and stale authoritative products', async () => {
    const inactive = harness({ authoritativeProduct: product(1, { isActive: false }) });
    await assert.rejects(
      inactive.orchestrator.requestPrintPreparation({
        job: printJob(),
        lifecycle: requested(),
      }),
      (error) => error.code === barcodes.BARCODE_ERROR_CODES.PRODUCT_NOT_PRINTABLE
    );

    const stale = harness({ authoritativeProduct: product(1, { barcode: 'CHANGED' }) });
    await assert.rejects(
      stale.orchestrator.requestPrintPreparation({
        job: printJob(),
        lifecycle: requested(),
      }),
      (error) => error.code === barcodes.BARCODE_ERROR_CODES.STALE_PRODUCT
    );
  });

  it('rejects globally duplicated lifecycle event ids', async () => {
    const test = harness();
    const job = printJob();
    const requestLifecycle = requested();
    await test.orchestrator.requestPrintPreparation({ job, lifecycle: requestLifecycle });
    await assert.rejects(
      test.orchestrator.requestPrintPreparation({ job, lifecycle: requestLifecycle }),
      (error) => error.code === barcodes.BARCODE_ERROR_CODES.DUPLICATE_LIFECYCLE_EVENT
    );
  });

  it('rejects lifecycle events whose predecessor was never recorded', async () => {
    const test = harness();
    const job = printJob();
    const unrecorded = requested(job.jobId, 'event-unrecorded');
    const cancelled = barcodes.transitionPrintLifecycle(unrecorded, {
      eventId: 'event-cancelled',
      state: barcodes.PRINT_LIFECYCLE_STATES.CANCELLED,
      occurredAt: '2026-01-01T00:00:01.000Z',
    });
    await assert.rejects(
      test.orchestrator.recordTerminalLifecycle({
        job,
        previousLifecycle: unrecorded,
        lifecycle: cancelled,
      }),
      (error) => error.code === barcodes.BARCODE_ERROR_CODES.INVALID_TRANSITION
    );
  });

  it('records cancellation without requiring a now-unavailable product', async () => {
    const test = harness();
    const job = printJob();
    const requestLifecycle = requested();
    await test.orchestrator.requestPrintPreparation({ job, lifecycle: requestLifecycle });
    test.setProduct(null);
    const cancelled = barcodes.transitionPrintLifecycle(requestLifecycle, {
      eventId: 'event-cancelled',
      state: barcodes.PRINT_LIFECYCLE_STATES.CANCELLED,
      occurredAt: '2026-01-01T00:00:01.000Z',
    });
    const result = await test.orchestrator.recordTerminalLifecycle({
      job,
      previousLifecycle: requestLifecycle,
      lifecycle: cancelled,
    });
    assert.equal(result.lifecycle.state, barcodes.PRINT_LIFECYCLE_STATES.CANCELLED);
  });
});

describe('barcode preview request service', () => {
  function serviceHarness({
    permissions,
    authoritativeProduct = product(),
    productSequence,
    previewSessions,
    printAdapter,
    maxPreviewSessions,
    now,
    previewSessionTtlMs,
    userId = 7,
  } = {}) {
    const records = [];
    const sequence = Array.isArray(productSequence) ? [...productSequence] : null;
    let currentUserId = userId;
    return {
      records,
      setUserId(nextUserId) {
        currentUserId = nextUserId;
      },
      service: createBarcodeService({
        authService: {
          async getProfile() {
            return {
              ok: true,
              profile: {
                id: currentUserId,
                permissions: permissions || [barcodes.BARCODE_PERMISSIONS.REQUEST_PRINT],
              },
            };
          },
        },
        productRepository: {
          async findProductById(id) {
            if (sequence?.length) {
              const next = sequence.shift();
              return Number(id) === Number(next?.id) ? next : null;
            }
            return Number(id) === Number(authoritativeProduct?.id) ? authoritativeProduct : null;
          },
        },
        barcodeRepository: {
          async persistLifecycleAudit(record) {
            records.push(record);
            return { id: records.length };
          },
        },
        previewSessions,
        printAdapter,
        maxPreviewSessions,
        now,
        previewSessionTtlMs,
      }),
    };
  }

  function previewPayload(overrides = {}) {
    return {
      jobId: 'barcode-job-preview',
      eventId: 'barcode-event-requested',
      previewWindowId: 'preview-window-request',
      printDialogId: 'print-dialog-request',
      printer: { kind: 'thermal_label', name: 'Thermal Test', dpi: 203 },
      productIds: [1],
      label: {
        labelSize: 'label_80x40',
        copies: 1,
        margins: { top: 1, right: 1, bottom: 1, left: 1 },
        format: 'CODE128',
        humanReadable: true,
        priceDisplay: true,
      },
      presentation: {
        showTitle: true,
        showSku: true,
        showPrice: true,
        showBarcodeDigits: true,
        showPacking: true,
        showExpiry: true,
        labelTitle: 'Shelf Title',
        packingDate: '2026-06-09',
        expiryDate: '2026-06-30',
        titleSize: 12,
        metaSize: 8,
        barcodeHeight: 9,
        printMargin: 6,
      },
      ...overrides,
    };
  }

  it('creates immutable preview and dialog contracts with request permission only', async () => {
    const test = serviceHarness();
    const result = await test.service.requestPreview(previewPayload());

    assert.equal(result.ok, true);
    assert.equal(result.request.lifecycle.state, barcodes.PRINT_LIFECYCLE_STATES.REQUESTED);
    assert.equal(result.preview.kind, 'barcode_preview_document');
    assert.equal(result.preview.executable, false);
    assert.equal(result.previewWindow.mode, barcodes.PREVIEW_WINDOW_MODES.DESIGN_ONLY);
    assert.equal(result.previewWindow.windowCreationEnabled, false);
    assert.equal(result.printDialog.mode, barcodes.PRINT_DIALOG_MODES.DESIGN_ONLY);
    assert.equal(result.printDialog.printExecutionEnabled, false);
    assert.equal(test.records.length, 1);
    assert.equal(test.records[0].audit.eventType, barcodes.BARCODE_AUDIT_EVENTS.PRINT_REQUESTED);
  });

  it('rejects preview requests without request permission', async () => {
    const test = serviceHarness({ permissions: [] });
    const result = await test.service.requestPreview(previewPayload());

    assert.equal(result.ok, false);
    assert.equal(result.error.code, barcodes.BARCODE_ERROR_CODES.ACCESS_DENIED);
  });

  it('rejects stale authoritative products before returning preview data', async () => {
    const test = serviceHarness({
      productSequence: [product(1), product(1, { barcode: 'CHANGED' })],
    });
    const result = await test.service.requestPreview(previewPayload());

    assert.equal(result.ok, false);
    assert.equal(result.error.code, barcodes.BARCODE_ERROR_CODES.STALE_PRODUCT);
  });

  it('prints an existing preview session and cleans it after success', async () => {
    const previewSessions = new Map();
    let printedSession = null;
    const test = serviceHarness({
      permissions: [
        barcodes.BARCODE_PERMISSIONS.REQUEST_PRINT,
        barcodes.BARCODE_PERMISSIONS.EXECUTE_PRINT,
      ],
      previewSessions,
      printAdapter: {
        async printPreviewSession(session, options) {
          printedSession = { session, options };
          barcodes.validatePreviewSession(session);
          return { ok: true, message: 'Barcode labels sent to printer.' };
        },
      },
    });
    const preview = await test.service.requestPreview(previewPayload());

    assert.equal(preview.ok, true);
    assert.equal(previewSessions.size, 1);

    const result = await test.service.printPreview({
      sessionId: preview.previewSession.sessionId,
      printerName: 'Thermal Test',
    });

    assert.equal(result.ok, true);
    assert.equal(printedSession.options.printerName, 'Thermal Test');
    assert.equal(previewSessions.size, 0);
  });

  it('generates preview session ids independently from renderer metadata', async () => {
    const previewSessions = new Map();
    const test = serviceHarness({ previewSessions });
    const first = await test.service.requestPreview(
      previewPayload({ jobId: 'renderer-job', eventId: 'renderer-event' })
    );
    const second = await test.service.requestPreview(
      previewPayload({ jobId: 'renderer-job', eventId: 'renderer-event' })
    );

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.match(first.previewSession.sessionId, /^barcode-preview-[0-9a-f-]+$/);
    assert.match(second.previewSession.sessionId, /^barcode-preview-[0-9a-f-]+$/);
    assert.notEqual(first.previewSession.sessionId, 'renderer-job:renderer-event');
    assert.notEqual(first.previewSession.sessionId, second.previewSession.sessionId);
    assert.equal(previewSessions.size, 1);
    assert(previewSessions.has(second.previewSession.sessionId));
  });

  it('bounds preview sessions with expiry, owner validation, and deterministic eviction', async () => {
    let currentTime = 1000;
    const previewSessions = new Map();
    const test = serviceHarness({
      permissions: [
        barcodes.BARCODE_PERMISSIONS.REQUEST_PRINT,
        barcodes.BARCODE_PERMISSIONS.EXECUTE_PRINT,
      ],
      previewSessions,
      maxPreviewSessions: 2,
      previewSessionTtlMs: 100,
      now: () => currentTime,
      printAdapter: {
        async printPreviewSession() {
          return { ok: true, message: 'printed' };
        },
      },
    });

    const first = await test.service.requestPreview(
      previewPayload({ jobId: 'job-a', eventId: 'event-a' })
    );
    currentTime += 1;
    const second = await test.service.requestPreview(
      previewPayload({ jobId: 'job-b', eventId: 'event-b' })
    );

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(previewSessions.size, 1);
    assert(!previewSessions.has(first.previewSession.sessionId));
    assert(previewSessions.has(second.previewSession.sessionId));

    test.setUserId(8);
    const ownerMismatch = await test.service.printPreview({
      sessionId: second.previewSession.sessionId,
    });
    assert.equal(ownerMismatch.ok, false);
    assert.equal(ownerMismatch.error.code, barcodes.BARCODE_ERROR_CODES.ACCESS_DENIED);

    test.setUserId(7);
    currentTime += 1200;
    const expired = await test.service.printPreview({ sessionId: second.previewSession.sessionId });
    assert.equal(expired.ok, false);
    assert.equal(expired.error.code, barcodes.BARCODE_ERROR_CODES.INVALID_PREVIEW);
    assert.equal(previewSessions.size, 0);

    currentTime = 5000;
    const otherUser = serviceHarness({
      permissions: [
        barcodes.BARCODE_PERMISSIONS.REQUEST_PRINT,
        barcodes.BARCODE_PERMISSIONS.EXECUTE_PRINT,
      ],
      previewSessions,
      userId: 8,
      maxPreviewSessions: 2,
      now: () => currentTime,
    });
    const thirdUser = serviceHarness({
      permissions: [
        barcodes.BARCODE_PERMISSIONS.REQUEST_PRINT,
        barcodes.BARCODE_PERMISSIONS.EXECUTE_PRINT,
      ],
      previewSessions,
      userId: 9,
      maxPreviewSessions: 2,
      now: () => currentTime,
    });
    const a = await test.service.requestPreview(
      previewPayload({ jobId: 'job-c', eventId: 'event-c' })
    );
    currentTime += 1;
    const b = await otherUser.service.requestPreview(
      previewPayload({ jobId: 'job-d', eventId: 'event-d' })
    );
    currentTime += 1;
    const c = await thirdUser.service.requestPreview(
      previewPayload({ jobId: 'job-e', eventId: 'event-e' })
    );

    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(c.ok, true);
    assert.equal(previewSessions.size, 2);
    assert(!previewSessions.has(a.previewSession.sessionId));
    assert(previewSessions.has(b.previewSession.sessionId));
    assert(previewSessions.has(c.previewSession.sessionId));
  });

  it('rejects new previews instead of exceeding capacity when all retained sessions are in flight', async () => {
    let currentTime = 1000;
    const previewSessions = new Map([
      ['active-a', { ownerUserId: 8, createdAt: 1, expiresAt: 5000, inFlight: true, session: {} }],
      ['active-b', { ownerUserId: 9, createdAt: 2, expiresAt: 5000, inFlight: true, session: {} }],
    ]);
    const test = serviceHarness({
      previewSessions,
      maxPreviewSessions: 2,
      now: () => currentTime,
    });

    const rejected = await test.service.requestPreview(previewPayload());

    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, barcodes.BARCODE_ERROR_CODES.INVALID_PREVIEW);
    assert.equal(previewSessions.size, 2);
    assert(previewSessions.has('active-a'));
    assert(previewSessions.has('active-b'));

    currentTime = 6000;
    const afterExpiry = await test.service.requestPreview(previewPayload());

    assert.equal(afterExpiry.ok, true);
    assert.equal(previewSessions.size, 1);
    assert(!previewSessions.has('active-a'));
    assert(!previewSessions.has('active-b'));
  });

  it('rejects malformed stored sessions and same-session concurrent execution safely', async () => {
    const previewSessions = new Map();
    const releasePrint = {};
    const test = serviceHarness({
      permissions: [
        barcodes.BARCODE_PERMISSIONS.REQUEST_PRINT,
        barcodes.BARCODE_PERMISSIONS.EXECUTE_PRINT,
      ],
      previewSessions,
      printAdapter: {
        printPreviewSession() {
          return new Promise((resolve) => {
            releasePrint.resolve = () => resolve({ ok: true, message: 'printed' });
          });
        },
      },
    });
    const preview = await test.service.requestPreview(previewPayload());
    const firstPrint = test.service.printPreview({ sessionId: preview.previewSession.sessionId });
    const duplicate = await test.service.printPreview({
      sessionId: preview.previewSession.sessionId,
    });

    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.busy, true);
    assert.equal(previewSessions.size, 1);

    releasePrint.resolve();
    const printed = await firstPrint;
    assert.equal(printed.ok, true);
    assert.equal(previewSessions.size, 0);

    previewSessions.set('malformed', {
      session: { kind: 'bad' },
      ownerUserId: 7,
      createdAt: 1,
      expiresAt: Date.now() + 10000,
      inFlight: false,
    });
    const malformed = await test.service.printPreview({ sessionId: 'malformed' });
    assert.equal(malformed.ok, false);
    assert.equal(malformed.error.code, barcodes.BARCODE_ERROR_CODES.INVALID_PREVIEW);
    assert.equal(previewSessions.size, 0);
  });

  it('cleans the preview session after cancelled or failed print attempts', async () => {
    const previewSessions = new Map();
    const test = serviceHarness({
      permissions: [
        barcodes.BARCODE_PERMISSIONS.REQUEST_PRINT,
        barcodes.BARCODE_PERMISSIONS.EXECUTE_PRINT,
      ],
      previewSessions,
      printAdapter: {
        async printPreviewSession() {
          return { ok: false, canceled: true, message: 'Barcode printing was cancelled.' };
        },
      },
    });
    const preview = await test.service.requestPreview(previewPayload());
    const result = await test.service.printPreview({ sessionId: preview.previewSession.sessionId });

    assert.equal(result.ok, false);
    assert.equal(result.canceled, true);
    assert.equal(previewSessions.size, 0);
  });

  it('rejects invalid preview sessions and missing execute permission', async () => {
    const noExecute = serviceHarness({
      permissions: [barcodes.BARCODE_PERMISSIONS.REQUEST_PRINT],
    });
    const denied = await noExecute.service.printPreview({ sessionId: 'missing-session' });

    assert.equal(denied.ok, false);
    assert.equal(denied.error.code, barcodes.BARCODE_ERROR_CODES.ACCESS_DENIED);

    const allowed = serviceHarness({
      permissions: [
        barcodes.BARCODE_PERMISSIONS.REQUEST_PRINT,
        barcodes.BARCODE_PERMISSIONS.EXECUTE_PRINT,
      ],
    });
    const invalid = await allowed.service.printPreview({ sessionId: 'missing-session' });

    assert.equal(invalid.ok, false);
    assert.equal(invalid.error.code, barcodes.BARCODE_ERROR_CODES.INVALID_PREVIEW);
  });

  it('registers controller routes for preview request and preview print', async () => {
    const handlers = new Map();
    const ipcMain = {
      handle(route, handler) {
        handlers.set(route, handler);
      },
    };

    registerBarcodeRoutes(ipcMain);

    assert.equal(typeof handlers.get('/barcodes/preview/request'), 'function');
    assert.equal(typeof handlers.get('/barcodes/preview/print'), 'function');
  });
});

describe('barcode preview print adapter', () => {
  function sessionFixture() {
    const job = printJob();
    const request = Object.freeze({
      kind: 'barcode_print_request_context',
      schemaVersion: 1,
      immutable: true,
      requesterUserId: 7,
      userId: 7,
      permissions: Object.freeze([
        barcodes.BARCODE_PERMISSIONS.REQUEST_PRINT,
        barcodes.BARCODE_PERMISSIONS.EXECUTE_PRINT,
      ]),
      job,
      lifecycle: requested(job.jobId),
    });
    const layout = barcodes.createLabelLayout(job);
    const previewPresentation = Object.freeze({
      showTitle: true,
      showSku: true,
      showPrice: true,
      showBarcodeDigits: true,
      showPacking: true,
      showExpiry: true,
      labelTitle: 'Shelf <Title>',
      packingDate: '2026-06-09',
      expiryDate: '2026-06-30',
      columns: 2,
      gap: 4,
      labelWidth: 66,
      labelHeight: 35,
      titleSize: 12,
      metaSize: 8,
      barcodeHeight: 9,
      printMargin: 6,
    });
    const basePreview = Object.freeze({
      ...barcodes.createPreviewDocument(job, layout),
      presentation: previewPresentation,
    });
    const preview = Object.freeze({
      ...basePreview,
      resolvedLayout: barcodes.createResolvedPreviewLayout(basePreview, previewPresentation),
    });
    const previewWindow = barcodes.createPreviewWindowContract({
      previewWindowId: 'preview-window-adapter',
      requestContext: request,
    });
    const printDialog = barcodes.createPrintDialogContract({
      printDialogId: 'print-dialog-adapter',
      requestContext: request,
    });
    return barcodes.createPreviewSession({
      sessionId: 'barcode-preview-11111111-1111-4111-8111-111111111111',
      request,
      preview,
      previewWindow,
      printDialog,
    });
  }

  function adapterHarness({ success = true, failureReason = '', destroyBeforePrint = false } = {}) {
    const windows = [];
    class FakeBrowserWindow {
      constructor(options) {
        this.options = options;
        this.closed = false;
        this.destroyed = false;
        this.webContents = {
          print: (printOptions, callback) => {
            this.printOptions = printOptions;
            callback(success, failureReason);
          },
        };
        windows.push(this);
      }

      async loadURL(url) {
        this.url = url;
        if (destroyBeforePrint) this.destroyed = true;
      }

      isDestroyed() {
        return this.destroyed;
      }

      close() {
        this.closed = true;
      }
    }

    const adapter = createBarcodePreviewPrintAdapter({
      BrowserWindow: FakeBrowserWindow,
      getPrinters: async () => [{ name: 'Thermal Test' }],
    });
    return { adapter, windows };
  }

  it('executes Electron print for a validated preview session and cleans the window', async () => {
    const { adapter, windows } = adapterHarness();
    const result = await adapter.printPreviewSession(sessionFixture(), {
      printerName: 'Thermal Test',
    });

    assert.equal(result.ok, true);
    assert.equal(windows.length, 1);
    assert.equal(windows[0].closed, true);
    assert.equal(windows[0].options.webPreferences.nodeIntegration, false);
    assert.equal(windows[0].options.webPreferences.contextIsolation, true);
    assert.equal(windows[0].options.webPreferences.sandbox, true);
    assert.equal(windows[0].printOptions.silent, false);
    assert.equal(windows[0].printOptions.deviceName, 'Thermal Test');
    assert(windows[0].url.startsWith('data:text/html;charset=utf-8,'));
  });

  it('reports cancelled and failed Electron print callbacks safely', async () => {
    const cancelled = adapterHarness({ success: false, failureReason: 'Print job canceled' });
    const cancelResult = await cancelled.adapter.printPreviewSession(sessionFixture());

    assert.equal(cancelResult.ok, false);
    assert.equal(cancelResult.canceled, true);
    assert.equal(cancelled.windows[0].closed, true);

    const failed = adapterHarness({ success: false, failureReason: 'Printer offline' });
    const failResult = await failed.adapter.printPreviewSession(sessionFixture());

    assert.equal(failResult.ok, false);
    assert.equal(failResult.canceled, false);
    assert.match(failResult.message, /Printer offline/);
    assert.equal(failed.windows[0].closed, true);
  });

  it('serializes print HTML from certified preview pages, placements, and presentation only', () => {
    const session = sessionFixture();
    const html = buildPreviewPrintHtml(session.preview);

    assert.equal(session.preview.resolvedLayout.presentation.columns, 2);
    assert.equal(session.preview.resolvedLayout.presentation.columnGapMm, 4);
    assert.equal(session.preview.resolvedLayout.presentation.labelWidthMm, 66);
    assert.equal(session.preview.resolvedLayout.presentation.labelHeightMm, 35);
    assert(html.includes('width:148mm;height:47mm;'));
    assert(html.includes('left:6mm;top:6mm;width:66mm;height:35mm;'));
    assert(html.includes('--barcode-height:9mm;'));
    assert(html.includes('--label-padding:1.5mm;'));
    assert(html.includes('Shelf &lt;Title&gt;'));
    assert(html.includes('SKU-1'));
    assert(html.includes('BARCODE-1'));
    assert(html.includes('PKR 11.00'));
    assert(html.includes('Pack: 09-Jun-2026'));
    assert(html.includes('Exp: 30-Jun-2026'));
    assert(!html.includes('<script'));
  });

  it('omits disabled presentation fields and escapes executable-looking text', () => {
    const session = sessionFixture();
    const presentation = Object.freeze({
      showTitle: true,
      showSku: false,
      showPrice: false,
      showBarcodeDigits: false,
      showPacking: false,
      showExpiry: true,
      labelTitle: '<img src=x onerror=alert(1)>',
      expiryDate: '2026-12-31',
      columns: 1,
      gap: 2,
      labelWidth: 50,
      labelHeight: 24,
      barcodeHeight: 10,
    });
    const preview = Object.freeze({
      ...session.preview,
      presentation,
      resolvedLayout: barcodes.createResolvedPreviewLayout(session.preview, presentation),
    });
    const html = buildPreviewPrintHtml(preview);

    assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert(!html.includes('<img'));
    assert(!html.includes('SKU-1'));
    assert(!html.includes('BARCODE-1'));
    assert(!html.includes('PKR 11.00'));
    assert(!html.includes('Pack:'));
    assert(html.includes('Exp: 31-Dec-2026'));
    assert(!html.includes('<script'));
    assert(!html.includes('javascript:'));
  });

  it('guards duplicate Electron print callbacks and cleans load failures', async () => {
    const windows = [];
    class DuplicateCallbackWindow {
      constructor() {
        this.closed = false;
        this.webContents = {
          print: (_options, callback) => {
            callback(true, '');
            callback(false, 'Printer offline');
          },
        };
        windows.push(this);
      }

      async loadURL(url) {
        this.url = url;
      }

      isDestroyed() {
        return false;
      }

      close() {
        this.closed = true;
      }
    }
    const adapter = createBarcodePreviewPrintAdapter({
      BrowserWindow: DuplicateCallbackWindow,
      getPrinters: async () => [{ name: 'Thermal Test' }],
    });
    const result = await adapter.printPreviewSession(sessionFixture(), {
      printerName: 'Thermal Test',
    });
    assert.equal(result.ok, true);
    assert.equal(windows[0].closed, true);

    class LoadFailureWindow extends DuplicateCallbackWindow {
      async loadURL() {
        throw new Error('load failed');
      }
    }
    const failing = createBarcodePreviewPrintAdapter({
      BrowserWindow: LoadFailureWindow,
      getPrinters: async () => [{ name: 'Thermal Test' }],
    });
    await assert.rejects(failing.printPreviewSession(sessionFixture()), /load failed/);
    assert.equal(windows[1].closed, true);
  });

  it('rejects invalid printers, invalid sessions, and destroyed print windows', async () => {
    const invalidPrinter = createBarcodePreviewPrintAdapter({
      BrowserWindow: class {},
      getPrinters: async () => [{ name: 'Other Printer' }],
    });
    await assert.rejects(
      invalidPrinter.printPreviewSession(sessionFixture(), { printerName: 'Missing Printer' }),
      (error) => error.code === barcodes.BARCODE_ERROR_CODES.INVALID_PRINTER
    );

    const { adapter } = adapterHarness();
    await assert.rejects(
      adapter.printPreviewSession({ kind: 'bad' }),
      (error) => error.code === barcodes.BARCODE_ERROR_CODES.INVALID_PREVIEW
    );

    const destroyed = adapterHarness({ destroyBeforePrint: true });
    await assert.rejects(
      destroyed.adapter.printPreviewSession(sessionFixture()),
      (error) => error.code === barcodes.BARCODE_ERROR_CODES.INVALID_EXECUTION
    );
    assert.equal(destroyed.windows[0].closed, false);
  });
});
