const reportsService = require('./reports.service');

function registerReportsRoutes(ipcMain) {
  ipcMain.handle('/reports/overview', async (_event, filters) => {
    try { return await reportsService.getReports(filters || {}); } catch (error) {
      console.error('Reports overview error:', error);
      return { ok: false, message: 'Reports could not be loaded.' };
    }
  });
}

module.exports = { registerReportsRoutes };
