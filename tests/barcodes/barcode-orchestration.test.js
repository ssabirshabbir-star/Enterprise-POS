const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
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
