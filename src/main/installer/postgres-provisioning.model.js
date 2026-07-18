const crypto = require('crypto');

const PROVISIONING_STATES = Object.freeze({
  PREFLIGHT_PENDING: 'PREFLIGHT_PENDING',
  PREFLIGHT_PASSED: 'PREFLIGHT_PASSED',
  PAYLOAD_VERIFIED: 'PAYLOAD_VERIFIED',
  CREDENTIALS_GENERATED: 'CREDENTIALS_GENERATED',
  DATA_DIR_INITIALIZING: 'DATA_DIR_INITIALIZING',
  SERVICE_INSTALLING: 'SERVICE_INSTALLING',
  SERVICE_STARTING: 'SERVICE_STARTING',
  DATABASE_INITIALIZING: 'DATABASE_INITIALIZING',
  HEALTH_VERIFYING: 'HEALTH_VERIFYING',
  COMPLETED: 'COMPLETED',
  FAILED_ROLLBACK_REQUIRED: 'FAILED_ROLLBACK_REQUIRED',
  ROLLBACK_IN_PROGRESS: 'ROLLBACK_IN_PROGRESS',
  ROLLED_BACK: 'ROLLED_BACK',
  MANUAL_RECOVERY_REQUIRED: 'MANUAL_RECOVERY_REQUIRED',
  CANCELLED_BEFORE_MUTATION: 'CANCELLED_BEFORE_MUTATION',
});

const TERMINAL_STATES = new Set([
  PROVISIONING_STATES.COMPLETED,
  PROVISIONING_STATES.ROLLED_BACK,
  PROVISIONING_STATES.MANUAL_RECOVERY_REQUIRED,
  PROVISIONING_STATES.CANCELLED_BEFORE_MUTATION,
]);

const MUTATING_STATES = new Set([
  PROVISIONING_STATES.DATA_DIR_INITIALIZING,
  PROVISIONING_STATES.SERVICE_INSTALLING,
  PROVISIONING_STATES.SERVICE_STARTING,
  PROVISIONING_STATES.DATABASE_INITIALIZING,
  PROVISIONING_STATES.HEALTH_VERIFYING,
  PROVISIONING_STATES.FAILED_ROLLBACK_REQUIRED,
  PROVISIONING_STATES.ROLLBACK_IN_PROGRESS,
]);

function createProvisioningOperation(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  return {
    operationId: input.operationId || crypto.randomUUID(),
    type: 'MANAGED_POSTGRES_PROVISIONING',
    state: PROVISIONING_STATES.PREFLIGHT_PENDING,
    previousState: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
    target: input.target || null,
    payload: input.payload || null,
    service: input.service || null,
    dataDirectory: input.dataDirectory || null,
    port: input.port || null,
    failureCode: null,
    failureStage: null,
    recoveryRequired: false,
    transitions: [
      {
        from: null,
        to: PROVISIONING_STATES.PREFLIGHT_PENDING,
        at: now,
        reason: 'operation_created',
      },
    ],
  };
}

function transitionProvisioningOperation(operation, nextState, metadata = {}, options = {}) {
  if (!operation || !Object.values(PROVISIONING_STATES).includes(nextState)) {
    throw new Error('Invalid PostgreSQL provisioning transition.');
  }
  if (TERMINAL_STATES.has(operation.state)) {
    throw new Error(`Provisioning operation ${operation.operationId} is terminal.`);
  }
  const now = options.now || new Date().toISOString();
  const updated = {
    ...operation,
    previousState: operation.state,
    state: nextState,
    updatedAt: now,
    startedAt: operation.startedAt || (MUTATING_STATES.has(nextState) ? now : operation.startedAt),
    completedAt: TERMINAL_STATES.has(nextState) ? now : operation.completedAt,
    failureCode: metadata.failureCode || operation.failureCode,
    failureStage: metadata.failureStage || operation.failureStage,
    recoveryRequired:
      nextState === PROVISIONING_STATES.MANUAL_RECOVERY_REQUIRED ||
      nextState === PROVISIONING_STATES.FAILED_ROLLBACK_REQUIRED ||
      operation.recoveryRequired,
    transitions: [
      ...(operation.transitions || []),
      {
        from: operation.state,
        to: nextState,
        at: now,
        reason: metadata.reason || null,
        code: metadata.failureCode || null,
      },
    ],
  };
  return updated;
}

function isProvisioningTerminal(state) {
  return TERMINAL_STATES.has(state);
}

function requiresProvisioningRecovery(state) {
  return MUTATING_STATES.has(state) || state === PROVISIONING_STATES.MANUAL_RECOVERY_REQUIRED;
}

function redactProvisioningOperation(operation = null) {
  if (!operation) return null;
  return {
    operationId: operation.operationId,
    type: operation.type,
    state: operation.state,
    previousState: operation.previousState,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    completedAt: operation.completedAt,
    target: operation.target,
    payload: operation.payload
      ? {
          version: operation.payload.version,
          digest: operation.payload.digest,
          fileName: operation.payload.fileName,
        }
      : null,
    service: operation.service,
    dataDirectory: operation.dataDirectory,
    port: operation.port,
    failureCode: operation.failureCode,
    failureStage: operation.failureStage,
    recoveryRequired: operation.recoveryRequired,
    transitions: operation.transitions || [],
  };
}

module.exports = {
  PROVISIONING_STATES,
  createProvisioningOperation,
  isProvisioningTerminal,
  redactProvisioningOperation,
  requiresProvisioningRecovery,
  transitionProvisioningOperation,
};
