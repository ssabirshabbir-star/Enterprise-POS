const TRANSACTION_ADAPTER_OPERATIONS = Object.freeze({
  BEGIN: 'begin',
  COMMIT: 'commit',
  ROLLBACK: 'rollback',
});

const TRANSACTION_ADAPTER_STATES = Object.freeze({
  AVAILABLE_BLOCKED: 'adapter_available_blocked',
  CAPABILITY_BLOCKED: 'transaction_capability_blocked',
  OPERATION_BLOCKED: 'transaction_operation_blocked',
});

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function blockedOperation(operation, reason) {
  return freeze({
    operation,
    operationStatus: TRANSACTION_ADAPTER_STATES.OPERATION_BLOCKED,
    operationAllowed: false,
    transactionStarted: false,
    transactionCommitted: false,
    transactionRolledBack: false,
    databaseClientUsed: false,
    restoreExecutionAvailable: false,
    noRestoreExecuted: true,
    noDataCommitted: true,
    blockedReason: reason,
    message: `${operation} is a non-executable transaction adapter shell operation. Restore remains unavailable.`,
  });
}

function assessTransactionCapability({ request = null, stateMachine = null } = {}) {
  const blockers = [];
  if (!request) blockers.push('Restore execution request model is required.');
  if (!stateMachine) blockers.push('Restore state machine assessment is required.');
  if (request?.restoreExecutionAvailable === true) {
    blockers.push('Restore execution must remain unavailable.');
  }
  if (stateMachine?.restoreExecutionAvailable === true) {
    blockers.push('State machine must not expose Restore execution.');
  }
  if (stateMachine?.currentState !== 'ready_for_future_certification') {
    blockers.push('State machine is not ready for future certification assessment.');
  }

  return freeze({
    capabilityStatus: TRANSACTION_ADAPTER_STATES.CAPABILITY_BLOCKED,
    capabilityAvailable: true,
    operationAllowed: false,
    transactionClientAvailable: false,
    transactionClientUsed: false,
    realTransactionAvailable: false,
    beginAvailable: false,
    commitAvailable: false,
    rollbackAvailable: false,
    restoreExecutionAvailable: false,
    noRestoreExecuted: true,
    noDataCommitted: true,
    blockers,
    message:
      'Restore transaction adapter capability is present as a blocked shell only. Real transaction operations are unavailable.',
  });
}

function beginTransaction() {
  return blockedOperation(
    TRANSACTION_ADAPTER_OPERATIONS.BEGIN,
    'Real Restore transaction begin is prohibited in the adapter shell phase.'
  );
}

function commitTransaction() {
  return blockedOperation(
    TRANSACTION_ADAPTER_OPERATIONS.COMMIT,
    'Real Restore transaction commit is prohibited in the adapter shell phase.'
  );
}

function rollbackTransaction() {
  return blockedOperation(
    TRANSACTION_ADAPTER_OPERATIONS.ROLLBACK,
    'Real Restore rollback execution is prohibited in the adapter shell phase.'
  );
}

function createTransactionBoundaryInterface({ request = null, stateMachine = null } = {}) {
  const capability = assessTransactionCapability({ request, stateMachine });
  return freeze({
    adapterStatus: TRANSACTION_ADAPTER_STATES.AVAILABLE_BLOCKED,
    adapterType: 'restore_transaction_adapter_shell',
    internalOnly: true,
    readOnly: true,
    assessmentOnly: true,
    noRestoreExecuted: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    databaseClientUsed: false,
    transactionBoundaryInterface: {
      begin: beginTransaction(),
      commit: commitTransaction(),
      rollback: rollbackTransaction(),
    },
    capability,
    auditMetadata: {
      adapterStatus: TRANSACTION_ADAPTER_STATES.AVAILABLE_BLOCKED,
      capabilityStatus: capability.capabilityStatus,
      noRestoreExecuted: true,
      noDataCommitted: true,
      restoreUnavailable: true,
      restoreExecutionAvailable: false,
    },
    message:
      'Restore transaction adapter shell is available for readiness assessment only. Begin, commit, and rollback are blocked.',
  });
}

module.exports = {
  TRANSACTION_ADAPTER_OPERATIONS,
  TRANSACTION_ADAPTER_STATES,
  assessTransactionCapability,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  createTransactionBoundaryInterface,
};
