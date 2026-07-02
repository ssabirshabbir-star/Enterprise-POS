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

  window.SettingsApi = {
    appInfo,
    getSettings,
    listBackups,
    unavailable,
  };
})();
