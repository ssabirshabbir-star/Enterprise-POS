const path = require('path');
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const { loadEnvironment } = require('./config/env');
const { closeDatabase } = require('./database/connection');
const { initializeDatabase } = require('./database/schema');
const { registerAuthRoutes } = require('./features/auth/auth.controller');
const { registerInventoryRoutes } = require('./features/inventory/inventory.controller');
const { registerProductRoutes } = require('./features/products/product.controller');
const { registerPurchaseRoutes } = require('./features/purchases/purchase.controller');
const { registerPurchaseOrderRoutes } = require('./features/purchase-orders/po.controller');
const { registerSalesRoutes } = require('./features/sales/sales.controller');
const { registerPrintingRoutes } = require('./features/printing/printing.controller');
const { registerReportsRoutes } = require('./features/reports/reports.controller');
const { registerDashboardRoutes } = require('./features/dashboard/dashboard.controller');
const { registerCustomerRoutes } = require('./features/customers/customers.controller');
const { registerReturnRoutes } = require('./features/returns/returns.controller');
const { registerSettingsRoutes } = require('./features/settings/settings.controller');
const { registerSyncRoutes } = require('./features/sync/sync.controller');
const { registerExpenseRoutes } = require('./features/expenses/expense.controller');
const { registerAccessControlRoutes } = require('./features/access-control/access.controller');
const { registerDeploymentRoutes } = require('./features/deployment/deployment.controller');
const { registerLuckyDrawRoutes } = require('./features/lucky-draw/lucky-draw.controller');
const { initializeSessionStore } = require('./security/session-store');

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
      nodeIntegration: false
    }
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
  } catch (error) {
    console.error('Database initialization failed:', error);
    startupStatus = {
      ok: false,
      message: userFriendlyStartupError(error)
    };
  }

  registerAuthRoutes(ipcMain);
  registerProductRoutes(ipcMain);
  registerInventoryRoutes(ipcMain);
  registerPurchaseRoutes(ipcMain);
  registerPurchaseOrderRoutes(ipcMain);
  registerSalesRoutes(ipcMain);
  registerPrintingRoutes(ipcMain);
  registerReportsRoutes(ipcMain);
  registerDashboardRoutes(ipcMain);
  registerCustomerRoutes(ipcMain);
  registerReturnRoutes(ipcMain);
  registerSettingsRoutes(ipcMain);
  registerSyncRoutes(ipcMain);
  registerExpenseRoutes(ipcMain);
  registerAccessControlRoutes(ipcMain);
  registerDeploymentRoutes(ipcMain, app);
  registerLuckyDrawRoutes(ipcMain);

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
  if (error?.code === 'ECONNREFUSED') return 'PostgreSQL is not running or cannot be reached. Start PostgreSQL and verify your production env file.';
  if (error?.code === '28P01') return 'PostgreSQL login failed. Check DATABASE_URL or PGUSER/PGPASSWORD.';
  if (error?.code === '3D000') return 'PostgreSQL database does not exist. Create the database, then restart Enterprise POS.';
  return 'Database startup failed. Check PostgreSQL configuration and run npm run db:health for details.';
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await closeDatabase();
});
