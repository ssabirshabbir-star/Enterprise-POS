const inventoryService = require('./inventory.service');

function safeError(error, label) {
  console.error(label, error);
  return { ok: false, message: 'Request failed. Please try again.' };
}

function registerInventoryRoutes(ipcMain) {
  ipcMain.handle('/inventory/list', async (_event, filters) => {
    try {
      return await inventoryService.listInventory(filters || {});
    } catch (error) {
      return safeError(error, 'Inventory list error:');
    }
  });

  ipcMain.handle('/inventory/movements', async (_event, filters) => {
    try {
      return await inventoryService.listMovements(filters || {});
    } catch (error) {
      return safeError(error, 'Inventory movements error:');
    }
  });

  ipcMain.handle('/inventory/adjust', async (_event, payload) => {
    try {
      return await inventoryService.adjustStock(payload || {});
    } catch (error) {
      return safeError(error, 'Inventory adjustment error:');
    }
  });
}

module.exports = { registerInventoryRoutes };
