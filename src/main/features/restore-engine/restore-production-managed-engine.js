const { getPool } = require('../../database/connection');
const settingsRepository = require('../settings/settings.repository');
const recoveryModel = require('./restore-recovery-state.model');
const restoreAdapter = require('./restore-disposable-execution.adapter');

function sanitizeError(error) {
  return recoveryModel.sanitizeFailureSummary(error && error.message ? error.message : error);
}

async function executeManagedProductionRestore({
  request = {},
  databaseIdentity,
  recoveryState,
  repository = settingsRepository,
  pool = getPool(),
  restartAdapter = null,
  sessionAdapter = null,
  injectFailureStage = null,
} = {}) {
  const operationId = request.operationId;
  const ownerUserId = recoveryState?.ownerUserId;
  const targetDatabaseReference = databaseIdentity;
  const databaseManagedIdentity = await repository.getManagedDatabaseIdentity();

  if (!databaseManagedIdentity) {
    throw new Error('MANAGED_DATABASE_IDENTITY_MISSING');
  }
  if (recoveryState?.operationId !== operationId) {
    throw new Error('RESTORE_OPERATION_MISMATCH');
  }
  if (
    recoveryState?.currentState !== recoveryModel.RESTORE_RECOVERY_STATES.SAFETY_BACKUP_VERIFIED
  ) {
    throw new Error('RESTORE_OPERATION_NOT_READY');
  }
  if (!recoveryState?.safetyBackupReference?.filePath) {
    throw new Error('RESTORE_SAFETY_BACKUP_REQUIRED');
  }

  const sourcePackage = await restoreAdapter.readCertifiedPackage(request.sourcePackagePath);
  const safetyPackage = await restoreAdapter.readCertifiedPackage(
    recoveryState.safetyBackupReference.filePath
  );
  if (safetyPackage.checksum !== recoveryState.safetyBackupReference.checksum) {
    throw new Error('RESTORE_SAFETY_BACKUP_CHECKSUM_MISMATCH');
  }

  const confirmation = await repository.consumeRestoreFinalConfirmation({
    operationId,
    confirmationId: request.confirmationId,
    ownerUserId,
    targetDatabaseReference,
  });
  if (!confirmation.ok) {
    throw new Error(confirmation.code || 'RESTORE_CONFIRMATION_REQUIRED');
  }

  await repository.transitionRestoreOperation({
    operationId,
    requestedByUserId: ownerUserId,
    nextState: recoveryModel.RESTORE_RECOVERY_STATES.RESTORE_IN_PROGRESS,
    targetDatabaseReference,
  });

  try {
    const result = await restoreAdapter.applyPackageToPoolAndVerify({
      pool,
      backup: sourcePackage.backup,
      injectFailureStage,
      managedDatabaseIdentity: databaseManagedIdentity,
    });
    await repository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.RESTORE_APPLIED,
      targetDatabaseReference,
    });
    await repository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.POST_RESTORE_VERIFYING,
      targetDatabaseReference,
    });
    const identityValidation =
      await repository.validateManagedDatabaseIdentity(databaseManagedIdentity);
    if (!identityValidation.ok) {
      throw new Error(identityValidation.code || 'MANAGED_DATABASE_IDENTITY_MISMATCH');
    }
    await repository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.COMPLETED,
      targetDatabaseReference,
      replayStatus: 'confirmation_consumed',
    });
    if (sessionAdapter?.invalidateAll) await sessionAdapter.invalidateAll({ operationId });
    if (restartAdapter?.requestRestart) await restartAdapter.requestRestart({ operationId });
    return {
      ok: true,
      restored: true,
      tablesRestored: result.application.tablesRestored,
      rowsRestored: result.application.rowsRestored,
      verification: result.verification,
      restartRequired: true,
      sessionInvalidationRequired: true,
    };
  } catch (error) {
    if (injectFailureStage === 'during_mutation' || /CONTROLLED_MID/.test(error.message)) {
      await repository.transitionRestoreOperation({
        operationId,
        requestedByUserId: ownerUserId,
        nextState: recoveryModel.RESTORE_RECOVERY_STATES.FAILED_RECOVERABLE,
        targetDatabaseReference,
        failureCategory: 'transaction_rolled_back',
        failureSummary: error.message,
        replayStatus: 'confirmation_consumed',
      });
      return {
        ok: false,
        restored: false,
        rolledBackByTransaction: true,
        error: sanitizeError(error),
      };
    }

    await repository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.FAILED_ROLLBACK_REQUIRED,
      targetDatabaseReference,
      failureCategory: 'post_restore_verification_failed',
      failureSummary: error.message,
      replayStatus: 'confirmation_consumed',
    });
    await repository.transitionRestoreOperation({
      operationId,
      requestedByUserId: ownerUserId,
      nextState: recoveryModel.RESTORE_RECOVERY_STATES.ROLLBACK_IN_PROGRESS,
      targetDatabaseReference,
    });
    try {
      if (injectFailureStage === 'rollback_failure') {
        throw new Error('CONTROLLED_ROLLBACK_FAILURE');
      }
      const rollback = await restoreAdapter.applyPackageToPoolAndVerify({
        pool,
        backup: safetyPackage.backup,
        managedDatabaseIdentity: databaseManagedIdentity,
      });
      await repository.transitionRestoreOperation({
        operationId,
        requestedByUserId: ownerUserId,
        nextState: recoveryModel.RESTORE_RECOVERY_STATES.ROLLED_BACK,
        targetDatabaseReference,
        replayStatus: 'confirmation_consumed',
      });
      return {
        ok: false,
        restored: false,
        rollbackApplied: true,
        rollback,
        error: sanitizeError(error),
      };
    } catch (rollbackError) {
      await repository.transitionRestoreOperation({
        operationId,
        requestedByUserId: ownerUserId,
        nextState: recoveryModel.RESTORE_RECOVERY_STATES.MANUAL_RECOVERY_REQUIRED,
        targetDatabaseReference,
        failureCategory: 'rollback_failed',
        failureSummary: rollbackError.message,
        replayStatus: 'confirmation_consumed',
      });
      return {
        ok: false,
        restored: false,
        manualRecoveryRequired: true,
        error: sanitizeError(rollbackError),
      };
    }
  }
}

module.exports = {
  executeManagedProductionRestore,
};
