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

  window.SettingsApi = {
    appInfo,
    createBackup,
    getSettings,
    listBackups,
    unavailable,
  };
})();
