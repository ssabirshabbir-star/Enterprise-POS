const returnsService = require('./returns.service');

function safeError(error, label) {
  console.error(label, error);
  return { ok: false, message: 'Return request failed. Please try again.' };
}

function registerReturnRoutes(ipcMain) {
  ipcMain.handle('/returns/lookup-invoice', async (_event, filters) => {
    try { return await returnsService.lookupInvoice(filters || {}); } catch (error) { return safeError(error, 'Return invoice lookup error:'); }
  });
  ipcMain.handle('/returns/list', async () => {
    try { return await returnsService.listReturns(); } catch (error) { return safeError(error, 'Returns list error:'); }
  });
  ipcMain.handle('/returns/create', async (_event, payload) => {
    try { return await returnsService.createReturn(payload || {}); } catch (error) { return safeError(error, 'Return create error:'); }
  });
}

module.exports = { registerReturnRoutes };
