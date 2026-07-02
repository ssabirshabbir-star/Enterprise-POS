const authService = require('../auth/auth.service');
const activityRepository = require('../activity/activity.repository');
const settingsRepository = require('./settings.repository');

const SETTINGS_ROLES = new Set(['Admin']);

async function requireSettingsAccess(permissionKey, adminOnly = false) {
  const profileResult = await authService.getProfile();
  if (!profileResult.ok) return { ok: false, message: 'Authentication required.' };
  const role = profileResult.profile.role;
  if (adminOnly && role !== 'Admin')
    return { ok: false, message: 'Only Admin can perform restore.' };
  const permissions = Array.isArray(profileResult.profile.permissions)
    ? profileResult.profile.permissions
    : [];
  if (!SETTINGS_ROLES.has(role) && !permissions.includes(permissionKey))
    return { ok: false, message: 'You do not have permission to manage settings.' };
  return { ok: true, profile: profileResult.profile };
}

function cleanText(value, max = 500) {
  return String(value || '')
    .trim()
    .slice(0, max);
}

function moneyNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function cleanSettings(payload = {}) {
  const paperWidth = ['58mm', '80mm', 'A4'].includes(payload.printer?.paperWidth)
    ? payload.printer.paperWidth
    : '80mm';
  const taxMode = payload.tax?.mode === 'included' ? 'included' : 'excluded';
  return {
    store: {
      storeName: cleanText(payload.store?.storeName, 140) || 'Enterprise POS',
      phone: cleanText(payload.store?.phone, 60),
      email: cleanText(payload.store?.email, 180),
      address: cleanText(payload.store?.address, 500),
      taxNumber: cleanText(payload.store?.taxNumber, 80),
      receiptFooterText:
        cleanText(payload.store?.receiptFooterText, 500) || 'Thank you for shopping',
      logoPath: cleanText(payload.store?.logoPath, 500),
    },
    tax: {
      enabled: Boolean(payload.tax?.enabled),
      defaultTaxPercentage: moneyNumber(payload.tax?.defaultTaxPercentage),
      mode: taxMode,
    },
    printer: {
      printerName: cleanText(payload.printer?.printerName, 220),
      paperWidth,
      autoPrint: Boolean(payload.printer?.autoPrint),
      silentPrint: Boolean(payload.printer?.silentPrint),
      receiptCopies: Math.max(
        1,
        Math.min(5, Math.trunc(moneyNumber(payload.printer?.receiptCopies, 1)))
      ),
      footerText: cleanText(payload.printer?.footerText, 500) || 'Thank you for shopping',
    },
    system: {
      currencySymbol: cleanText(payload.system?.currencySymbol, 12) || 'PKR',
      dateFormat: cleanText(payload.system?.dateFormat, 30) || 'DD/MM/YYYY',
      lowStockAlertThreshold: moneyNumber(payload.system?.lowStockAlertThreshold, 5),
      invoicePrefix: cleanText(payload.system?.invoicePrefix, 20) || 'POS',
      nextInvoiceNumber: Math.max(1, Math.trunc(moneyNumber(payload.system?.nextInvoiceNumber, 1))),
    },
  };
}

async function getSettings() {
  const access = await requireSettingsAccess('settings.view');
  if (!access.ok) return access;
  return { ok: true, settings: await settingsRepository.getSettings() };
}

async function saveSettings(payload = {}) {
  const access = await requireSettingsAccess('settings.update');
  if (!access.ok) return access;
  const settings = await settingsRepository.saveSettings(cleanSettings(payload), access.profile.id);
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'settings.save',
    status: 'success',
    message: 'Settings saved',
  });
  return { ok: true, settings, message: 'Settings saved successfully.' };
}

async function createBackup(filePath) {
  const access = await requireSettingsAccess('backup.create');
  if (!access.ok) return access;
  if (!filePath) return { ok: false, message: 'Backup file was not selected.' };
  try {
    const backup = await settingsRepository.exportBackup(filePath, access.profile.id);
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'backup.create',
      status: 'success',
      message: 'Certified backup created',
      metadata: backup,
    });
    return { ok: true, backup, message: 'Certified backup created and verified successfully.' };
  } catch (error) {
    await activityRepository.createActivityLog({
      userId: access.profile.id,
      action: 'backup.create',
      status: 'failed',
      message: 'Certified backup failed',
      metadata: {
        filePath,
        reason: error.message,
        verification: error.verification || null,
      },
    });
    throw error;
  }
}

async function listBackups() {
  const access = await requireSettingsAccess('backup.view');
  if (!access.ok) return access;
  return { ok: true, backups: await settingsRepository.listBackupLogs() };
}

async function inspectRestorePackage(filePath) {
  const access = await requireSettingsAccess('backup.restore', true);
  if (!access.ok) return access;
  return settingsRepository.inspectRestorePackage(filePath);
}

async function restoreBackup(filePath) {
  const access = await requireSettingsAccess('backup.restore', true);
  if (!access.ok) return access;
  const restore = await settingsRepository.restoreBackup(filePath, access.profile.id);
  await activityRepository.createActivityLog({
    userId: access.profile.id,
    action: 'backup.restore',
    status: 'blocked',
    message: 'Restore blocked by governance',
    metadata: restore,
  });
  return restore;
}

module.exports = {
  createBackup,
  getSettings,
  inspectRestorePackage,
  listBackups,
  restoreBackup,
  saveSettings,
};
