const fs = require('fs/promises');
const path = require('path');
const packageJson = require('../../../../package.json');
const settingsRepository = require('../settings/settings.repository');
const activityRepository = require('../activity/activity.repository');
const activationModel = require('./restore-production-activation.model');
const governanceModel = require('./restore-production-governance.model');
const recoveryModel = require('./restore-recovery-state.model');

const PRODUCTION_RESTORE_ROUTE_PRESENT = true;
const PRODUCTION_RESTORE_FEATURE_ENABLED = false;
const ACTIVATION_RECORD_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'resources',
  'restore',
  'production-activation.pending.json'
);

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function safeCode(value, fallback = 'RESTORE_PRODUCTION_EXECUTION_BLOCKED') {
  return String(value || fallback)
    .replace(/[^A-Z0-9_.-]/gi, '_')
    .slice(0, 120)
    .toUpperCase();
}

function safeMessage(value, fallback) {
  return String(value || fallback || 'Production Restore execution is blocked.')
    .replace(/DATABASE_URL\s*=\s*\S+/gi, 'DATABASE_URL=[redacted]')
    .replace(/PGPASSWORD\s*=\s*\S+/gi, 'PGPASSWORD=[redacted]')
    .replace(/postgres:\/\/\S+/gi, 'postgres://[redacted]')
    .replace(/password\s*=\s*\S+/gi, 'password=[redacted]')
    .slice(0, 700);
}

function block(code, message, details = {}) {
  return freeze({
    code: safeCode(code),
    message: safeMessage(message),
    details,
  });
}

