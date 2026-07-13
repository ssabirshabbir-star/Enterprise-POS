const inventoryService = require('./inventory.service');
const inventoryImportPreviewService = require('./inventory-import-preview.service');
const { BrowserWindow, dialog } = require('electron');
const { logError } = require('../../utils/safe-logger');

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function normalizePreviewSessionPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const sessionId = String(payload.sessionId || '').trim();
  return sessionId ? { sessionId } : null;
}

function safeError(error, label) {
  logError(label, error);
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

  ipcMain.handle('/inventory/import/preview/request', async (event) => {
    try {
      const openResult = await dialog.showOpenDialog(windowFromEvent(event), {
        title: 'Select Inventory Import CSV',
        properties: ['openFile'],
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      });

      if (openResult.canceled || !openResult.filePaths[0]) {
        return {
          ok: false,
          canceled: true,
          message: 'Inventory import preview cancelled.',
        };
      }

      return await inventoryImportPreviewService.requestImportPreview({
        filePath: openResult.filePaths[0],
      });
    } catch (error) {
      logError('Inventory import preview request error:', error);
      return {
        ok: false,
        canceled: false,
        message: 'Inventory import preview failed. Please try again.',
      };
    }
  });

  ipcMain.handle('/inventory/import/preview/session', async (_event, payload) => {
    try {
      const request = normalizePreviewSessionPayload(payload);
      if (!request) return { ok: false, message: 'Invalid import preview session request.' };
      return await inventoryImportPreviewService.getImportPreviewSession(request);
    } catch (error) {
      logError('Inventory import preview session error:', error);
      return {
        ok: false,
        message: 'Inventory import preview is unavailable. Please select the CSV again.',
      };
    }
  });

  ipcMain.handle('/inventory/product-image', async (_event, payload) => {
    try {
      return await inventoryService.updateProductImage(payload || {});
    } catch (error) {
      return safeError(error, 'Inventory image update error:');
    }
  });
}

module.exports = { registerInventoryRoutes };
