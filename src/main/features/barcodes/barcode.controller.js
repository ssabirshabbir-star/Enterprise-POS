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
}

module.exports = {
  registerBarcodeRoutes,
};
