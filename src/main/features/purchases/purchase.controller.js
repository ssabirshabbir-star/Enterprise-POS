const purchaseService = require('./purchase.service');
const { logError } = require('../../utils/safe-logger');

function safeError(error, label) {
  logError(label, error);
  return { ok: false, message: 'Request failed. Please try again.' };
}

function registerPurchaseRoutes(ipcMain) {
  ipcMain.handle('/purchases/list', async () => {
    try {
      return await purchaseService.listPurchases();
    } catch (error) {
      return safeError(error, 'Purchase list error:');
    }
  });
  ipcMain.handle('/purchases/products/list', async () => {
    try {
      return await purchaseService.listProducts();
    } catch (error) {
      return safeError(error, 'Purchase product list error:');
    }
  });
  ipcMain.handle('/purchases/details', async (_event, purchaseId) => {
    try {
      return await purchaseService.getPurchaseDetails(purchaseId);
    } catch (error) {
      return safeError(error, 'Purchase details error:');
    }
  });
  ipcMain.handle('/purchases/create', async (_event, payload) => {
    try {
      return await purchaseService.createPurchase(payload || {});
    } catch (error) {
      return safeError(error, 'Purchase create error:');
    }
  });
}

module.exports = { registerPurchaseRoutes };
