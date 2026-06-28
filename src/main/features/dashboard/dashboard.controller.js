const dashboardService = require('./dashboard.service');
const { logError } = require('../../utils/safe-logger');

function registerDashboardRoutes(ipcMain) {
  ipcMain.handle('/dashboard/overview', async () => {
    try {
      return await dashboardService.getDashboardOverview();
    } catch (error) {
      logError('Dashboard overview error:', error);
      return { ok: false, message: 'Dashboard could not be loaded.' };
    }
  });
}

module.exports = { registerDashboardRoutes };
