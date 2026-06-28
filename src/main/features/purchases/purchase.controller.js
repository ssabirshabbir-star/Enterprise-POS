const purchaseService = require('./purchase.service');
const { logError } = require('../../utils/safe-logger');

function safeError(error, label) {
  logError(label, error);
  return { ok: false, message: 'Request failed. Please try again.' };
}

function registerPurchaseRoutes(ipcMain) {
  ipcMain.handle('/suppliers/list', async () => {
    try {
      return await purchaseService.listSuppliers();
    } catch (error) {
      return safeError(error, 'Supplier list error:');
    }
  });
  ipcMain.handle('/suppliers/create', async (_event, payload) => {
    try {
      return await purchaseService.createSupplier(payload || {});
    } catch (error) {
      return safeError(error, 'Supplier create error:');
    }
  });
  ipcMain.handle('/suppliers/update', async (_event, { id, payload }) => {
    try {
      return await purchaseService.updateSupplier(id, payload || {});
    } catch (error) {
      return safeError(error, 'Supplier update error:');
    }
  });
  ipcMain.handle('/suppliers/delete', async (_event, id) => {
    try {
      return await purchaseService.deleteSupplier(id);
    } catch (error) {
      return safeError(error, 'Supplier delete error:');
    }
  });
  ipcMain.handle('/suppliers/details', async (_event, id) => {
    try {
      return await purchaseService.getSupplierDetails(id);
    } catch (error) {
      return safeError(error, 'Supplier details error:');
    }
  });
  ipcMain.handle('/suppliers/ledger', async (_event, id) => {
    try {
      return await purchaseService.getSupplierLedger(id);
    } catch (error) {
      return safeError(error, 'Supplier ledger error:');
    }
  });
  ipcMain.handle('/suppliers/payment', async (_event, { supplierId, payload }) => {
    try {
      return await purchaseService.recordSupplierPayment(supplierId, payload || {});
    } catch (error) {
      return safeError(error, 'Supplier payment error:');
    }
  });
  ipcMain.handle('/purchases/list', async () => {
    try {
      return await purchaseService.listPurchases();
    } catch (error) {
      return safeError(error, 'Purchase list error:');
    }
  });
  ipcMain.handle('/purchases/suppliers/list', async () => {
    try {
      return await purchaseService.listSuppliers();
    } catch (error) {
      return safeError(error, 'Purchase supplier list error:');
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
  ipcMain.handle('/purchases/delete', async (_event, purchaseId) => {
    try {
      return await purchaseService.deletePurchase(purchaseId);
    } catch (error) {
      return safeError(error, 'Purchase delete error:');
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
