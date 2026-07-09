const { isDeepStrictEqual } = require('node:util');
const authService = require('../auth/auth.service');
const productRepository = require('../products/product.repository');
const { createAdapterResult } = require('./adapter-result.model');
const { validateAuthoritativeProducts } = require('./authoritative-product.validation');
const { createBarcodeAuditEvent } = require('./barcode-audit.model');
const barcodeRepository = require('./barcode.repository');
const {
  ADAPTER_RESULT_STATUSES,
  BARCODE_AUDIT_EVENTS,
  BARCODE_PERMISSIONS,
  PRINT_LIFECYCLE_STATES,
} = require('./barcode.constants');
const { BARCODE_ERROR_CODES, BarcodeDomainError } = require('./barcode.error');
const { preparePrintExecution, validatePrintExecutionPlan } = require('./print-execution.service');
const { validatePrintJobModel } = require('./print-job.model');
const {
  validatePrintLifecycleEvent,
  validatePrintLifecycleTransition,
} = require('./print-lifecycle.model');

const AUDIT_EVENT_BY_STATE = Object.freeze({
  [PRINT_LIFECYCLE_STATES.REQUESTED]: BARCODE_AUDIT_EVENTS.PRINT_REQUESTED,
  [PRINT_LIFECYCLE_STATES.PREPARED]: BARCODE_AUDIT_EVENTS.PRINT_PREPARED,
  [PRINT_LIFECYCLE_STATES.READY]: BARCODE_AUDIT_EVENTS.PRINT_READY,
  [PRINT_LIFECYCLE_STATES.CANCELLED]: BARCODE_AUDIT_EVENTS.PRINT_CANCELLED,
  [PRINT_LIFECYCLE_STATES.FAILED]: BARCODE_AUDIT_EVENTS.FAILED,
  [PRINT_LIFECYCLE_STATES.COMPLETED]: BARCODE_AUDIT_EVENTS.PRINTED,
});

