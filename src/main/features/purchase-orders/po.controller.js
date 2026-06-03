const poService = require('./po.service');

function safeError(error, label) {
  console.error(label, error);
  return { ok: false, message: 'Purchase order request failed. Please try again.' };
}

function registerPurchaseOrderRoutes(ipcMain) {
  ipcMain.handle('/purchase-orders/page-data', async () => {
    try { return await poService.getPageData(); } catch (error) { return safeError(error, 'PO page data error:'); }
  });
  ipcMain.handle('/purchase-requisitions/list', async (_event, filters) => {
    try { return await poService.listRequisitions(filters || {}); } catch (error) { return safeError(error, 'Requisition list error:'); }
  });
  ipcMain.handle('/purchase-requisitions/create', async (_event, payload) => {
    try { return await poService.createRequisition(payload || {}); } catch (error) { return safeError(error, 'Requisition create error:'); }
  });
  ipcMain.handle('/purchase-requisitions/status', async (_event, payload) => {
    try { return await poService.updateRequisitionStatus(payload?.id, payload?.status, payload?.notes || ''); } catch (error) { return safeError(error, 'Requisition status error:'); }
  });
  ipcMain.handle('/purchase-requisitions/convert', async (_event, payload) => {
    try { return await poService.convertRequisitionToOrder(payload?.id, payload || {}); } catch (error) { return safeError(error, 'Requisition convert error:'); }
  });
  ipcMain.handle('/purchase-orders/list', async (_event, filters) => {
    try { return await poService.listOrders(filters || {}); } catch (error) { return safeError(error, 'PO list error:'); }
  });
  ipcMain.handle('/purchase-orders/details', async (_event, id) => {
    try { return await poService.getOrder(id); } catch (error) { return safeError(error, 'PO details error:'); }
  });
  ipcMain.handle('/purchase-orders/create', async (_event, payload) => {
    try { return await poService.createOrder(payload || {}); } catch (error) { return safeError(error, 'PO create error:'); }
  });
  ipcMain.handle('/purchase-orders/approve', async (_event, id) => {
    try { return await poService.approveOrder(typeof id === 'object' ? id?.id : id, typeof id === 'object' ? id?.notes : ''); } catch (error) { return safeError(error, 'PO approve error:'); }
  });
  ipcMain.handle('/purchase-orders/send-to-supplier', async (_event, payload) => {
    try { return await poService.sendToSupplier(payload?.id, payload?.notes || ''); } catch (error) { return safeError(error, 'PO send error:'); }
  });
  ipcMain.handle('/purchase-orders/confirm-supplier', async (_event, payload) => {
    try { return await poService.confirmSupplier(payload?.id, payload || {}); } catch (error) { return safeError(error, 'PO supplier confirm error:'); }
  });
  ipcMain.handle('/purchase-orders/cancel', async (_event, id) => {
    try { return await poService.cancelOrder(typeof id === 'object' ? id?.id : id, typeof id === 'object' ? id?.notes : ''); } catch (error) { return safeError(error, 'PO cancel error:'); }
  });
  ipcMain.handle('/purchase-orders/receive', async (_event, payload) => {
    try { return await poService.receiveOrder(payload || {}); } catch (error) { return safeError(error, 'PO receive error:'); }
  });
  ipcMain.handle('/purchase-orders/invoice', async (_event, payload) => {
    try { return await poService.createInvoiceFromReceipt(payload || {}); } catch (error) { return safeError(error, 'PO invoice error:'); }
  });
  ipcMain.handle('/purchase-orders/receipts', async (_event, purchaseOrderId) => {
    try { return await poService.listReceipts(purchaseOrderId); } catch (error) { return safeError(error, 'PO receipts error:'); }
  });
}

module.exports = { registerPurchaseOrderRoutes };
