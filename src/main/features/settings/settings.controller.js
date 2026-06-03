const path = require('path');
const { app, dialog, BrowserWindow } = require('electron');
const settingsService = require('./settings.service');

function safeError(error, label) {
  console.error(label, error);
  return { ok: false, message: 'Settings request failed. Please try again.' };
}

function windowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function defaultBackupName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `enterprise-pos-backup-${stamp}.json`;
}

function registerSettingsRoutes(ipcMain) {
  ipcMain.handle('/settings/get', async () => {
    try { return await settingsService.getSettings(); } catch (error) { return safeError(error, 'Settings get error:'); }
  });

  ipcMain.handle('/settings/save', async (_event, payload) => {
    try { return await settingsService.saveSettings(payload || {}); } catch (error) { return safeError(error, 'Settings save error:'); }
  });

  ipcMain.handle('/settings/backups/list', async () => {
    try { return await settingsService.listBackups(); } catch (error) { return safeError(error, 'Backup list error:'); }
  });

  ipcMain.handle('/settings/backups/create', async (event) => {
    try {
      const result = await dialog.showSaveDialog(windowFromEvent(event), {
        title: 'Save POS Backup',
        defaultPath: path.join(app.getPath('documents'), defaultBackupName()),
        filters: [{ name: 'Enterprise POS Backup', extensions: ['json'] }]
      });
      if (result.canceled || !result.filePath) return { ok: false, message: 'Backup cancelled.' };
      return await settingsService.createBackup(result.filePath);
    } catch (error) {
      return safeError(error, 'Backup create error:');
    }
  });

  ipcMain.handle('/settings/backups/restore', async (event) => {
    try {
      const result = await dialog.showOpenDialog(windowFromEvent(event), {
        title: 'Select POS Backup to Restore',
        properties: ['openFile'],
        filters: [{ name: 'Enterprise POS Backup', extensions: ['json'] }]
      });
      if (result.canceled || !result.filePaths[0]) return { ok: false, message: 'Restore cancelled.' };
      return await settingsService.restoreBackup(result.filePaths[0]);
    } catch (error) {
      return safeError(error, 'Backup restore error:');
    }
  });
}

module.exports = { registerSettingsRoutes };
