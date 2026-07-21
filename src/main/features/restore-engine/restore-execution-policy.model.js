const recoveryStateModel = require('./restore-recovery-state.model');
const activationModel = require('./restore-production-activation.model');

function freeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.values(value).forEach((item) => freeze(item));
  return Object.freeze(value);
}

function blocker(code, message, details = {}) {
  return freeze({ code, message, details });
}

function warning(code, message, details = {}) {
  return freeze({ code, message, details });
}

function action(code, message) {
  return freeze({ code, message });
}

function createRestoreExecutionPolicy({
  recoveryState = recoveryStateModel.createIdleRecoveryState(),
  packageVerification = null,
  packageEligibility = null,
  authorization = null,
  databaseHealth = null,
  operationLock = null,
  productionGovernance = null,
  productionActivation = null,
} = {}) {
  const state = recoveryStateModel.normalizeRecoveryState(recoveryState);
  const blockers = [];
  const warnings = [];
  const requiredActions = [];
  const sameVerifiedSafetyOperationLock =
    operationLock?.locked === true &&
    state.currentState === recoveryStateModel.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED &&
    String(operationLock.operationId || '') === String(state.operationId || '');

  if (state.unresolvedRecoveryState && !sameVerifiedSafetyOperationLock) {
    blockers.push(
      blocker(
        'recovery_state.unresolved',
        'An unresolved Restore recovery state exists and must be resolved before execution can be considered.',
        { currentState: state.currentState, operationId: state.operationId }
      )
    );
    requiredActions.push(
      action(
        'resolve_recovery_state',
        'Resolve or formally review the active Restore recovery state.'
      )
    );
  }

  if (operationLock?.locked === true && !sameVerifiedSafetyOperationLock) {
    blockers.push(
      blocker('operation_lock.active', 'A Restore operation lock is active.', {
        operationId: operationLock.operationId || null,
        ownerUserId: operationLock.ownerUserId || null,
        currentState: operationLock.currentState || null,
      })
    );
  }

  if (state.currentState === recoveryStateModel.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED) {
    warnings.push(
      warning(
        'safety_backup.verified',
        'A pre-Restore safety backup has been verified for the active Restore operation.',
        {
          operationId: state.operationId,
          safetyBackupReference: state.safetyBackupReference || null,
        }
      )
    );
  }

  if (!packageVerification || packageVerification.verificationStatus !== 'passed') {
    blockers.push(
      blocker('package.verification_required', 'Backup package verification has not passed.')
    );
    requiredActions.push(
      action('verify_package', 'Verify the selected backup package and checksum before execution.')
    );
  }

  if (
    !packageEligibility ||
    packageEligibility.eligibilityStatus !== 'eligible_for_authorization'
  ) {
    blockers.push(
      blocker('package.eligibility_required', 'Backup package eligibility has not passed.')
    );
    requiredActions.push(
      action(
        'assess_package_eligibility',
        'Run Restore eligibility assessment for the selected package.'
      )
    );
  }

  if (!authorization || authorization.authorizationStatus !== 'authorization_assessment_passed') {
    blockers.push(
      blocker(
        'authorization.required',
        'Restore authorization assessment has not passed for execution.'
      )
    );
    requiredActions.push(
      action(
        'complete_authorization',
        'Complete Restore authorization assessment and governance approval.'
      )
    );
  }

  if (!databaseHealth || databaseHealth.status !== 'healthy') {
    blockers.push(
      blocker(
        'database.health_required',
        'Database health has not been verified for Restore execution.'
      )
    );
    requiredActions.push(
      action('verify_database_health', 'Run database health verification before Restore execution.')
    );
  }

  if (productionGovernance?.databaseIdentity?.ambiguous) {
    blockers.push(
      blocker(
        'database_identity.ambiguous',
        'Production database identity is ambiguous and cannot be used for Restore confirmation.'
      )
    );
  }
  if (productionGovernance?.databaseIdentity?.disposableCertificationDatabase) {
    blockers.push(
      blocker(
        'database_identity.disposable',
        'The configured database resolves to a disposable certification database and cannot be used for production Restore.'
      )
    );
  }
  if (
    productionGovernance?.finalConfirmationRequired &&
    productionGovernance?.finalConfirmationPresent !== true
  ) {
    blockers.push(
      blocker(
        'final_confirmation.required',
        'Durable final confirmation is required before production Restore can be considered.'
      )
    );
  }
  if (productionGovernance?.startupRecovery?.maintenanceModeRequired) {
    blockers.push(
      blocker(
        'startup_recovery.maintenance_required',
        'Startup recovery state requires maintenance lockout before normal operation.'
      )
    );
  }
  const activationOperationLock = sameVerifiedSafetyOperationLock
    ? { ...operationLock, locked: false, verifiedSafetyOperationLock: true }
    : operationLock;
  const activationAssessment =
    productionActivation ||
    activationModel.assessRestoreProductionActivation({
      recoveryState: state,
      operationLock: activationOperationLock,
      databaseIdentity: productionGovernance?.databaseIdentity || null,
      productionFeatureFlagEnabled: false,
      productionExecutionRoutePresent: true,
    });
  activationAssessment.blockers.forEach((item) => {
    blockers.push(blocker(`production_activation.${item.code}`, item.message, item.details || {}));
  });
  if (state.currentState !== recoveryStateModel.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED) {
    blockers.push(
      blocker(
        'safety_backup.required',
        'A verified pre-Restore safety backup is mandatory before any future execution.'
      )
    );
  }

  warnings.push(
    warning(
      'checksum.not_authenticity',
      'SHA-256 checksum validation proves integrity only; it does not prove package authenticity.'
    )
  );

  const packageValid = packageVerification?.verificationStatus === 'passed';
  const packageCompatible = packageEligibility?.eligibilityStatus === 'eligible_for_authorization';
  const operatorAuthorized =
    authorization?.authorizationStatus === 'authorization_assessment_passed';
  const safetyBackupVerified =
    state.currentState === recoveryStateModel.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED;
  const restoreExecutionAvailable =
    blockers.length === 0 &&
    activationAssessment.activationAuthorized === true &&
    packageValid &&
    packageCompatible &&
    operatorAuthorized &&
    databaseHealth?.status === 'healthy' &&
    safetyBackupVerified;

  return freeze({
    executionEligible: restoreExecutionAvailable,
    executionCertified: activationAssessment.activationAuthorized === true,
    restoreExecutionAvailable,
    restoreEligible: restoreExecutionAvailable,
    packageValid,
    packageCompatible,
    operatorAuthorized,
    executionPreconditionsSatisfied: restoreExecutionAvailable,
    blockers,
    warnings,
    requiredActions,
    recoveryState: state,
    safetyBackupRequired: true,
    safetyBackupVerified,
    safetyBackupReference: state.safetyBackupReference || null,
    preparationEligible:
      !state.unresolvedRecoveryState &&
      (!operationLock || operationLock.locked !== true) &&
      packageValid &&
      packageCompatible &&
      operatorAuthorized &&
      databaseHealth?.status === 'healthy',
    restartRequired: true,
    rollbackCapability:
      activationAssessment.activationAuthorized === true ? 'certified' : 'not_certified',
    packageCompatibility: packageEligibility?.eligibilityStatus || 'not_assessed',
    databaseHealth: databaseHealth?.status || 'not_verified',
    authorizationStatus: authorization?.authorizationStatus || 'not_assessed',
    operationLockStatus: sameVerifiedSafetyOperationLock
      ? 'locked_for_verified_restore_operation'
      : operationLock?.locked
        ? 'locked'
        : 'available',
    operationLock: operationLock || { locked: false },
    productionGovernance: productionGovernance || null,
    productionActivation: activationAssessment,
    databaseIdentity: productionGovernance?.databaseIdentity || null,
    startupRecovery: productionGovernance?.startupRecovery || null,
    finalCertificationAssessment: productionGovernance?.finalCertificationAssessment || null,
    noRestoreExecuted: true,
    readOnly: !restoreExecutionAvailable,
    message: restoreExecutionAvailable
      ? 'Restore execution is available for the verified package and active safety-backed operation.'
      : 'Restore execution remains unavailable until package verification, authorization, database health, safety backup, activation, and recovery-state checks all pass.',
  });
}

module.exports = {
  createRestoreExecutionPolicy,
};
