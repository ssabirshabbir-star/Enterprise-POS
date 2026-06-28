const billingService = require('./billing.service');

const recentControllerErrors = [];

function logErrorSafely(label, error) {
  try {
    recentControllerErrors.push({
      at: new Date().toISOString(),
      label: String(label || ''),
      message: String(error?.message || error || ''),
    });
    if (recentControllerErrors.length > 20) recentControllerErrors.shift();
  } catch {
    // Never let diagnostic collection crash the main process.
  }
}

function safeError(error, label) {
  logErrorSafely(label, error);
  return { ok: false, message: 'Request failed. Please try again.' };
}

function registerBillingRoutes(ipcMain) {
  ipcMain.handle('/pos/products/search', async (_event, filters) => {
    try {
      return await billingService.searchProducts(filters);
    } catch (error) {
      return safeError(error, 'POS product search error:');
    }
  });
  ipcMain.handle('/pos/products/barcode', async (_event, barcode) => {
    try {
      return await billingService.lookupBarcode(barcode);
    } catch (error) {
      return safeError(error, 'POS barcode lookup error:');
    }
  });
  ipcMain.handle('/pos/customers/list', async (_event, search) => {
    try {
      return await billingService.listCustomers(search);
    } catch (error) {
      return safeError(error, 'POS customer list error:');
    }
  });
  ipcMain.handle('/pos/customers/create', async (_event, payload) => {
    try {
      return await billingService.createCustomer(payload || {});
    } catch (error) {
      return safeError(error, 'POS customer create error:');
    }
  });
  ipcMain.handle('/pos/sales/complete', async (_event, payload) => {
    try {
      return await billingService.completeSale(payload || {});
    } catch (error) {
      return safeError(error, 'POS complete sale error:');
    }
  });
  ipcMain.handle('/pos/holds/create', async (_event, payload) => {
    try {
      return await billingService.holdSale(payload || {});
    } catch (error) {
      return safeError(error, 'POS hold sale error:');
    }
  });
  ipcMain.handle('/pos/holds/list', async () => {
    try {
      return await billingService.listHeldSales();
    } catch (error) {
      return safeError(error, 'POS held sales list error:');
    }
  });
  ipcMain.handle('/pos/holds/delete', async (_event, holdId) => {
    try {
      return await billingService.deleteHeldSale(holdId);
    } catch (error) {
      return safeError(error, 'POS held sale delete error:');
    }
  });
  ipcMain.handle('/pos/sales/last-receipt', async () => {
    try {
      return await billingService.getLastReceipt();
    } catch (error) {
      return safeError(error, 'POS last receipt error:');
    }
  });
  ipcMain.handle('/pos/sales/action/validate', async (_event, payload) => {
    try {
      return await billingService.validateInvoiceAction(payload || {});
    } catch (error) {
      return safeError(error, 'POS sale action validate error:');
    }
  });
}

module.exports = { registerBillingRoutes };
