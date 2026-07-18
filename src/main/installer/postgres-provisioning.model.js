const crypto = require('crypto');

const PROVISIONING_STATES = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  ARCHIVE_VERIFIED: 'ARCHIVE_VERIFIED',
  PAYLOAD_STAGED: 'PAYLOAD_STAGED',
  DATA_DIRECTORY_INITIALIZED: 'DATA_DIRECTORY_INITIALIZED',
  SERVER_STARTED: 'SERVER_STARTED',
  DATABASE_CREATED: 'DATABASE_CREATED',
  APPLICATION_SCHEMA_READY: 'APPLICATION_SCHEMA_READY',
  FAILED: 'FAILED',
  ROLLBACK_REQUIRED: 'ROLLBACK_REQUIRED',
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
  PROVISIONING_STATES.FAILED,
  PROVISIONING_STATES.ROLLED_BACK,
  PROVISIONING_STATES.MANUAL_RECOVERY_REQUIRED,
  PROVISIONING_STATES.CANCELLED_BEFORE_MUTATION,
]);

const MUTATING_STATES = new Set([
  PROVISIONING_STATES.DATA_DIRECTORY_INITIALIZED,
  PROVISIONING_STATES.SERVER_STARTED,
  PROVISIONING_STATES.DATABASE_CREATED,
  PROVISIONING_STATES.APPLICATION_SCHEMA_READY,
  PROVISIONING_STATES.DATA_DIR_INITIALIZING,
  PROVISIONING_STATES.SERVICE_INSTALLING,
  PROVISIONING_STATES.SERVICE_STARTING,
  PROVISIONING_STATES.DATABASE_INITIALIZING,
  PROVISIONING_STATES.HEALTH_VERIFYING,
  PROVISIONING_STATES.ROLLBACK_REQUIRED,
  PROVISIONING_STATES.FAILED_ROLLBACK_REQUIRED,
  PROVISIONING_STATES.ROLLBACK_IN_PROGRESS,
]);

