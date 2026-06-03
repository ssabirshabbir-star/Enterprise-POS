const printingService = require('./printing.service');
const authService = require('../auth/auth.service');
const { dialog, BrowserWindow } = require('electron');

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function safeFileName(value) {
  return String(value || 'invoice').replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').slice(0, 80);
}

function safeError(error, label) {
  console.error(label, error);
  return { ok: false, message: 'Printing request failed.' };
}

async function requirePrintingAccess() {
  const access = await authService.canAccess('printing');
  if (!access.ok) return { ok: false, message: 'Authentication required.' };
  if (!access.allowed) return { ok: false, message: 'You do not have permission to use printing.' };
  return { ok: true };
}

async function requirePrinterSettingsAccess() {
  const access = await authService.canAccess('settings');
  if (!access.ok) return { ok: false, message: 'Authentication required.' };
  if (!access.allowed) return { ok: false, message: 'Only Admin can save printer settings.' };
  return { ok: true };
}

function registerPrintingRoutes(ipcMain) {
  ipcMain.handle('/printing/printers', async () => {
    try {
      const access = await requirePrintingAccess();
      if (!access.ok) return access;
      return { ok: true, printers: await printingService.listPrinters() };
    } catch (error) { return safeError(error, 'Printer list error:'); }
  });
  ipcMain.handle('/printing/settings/get', async () => {
    try {
      const access = await requirePrintingAccess();
      if (!access.ok) return access;
      return { ok: true, settings: await printingService.getPrinterSettings() };
    } catch (error) { return safeError(error, 'Printer settings get error:'); }
  });
  ipcMain.handle('/printing/settings/save', async (_event, settings) => {
    try {
      const access = await requirePrinterSettingsAccess();
      if (!access.ok) return access;
      return { ok: true, settings: await printingService.savePrinterSettings(settings || {}), message: 'Printer settings saved.' };
    } catch (error) { return safeError(error, 'Printer settings save error:'); }
  });
  ipcMain.handle('/printing/receipt/preview', async (_event, receipt) => {
    try {
      const access = await requirePrintingAccess();
      if (!access.ok) return access;
      const settings = await printingService.getPrinterSettings();
      return { ok: true, html: printingService.buildReceiptHtml(receipt, settings), escpos: printingService.buildEscPosReceipt(receipt, settings) };
    } catch (error) { return safeError(error, 'Receipt preview error:'); }
  });
  ipcMain.handle('/printing/receipt/print', async (_event, { receipt, options }) => {
    try {
      const access = await requirePrintingAccess();
      if (!access.ok) return access;
      const result = await printingService.printReceipt(receipt, options || {});
      return { ok: result.success, message: result.success ? 'Receipt sent to printer.' : (result.failureReason || 'Print failed.') };
    } catch (error) { return safeError(error, 'Receipt print error:'); }
  });
  ipcMain.handle('/printing/receipt/pdf', async (event, { receipt, options }) => {
    try {
      const access = await requirePrintingAccess();
      if (!access.ok) return access;
      if (!receipt?.invoiceNumber) return { ok: false, message: 'Complete a sale before downloading an invoice PDF.' };
      const saveResult = await dialog.showSaveDialog(windowFromEvent(event), {
        title: 'Download Invoice PDF',
        defaultPath: `${safeFileName(receipt.invoiceNumber)}.pdf`,
        filters: [{ name: 'PDF Invoice', extensions: ['pdf'] }]
      });
      if (saveResult.canceled || !saveResult.filePath) return { ok: false, canceled: true, message: 'PDF download cancelled.' };
      const result = await printingService.exportReceiptPdf(receipt, saveResult.filePath, options || {});
      return { ok: result.ok, filePath: result.filePath, message: 'Invoice PDF downloaded successfully.' };
    } catch (error) { return safeError(error, 'Receipt PDF export error:'); }
  });
}

module.exports = { registerPrintingRoutes };
