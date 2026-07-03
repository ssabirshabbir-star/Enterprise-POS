const RESTORE_ENGINE_STATES = Object.freeze({
  IDLE: 'idle',
  REQUEST_CREATED: 'request_created',
  ASSESSING: 'assessing',
  BLOCKED: 'blocked',
  READY_FOR_FUTURE_CERTIFICATION: 'ready_for_future_certification',
  EXECUTION_PROHIBITED: 'execution_prohibited',
  FAILED: 'failed',
});

const DESTRUCTIVE_STATES = Object.freeze([
  'executing',
  'committing',
  'rolling_back',
  'runtime_recovery',
  'completed_restore',
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  [RESTORE_ENGINE_STATES.IDLE]: [
    RESTORE_ENGINE_STATES.REQUEST_CREATED,
    RESTORE_ENGINE_STATES.BLOCKED,
  ],
  [RESTORE_ENGINE_STATES.REQUEST_CREATED]: [
    RESTORE_ENGINE_STATES.ASSESSING,
    RESTORE_ENGINE_STATES.BLOCKED,
  ],
  [RESTORE_ENGINE_STATES.ASSESSING]: [
    RESTORE_ENGINE_STATES.BLOCKED,
    RESTORE_ENGINE_STATES.READY_FOR_FUTURE_CERTIFICATION,
    RESTORE_ENGINE_STATES.FAILED,
  ],
  [RESTORE_ENGINE_STATES.READY_FOR_FUTURE_CERTIFICATION]: [
    RESTORE_ENGINE_STATES.EXECUTION_PROHIBITED,
    RESTORE_ENGINE_STATES.BLOCKED,
  ],
  [RESTORE_ENGINE_STATES.BLOCKED]: [RESTORE_ENGINE_STATES.IDLE],
  [RESTORE_ENGINE_STATES.EXECUTION_PROHIBITED]: [RESTORE_ENGINE_STATES.IDLE],
  [RESTORE_ENGINE_STATES.FAILED]: [RESTORE_ENGINE_STATES.IDLE],
});

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function transitionBlockedReason(fromState, toState) {
  if (DESTRUCTIVE_STATES.includes(toState)) {
    return 'Destructive Restore execution states are prohibited in the state machine shell.';
  }
  const allowed = ALLOWED_TRANSITIONS[fromState] || [];
  if (!allowed.includes(toState)) {
    return `Transition from ${fromState || 'unknown'} to ${toState || 'unknown'} is not allowed.`;
  }
  return null;
}

function validateTransition(fromState, toState) {
  const blockedReason = transitionBlockedReason(fromState, toState);
  return freeze({
    fromState,
    toState,
    transitionAllowed: !blockedReason,
    transitionBlocked: Boolean(blockedReason),
    blockedReason,
    restoreExecutionAvailable: false,
    noRestoreExecuted: true,
  });
}

function assessStateMachine({ request = null } = {}) {
  const requestReady = request?.validation?.validationStatus === 'blocked';
  const currentState = requestReady
    ? RESTORE_ENGINE_STATES.READY_FOR_FUTURE_CERTIFICATION
    : RESTORE_ENGINE_STATES.BLOCKED;
  const blockedTransitions = DESTRUCTIVE_STATES.map((state) =>
    validateTransition(currentState, state)
  );
  return freeze({
    stateMachineStatus: 'state_machine_shell_ready_non_executable',
    currentState,
    readOnly: true,
    assessmentOnly: true,
    internalOnly: true,
    noRestoreExecuted: true,
    noDataCommitted: true,
    restoreUnavailable: true,
    restoreEligible: false,
    restoreExecutionAvailable: false,
    allowedStates: Object.values(RESTORE_ENGINE_STATES),
    destructiveStatesBlocked: DESTRUCTIVE_STATES,
    allowedTransitions: ALLOWED_TRANSITIONS,
    blockedTransitions,
    validation: validateTransition(currentState, RESTORE_ENGINE_STATES.EXECUTION_PROHIBITED),
    message:
      'Restore state machine shell is available for assessment only. Destructive transitions remain blocked.',
  });
}

module.exports = {
  RESTORE_ENGINE_STATES,
  assessStateMachine,
  validateTransition,
};