async function readActivationRecord({ activationRecordPath = ACTIVATION_RECORD_PATH } = {}) {
  try {
    const raw = await fs.readFile(activationRecordPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeProductionRestoreRequest(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, code: 'RESTORE_PRODUCTION_PAYLOAD_INVALID', request: {} };
  }
  return {
    ok: true,
    request: {
      sourcePackagePath: String(payload.sourcePackagePath || payload.filePath || '').trim(),
      operationId: String(payload.operationId || '').trim(),
      confirmationId: String(payload.confirmationId || '').trim(),
      preflightDigest: String(payload.preflightDigest || '').trim(),
      executionPolicyDigest: String(payload.executionPolicyDigest || '').trim(),
    },
  };
}

function safetyBackupIsVerified(recoveryState = {}) {
  const reference = recoveryState.safetyBackupReference || {};
  return (
    recoveryState.currentState === recoveryModel.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED &&
    Boolean(reference.checksum) &&
    Boolean(reference.filePath || reference.backupLogId || reference.safetyBackupId)
  );
}

function classifyDatabaseIdentity(databaseIdentity = {}) {
  const blockers = [];
  const database = String(databaseIdentity.database || '').toLowerCase();
  if (!databaseIdentity.fingerprint) {
    blockers.push(block('RESTORE_DATABASE_IDENTITY_UNKNOWN', 'Database identity is unknown.'));
  }
  if (databaseIdentity.ambiguous) {
    blockers.push(block('RESTORE_DATABASE_IDENTITY_AMBIGUOUS', 'Database identity is ambiguous.'));
  }
  if (databaseIdentity.disposableCertificationDatabase) {
    blockers.push(
      block(
        'RESTORE_DATABASE_IDENTITY_DISPOSABLE',
        'Disposable certification databases cannot be production Restore targets.',
        { database }
      )
    );
  }
  if (['postgres', 'template0', 'template1'].includes(database)) {
    blockers.push(
      block('RESTORE_DATABASE_IDENTITY_SYSTEM_DATABASE', 'System databases cannot be restored.')
    );
  }
  return blockers;
}

function summarizeSteps(steps) {
  return steps.map((step, index) => ({
    order: index + 1,
    name: step.name,
    status: step.status,
    code: step.code || null,
  }));
}

async function executeProductionRestore(payload = {}, options = {}) {
  const deps = {
    repository: options.repository || settingsRepository,
    activityRepository: options.activityRepository || activityRepository,
    readActivationRecord: options.readActivationRecord || readActivationRecord,
    restoreEngine: options.restoreEngine || null,
    postRestoreValidator: options.postRestoreValidator || null,
    restartAdapter: options.restartAdapter || null,
    now: options.now || (() => new Date()),
  };
  const auditCorrelationId = options.auditCorrelationId || require('crypto').randomUUID();
  const steps = [];
  const blockers = [];

  function record(name, status, code = null) {
    steps.push({ name, status, code, at: deps.now().toISOString() });
  }

  const normalized = normalizeProductionRestoreRequest(payload);
  if (!normalized.ok) {
    blockers.push(block(normalized.code, 'Restore request payload is malformed.'));
    record('request_validation', 'blocked', normalized.code);
  } else {
    record('request_validation', 'passed');
  }
  const request = normalized.request || {};

  let packageVerification = null;
  let packageEligibility = null;
  if (request.sourcePackagePath) {
    try {
      packageVerification = await deps.repository.verifyRestorePackage(request.sourcePackagePath);
      record(
        'package_verification',
        packageVerification?.verificationStatus === 'passed' ? 'passed' : 'blocked',
        packageVerification?.verificationStatus === 'passed'
          ? null
          : 'RESTORE_PACKAGE_VERIFICATION_FAILED'
      );
      if (packageVerification?.verificationStatus !== 'passed') {
        blockers.push(
          block('RESTORE_PACKAGE_VERIFICATION_FAILED', 'Backup package verification failed.')
        );
      }
      packageEligibility = await deps.repository.assessRestoreEligibility(
        request.sourcePackagePath
      );
      record(
        'package_eligibility',
        packageEligibility?.eligibilityStatus === 'eligible_for_authorization'
          ? 'passed'
          : 'blocked',
        packageEligibility?.eligibilityStatus === 'eligible_for_authorization'
          ? null
          : 'RESTORE_PACKAGE_ELIGIBILITY_FAILED'
      );
      if (packageEligibility?.eligibilityStatus !== 'eligible_for_authorization') {
        blockers.push(
          block('RESTORE_PACKAGE_ELIGIBILITY_FAILED', 'Backup package eligibility failed.')
        );
      }
    } catch (error) {
      blockers.push(
        block(
          'RESTORE_PACKAGE_VERIFICATION_FAILED',
          'Backup package verification failed before Restore execution.',
          { reason: safeMessage(error.message, 'verification failed') }
        )
      );
      record('package_verification', 'blocked', 'RESTORE_PACKAGE_VERIFICATION_FAILED');
    }
  } else {
    blockers.push(block('RESTORE_PACKAGE_REQUIRED', 'A verified backup package path is required.'));
    record('package_verification', 'blocked', 'RESTORE_PACKAGE_REQUIRED');
  }

  const recoveryState = await deps.repository.getRestoreRecoveryState();
  const policy = await deps.repository.getRestoreExecutionPolicy();
  const operationLock = policy.operationLock || { locked: recoveryState.activeOperation === true };
  const databaseIdentity = governanceModel.resolveDatabaseIdentity();
  const activationRecord = await deps.readActivationRecord();
  const activation = activationModel.assessRestoreProductionActivation({
    record: activationRecord,
    currentApplicationVersion: packageJson.version,
    currentBackupFormatVersion: activationModel.REQUIRED_BACKUP_FORMAT_VERSION,
    productionFeatureFlagEnabled: PRODUCTION_RESTORE_FEATURE_ENABLED,
    productionExecutionRoutePresent: PRODUCTION_RESTORE_ROUTE_PRESENT,
    recoveryState,
    operationLock,
    databaseIdentity,
    now: deps.now(),
  });

  record(
    'production_activation',
    activation.activationAuthorized ? 'passed' : 'blocked',
    activation.activationAuthorized ? null : 'RESTORE_PRODUCTION_ACTIVATION_UNAVAILABLE'
  );
  activation.blockers.forEach((item) => {
    blockers.push(block(`RESTORE_PRODUCTION_${item.code}`, item.message, item.details || {}));
  });

  const identityBlockers = classifyDatabaseIdentity(databaseIdentity);
  blockers.push(...identityBlockers);
  record(
    'database_identity',
    identityBlockers.length ? 'blocked' : 'passed',
    identityBlockers[0]?.code || null
  );

  if (!safetyBackupIsVerified(recoveryState)) {
    blockers.push(
      block(
        'RESTORE_SAFETY_BACKUP_REQUIRED',
        'A verified pre-Restore safety backup for the active operation is required.'
      )
    );
    record('safety_backup_verification', 'blocked', 'RESTORE_SAFETY_BACKUP_REQUIRED');
  } else {
    record('safety_backup_verification', 'passed');
  }

  if (!request.confirmationId || !request.operationId) {
    blockers.push(
      block(
        'RESTORE_FINAL_CONFIRMATION_REQUIRED',
        'A durable, operation-bound final confirmation is required.'
      )
    );
    record('final_confirmation', 'blocked', 'RESTORE_FINAL_CONFIRMATION_REQUIRED');
  } else {
    record('final_confirmation', 'pending_validation');
  }

  if (recoveryState.unresolvedRecoveryState === true) {
    blockers.push(
      block(
        'RESTORE_RECOVERY_STATE_UNRESOLVED',
        'Unresolved Restore recovery state blocks production execution.'
      )
    );
  }
  if (operationLock?.locked === true && recoveryState.currentState !== 'SAFETY_BACKUP_VERIFIED') {
    blockers.push(
      block('RESTORE_OPERATION_ALREADY_ACTIVE', 'Another Restore operation is active.')
    );
  }

  if (blockers.length) {
    record('restore_engine_invocation', 'not_started', 'RESTORE_PRODUCTION_EXECUTION_BLOCKED');
    const result = freeze({
      ok: false,
      code: 'RESTORE_PRODUCTION_EXECUTION_BLOCKED',
      restoreExecuted: false,
      noDataCommitted: true,
      productionRestoreRoutePresent: true,
      productionFeatureFlagEnabled: PRODUCTION_RESTORE_FEATURE_ENABLED,
      productionActivationAvailable: activation.productionActivationAvailable,
      restoreExecutionAvailable: false,
      auditCorrelationId,
      blockers,
      blockerCodes: blockers.map((item) => item.code),
      steps: summarizeSteps(steps),
      databaseIdentity,
      recoveryState,
      productionActivation: activation,
      message: 'Production Restore execution is blocked by governance and safety checks.',
    });
    await deps.activityRepository
      .createActivityLog({
        userId: null,
        action: 'backup.restore.production_execution',
        status: 'blocked',
        message: result.message,
        metadata: {
          auditCorrelationId,
          code: result.code,
          blockerCodes: result.blockerCodes,
          restoreExecuted: false,
          noDataCommitted: true,
          productionFeatureFlagEnabled: PRODUCTION_RESTORE_FEATURE_ENABLED,
        },
      })
      .catch(() => {});
    return result;
  }

  record('maintenance_operation_lock', 'passed');
  if (!deps.restoreEngine || !deps.postRestoreValidator) {
    record('restore_engine_invocation', 'blocked', 'RESTORE_ENGINE_BOUNDARY_UNAVAILABLE');
    return freeze({
      ok: false,
      code: 'RESTORE_ENGINE_BOUNDARY_UNAVAILABLE',
      restoreExecuted: false,
      noDataCommitted: true,
      restoreExecutionAvailable: false,
      steps: summarizeSteps(steps),
      message: 'Production Restore engine boundary is unavailable.',
    });
  }

  const execution = await deps.restoreEngine({ request, databaseIdentity, recoveryState });
  record('restore_engine_invocation', execution?.ok ? 'passed' : 'failed');
  const validation = execution?.ok
    ? await deps.postRestoreValidator({ request, databaseIdentity, execution })
    : null;
  record('post_restore_validation', validation?.ok ? 'passed' : 'failed');
  if (validation?.ok && deps.restartAdapter?.requestRestart) {
    await deps.restartAdapter.requestRestart({ auditCorrelationId });
  }
  return freeze({
    ok: validation?.ok === true,
    code: validation?.ok ? 'RESTORE_PRODUCTION_RESTART_REQUIRED' : 'RESTORE_EXECUTION_FAILED',
    restoreExecuted: execution?.ok === true,
    restartRequired: validation?.ok === true,
    steps: summarizeSteps(steps),
    message: validation?.ok
      ? 'Restore completed and application restart is required.'
      : 'Restore execution failed or post-restore validation failed.',
  });
}

module.exports = {
  ACTIVATION_RECORD_PATH,
  PRODUCTION_RESTORE_FEATURE_ENABLED,
  PRODUCTION_RESTORE_ROUTE_PRESENT,
  executeProductionRestore,
  normalizeProductionRestoreRequest,
};
