const salesHistoryService = require('./sales-history.service');

const recentControllerErrors = [];

function logErrorSafely(label, error) {
  try {
    recentControllerErrors.push({
      at: new Date().toISOString(),
      label: String(label || ''),
      message: String(error?.message || error || ''),
    });
    if (recentControllerErrors.length > 20) recentControllerErrors.shift();
  } catch {
    // Diagnostics must never crash the main process.
  }
}

function safeError(error, label) {
  logErrorSafely(label, error);
  return { ok: false, message: 'Sales history request failed. Please try again.' };
}

function registerSalesHistoryRoutes(ipcMain) {
  ipcMain.handle('/sales-history/list', async (_event, filters) => {
    try {
      return await salesHistoryService.list(filters || {});
    } catch (error) {
      return safeError(error, 'Sales history list error:');
    }
  });

  ipcMain.handle('/sales-history/details', async (_event, saleId) => {
    try {
      return await salesHistoryService.getDetails(saleId);
    } catch (error) {
      return safeError(error, 'Sales history details error:');
    }
  });
}

module.exports = { registerSalesHistoryRoutes };
