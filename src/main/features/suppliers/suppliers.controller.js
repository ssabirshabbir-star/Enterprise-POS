const suppliersService = require('./suppliers.service');
const { logError } = require('../../utils/safe-logger');

function safeError(error, label) {
  logError(label, error);
  return { ok: false, message: 'Request failed. Please try again.' };
}

function registerSupplierRoutes(ipcMain) {
  ipcMain.handle('/suppliers/list', async () => {
    try {
      return await suppliersService.listSuppliers();
    } catch (error) {
      return safeError(error, 'Supplier list error:');
    }
  });
  ipcMain.handle('/purchases/suppliers/list', async () => {
    try {
      return await suppliersService.listSuppliers();
    } catch (error) {
      return safeError(error, 'Purchase supplier list error:');
    }
  });
  ipcMain.handle('/suppliers/create', async (_event, payload) => {
    try {
      return await suppliersService.createSupplier(payload || {});
    } catch (error) {
      return safeError(error, 'Supplier create error:');
    }
  });
  ipcMain.handle('/suppliers/update', async (_event, { id, payload }) => {
    try {
      return await suppliersService.updateSupplier(id, payload || {});
    } catch (error) {
      return safeError(error, 'Supplier update error:');
    }
  });
  ipcMain.handle('/suppliers/delete', async (_event, id) => {
    try {
      return await suppliersService.deleteSupplier(id);
    } catch (error) {
      return safeError(error, 'Supplier delete error:');
    }
  });
  ipcMain.handle('/suppliers/details', async (_event, id) => {
    try {
      return await suppliersService.getSupplierDetails(id);
    } catch (error) {
      return safeError(error, 'Supplier details error:');
    }
  });
  ipcMain.handle('/suppliers/ledger', async (_event, id) => {
    try {
      return await suppliersService.getSupplierLedger(id);
    } catch (error) {
      return safeError(error, 'Supplier ledger error:');
    }
  });
  ipcMain.handle('/suppliers/payment', async (_event, { supplierId, payload }) => {
    try {
      return await suppliersService.recordSupplierPayment(supplierId, payload || {});
    } catch (error) {
      return safeError(error, 'Supplier payment error:');
    }
  });
}

module.exports = { registerSupplierRoutes };