function createBarcodeOrchestrator(dependencies = {}) {
  const auth = dependencies.authService || authService;
  const products = dependencies.productRepository || productRepository;
  const auditRepository = dependencies.barcodeRepository || barcodeRepository;

  async function requirePermission(permission) {
    const profileResult = await auth.getProfile();
    if (!profileResult?.ok || !profileResult.profile) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.AUTHENTICATION_REQUIRED,
        'Authentication is required.'
      );
    }
    const permissions = profileResult.profile.permissions;
    if (!Array.isArray(permissions) || !permissions.includes(permission)) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.ACCESS_DENIED,
        'Barcode print permission is required.'
      );
    }
    const userId = Number(profileResult.profile.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.AUTHENTICATION_REQUIRED,
        'Authenticated user identity is invalid.'
      );
    }
    return Object.freeze({
      id: userId,
      permissions: Object.freeze([...permissions]),
    });
  }

  async function persistLifecycle({ lifecycle, job, user, metadata = {} }) {
    const productIds = [...new Set(job.items.map((item) => Number(item.document.product.id)))];
    const audit = createBarcodeAuditEvent({
      eventType: AUDIT_EVENT_BY_STATE[lifecycle.state],
      requestId: job.jobId,
      userId: user.id,
      productIds,
      occurredAt: lifecycle.occurredAt,
      errorCode: lifecycle.errorCode,
      metadata: {
        jobId: job.jobId,
        eventId: lifecycle.eventId,
        previousEventId: lifecycle.previousEventId,
        totalOutputLabels: job.totalOutputLabels,
        ...metadata,
      },
    });
    try {
      await auditRepository.persistLifecycleAudit({ lifecycle, audit });
    } catch (error) {
      if (error?.code === '23505') {
        throw new BarcodeDomainError(
          BARCODE_ERROR_CODES.DUPLICATE_LIFECYCLE_EVENT,
          'Lifecycle event id has already been recorded.',
          'eventId'
        );
      }
      if (error?.code === '23503') {
        throw new BarcodeDomainError(
          BARCODE_ERROR_CODES.INVALID_TRANSITION,
          'Lifecycle predecessor has not been recorded.',
          'previousEventId'
        );
      }
      throw error;
    }
    return audit;
  }

  function validateRequestContext(context) {
    if (!context || context.kind !== 'barcode_print_request_context' || !Object.isFrozen(context)) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_REQUEST,
        'An immutable barcode request context is required.',
        'requestContext'
      );
    }
    const job = validatePrintJobModel(context.job);
    const lifecycle = validatePrintLifecycleEvent(context.lifecycle);
    if (lifecycle.state !== PRINT_LIFECYCLE_STATES.REQUESTED || lifecycle.jobId !== job.jobId) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_REQUEST,
        'Barcode request context failed integrity validation.',
        'requestContext'
      );
    }
    return { job, lifecycle };
  }

  async function requestPrintPreparation(input = {}) {
    const job = validatePrintJobModel(input.job);
    const lifecycle = validatePrintLifecycleEvent(input.lifecycle);
    if (lifecycle.state !== PRINT_LIFECYCLE_STATES.REQUESTED || lifecycle.jobId !== job.jobId) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_TRANSITION,
        'Barcode print requests require an initial requested lifecycle event.',
        'lifecycle'
      );
    }
    const user = await requirePermission(BARCODE_PERMISSIONS.REQUEST_PRINT);
    const authoritativeProducts = await validateAuthoritativeProducts(
      job,
      products.findProductById
    );
    const audit = await persistLifecycle({ lifecycle, job, user });

    return Object.freeze({
      kind: 'barcode_print_request_context',
      schemaVersion: 1,
      immutable: true,
      requesterUserId: user.id,
      job,
      lifecycle,
      authoritativeProducts,
      audit,
    });
  }

  async function prepareExecution(input = {}) {
    const request = validateRequestContext(input.requestContext);
    const lifecycle = validatePrintLifecycleEvent(input.lifecycle);
    validatePrintLifecycleTransition(request.lifecycle, lifecycle);
    if (lifecycle.state !== PRINT_LIFECYCLE_STATES.PREPARED) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_TRANSITION,
        'Execution preparation requires a prepared lifecycle event.',
        'lifecycle'
      );
    }
    const user = await requirePermission(BARCODE_PERMISSIONS.EXECUTE_PRINT);
    const authoritativeProducts = await validateAuthoritativeProducts(
      request.job,
      products.findProductById
    );
    const plan = preparePrintExecution({
      executionId: input.executionId,
      job: request.job,
      previousLifecycle: request.lifecycle,
      lifecycle,
    });
    const audit = await persistLifecycle({
      lifecycle,
      job: request.job,
      user,
      metadata: { executionId: plan.executionId },
    });

    return Object.freeze({
      kind: 'barcode_execution_context',
      schemaVersion: 1,
      immutable: true,
      executorUserId: user.id,
      plan,
      lifecycle,
      authoritativeProducts,
      audit,
    });
  }

  function validateExecutionContext(context) {
    if (!context || context.kind !== 'barcode_execution_context' || !Object.isFrozen(context)) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_EXECUTION,
        'An immutable barcode execution context is required.',
        'executionContext'
      );
    }
    const plan = validatePrintExecutionPlan(context.plan);
    const lifecycle = validatePrintLifecycleEvent(context.lifecycle);
    if (!isDeepStrictEqual(lifecycle, plan.lifecycle)) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_EXECUTION,
        'Barcode execution context failed integrity validation.',
        'executionContext'
      );
    }
    return { plan, lifecycle };
  }

  async function markExecutionReady(input = {}) {
    const execution = validateExecutionContext(input.executionContext);
    const lifecycle = validatePrintLifecycleEvent(input.lifecycle);
    validatePrintLifecycleTransition(execution.lifecycle, lifecycle);
    if (lifecycle.state !== PRINT_LIFECYCLE_STATES.READY) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_TRANSITION,
        'Execution readiness requires a ready lifecycle event.',
        'lifecycle'
      );
    }
    const user = await requirePermission(BARCODE_PERMISSIONS.EXECUTE_PRINT);
    const authoritativeProducts = await validateAuthoritativeProducts(
      execution.plan.job,
      products.findProductById
    );
    const audit = await persistLifecycle({
      lifecycle,
      job: execution.plan.job,
      user,
      metadata: { executionId: execution.plan.executionId },
    });
    return Object.freeze({
      kind: 'barcode_ready_context',
      schemaVersion: 1,
      immutable: true,
      plan: execution.plan,
      lifecycle,
      authoritativeProducts,
      audit,
    });
  }

  function validateReadyContext(context) {
    if (!context || context.kind !== 'barcode_ready_context' || !Object.isFrozen(context)) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_EXECUTION,
        'An immutable ready execution context is required.',
        'readyContext'
      );
    }
    const plan = validatePrintExecutionPlan(context.plan);
    const lifecycle = validatePrintLifecycleEvent(context.lifecycle);
    validatePrintLifecycleTransition(plan.lifecycle, lifecycle);
    if (lifecycle.state !== PRINT_LIFECYCLE_STATES.READY) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_EXECUTION,
        'Ready execution context failed integrity validation.',
        'readyContext'
      );
    }
    return { plan, lifecycle };
  }

  async function recordAdapterOutcome(input = {}) {
    const ready = validateReadyContext(input.readyContext);
    const result = createAdapterResult(input.result, ready.plan);
    if (Date.parse(result.completedAt) < Date.parse(ready.lifecycle.occurredAt)) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_ADAPTER_RESULT,
        'Adapter result predates the ready lifecycle event.',
        'completedAt'
      );
    }
    const lifecycle = validatePrintLifecycleEvent(input.lifecycle);
    validatePrintLifecycleTransition(ready.lifecycle, lifecycle);
    const expectedState = {
      [ADAPTER_RESULT_STATUSES.PRINTED]: PRINT_LIFECYCLE_STATES.COMPLETED,
      [ADAPTER_RESULT_STATUSES.FAILED]: PRINT_LIFECYCLE_STATES.FAILED,
      [ADAPTER_RESULT_STATUSES.CANCELLED]: PRINT_LIFECYCLE_STATES.CANCELLED,
    }[result.status];
    if (lifecycle.state !== expectedState) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_ADAPTER_RESULT,
        'Adapter result and lifecycle outcome do not match.',
        'lifecycle.state'
      );
    }
    const user = await requirePermission(BARCODE_PERMISSIONS.EXECUTE_PRINT);
    const audit = await persistLifecycle({
      lifecycle,
      job: ready.plan.job,
      user,
      metadata: {
        executionId: ready.plan.executionId,
        resultId: result.resultId,
        adapterStatus: result.status,
      },
    });
    return Object.freeze({
      kind: 'barcode_execution_outcome',
      schemaVersion: 1,
      immutable: true,
      result,
      lifecycle,
      audit,
    });
  }

  async function recordTerminalLifecycle(input = {}) {
    const job = validatePrintJobModel(input.job);
    const previous = validatePrintLifecycleEvent(input.previousLifecycle);
    const lifecycle = validatePrintLifecycleEvent(input.lifecycle);
    validatePrintLifecycleTransition(previous, lifecycle);
    if (
      ![PRINT_LIFECYCLE_STATES.CANCELLED, PRINT_LIFECYCLE_STATES.FAILED].includes(lifecycle.state)
    ) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_TRANSITION,
        'Only cancelled or failed terminal events may be recorded directly.',
        'lifecycle.state'
      );
    }
    if (previous.jobId !== job.jobId) {
      throw new BarcodeDomainError(
        BARCODE_ERROR_CODES.INVALID_TRANSITION,
        'Terminal lifecycle does not belong to the supplied job.',
        'lifecycle.jobId'
      );
    }
    const user = await requirePermission(BARCODE_PERMISSIONS.EXECUTE_PRINT);
    const audit = await persistLifecycle({ lifecycle, job, user });
    return Object.freeze({ lifecycle, audit });
  }

  return Object.freeze({
    markExecutionReady,
    prepareExecution,
    recordAdapterOutcome,
    recordTerminalLifecycle,
    requestPrintPreparation,
  });
}

module.exports = {
  createBarcodeOrchestrator,
};
