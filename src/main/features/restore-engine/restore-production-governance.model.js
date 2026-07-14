const crypto = require('crypto');
const path = require('path');
const { getDatabaseConfig } = require('../../config/env');
const recoveryModel = require('./restore-recovery-state.model');

const FINAL_CONFIRMATION_PHRASE = 'RESTORE DATABASE';
const FINAL_CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const RETENTION_DAYS = 30;

const DANGEROUS_STARTUP_STATES = Object.freeze([
  recoveryModel.RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS,
  recoveryModel.RESTORE_RECOVERY_STATES.RESTORE_APPLIED,
  recoveryModel.RESTORE_RECOVERY_STATES.POST_RESTORE_VERIFYING,
  recoveryModel.RESTORE_RECOVERY_STATES.FAILED_ROLLBACK_REQUIRED,
  recoveryModel.RESTORE_RECOVERY_STATES.ROLLBACK_IN_PROGRESS,
  recoveryModel.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
]);

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function resolveDatabaseIdentity(config = getDatabaseConfig()) {
  let host = config.host || 'localhost';
  let port = Number(config.port || 5432);
  let database = config.database || null;
  let source = 'pg_env';

  if (config.connectionString) {
    const url = new URL(config.connectionString);
    host = url.hostname || host;
    port = Number(url.port || port || 5432);
    database = decodeURIComponent((url.pathname || '').replace(/^\//, ''));
    source = 'database_url';
  }

  const ambiguous = !database || /enterprise_pos_restore_cert_/i.test(database);
  const identity = {
    host: String(host || '').toLowerCase(),
    port,
    database: String(database || ''),
    schema: 'public',
    source,
    credentialsExcluded: true,
    ambiguous,
    disposableCertificationDatabase: /enterprise_pos_restore_cert_/i.test(String(database || '')),
  };
  return freeze({
    ...identity,
    fingerprint: sha256(stableStringify(identity)),
  });
}

function createPolicyDigest(policy = {}) {
  return sha256(
    stableStringify({
      executionEligible: policy.executionEligible === true,
      executionCertified: policy.executionCertified === true,
      restoreExecutionAvailable: policy.restoreExecutionAvailable === true,
      safetyBackupVerified: policy.safetyBackupVerified === true,
      blockers: (policy.blockers || []).map((item) => item.code || item.message || item),
      recoveryState: {
        operationId: policy.recoveryState?.operationId || null,
        currentState: policy.recoveryState?.currentState || null,
      },
    })
  );
}

function validateConfirmationPhrase(value) {
  return String(value || '').trim() === FINAL_CONFIRMATION_PHRASE;
}

function createConfirmationRecord({
  operationId,
  ownerUserId,
  sourcePackageChecksum,
  sourceManifestVersion,
  sourceDatabaseIdentity = null,
  safetyBackupChecksum,
  databaseIdentity = resolveDatabaseIdentity(),
  preflightDigest,
  executionPolicyDigest,
  recoveryState,
  typedPhrase,
  now = new Date(),
  ttlMs = FINAL_CONFIRMATION_TTL_MS,
} = {}) {
  const blockers = [];
  if (!operationId) blockers.push('operation_id_required');
  if (!ownerUserId) blockers.push('owner_required');
  if (!sourcePackageChecksum) blockers.push('source_package_checksum_required');
  if (!safetyBackupChecksum) blockers.push('safety_backup_checksum_required');
  if (!databaseIdentity?.fingerprint) blockers.push('database_identity_required');
  if (databaseIdentity.ambiguous) blockers.push('database_identity_ambiguous');
  if (databaseIdentity.disposableCertificationDatabase) {
    blockers.push('production_database_must_not_be_disposable');
  }
  if (!preflightDigest) blockers.push('preflight_digest_required');
  if (!executionPolicyDigest) blockers.push('execution_policy_digest_required');
  if (recoveryState !== recoveryModel.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED) {
    blockers.push('safety_backup_verified_state_required');
  }
  if (!validateConfirmationPhrase(typedPhrase)) blockers.push('typed_phrase_mismatch');

  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const confirmationId = crypto.randomUUID();
  const binding = {
    confirmationId,
    operationId,
    ownerUserId,
    sourcePackageChecksum,
    sourceManifestVersion: sourceManifestVersion || null,
    sourceDatabaseIdentity: sourceDatabaseIdentity || null,
    safetyBackupChecksum,
    databaseFingerprint: databaseIdentity.fingerprint,
    preflightDigest,
    executionPolicyDigest,
    recoveryState,
    issuedAt,
    expiresAt,
  };

  return freeze({
    ok: blockers.length === 0,
    blockers,
    confirmationId,
    confirmationHash: sha256(stableStringify(binding)),
    issuedAt,
    expiresAt,
    databaseIdentity,
    binding,
    executionEligible: false,
    executionCertified: false,
    restoreExecutionAvailable: false,
  });
}

function assessStartupRecovery(recoveryState = {}) {
  const state = recoveryModel.normalizeRecoveryState(recoveryState);
  const dangerous = DANGEROUS_STARTUP_STATES.includes(state.currentState);
  const preparationPending =
    state.currentState === recoveryModel.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED;
  return freeze({
    startupAllowed: !dangerous,
    maintenanceModeRequired: dangerous,
    recoveryScreenRequired: dangerous || preparationPending,
    databaseMutationsBlocked: dangerous,
    currentState: state.currentState,
    operationId: state.operationId,
    message: dangerous
      ? 'Restore recovery state requires maintenance lockout before normal POS startup.'
      : preparationPending
        ? 'Restore safety preparation is pending; normal startup may continue with Restore execution unavailable.'
        : 'No dangerous Restore recovery state blocks startup.',
  });
}

function classifyRetention({ recoveryState = {}, artifactPath = '', now = new Date() } = {}) {
  const state = recoveryModel.normalizeRecoveryState(recoveryState);
  const normalizedPath = path.resolve(String(artifactPath || state.safetyBackupReference?.filePath || ''));
  const lowerPath = normalizedPath.toLowerCase();
  const testOnly =
    lowerPath.includes(`${path.sep.toLowerCase()}temp${path.sep.toLowerCase()}`) ||
    lowerPath.includes('epos-restore-prep-cert') ||
    lowerPath.includes('enterprise_pos_restore_cert');
  const terminal = recoveryModel.TERMINAL_STATES.includes(state.currentState);
  const dangerous =
    state.currentState === recoveryModel.RESTORE_RECOVERY_STATES.FAILED_ROLLBACK_REQUIRED ||
    state.currentState === recoveryModel.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED ||
    state.currentState === recoveryModel.RESTORE_RECOVERY_STATES.ROLLBACK_IN_PROGRESS;
  const createdAt = state.createdAt ? new Date(state.createdAt) : null;
  const ageDays =
    createdAt && !Number.isNaN(createdAt.getTime())
      ? Math.floor((now.getTime() - createdAt.getTime()) / 86400000)
      : null;
  const eligible =
    terminal &&
    testOnly &&
    !dangerous &&
    [recoveryModel.RESTORE_RECOVERY_STATES.CANCELLED, recoveryModel.RESTORE_RECOVERY_STATES.ROLLED_BACK].includes(
      state.currentState
    );

  return freeze({
    artifactPath: normalizedPath,
    testOnly,
    terminal,
    dangerous,
    ageDays,
    retentionDays: RETENTION_DAYS,
    cleanupEligible: eligible,
    dryRunRequired: true,
    deleteOnlyInsideApprovedRecoveryRoot: true,
    reason: eligible
      ? 'Terminal test-only recovery artifact is eligible for explicit bounded cleanup.'
      : 'Recovery artifact must be retained until a stricter cleanup policy or manual review applies.',
  });
}

function createFinalCertificationAssessment({
  packageValid = false,
  packageCompatible = false,
  authorizationValid = false,
  databaseIdentityValid = false,
  databaseHealthy = false,
  safetyBackupVerified = false,
  operationLockValid = false,
  finalConfirmationValid = false,
  restartBoundaryCertified = false,
  sessionInvalidationCertified = false,
  recoveryStartupCertified = false,
  rollbackCertified = false,
  retentionPolicyCertified = false,
} = {}) {
  const checks = {
    packageValid,
    packageCompatible,
    authorizationValid,
    databaseIdentityValid,
    databaseHealthy,
    safetyBackupVerified,
    operationLockValid,
    finalConfirmationValid,
    restartBoundaryCertified,
    sessionInvalidationCertified,
    recoveryStartupCertified,
    rollbackCertified,
    retentionPolicyCertified,
  };
  const blockers = Object.entries(checks)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => `${name}.required`);
  return freeze({
    ...checks,
    executionEligible: false,
    executionCertified: false,
    restoreExecutionAvailable: false,
    blockers,
    warnings: ['Production Restore execution remains unavailable until all checks pass and activation is approved.'],
    requiredActions: blockers.map((code) => ({ code, message: `Satisfy ${code}.` })),
  });
}

module.exports = {
  DANGEROUS_STARTUP_STATES,
  FINAL_CONFIRMATION_PHRASE,
  FINAL_CONFIRMATION_TTL_MS,
  createConfirmationRecord,
  createFinalCertificationAssessment,
  createPolicyDigest,
  classifyRetention,
  resolveDatabaseIdentity,
  sha256,
  stableStringify,
  assessStartupRecovery,
  validateConfirmationPhrase,
};