const PROVISIONING_PROGRESS_EVENTS = Object.freeze([
  {
    code: 'VERIFYING_POSTGRES_PACKAGE',
    label: 'Verifying PostgreSQL package',
    state: PROVISIONING_STATES.ARCHIVE_VERIFIED,
  },
  {
    code: 'CHECKING_INTEGRITY',
    label: 'Checking integrity',
    state: PROVISIONING_STATES.ARCHIVE_VERIFIED,
  },
  {
    code: 'PREPARING_RUNTIME',
    label: 'Preparing runtime',
    state: PROVISIONING_STATES.PAYLOAD_STAGED,
  },
  {
    code: 'INITIALIZING_DATABASE_CLUSTER',
    label: 'Initializing database',
    state: PROVISIONING_STATES.DATA_DIRECTORY_INITIALIZED,
  },
  {
    code: 'STARTING_DATABASE',
    label: 'Starting database',
    state: PROVISIONING_STATES.SERVER_STARTED,
  },
  {
    code: 'CREATING_APPLICATION_DATABASE',
    label: 'Creating application database',
    state: PROVISIONING_STATES.DATABASE_CREATED,
  },
  {
    code: 'PREPARING_ENTERPRISE_POS',
    label: 'Preparing Enterprise POS',
    state: PROVISIONING_STATES.APPLICATION_SCHEMA_READY,
  },
  {
    code: 'COMPLETED',
    label: 'Completed',
    state: PROVISIONING_STATES.COMPLETED,
  },
  {
    code: 'FAILED',
    label: 'Failed',
    state: PROVISIONING_STATES.FAILED,
  },
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  [PROVISIONING_STATES.NOT_STARTED]: [
    PROVISIONING_STATES.ARCHIVE_VERIFIED,
    PROVISIONING_STATES.FAILED,
    PROVISIONING_STATES.CANCELLED_BEFORE_MUTATION,
  ],
  [PROVISIONING_STATES.ARCHIVE_VERIFIED]: [
    PROVISIONING_STATES.PAYLOAD_STAGED,
    PROVISIONING_STATES.FAILED,
    PROVISIONING_STATES.CANCELLED_BEFORE_MUTATION,
  ],
  [PROVISIONING_STATES.PAYLOAD_STAGED]: [
    PROVISIONING_STATES.DATA_DIRECTORY_INITIALIZED,
    PROVISIONING_STATES.ROLLBACK_REQUIRED,
    PROVISIONING_STATES.FAILED,
  ],
  [PROVISIONING_STATES.DATA_DIRECTORY_INITIALIZED]: [
    PROVISIONING_STATES.SERVER_STARTED,
    PROVISIONING_STATES.ROLLBACK_REQUIRED,
    PROVISIONING_STATES.MANUAL_RECOVERY_REQUIRED,
  ],
  [PROVISIONING_STATES.SERVER_STARTED]: [
    PROVISIONING_STATES.DATABASE_CREATED,
    PROVISIONING_STATES.ROLLBACK_REQUIRED,
    PROVISIONING_STATES.MANUAL_RECOVERY_REQUIRED,
  ],
  [PROVISIONING_STATES.DATABASE_CREATED]: [
    PROVISIONING_STATES.APPLICATION_SCHEMA_READY,
    PROVISIONING_STATES.ROLLBACK_REQUIRED,
    PROVISIONING_STATES.MANUAL_RECOVERY_REQUIRED,
  ],
  [PROVISIONING_STATES.APPLICATION_SCHEMA_READY]: [
    PROVISIONING_STATES.COMPLETED,
    PROVISIONING_STATES.ROLLBACK_REQUIRED,
    PROVISIONING_STATES.MANUAL_RECOVERY_REQUIRED,
  ],
  [PROVISIONING_STATES.ROLLBACK_REQUIRED]: [
    PROVISIONING_STATES.ROLLBACK_IN_PROGRESS,
    PROVISIONING_STATES.MANUAL_RECOVERY_REQUIRED,
  ],
  [PROVISIONING_STATES.ROLLBACK_IN_PROGRESS]: [
    PROVISIONING_STATES.ROLLED_BACK,
    PROVISIONING_STATES.MANUAL_RECOVERY_REQUIRED,
  ],
});

