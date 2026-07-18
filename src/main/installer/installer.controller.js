const installerConfigStore = require('./installer-config.store');
const installerDiagnostics = require('./installer-diagnostics.service');

function safeError(error) {
  return {
    ok: false,
    code: error?.code || 'INSTALLER_REQUEST_FAILED',
    message: String(error?.message || 'Installer request failed.'),
  };
}

function registerInstallerRoutes(ipcMain, app) {
  ipcMain.handle('/installer/status', async () => {
    try {
      return await installerDiagnostics.assessInstallerHealth({
        userDataPath: app.getPath('userData'),
      });
    } catch (error) {
      return safeError(error);
    }
  });

  ipcMain.handle('/installer/config/save', async (_event, payload = {}) => {
    try {
      const result = installerConfigStore.saveInstallationConfig(app.getPath('userData'), payload);
      installerConfigStore.loadAndApplyInstallationConfig(app.getPath('userData'));
      return result;
    } catch (error) {
      return safeError(error);
    }
  });

  ipcMain.handle('/installer/database/test', async (_event, payload = {}) => {
    try {
      return await installerDiagnostics.detectPostgres(payload || {});
    } catch (error) {
      return safeError(error);
    }
  });

  ipcMain.handle('/installer/database/create', async (_event, payload = {}) => {
    try {
      return await installerDiagnostics.createDatabaseIfMissing(payload || {});
    } catch (error) {
      return safeError(error);
    }
  });

  ipcMain.handle('/installer/database/initialize', async (_event, payload = {}) => {
    try {
      return await installerDiagnostics.initializeConfiguredDatabase({
        userDataPath: app.getPath('userData'),
        config: payload.config || payload,
        admin: payload.admin || null,
      });
    } catch (error) {
      return safeError(error);
    }
  });
}

module.exports = {
  registerInstallerRoutes,
};
