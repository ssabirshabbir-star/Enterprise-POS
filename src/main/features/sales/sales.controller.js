const salesService = require('./sales.service');

function safeError(error, label) {
  console.error(label, error);
  return { ok: false, message: 'Request failed. Please try again.' };
}

function registerSalesRoutes(ipcMain) {
  ipcMain.handle('/pos/products/search', async (_event, filters) => {
    try { return await salesService.searchProducts(filters); } catch (error) { return safeError(error, 'POS product search error:'); }
  });
  ipcMain.handle('/pos/products/barcode', async (_event, barcode) => {
    try { return await salesService.lookupBarcode(barcode); } catch (error) { return safeError(error, 'POS barcode lookup error:'); }
  });
  ipcMain.handle('/pos/customers/list', async (_event, search) => {
    try { return await salesService.listCustomers(search); } catch (error) { return safeError(error, 'POS customer list error:'); }
  });
  ipcMain.handle('/pos/customers/create', async (_event, payload) => {
    try { return await salesService.createCustomer(payload || {}); } catch (error) { return safeError(error, 'POS customer create error:'); }
  });
  ipcMain.handle('/pos/sales/complete', async (_event, payload) => {
    try { return await salesService.completeSale(payload || {}); } catch (error) { return safeError(error, 'POS complete sale error:'); }
  });
  ipcMain.handle('/pos/holds/create', async (_event, payload) => {
    try { return await salesService.holdSale(payload || {}); } catch (error) { return safeError(error, 'POS hold sale error:'); }
  });
  ipcMain.handle('/pos/holds/list', async () => {
    try { return await salesService.listHeldSales(); } catch (error) { return safeError(error, 'POS held sales list error:'); }
  });
  ipcMain.handle('/pos/holds/delete', async (_event, holdId) => {
    try { return await salesService.deleteHeldSale(holdId); } catch (error) { return safeError(error, 'POS held sale delete error:'); }
  });
  ipcMain.handle('/pos/sales/last-receipt', async () => {
    try { return await salesService.getLastReceipt(); } catch (error) { return safeError(error, 'POS last receipt error:'); }
  });
  ipcMain.handle('/pos/sales/action/validate', async (_event, payload) => {
    try { return await salesService.validateInvoiceAction(payload || {}); } catch (error) { return safeError(error, 'POS sale action validate error:'); }
  });
}

module.exports = { registerSalesRoutes };
