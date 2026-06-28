const versionService = require('./version.service');
const updateService = require('./update.service');
const licenseService = require('./license.service');
const { logError } = require('../../utils/safe-logger');

function safeError(error, label) {
  logError(label, error);
  return { ok: false, message: 'Deployment request failed. Please try again.' };
}

function registerDeploymentRoutes(ipcMain, app) {
  ipcMain.handle('/app/info', async () => {
    try {
      return {
        ok: true,
        info: versionService.getVersionInfo(app),
        machine: versionService.getMachineInfo(),
      };
    } catch (error) {
      return safeError(error, 'App info error:');
    }
  });

  ipcMain.handle('/updates/check', async () => {
    try {
      return await updateService.check(app);
    } catch (error) {
      return safeError(error, 'Update check error:');
    }
  });

  ipcMain.handle('/license/status', async () => {
    try {
      return await licenseService.status(app);
    } catch (error) {
      return safeError(error, 'License status error:');
    }
  });

  ipcMain.handle('/license/activate', async (_event, payload) => {
    try {
      return await licenseService.activate(payload || {}, app);
    } catch (error) {
      return safeError(error, 'License activation error:');
    }
  });

  ipcMain.handle('/license/refresh', async () => {
    try {
      return await licenseService.refresh(app);
    } catch (error) {
      return safeError(error, 'License refresh error:');
    }
  });
}

module.exports = { registerDeploymentRoutes };
