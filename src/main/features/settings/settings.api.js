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
    createBackup,
    dryRunCertificationReport,
    getDryRunCertificationReport,
    getSettings,
    inspectRestorePackage,
    listDryRunCertificationReports,
    listBackups,
    restoreExecutionPolicy,
    restoreEngineFoundationAssessment,
    restoreGovernanceAssessment,
    restoreRecoveryState,
    restoreReadinessDashboard,
    restoreTransactionFoundationAssessment,
    unavailable,
    verifyRestorePackage,
  };
})();