const RESUMABLE_DECISIONS = Object.freeze({
  [PROVISIONING_STATES.NOT_STARTED]: {
    action: 'START_FROM_PREFLIGHT',
    severity: 'normal',
    message: 'No managed PostgreSQL provisioning mutation has started.',
  },
  [PROVISIONING_STATES.ARCHIVE_VERIFIED]: {
    action: 'RESTAGE_PAYLOAD',
    severity: 'recoverable',
    message: 'Archive verification can be repeated before any database cluster exists.',
  },
  [PROVISIONING_STATES.PAYLOAD_STAGED]: {
    action: 'VERIFY_STAGED_PAYLOAD_THEN_INITDB',
    severity: 'recoverable',
    message: 'Staged runtime must be verified before initializing the data directory.',
  },
  [PROVISIONING_STATES.DATA_DIRECTORY_INITIALIZED]: {
    action: 'VERIFY_DATA_DIRECTORY_THEN_START_SERVER',
    severity: 'recoverable',
    message:
      'Initialized data directory can be reused only after ownership and contents are verified.',
  },
  [PROVISIONING_STATES.SERVER_STARTED]: {
    action: 'VERIFY_SERVER_HEALTH_THEN_CREATE_DATABASE',
    severity: 'recoverable',
    message: 'Server process state must be reconciled before database creation continues.',
  },
  [PROVISIONING_STATES.DATABASE_CREATED]: {
    action: 'VERIFY_DATABASE_THEN_RUN_SCHEMA',
    severity: 'recoverable',
    message: 'Application database must be inspected before schema initialization resumes.',
  },
  [PROVISIONING_STATES.APPLICATION_SCHEMA_READY]: {
    action: 'VERIFY_SCHEMA_THEN_COMPLETE',
    severity: 'recoverable',
    message: 'Schema health must be certified before provisioning is marked complete.',
  },
  [PROVISIONING_STATES.FAILED]: {
    action: 'MANUAL_REVIEW',
    severity: 'blocked',
    message: 'Provisioning failed before a certified rollback decision was recorded.',
  },
  [PROVISIONING_STATES.ROLLBACK_REQUIRED]: {
    action: 'ROLLBACK_STAGED_RUNTIME_ONLY',
    severity: 'blocked',
    message: 'Rollback is required and must preserve user databases and diagnostics.',
  },
  [PROVISIONING_STATES.FAILED_ROLLBACK_REQUIRED]: {
    action: 'ROLLBACK_STAGED_RUNTIME_ONLY',
    severity: 'blocked',
    message: 'Rollback is required and must preserve user databases and diagnostics.',
  },
  [PROVISIONING_STATES.ROLLBACK_IN_PROGRESS]: {
    action: 'MANUAL_REVIEW',
    severity: 'blocked',
    message: 'Interrupted rollback cannot be assumed successful.',
  },
  [PROVISIONING_STATES.MANUAL_RECOVERY_REQUIRED]: {
    action: 'MANUAL_RECOVERY',
    severity: 'blocked',
    message: 'Manual recovery evidence is required before retry or normal continuation.',
  },
  [PROVISIONING_STATES.ROLLED_BACK]: {
    action: 'SAFE_TERMINAL',
    severity: 'safe',
    message: 'Rollback completed according to the provisioning journal.',
  },
  [PROVISIONING_STATES.COMPLETED]: {
    action: 'SAFE_TERMINAL',
    severity: 'safe',
    message: 'Managed PostgreSQL provisioning completed.',
  },
  [PROVISIONING_STATES.CANCELLED_BEFORE_MUTATION]: {
    action: 'SAFE_TERMINAL',
    severity: 'safe',
    message: 'Provisioning was cancelled before system mutation.',
  },
});

