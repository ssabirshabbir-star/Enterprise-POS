const crypto = require('crypto');
const recoveryModel = require('./restore-recovery-state.model');

const RESTORE_ACTIVATION_SCHEMA_VERSION = 1;
const RESTORE_ACTIVATION_SCOPE = 'enterprise-pos-restore-production';
const RESTORE_COMPONENT = 'restore';
const RESTORE_PRODUCT = 'Enterprise POS';
const REQUIRED_BACKUP_FORMAT_VERSION = '1.0';
const REQUIRED_SAFETY_BACKUP_POLICY = 'mandatory_verified_pre_restore_backup';

const APPROVED_RESTORE_STRATEGIES = Object.freeze([
  'transactional_in_place_with_verified_safety_backup',
]);

const REQUIRED_CERTIFICATION_EVIDENCE = Object.freeze([
  'backup_format_compatibility',
  'package_verification',
  'authorization_and_confirmation',
  'safety_backup',
  'maintenance_mutation_lock',
  'disposable_database_success',
  'failure_matrix',
  'rollback',
  'startup_recovery',
  'post_restore_validation',
  'sequence_identity_recovery',
  'restart_reconnect',
  'native_file_dialog',
  'restore_history_audit',
  'secret_redaction',
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
  return crypto
    .createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex');
}

function reason(code, message, details = {}) {
  return freeze({ code, message, details });
}

function isIsoDate(value) {
  const date = new Date(String(value || ''));
  return Boolean(value) && !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isFutureIso(value, now) {
  if (!isIsoDate(value)) return false;
  return new Date(value).getTime() > now.getTime();
}

function evidenceStatus(record, key) {
  return record?.technicalCertification?.[key]?.status || null;
}

function createPendingActivationRecord({
  applicationVersion = null,
  schemaVersion = null,
  evidenceRoot = null,
} = {}) {
  return freeze({
    schemaVersion: RESTORE_ACTIVATION_SCHEMA_VERSION,
    product: RESTORE_PRODUCT,
    component: RESTORE_COMPONENT,
    releaseScope: RESTORE_ACTIVATION_SCOPE,
    applicationVersion,
    databaseSchemaVersion: schemaVersion,
    backupFormatVersion: REQUIRED_BACKUP_FORMAT_VERSION,
    activationStatus: 'pending',
    restoreStrategy: null,
    safetyBackupPolicy: REQUIRED_SAFETY_BACKUP_POLICY,
    technicalCertification: Object.fromEntries(
      REQUIRED_CERTIFICATION_EVIDENCE.map((key) => [
        key,
        { status: 'pending', evidenceReference: evidenceRoot || null, evidenceHash: null },
      ])
    ),
    authorization: {
      governanceReviewStatus: 'pending',
      securityReviewStatus: 'pending',
      releaseApprovalStatus: 'pending',
      approverIdentity: 'UNRESOLVED',
      approvalAuthority: 'UNRESOLVED',
      approvalTimestamp: null,
      expiresAt: '1970-01-01T00:00:00.000Z',
      revoked: false,
      testOnly: false,
    },
    notes: [
      'This template is intentionally non-authorizing.',
      'Production Restore remains disabled until authentic approval replaces every pending field.',
    ],
  });
}

function assessRestoreProductionActivation({
  record = null,
  currentApplicationVersion = null,
  currentSchemaVersion = null,
  currentBackupFormatVersion = REQUIRED_BACKUP_FORMAT_VERSION,
  productionFeatureFlagEnabled = false,
  productionExecutionRoutePresent = false,
  recoveryState = null,
  operationLock = null,
  databaseIdentity = null,
  now = new Date(),
} = {}) {
  const blockers = [];

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    blockers.push(
      reason(
        'activation_record.missing',
        'Restore production activation requires an authentic activation record.'
      )
    );
  } else {
    if (record.schemaVersion !== RESTORE_ACTIVATION_SCHEMA_VERSION) {
      blockers.push(
        reason('activation_record.schema_version', 'Unknown activation schema version.')
      );
    }
    if (record.product !== RESTORE_PRODUCT) {
      blockers.push(reason('activation_record.product', 'Activation record product mismatch.'));
    }
    if (record.component !== RESTORE_COMPONENT) {
      blockers.push(reason('activation_record.component', 'Activation record component mismatch.'));
    }
    if (record.releaseScope !== RESTORE_ACTIVATION_SCOPE) {
      blockers.push(reason('activation_record.scope', 'Activation record release scope mismatch.'));
    }
    if (record.activationStatus !== 'approved') {
      blockers.push(
        reason('activation_record.not_approved', 'Restore activation status is not approved.')
      );
    }
    if (
      currentApplicationVersion &&
      record.applicationVersion &&
      record.applicationVersion !== currentApplicationVersion
    ) {
      blockers.push(
        reason('activation_record.application_version', 'Application version mismatch.')
      );
    }
    if (
      currentSchemaVersion &&
      record.databaseSchemaVersion &&
      record.databaseSchemaVersion !== currentSchemaVersion
    ) {
      blockers.push(reason('activation_record.schema', 'Database schema version mismatch.'));
    }
    if (
      record.backupFormatVersion !== currentBackupFormatVersion ||
      record.backupFormatVersion !== REQUIRED_BACKUP_FORMAT_VERSION
    ) {
      blockers.push(
        reason('activation_record.backup_format', 'Backup format version is not approved.')
      );
    }
    if (!APPROVED_RESTORE_STRATEGIES.includes(record.restoreStrategy)) {
      blockers.push(
        reason('activation_record.restore_strategy', 'Restore strategy is not approved.')
      );
    }
    if (record.safetyBackupPolicy !== REQUIRED_SAFETY_BACKUP_POLICY) {
      blockers.push(
        reason('activation_record.safety_backup_policy', 'Safety-backup policy is not approved.')
      );
    }

    REQUIRED_CERTIFICATION_EVIDENCE.forEach((key) => {
      const status = evidenceStatus(record, key);
      const evidenceHash = record.technicalCertification?.[key]?.evidenceHash || null;
      if (status !== 'passed') {
        blockers.push(
          reason(`technical_certification.${key}`, `${key} certification evidence has not passed.`)
        );
      }
      if (!/^[a-f0-9]{64}$/i.test(String(evidenceHash || ''))) {
        blockers.push(
          reason(
            `technical_certification.${key}.evidence_hash`,
            `${key} evidence hash is missing or invalid.`
          )
        );
      }
    });

    const auth = record.authorization || {};
    const legacyReleaseApproval =
      auth.governanceReviewStatus === 'approved' &&
      auth.securityReviewStatus === 'approved' &&
      auth.releaseApprovalStatus === 'approved';
    const scopedRestoreApproval =
      auth.ownerRestoreScopeApprovalStatus === 'approved' &&
      auth.technicalRestoreActivationStatus === 'approved';
    if (!legacyReleaseApproval && !scopedRestoreApproval) {
      blockers.push(
        reason(
          'authorization.restore_scope_approval',
          'Scoped Restore activation approval is not approved.'
        )
      );
    }
    if (!auth.approverIdentity || auth.approverIdentity === 'UNRESOLVED') {
      blockers.push(reason('authorization.approver', 'Approver identity is unresolved.'));
    }
    if (!auth.approvalAuthority || auth.approvalAuthority === 'UNRESOLVED') {
      blockers.push(reason('authorization.authority', 'Approval authority is unresolved.'));
    }
    if (!isIsoDate(auth.approvalTimestamp)) {
      blockers.push(reason('authorization.timestamp', 'Approval timestamp is missing or invalid.'));
    }
    if (!isFutureIso(auth.expiresAt, now)) {
      blockers.push(reason('authorization.expired', 'Restore activation approval is expired.'));
    }
    if (auth.revoked === true) {
      blockers.push(reason('authorization.revoked', 'Restore activation approval is revoked.'));
    }
    if (auth.testOnly === true) {
      blockers.push(
        reason(
          'authorization.test_only',
          'Test-only activation evidence cannot authorize production.'
        )
      );
    }
  }

  if (productionFeatureFlagEnabled !== true) {
    blockers.push(
      reason('production_feature_flag.disabled', 'Production Restore feature flag is disabled.')
    );
  }
  if (productionExecutionRoutePresent !== true) {
    blockers.push(
      reason('production_execution_route.absent', 'Production Restore execution route is absent.')
    );
  }
  const safetyBackupReadyState =
    recoveryState?.currentState === recoveryModel.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED;
  if (recoveryState?.unresolvedRecoveryState === true && !safetyBackupReadyState) {
    blockers.push(
      reason('recovery_state.unresolved', 'Unresolved Restore recovery state blocks activation.')
    );
  }
  if (operationLock?.locked === true) {
    blockers.push(reason('operation_lock.active', 'Active Restore operation blocks activation.'));
  }
  if (databaseIdentity?.ambiguous === true) {
    blockers.push(
      reason(
        'database_identity.ambiguous',
        'Database identity is ambiguous for production Restore.'
      )
    );
  }
  if (databaseIdentity?.disposableCertificationDatabase === true) {
    blockers.push(
      reason(
        'database_identity.disposable',
        'Disposable certification database cannot authorize production Restore.'
      )
    );
  }

  const recordDigest = record ? sha256(stableStringify(record)) : null;
  return freeze({
    assessmentType: 'restore_production_activation_assessment',
    schemaVersion: RESTORE_ACTIVATION_SCHEMA_VERSION,
    releaseScope: RESTORE_ACTIVATION_SCOPE,
    activationAuthorized: blockers.length === 0,
    productionActivationAvailable: blockers.length === 0,
    restoreExecutionAvailable: blockers.length === 0,
    productionExecutionRoutePresent: productionExecutionRoutePresent === true,
    productionFeatureFlagEnabled: productionFeatureFlagEnabled === true,
    blockers,
    blockerCodes: blockers.map((item) => item.code),
    requiredCertificationEvidence: [...REQUIRED_CERTIFICATION_EVIDENCE],
    approvedRestoreStrategies: [...APPROVED_RESTORE_STRATEGIES],
    recordDigest,
    evaluatedAt: now.toISOString(),
    message: blockers.length
      ? 'Production Restore activation is blocked.'
      : 'Production Restore activation evidence is complete and the guarded execution route is available.',
  });
}

module.exports = {
  APPROVED_RESTORE_STRATEGIES,
  REQUIRED_BACKUP_FORMAT_VERSION,
  REQUIRED_CERTIFICATION_EVIDENCE,
  REQUIRED_SAFETY_BACKUP_POLICY,
  RESTORE_ACTIVATION_SCHEMA_VERSION,
  RESTORE_ACTIVATION_SCOPE,
  RESTORE_COMPONENT,
  RESTORE_PRODUCT,
  assessRestoreProductionActivation,
  createPendingActivationRecord,
};
