const syncService = require('./sync.service');

function safeError(error, label) {
  console.error(label, error);
  return { ok: false, message: 'Sync request failed. Please try again.' };
}

function registerSyncRoutes(ipcMain) {
  ipcMain.handle('/sync/status', async () => {
    try { return await syncService.getStatus(); } catch (error) { return safeError(error, 'Sync status error:'); }
  });
  ipcMain.handle('/sync/queue', async () => {
    try { return await syncService.listQueue(); } catch (error) { return safeError(error, 'Sync queue error:'); }
  });
  ipcMain.handle('/sync/run', async () => {
    try { return await syncService.runSync(); } catch (error) { return safeError(error, 'Sync run error:'); }
  });
  ipcMain.handle('/sync/retry-failed', async () => {
    try { return await syncService.retryFailed(); } catch (error) { return safeError(error, 'Sync retry error:'); }
  });
}

module.exports = { registerSyncRoutes };
