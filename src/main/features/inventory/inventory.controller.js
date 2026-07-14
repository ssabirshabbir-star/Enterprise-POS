const inventoryService = require('./inventory.service');
const inventoryImportPreviewService = require('./inventory-import-preview.service');
const inventoryImportMatchingWorkflowService = require('./inventory-import-matching-workflow.service');
const inventoryImportCommitPlanWorkflowService = require('./inventory-import-commit-plan-workflow.service');
const inventoryImportExecutionPreflightWorkflowService = require('./inventory-import-execution-preflight-workflow.service');
const inventoryImportExecutionWorkflowService = require('./inventory-import-execution-workflow.service');
const path = require('path');
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

function pad(value) {
  return String(value).padStart(2, '0');
}

function timestampForFileName(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}`;
}

function safeFileName(value) {
  return String(value || 'inventory-export')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

function ensureCsvExtension(filePath) {
  return path.extname(filePath).toLowerCase() === '.csv' ? filePath : `${filePath}.csv`;
}

function normalizeExportPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const filters = payload.filters || {};
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) return null;
  return { filters };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function containsExecutableValue(value, seen = new Set()) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return true;
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return true;
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) return true;
  seen.add(value);
  const found = Object.values(value).some((child) => containsExecutableValue(child, seen));
  seen.delete(value);
  return found;
}

function normalizeImportExecutionPayload(payload) {
  const allowedKeys = new Set(['sessionId', 'expectedPreflightDigest', 'expectedContractDigest']);
  if (!isPlainObject(payload) || containsExecutableValue(payload)) return null;
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) return null;
  return {
    sessionId: payload.sessionId,
    expectedPreflightDigest: payload.expectedPreflightDigest,
    expectedContractDigest: payload.expectedContractDigest,
  };
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

  ipcMain.handle('/inventory/export/csv', async (event, payload) => {
    try {
      const request = normalizeExportPayload(payload);
      if (!request) return { ok: false, canceled: false, rowCount: 0, message: 'Invalid export request.' };

      const defaultName = `${safeFileName(`inventory-export-${timestampForFileName()}`)}.csv`;
      const saveResult = await dialog.showSaveDialog(windowFromEvent(event), {
        title: 'Export Inventory CSV',
        defaultPath: defaultName,
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return {
          ok: false,
          canceled: true,
          rowCount: 0,
          message: 'Inventory CSV export cancelled.',
        };
      }

      return await inventoryService.exportInventoryCsv({
        filePath: ensureCsvExtension(saveResult.filePath),
        filters: request.filters,
      });
    } catch (error) {
      logError('Inventory CSV export error:', error);
      return {
        ok: false,
        canceled: false,
        rowCount: 0,
        message: 'Inventory CSV export failed. Please try again.',
      };
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

  ipcMain.handle('/inventory/import/matching/analyze', async (_event, payload) => {
    try {
      return await inventoryImportMatchingWorkflowService.analyzeImportPreview(payload);
    } catch (error) {
      return safeError(error, 'Inventory import matching analysis error:');
    }
  });

  ipcMain.handle('/inventory/import/matching/session', async (_event, payload) => {
    try {
      return await inventoryImportMatchingWorkflowService.getMatchedImportPreviewSession(payload);
    } catch (error) {
      return safeError(error, 'Inventory import matched preview session error:');
    }
  });

  ipcMain.handle('/inventory/import/commit-plan/create', async (_event, payload) => {
    try {
      return await inventoryImportCommitPlanWorkflowService.createImportCommitPlan(payload);
    } catch (error) {
      return safeError(error, 'Inventory import commit plan create error:');
    }
  });

  ipcMain.handle('/inventory/import/commit-plan/session', async (_event, payload) => {
    try {
      return await inventoryImportCommitPlanWorkflowService.getImportCommitPlanSession(payload);
    } catch (error) {
      return safeError(error, 'Inventory import commit plan session error:');
    }
  });

  ipcMain.handle('/inventory/import/execution-preflight/create', async (_event, payload) => {
    try {
      return await inventoryImportExecutionPreflightWorkflowService.createImportExecutionPreflight(payload);
    } catch (error) {
      return safeError(error, 'Inventory import execution preflight create error:');
    }
  });

  ipcMain.handle('/inventory/import/execution-preflight/session', async (_event, payload) => {
    try {
      return await inventoryImportExecutionPreflightWorkflowService.getImportExecutionPreflightSession(payload);
    } catch (error) {
      return safeError(error, 'Inventory import execution preflight session error:');
    }
  });

  ipcMain.handle('/inventory/import/execution/certified', async (_event, payload) => {
    try {
      const request = normalizeImportExecutionPayload(payload);
      if (!request) return { ok: false, message: 'Invalid inventory import execution request.' };
      return await inventoryImportExecutionWorkflowService.executeCertifiedImport(request);
    } catch (error) {
      return safeError(error, 'Inventory import execution error:');
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
