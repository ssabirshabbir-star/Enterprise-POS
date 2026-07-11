const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { barcodes, lifecycle, printJob, product, renderDocument } = require('./fixtures');

describe('barcode contracts', () => {
  it('encodes supported formats deterministically', () => {
    const values = [
      ['CODE128', 'ABC-123'],
      ['EAN13', '4006381333931'],
      ['UPCA', '036000291452'],
      ['QRCODE', 'safe payload'],
    ];
    for (const [format, value] of values) {
      const encoded = barcodes.encodeBarcode({ format, value });
      assert(Object.isFrozen(encoded));
      assert.deepEqual(encoded, barcodes.encodeBarcode({ format, value }));
    }
  });

  it('rejects invalid format values and unsafe label inputs', () => {
    assert.throws(() => barcodes.encodeBarcode({ format: 'EAN13', value: '4006381333932' }));
    assert.throws(() => barcodes.encodeBarcode({ format: 'UPCA', value: '036000291453' }));
    assert.throws(() => barcodes.encodeBarcode({ format: 'CODE128', value: 'bad\nvalue' }));
    assert.throws(() =>
      renderDocument({
        copies: barcodes.PRINT_JOB_LIMITS.MAX_COPIES_PER_LABEL + 1,
      })
    );
    assert.throws(() =>
      barcodes.createLabelRenderDocument({
        printer: { type: 'thermal', name: 'T' },
        labelSize: 'label_40x20',
        margins: { left: 11 },
        format: 'CODE128',
        value: 'ABC',
        humanReadable: false,
        product: {
          id: 1,
          name: 'Product',
          barcode: 'ABC',
          salePrice: 1,
          currency: 'PKR',
        },
      })
    );
  });

  it('builds immutable render, job, and layout contracts', () => {
    const document = renderDocument({ copies: 3 });
    const job = printJob({ documents: [document] });
    const layout = barcodes.createLabelLayout(job);

    assert(Object.isFrozen(document.barcode.encoded));
    assert(Object.isFrozen(job.items));
    assert(Object.isFrozen(layout.pages));
    assert.equal(job.totalOutputLabels, 3);
    assert.equal(layout.placementCount, 3);
  });

  it('supports thermal, standard, and A4 printer targets', () => {
    const targets = [
      ['thermal', 'thermal_label', 203, 'thermal_label_executor'],
      ['standard', 'standard_label', 300, 'standard_label_executor'],
      ['a4_sheet', 'a4_sheet', 300, 'a4_sheet_executor'],
    ];
    for (const [printerType, kind, dpi, executorType] of targets) {
      const name = `Printer ${kind}`;
      const document = renderDocument({
        printerType,
        printerName: name,
        labelSize: 'label_50x25',
      });
      const job = printJob({
        jobId: `job-${kind}`,
        documents: [document],
        printer: { kind, name, dpi },
      });
      const layout = barcodes.createLabelLayout(job);
      const contract = barcodes.createPrinterExecutorContract(job.printer);
      const adapter = barcodes.resolvePrinterAdapterContract(
        Object.freeze({
          kind: 'barcode_execution_plan',
          schemaVersion: 1,
          immutable: true,
          executor: contract,
        })
      );
      assert.equal(layout.placementCount, 1);
      assert.equal(contract.executorType, executorType);
      assert.equal(contract.osExecutionAvailable, false);
      assert.equal(contract.execute, undefined);
      assert.equal(adapter.executorType, executorType);
      assert.equal(adapter.executionEnabled, false);
      assert.equal(adapter.osExecutionAvailable, false);
      assert.equal(adapter.filesystemOutput, false);
      assert.equal(adapter.rendererDispatch, false);
      assert.equal(adapter.execute, undefined);
    }
  });

  it('rejects printer mismatches and oversized output', () => {
    assert.throws(() =>
      printJob({
        documents: [
          renderDocument({
            printerType: 'standard',
            printerName: 'Thermal Test',
          }),
        ],
      })
    );
    assert.throws(() =>
      printJob({
        documents: Array.from({ length: 6 }, (_, index) =>
          renderDocument({
            authoritativeProduct: product(index + 1),
            copies: 100,
          })
        ),
      })
    );
  });

  it('enforces lifecycle integrity and unique adjacent event ids', () => {
    const requested = lifecycle({
      eventId: 'event-requested',
      state: barcodes.PRINT_LIFECYCLE_STATES.REQUESTED,
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
    assert.throws(() =>
      barcodes.transitionPrintLifecycle(requested, {
        eventId: requested.eventId,
        state: barcodes.PRINT_LIFECYCLE_STATES.PREPARED,
        occurredAt: '2026-01-01T00:00:01.000Z',
      })
    );
    assert.throws(() =>
      barcodes.transitionPrintLifecycle(requested, {
        eventId: 'event-ready',
        state: barcodes.PRINT_LIFECYCLE_STATES.READY,
        occurredAt: '2026-01-01T00:00:01.000Z',
      })
    );
  });

  it('prepares immutable execution and preview contracts', () => {
    const job = printJob();
    const requested = lifecycle({
      eventId: 'event-requested',
      state: barcodes.PRINT_LIFECYCLE_STATES.REQUESTED,
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
    const prepared = barcodes.transitionPrintLifecycle(requested, {
      eventId: 'event-prepared',
      state: barcodes.PRINT_LIFECYCLE_STATES.PREPARED,
      occurredAt: '2026-01-01T00:00:01.000Z',
    });
    const plan = barcodes.preparePrintExecution({
      executionId: 'execution-1',
      job,
      previousLifecycle: requested,
      lifecycle: prepared,
    });

    assert(Object.isFrozen(plan));
    assert(Object.isFrozen(plan.preview.pages));
    assert(Object.isFrozen(plan.adapter));
    assert.equal(plan.preview.representation, 'plain_data');
    assert.equal(plan.preview.executable, false);
    assert.equal(plan.adapter.mode, barcodes.PRINTER_ADAPTER_MODES.CONTRACT_ONLY);
    assert.equal(plan.adapter.publicSurface, false);
    assert.equal(plan.adapter.executionEnabled, false);
    assert.equal(plan.executionCapabilities.osPrint, false);
  });

  it('creates immutable resolved preview layout for renderer and print parity', () => {
    const job = printJob();
    const preview = barcodes.createPreviewDocument(job, barcodes.createLabelLayout(job));
    const layout = barcodes.createResolvedPreviewLayout(preview, {
      columns: 3,
      gap: 5,
      labelWidth: 64,
      labelHeight: 34,
      printMargin: 8,
      barcodeHeight: 9,
      showTitle: true,
      showSku: true,
      showPrice: true,
      showBarcodeDigits: true,
      showPacking: true,
      showExpiry: true,
      labelTitle: 'Shelf',
      packingDate: '2026-06-09',
      expiryDate: '2026-06-30',
    });

    assert(Object.isFrozen(layout));
    assert(Object.isFrozen(layout.pages));
    assert.equal(layout.presentation.columns, 3);
    assert.equal(layout.presentation.columnGapMm, 5);
    assert.equal(layout.presentation.rowGapMm, 5);
    assert.equal(layout.presentation.labelWidthMm, 64);
    assert.equal(layout.presentation.labelHeightMm, 34);
    assert.equal(layout.presentation.barcodeHeightMm, 9);
    assert.equal(layout.presentation.marginMm.left, 8);
    assert.equal(layout.itemCount, 1);
    assert.equal(layout.pages[0].items[0].placement.boundsMm.xMm, 8);
    assert.equal(layout.pages[0].items[0].placement.boundsMm.yMm, 8);
    assert.equal(layout.pages[0].items[0].label.product.id, 1);
    assert.equal(barcodes.validateResolvedPreviewLayout(layout), layout);
  });

  it('keeps printer adapter infrastructure contract-only and compatible', () => {
    const job = printJob();
    const requested = lifecycle({
      eventId: 'event-requested',
      state: barcodes.PRINT_LIFECYCLE_STATES.REQUESTED,
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
    const prepared = barcodes.transitionPrintLifecycle(requested, {
      eventId: 'event-prepared',
      state: barcodes.PRINT_LIFECYCLE_STATES.PREPARED,
      occurredAt: '2026-01-01T00:00:01.000Z',
    });
    const plan = barcodes.preparePrintExecution({
      executionId: 'execution-1',
      job,
      previousLifecycle: requested,
      lifecycle: prepared,
    });
    const registry = barcodes.createDefaultPrinterAdapterRegistry();
    const adapter = barcodes.resolvePrinterAdapterContract(plan, registry);

    assert(Object.isFrozen(registry));
    assert(Object.isFrozen(adapter));
    assert.deepEqual(adapter, plan.adapter);
    assert.equal(adapter.inputContract, 'barcode_execution_plan_v1');
    assert.equal(adapter.resultContract, 'external_printer_adapter_result_v1');
    assert.throws(() =>
      barcodes.createPrinterAdapterContract({
        adapterId: 'unsafe-adapter',
        executorType: plan.executor.executorType,
        execute() {},
      })
    );
    assert.throws(() => barcodes.validatePrinterAdapterContract(registry[1], plan));
  });

  it('keeps preview window and print dialog contracts design-only', () => {
    const job = printJob();
    const requested = lifecycle({
      eventId: 'event-requested',
      state: barcodes.PRINT_LIFECYCLE_STATES.REQUESTED,
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
    const prepared = barcodes.transitionPrintLifecycle(requested, {
      eventId: 'event-prepared',
      state: barcodes.PRINT_LIFECYCLE_STATES.PREPARED,
      occurredAt: '2026-01-01T00:00:01.000Z',
    });
    const plan = barcodes.preparePrintExecution({
      executionId: 'execution-1',
      job,
      previousLifecycle: requested,
      lifecycle: prepared,
    });
    const previewWindow = barcodes.createPreviewWindowContract({
      previewWindowId: 'preview-window-1',
      executionPlan: plan,
    });
    const printDialog = barcodes.createPrintDialogContract({
      printDialogId: 'print-dialog-1',
      executionPlan: plan,
    });

    assert(Object.isFrozen(previewWindow));
    assert(Object.isFrozen(printDialog));
    assert.equal(previewWindow.mode, barcodes.PREVIEW_WINDOW_MODES.DESIGN_ONLY);
    assert.equal(printDialog.mode, barcodes.PRINT_DIALOG_MODES.DESIGN_ONLY);
    assert.equal(previewWindow.windowCreationEnabled, false);
    assert.equal(previewWindow.electronPreview, false);
    assert.equal(previewWindow.filesystemOutput, false);
    assert.equal(previewWindow.osPrint, false);
    assert.equal(previewWindow.open, undefined);
    assert.equal(printDialog.dialogCreationEnabled, false);
    assert.equal(printDialog.printExecutionEnabled, false);
    assert.equal(printDialog.electronDialog, false);
    assert.equal(printDialog.filesystemOutput, false);
    assert.equal(printDialog.osPrint, false);
    assert.equal(printDialog.print, undefined);
    assert.equal(printDialog.labelSummary.totalOutputLabels, job.totalOutputLabels);
    assert.equal(
      barcodes.validatePreviewWindowContract(previewWindow, plan).previewWindowId,
      previewWindow.previewWindowId
    );
    assert.equal(
      barcodes.validatePrintDialogContract(printDialog, plan).printDialogId,
      printDialog.printDialogId
    );
    assert.throws(() =>
      barcodes.createPreviewWindowContract({
        previewWindowId: 'unsafe-preview',
        executionPlan: plan,
        open() {},
      })
    );
    assert.throws(() =>
      barcodes.createPrintDialogContract({
        printDialogId: 'unsafe-dialog',
        executionPlan: plan,
        print() {},
      })
    );
  });

  it('manages preview window contracts as internal plain-data state only', () => {
    const job = printJob();
    const requested = lifecycle({
      eventId: 'event-requested',
      state: barcodes.PRINT_LIFECYCLE_STATES.REQUESTED,
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
    const prepared = barcodes.transitionPrintLifecycle(requested, {
      eventId: 'event-prepared',
      state: barcodes.PRINT_LIFECYCLE_STATES.PREPARED,
      occurredAt: '2026-01-01T00:00:01.000Z',
    });
    const plan = barcodes.preparePrintExecution({
      executionId: 'execution-1',
      job,
      previousLifecycle: requested,
      lifecycle: prepared,
    });
    const previewWindow = barcodes.createPreviewWindowContract({
      previewWindowId: 'preview-window-managed',
      executionPlan: plan,
    });
    const timestamps = ['2026-01-01T00:00:02.000Z', '2026-01-01T00:00:03.000Z'];
    const manager = barcodes.createPreviewWindowManager({
      maxWindows: 1,
      now: () => timestamps.shift(),
    });

    const record = manager.register(previewWindow, { source: 'contract-test' });
    assert(Object.isFrozen(manager));
    assert(Object.isFrozen(record));
    assert(Object.isFrozen(record.contract));
    assert(Object.isFrozen(record.metadata));
    assert.equal(record.state, barcodes.PREVIEW_WINDOW_MANAGER_STATES.REGISTERED);
    assert.equal(record.executable, false);
    assert.equal(record.electronPreview, false);
    assert.equal(record.rendererDispatch, false);
    assert.equal(record.filesystemOutput, false);
    assert.equal(record.osPrint, false);
    assert.equal(record.contract.open, undefined);
    assert.equal(record.contract.createWindow, undefined);
    assert.equal(record.contract.webContents, undefined);
    assert.equal(manager.get('preview-window-managed').previewWindowId, record.previewWindowId);
    assert.equal(manager.list().length, 1);

    assert.throws(() => manager.register(previewWindow));
    assert.throws(() =>
      manager.register({
        ...previewWindow,
        previewWindowId: 'unsafe-managed-preview',
        open() {},
      })
    );

    const closed = manager.close('preview-window-managed', 'visual review complete');
    assert.equal(closed.state, barcodes.PREVIEW_WINDOW_MANAGER_STATES.CLOSED);
    assert.equal(closed.closeReason, 'visual review complete');
    assert.equal(manager.list().length, 0);
    assert.equal(manager.list({ includeClosed: true }).length, 1);

    const cleanup = manager.cleanupClosed();
    assert(Object.isFrozen(cleanup));
    assert.equal(cleanup.removedCount, 1);
    assert.equal(cleanup.remainingCount, 0);
    assert.equal(manager.get('preview-window-managed'), null);
  });

  it('creates deterministic immutable preview sessions from certified plain data only', () => {
    const job = printJob();
    const requested = lifecycle({
      eventId: 'event-requested',
      state: barcodes.PRINT_LIFECYCLE_STATES.REQUESTED,
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
    const prepared = barcodes.transitionPrintLifecycle(requested, {
      eventId: 'event-prepared',
      state: barcodes.PRINT_LIFECYCLE_STATES.PREPARED,
      occurredAt: '2026-01-01T00:00:01.000Z',
    });
    const plan = barcodes.preparePrintExecution({
      executionId: 'execution-1',
      job,
      previousLifecycle: requested,
      lifecycle: prepared,
    });
    const request = Object.freeze({
      kind: 'barcode_print_request_context',
      schemaVersion: 1,
      immutable: true,
      user: Object.freeze({ id: 7 }),
      job,
      lifecycle: requested,
      authoritativeProducts: Object.freeze([product()]),
    });
    const preview = barcodes.createPreviewDocument(job, barcodes.createLabelLayout(job));
    const previewWindow = barcodes.createPreviewWindowContract({
      previewWindowId: 'preview-session-window',
      requestContext: request,
    });
    const printDialog = barcodes.createPrintDialogContract({
      printDialogId: 'preview-session-dialog',
      requestContext: request,
    });

    const session = barcodes.createPreviewSession({
      sessionId: 'barcode-preview-11111111-1111-4111-8111-111111111111',
      request,
      preview,
      previewWindow,
      printDialog,
    });
    const equivalent = barcodes.createPreviewSession({
      sessionId: 'barcode-preview-11111111-1111-4111-8111-111111111111',
      request,
      preview,
      previewWindow,
      printDialog,
    });

    assert(Object.isFrozen(session));
    assert(Object.isFrozen(session.request));
    assert(Object.isFrozen(session.request.authoritativeProducts[0]));
    assert(Object.isFrozen(session.preview.pages));
    assert.deepEqual(session, equivalent);
    assert.equal(barcodes.validatePreviewSession(session).sessionId, session.sessionId);
    assert.equal(session.executable, false);
    assert.equal(session.electronPreview, false);
    assert.equal(session.rendererDispatch, false);
    assert.equal(session.filesystemOutput, false);
    assert.equal(session.osPrint, false);
    assert.equal(session.preview.executable, false);
    assert.equal(session.previewWindow.windowCreationEnabled, false);
    assert.equal(session.previewWindow.capabilities.createElectronWindow, false);
    assert.equal(session.previewWindow.capabilities.writeFile, false);
    assert.equal(session.previewWindow.capabilities.print, false);
    assert.equal(session.printDialog.dialogCreationEnabled, false);
    assert.equal(session.printDialog.printExecutionEnabled, false);
    assert.equal(session.printDialog.filesystemOutput, false);
    assert.equal(session.printDialog.osPrint, false);
    assert.equal(session.printDialog.print, undefined);

    assert.throws(() =>
      barcodes.createPreviewSession({
        sessionId: 'barcode-preview-11111111-1111-4111-8111-111111111111',
        request,
        preview,
        previewWindow: { ...previewWindow, windowCreationEnabled: true },
        printDialog,
      })
    );
    assert.throws(() =>
      barcodes.createPreviewSession({
        sessionId: 'barcode-preview-11111111-1111-4111-8111-111111111111',
        request,
        preview,
        previewWindow,
        printDialog: { ...printDialog, printExecutionEnabled: true },
      })
    );
    assert.throws(() =>
      barcodes.createPreviewSession({
        sessionId: 'barcode-preview-11111111-1111-4111-8111-111111111111',
        request: { ...request, callback() {} },
        preview,
        previewWindow,
        printDialog,
      })
    );
    assert.throws(() =>
      barcodes.createPreviewSession({
        sessionId: 'barcode-preview-11111111-1111-4111-8111-111111111111',
        request,
        preview,
        previewWindow,
        printDialog,
        browserWindow: Object.create({ webContents: {} }),
      })
    );
    assert.throws(() => barcodes.validatePreviewSession({ ...session, executable: true }));
    assert.throws(() =>
      barcodes.createPreviewSession({
        sessionId: `${job.jobId}:${requested.eventId}`,
        request,
        preview,
        previewWindow,
        printDialog,
      })
    );
    assert.equal(plan.executionCapabilities.osPrint, false);
  });

  it('validates complete adapter results and rejects partial or unknown responses', () => {
    const job = printJob();
    const requested = lifecycle({
      eventId: 'event-requested',
      state: barcodes.PRINT_LIFECYCLE_STATES.REQUESTED,
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
    const prepared = barcodes.transitionPrintLifecycle(requested, {
      eventId: 'event-prepared',
      state: barcodes.PRINT_LIFECYCLE_STATES.PREPARED,
      occurredAt: '2026-01-01T00:00:01.000Z',
    });
    const plan = barcodes.preparePrintExecution({
      executionId: 'execution-1',
      job,
      previousLifecycle: requested,
      lifecycle: prepared,
    });
    const valid = {
      resultId: 'result-1',
      executionId: plan.executionId,
      jobId: job.jobId,
      executorType: plan.executor.executorType,
      status: barcodes.ADAPTER_RESULT_STATUSES.PRINTED,
      totalLabels: job.totalOutputLabels,
      printedLabels: job.totalOutputLabels,
      failedLabels: 0,
      completedAt: '2026-01-01T00:00:03.000Z',
    };

    assert(Object.isFrozen(barcodes.createAdapterResult(valid, plan)));
    assert.throws(() =>
      barcodes.createAdapterResult({ ...valid, printedLabels: 0, failedLabels: 1 }, plan)
    );
    assert.throws(() => barcodes.createAdapterResult({ ...valid, unknown: true }, plan));
    assert.throws(() => barcodes.createAdapterResult({ ...valid, jobId: 'other-job' }, plan));
  });
});
