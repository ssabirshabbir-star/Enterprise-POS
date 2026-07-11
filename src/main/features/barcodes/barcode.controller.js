const barcodeService = require('./barcode.service');
const { errorResult } = require('./barcode.error');
const { logError } = require('../../utils/safe-logger');

function safeError(error, label) {
  logError(label, error);
  return errorResult(error);
}

function registerBarcodeRoutes(ipcMain) {
  ipcMain.handle('/barcodes/capabilities', async () => {
    try {
      return await barcodeService.getCapabilities();
    } catch (error) {
      return safeError(error, 'Barcode capabilities error:');
    }
  });

  ipcMain.handle('/barcodes/labels/validate', async (_event, input) => {
    try {
      return await barcodeService.validateLabel(input || {});
    } catch (error) {
      return safeError(error, 'Barcode label validation error:');
    }
  });

  ipcMain.handle('/barcodes/preview/request', async (_event, input) => {
    try {
      return await barcodeService.requestPreview(input || {});
    } catch (error) {
      return safeError(error, 'Barcode preview request error:');
    }
  });

  ipcMain.handle('/barcodes/preview/print', async (_event, input) => {
    try {
      return await barcodeService.printPreview(input || {});
    } catch (error) {
      return safeError(error, 'Barcode preview print error:');
    }
  });
}

module.exports = {
  registerBarcodeRoutes,
};
