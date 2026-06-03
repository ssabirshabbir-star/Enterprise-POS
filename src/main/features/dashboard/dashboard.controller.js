const dashboardService = require('./dashboard.service');

function registerDashboardRoutes(ipcMain) {
  ipcMain.handle('/dashboard/overview', async () => {
    try { return await dashboardService.getDashboardOverview(); } catch (error) {
      console.error('Dashboard overview error:', error);
      return { ok: false, message: 'Dashboard could not be loaded.' };
    }
  });
}

module.exports = { registerDashboardRoutes };
