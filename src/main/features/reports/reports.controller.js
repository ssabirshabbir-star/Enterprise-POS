const reportsService = require('./reports.service');
const { logError } = require('../../utils/safe-logger');

function registerReportsRoutes(ipcMain) {
  ipcMain.handle('/reports/overview', async (_event, filters) => {
    try {
      return await reportsService.getReports(filters || {});
    } catch (error) {
      logError('Reports overview error:', error);
      return { ok: false, message: 'Reports could not be loaded.' };
    }
  });
}

module.exports = { registerReportsRoutes };
