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
