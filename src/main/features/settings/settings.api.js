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

  async function listBackups() {
    return api().settings.listBackups();
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

  window.SettingsApi = {
    assessRestoreEligibility,
    assessRestoreAuthorization,
    appInfo,
    createBackup,
    getSettings,
    inspectRestorePackage,
    listBackups,
    unavailable,
    verifyRestorePackage,
  };
})();
