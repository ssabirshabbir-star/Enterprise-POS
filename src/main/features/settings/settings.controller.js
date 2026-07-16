const path = require('path');
const { app, dialog, BrowserWindow } = require('electron');
const settingsService = require('./settings.service');
const { logError } = require('../../utils/safe-logger');

function safeError(error, label) {
  logError(label, error);
  return { ok: false, message: 'Settings request failed. Please try again.' };
}

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function defaultBackupName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `enterprise-pos-backup-${stamp}.json`;
}

function registerSettingsRoutes(ipcMain) {
  ipcMain.handle('/settings/get', async () => {
    try {
      return await settingsService.getSettings();
    } catch (error) {
      return safeError(error, 'Settings get error:');
    }
  });

  ipcMain.handle('/settings/save', async (_event, payload) => {
    try {
      return await settingsService.saveSettings(payload || {});
    } catch (error) {
      return safeError(error, 'Settings save error:');
    }
  });

  ipcMain.handle('/settings/store/save', async (_event, payload) => {
    try {
      return await settingsService.saveStoreSettings(payload || {});
    } catch (error) {
      return safeError(error, 'Store settings save error:');
    }
  });

  ipcMain.handle('/settings/backups/list', async (_event, filters) => {
    try {
      return await settingsService.listBackups(filters || {});
    } catch (error) {
      return safeError(error, 'Backup list error:');
    }
  });

  ipcMain.handle('/settings/backups/create', async (event) => {
    try {
      const result = await dialog.showSaveDialog(windowFromEvent(event), {
        title: 'Save POS Backup',
        defaultPath: path.join(app.getPath('documents'), defaultBackupName()),
        filters: [{ name: 'Enterprise POS Backup', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return { ok: false, message: 'Backup cancelled.' };
      return await settingsService.createBackup(result.filePath);
    } catch (error) {
      return safeError(error, 'Backup create error:');
    }
  });

  ipcMain.handle('/settings/backups/preflight', async (event) => {
    try {
      const result = await dialog.showSaveDialog(windowFromEvent(event), {
        title: 'Assess Backup Destination',
        defaultPath: path.join(app.getPath('documents'), defaultBackupName()),
        buttonLabel: 'Assess Destination',
        filters: [{ name: 'Enterprise POS Backup', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) {
        return {
          ok: false,
          preflightStatus: 'cancelled',
          message: 'Backup preflight cancelled.',
        };
      }
      return await settingsService.assessBackupPreflight(result.filePath);
    } catch (error) {
      return safeError(error, 'Backup preflight error:');
    }
  });

  ipcMain.handle('/settings/backups/inspect-restore-package', async (event) => {
    try {
      const result = await dialog.showOpenDialog(windowFromEvent(event), {
        title: 'Inspect Certified Backup Package',
        properties: ['openFile'],
        filters: [{ name: 'Enterprise POS Backup', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePaths[0]) {
        return {
          ok: false,
          status: 'package_unreadable',
          message: 'Package inspection cancelled.',
        };
      }
      return await settingsService.inspectRestorePackage(result.filePaths[0]);
    } catch (error) {
      return safeError(error, 'Backup package inspection error:');
    }
  });

  ipcMain.handle('/settings/backups/verify-restore-package', async (event) => {
    try {
      const result = await dialog.showOpenDialog(windowFromEvent(event), {
        title: 'Verify Certified Backup Package',
        properties: ['openFile'],
        filters: [{ name: 'Enterprise POS Backup', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePaths[0]) {
        return {
          ok: false,
          verificationStatus: 'failed',
          restoreEligible: false,
          message: 'Package verification cancelled. Restore remains unavailable.',
        };
      }
      return await settingsService.verifyRestorePackage(result.filePaths[0]);
    } catch (error) {
      return safeError(error, 'Backup package verification error:');
    }
  });

  ipcMain.handle('/settings/backups/assess-restore-eligibility', async (event) => {
    try {
      const result = await dialog.showOpenDialog(windowFromEvent(event), {
        title: 'Assess Restore Eligibility',
        properties: ['openFile'],
        filters: [{ name: 'Enterprise POS Backup', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePaths[0]) {
        return {
          ok: false,
          eligibilityStatus: 'blocked',
          restoreEligible: false,
          message: 'Eligibility assessment cancelled. Restore remains unavailable.',
          passedConditions: [],
          failedConditions: [],
          blockingReasons: ['No backup package was selected.'],
          warnings: [],
        };
      }
      return await settingsService.assessRestoreEligibility(result.filePaths[0]);
    } catch (error) {
      return safeError(error, 'Restore eligibility assessment error:');
    }
  });

  ipcMain.handle('/settings/backups/assess-restore-authorization', async (event, payload = {}) => {
    try {
      const acknowledgementText = payload.acknowledgementText || '';
      if (!acknowledgementText) {
        return await settingsService.assessRestoreAuthorization(null, acknowledgementText);
      }
      const result = await dialog.showOpenDialog(windowFromEvent(event), {
        title: 'Assess Restore Authorization',
        properties: ['openFile'],
        filters: [{ name: 'Enterprise POS Backup', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePaths[0]) {
        return await settingsService.assessRestoreAuthorization(null, acknowledgementText);
      }
      return await settingsService.assessRestoreAuthorization(
        result.filePaths[0],
        acknowledgementText
      );
    } catch (error) {
      return safeError(error, 'Restore authorization assessment error:');
    }
  });

  ipcMain.handle('/settings/backups/dry-run-certification-report', async (event, payload = {}) => {
    try {
      const acknowledgementText = payload.acknowledgementText || '';
      if (!acknowledgementText) {
        return await settingsService.generateRestoreDryRunCertificationReport(
          null,
          acknowledgementText
        );
      }
      const result = await dialog.showOpenDialog(windowFromEvent(event), {
        title: 'Generate Restore Dry-Run Certification Report',
        properties: ['openFile'],
        filters: [{ name: 'Enterprise POS Backup', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePaths[0]) {
        return await settingsService.generateRestoreDryRunCertificationReport(
          null,
          acknowledgementText
        );
      }
      return await settingsService.generateRestoreDryRunCertificationReport(
        result.filePaths[0],
        acknowledgementText
      );
    } catch (error) {
      return safeError(error, 'Restore dry-run certification report error:');
    }
  });

  ipcMain.handle(
    '/settings/backups/dry-run-certification-reports/list',
    async (_event, filters) => {
      try {
        return await settingsService.listRestoreDryRunReports(filters || {});
      } catch (error) {
        return safeError(error, 'Restore dry-run certification report history error:');
      }
    }
  );

  ipcMain.handle('/settings/backups/dry-run-certification-reports/get', async (_event, id) => {
    try {
      return await settingsService.getRestoreDryRunReport(id);
    } catch (error) {
      return safeError(error, 'Restore dry-run certification report detail error:');
    }
  });

  ipcMain.handle('/settings/backups/restore-readiness-dashboard', async () => {
    try {
      return await settingsService.getRestoreReadinessDashboard();
    } catch (error) {
      return safeError(error, 'Restore readiness dashboard error:');
    }
  });

  ipcMain.handle('/settings/backups/restore-governance-assessment', async () => {
    try {
      return await settingsService.getRestoreGovernanceAssessment();
    } catch (error) {
      return safeError(error, 'Restore governance assessment error:');
    }
  });

  ipcMain.handle('/settings/backups/restore-recovery-state', async () => {
    try {
      return await settingsService.getRestoreRecoveryState();
    } catch (error) {
      return safeError(error, 'Restore recovery state error:');
    }
  });

  ipcMain.handle('/settings/backups/restore-execution-policy', async () => {
    try {
      return await settingsService.getRestoreExecutionPolicy();
    } catch (error) {
      return safeError(error, 'Restore execution policy error:');
    }
  });

  ipcMain.handle('/settings/backups/restore-startup-recovery', async () => {
    try {
      return await settingsService.getRestoreStartupRecoveryAssessment();
    } catch (error) {
      return safeError(error, 'Restore startup recovery assessment error:');
    }
  });

  ipcMain.handle('/settings/backups/restore-retention-assessment', async (_event, payload = {}) => {
    try {
      return await settingsService.getRestoreRetentionAssessment(payload.artifactPath || null);
    } catch (error) {
      return safeError(error, 'Restore retention assessment error:');
    }
  });

  ipcMain.handle('/settings/backups/restore-final-confirmation', async (_event, payload = {}) => {
    try {
      return await settingsService.createRestoreFinalConfirmation({
        operationId: payload.operationId || null,
        typedPhrase: payload.typedPhrase || '',
        preflightDigest: payload.preflightDigest || null,
        executionPolicyDigest: payload.executionPolicyDigest || null,
      });
    } catch (error) {
      return safeError(error, 'Restore final confirmation error:');
    }
  });

  ipcMain.handle('/settings/backups/prepare-restore-safety-backup', async (event) => {
    try {
      const result = await dialog.showOpenDialog(windowFromEvent(event), {
        title: 'Prepare Restore Safety Backup',
        properties: ['openFile'],
        filters: [{ name: 'Enterprise POS Backup', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePaths[0]) {
        return {
          ok: false,
          preparationStarted: false,
          noRestoreExecuted: true,
          restoreExecutionAvailable: false,
          message: 'Restore safety preparation cancelled. No safety backup was created.',
        };
      }
      return await settingsService.prepareRestoreSafetyBackup(result.filePaths[0], {
        recoveryRoot: app.getPath('userData'),
      });
    } catch (error) {
      return safeError(error, 'Restore safety backup preparation error:');
    }
  });

  ipcMain.handle('/settings/backups/cancel-restore-preparation', async (_event, payload = {}) => {
    try {
      return await settingsService.cancelRestorePreparation(payload.operationId || null);
    } catch (error) {
      return safeError(error, 'Restore preparation cancellation error:');
    }
  });

  ipcMain.handle('/settings/backups/restore-engine-foundation-assessment', async () => {
    try {
      return await settingsService.assessControlledRestoreEngineFoundation();
    } catch (error) {
      return safeError(error, 'Restore engine foundation assessment error:');
    }
  });

  ipcMain.handle('/settings/backups/restore-transaction-foundation-assessment', async () => {
    try {
      return await settingsService.assessRestoreTransactionFoundation();
    } catch (error) {
      return safeError(error, 'Restore transaction foundation assessment error:');
    }
  });
}

module.exports = { registerSettingsRoutes };
