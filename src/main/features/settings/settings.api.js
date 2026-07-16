(function SettingsApiModule() {
  'use strict';

  const api = () => window.posApi;

  function unavailable(featureName) {
    return {
      ok: false,
      message: `${featureName} is unavailable until Settings certification is complete.`,
    };
  }

  async function getSettings() {
    return api().settings.get();
  }

  async function saveStoreSettings(payload) {
    return api().settings.saveStore(payload || {});
  }

  async function chooseStoreLogo() {
    return api().settings.chooseStoreLogo();
  }

  async function getStoreLogoPreview() {
    return api().settings.getStoreLogoPreview();
  }

  async function appInfo() {
    return api().app.info();
  }

  async function listBackups(filters) {
    return api().settings.listBackups(filters || {});
  }

  async function assessBackupPreflight() {
    return api().settings.assessBackupPreflight();
  }

  async function createBackup() {
    return api().settings.createBackup();
  }

  async function inspectRestorePackage() {
    return api().settings.inspectRestorePackage();
  }

  async function verifyRestorePackage() {
    return api().settings.verifyRestorePackage();
  }

  async function assessRestoreEligibility() {
    return api().settings.assessRestoreEligibility();
  }

  async function assessRestoreAuthorization(acknowledgementText) {
    return api().settings.assessRestoreAuthorization({ acknowledgementText });
  }

  async function dryRunCertificationReport(acknowledgementText) {
    return api().settings.dryRunCertificationReport({ acknowledgementText });
  }

  async function listDryRunCertificationReports(filters) {
    return api().settings.listDryRunCertificationReports(filters || {});
  }

  async function getDryRunCertificationReport(id) {
    return api().settings.getDryRunCertificationReport(id);
  }

  async function restoreReadinessDashboard() {
    return api().settings.restoreReadinessDashboard();
  }

  async function restoreGovernanceAssessment() {
    return api().settings.restoreGovernanceAssessment();
  }

  async function restoreRecoveryState() {
    return api().settings.restoreRecoveryState();
  }

  async function restoreExecutionPolicy() {
    return api().settings.restoreExecutionPolicy();
  }

  async function restoreStartupRecovery() {
    return api().settings.restoreStartupRecovery();
  }

  async function restoreRetentionAssessment() {
    return api().settings.restoreRetentionAssessment({});
  }

  async function restoreFinalConfirmation(payload) {
    return api().settings.restoreFinalConfirmation(payload || {});
  }

  async function prepareRestoreSafetyBackup() {
    return api().settings.prepareRestoreSafetyBackup();
  }

  async function cancelRestorePreparation(operationId) {
    return api().settings.cancelRestorePreparation({ operationId: operationId || null });
  }

  async function restoreEngineFoundationAssessment() {
    return api().settings.restoreEngineFoundationAssessment();
  }

  async function restoreTransactionFoundationAssessment() {
    return api().settings.restoreTransactionFoundationAssessment();
  }

  window.SettingsApi = {
    assessBackupPreflight,
    assessRestoreEligibility,
    assessRestoreAuthorization,
    appInfo,
    cancelRestorePreparation,
    chooseStoreLogo,
    createBackup,
    dryRunCertificationReport,
    getDryRunCertificationReport,
    getSettings,
    getStoreLogoPreview,
    inspectRestorePackage,
    listDryRunCertificationReports,
    listBackups,
    prepareRestoreSafetyBackup,
    restoreFinalConfirmation,
    restoreExecutionPolicy,
    restoreRetentionAssessment,
    restoreStartupRecovery,
    restoreEngineFoundationAssessment,
    restoreGovernanceAssessment,
    restoreRecoveryState,
    restoreReadinessDashboard,
    restoreTransactionFoundationAssessment,
    saveStoreSettings,
    unavailable,
    verifyRestorePackage,
  };
})();