function createProvisioningOperation(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  return {
    operationId: input.operationId || crypto.randomUUID(),
    type: 'MANAGED_POSTGRES_PROVISIONING',
    state: input.state || PROVISIONING_STATES.NOT_STARTED,
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
        to: input.state || PROVISIONING_STATES.NOT_STARTED,
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

function assertProvisioningTransitionAllowed(operation, nextState) {
  const allowed = ALLOWED_TRANSITIONS[operation?.state] || [];
  if (TERMINAL_STATES.has(operation?.state)) {
    throw new Error(`Provisioning operation ${operation.operationId} is terminal.`);
  }
  if (allowed.length > 0 && !allowed.includes(nextState)) {
    throw new Error(`Provisioning transition ${operation.state} -> ${nextState} is not allowed.`);
  }
  return true;
}

function isProvisioningTerminal(state) {
  return TERMINAL_STATES.has(state);
}

function requiresProvisioningRecovery(state) {
  return MUTATING_STATES.has(state) || state === PROVISIONING_STATES.MANUAL_RECOVERY_REQUIRED;
}

function classifyProvisioningRecovery(operation = null) {
  if (!operation) {
    return {
      state: null,
      action: 'NONE',
      severity: 'safe',
      blocked: false,
      resumable: false,
      message: 'No managed PostgreSQL provisioning operation exists.',
    };
  }
  const decision = RESUMABLE_DECISIONS[operation.state] || {
    action: 'MANUAL_REVIEW',
    severity: 'blocked',
    message: 'Unknown provisioning state requires manual review.',
  };
  return {
    state: operation.state,
    previousState: operation.previousState || null,
    action: decision.action,
    severity: decision.severity,
    blocked: decision.severity === 'blocked',
    resumable: decision.severity === 'recoverable',
    recoveryRequired: requiresProvisioningRecovery(operation.state),
    message: decision.message,
  };
}

function getProvisioningRollbackPlan(operation = null) {
  return {
    policyVersion: 'managed-postgres-rollback-policy-v1',
    operationId: operation?.operationId || null,
    removes: [
      'temporary staging directories created for this operation',
      'incomplete managed PostgreSQL runtime directory owned by Enterprise POS',
      'incomplete managed PostgreSQL data directory owned by Enterprise POS',
      'transient service registration created by this operation, if present',
    ],
    preserves: [
      'provisioning journal',
      'stage logs and PostgreSQL server logs',
      'source PostgreSQL archive',
      'license and notice evidence',
      'user databases',
      'unrelated PostgreSQL installations and services',
    ],
    manualInterventionRequiredWhen: [
      'operation state is unknown or ambiguous',
      'rollback was interrupted',
      'a data directory owner cannot be proven',
      'an unrelated PostgreSQL service would be affected',
      'database creation or schema initialization may have reached user data',
    ],
  };
}

function createProvisioningLogEntry(input = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const command = input.command
    ? {
        executable: input.command.executable || null,
        args: Array.isArray(input.command.args)
          ? input.command.args.map((arg) => redactSensitiveText(arg))
          : [],
      }
    : null;
  return {
    timestamp: now,
    operationId: input.operationId || null,
    step: input.step || 'UNKNOWN_STEP',
    durationMs: Number.isFinite(input.durationMs) ? input.durationMs : null,
    status: input.status || 'unknown',
    exitCode: Number.isInteger(input.exitCode) ? input.exitCode : null,
    command,
    message: input.message || '',
    error: input.error ? redactSensitiveText(String(input.error)) : null,
  };
}

function redactSensitiveText(value = '') {
  return String(value).replace(
    /(password|pgpassword|database_url|connectionString)\s*[:=]\s*[^\s,;"]+/gi,
    '$1=[redacted]'
  );
}

function getProvisioningProgressContract() {
  return PROVISIONING_PROGRESS_EVENTS.map((event) => ({ ...event }));
}

function assessProvisioningReadiness(input = {}) {
  const checks = [
    {
      code: 'ARCHIVE_POLICY_PINNED',
      status: input.archivePolicyPinned === false ? 'blocked' : 'completed',
      message: 'PostgreSQL version, filename, architecture, and SHA-256 are pinned.',
    },
    {
      code: 'ARCHIVE_STAGING_CERTIFIED',
      status: input.archiveStagingCertified === false ? 'blocked' : 'completed',
      message: 'Archive inspection, ZIP Slip protection, and selective staging are implemented.',
    },
    {
      code: 'RUNTIME_HARNESS_READY',
      status: input.runtimeHarnessReady === false ? 'blocked' : 'completed',
      message:
        'Runtime certification harness is available for local diagnostics and clean VM runs.',
    },
    {
      code: 'CLEAN_ENVIRONMENT_CERTIFICATION',
      status: input.cleanEnvironmentCertified ? 'completed' : 'pending',
      message: 'Clean Windows Sandbox or VM execution must pass before activation.',
    },
    {
      code: 'RELEASE_APPROVAL',
      status: input.releaseApproved ? 'completed' : 'pending',
      message: 'Release approval is required before managed provisioning can be enabled.',
    },
  ];
  return {
    ok: checks.every((check) => check.status === 'completed'),
    provisioningActivationEnabled: false,
    certifiedForActivation: false,
    checks,
    blockers: checks.filter((check) => check.status !== 'completed').map((check) => check.code),
  };
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
  ALLOWED_TRANSITIONS,
  PROVISIONING_PROGRESS_EVENTS,
  PROVISIONING_STATES,
  assertProvisioningTransitionAllowed,
  assessProvisioningReadiness,
  classifyProvisioningRecovery,
  createProvisioningLogEntry,
  createProvisioningOperation,
  getProvisioningProgressContract,
  getProvisioningRollbackPlan,
  isProvisioningTerminal,
  redactProvisioningOperation,
  requiresProvisioningRecovery,
  transitionProvisioningOperation,
};
