const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, Menu, ipcMain, shell, dialog } = require('electron');
const { loadEnvironment } = require('./config/env');
const { closeDatabase } = require('./database/connection');
const { initializeDatabase } = require('./database/schema');
const { registerAuthRoutes } = require('./features/auth/auth.controller');
const { registerInventoryRoutes } = require('./features/inventory/inventory.controller');
const { registerProductRoutes } = require('./features/products/product.controller');
const { registerPurchaseRoutes } = require('./features/purchases/purchase.controller');
const { registerPurchaseOrderRoutes } = require('./features/purchase-orders/po.controller');
const { registerBillingRoutes } = require('./features/billing/billing.controller');
const { registerSalesHistoryRoutes } = require('./features/sales-history/sales-history.controller');
const { registerPrintingRoutes } = require('./features/printing/printing.controller');
const { registerBarcodeRoutes } = require('./features/barcodes/barcode.controller');
const { registerReportsRoutes } = require('./features/reports/reports.controller');
const { registerDashboardRoutes } = require('./features/dashboard/dashboard.controller');
const { registerCustomerRoutes } = require('./features/customers/customers.controller');
const { registerSupplierRoutes } = require('./features/suppliers/suppliers.controller');
const { registerReturnRoutes } = require('./features/returns/returns.controller');
const { registerSettingsRoutes } = require('./features/settings/settings.controller');
const { registerSyncRoutes } = require('./features/sync/sync.controller');
const { registerExpenseRoutes } = require('./features/expenses/expense.controller');
const { registerAccessControlRoutes } = require('./features/access-control/access.controller');
const { registerDeploymentRoutes } = require('./features/deployment/deployment.controller');
const { registerLuckyDrawV2Routes } = require('./features/luckydraw_v2');
const { initializeSessionStore } = require('./security/session-store');
const { logError } = require('./utils/safe-logger');
const settingsRepository = require('./features/settings/settings.repository');

let startupStatus = { ok: true, message: 'Ready' };

function setupUrl() {
  const error = encodeURIComponent(startupStatus.message || 'Startup failed.');
  return `file://${path.join(__dirname, '..', 'renderer', 'setup.html').replace(/\\/g, '/')}?error=${error}`;
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 620,
    autoHideMenuBar: true,
    backgroundColor: '#f6f4ef',
    title: 'Enterprise POS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setZoomFactor(1);
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(1);
  });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toLowerCase();
    const isZoomShortcut = input.control && ['+', '=', '-', '_', '0'].includes(key);
    if (isZoomShortcut) {
      event.preventDefault();
    }
  });
  const barcodeDesignerUrl = pathToFileURL(
    path.join(__dirname, 'features', 'barcodes', 'barcode-designer.html')
  ).toString();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url !== barcodeDesignerUrl) return { action: 'deny' };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 1180,
        height: 760,
        minWidth: 960,
        minHeight: 620,
        autoHideMenuBar: true,
        backgroundColor: '#edf3fb',
        title: 'Barcode Label Preview',
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      },
    };
  });

  if (startupStatus.ok) {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  } else {
    mainWindow.loadURL(setupUrl());
  }
}

app.whenReady().then(async () => {
  if (app.isPackaged) {
    process.env.NODE_ENV = 'production';
    process.env.ELECTRON_IS_PACKAGED = 'true';
  }
  loadEnvironment(app);
  initializeSessionStore(app);

  try {
    await initializeDatabase();
    const recoveryAssessment = await settingsRepository.getRestoreStartupRecoveryAssessment();
    if (recoveryAssessment.startupRecovery?.maintenanceModeRequired) {
      startupStatus = {
        ok: false,
        message:
          recoveryAssessment.startupRecovery.message ||
          'Restore recovery maintenance mode is active. Resolve recovery state before normal POS startup.',
      };
    }
  } catch (error) {
    logError('Database initialization failed:', error);
    startupStatus = {
      ok: false,
      message: userFriendlyStartupError(error),
    };
  }

  registerAuthRoutes(ipcMain);
  registerProductRoutes(ipcMain);
  registerInventoryRoutes(ipcMain);
  registerPurchaseRoutes(ipcMain);
  registerPurchaseOrderRoutes(ipcMain);
  registerBillingRoutes(ipcMain);
  registerSalesHistoryRoutes(ipcMain);
  registerPrintingRoutes(ipcMain);
  registerBarcodeRoutes(ipcMain);
  registerReportsRoutes(ipcMain);
  registerDashboardRoutes(ipcMain);
  registerCustomerRoutes(ipcMain);
  registerSupplierRoutes(ipcMain);
  registerReturnRoutes(ipcMain);
  registerSettingsRoutes(ipcMain);
  registerSyncRoutes(ipcMain);
  registerExpenseRoutes(ipcMain);
  registerAccessControlRoutes(ipcMain);
  registerDeploymentRoutes(ipcMain, app);
  registerLuckyDrawV2Routes(ipcMain);

  // Open URLs in the system default browser (e.g. WhatsApp web links)
  ipcMain.handle('/shell/open-external', async (_event, url) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
      return { ok: true };
    }
    return { ok: false, message: 'Invalid URL' };
  });

  // Native dialog helpers (window.confirm/prompt are unreliable in Electron renderers)
  ipcMain.handle('/dialog/confirm', async (event, message) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Cancel', 'OK'],
      defaultId: 1,
      cancelId: 0,
      message: String(message || 'Are you sure?'),
    });
    return response === 1;
  });

  ipcMain.handle('/dialog/prompt', async (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const label = String(payload?.label || 'Enter value:');
    const defaultValue = String(payload?.defaultValue || '');
    const { response, checkboxChecked: _cc } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Cancel', 'OK'],
      defaultId: 1,
      cancelId: 0,
      message: label,
      detail: defaultValue ? `Default: ${defaultValue}` : undefined,
    });
    // Native Electron dialog cannot collect text input — return empty string on OK
    return response === 1 ? defaultValue : null;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function userFriendlyStartupError(error) {
  const message = String(error?.message || '');
  if (message.includes('Database is not configured')) return message;
  if (error?.code === 'ECONNREFUSED')
    return 'PostgreSQL is not running or cannot be reached. Start PostgreSQL and verify your production env file.';
  if (error?.code === '28P01')
    return 'PostgreSQL login failed. Check DATABASE_URL or PGUSER/PGPASSWORD.';
  if (error?.code === '3D000')
    return 'PostgreSQL database does not exist. Create the database, then restart Enterprise POS.';
  return 'Database startup failed. Check PostgreSQL configuration and run npm run db:health for details.';
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await closeDatabase();
  // Clear the persisted refresh token on every app exit.
  // This ensures the login screen is always shown on the next launch.
  const { clearSession } = require('./security/session-store');
  clearSession();
});
